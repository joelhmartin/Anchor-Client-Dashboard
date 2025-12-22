import client from './client';

// =====================
// FORMS CRUD
// =====================

export function fetchForms() {
  return client.get('/forms').then((res) => res.data);
}

export function fetchForm(id) {
  return client.get(`/forms/${id}`).then((res) => res.data);
}

export function createForm({ name, description, form_type, settings }) {
  return client.post('/forms', { name, description, form_type, settings }).then((res) => res.data);
}

export function updateForm(id, updates) {
  return client.patch(`/forms/${id}`, updates).then((res) => res.data);
}

export function deleteForm(id) {
  return client.delete(`/forms/${id}`).then((res) => res.data);
}

// =====================
// FORM VERSIONS
// =====================

export function fetchVersion(formId, versionId) {
  return client.get(`/forms/${formId}/versions/${versionId}`).then((res) => res.data);
}

export function createVersion(formId, { react_code, css_code, schema_json }) {
  return client.post(`/forms/${formId}/versions`, { react_code, css_code, schema_json }).then((res) => res.data);
}

export function publishVersion(formId, versionId) {
  return client.post(`/forms/${formId}/versions/${versionId}/publish`).then((res) => res.data);
}

// =====================
// SUBMISSIONS
// =====================

export function fetchSubmissions(formId, params = {}) {
  return client.get(`/forms/${formId}/submissions`, { params }).then((res) => res.data);
}

export function fetchSubmission(formId, submissionId) {
  return client.get(`/forms/${formId}/submissions/${submissionId}`).then((res) => res.data);
}

// =====================
// AUDIT LOGS
// =====================

export function fetchAuditLogs(formId, params = {}) {
  return client.get(`/forms/${formId}/audit-logs`, { params }).then((res) => res.data);
}

// =====================
// AI ENDPOINTS
// =====================

export function uploadPDFForConversion(formId, file, instructions = '') {
  const formData = new FormData();
  formData.append('pdf', file);
  if (instructions) formData.append('instructions', instructions);
  return client.post(`/forms/${formId}/ai/upload-pdf`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then((res) => res.data);
}

export function aiEditForm(formId, { instruction, current_code, current_css, current_js }) {
  return client.post(`/forms/${formId}/ai/edit`, {
    instruction,
    current_code,
    current_css,
    current_js
  }).then((res) => res.data);
}

export function generateSchema(formId, reactCode) {
  return client.post(`/forms/${formId}/ai/generate-schema`, {
    react_code: reactCode
  }).then((res) => res.data);
}

// =====================
// PDF ENDPOINTS
// =====================

export function generateSubmissionPDF(formId, submissionId) {
  return client.post(`/forms/${formId}/submissions/${submissionId}/pdf`).then((res) => res.data);
}

export function listSubmissionPDFs(formId, submissionId) {
  return client.get(`/forms/${formId}/submissions/${submissionId}/pdfs`).then((res) => res.data);
}

export function getSubmissionPDFUrl(formId, submissionId, artifactId) {
  return `/api/forms/${formId}/submissions/${submissionId}/pdf/${artifactId}`;
}

