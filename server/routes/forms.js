import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import multer from 'multer';
import { transformWithEsbuild } from 'vite';
import { query, getClient } from '../db.js';
import { requireAuth, requireAnyRole } from '../middleware/auth.js';
import {
  convertPDFToForm,
  convertPDFToFormVision,
  editFormWithAI,
  generateSchemaFromCode,
  generateCodeDiff,
  getDefaultReactCode,
  getDefaultCssCode,
  getDefaultJsCode
} from '../services/formAI.js';
import { generateSubmissionPDF, getPDFArtifact } from '../services/formPDF.js';
import {
  renderPdfToPngBuffers,
  processWithDocAIImage,
  mergeDocAiPages,
  normalizeDocAiToSchema,
  renderDocAiSchemaToHtml
} from '../services/docai.js';

const router = Router();

// File upload config for PDFs
const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads', 'forms');
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files allowed'));
    }
  }
});

// Separate upload config for Vision endpoint: allow PDF + optional screenshots.
const uploadVision = multer({
  storage: upload.storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'pdf') {
      return file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Only PDF files allowed for pdf field'));
    }
    if (file.fieldname === 'images') {
      return file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files allowed for images field'));
    }
    return cb(new Error('Unexpected file field'));
  }
});

// Middleware to check forms access (superadmin, admin, team)
function requireFormsAccess(req, res, next) {
  const role = req.user?.effective_role || req.user?.role;
  if (!['superadmin', 'admin', 'team'].includes(role)) {
    return res.status(403).json({ error: 'Forms access denied' });
  }
  next();
}

