/**
 * Form AI Service
 *
 * Provides AI-powered form generation and editing using Vertex AI.
 * - PDF to Form conversion
 * - AI-assisted code editing
 * - Schema generation from code
 */

import { VertexAI } from '@google-cloud/vertexai';

// Initialize Vertex AI
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || 'anchor-hub-480305';
const location = process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_REGION || 'us-central1';
const modelId = process.env.VERTEX_MODEL || 'gemini-1.5-flash-001';

let vertexAI = null;
let generativeModel = null;

function getModel() {
  if (!generativeModel) {
    vertexAI = new VertexAI({
      project: projectId,
      location,
      googleAuthOptions: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      }
    });
    generativeModel = vertexAI.getGenerativeModel({ model: modelId });
  }
  return generativeModel;
}

/**
 * Convert PDF content to React form code
 */
export async function convertPDFToForm(pdfBuffer, options = {}) {
  const model = getModel();
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

    const result = await model.generateContent({
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
  const model = getModel();
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
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
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
  const model = getModel();

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
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
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
 * Default JS code template
 */
export function getDefaultJsCode() {
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
