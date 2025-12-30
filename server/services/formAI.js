/**
 * Form AI Service
 *
 * Provides AI-powered form generation and editing using Vertex AI.
 * - PDF to Form conversion
 * - AI-assisted code editing
 * - Schema generation from code
 */

import { VertexAI } from '@google-cloud/vertexai';
import path from 'path';
import fs from 'fs/promises';
import { extractPdfTextLines, renderPdfToPngBuffers } from './docai.js';

// Initialize Vertex AI
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || 'anchor-hub-480305';
const location = process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_REGION || 'us-central1';
// Prefer aliases over pinned versions to avoid retirement 404s.
// You can override with VERTEX_MODEL / VERTEX_VISION_MODEL in env.
const modelId = process.env.VERTEX_MODEL || 'gemini-3-flash';
// NOTE: Vision model availability varies by project/region and Google retires model versions.
// We select from a fallback list at runtime to avoid hard-failing on 404s.

let vertexAI = null;
let generativeModel = null;
const modelCache = new Map();

function getVertexAI() {
  if (!vertexAI) {
    vertexAI = new VertexAI({
      project: projectId,
      location,
      googleAuthOptions: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      }
    });
  }
  return vertexAI;
}

function getCachedModel(modelName) {
  if (!modelName) throw new Error('Missing Vertex model name');
  if (!modelCache.has(modelName)) {
    modelCache.set(modelName, getVertexAI().getGenerativeModel({ model: modelName }));
  }
  return modelCache.get(modelName);
}

function getModel() {
  if (!generativeModel) {
    generativeModel = getCachedModel(modelId);
  }
  return generativeModel;
}

function isModelNotFoundError(err) {
  const msg = String(err?.message || '');
  return msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('was not found') || msg.includes('Publisher Model');
}

async function generateContentWithFallback({ candidates, request, purpose }) {
  const unique = Array.from(new Set((candidates || []).filter(Boolean)));
  let lastErr = null;

  for (const candidate of unique) {
    try {
      console.log(`[VertexAI] ${purpose} trying model:`, candidate);
      const model = getCachedModel(candidate);
      const result = await model.generateContent(request);
      console.log(`[VertexAI] ${purpose} model success:`, candidate);
      return { result, model: candidate };
    } catch (e) {
      lastErr = e;
      if (isModelNotFoundError(e)) {
        console.warn(`[VertexAI] ${purpose} model not available:`, candidate);
        continue;
      }
      throw e;
    }
  }

  throw new Error(
    `No available Vertex model found for ${purpose}. ` +
      `Set the appropriate env var (VERTEX_MODEL / VERTEX_VISION_MODEL). ` +
      `Last error: ${lastErr?.message || lastErr}`
  );
}

/**
 * Convert PDF content to React form code
 */
export async function convertPDFToForm(pdfBuffer, options = {}) {
  const instructions = String(options?.instructions || '').trim();

  // Defensive guardrails: large multi-page PDFs can exceed model limits / token budgets.
  // We estimate page count without pulling in heavy PDF parsers.
  const estimatedPages = estimatePdfPageCount(pdfBuffer);
  const maxPages = parseInt(process.env.FORMS_AI_PDF_MAX_PAGES || '25', 10);
  if (estimatedPages && estimatedPages > maxPages) {
    throw new Error(
      `PDF appears to have ~${estimatedPages} pages. Please split it into smaller PDFs (<= ${maxPages} pages) and upload again.`
    );
  }

  const prompt = `You are a form builder assistant. Analyze this PDF document and generate a complete HTML form (HTML + CSS + vanilla JavaScript).

Requirements:
1. Extract all form fields from the PDF
2. Determine appropriate input types (text, select, date, checkbox, etc.)
3. Add proper validation where needed
4. Output MUST be standard HTML elements (no React, no MUI)
5. Include a <form data-anchor-form> root element and use name="..." on inputs
6. Include a submit button
7. Keep it compatible with being embedded in an iframe
8. If the PDF has multiple pages, include fields from ALL pages. Use headings/section dividers to keep it readable.

User instructions (apply these preferences if present):
${instructions ? instructions : '(none)'}

Output format - return a JSON object with these fields (IMPORTANT: html/css/js MUST be base64 encoded so the JSON is always valid):
{
  "html_b64": "base64(utf8(html))",
  "css_b64": "base64(utf8(css))",
  "js_b64": "base64(utf8(js))",
  "explanation": "Brief explanation of the form structure"
}

Important:
- Do NOT output React code
- Do NOT output MUI components
- Prefer simple, clean markup and CSS
- If you add JS, keep it minimal and defensive
- Return ONLY the JSON object (no markdown, no extra commentary)`;

  try {
    // Convert PDF buffer to base64
    const pdfBase64 = pdfBuffer.toString('base64');

    const candidates = [
      process.env.VERTEX_MODEL,
      // Modern aliases (preferred)
      'gemini-3-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      // Last resorts (pinned older versions, may be retired)
      'gemini-1.5-flash-002',
      'gemini-1.5-flash-001'
    ];

    const { result } = await generateContentWithFallback({
      purpose: 'pdf->form (pdf inlineData)',
      candidates,
      request: {
        generationConfig: {
          // Ask the model to return actual JSON (still keep our own parsing defensive).
          responseMimeType: 'application/json'
        },
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: pdfBase64
                }
              }
            ]
          }
        ]
      }
    });

    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const parsed = parseAiJson(text);
    const html = decodeB64OrFallback(parsed, 'html_b64', 'html_code') || getDefaultReactCode();
    const css = decodeB64OrFallback(parsed, 'css_b64', 'css_code') || '';
    const js = decodeB64OrFallback(parsed, 'js_b64', 'js_code') || '';
    return {
      react_code: html,
      css_code: css,
      schema: { runtime_mode: 'html', js_code: js },
      explanation: parsed.explanation || 'Form generated from PDF'
    };
  } catch (err) {
    console.error('PDF to form conversion error:', err);
    throw new Error(`AI conversion failed: ${err.message}`);
  }
}

