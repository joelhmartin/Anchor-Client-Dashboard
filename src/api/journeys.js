import client from './client';

export function fetchJourneys(params = {}) {
  return client
    .get('/hub/journeys', { params })
    .then((res) => res.data.journeys || []);
}

export function createJourney(payload) {
  return client.post('/hub/journeys', payload).then((res) => res.data.journey);
}

export function updateJourney(id, payload) {
  return client.put(`/hub/journeys/${id}`, payload).then((res) => res.data.journey);
}

export function addJourneyStep(journeyId, payload) {
  return client.post(`/hub/journeys/${journeyId}/steps`, payload).then((res) => res.data.journey);
}

export function updateJourneyStep(journeyId, stepId, payload) {
  return client.put(`/hub/journeys/${journeyId}/steps/${stepId}`, payload).then((res) => res.data.journey);
}

export function deleteJourneyStep(journeyId, stepId) {
  return client.delete(`/hub/journeys/${journeyId}/steps/${stepId}`).then((res) => res.data.journey);
}

export function addJourneyNote(journeyId, body) {
  return client.post(`/hub/journeys/${journeyId}/notes`, { body }).then((res) => res.data.journey);
}

export function fetchJourneyTemplate() {
  return client.get('/hub/journey-template').then((res) => res.data.template || []);
}

export function saveJourneyTemplate(steps) {
  return client.put('/hub/journey-template', { steps }).then((res) => res.data.template || []);
}

export function applyJourneyTemplate(journeyId) {
  return client.post(`/hub/journeys/${journeyId}/apply-template`).then((res) => res.data.journey);
}

export function archiveJourney(journeyId) {
  return client.post(`/hub/journeys/${journeyId}/archive`).then((res) => res.data.journey);
}

export function restoreJourney(journeyId, payload = {}) {
  return client.post(`/hub/journeys/${journeyId}/unarchive`, payload).then((res) => res.data.journey);
}
