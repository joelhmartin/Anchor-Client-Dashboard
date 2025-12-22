/**
 * Public Forms API
 * 
 * Handles public-facing form endpoints:
 * - Embed script serving
 * - Form retrieval for iframes
 * - Submission handling
 * - Draft save/resume
 */

import { Router } from 'express';
import crypto from 'crypto';
import { query, getClient } from '../db.js';
import { createSubmissionJobs } from '../services/formSubmissionJobs.js';

const router = Router();

// Simple rate limiting (in production, use Redis)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  const record = rateLimitMap.get(key);
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW;
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);

// GET /embed/:formId - Get published form for embedding
router.get('/:formId', async (req, res) => {
  const { formId } = req.params;
  const { token } = req.query;

  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { rows } = await query(`
      SELECT f.id, f.name, f.form_type, f.embed_token, f.settings_json,
             fv.react_code, fv.css_code, fv.version_number, fv.schema_json
      FROM forms f
      JOIN form_versions fv ON f.active_version_id = fv.id
      WHERE f.id = $1 AND f.status = 'published'
    `, [formId]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Form not found or not published' });
    }

    const form = rows[0];

    // Verify embed token if domain allowlist is set
    const settings = form.settings_json || {};
    const allowlist = settings.domain_allowlist || [];

    if (allowlist.length > 0) {
      const origin = req.get('origin') || req.get('referer') || '';
      const isAllowed = allowlist.some(domain => origin.includes(domain));
      if (!isAllowed && token !== form.embed_token) {
        return res.status(403).json({ error: 'Domain not allowed' });
      }
    }

    // Return form data for iframe rendering
    const schemaJson = form.schema_json || {};
    res.json({
      id: form.id,
      name: form.name,
      form_type: form.form_type,
      react_code: form.react_code,
      html_code: form.react_code,
      css_code: form.css_code,
      schema: form.schema_json,
      runtime_mode: schemaJson.runtime_mode || 'react',
      js_code: schemaJson.js_code || '',
      version_number: form.version_number,
      settings: {
        save_and_resume_enabled: settings.save_and_resume_enabled || false,
        new_patient_button_label: settings.new_patient_button_label || 'Start New',
        resume_button_label: settings.resume_button_label || 'Resume',
        custom_thank_you_message: settings.custom_thank_you_message || 'Thank you for your submission!'
      }
    });
  } catch (err) {
    console.error('Error fetching form for embed:', err);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

// GET /embed/form/:formId - Public iframe runtime page
router.get('/form/:formId', async (req, res) => {
  const { formId } = req.params;
  const { token } = req.query;

  if (!checkRateLimit(req.ip)) {
    return res.status(429).send('Too many requests');
  }

  try {
    const { rows } = await query(
      `
      SELECT f.id, f.embed_token, f.settings_json,
             fv.react_code, fv.css_code, fv.schema_json
      FROM forms f
      JOIN form_versions fv ON f.active_version_id = fv.id
      WHERE f.id = $1 AND f.status = 'published'
    `,
      [formId]
    );

    if (!rows.length) {
      return res.status(404).send('Form not found');
    }

    const form = rows[0];
    const settings = form.settings_json || {};
    const schemaJson = form.schema_json || {};
    const allowlist = settings.domain_allowlist || [];

    if (allowlist.length > 0) {
      const origin = req.get('origin') || req.get('referer') || '';
      const isAllowed = allowlist.some((domain) => origin.includes(domain));
      if (!isAllowed && token !== form.embed_token) {
        return res.status(403).send('Domain not allowed');
      }
    }

    // Allow this endpoint to be embedded cross-origin (client websites).
    // We remove X-Frame-Options and optionally use CSP frame-ancestors when allowlist exists.
    res.removeHeader('X-Frame-Options');
    if (allowlist.length > 0) {
      const ancestors = allowlist
        .map((d) => String(d || '').trim())
        .filter(Boolean)
        .flatMap((d) => {
          // Allow both http/https variants, since allowlist entries may be hostnames.
          if (d.startsWith('http://') || d.startsWith('https://')) return [d];
          return [`https://${d}`, `http://${d}`];
        });
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data:",
          "connect-src 'self'",
          `frame-ancestors ${ancestors.join(' ')}`
        ].join(';')
      );
    }

    // No inline <script> (CSP). Runtime JS is served from same origin.
    // If this form is in HTML mode, render the actual HTML + CSS, and load per-form runtime JS.
    const runtimeMode = schemaJson.runtime_mode || (String(form.react_code || '').trim().startsWith('import ') ? 'react' : 'html');

    const html = runtimeMode === 'html'
      ? `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${(form.name || 'Anchor Form').replace(/</g, '&lt;')}</title>
    <style>${form.css_code || ''}</style>
  </head>
  <body>
    ${form.react_code || ''}
    <script src="/embed/form/${formId}/runtime.js"></script>
  </body>
</html>`
      : `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Anchor Form</title>
    <style>
      :root{
        --af-font: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        --af-bg: #ffffff;
        --af-surface: #ffffff;
        --af-border: rgba(0,0,0,0.14);
        --af-text: rgba(0,0,0,0.87);
        --af-muted: rgba(0,0,0,0.60);
        --af-primary: #0596A6; /* close to your app teal */
        --af-focus: rgba(5, 150, 166, 0.35);
        --af-radius: 12px;
      }
      html, body { margin: 0; padding: 0; font-family: var(--af-font); background: #fff; color: var(--af-text); }
      .af-root { padding: 16px; }
      .af-card {
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: var(--af-radius);
        padding: 18px;
        background: var(--af-surface);
        max-width: 900px;
        margin: 0 auto;
      }
      .af-title { font-size: 20px; font-weight: 700; margin: 0 0 14px 0; }
      .af-note { font-size: 12px; color: var(--af-muted); margin: 0 0 12px 0; }

      /* MUI-ish Outlined TextField */
      .af-field { margin: 0 0 16px 0; }
      .af-field-inner {
        position: relative;
        border: 1px solid var(--af-border);
        border-radius: 10px;
        background: var(--af-bg);
        transition: border-color 120ms ease, box-shadow 120ms ease;
      }
      .af-field-inner.is-focused {
        border-color: var(--af-primary);
        box-shadow: 0 0 0 4px var(--af-focus);
      }
      .af-input, .af-textarea, .af-select {
        width: 100%;
        border: 0;
        outline: none;
        background: transparent;
        font-size: 16px;
        color: var(--af-text);
        padding: 20px 14px 12px;
        box-sizing: border-box;
        font-family: var(--af-font);
      }
      .af-textarea { min-height: 140px; resize: vertical; padding-top: 26px; }
      .af-select { appearance: none; padding-right: 38px; }
      .af-select-chevron {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        color: var(--af-muted);
        font-size: 18px;
      }
      .af-floating-label {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 16px;
        color: var(--af-muted);
        background: transparent;
        padding: 0 6px;
        transition: all 120ms ease;
        pointer-events: none;
      }
      .af-field-inner.has-value .af-floating-label,
      .af-field-inner.is-focused .af-floating-label {
        top: 8px;
        transform: none;
        font-size: 12px;
        color: var(--af-primary);
        background: var(--af-bg);
      }
      .af-required { color: var(--af-primary); margin-left: 2px; }

      .af-actions { display:flex; gap: 10px; align-items:center; justify-content:flex-end; margin-top: 10px; }
      .af-btn {
        appearance: none;
        border: 0;
        border-radius: 10px;
        padding: 12px 16px;
        background: var(--af-primary);
        color: #fff;
        font-weight: 700;
        cursor: pointer;
        min-width: 160px;
      }
      .af-btn:disabled { opacity: 0.6; cursor: not-allowed; }

      .af-alert { padding: 10px 12px; border-radius: 10px; background: #fef3c7; border: 1px solid #fde68a; color: #92400e; }
      .af-error { padding: 10px 12px; border-radius: 10px; background: #fee2e2; border: 1px solid #fecaca; color: #991b1b; }
      .af-success { padding: 10px 12px; border-radius: 10px; background: #dcfce7; border: 1px solid #bbf7d0; color: #166534; }
    </style>
  </head>
  <body>
    <div id="af-root" class="af-root"></div>
    <script src="/embed/script/runtime.js"></script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (err) {
    console.error('Error serving embed runtime:', err);
    res.status(500).send('Failed to load form');
  }
});

// GET /embed/form/:formId/runtime.js - Per-form runtime JS for HTML-mode forms
router.get('/form/:formId/runtime.js', async (req, res) => {
  const { formId } = req.params;
  if (!checkRateLimit(req.ip)) {
    return res.status(429).send('Too many requests');
  }
  try {
    const { rows } = await query(
      `
      SELECT f.id, f.status, fv.schema_json
      FROM forms f
      JOIN form_versions fv ON f.active_version_id = fv.id
      WHERE f.id = $1 AND f.status = 'published'
    `,
      [formId]
    );
    if (!rows.length) {
      return res.status(404).send('// not found');
    }
    const schemaJson = rows[0].schema_json || {};
    const userJs = String(schemaJson.js_code || '');

    const script = `
(function(){
  function qs(){ return new URLSearchParams(window.location.search); }
  function safeParseJson(s){ try{ return JSON.parse(s);}catch{ return null; } }
  var attributionStr = qs().get('attribution') || '';
  var attribution = safeParseJson(decodeURIComponent(attributionStr || '')) || {};

  window.AnchorFormsRuntime = window.AnchorFormsRuntime || {};
  window.AnchorFormsRuntime.formId = ${JSON.stringify(formId)};
  window.AnchorFormsRuntime.attribution = attribution;
  window.AnchorFormsRuntime.onReady = function(cb){ try{ cb({ formId: ${JSON.stringify(formId)}, attribution: attribution }); } catch(e){} };
  window.AnchorFormsRuntime.submit = async function(payload){
    var resp = await fetch('/embed/${formId}/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: payload || {}, attribution: attribution }),
      credentials: 'omit'
    });
    var data = await resp.json().catch(function(){ return {}; });
    if (!resp.ok) throw new Error(data.error || 'Submit failed');
    return data;
  };

  // Auto-bind submit for <form data-anchor-form>
  (function(){
    var f = document.querySelector('form[data-anchor-form]');
    if (!f) return;
    f.addEventListener('submit', async function(e){
      e.preventDefault();
      try {
        var fd = new FormData(f);
        var payload = {};
        fd.forEach(function(v,k){ payload[k] = v; });
        var result = await window.AnchorFormsRuntime.submit(payload);
        // Default success behavior: replace body with thank you.
        document.body.innerHTML = '<div style="font-family:Inter,system-ui,Arial;padding:24px;">' + (result.message || 'Thank you!') + '</div>';
      } catch (err) {
        console.error(err);
        alert(err && err.message ? err.message : 'Submit failed');
      }
    });
  })();

  // User JS (admin-authored)
  ${userJs}
})();`;

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(script);
  } catch (err) {
    console.error('Error serving embed runtime js:', err);
    res.status(500).send('// error');
  }
});

// POST /embed/:formId/submit - Submit form
router.post('/:formId/submit', async (req, res) => {
  const { formId } = req.params;
  const { payload, attribution } = req.body;

  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get form and active version
    const { rows: formRows } = await client.query(`
      SELECT f.*, fv.id as version_id
      FROM forms f
      JOIN form_versions fv ON f.active_version_id = fv.id
      WHERE f.id = $1 AND f.status = 'published'
    `, [formId]);

    if (!formRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Form not found' });
    }

    const form = formRows[0];
    const isIntake = form.form_type === 'intake';
    const settings = form.settings_json || {};

    // Create submission
    const submissionId = crypto.randomUUID();
    
    // For intake forms, encrypt PHI (in production, use proper encryption)
    // For conversion forms, store as JSON
    const insertQuery = isIntake
      ? `INSERT INTO form_submissions (id, form_id, form_version_id, submission_kind, encrypted_payload, attribution_json, ip_address, user_agent, embed_domain)
         VALUES ($1, $2, $3, 'intake', $4, $5, $6, $7, $8)
         RETURNING id`
      : `INSERT INTO form_submissions (id, form_id, form_version_id, submission_kind, non_phi_payload, attribution_json, ip_address, user_agent, embed_domain)
         VALUES ($1, $2, $3, 'conversion', $4, $5, $6, $7, $8)
         RETURNING id`;

    const origin = req.get('origin') || req.get('referer') || '';
    let embedDomain = '';
    try {
      embedDomain = new URL(origin).hostname;
    } catch {}

    // For intake, encrypt the payload (placeholder - in production use KMS)
    const payloadValue = isIntake 
      ? Buffer.from(JSON.stringify(payload)) // TODO: Encrypt with KMS
      : payload;

    await client.query(insertQuery, [
      submissionId,
      formId,
      form.version_id,
      payloadValue,
      attribution || {},
      req.ip,
      req.get('user-agent'),
      embedDomain
    ]);

    await client.query('COMMIT');

    // Create async jobs for CTM and email
    await createSubmissionJobs(submissionId, settings);

    // Audit log
    await query(`
      INSERT INTO form_audit_logs (action, entity_type, entity_id, metadata_json, ip_address, user_agent)
      VALUES ('submission.created', 'submission', $1, $2, $3, $4)
    `, [submissionId, { form_id: formId, form_type: form.form_type }, req.ip, req.get('user-agent')]);

    res.status(201).json({
      success: true,
      submission_id: submissionId,
      message: settings.custom_thank_you_message || 'Thank you for your submission!'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating submission:', err);
    res.status(500).json({ error: 'Failed to submit form' });
  } finally {
    client.release();
  }
});

// POST /embed/:formId/draft/save - Save draft for later
router.post('/:formId/draft/save', async (req, res) => {
  const { formId } = req.params;
  const { partial_payload, email } = req.body;

  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    // Get form
    const { rows: formRows } = await query(`
      SELECT f.*, fv.id as version_id
      FROM forms f
      JOIN form_versions fv ON f.active_version_id = fv.id
      WHERE f.id = $1 AND f.status = 'published'
    `, [formId]);

    if (!formRows.length) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const form = formRows[0];
    const settings = form.settings_json || {};

    if (!settings.save_and_resume_enabled) {
      return res.status(400).json({ error: 'Save and resume not enabled for this form' });
    }

    // Generate resume token
    const resumeToken = crypto.randomBytes(32).toString('hex');
    const resumeTokenHash = crypto.createHash('sha256').update(resumeToken).digest('hex');

    // Hash email for lookup
    const emailHash = email ? crypto.createHash('sha256').update(email.toLowerCase()).digest('hex') : null;

    // Calculate expiration
    const ttlHours = settings.resume_token_ttl_hours || 72;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // Encrypt partial payload (placeholder)
    const encryptedPayload = Buffer.from(JSON.stringify(partial_payload));

    // Save draft
    await query(`
      INSERT INTO form_draft_sessions (form_id, form_version_id, resume_token_hash, email_hash, encrypted_partial_payload, expires_at, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [formId, form.version_id, resumeTokenHash, emailHash, encryptedPayload, expiresAt, req.ip, req.get('user-agent')]);

    res.json({
      success: true,
      resume_token: resumeToken,
      expires_at: expiresAt.toISOString()
    });
  } catch (err) {
    console.error('Error saving draft:', err);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// POST /embed/:formId/draft/resume - Resume a saved draft
router.post('/:formId/draft/resume', async (req, res) => {
  const { formId } = req.params;
  const { resume_token } = req.body;

  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!resume_token) {
    return res.status(400).json({ error: 'resume_token is required' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(resume_token).digest('hex');

    const { rows } = await query(`
      SELECT * FROM form_draft_sessions
      WHERE form_id = $1 AND resume_token_hash = $2 AND expires_at > NOW()
    `, [formId, tokenHash]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Draft not found or expired' });
    }

    const draft = rows[0];

    // Decrypt payload (placeholder)
    const partialPayload = JSON.parse(draft.encrypted_partial_payload.toString());

    // Update last accessed
    await query(`
      UPDATE form_draft_sessions SET last_saved_at = NOW() WHERE id = $1
    `, [draft.id]);

    res.json({
      success: true,
      partial_payload: partialPayload,
      last_saved_at: draft.last_saved_at
    });
  } catch (err) {
    console.error('Error resuming draft:', err);
    res.status(500).json({ error: 'Failed to resume draft' });
  }
});

// GET /embed/script/embed.js - Serve embed script
router.get('/script/embed.js', (req, res) => {
  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
  
  const script = `
(function() {
  // Anchor Forms Embed Script
  var AnchorForms = window.AnchorForms = window.AnchorForms || {};
  
  // Capture attribution data
  function getAttribution() {
    var params = new URLSearchParams(window.location.search);
    return {
      utms: {
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        utm_term: params.get('utm_term'),
        utm_content: params.get('utm_content')
      },
      referrer: document.referrer,
      landing_page: window.location.href,
      timestamp: new Date().toISOString(),
      // CTM identifiers
      ctm_session_id: params.get('ctm_session_id') || getCookie('ctm_session'),
      gclid: params.get('gclid'),
      fbclid: params.get('fbclid')
    };
  }
  
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }
  
  // Embed form
  AnchorForms.embed = function(formId, containerId, options) {
    options = options || {};
    var container = document.getElementById(containerId);
    if (!container) {
      console.error('Anchor Forms: Container not found:', containerId);
      return;
    }
    
    var iframe = document.createElement('iframe');
    iframe.src = '${baseUrl}/embed/form/' + formId + '?attribution=' + encodeURIComponent(JSON.stringify(getAttribution()));
    iframe.style.width = options.width || '100%';
    iframe.style.height = options.height || '600px';
    iframe.style.border = 'none';
    iframe.style.maxWidth = '100%';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', 'Anchor Form');
    
    container.appendChild(iframe);
    
    // Handle iframe resize messages
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'anchor-form-resize' && e.data.formId === formId) {
        iframe.style.height = e.data.height + 'px';
      }
    });
    
    return iframe;
  };
})();
`;

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(script);
});

// GET /embed/script/runtime.js - Iframe runtime that renders the form and submits it
router.get('/script/runtime.js', (req, res) => {
  const script = `
(function() {
  function qs() { return new URLSearchParams(window.location.search); }
  function formIdFromPath() {
    // /embed/form/:id
    var parts = window.location.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1];
  }
  function safeParseJson(s) { try { return JSON.parse(s); } catch { return null; } }
  function postResize(formId) {
    try {
      var h = document.documentElement.scrollHeight || document.body.scrollHeight || 600;
      window.parent && window.parent.postMessage({ type: 'anchor-form-resize', formId: formId, height: h }, '*');
    } catch {}
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function(k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function(c) {
      if (c == null) return;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  var root = document.getElementById('af-root');
  var formId = formIdFromPath();
  var token = qs().get('token') || '';
  var attributionStr = qs().get('attribution') || '';
  var attribution = safeParseJson(decodeURIComponent(attributionStr || '')) || {};

  function renderLoading() {
    root.innerHTML = '';
    root.appendChild(el('div', { className: 'af-card' }, [
      el('div', { className: 'af-row' }, [el('div', { className: 'af-alert', text: 'Loading form…' })])
    ]));
    postResize(formId);
  }

  function renderError(msg) {
    root.innerHTML = '';
    root.appendChild(el('div', { className: 'af-card' }, [
      el('div', { className: 'af-row' }, [el('div', { className: 'af-error', text: msg || 'Failed to load form.' })])
    ]));
    postResize(formId);
  }

  function renderSuccess(msg) {
    root.innerHTML = '';
    root.appendChild(el('div', { className: 'af-card' }, [
      el('div', { className: 'af-row' }, [el('div', { className: 'af-success', text: msg || 'Thank you!' })])
    ]));
    postResize(formId);
  }

  function buildFieldsFromSchema(schema) {
    // Accept a few likely shapes; keep it tolerant.
    if (!schema) return [];
    if (Array.isArray(schema.fields)) return schema.fields;
    if (schema.form && Array.isArray(schema.form.fields)) return schema.form.fields;
    if (Array.isArray(schema)) return schema;
    return [];
  }

  function renderForm(form) {
    root.innerHTML = '';

    if (form.css_code) {
      var style = document.createElement('style');
      style.textContent = form.css_code;
      document.head.appendChild(style);
    }

    var schema = form.schema || null;
    var fields = buildFieldsFromSchema(schema);

    if (!fields.length) {
      renderError('This form is published but has no schema yet. Open it in the builder and generate schema.');
      return;
    }

    var values = {};
    fields.forEach(function(f) { values[f.key || f.name || f.id] = ''; });

    var card = el('div', { className: 'af-card' });
    if (form.name) {
      card.appendChild(el('div', { className: 'af-title', text: form.name }));
    }

    var formEl = el('form', {
      onsubmit: async function(e) {
        e.preventDefault();
        try {
          btn.disabled = true;
          btn.textContent = 'Submitting…';
          var resp = await fetch('/embed/' + formId + '/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: values, attribution: attribution }),
            credentials: 'omit'
          });
          var data = await resp.json().catch(function(){ return {}; });
          if (!resp.ok) throw new Error(data.error || 'Submit failed');
          renderSuccess(data.message || 'Thank you for your submission!');
        } catch (err) {
          renderError(err && err.message ? err.message : 'Submit failed');
        }
      }
    });

    function setFocused(inner, isFocused) {
      if (isFocused) inner.classList.add('is-focused');
      else inner.classList.remove('is-focused');
    }
    function setHasValue(inner, value) {
      if (value && String(value).length > 0) inner.classList.add('has-value');
      else inner.classList.remove('has-value');
    }

    fields.forEach(function(field) {
      var key = field.key || field.name || field.id;
      var label = field.label || key;
      var type = (field.type || 'text').toLowerCase();
      var required = !!field.required;

      var fieldWrap = el('div', { className: 'af-field' });
      var inner = el('div', { className: 'af-field-inner' });
      var labelNode = el('div', { className: 'af-floating-label' }, [
        (label || ''),
        required ? el('span', { className: 'af-required', text: '*' }) : null
      ]);
      inner.appendChild(labelNode);

      var input;
      if (type === 'textarea') {
        input = el('textarea', { className: 'af-textarea', 'aria-label': label });
        input.addEventListener('focus', function() { setFocused(inner, true); });
        input.addEventListener('blur', function() { setFocused(inner, false); });
        input.addEventListener('input', function() {
          values[key] = input.value;
          setHasValue(inner, input.value);
          postResize(formId);
        });
      } else if (type === 'select' && Array.isArray(field.options)) {
        input = el('select', { className: 'af-select', 'aria-label': label });
        // Blank option so label can float only after selection, similar to MUI
        input.appendChild(el('option', { value: '', text: '' }));
        field.options.forEach(function(opt) {
          var v = typeof opt === 'string' ? opt : opt.value;
          var t = typeof opt === 'string' ? opt : (opt.label || opt.value);
          input.appendChild(el('option', { value: v, text: t }));
        });
        input.addEventListener('focus', function() { setFocused(inner, true); });
        input.addEventListener('blur', function() { setFocused(inner, false); });
        input.addEventListener('change', function() {
          values[key] = input.value;
          setHasValue(inner, input.value);
        });
        inner.appendChild(el('div', { className: 'af-select-chevron', text: '▾' }));
      } else {
        var htmlType = (type === 'email' || type === 'tel' || type === 'number' || type === 'date') ? type : 'text';
        input = el('input', { className: 'af-input', type: htmlType, 'aria-label': label });
        input.addEventListener('focus', function() { setFocused(inner, true); });
        input.addEventListener('blur', function() { setFocused(inner, false); });
        input.addEventListener('input', function() {
          values[key] = input.value;
          setHasValue(inner, input.value);
        });
      }

      inner.appendChild(input);
      setHasValue(inner, '');
      fieldWrap.appendChild(inner);
      formEl.appendChild(fieldWrap);
    });

    var actions = el('div', { className: 'af-actions' });
    var btn = el('button', { className: 'af-btn', type: 'submit', text: 'Submit' });
    actions.appendChild(btn);
    formEl.appendChild(actions);

    card.appendChild(formEl);
    root.appendChild(card);
    postResize(formId);
    setTimeout(function(){ postResize(formId); }, 300);
  }

  (async function init() {
    try {
      renderLoading();
      var url = '/embed/' + formId + (token ? ('?token=' + encodeURIComponent(token)) : '');
      var resp = await fetch(url, { credentials: 'omit' });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to load form');
      renderForm(data);
    } catch (err) {
      renderError(err && err.message ? err.message : 'Failed to load form');
    }
  })();
})();`;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(script);
});

export default router;