/**
 * Convert PDF to form using multimodal "vision" (rasterized pages) for better layout reconstruction.
 * This mirrors the "screenshot → ChatGPT" success path, but uses Vertex AI Gemini.
 */
export async function convertPDFToFormVision(pdfBuffer, options = {}) {
  const instructions = String(options?.instructions || '').trim();
  const providedImages = Array.isArray(options?.images) ? options.images.filter((x) => x?.buffer?.length) : [];

  const estimatedPages = estimatePdfPageCount(pdfBuffer);
  const maxPages = parseInt(process.env.FORMS_AI_VISION_MAX_PAGES || process.env.FORMS_AI_PDF_MAX_PAGES || '10', 10);
  if (estimatedPages && estimatedPages > maxPages) {
    throw new Error(
      `PDF appears to have ~${estimatedPages} pages. Please split it into smaller PDFs (<= ${maxPages} pages) and upload again.`
    );
  }

  // We MUST have images for the vision workflow (either provided screenshots or rasterized PDF pages).
  // PDF can be included for extra text accuracy, but we do not allow a "PDF only" run.
  let selected = [];
  let pages = [];
  if (providedImages.length) {
    selected = providedImages.slice(0, maxPages).map((img, idx) => ({
      buffer: img.buffer,
      pageNumber: idx + 1,
      mimeType: img.mimeType || 'image/jpeg',
      source: 'upload'
    }));
    pages = selected;
  } else {
    // Rasterize pages (DocAI module already handles pdfjs+canvas and returns JPEG buffers now).
    const dpi = parseInt(process.env.FORMS_AI_VISION_DPI || '220', 10);
    pages = await renderPdfToPngBuffers(pdfBuffer, dpi);
    if (!pages.length) throw new Error('Failed to rasterize PDF pages for vision processing');
    const maxImages = Math.min(pages.length, maxPages);
    selected = pages.slice(0, maxImages).map((p) => ({ ...p, mimeType: 'image/jpeg', source: 'raster' }));
  }

  // If rasterization produces blank images (common when pdfjs+canvas can't render a PDF correctly),
  // we still want the model to succeed. We'll always include the original PDF as an inline part,
  // and we'll skip any page images that look blank to avoid confusing the model.
  const nonBlankSelected = [];
  for (const p of selected) {
    // eslint-disable-next-line no-await-in-loop
    const blank = await looksLikeBlankJpeg(p?.buffer);
    if (!blank) nonBlankSelected.push(p);
  }

  // Optional: dump the exact rasterized JPEGs we send to the vision model (to debug "blank image" outputs).
  // Enable with: FORMS_AI_VISION_DEBUG_DUMP=1
  if (String(process.env.FORMS_AI_VISION_DEBUG_DUMP || '').toLowerCase() === '1') {
    try {
      const dumpDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads', 'forms', 'vision-debug');
      await fs.mkdir(dumpDir, { recursive: true });
      const stamp = Date.now();
      const maxDump = Math.min(selected.length, parseInt(process.env.FORMS_AI_VISION_DEBUG_DUMP_MAX || '3', 10));
      for (let i = 0; i < maxDump; i++) {
        const p = selected[i];
        const pageNum = Number(p.pageNumber || i + 1);
        const outPath = path.join(dumpDir, `${stamp}_page_${String(pageNum).padStart(2, '0')}.jpg`);
        // eslint-disable-next-line no-await-in-loop
        await fs.writeFile(outPath, p.buffer);
        console.log('[Vision AI] Debug dump wrote:', outPath, `(${p.buffer?.length || 0} bytes)`);
      }
    } catch (e) {
      console.warn('[Vision AI] Debug dump failed:', e?.message || String(e));
    }
  }

  // Preset classes/CSS used by Anchor forms. We do NOT want the model inventing new classnames.
  // We include the preset CSS in the final output regardless; the model should primarily emit HTML using these classes.
  const presetCss = getDefaultCssCode();

  const classContract = `
Use ONLY these existing classes (do not invent new class names):
- Layout: ac-form-container, ac-form-title, ac-form, ac-section, ac-section-title, ac-field-row, ac-cols-2, ac-cols-3, ac-cols-4, ac-checkbox-row
- Inputs: ac-form-group, ac-input, ac-textarea, ac-label, ac-static-label
- Choice controls: ac-check, ac-radio (pattern: <label class="ac-check"><input ... /><span></span> Label</label>)
- Button: ac-button

Floating label pattern (required):
<div class="ac-form-group">
  <input class="ac-input" id="field" name="field" placeholder=" " />
  <label class="ac-label" for="field">Label</label>
</div>
`;

  const prompt = `You are reconstructing a PDF form. You are given:
- The ORIGINAL PDF (best for text accuracy)
- PAGE IMAGES (best for layout fidelity; may be blank/unavailable in some environments)

GOAL: produce a high-fidelity, multi-column HTML form that matches the PDF visually and structurally.

ABSOLUTE REQUIREMENTS:
1) Extract ALL visible content: headings, instructions, labels, checkboxes, and fields across ALL pages provided.
2) Every field must have a stable name="snake_case" (no generic names).
3) Use semantic grouping: fieldsets/sections (.ac-section + .ac-section-title).
4) Use grid rows for multi-column blocks (.ac-field-row + .ac-cols-2/.ac-cols-3).
5) Use real checkboxes/radios for options.
6) Use ONLY the preset classes and patterns below.

PRESET CLASSES + PATTERNS:
${classContract}

PRINTABLE TEMPLATE:
Also return a printable HTML/CSS/JS version that renders a completed submission for printing:
- Same structure/sections
- Use {{field_name}} placeholders for values
- For checkboxes: render checked/unchecked based on {{field_name}} (true/false)

User instructions (apply if present): ${instructions || '(none)'}

OUTPUT: Return ONLY JSON. Code fields MUST be base64 encoded:
{
  "html_b64": "base64(utf8(html))",
  "css_b64": "base64(utf8(optional tiny overrides only; do NOT redefine base classes))",
  "js_b64": "base64(utf8(optional; can be empty))",
  "print_html_b64": "base64(utf8(print_html))",
  "print_css_b64": "base64(utf8(print_css))",
  "print_js_b64": "base64(utf8(print_js))",
  "explanation": "brief"
}`;

  console.log('[Vision AI] Vision model candidates will be tried (env override first).');
  console.log('[Vision AI] Prompt length:', prompt.length, 'chars');
  console.log('[Vision AI] Rasterized pages:', selected.length, 'non-blank pages:', nonBlankSelected.length);

  try {
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

    // If we have no usable images, DO NOT proceed (images are mandatory for this flow).
    if (!nonBlankSelected.length) {
      const hint =
        providedImages.length > 0
          ? 'All provided screenshots appear blank/unsupported.'
          : 'PDF→image rasterization produced blank images in this environment.';
      throw new Error(
        `${hint} To proceed, install Poppler (pdftoppm) / set FORMS_PDF_RASTERIZER=poppler, or upload screenshots alongside the PDF.`
      );
    }

    const parts = [
      { text: prompt },
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBase64
        }
      },
      ...(nonBlankSelected.length
        ? nonBlankSelected.map((p) => ({
            inlineData: {
              mimeType: p.mimeType || 'image/jpeg',
              data: p.buffer.toString('base64')
            }
          }))
        : [
            {
              text: 'NOTE: Rasterized page images were detected as blank in this environment. Use the PDF content above as the source of truth.'
            }
          ]),
      {
        text:
          selected.length < pages.length
            ? `NOTE: Only the first ${selected.length} page images were available (of ${pages.length} total).`
            : ''
      }
    ].filter((x) => !(x.text !== undefined && String(x.text).trim() === ''));

    const modelCandidates = [
      process.env.VERTEX_VISION_MODEL,
      // Prefer best reasoning first for reconstruction, then fall back to workhorse.
      'gemini-3-pro',
      'gemini-3-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      // Last resorts (pinned older versions, may be retired)
      'gemini-1.5-pro-002',
      'gemini-1.5-flash-002',
      'gemini-1.5-flash-001'
    ];

    const { result } = await generateContentWithFallback({
      purpose: 'pdf->form (vision images)',
      candidates: modelCandidates,
      request: {
        generationConfig: { responseMimeType: 'application/json' },
        contents: [{ role: 'user', parts }]
      }
    });

    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('[Vision AI] Raw response length:', text.length);
    console.log('[Vision AI] First 500 chars:', text.substring(0, 500));

    const parsed = parseAiJson(text);
    const html = decodeB64OrFallback(parsed, 'html_b64', 'html_code') || getDefaultReactCode();
    const aiCss = decodeB64OrFallback(parsed, 'css_b64', 'css_code') || '';
    const js = decodeB64OrFallback(parsed, 'js_b64', 'js_code') || getDefaultJsCode();
    const printHtml = decodeB64OrFallback(parsed, 'print_html_b64', 'print_html') || '';
    const printCss = decodeB64OrFallback(parsed, 'print_css_b64', 'print_css') || '';
    const printJs = decodeB64OrFallback(parsed, 'print_js_b64', 'print_js') || '';

    // Always include the preset CSS, then append any AI overrides.
    const fullCss = presetCss + (aiCss ? `\n\n/* Form-specific overrides (AI) */\n${aiCss}` : '');

    console.log('[Vision AI] Extracted HTML length:', html.length);
    console.log('[Vision AI] HTML preview:', html.substring(0, 300));

    // Cross-check: compare AI labels against text extracted from the PDF (canvas-free).
    // This does not block success; it produces a report to help spot missing/misspelled fields.
    let validation = null;
    try {
      const pdfLines = await extractPdfTextLines(pdfBuffer, {
        maxPages: parseInt(process.env.FORMS_AI_VISION_VALIDATE_PAGES || '3', 10)
      });
      validation = validateAiHtmlAgainstPdfText({ html, pdfLines });
      if (validation?.missing?.length || validation?.possible_typos?.length) {
        console.warn('[Vision AI] Validation warnings:', {
          missing: validation.missing?.slice(0, 10),
          possible_typos: validation.possible_typos?.slice(0, 10)
        });
      }
    } catch (e) {
      console.warn('[Vision AI] Validation skipped:', e?.message || String(e));
      validation = null;
    }

    let schemaObj = null;
    const schemaJson = decodeB64OrFallback(parsed, 'schema_json_b64', 'schema_json') || '';
    if (schemaJson) {
      try {
        schemaObj = JSON.parse(schemaJson);
      } catch {
        schemaObj = null;
      }
    }

    const schema = {
      ...(schemaObj || {}),
      runtime_mode: 'html',
      js_code: js,
      ai_validation: validation,
      printable: {
        html: printHtml,
        css: printCss,
        js: printJs
      }
    };

    return {
      react_code: html,
      css_code: fullCss,
      schema,
      explanation: parsed.explanation || 'Form generated from PDF (vision)'
    };
  } catch (err) {
    console.error('PDF to form vision conversion error:', err);
    throw new Error(`AI conversion failed: ${err.message}`);
  }
}

