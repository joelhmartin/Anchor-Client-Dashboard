import client from './client';

export function fetchDocuments() {
  return client.get('/hub/docs').then((res) => res.data.docs || []);
}

export function uploadDocuments(files) {
  const formData = new FormData();
  files.forEach((file) => formData.append('client_doc', file));
  return client
    .post('/hub/docs', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((res) => res.data.docs || []);
}

export function deleteDocument(id) {
  return client.delete(`/hub/docs/${id}`).then((res) => res.data);
}

export function markDocumentViewed(id) {
  return client.post(`/hub/docs/${id}/viewed`).then((res) => res.data);
}