function sanitizePreviewCode(src) {
  const lines = String(src || '').split('\n');
  const withoutImports = lines.filter((l) => !l.trim().startsWith('import '));
  let code = withoutImports.join('\n');
  code = code.replace(/^export\s+(const|let|var|function|class)\s+/gm, '$1 ');
  code = code.replace(/export\s+default\s+function\s+\w+\s*\(/, 'function FormComponent(');
  code = code.replace(/export\s+default\s+function\s*\(/, 'function FormComponent(');
  code = code.replace(/export\s+default\s+/g, 'const FormComponent = ');
  return code;
}

// Helper to create audit log
async function createAuditLog({ actorId, action, entityType, entityId, metadata = {}, ip, userAgent }) {
  await query(
    `
    INSERT INTO form_audit_logs (actor_id, action, entity_type, entity_id, metadata_json, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `,
    [actorId, action, entityType, entityId, metadata, ip, userAgent]
  );
}

// =====================
// FORMS CRUD
// =====================

// POST /api/forms/preview/compile - Compile JSX for admin preview (internal tooling only)
router.post('/preview/compile', requireAuth, requireFormsAccess, async (req, res) => {
  try {
    const { react_code } = req.body || {};
    if (!react_code || !String(react_code).trim()) {
      return res.json({ code: '' });
    }

    const sanitized = sanitizePreviewCode(react_code);
    const result = await transformWithEsbuild(sanitized, 'FormPreview.jsx', {
      loader: 'jsx',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2020'
    });

    res.json({ code: result.code });
  } catch (err) {
    console.error('Error compiling form preview:', err);
    res.status(400).json({ error: 'Failed to compile preview', detail: err?.message || String(err) });
  }
});

// GET /api/forms - List all forms
router.get('/', requireAuth, requireFormsAccess, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT f.*, 
             fv.version_number as active_version_number,
             (SELECT COUNT(*) FROM form_submissions WHERE form_id = f.id) as submission_count
      FROM forms f
      LEFT JOIN form_versions fv ON f.active_version_id = fv.id
      ORDER BY f.updated_at DESC
    `);
    res.json({ forms: rows });
  } catch (err) {
    console.error('Error fetching forms:', err);
    res.status(500).json({ error: 'Failed to fetch forms' });
  }
});

// GET /api/forms/:id - Get single form
router.get('/:id', requireAuth, requireFormsAccess, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await query(`
      SELECT f.*, 
             fv.version_number as active_version_number,
             fv.react_code as active_react_code,
             fv.css_code as active_css_code,
             fv.schema_json as active_schema
      FROM forms f
      LEFT JOIN form_versions fv ON f.active_version_id = fv.id
      WHERE f.id = $1
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Get all versions
    const { rows: versions } = await query(`
      SELECT id, version_number, published_at, created_at, ai_generated
      FROM form_versions
      WHERE form_id = $1
      ORDER BY version_number DESC
    `, [id]);

    res.json({ form: rows[0], versions });
  } catch (err) {
    console.error('Error fetching form:', err);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

// POST /api/forms - Create new form
router.post('/', requireAuth, requireFormsAccess, async (req, res) => {
  const { name, description, form_type, settings } = req.body;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Create form
    const embedToken = crypto.randomBytes(32).toString('hex');
    const { rows: formRows } = await client.query(`
      INSERT INTO forms (name, description, form_type, embed_token, settings_json)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description || '', form_type || 'conversion', embedToken, settings || {}]);

    const form = formRows[0];

    // Create initial version
    const { rows: versionRows } = await client.query(`
      INSERT INTO form_versions (form_id, version_number, react_code, css_code, schema_json, created_by)
      VALUES ($1, 1, $2, $3, $4, $5)
      RETURNING *
    `, [
      form.id,
      getDefaultReactCode(),
      getDefaultCssCode(),
      { runtime_mode: 'html', js_code: getDefaultJsCode(), fields: [] },
      req.user.id
    ]);

    // Update form with active version
    await client.query(`
      UPDATE forms SET active_version_id = $1 WHERE id = $2
    `, [versionRows[0].id, form.id]);

    await client.query('COMMIT');

    // Audit log
    await createAuditLog({
      actorId: req.user.id,
      action: 'form.created',
      entityType: 'form',
      entityId: form.id,
      metadata: { name, form_type },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ form: { ...form, active_version_id: versionRows[0].id } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating form:', err);
    res.status(500).json({ error: 'Failed to create form' });
  } finally {
    client.release();
  }
});

// PATCH /api/forms/:id - Update form
router.patch('/:id', requireAuth, requireFormsAccess, async (req, res) => {
  const { id } = req.params;
  const { name, description, form_type, status, settings_json } = req.body;

  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (form_type !== undefined) {
      updates.push(`form_type = $${paramIndex++}`);
      values.push(form_type);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (settings_json !== undefined) {
      updates.push(`settings_json = $${paramIndex++}`);
      values.push(settings_json);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(id);
    const { rows } = await query(`
      UPDATE forms SET ${updates.join(', ')} WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (!rows.length) {
      return res.status(404).json({ error: 'Form not found' });
    }

    res.json({ form: rows[0] });
  } catch (err) {
    console.error('Error updating form:', err);
    res.status(500).json({ error: 'Failed to update form' });
  }
});

// DELETE /api/forms/:id - Delete form
router.delete('/:id', requireAuth, requireFormsAccess, async (req, res) => {
  const { id } = req.params;

  try {
    const { rowCount } = await query('DELETE FROM forms WHERE id = $1', [id]);

    if (!rowCount) {
      return res.status(404).json({ error: 'Form not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting form:', err);
    res.status(500).json({ error: 'Failed to delete form' });
  }
});

// =====================
// FORM VERSIONS
// =====================

// GET /api/forms/:id/versions/:versionId
router.get('/:id/versions/:versionId', requireAuth, requireFormsAccess, async (req, res) => {
  const { id, versionId } = req.params;

  try {
    const { rows } = await query(`
      SELECT * FROM form_versions WHERE id = $1 AND form_id = $2
    `, [versionId, id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({ version: rows[0] });
  } catch (err) {
    console.error('Error fetching version:', err);
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

// POST /api/forms/:id/versions - Create new version (save draft)
router.post('/:id/versions', requireAuth, requireFormsAccess, async (req, res) => {
  const { id } = req.params;
  const { react_code, css_code, schema_json } = req.body;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get next version number
    const { rows: maxRows } = await client.query(`
      SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
      FROM form_versions WHERE form_id = $1
    `, [id]);

    const nextVersion = maxRows[0].next_version;

    // Create version
    const { rows } = await client.query(`
      INSERT INTO form_versions (form_id, version_number, react_code, css_code, schema_json, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, nextVersion, react_code, css_code || '', schema_json || { fields: [] }, req.user.id]);

    // Update form's active version
    await client.query(`
      UPDATE forms SET active_version_id = $1 WHERE id = $2
    `, [rows[0].id, id]);

    await client.query('COMMIT');

    res.status(201).json({ version: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating version:', err);
    res.status(500).json({ error: 'Failed to create version' });
  } finally {
    client.release();
  }
});

// POST /api/forms/:id/versions/:versionId/publish - Publish version
router.post('/:id/versions/:versionId/publish', requireAuth, requireFormsAccess, async (req, res) => {
  const { id, versionId } = req.params;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Mark version as published
    const { rows } = await client.query(`
      UPDATE form_versions SET published_at = NOW() WHERE id = $1 AND form_id = $2
      RETURNING *
    `, [versionId, id]);

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Version not found' });
    }

    // Update form status and active version
    await client.query(`
      UPDATE forms SET status = 'published', active_version_id = $1 WHERE id = $2
    `, [versionId, id]);

    await client.query('COMMIT');

    // Audit log
    await createAuditLog({
      actorId: req.user.id,
      action: 'form.published',
      entityType: 'form',
      entityId: id,
      metadata: { version_id: versionId, version_number: rows[0].version_number },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ version: rows[0], status: 'published' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error publishing version:', err);
    res.status(500).json({ error: 'Failed to publish version' });
  } finally {
    client.release();
  }
});

// =====================
// SUBMISSIONS
// =====================

// GET /api/forms/:id/submissions
router.get('/:id/submissions', requireAuth, requireFormsAccess, async (req, res) => {
  const { id } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  try {
    const { rows } = await query(`
      SELECT s.id, s.submission_kind, s.ctm_sent, s.email_sent, s.embed_domain, s.created_at,
             fv.version_number
      FROM form_submissions s
      JOIN form_versions fv ON s.form_version_id = fv.id
      WHERE s.form_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    const { rows: countRows } = await query(
      'SELECT COUNT(*) FROM form_submissions WHERE form_id = $1',
      [id]
    );

    res.json({ submissions: rows, total: parseInt(countRows[0].count, 10) });
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// GET /api/forms/:id/submissions/:submissionId
router.get('/:id/submissions/:submissionId', requireAuth, requireFormsAccess, async (req, res) => {
  const { id, submissionId } = req.params;

  try {
    const { rows } = await query(`
      SELECT s.*, fv.version_number, f.form_type, f.name as form_name
      FROM form_submissions s
      JOIN form_versions fv ON s.form_version_id = fv.id
      JOIN forms f ON s.form_id = f.id
      WHERE s.id = $1 AND s.form_id = $2
    `, [submissionId, id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Audit log
    await createAuditLog({
      actorId: req.user.id,
      action: 'submission.viewed',
      entityType: 'submission',
      entityId: submissionId,
      metadata: { form_id: id },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ submission: rows[0] });
  } catch (err) {
    console.error('Error fetching submission:', err);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// GET /api/forms/:id/submissions/:submissionId/print - Render printable HTML for a submission (admin-only)
router.get('/:id/submissions/:submissionId/print', requireAuth, requireFormsAccess, async (req, res) => {
  const { id, submissionId } = req.params;

  try {
    const { rows } = await query(
      `
      SELECT s.*, fv.schema_json
      FROM form_submissions s
      JOIN form_versions fv ON s.form_version_id = fv.id
      WHERE s.id = $1 AND s.form_id = $2
    `,
      [submissionId, id]
    );

    if (!rows.length) {
      return res.status(404).send('Submission not found');
    }

    const sub = rows[0];
    const schema = sub.schema_json || {};
    const printable = schema.printable || {};

    const payload = sub.non_phi_payload || {};
    // intake forms store encrypted payload; decryption TBD (KMS). For now, show placeholder.
    const printablePayload = sub.encrypted_payload ? { _note: 'PHI payload requires decryption (KMS)' } : payload;

    const html = String(printable.html || '').trim();
    const css = String(printable.css || '').trim();
    const js = String(printable.js || '').trim();

    if (!html) {
      return res.status(400).send('Printable template not configured for this form version.');
    }

    const doc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Print Submission</title>
    <style>
      ${css}
      @media print { .no-print { display: none !important; } }
    </style>
  </head>
  <body>
    <div class="no-print" style="padding:8px 12px; font-family: system-ui; font-size: 12px; color: #666;">
      <button onclick="window.print()">Print</button>
    </div>
    ${html}
    <script>
      window.__ANCHOR_SUBMISSION__ = ${JSON.stringify(printablePayload)};
      // Minimal helper: replace {{field}} placeholders in text nodes/attributes.
      (function(){
        try {
          var data = window.__ANCHOR_SUBMISSION__ || {};
          function apply(str){
            return String(str).replace(/\\{\\{\\s*([a-zA-Z0-9_\\-\\.]+)\\s*\\}\\}/g, function(_, key){
              var v = data[key];
              if (v === undefined || v === null) return '';
              if (typeof v === 'object') return JSON.stringify(v);
              return String(v);
            });
          }
          document.querySelectorAll('[data-print-text]').forEach(function(el){
            el.textContent = apply(el.textContent);
          });
          // generic: walk text nodes
          var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          var node;
          while((node = walker.nextNode())){
            if (node.nodeValue && node.nodeValue.indexOf('{{') !== -1) node.nodeValue = apply(node.nodeValue);
          }
        } catch(e){}
      })();
    </script>
    <script>${js}</script>
    <script>
      // Auto-print if requested
      if (new URLSearchParams(window.location.search).get('autoprint') === '1') {
        setTimeout(function(){ window.print(); }, 250);
      }
    </script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(doc);
  } catch (err) {
    console.error('Error rendering printable submission:', err);
    res.status(500).send('Failed to render printable submission');
  }
});

// =====================
// AUDIT LOGS
// =====================

// GET /api/forms/:id/audit-logs
router.get('/:id/audit-logs', requireAuth, requireFormsAccess, async (req, res) => {
  const { id } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  try {
    const { rows } = await query(`
      SELECT l.*, u.first_name, u.last_name, u.email
      FROM form_audit_logs l
      LEFT JOIN users u ON l.actor_id = u.id
      WHERE l.entity_id = $1 OR l.metadata_json->>'form_id' = $1
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    res.json({ logs: rows });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// =====================
// AI ENDPOINTS
// =====================

// POST /api/forms/:id/ai/upload-pdf - Upload PDF for AI conversion
router.post('/:id/ai/upload-pdf', requireAuth, requireFormsAccess, upload.single('pdf'), async (req, res) => {
  const { id } = req.params;
  const instructions = String(req.body?.instructions || '').trim();

  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  try {
    // Read PDF file
    const pdfBuffer = await fs.readFile(req.file.path);

    // Convert using AI
    const result = await convertPDFToForm(pdfBuffer, { instructions, form_id: id });

    // Clean up temp file
    await fs.unlink(req.file.path).catch(() => {});

    res.json({
      success: true,
      react_code: result.react_code,
      css_code: result.css_code,
      schema: result.schema,
      explanation: result.explanation
    });
  } catch (err) {
    console.error('Error processing PDF:', err);
    res.status(500).json({ error: err?.message || 'Failed to process PDF' });
  }
});

// POST /api/forms/:id/ai/vision/upload-pdf - Upload PDF for "Vision" LLM Extract→Rebuild→Render (Vertex Gemini multimodal)
router.post('/:id/ai/vision/upload-pdf', requireAuth, requireFormsAccess, uploadVision.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]), async (req, res) => {
  const { id } = req.params;
  const instructions = String(req.body?.instructions || '').trim();

  const pdfFile = req.files?.pdf?.[0] || null;
  const imageFiles = Array.isArray(req.files?.images) ? req.files.images : [];

  if (!pdfFile) {
    return res.status(400).json({ error: 'No PDF file uploaded (field: pdf)' });
  }

  try {
    const pdfBuffer = await fs.readFile(pdfFile.path);
    const images = [];
    for (const f of imageFiles) {
      // eslint-disable-next-line no-await-in-loop
      const buf = await fs.readFile(f.path);
      images.push({ buffer: buf, mimeType: f.mimetype });
    }

    const result = await convertPDFToFormVision(pdfBuffer, { instructions, images });

    // Clean up temp file
    await Promise.all([
      fs.unlink(pdfFile.path).catch(() => {}),
      ...imageFiles.map((f) => fs.unlink(f.path).catch(() => {}))
    ]);

    res.json({
      success: true,
      react_code: result.react_code,
      css_code: result.css_code,
      schema: result.schema,
      explanation: result.explanation
    });
  } catch (err) {
    console.error('Error processing PDF (vision):', err);
    res.status(500).json({ error: err?.message || 'Failed to process PDF (vision)' });
  }
});

// POST /api/forms/:id/ai/docai/upload-pdf - Upload PDF for DocAI Extract→Schema→HTML
router.post('/:id/ai/docai/upload-pdf', requireAuth, requireFormsAccess, upload.single('pdf'), async (req, res) => {
  const { id } = req.params;
  const instructions = String(req.body?.instructions || '').trim();

  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  // Intentionally rely on PROJECT_ID only (for consistent local + cloud behavior)
  const projectId = process.env.PROJECT_ID;
  const location = process.env.DOCUMENTAI_LOCATION || 'us';
  const layoutProcessorId = process.env.DOCUMENTAI_LAYOUT_PROCESSOR_ID || 'ba0d8a19615c2dd6';
  const formProcessorId = process.env.DOCUMENTAI_FORM_PROCESSOR_ID || 'acce8166c1b5d237';

  try {
    const pdfBuffer = await fs.readFile(req.file.path);

    // IMPORTANT:
    // Some Document AI Layout processors do NOT accept image inputs (JPEG/PNG) and only accept PDFs.
    // So we run Layout on the original PDF, but run Form parsing on per-page raster images for better field detection.

    // 1) Layout (PDF input)
    const layoutResult = await processWithDocAIImage({
      imageBuffer: pdfBuffer,
      projectId,
      location,
      processorId: layoutProcessorId,
      mimeType: 'application/pdf'
    });

    // 2) Form parsing (image input per page)
    // Rasterize PDF pages to JPEG buffers (high DPI for better OCR/field detection)
    const pageImages = await renderPdfToPngBuffers(pdfBuffer, 220);
    if (!pageImages.length) {
      throw new Error('Failed to rasterize PDF pages for DocAI');
    }

    // Process each page image with the form processor
    const formPageResults = [];

    for (const page of pageImages) {
      // eslint-disable-next-line no-await-in-loop
      const formRes = await processWithDocAIImage({
        imageBuffer: page.buffer,
        projectId,
        location,
        processorId: formProcessorId,
        mimeType: 'image/jpeg'
      });
      formPageResults.push(formRes);
    }

    const formResult = mergeDocAiPages(formPageResults);

    // Persist raw outputs for debugging/reprocessing
    const docaiDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads', 'forms', 'docai', id);
    await fs.mkdir(docaiDir, { recursive: true });
    const stamp = Date.now();
    await Promise.all([
      fs.writeFile(path.join(docaiDir, `${stamp}_layout.json`), JSON.stringify(layoutResult, null, 2)),
      fs.writeFile(path.join(docaiDir, `${stamp}_form.json`), JSON.stringify(formResult, null, 2))
    ]);

    const schema = normalizeDocAiToSchema({ layoutResult, formResult, templateId: id, instructions });
    const rendered = renderDocAiSchemaToHtml({ schema });

    // Clean up temp file
    await fs.unlink(req.file.path).catch(() => {});

    res.json({
      success: true,
      schema,
      react_code: rendered.html,
      css_code: rendered.css,
      js_code: rendered.js,
      explanation: `Generated canonical docai schema (${Array.isArray(schema?.fields) ? schema.fields.length : 0} fields) + initial HTML render`
    });
  } catch (err) {
    console.error('Error processing DocAI PDF:', err);
    res.status(500).json({ error: err?.message || 'Failed to process PDF with DocAI' });
  }
});

// POST /api/forms/:id/ai/edit - AI-assisted code editing
router.post('/:id/ai/edit', requireAuth, requireFormsAccess, async (req, res) => {
  const { id } = req.params;
  const { instruction, current_code, current_css, current_js } = req.body;

  if (!instruction) {
    return res.status(400).json({ error: 'instruction is required' });
  }

  const client = await getClient();

  try {
    // Get current code if not provided
    let reactCode = current_code;
    let cssCode = current_css;
    let jsCode = current_js;

    if (!reactCode) {
      const { rows } = await client.query(`
        SELECT fv.react_code, fv.css_code, fv.schema_json
        FROM forms f
        JOIN form_versions fv ON f.active_version_id = fv.id
        WHERE f.id = $1
      `, [id]);

      if (rows.length) {
        reactCode = rows[0].react_code;
        cssCode = rows[0].css_code || '';
        jsCode = rows[0].schema_json?.js_code || '';
      }
    }

    if (!reactCode) {
      return res.status(400).json({ error: 'No code to edit' });
    }

    // Call AI
    const result = await editFormWithAI(reactCode, cssCode || '', instruction);

    // Generate diff
    const codeDiff = generateCodeDiff(reactCode, result.react_code);
    const cssDiff = generateCodeDiff(cssCode || '', result.css_code);
    const jsDiff = result.js_code ? generateCodeDiff(jsCode || '', result.js_code) : [];

    res.json({
      success: true,
      react_code: result.react_code,
      css_code: result.css_code,
      js_code: result.js_code || '',
      changes_made: result.changes_made,
      explanation: result.explanation,
      diff: {
        code: codeDiff,
        css: cssDiff,
        js: jsDiff
      }
    });
  } catch (err) {
    console.error('Error with AI edit:', err);
    res.status(500).json({ error: 'AI edit failed' });
  } finally {
    client.release();
  }
});

// POST /api/forms/:id/ai/generate-schema - Generate schema from current code
router.post('/:id/ai/generate-schema', requireAuth, requireFormsAccess, async (req, res) => {
  const { id } = req.params;
  const { react_code } = req.body;

  if (!react_code) {
    return res.status(400).json({ error: 'react_code is required' });
  }

  try {
    const schema = await generateSchemaFromCode(react_code);
    res.json({ success: true, schema });
  } catch (err) {
    console.error('Error generating schema:', err);
    res.status(500).json({ error: 'Failed to generate schema' });
  }
});

// =====================
// PDF GENERATION
// =====================

// POST /api/forms/:id/submissions/:submissionId/pdf - Generate PDF for submission
router.post('/:id/submissions/:submissionId/pdf', requireAuth, requireFormsAccess, async (req, res) => {
  const { id, submissionId } = req.params;

  try {
    // Verify submission belongs to form
    const { rows } = await query(
      'SELECT id FROM form_submissions WHERE id = $1 AND form_id = $2',
      [submissionId, id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const result = await generateSubmissionPDF({
      submissionId,
      generatedBy: req.user.id
    });

    if (!result.success) {
      return res.status(500).json({ error: 'Failed to generate PDF' });
    }

    res.json({
      success: true,
      artifact: {
        id: result.artifact.id,
        filename: result.filename,
        checksum: result.checksum,
        generated_at: result.artifact.generated_at
      }
    });
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// GET /api/forms/:id/submissions/:submissionId/pdf/:artifactId - Download PDF
router.get('/:id/submissions/:submissionId/pdf/:artifactId', requireAuth, requireFormsAccess, async (req, res) => {
  const { id, submissionId, artifactId } = req.params;

  try {
    // Verify artifact belongs to submission
    const { rows } = await query(`
      SELECT pa.* FROM form_pdf_artifacts pa
      JOIN form_submissions s ON pa.submission_id = s.id
      WHERE pa.id = $1 AND s.id = $2 AND s.form_id = $3
    `, [artifactId, submissionId, id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const artifact = rows[0];

    // Verify file exists
    try {
      await fs.access(artifact.storage_path);
    } catch {
      return res.status(404).json({ error: 'PDF file not found' });
    }

    // Audit log
    await createAuditLog({
      actorId: req.user.id,
      action: 'pdf.downloaded',
      entityType: 'pdf_artifact',
      entityId: artifactId,
      metadata: { submission_id: submissionId, form_id: id },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // Send file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.file_name}"`);
    res.setHeader('Content-Length', artifact.file_size_bytes);

    const fileStream = createReadStream(artifact.storage_path);
    fileStream.pipe(res);
  } catch (err) {
    console.error('Error downloading PDF:', err);
    res.status(500).json({ error: 'Failed to download PDF' });
  }
});

// GET /api/forms/:id/submissions/:submissionId/pdfs - List PDFs for submission
router.get('/:id/submissions/:submissionId/pdfs', requireAuth, requireFormsAccess, async (req, res) => {
  const { id, submissionId } = req.params;

  try {
    const { rows } = await query(`
      SELECT pa.id, pa.file_name, pa.file_size_bytes, pa.checksum, pa.generated_at,
             u.first_name, u.last_name
      FROM form_pdf_artifacts pa
      LEFT JOIN users u ON pa.generated_by = u.id
      JOIN form_submissions s ON pa.submission_id = s.id
      WHERE s.id = $1 AND s.form_id = $2
      ORDER BY pa.generated_at DESC
    `, [submissionId, id]);

    res.json({ pdfs: rows });
  } catch (err) {
    console.error('Error listing PDFs:', err);
    res.status(500).json({ error: 'Failed to list PDFs' });
  }
});

export default router;