async function looksLikeBlankJpeg(jpegBuffer) {
  try {
    if (!jpegBuffer || jpegBuffer.length < 2000) return true;
    // Super cheap heuristic first: very small JPEGs are often blank.
    if (jpegBuffer.length < 25_000) return true;

    // More robust: sample pixels. Dynamic import so we don't hard-require canvas in every environment.
    const { createCanvas, loadImage } = await import('canvas');
    const img = await loadImage(jpegBuffer);
    const w = Math.max(1, Math.min(200, img.width || 1));
    const h = Math.max(1, Math.min(200, img.height || 1));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    // Sample a grid of pixels and compute how many are near-white.
    const stepX = Math.max(1, Math.floor(w / 20));
    const stepY = Math.max(1, Math.floor(h / 20));
    let sampled = 0;
    let nearWhite = 0;
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const idx = (y * w + x) * 4;
        const r = data[idx] || 0;
        const g = data[idx + 1] || 0;
        const b = data[idx + 2] || 0;
        sampled++;
        if (r > 245 && g > 245 && b > 245) nearWhite++;
      }
    }
    if (!sampled) return true;
    return nearWhite / sampled > 0.985;
  } catch {
    // If we can't decode, don't treat as blank (avoid dropping useful images).
    return false;
  }
}

function normalizeComparableText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigramSet(s) {
  const t = normalizeComparableText(s).replace(/\s/g, '');
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function diceSimilarity(a, b) {
  const A = bigramSet(a);
  const B = bigramSet(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0;
  for (const x of A) if (B.has(x)) overlap++;
  return (2 * overlap) / (A.size + B.size);
}

function extractLabelsFromHtml(html) {
  const src = String(html || '');
  const labels = [];

  // <label ...>Text</label>
  for (const m of src.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/gi)) {
    const inner = String(m[1] || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (inner) labels.push(inner);
  }

  // Headings and legends can carry important section titles that we don't want to "miss"
  for (const m of src.matchAll(/<(?:h1|h2|h3|legend)[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|legend)>/gi)) {
    const inner = String(m[1] || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (inner) labels.push(inner);
  }

  // De-dupe
  const seen = new Set();
  const out = [];
  for (const l of labels) {
    const k = normalizeComparableText(l);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

function extractCandidateLabelsFromPdfText(pdfLines) {
  const lines = Array.isArray(pdfLines) ? pdfLines : [];
  const candidates = [];

  for (const line of lines) {
    const t = String(line || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) continue;
    // Filter obvious non-label noise (addresses/phones/URLs)
    if (/(www\.|https?:\/\/)/i.test(t)) continue;
    if (/^\d{3,}[\.\-\s]?\d{3,}/.test(t)) continue;

    // Common form label patterns
    const mColon = t.match(/^(.{2,80}?):\s*$/);
    if (mColon) {
      candidates.push(mColon[1].trim());
      continue;
    }

    // Checkbox items often appear as standalone phrases
    if (t.length >= 6 && t.length <= 80 && /[a-z]/i.test(t) && !/[{}]/.test(t)) {
      candidates.push(t);
    }
  }

  // De-dupe
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const k = normalizeComparableText(c);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function validateAiHtmlAgainstPdfText({ html, pdfLines }) {
  const aiLabels = extractLabelsFromHtml(html);
  const pdfLabels = extractCandidateLabelsFromPdfText(pdfLines);

  const missing = [];
  const possible_typos = [];

  for (const expected of pdfLabels) {
    const expNorm = normalizeComparableText(expected);
    if (!expNorm) continue;

    let best = { score: 0, label: null };
    for (const got of aiLabels) {
      const score = diceSimilarity(expected, got);
      if (score > best.score) best = { score, label: got };
    }

    // Thresholds tuned to be conservative: don't spam.
    if (best.score < 0.72) {
      missing.push({ expected, best_match: best.label, score: Number(best.score.toFixed(3)) });
    } else if (best.score < 0.9) {
      possible_typos.push({ expected, best_match: best.label, score: Number(best.score.toFixed(3)) });
    }
  }

  return {
    pdf_label_count: pdfLabels.length,
    ai_label_count: aiLabels.length,
    missing,
    possible_typos
  };
}

function parseAiJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('AI returned empty response');

  // Try direct JSON parse first.
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  // Extract the first balanced JSON object from the text (handles extra commentary).
  const extracted = extractFirstJsonObject(raw);
  if (!extracted) throw new Error('Could not locate JSON object in AI response');

  try {
    return JSON.parse(extracted);
  } catch (e) {
    // As a best-effort, escape raw newlines inside strings (common failure mode).
    const repaired = repairJsonNewlines(extracted);
    try {
      return JSON.parse(repaired);
    } catch {
      throw new Error(`Invalid JSON from AI: ${e.message}`);
    }
  }
}

function extractFirstJsonObject(s) {
  let inStr = false;
  let esc = false;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

function repairJsonNewlines(s) {
  // Replace literal newlines inside JSON strings with escaped \\n
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
        out += ch;
        continue;
      }
      if (ch === '\\\\') {
        esc = true;
        out += ch;
        continue;
      }
      if (ch === '"') {
        inStr = false;
        out += ch;
        continue;
      }
      if (ch === '\n') {
        out += '\\\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\\\r';
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

function decodeB64OrFallback(obj, b64Key, plainKey) {
  const b64 = obj?.[b64Key];
  if (typeof b64 === 'string' && b64.trim()) {
    try {
      return Buffer.from(b64.trim(), 'base64').toString('utf8');
    } catch {
      // fall through
    }
  }
  const plain = obj?.[plainKey];
  return typeof plain === 'string' ? plain : '';
}

function estimatePdfPageCount(pdfBuffer) {
  try {
    // Crude heuristic: count occurrences of "/Type /Page" excluding "/Type /Pages"
    // Works for many PDFs but not all; used only for guardrails.
    const s = pdfBuffer.toString('latin1');
    const pageMatches = s.match(/\/Type\s*\/Page\b/g) || [];
    const pagesMatches = s.match(/\/Type\s*\/Pages\b/g) || [];
    const approx = Math.max(0, pageMatches.length - pagesMatches.length);
    return approx || null;
  } catch {
    return null;
  }
}

/**
 * AI-assisted form code editing
 */
export async function editFormWithAI(currentCode, currentCss, instruction) {
  const isHtml = looksLikeHtml(currentCode);

  const prompt = isHtml
    ? `You are a form code editor assistant. Modify the following HTML form (HTML/CSS/JS) based on the user's instruction.

Current HTML:
\`\`\`html
${currentCode}
\`\`\`

Current CSS:
\`\`\`css
${currentCss}
\`\`\`

User instruction: ${instruction}

Output format - return a JSON object (IMPORTANT: html/css/js MUST be base64 encoded so the JSON is always valid):
{
  "html_b64": "base64(utf8(html))",
  "css_b64": "base64(utf8(css))",
  "js_b64": "base64(utf8(js))",
  "changes_made": ["List of changes made"],
  "explanation": "Brief explanation of what was changed"
}

Important:
 - Do NOT output React or MUI
 - Keep a <form data-anchor-form> root element
 - Preserve/introduce name="..." attributes on inputs
 - If you output JS, keep it minimal and defensive
 - If you are editing a PRINT TEMPLATE, use {{field_name}} placeholders for submission values and do not remove them
 - Return ONLY the JSON object (no markdown, no extra commentary)`
    : `You are a form code editor assistant. Modify the following React/MUI form code based on the user's instruction.

Current React Code:
\`\`\`javascript
${currentCode}
\`\`\`

Current CSS:
\`\`\`css
${currentCss}
\`\`\`

User instruction: ${instruction}

Output format - return a JSON object:
{
  "react_code": "// Complete modified React code",
  "css_code": "/* Complete modified CSS */",
  "changes_made": ["List of changes made"],
  "explanation": "Brief explanation of what was changed"
}

Important:
- Preserve the component structure (default export, onSubmit prop, attribution prop)
- Only modify what's needed to fulfill the instruction
- Keep all existing functionality unless explicitly asked to remove it
- Use valid React/JSX syntax
- Use valid MUI component imports`;

  try {
    const candidates = [
      process.env.VERTEX_MODEL,
      'gemini-3-pro',
      'gemini-3-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ];

    const { result } = await generateContentWithFallback({
      purpose: 'ai edit',
      candidates,
      request: { contents: [{ role: 'user', parts: [{ text: prompt }] }] }
    });

    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const parsed = isHtml
      ? parseAiJson(text)
      : (() => {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('Could not parse AI response as JSON');
          return JSON.parse(jsonMatch[0]);
        })();
    return {
      react_code: isHtml ? decodeB64OrFallback(parsed, 'html_b64', 'html_code') || currentCode : parsed.react_code || currentCode,
      css_code: isHtml ? decodeB64OrFallback(parsed, 'css_b64', 'css_code') || currentCss : parsed.css_code || currentCss,
      changes_made: parsed.changes_made || [],
      explanation: parsed.explanation || 'Code updated',
      js_code: isHtml ? decodeB64OrFallback(parsed, 'js_b64', 'js_code') || '' : ''
    };
  } catch (err) {
    console.error('AI edit error:', err);
    throw new Error(`AI edit failed: ${err.message}`);
  }
}

function looksLikeHtml(code) {
  const s = String(code || '').trim();
  if (!s) return false;
  if (s.startsWith('import ') || s.startsWith('export ')) return false;
  return s.startsWith('<') || /<\/?[a-zA-Z][\s\S]*>/.test(s);
}

/**
 * Generate schema from React code
 */
export async function generateSchemaFromCode(reactCode) {
  const prompt = `Analyze this React form component and extract the form schema (list of fields with their types, labels, and validation rules).

React Code:
\`\`\`javascript
${reactCode}
\`\`\`

Output format - return a JSON object:
{
  "fields": [
    {
      "name": "fieldName",
      "type": "text|email|phone|select|date|checkbox|textarea|radio",
      "label": "Field Label",
      "required": true/false,
      "options": ["for select/radio fields"],
      "validation": { "pattern": "regex if any", "message": "validation message" }
    }
  ]
}`;

  try {
    const candidates = [
      process.env.VERTEX_MODEL,
      'gemini-3-pro',
      'gemini-3-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ];

    const { result } = await generateContentWithFallback({
      purpose: 'schema generation',
      candidates,
      request: { contents: [{ role: 'user', parts: [{ text: prompt }] }] }
    });

    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse AI response as JSON');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Schema generation error:', err);
    // Fallback: deterministic extraction from JSX when Vertex auth is unavailable locally.
    // This keeps embeds functional even if AI is temporarily down.
    return extractSchemaFallback(reactCode);
  }
}

function extractSchemaFallback(reactCode) {
  const src = String(reactCode || '');

  // Very lightweight extraction for common MUI patterns.
  // We look for <TextField ... name="x" label="Y" type="email" required multiline />
  const fields = [];
  const seen = new Set();

  // Capture self-closing TextField tags (most common in our default template)
  const textFieldTags = src.match(/<TextField[\s\S]*?\/>/g) || [];
  for (const tag of textFieldTags) {
    const name = (tag.match(/\bname\s*=\s*["']([^"']+)["']/) || [])[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const label = (tag.match(/\blabel\s*=\s*["']([^"']+)["']/) || [])[1] || name;
    const type = (tag.match(/\btype\s*=\s*["']([^"']+)["']/) || [])[1] || 'text';
    const required = /\brequired\b/.test(tag);
    const multiline = /\bmultiline\b/.test(tag);

    fields.push({
      name,
      type: multiline ? 'textarea' : normalizeFieldType(type),
      label,
      required
    });
  }

  // If nothing found, fall back to any `name="..." label="..."` pairs we can spot.
  if (fields.length === 0) {
    const generic = src.match(/name\s*=\s*["'][^"']+["'][\s\S]{0,120}?label\s*=\s*["'][^"']+["']/g) || [];
    for (const chunk of generic) {
      const name = (chunk.match(/\bname\s*=\s*["']([^"']+)["']/) || [])[1];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const label = (chunk.match(/\blabel\s*=\s*["']([^"']+)["']/) || [])[1] || name;
      fields.push({ name, type: 'text', label, required: /\brequired\b/.test(chunk) });
    }
  }

  return { fields, generated_by: 'fallback' };
}

function normalizeFieldType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'email') return 'email';
  if (t === 'tel' || t === 'phone') return 'phone';
  if (t === 'date') return 'date';
  if (t === 'checkbox') return 'checkbox';
  if (t === 'radio') return 'radio';
  if (t === 'select') return 'select';
  if (t === 'textarea') return 'textarea';
  if (t === 'number') return 'text';
  return 'text';
}

/**
 * Generate a diff between old and new code
 */
export function generateCodeDiff(oldCode, newCode) {
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');

  const diff = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i] || '';
    const newLine = newLines[i] || '';

    if (oldLine !== newLine) {
      if (oldLine && !newLine) {
        diff.push({ type: 'removed', line: i + 1, content: oldLine });
      } else if (!oldLine && newLine) {
        diff.push({ type: 'added', line: i + 1, content: newLine });
      } else {
        diff.push({ type: 'changed', line: i + 1, old: oldLine, new: newLine });
      }
    }
  }

  return diff;
}

/**
 * Default React code template
 */
export function getDefaultReactCode() {
  return `
<div class="ac-form-container">
    <h1 class="ac-form-title">Advanced Form</h1>

    <form id="ac-form" novalidate>

      <div class="ac-form-group">
        <input class="ac-input" id="name" name="name" autocomplete="name" />
        <label class="ac-label" for="name">Full Name</label>
      </div>

      <div class="ac-form-group">
        <input class="ac-input" id="email" name="email" autocomplete="email" />
        <label class="ac-label" for="email">Email</label>
      </div>

      <div class="ac-form-group ac-select-wrapper">
        <div
          class="ac-select-trigger"
          id="countryTrigger"
          tabindex="0"
          role="button"
          aria-haspopup="listbox"
          aria-expanded="false"
        ></div>

        <label class="ac-label" for="country">Country</label>

        <div class="ac-select-dropdown" id="countryDropdown" role="listbox">
          <div class="ac-select-option" data-value="" role="option">Select Country</div>
          <div class="ac-select-option" data-value="us" role="option">United States</div>
          <div class="ac-select-option" data-value="ca" role="option">Canada</div>
          <div class="ac-select-option" data-value="uk" role="option">United Kingdom</div>
        </div>

        <select class="ac-select-native" id="country" name="country" autocomplete="country">
          <option value="">Select Country</option>
          <option value="us">United States</option>
          <option value="ca">Canada</option>
          <option value="uk">United Kingdom</option>
        </select>
      </div>

      <div class="ac-form-group">
        <textarea class="ac-textarea" id="message" name="message"></textarea>
        <label class="ac-label" for="message">Message</label>
      </div>

      <div class="ac-form-group">
        <label class="ac-static-label" for="slider">Satisfaction</label>
        <div class="ac-slider-wrapper">
          <input type="range" min="1" max="10" value="5" class="ac-slider" id="slider" name="satisfaction" />
          <span class="ac-slider-value" id="sliderValue">5</span>
        </div>
      </div>

      <div class="ac-form-group">
        <label class="ac-static-label">Visits</label>

        <div class="ac-number-wrapper" data-min="1" data-max="20" data-step="1">
          <button type="button" class="ac-num-btn" data-dir="-1" aria-label="Decrease">−</button>

          <input
            type="number"
            class="ac-number-input"
            name="visits"
            value="1"
            min="1"
            max="20"
            inputmode="numeric"
            aria-label="Visits"
          />

          <button type="button" class="ac-num-btn" data-dir="1" aria-label="Increase">+</button>
        </div>
      </div>

      <div class="ac-form-group">
        <label class="ac-static-label">Services</label>
        <label class="ac-check"><input type="checkbox" name="services[]" value="consultation" /><span></span> Consultation</label>
        <label class="ac-check"><input type="checkbox" name="services[]" value="treatment" /><span></span> Treatment</label>
      </div>

      <div class="ac-form-group">
        <label class="ac-static-label">Preferred Contact</label>
        <label class="ac-radio"><input type="radio" name="contact" value="email" /><span></span> Email</label>
        <label class="ac-radio"><input type="radio" name="contact" value="phone" /><span></span> Phone</label>
      </div>

      <button class="ac-button" type="submit">Submit</button>
    </form>
  </div>`;
}

/**
 * Default CSS code template
 */
export function getDefaultCssCode() {
  return `
:root {
  --ac-color-primary: #667eea;
  --ac-color-primary-dark: #764ba2;
  --ac-color-text: #1a202c;
  --ac-color-text-light: #718096;
  --ac-color-border: #e2e8f0;
  --ac-color-border-hover: #cbd5e0;
  --ac-color-bg: #ffffff;
  --ac-color-bg-hover: #f7fafc;
  --ac-color-bg-selected: #edf2f7;

  --ac-radius: 8px;
  --ac-transition: all 0.2s ease;
}

* { box-sizing: border-box; }

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, var(--ac-color-primary), var(--ac-color-primary-dark));
  min-height: 100vh;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.ac-form-container {
  background: var(--ac-color-bg);
  padding: 40px;
  width: 100%;
  max-width: 520px;
  border-radius: var(--ac-radius);
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

.ac-form-title {
  text-align: center;
  margin-bottom: 32px;
  font-size: 28px;
  color: var(--ac-color-text);
}

/* Floating inputs */
.ac-form-group {
  position: relative;
  margin-bottom: 28px;
}

.ac-input,
.ac-textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--ac-color-border);
  border-radius: var(--ac-radius);
  font-size: 16px;
  background: var(--ac-color-bg);
  outline: none;
  transition: var(--ac-transition);
}

.ac-textarea { min-height: 100px; resize: vertical; }

.ac-input:hover,
.ac-textarea:hover {
  border-color: var(--ac-color-border-hover);
}

.ac-input:focus,
.ac-textarea:focus,
.ac-input.ac-has-content,
.ac-textarea.ac-has-content {
  border-color: var(--ac-color-primary);
}

.ac-label {
  position: absolute;
  top: 12px;
  left: 12px;
  font-size: 16px;
  color: var(--ac-color-text-light);
  background: var(--ac-color-bg);
  padding: 0 4px;
  pointer-events: none;
  transition: var(--ac-transition);
}

.ac-input:focus ~ .ac-label,
.ac-textarea:focus ~ .ac-label,
.ac-input.ac-has-content ~ .ac-label,
.ac-textarea.ac-has-content ~ .ac-label {
  top: -8px;
  font-size: 12px;
  color: var(--ac-color-primary);
  font-weight: 500;
}

/* Custom select */
.ac-select-wrapper { position: relative; }

.ac-select-trigger {
  width: 100%;
  padding: 12px 40px 12px 12px;
  border: 2px solid var(--ac-color-border);
  border-radius: var(--ac-radius);
  cursor: pointer;
  position: relative;
  background: var(--ac-color-bg);
  min-height: 48px;
  display: flex;
  align-items: center;
  color: var(--ac-color-text);
  transition: var(--ac-transition);
  outline: none;
}

.ac-select-trigger:hover {
  border-color: var(--ac-color-border-hover);
}

.ac-select-trigger::after {
  content: '';
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid var(--ac-color-text-light);
  transition: transform 0.2s ease;
}

.ac-select-trigger.ac-active {
  border-color: var(--ac-color-primary);
}

.ac-select-trigger.ac-active::after {
  transform: translateY(-50%) rotate(180deg);
}

/* Placeholder appears only while open and empty, label floats then */
.ac-select-trigger::before {
  content: "";
  color: var(--ac-color-text-light);
}

.ac-select-trigger.ac-active:not(.ac-has-value)::before {
  content: "Select Country";
}

/* IMPORTANT: label is directly after trigger in the HTML */
.ac-select-trigger:not(.ac-has-value):not(.ac-active) + .ac-label {
  top: 12px;
  font-size: 16px;
  color: var(--ac-color-text-light);
  font-weight: 400;
}

.ac-select-trigger.ac-has-value + .ac-label,
.ac-select-trigger.ac-active + .ac-label {
  top: -8px;
  font-size: 12px;
  color: var(--ac-color-primary);
  font-weight: 500;
}

.ac-select-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--ac-color-bg);
  border: 2px solid var(--ac-color-primary);
  border-radius: var(--ac-radius);
  box-shadow: 0 10px 30px rgba(0,0,0,0.15);
  max-height: 220px;
  overflow-y: auto;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-10px);
  transition: var(--ac-transition);
  z-index: 1000;
}

.ac-select-dropdown.ac-open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.ac-select-option {
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.ac-select-option:hover { background: var(--ac-color-bg-hover); }

.ac-select-option.ac-selected {
  background: var(--ac-color-bg-selected);
  color: var(--ac-color-primary);
  font-weight: 500;
}

.ac-select-native {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

/* Slider */
.ac-static-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--ac-color-text-light);
}

.ac-slider-wrapper { position: relative; }

.ac-slider {
  width: 100%;
  appearance: none;
  height: 6px;
  background: linear-gradient(90deg, var(--ac-color-primary), var(--ac-color-primary-dark));
  border-radius: 6px;
  outline: none;
}

.ac-slider::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  background: #fff;
  border: 3px solid var(--ac-color-primary);
  border-radius: 50%;
  cursor: pointer;
}

.ac-slider-value {
  position: absolute;
  top: -28px;
  right: 0;
  background: var(--ac-color-primary);
  color: #fff;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
}

/* Number selector (typeable, no spinner arrows) */
.ac-number-wrapper {
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  border: 2px solid var(--ac-color-border);
  border-radius: var(--ac-radius);
  overflow: hidden;
  background: var(--ac-color-bg);
  transition: var(--ac-transition);
}

.ac-number-wrapper:focus-within {
  border-color: var(--ac-color-primary);
}

.ac-num-btn {
  height: 46px;
  border: 0;
  background: var(--ac-color-bg-hover);
  cursor: pointer;
  font-size: 20px;
  transition: var(--ac-transition);
}

.ac-num-btn:hover {
  background: var(--ac-color-primary);
  color: #fff;
}

/* Center number input styled like text */
.ac-number-input {
  height: 46px;
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 16px;
  color: var(--ac-color-text);
  text-align: center;
  padding: 0 8px;
}

/* Hide native spinners: Chrome/Safari/Edge */
.ac-number-input::-webkit-outer-spin-button,
.ac-number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* Hide native spinners: Firefox */
.ac-number-input[type="number"] {
  -moz-appearance: textfield;
}

/* Checkbox / Radio */
.ac-check,
.ac-radio {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  cursor: pointer;
  user-select: none;
  
}

.ac-check input,
.ac-radio input { display: none; }

.ac-check span,
.ac-radio span {
  width: 20px;
  height: 20px;
  border: 2px solid var(--ac-color-border);
  border-radius: 6px;
  position: relative;
  transition: var(--ac-transition);
}

.ac-check input:checked + span {
  background: var(--ac-color-primary);
  border-color: var(--ac-color-primary);
}

.ac-check input:checked + span::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 0px;
  width: 5px;
  height: 10px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.ac-radio span { border-radius: 50%; }

.ac-radio input:checked + span::after {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--ac-color-primary);
  border-radius: 50%;
  position: absolute;
  top: 4px;
  left: 4px;
}

/* Field rows for multi-column layouts */
.ac-field-row {
  display: grid;
  gap: 16px;
  margin-bottom: 28px;
}

.ac-field-row .ac-form-group { margin-bottom: 0; }

.ac-cols-2 { grid-template-columns: repeat(2, 1fr); }
.ac-cols-3 { grid-template-columns: repeat(3, 1fr); }
.ac-cols-4 { grid-template-columns: repeat(4, 1fr); }

/* Checkbox row for horizontal checkbox lists */
.ac-checkbox-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 28px;
}

.ac-checkbox-row.ac-cols-2 { display: grid; grid-template-columns: repeat(2, 1fr); }
.ac-checkbox-row.ac-cols-3 { display: grid; grid-template-columns: repeat(3, 1fr); }
.ac-checkbox-row.ac-cols-4 { display: grid; grid-template-columns: repeat(4, 1fr); }

/* Section grouping */
.ac-section {
  border: 2px solid var(--ac-color-border);
  border-radius: var(--ac-radius);
  padding: 24px;
  margin-bottom: 28px;
}

.ac-section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--ac-color-text);
  margin-bottom: 20px;
  padding: 0 8px;
  background: var(--ac-color-bg);
}

/* Responsive breakpoints */
@media (max-width: 600px) {
  .ac-cols-2, .ac-cols-3, .ac-cols-4,
  .ac-checkbox-row.ac-cols-2, .ac-checkbox-row.ac-cols-3, .ac-checkbox-row.ac-cols-4 {
    grid-template-columns: 1fr;
  }
  
  .ac-form-container {
    padding: 24px;
    max-width: 100%;
  }
}

/* Button */
.ac-button {
  width: 100%;
  margin-top: 20px;
  padding: 14px;
  border: none;
  border-radius: var(--ac-radius);
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(135deg, var(--ac-color-primary), var(--ac-color-primary-dark));
  color: #fff;
  cursor: pointer;
  transition: var(--ac-transition);
}

.ac-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(102,126,234,0.4);
}`;
}

/**
 * Simpler default JS that only handles floating labels - defensive, no errors if elements missing
 */
export function getDefaultJsCode() {
  return `document.addEventListener('DOMContentLoaded', function() {
  /* Floating labels for inputs and textarea */
  var inputs = document.querySelectorAll('.ac-input, .ac-textarea');
  if (inputs && inputs.length) {
    inputs.forEach(function(el) {
      var update = function() {
        if (el.value && el.value.trim() !== '') {
          el.classList.add('ac-has-content');
        } else {
          el.classList.remove('ac-has-content');
        }
      };
      el.addEventListener('input', update);
      el.addEventListener('change', update);
      update();
      setTimeout(update, 50);
    });
  }

  /* Form submission - prevent default, log data */
  var form = document.querySelector('[data-anchor-form]') || document.querySelector('form');
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var data = {};
      var fd = new FormData(form);
      fd.forEach(function(value, key) {
        if (data[key]) {
          if (!Array.isArray(data[key])) data[key] = [data[key]];
          data[key].push(value);
        } else {
          data[key] = value;
        }
      });
      console.log('Form submitted:', data);
      alert('Form submitted! Check console for data.');
    });
  }
});`;
}

/**
 * Full default JS code template with all advanced widgets (for the default template only)
 */
export function getFullDefaultJsCode() {
  return `document.addEventListener('DOMContentLoaded', () => {
  /* Floating labels for inputs and textarea */
  document.querySelectorAll('.ac-input, .ac-textarea').forEach(el => {
    const update = () => el.classList.toggle('ac-has-content', el.value.trim() !== '');
    el.addEventListener('input', update);
    el.addEventListener('change', update);
    update();
    setTimeout(update, 50);
    setTimeout(update, 250);
  });

  /* Country select */
  const trigger = document.getElementById('countryTrigger');
  const dropdown = document.getElementById('countryDropdown');
  const nativeSelect = document.getElementById('country');
  if (!trigger || !dropdown || !nativeSelect) return;
  const options = Array.from(dropdown.querySelectorAll('.ac-select-option'));

  const openSelect = () => {
    dropdown.classList.add('ac-open');
    trigger.classList.add('ac-active');
    trigger.setAttribute('aria-expanded', 'true');
  };

  const closeSelect = () => {
    dropdown.classList.remove('ac-open');
    trigger.classList.remove('ac-active');
    trigger.setAttribute('aria-expanded', 'false');
  };

  const setSelectValue = (value, labelText) => {
    nativeSelect.value = value;

    options.forEach(o => o.classList.remove('ac-selected'));
    const match = options.find(o => (o.dataset.value || '') === value);
    if (match) match.classList.add('ac-selected');

    if (!value) {
      trigger.textContent = '';
      trigger.classList.remove('ac-has-value');
    } else {
      trigger.textContent = labelText;
      trigger.classList.add('ac-has-value');
    }
  };

  if (nativeSelect.value) {
    const initOpt = options.find(o => o.dataset.value === nativeSelect.value);
    if (initOpt) setSelectValue(nativeSelect.value, initOpt.textContent);
  } else {
    setSelectValue('', '');
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.contains('ac-open') ? closeSelect() : openSelect();
  });

  trigger.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dropdown.classList.contains('ac-open') ? closeSelect() : openSelect();
    }
    if (e.key === 'Escape') closeSelect();
  });

  options.forEach(option => {
    option.addEventListener('click', e => {
      e.stopPropagation();
      const value = option.dataset.value || '';
      const text = option.textContent || '';
      setSelectValue(value, text);
      closeSelect();
      trigger.focus();
    });
  });

  document.addEventListener('click', () => closeSelect());

  /* Slider value */
  const slider = document.getElementById('slider');
  const sliderValue = document.getElementById('sliderValue');
  if (slider && sliderValue) {
    const sync = () => { sliderValue.textContent = slider.value; };
    slider.addEventListener('input', sync);
    sync();
  }

  /* Number stepper, supports typing and buttons */
  document.querySelectorAll('.ac-number-wrapper').forEach(wrapper => {
    const input = wrapper.querySelector('.ac-number-input');
    const buttons = wrapper.querySelectorAll('.ac-num-btn');

    const min = parseInt(wrapper.dataset.min || input?.min || '0', 10);
    const max = parseInt(wrapper.dataset.max || input?.max || '999999', 10);
    const step = parseInt(wrapper.dataset.step || '1', 10);

    const clamp = (v) => Math.max(min, Math.min(max, v));

    const normalize = () => {
      if (!input) return;
      const raw = parseInt(String(input.value || '').replace(/[^\\d-]/g, ''), 10);
      const safe = Number.isNaN(raw) ? min : clamp(raw);
      input.value = String(safe);
    };

    // Normalize on blur and on enter
    input?.addEventListener('blur', normalize);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        normalize();
        input.blur();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        input.value = String(clamp((parseInt(input.value, 10) || min) + step));
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        input.value = String(clamp((parseInt(input.value, 10) || min) - step));
      }
    });

    // Keep typed values bounded while typing (optional but helpful)
    input?.addEventListener('input', () => {
      // Allow empty during typing, normalize on blur/enter
      if (input.value === '') return;
      const raw = parseInt(String(input.value).replace(/[^\\d-]/g, ''), 10);
      if (Number.isNaN(raw)) return;
      input.value = String(clamp(raw));
    });

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!input) return;
        const dir = parseInt(btn.dataset.dir || '0', 10);
        const current = parseInt(input.value, 10);
        const safeCurrent = Number.isNaN(current) ? min : current;
        input.value = String(clamp(safeCurrent + (dir * step)));
        input.focus();
      });
    });

    // Initialize
    normalize();
  });

  /* Demo submit */
  document.getElementById('ac-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = {};
    new FormData(e.target).forEach((value, key) => {
      if (key.endsWith('[]')) {
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(value);
      } else {
        data[key] = value;
      }
    });
    console.log('Submitted:', data);
    alert('Submitted! Check console for data.');
  });
});`;
}
