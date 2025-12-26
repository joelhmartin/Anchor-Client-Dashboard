import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';

import MainCard from 'ui-component/cards/MainCard';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Checkbox from '@mui/material/Checkbox';
import RadioGroup from '@mui/material/RadioGroup';
import Radio from '@mui/material/Radio';
import FormHelperText from '@mui/material/FormHelperText';
import Paper from '@mui/material/Paper';

function sanitizePreviewCode(src) {
  const lines = String(src || '').split('\n');
  const withoutImports = lines.filter((l) => !l.trim().startsWith('import '));
  let code = withoutImports.join('\n');
  // Turn `export default function X` into `function FormComponent`
  code = code.replace(/export\s+default\s+function\s+\w+\s*\(/, 'function FormComponent(');
  // Turn `export default function(` into named component
  code = code.replace(/export\s+default\s+function\s*\(/, 'function FormComponent(');
  // Turn `export default` assignments into const
  code = code.replace(/export\s+default\s+/g, 'const FormComponent = ');
  return code;
}

function PreviewRenderer({ reactCode, cssCode }) {
  const [error, setError] = useState('');
  const [Component, setComponent] = useState(null);
  const toast = useToast();
  const lastToastRef = useRef('');

  useEffect(() => {
    if (!error) return;
    if (lastToastRef.current === error) return;
    lastToastRef.current = error;
    toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setError('');
        setComponent(null);

        if (!reactCode || !String(reactCode).trim()) {
          setComponent(() => () => (
            <Box sx={{ p: 2 }}>
              <Alert severity="info">No form code yet.</Alert>
            </Box>
          ));
          return;
        }

        // Whitelisted MUI components provided to the compiled function
        const mui = {
          Box,
          Stack,
          Grid,
          Typography,
          TextField,
          Button,
          Select,
          MenuItem,
          FormControl,
          InputLabel,
          Checkbox,
          FormControlLabel,
          RadioGroup,
          Radio,
          FormHelperText,
          Alert,
          Paper,
          Divider,
          Chip
        };

        // Compile JSX server-side using Vite's esbuild helper (CSP blocks CDN Babel).
        const resp = await fetch('/api/forms/preview/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ react_code: reactCode })
        });
        const payload = await resp.json();
        if (!resp.ok) throw new Error(payload?.detail || payload?.error || 'Failed to compile preview');

        const compiled = payload?.code || '';
        const factory = new Function(
          'ReactLib',
          'mui',
          `
            "use strict";
            const React = ReactLib;
            const { useState, useEffect, useMemo, useCallback } = React;
            const {
              Box, Stack, Grid, Typography, TextField, Button, Select, MenuItem,
              FormControl, InputLabel, Checkbox, FormControlLabel, RadioGroup, Radio,
              FormHelperText, Alert, Paper, Divider, Chip
            } = mui;
            ${compiled}
            return (typeof FormComponent !== "undefined" ? FormComponent : null);
          `
        );

        const Comp = factory(React, mui);
        if (!Comp) throw new Error('Preview failed: could not find a default-export component.');
        if (!cancelled) setComponent(() => Comp);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[forms-preview] compile error', e);
        if (!cancelled) setError(e?.message || 'Preview failed to compile');
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [reactCode]);

  return (
    <Box sx={{ position: 'relative' }}>
      {cssCode ? <style>{cssCode}</style> : null}
      <Alert severity="warning" sx={{ mb: 2 }}>
        Preview executes the current form code in your browser. This is admin-only tooling; don’t paste secrets here.
      </Alert>
      {/* Errors are toast-only */}
      {Component ? (
        <Component
          onSubmit={async (data) => {
            // Preview-only submit
            // eslint-disable-next-line no-alert
            alert(`Preview submit\\n\\n${JSON.stringify(data, null, 2)}`);
          }}
          attribution={{ preview: true }}
        />
      ) : (
        <Typography variant="body2" color="text.secondary">
          Rendering preview…
        </Typography>
      )}
    </Box>
  );
}

import {
  IconForms,
  IconCode,
  IconEye,
  IconUpload,
  IconDeviceFloppy,
  IconRocket,
  IconSettings,
  IconListCheck,
  IconRefresh,
  IconCopy,
  IconExternalLink,
  IconFileText,
  IconHeartHandshake,
  IconSparkles,
  IconMaximize,
  IconX,
  IconFileTypePdf,
  IconPrinter,
  IconDownload,
  IconArrowLeft,
  IconCalendar,
  IconWorld,
  IconMail,
  IconPhone
} from '@tabler/icons-react';

import {
  fetchForm,
  fetchForms,
  createVersion,
  publishVersion,
  updateForm,
  fetchSubmissions,
  uploadPDFForConversion,
  uploadPDFForDocAI,
  aiEditForm,
  generateSchema,
  fetchSubmission,
  generateSubmissionPDF,
  listSubmissionPDFs,
  getSubmissionPDFUrl
} from 'api/forms';
import { useToast } from 'contexts/ToastContext';

// Fallback default form code/CSS if none is returned from the API
const DEFAULT_REACT_FORM_CODE = `<!-- Advanced Floating Label Form (HTML) -->
<div class="ac-form-container">
  <h1 class="ac-form-title">Advanced Form</h1>

  <!-- IMPORTANT: keep data-anchor-form so the embed runtime can auto-submit -->
  <form id="ac-form" data-anchor-form novalidate>
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

const DEFAULT_CSS_CODE = `:root {
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

.ac-select-trigger:hover { border-color: var(--ac-color-border-hover); }

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

.ac-select-trigger.ac-active { border-color: var(--ac-color-primary); }
.ac-select-trigger.ac-active::after { transform: translateY(-50%) rotate(180deg); }

/* Placeholder appears only while open and empty, label floats then */
.ac-select-trigger::before { content: ""; color: var(--ac-color-text-light); }
.ac-select-trigger.ac-active:not(.ac-has-value)::before { content: "Select Country"; }

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

.ac-number-wrapper:focus-within { border-color: var(--ac-color-primary); }

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

.ac-number-input::-webkit-outer-spin-button,
.ac-number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.ac-number-input[type="number"] { -moz-appearance: textfield; }

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
  top: 2px;
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
}
`;

const DEFAULT_JS_CODE = `document.addEventListener('DOMContentLoaded', () => {
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

function looksLikeHtml(code) {
  const s = String(code || '').trim();
  if (!s) return false;
  if (s.startsWith('import ') || s.startsWith('export ')) return false;
  return s.startsWith('<') || /<\/?[a-zA-Z][\s\S]*>/.test(s);
}

function buildHtmlPreviewSrcDoc({ html, css, js }) {
  const safeCss = css || '';
  const safeJs = js || '';
  const bodyHtml = html || '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${safeCss}</style>
  </head>
  <body>
    ${bodyHtml}
    <script>
      // Minimal runtime helper for preview only
      window.AnchorFormsRuntime = {
        onReady: function(cb){ try{ cb({ formId: 'preview', attribution: { preview: true } }); } catch(e){} },
        submit: async function(payload){
          alert('Preview submit\\n\\n' + JSON.stringify(payload, null, 2));
        }
      };
      // Auto wire <form data-anchor-form> submits for preview
      (function(){
        const f = document.querySelector('form[data-anchor-form]');
        if (!f) return;
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(f);
          const payload = {};
          for (const [k,v] of fd.entries()) payload[k] = v;
          window.AnchorFormsRuntime.submit(payload);
        });
      })();
    </script>
    <script>${safeJs}</script>
  </body>
</html>`;
}

// =====================
// PANE COMPONENTS
// =====================

function HomePane({ forms, loading, onFormClick }) {
  const stats = useMemo(() => {
    const published = forms.filter((f) => f.status === 'published').length;
    const drafts = forms.filter((f) => f.status === 'draft').length;
    const totalSubmissions = forms.reduce((acc, f) => acc + (f.submission_count || 0), 0);
    return { total: forms.length, published, drafts, totalSubmissions };
  }, [forms]);

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Forms Dashboard</Typography>

      {/* Stats */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h3">{stats.total}</Typography>
              <Typography color="text.secondary">Total Forms</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" color="success.main">
                {stats.published}
              </Typography>
              <Typography color="text.secondary">Published</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" color="warning.main">
                {stats.drafts}
              </Typography>
              <Typography color="text.secondary">Drafts</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" color="info.main">
                {stats.totalSubmissions}
              </Typography>
              <Typography color="text.secondary">Submissions</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Forms */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent Forms
          </Typography>
          {loading ? (
            <CircularProgress size={24} />
          ) : forms.length === 0 ? (
            <Typography color="text.secondary">No forms yet. Create one from the sidebar.</Typography>
          ) : (
            <Stack spacing={1}>
              {forms.slice(0, 5).map((form) => (
                <Stack
                  key={form.id}
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'grey.100' } }}
                  onClick={() => onFormClick(form.id)}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    {form.form_type === 'intake' ? <IconHeartHandshake size={18} /> : <IconFileText size={18} />}
                    <Box>
                      <Typography variant="subtitle2">{form.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {form.submission_count || 0} submissions
                      </Typography>
                    </Box>
                  </Stack>
                  <Chip label={form.status} size="small" color={form.status === 'published' ? 'success' : 'default'} />
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

function BuilderPane({ formId, forms }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Code state
  const [reactCode, setReactCode] = useState('');
  const [cssCode, setCssCode] = useState('');
  const [jsCode, setJsCode] = useState('');
  const [schemaJson, setSchemaJson] = useState(null);
  const [schemaDirty, setSchemaDirty] = useState(false);
  const [codeTab, setCodeTab] = useState(0);
  const [printTab, setPrintTab] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [printHtml, setPrintHtml] = useState('');
  const [printCss, setPrintCss] = useState('');
  const [printJs, setPrintJs] = useState('');

  const runtimeMode = useMemo(() => {
    const fromSchema = schemaJson?.runtime_mode;
    if (fromSchema === 'html' || fromSchema === 'react') return fromSchema;
    return looksLikeHtml(reactCode) ? 'html' : 'react';
  }, [schemaJson, reactCode]);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0); // force re-render of preview
  // Resizable split between editor and preview (percent)
  const [splitPct, setSplitPct] = useState(55);
  const dragStateRef = useRef(null);

  // AI state
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [pdfInstructions, setPdfInstructions] = useState('');
  const [pdfUseDocAI, setPdfUseDocAI] = useState(true);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [aiEditTarget, setAiEditTarget] = useState('form'); // 'form' | 'print'
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiDiff, setAiDiff] = useState(null);

  // Printable template full editor pane
  const [printEditorOpen, setPrintEditorOpen] = useState(false);
  const [printEditorSplitPct, setPrintEditorSplitPct] = useState(55);
  const printDragRef = useRef(null);
  const [printPreviewNonce, setPrintPreviewNonce] = useState(0);

  const loadForm = useCallback(async () => {
    if (!formId) {
      setForm(null);
      setReactCode('');
      setCssCode('');
      setJsCode('');
      setHasChanges(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchForm(formId);
      setForm(data.form);
      // Prefer active version code; fall back to any code present; finally to defaults.
      setReactCode(data.form.active_react_code || data.form.react_code || DEFAULT_REACT_FORM_CODE);
      setCssCode(data.form.active_css_code || data.form.css_code || DEFAULT_CSS_CODE);
      setSchemaJson(data.form.active_schema || null);
      setJsCode(data.form.active_schema?.js_code || DEFAULT_JS_CODE);
      const printable = data.form.active_schema?.printable || null;
      setPrintHtml(printable?.html || '');
      setPrintCss(printable?.css || '');
      setPrintJs(printable?.js || '');
      setSchemaDirty(false);
      setHasChanges(false);
    } catch (err) {
      console.error('Error loading form:', err);
      toast.error('Failed to load form');
      setForm(null);
      setReactCode(DEFAULT_REACT_FORM_CODE);
      setCssCode(DEFAULT_CSS_CODE);
      setSchemaJson(null);
      setJsCode(DEFAULT_JS_CODE);
      setPrintHtml('');
      setPrintCss('');
      setPrintJs('');
      setSchemaDirty(false);
    } finally {
      setLoading(false);
    }
  }, [formId]); // toast intentionally omitted to keep stable and avoid refetch loops

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const handleSave = async () => {
    if (!form) return;

    try {
      setSaving(true);
      await createVersion(form.id, {
        react_code: reactCode,
        css_code: cssCode,
        schema_json: {
          ...(schemaJson || {}),
          runtime_mode: runtimeMode,
          js_code: runtimeMode === 'html' ? jsCode : schemaJson?.js_code || '',
          printable: {
            html: printHtml || '',
            css: printCss || '',
            js: printJs || ''
          }
        }
      });
      toast.success('Draft saved');
      setHasChanges(false);
      setSchemaDirty(false);
      loadForm();
    } catch (err) {
      console.error('Error saving:', err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateSchema = async () => {
    if (!form) return;
    try {
      setAiProcessing(true);
      const result = await generateSchema(form.id, reactCode);
      const schema = result?.schema || null;
      setSchemaJson(schema);
      setSchemaDirty(true);
      toast.success('Schema generated');
    } catch (err) {
      console.error('Error generating schema:', err);
      toast.error('Failed to generate schema');
    } finally {
      setAiProcessing(false);
    }
  };

  const handlePublish = async () => {
    if (!form) return;

    try {
      setPublishing(true);
      if (runtimeMode === 'html') {
        // HTML embeds don't require schema generation. Save a new version so js_code is persisted.
        await createVersion(form.id, {
          react_code: reactCode,
          css_code: cssCode,
          schema_json: {
            ...(schemaJson || {}),
            runtime_mode: 'html',
            js_code: jsCode,
            printable: {
              html: printHtml || '',
              css: printCss || '',
              js: printJs || ''
            }
          }
        });
        setHasChanges(false);
        setSchemaDirty(false);
      } else {
        let schemaToUse = schemaJson;
        const hasFields = Array.isArray(schemaToUse?.fields) && schemaToUse.fields.length > 0;

        // Ensure we have schema so the embed runtime can render.
        if (!hasFields) {
          const result = await generateSchema(form.id, reactCode);
          schemaToUse = result?.schema || schemaToUse;
          setSchemaJson(schemaToUse || null);
          setSchemaDirty(true);
        }

        // Save a new version if code changed OR schema changed/was missing.
        if (hasChanges || schemaDirty || !hasFields) {
          await createVersion(form.id, {
            react_code: reactCode,
            css_code: cssCode,
            schema_json: {
              ...(schemaToUse || {}),
              runtime_mode: 'react',
              js_code: schemaJson?.js_code || ''
            }
          });
          setHasChanges(false);
          setSchemaDirty(false);
        }
      }

      // Get the active version and publish it
      const data = await fetchForm(form.id);
      if (data.form.active_version_id) {
        await publishVersion(form.id, data.form.active_version_id);
      }
      toast.success('Form published!');
      loadForm();
    } catch (err) {
      console.error('Error publishing:', err);
      toast.error('Failed to publish');
    } finally {
      setPublishing(false);
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !form) return;

    try {
      setAiProcessing(true);
      const result = pdfUseDocAI
        ? await uploadPDFForDocAI(form.id, file, pdfInstructions)
        : await uploadPDFForConversion(form.id, file, pdfInstructions);

      setReactCode(result.react_code);
      setCssCode(result.css_code || '');

      // If DocAI returned a canonical schema, store it under schema_json.docai_schema
      if (result.schema) {
        const nextSchema = pdfUseDocAI
          ? {
              ...(schemaJson || {}),
              runtime_mode: 'html',
              docai_schema: result.schema
            }
          : result.schema;
        setSchemaJson(nextSchema);
        setSchemaDirty(true);
        if (result.schema?.js_code) setJsCode(result.schema.js_code);
      }
      setHasChanges(true);
      setPdfUploadOpen(false);
      setPdfInstructions('');
      toast.success('PDF converted to form!');
    } catch (err) {
      console.error('Error converting PDF:', err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to convert PDF';
      toast.error(msg);
    } finally {
      setAiProcessing(false);
    }
  };

  const handleAiEdit = async () => {
    if (!aiInstruction.trim() || !form) return;

    try {
      setAiProcessing(true);
      const getFieldNames = () => {
        const names = new Set();
        const docai = schemaJson?.docai_schema;
        const docaiFields = Array.isArray(docai?.fields) ? docai.fields : [];
        docaiFields.forEach((f) => f?.name && names.add(String(f.name)));
        const schemaFields = Array.isArray(schemaJson?.fields) ? schemaJson.fields : [];
        schemaFields.forEach((f) => f?.name && names.add(String(f.name)));
        const html = String(reactCode || '');
        const matches = html.matchAll(/\bname\s*=\s*["']([^"']+)["']/g);
        for (const m of matches) {
          if (m?.[1]) names.add(m[1]);
        }
        return Array.from(names).slice(0, 200);
      };

      const fieldNames = getFieldNames();
      const instructionWithContext =
        aiEditTarget === 'print'
          ? `PRINT TEMPLATE EDIT.\nAvailable submission fields (use as {{field_name}} placeholders):\n${fieldNames.join(
              ', '
            )}\n\nInstruction:\n${aiInstruction}`
          : aiInstruction;

      const result = await aiEditForm(form.id, {
        instruction: instructionWithContext,
        current_code: aiEditTarget === 'print' ? printHtml : reactCode,
        current_css: aiEditTarget === 'print' ? printCss : cssCode,
        current_js: aiEditTarget === 'print' ? printJs : jsCode
      });
      setAiDiff({
        newCode: result.react_code,
        newCss: result.css_code,
        newJs: result.js_code,
        changes: result.changes_made,
        explanation: result.explanation
      });
    } catch (err) {
      console.error('Error with AI edit:', err);
      toast.error('AI edit failed');
    } finally {
      setAiProcessing(false);
    }
  };

  const applyAiChanges = () => {
    if (!aiDiff) return;
    if (aiEditTarget === 'print') {
      setPrintHtml(aiDiff.newCode);
      setPrintCss(aiDiff.newCss || '');
      if (typeof aiDiff.newJs === 'string') setPrintJs(aiDiff.newJs);
    } else {
      setReactCode(aiDiff.newCode);
      setCssCode(aiDiff.newCss || '');
      if (typeof aiDiff.newJs === 'string') setJsCode(aiDiff.newJs);
    }
    setHasChanges(true);
    setAiDiff(null);
    setAiEditOpen(false);
    setAiInstruction('');
    setAiEditTarget('form');
    toast.success('AI changes applied');
  };

  const discardAiChanges = () => {
    setAiDiff(null);
  };

  // Generate preview HTML for iframe
  const refreshPreview = () => {
    setPreviewNonce((k) => k + 1);
  };

  const refreshPrintPreview = () => {
    setPrintPreviewNonce((k) => k + 1);
  };

  const onPrintDragStart = (e) => {
    e.preventDefault();
    printDragRef.current = { startX: e.clientX, startPct: printEditorSplitPct };
    window.addEventListener('mousemove', onPrintDragMove);
    window.addEventListener('mouseup', onPrintDragEnd);
  };

  const onPrintDragMove = (e) => {
    if (!printDragRef.current) return;
    const deltaX = e.clientX - printDragRef.current.startX;
    const deltaPct = (deltaX / window.innerWidth) * 100;
    const nextPct = Math.min(75, Math.max(25, printDragRef.current.startPct + deltaPct));
    setPrintEditorSplitPct(nextPct);
  };

  const onPrintDragEnd = () => {
    printDragRef.current = null;
    window.removeEventListener('mousemove', onPrintDragMove);
    window.removeEventListener('mouseup', onPrintDragEnd);
  };

  const getFieldNamesForPrint = useCallback(() => {
    const names = new Set();
    const docai = schemaJson?.docai_schema;
    const docaiFields = Array.isArray(docai?.fields) ? docai.fields : [];
    docaiFields.forEach((f) => f?.name && names.add(String(f.name)));
    const schemaFields = Array.isArray(schemaJson?.fields) ? schemaJson.fields : [];
    schemaFields.forEach((f) => f?.name && names.add(String(f.name)));
    const html = String(reactCode || '');
    const matches = html.matchAll(/\bname\s*=\s*["']([^"']+)["']/g);
    for (const m of matches) {
      if (m?.[1]) names.add(m[1]);
    }
    return Array.from(names).slice(0, 200);
  }, [schemaJson, reactCode]);

  const buildPrintablePreviewSrcDoc = useCallback(() => {
    const sample = {};
    for (const name of getFieldNamesForPrint()) {
      sample[name] = name.replace(/_/g, ' ').toUpperCase();
    }
    const html = String(printHtml || '').trim() || `<div style="font-family: system-ui; padding: 16px;">No printable template yet.</div>`;
    const css = String(printCss || '');
    const js = String(printJs || '');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${css}</style>
    <style>@media print { .no-print { display:none !important; } }</style>
  </head>
  <body>
    <div class="no-print" style="padding:8px 12px; font-family: system-ui; font-size: 12px; color: #666;">
      <button onclick="window.print()">Print</button>
    </div>
    ${html}
    <script>
      window.__ANCHOR_SUBMISSION__ = ${JSON.stringify(sample)};
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
          var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          var node;
          while((node = walker.nextNode())){
            if (node.nodeValue && node.nodeValue.indexOf('{{') !== -1) node.nodeValue = apply(node.nodeValue);
          }
        } catch(e){}
      })();
    </script>
    <script>${js}</script>
  </body>
</html>`;
  }, [printHtml, printCss, printJs, getFieldNamesForPrint]);

  // Resizable splitter handlers
  const onDragStart = (e) => {
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startPct: splitPct };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  };

  const onDragMove = (e) => {
    if (!dragStateRef.current) return;
    const deltaX = e.clientX - dragStateRef.current.startX;
    // assume container ~1000px; compute new pct based on delta over window width
    const deltaPct = (deltaX / window.innerWidth) * 100;
    const nextPct = Math.min(75, Math.max(25, dragStateRef.current.startPct + deltaPct));
    setSplitPct(nextPct);
  };

  const onDragEnd = () => {
    dragStateRef.current = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  };

  const copyEmbedCode = () => {
    if (!form) return;
    // IMPORTANT:
    // - When embedding on a real website (https), you must use an https origin that serves the embed script.
    // - Using localhost here will fail on https sites (mixed content / TLS errors).
    // Provide an override via VITE_FORMS_EMBED_ORIGIN; otherwise fall back to current origin.
    const embedOrigin = import.meta.env.VITE_FORMS_EMBED_ORIGIN || window.location.origin;
    const code = `<script src="${embedOrigin}/embed/script/embed.js"></script>
<div id="anchor-form-${form.id}"></div>
<script>AnchorForms.embed('${form.id}', 'anchor-form-${form.id}');</script>`;
    navigator.clipboard.writeText(code);
    toast.success('Embed code copied!');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!form) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <IconCode size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
        <Typography color="text.secondary">Select a form from the sidebar to edit</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h5">{form.name}</Typography>
          <Chip
            label={form.form_type === 'intake' ? 'PHI' : 'Conversion'}
            size="small"
            color={form.form_type === 'intake' ? 'warning' : 'default'}
          />
          <Chip label={form.status} size="small" color={form.status === 'published' ? 'success' : 'default'} />
          {hasChanges && <Chip label="Unsaved" size="small" color="error" variant="outlined" />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<IconUpload size={16} />} onClick={() => setPdfUploadOpen(true)}>
            PDF to Form
          </Button>
          <Button
            variant="outlined"
            startIcon={<IconPrinter size={16} />}
            onClick={() => {
              setPrintEditorOpen(true);
              refreshPrintPreview();
            }}
          >
            Edit Printable Template
          </Button>
          <Button
            variant="outlined"
            startIcon={<IconSparkles size={16} />}
            onClick={() => {
              setAiEditTarget('form');
              setAiEditOpen(true);
            }}
          >
            AI Assist
          </Button>
          <Button
            variant="outlined"
            startIcon={<IconSparkles size={16} />}
            onClick={() => {
              setAiEditTarget('print');
              setAiEditOpen(true);
            }}
          >
            AI Assist (Print)
          </Button>
          {runtimeMode !== 'html' ? (
            <Button
              variant="outlined"
              startIcon={aiProcessing ? <CircularProgress size={16} /> : <IconListCheck size={16} />}
              onClick={handleGenerateSchema}
              disabled={aiProcessing || publishing || saving}
            >
              Generate Schema
            </Button>
          ) : null}
          <Button
            variant="outlined"
            startIcon={saving ? <CircularProgress size={16} /> : <IconDeviceFloppy size={16} />}
            onClick={handleSave}
            disabled={saving || (!hasChanges && !schemaDirty)}
          >
            Save Draft
          </Button>
          <Button
            variant="contained"
            startIcon={publishing ? <CircularProgress size={16} /> : <IconRocket size={16} />}
            onClick={handlePublish}
            disabled={publishing}
          >
            Publish
          </Button>
        </Stack>
      </Stack>

      {/* Editor and Preview Split */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: 1,
          alignItems: 'stretch',
          height: 'calc(100vh - 260px)'
        }}
      >
        {/* Code Editor Panel */}
        <Card
          sx={{
            flexBasis: `${splitPct}%`,
            minWidth: '25%',
            maxWidth: '75%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={codeTab} onChange={(e, v) => setCodeTab(v)}>
              <Tab label={runtimeMode === 'html' ? 'HTML' : 'React + MUI'} />
              <Tab label="CSS" />
              <Tab label="JS" />
            </Tabs>
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 400 }}>
            {codeTab === 0 ? (
              <Editor
                height="100%"
                defaultLanguage="javascript"
                language={runtimeMode === 'html' ? 'html' : 'javascript'}
                value={reactCode}
                onChange={(value) => {
                  setReactCode(value || '');
                  setHasChanges(true);
                }}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  folding: true,
                  formatOnPaste: true,
                  formatOnType: true
                }}
              />
            ) : codeTab === 1 ? (
              <Editor
                height="100%"
                defaultLanguage="css"
                language="css"
                value={cssCode}
                onChange={(value) => {
                  setCssCode(value || '');
                  setHasChanges(true);
                }}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on'
                }}
              />
            ) : (
              <Editor
                height="100%"
                defaultLanguage="javascript"
                language="javascript"
                value={jsCode}
                onChange={(value) => {
                  setJsCode(value || '');
                  setHasChanges(true);
                }}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on'
                }}
              />
            )}
          </Box>
        </Card>

        {/* Drag handle */}
        <Box
          sx={{
            width: '6px',
            cursor: 'col-resize',
            bgcolor: 'divider',
            borderRadius: 1,
            flexShrink: 0
          }}
          onMouseDown={onDragStart}
          title="Drag to resize"
        />

        {/* Preview Panel (in-page render for dev; no iframe) */}
        <Card
          sx={{
            flex: 1,
            minWidth: '25%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <IconEye size={18} />
              <Typography variant="subtitle2">Live Preview</Typography>
            </Stack>
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Refresh Preview">
                <IconButton size="small" onClick={refreshPreview}>
                  <IconRefresh size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Fullscreen Preview">
                <IconButton size="small" onClick={() => setPreviewOpen(true)}>
                  <IconMaximize size={16} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
          <Box sx={{ flex: 1, overflow: 'auto', bgcolor: 'grey.50', p: 2 }}>
            {runtimeMode === 'html' ? (
              <iframe
                key={`html-preview-${previewNonce}`}
                title="HTML Preview"
                sandbox="allow-scripts allow-forms allow-same-origin"
                style={{ width: '100%', height: '100%', border: 'none', background: '#fff', borderRadius: 8 }}
                srcDoc={buildHtmlPreviewSrcDoc({ html: reactCode, css: cssCode, js: jsCode })}
              />
            ) : (
              <PreviewRenderer key={previewNonce} reactCode={reactCode} cssCode={cssCode} />
            )}
          </Box>
        </Card>
      </Box>

      {/* Printable Template Editor Pane */}
      <Dialog open={printEditorOpen} onClose={() => setPrintEditorOpen(false)} fullScreen>
        <DialogTitle sx={{ pr: 1 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1}>
              <IconPrinter size={20} />
              <Typography variant="h6">Printable Template</Typography>
              {hasChanges && <Chip label="Unsaved" size="small" color="error" variant="outlined" />}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="outlined"
                startIcon={<IconSparkles size={16} />}
                onClick={() => {
                  setAiEditTarget('print');
                  setAiEditOpen(true);
                }}
              >
                AI Assist
              </Button>
              <Button variant="outlined" startIcon={<IconDeviceFloppy size={16} />} onClick={handleSave} disabled={saving}>
                Save Draft
              </Button>
              <Button variant="contained" startIcon={<IconRocket size={16} />} onClick={handlePublish} disabled={publishing}>
                Publish
              </Button>
              <IconButton onClick={() => setPrintEditorOpen(false)} title="Close">
                <IconX size={20} />
              </IconButton>
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
            <Card
              sx={{
                flexBasis: `${printEditorSplitPct}%`,
                minWidth: '25%',
                maxWidth: '75%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 0
              }}
            >
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={printTab} onChange={(_e, v) => setPrintTab(v)}>
                  <Tab label="HTML" />
                  <Tab label="CSS" />
                  <Tab label="JS" />
                </Tabs>
              </Box>
              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {printTab === 0 ? (
                  <Editor
                    height="100%"
                    language="html"
                    value={printHtml}
                    onChange={(value) => {
                      setPrintHtml(value || '');
                      setHasChanges(true);
                    }}
                    theme="vs-dark"
                    options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true, wordWrap: 'on' }}
                  />
                ) : printTab === 1 ? (
                  <Editor
                    height="100%"
                    language="css"
                    value={printCss}
                    onChange={(value) => {
                      setPrintCss(value || '');
                      setHasChanges(true);
                    }}
                    theme="vs-dark"
                    options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true, wordWrap: 'on' }}
                  />
                ) : (
                  <Editor
                    height="100%"
                    language="javascript"
                    value={printJs}
                    onChange={(value) => {
                      setPrintJs(value || '');
                      setHasChanges(true);
                    }}
                    theme="vs-dark"
                    options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true, wordWrap: 'on' }}
                  />
                )}
              </Box>
            </Card>

            <Box
              sx={{ width: '6px', cursor: 'col-resize', bgcolor: 'divider', borderRadius: 1, flexShrink: 0 }}
              onMouseDown={onPrintDragStart}
              title="Drag to resize"
            />

            <Card sx={{ flex: 1, borderRadius: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <IconEye size={18} />
                  <Typography variant="subtitle2">Print Preview (sample data)</Typography>
                </Stack>
                <Button variant="outlined" size="small" onClick={refreshPrintPreview}>
                  Refresh
                </Button>
              </Stack>
              <Box sx={{ flex: 1, overflow: 'hidden', bgcolor: 'grey.50' }}>
                <iframe
                  key={`print-preview-${printPreviewNonce}`}
                  title="Printable template preview"
                  sandbox="allow-scripts allow-same-origin"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                  srcDoc={buildPrintablePreviewSrcDoc()}
                />
              </Box>
            </Card>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Embed Code Section */}
      {form.status === 'published' && (
        <Card sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack>
              <Typography variant="subtitle2">Embed Code</Typography>
              <Typography variant="caption" color="text.secondary">
                Add this script to your website to embed this form
              </Typography>
            </Stack>
            <Button startIcon={<IconCopy size={16} />} onClick={copyEmbedCode}>
              Copy Code
            </Button>
          </Stack>
        </Card>
      )}

      {/* Fullscreen Preview Dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '90vh' } }}>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography>Form Preview: {form.name}</Typography>
              <Chip
                label={form.form_type === 'intake' ? 'PHI' : 'Conversion'}
                size="small"
                color={form.form_type === 'intake' ? 'warning' : 'default'}
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Refresh">
                <IconButton onClick={refreshPreview}>
                  <IconRefresh size={18} />
                </IconButton>
              </Tooltip>
              <IconButton onClick={() => setPreviewOpen(false)}>
                <IconX size={20} />
              </IconButton>
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, overflow: 'hidden' }}>
          <Box sx={{ width: '100%', height: '100%', overflow: 'auto', bgcolor: 'grey.50', p: 2 }}>
            {runtimeMode === 'html' ? (
              <iframe
                key={`html-preview-fullscreen-${previewNonce}`}
                title="HTML Preview Fullscreen"
                sandbox="allow-scripts allow-forms allow-same-origin"
                style={{ width: '100%', height: '100%', border: 'none', background: '#fff', borderRadius: 8 }}
                srcDoc={buildHtmlPreviewSrcDoc({ html: reactCode, css: cssCode, js: jsCode })}
              />
            ) : (
              <PreviewRenderer key={`fullscreen-${previewNonce}`} reactCode={reactCode} cssCode={cssCode} />
            )}
          </Box>
        </DialogContent>
      </Dialog>

      {/* PDF Upload Dialog */}
      <Dialog open={pdfUploadOpen} onClose={() => !aiProcessing && setPdfUploadOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconUpload size={20} />
            <Typography>Convert PDF to Form</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">Upload a PDF document and it will be converted into an editable digital form.</Alert>
            <FormControlLabel
              control={<Checkbox checked={pdfUseDocAI} onChange={(e) => setPdfUseDocAI(e.target.checked)} />}
              label="Use Document AI (recommended)"
            />
            <TextField
              label="Instructions (optional)"
              value={pdfInstructions}
              onChange={(e) => setPdfInstructions(e.target.value)}
              placeholder="e.g. Keep wording the same, make name/email required, add sections per page, preserve checkbox/radio groups..."
              multiline
              minRows={3}
              fullWidth
              disabled={aiProcessing}
            />
            <Box
              sx={{
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                bgcolor: 'grey.50'
              }}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={handlePdfUpload}
                style={{ display: 'none' }}
                id="pdf-upload-input"
                disabled={aiProcessing}
              />
              <label htmlFor="pdf-upload-input">
                <Button
                  variant="outlined"
                  component="span"
                  startIcon={aiProcessing ? <CircularProgress size={16} /> : <IconUpload size={16} />}
                  disabled={aiProcessing}
                >
                  {aiProcessing ? 'Processing PDF...' : 'Choose PDF File'}
                </Button>
              </label>
              <Typography variant="caption" display="block" sx={{ mt: 1 }} color="text.secondary">
                Max file size: 10MB
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPdfUploadOpen(false)} disabled={aiProcessing}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* AI Edit Dialog */}
      <Dialog open={aiEditOpen} onClose={() => !aiProcessing && setAiEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconSparkles size={20} />
            <Typography>AI-Assisted Editing{aiEditTarget === 'print' ? ' (Print Template)' : ''}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!aiDiff ? (
              <>
                <Alert severity="info">
                  Describe what changes you want to make. The AI will modify your form code and show you a preview before applying.
                </Alert>
                <TextField
                  label="What would you like to change?"
                  placeholder="e.g., Make the form two columns on desktop, add a date picker for appointment date, improve the validation messages..."
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  multiline
                  rows={3}
                  fullWidth
                  disabled={aiProcessing}
                />
                <Stack direction="row" justifyContent="flex-end">
                  <Button
                    variant="contained"
                    startIcon={aiProcessing ? <CircularProgress size={16} /> : <IconSparkles size={16} />}
                    onClick={handleAiEdit}
                    disabled={aiProcessing || !aiInstruction.trim()}
                  >
                    {aiProcessing ? 'Processing...' : 'Generate Changes'}
                  </Button>
                </Stack>
              </>
            ) : (
              <>
                <Alert severity="success">
                  <Typography variant="subtitle2">AI Changes Ready</Typography>
                  <Typography variant="body2">{aiDiff.explanation}</Typography>
                </Alert>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Changes Made:
                  </Typography>
                  <Stack component="ul" spacing={0.5} sx={{ pl: 2, m: 0 }}>
                    {aiDiff.changes?.map((change, i) => (
                      <li key={i}>
                        <Typography variant="body2">{change}</Typography>
                      </li>
                    ))}
                  </Stack>
                </Box>
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button variant="outlined" onClick={discardAiChanges}>
                    Discard
                  </Button>
                  <Button variant="contained" color="success" onClick={applyAiChanges}>
                    Apply Changes
                  </Button>
                </Stack>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAiEditOpen(false);
              setAiDiff(null);
              setAiInstruction('');
            }}
            disabled={aiProcessing}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function SubmissionsPane({ formId, forms }) {
  const toast = useToast();
  const [selectedFormId, setSelectedFormId] = useState(formId || '');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  // Detail view state
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfs, setPdfs] = useState([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const loadSubmissions = useCallback(async () => {
    if (!selectedFormId) return;

    try {
      setLoading(true);
      const data = await fetchSubmissions(selectedFormId);
      setSubmissions(data.submissions || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Error loading submissions:', err);
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [selectedFormId, toast]);

  useEffect(() => {
    if (formId) {
      setSelectedFormId(formId);
    }
  }, [formId]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const handleViewSubmission = async (sub) => {
    try {
      setDetailLoading(true);
      const data = await fetchSubmission(selectedFormId, sub.id);
      setSelectedSubmission(data.submission);

      // Load PDFs
      const pdfData = await listSubmissionPDFs(selectedFormId, sub.id);
      setPdfs(pdfData.pdfs || []);
    } catch (err) {
      console.error('Error loading submission:', err);
      toast.error('Failed to load submission details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!selectedSubmission) return;

    try {
      setGeneratingPdf(true);
      await generateSubmissionPDF(selectedFormId, selectedSubmission.id);
      toast.success('PDF generated successfully');

      // Reload PDFs
      const pdfData = await listSubmissionPDFs(selectedFormId, selectedSubmission.id);
      setPdfs(pdfData.pdfs || []);
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    if (!selectedSubmissionId) return;
    const url = `/api/forms/${selectedFormId}/submissions/${selectedSubmissionId}/print?autoprint=1`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleBack = () => {
    setSelectedSubmission(null);
    setPdfs([]);
  };

  // Detail View
  if (selectedSubmission) {
    const sub = selectedSubmission;
    const payload = sub.payload || sub.non_phi_payload || {};
    const attribution = sub.attribution_json || {};
    const isIntake = sub.form_type === 'intake';

    return (
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={2}>
            <IconButton onClick={handleBack}>
              <IconArrowLeft size={20} />
            </IconButton>
            <Box>
              <Typography variant="h5">Submission Details</Typography>
              <Typography variant="caption" color="text.secondary">
                ID: {sub.id}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<IconPrinter size={16} />} onClick={handlePrint}>
              Print
            </Button>
            <Button
              variant="outlined"
              startIcon={generatingPdf ? <CircularProgress size={16} /> : <IconFileTypePdf size={16} />}
              onClick={handleGeneratePDF}
              disabled={generatingPdf}
            >
              {generatingPdf ? 'Generating...' : 'Generate PDF'}
            </Button>
          </Stack>
        </Stack>

        {/* Submission Info */}
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Submission Data
                </Typography>
                {isIntake && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    This submission contains Protected Health Information (PHI)
                  </Alert>
                )}
                <Divider sx={{ mb: 2 }} />

                {Object.keys(payload).length === 0 ? (
                  <Typography color="text.secondary">No data available</Typography>
                ) : (
                  <Stack spacing={2}>
                    {Object.entries(payload).map(([key, value]) => (
                      <Box key={key}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                          {key.replace(/_/g, ' ')}
                        </Typography>
                        <Typography variant="body1">
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || '-')}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={2}>
              {/* Meta Info */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Submission Info
                  </Typography>
                  <Stack spacing={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <IconCalendar size={16} />
                      <Typography variant="body2">{new Date(sub.created_at).toLocaleString()}</Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Chip label={sub.submission_kind} size="small" color={isIntake ? 'warning' : 'default'} />
                      <Typography variant="caption" color="text.secondary">
                        v{sub.version_number}
                      </Typography>
                    </Stack>
                    {sub.embed_domain && (
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <IconWorld size={16} />
                        <Typography variant="body2">{sub.embed_domain}</Typography>
                      </Stack>
                    )}
                    <Divider />
                    <Stack direction="row" spacing={1}>
                      {sub.ctm_sent && <Chip label="CTM Sent" size="small" color="success" />}
                      {sub.email_sent && <Chip label="Email Sent" size="small" color="info" />}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              {/* Attribution */}
              {Object.keys(attribution).length > 0 && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Attribution
                    </Typography>
                    <Stack spacing={1}>
                      {attribution.utms &&
                        Object.entries(attribution.utms).map(
                          ([key, value]) =>
                            value && (
                              <Box key={key}>
                                <Typography variant="caption" color="text.secondary">
                                  {key}
                                </Typography>
                                <Typography variant="body2">{value}</Typography>
                              </Box>
                            )
                        )}
                      {attribution.referrer && (
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Referrer
                          </Typography>
                          <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                            {attribution.referrer}
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              )}

              {/* PDFs */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Generated PDFs
                  </Typography>
                  {pdfs.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No PDFs generated yet
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {pdfs.map((pdf) => (
                        <Stack
                          key={pdf.id}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ p: 1, bgcolor: 'grey.50', borderRadius: 1 }}
                        >
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <IconFileTypePdf size={16} />
                            <Box>
                              <Typography variant="body2">{pdf.file_name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {new Date(pdf.generated_at).toLocaleString()}
                              </Typography>
                            </Box>
                          </Stack>
                          <IconButton size="small" component="a" href={getSubmissionPDFUrl(selectedFormId, sub.id, pdf.id)} download>
                            <IconDownload size={16} />
                          </IconButton>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      </Stack>
    );
  }

  // List View
  return (
    <Stack spacing={2}>
      {/* Form Selector */}
      <Stack direction="row" alignItems="center" spacing={2}>
        <TextField
          select
          label="Select Form"
          value={selectedFormId}
          onChange={(e) => setSelectedFormId(e.target.value)}
          sx={{ minWidth: 300 }}
          size="small"
          slotProps={{ select: { native: true } }}
        >
          <option value="">-- Select a form --</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </TextField>
        <Button variant="outlined" startIcon={<IconRefresh size={16} />} onClick={loadSubmissions} disabled={!selectedFormId || loading}>
          Refresh
        </Button>
      </Stack>

      {/* Submissions List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : !selectedFormId ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <IconListCheck size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <Typography color="text.secondary">Select a form to view its submissions</Typography>
        </Box>
      ) : submissions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <IconListCheck size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <Typography color="text.secondary">No submissions yet for this form</Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          <Typography variant="subtitle2" color="text.secondary">
            {total} total submissions
          </Typography>
          {submissions.map((sub) => (
            <Card
              key={sub.id}
              onClick={() => handleViewSubmission(sub)}
              sx={{
                p: 2,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { bgcolor: 'grey.50', transform: 'translateX(4px)' }
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack>
                  <Typography variant="subtitle2">Submission #{sub.id.slice(0, 8)}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label={sub.submission_kind} size="small" color={sub.submission_kind === 'intake' ? 'warning' : 'default'} />
                    {sub.ctm_sent && <Chip label="CTM Sent" size="small" color="success" variant="outlined" />}
                    {sub.email_sent && <Chip label="Email Sent" size="small" color="info" variant="outlined" />}
                  </Stack>
                </Stack>
                <Stack alignItems="flex-end">
                  <Typography variant="caption" color="text.secondary">
                    {new Date(sub.created_at).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    v{sub.version_number} • {sub.embed_domain || 'Direct'}
                  </Typography>
                </Stack>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      {/* Loading overlay for detail view */}
      {detailLoading && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(255,255,255,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <CircularProgress />
        </Box>
      )}
    </Stack>
  );
}

function SettingsPane({ formId }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});

  const loadForm = useCallback(async () => {
    if (!formId) return;

    try {
      setLoading(true);
      const data = await fetchForm(formId);
      setForm(data.form);
      setSettings(data.form.settings_json || {});
    } catch (err) {
      console.error('Error loading form:', err);
      toast.error('Failed to load form settings');
    } finally {
      setLoading(false);
    }
  }, [formId, toast]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const handleSave = async () => {
    if (!form) return;

    try {
      setSaving(true);
      await updateForm(form.id, { settings_json: settings });
      toast.success('Settings saved');
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!formId) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <IconSettings size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
        <Typography color="text.secondary">Select a form from the sidebar to configure</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">Form Settings</Typography>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : <IconDeviceFloppy size={16} />}
        >
          Save Settings
        </Button>
      </Stack>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Email Notifications
          </Typography>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.email_on_submission !== false}
                  onChange={(e) => updateSetting('email_on_submission', e.target.checked)}
                />
              }
              label="Send email notification on submission"
            />
            <TextField
              label="Email Recipients"
              placeholder="email1@example.com, email2@example.com"
              value={(settings.email_recipients || []).join(', ')}
              onChange={(e) =>
                updateSetting(
                  'email_recipients',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              helperText="Comma-separated list of email addresses"
              fullWidth
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            CTM Integration
          </Typography>
          <Stack spacing={2}>
            <FormControlLabel
              control={<Switch checked={settings.ctm_enabled || false} onChange={(e) => updateSetting('ctm_enabled', e.target.checked)} />}
              label="Enable CTM integration"
            />
            {settings.ctm_enabled && (
              <>
                <TextField
                  label="CTM Conversion Action ID"
                  value={settings.ctm_conversion_action_id || ''}
                  onChange={(e) => updateSetting('ctm_conversion_action_id', e.target.value)}
                  fullWidth
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.ctm_five_star_enabled || false}
                      onChange={(e) => updateSetting('ctm_five_star_enabled', e.target.checked)}
                    />
                  }
                  label="Mark intake submissions as five-star leads"
                />
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Save & Resume
          </Typography>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.save_and_resume_enabled || false}
                  onChange={(e) => updateSetting('save_and_resume_enabled', e.target.checked)}
                />
              }
              label="Allow users to save and resume later"
            />
            {settings.save_and_resume_enabled && (
              <TextField
                label="Resume Link Expiration (hours)"
                type="number"
                value={settings.resume_token_ttl_hours || 72}
                onChange={(e) => updateSetting('resume_token_ttl_hours', parseInt(e.target.value, 10))}
                InputProps={{ inputProps: { min: 1, max: 720 } }}
              />
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Embed Settings
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Domain Allowlist"
              placeholder="example.com, subdomain.example.com"
              value={(settings.domain_allowlist || []).join(', ')}
              onChange={(e) =>
                updateSetting(
                  'domain_allowlist',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              helperText="Leave empty to allow all domains. Comma-separated list of allowed domains."
              fullWidth
            />
            <TextField
              label="Thank You Message"
              value={settings.custom_thank_you_message || ''}
              onChange={(e) => updateSetting('custom_thank_you_message', e.target.value)}
              placeholder="Thank you for your submission!"
              fullWidth
            />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

// =====================
// MAIN COMPONENT
// =====================

export default function FormsManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const pane = searchParams.get('pane') || 'home';
  const formId = searchParams.get('form') || '';

  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadForms();
  }, []);

  const loadForms = async () => {
    try {
      setLoading(true);
      const data = await fetchForms();
      setForms(data.forms || []);
    } catch (err) {
      console.error('Error loading forms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFormClick = (id) => {
    setSearchParams({ pane: 'builder', form: id });
  };

  const renderPane = () => {
    switch (pane) {
      case 'builder':
        return <BuilderPane formId={formId} forms={forms} />;
      case 'submissions':
        return <SubmissionsPane formId={formId} forms={forms} />;
      case 'settings':
        return <SettingsPane formId={formId} />;
      default:
        return <HomePane forms={forms} loading={loading} onFormClick={handleFormClick} />;
    }
  };

  return <MainCard sx={{ minHeight: 'calc(100vh - 88px)' }}>{renderPane()}</MainCard>;
}
