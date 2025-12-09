import axios from 'axios';
import { generateAiResponse } from './ai.js';

const CTM_BASE = process.env.CTM_API_BASE || 'https://api.calltrackingmetrics.com';
export const DEFAULT_AI_PROMPT =
  process.env.DEFAULT_AI_PROMPT ||
  'You are an assistant that classifies call transcripts for Renting or Buying A Home using your realtor company, Aragona & Associates. Categories: warm (promising live lead), very_hot (ready to book now), voicemail (voicemail with no actionable details), needs_attention (caller left a voicemail indicating they want services or next steps), unanswered (no conversation occurred), negative (unhappy caller or not a fit), spam (irrelevant/sales), neutral (general inquiry). Respond ONLY with JSON like {"category":"needs_attention","summary":"One sentence summary"}.';

const MAX_CALLS = Number(process.env.CTM_MAX_CALLS || 200);
const CLASSIFY_LIMIT = Number(process.env.CTM_CLASSIFY_LIMIT || 40);
const CATEGORY_MAP = {
  warm: 'warm',
  very_hot: 'very_good',
  'very-hot': 'very_good',
  hot: 'very_good',
  needs_attention: 'needs_attention',
  voicemail: 'voicemail',
  unanswered: 'unanswered',
  negative: 'negative',
  spam: 'spam',
  neutral: 'neutral'
};

/**
 * Maps AI category to star rating for auto-starring
 * Never returns 4 or 5 (those are manual only)
 * 0 = Described but not scored
 * 1 = Spam
 * 2 = Real person but not a fit
 * 3 = Solid lead quality
 * 5 = Booked appointment (manual only)
 */
function getAutoStarRating(category) {
  switch (category) {
    case 'spam':
      return 1;
    case 'negative':
      return 2;
    case 'warm':
    case 'very_good':
    case 'needs_attention':
      return 3;
    case 'voicemail':
    case 'unanswered':
    case 'neutral':
    case 'unreviewed':
    default:
      return 0; // Described but not scored
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function formatDate(ms) {
  try {
    return dateFormatter.format(new Date(ms));
  } catch {
    return '';
  }
}

function sanitizeSourceKey(value = '') {
  const trimmed = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return trimmed || 'unknown';
}

function determineActivityType(direction = '') {
  const dir = String(direction || '').toLowerCase();
  if (dir.includes('msg') || dir.includes('sms')) return 'sms';
  if (dir.includes('form')) return 'form';
  if (dir.includes('email')) return 'email';
  if (dir.includes('inbound') || dir.includes('outbound')) return 'call';
  return 'other';
}

function formatFormPayload(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => formatFormPayload(entry))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof payload === 'object') {
    const parts = [];
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (typeof value === 'object') {
        parts.push(`${key}: ${formatFormPayload(value)}`);
      } else {
        parts.push(`${key}: ${value}`);
      }
    });
    return parts.join('\n');
  }
  return '';
}

function buildMessage(call) {
  if (call.message_body) return String(call.message_body);
  if (call.notes) return String(call.notes);
  if (call.form_submission) return formatFormPayload(call.form_submission);
  if (call.form_data) return formatFormPayload(call.form_data);
  if (call.form?.custom) return formatFormPayload(call.form.custom);
  if (call.form) return formatFormPayload(call.form);
  return '';
}

function getTranscript(call) {
  if (call.transcription?.text) return String(call.transcription.text);
  if (call.transcription_text) return String(call.transcription_text);
  if (call.transcript) return String(call.transcript);
  return '';
}

function buildRegion(call) {
  const pieces = [];
  if (call.cnam) pieces.push(call.cnam);
  const caller = call.caller || {};
  const address = caller.address || {};
  const city = caller.city || address.city || call.city || call.caller_city || '';
  const state = caller.state || address.state || call.state || call.caller_state || '';
  const country = caller.country || address.country || call.country || '';
  const locationParts = [city, state, country].filter(Boolean);
  if (locationParts.length) pieces.push(locationParts.join(', '));
  return pieces.join(' · ');
}

function getSource(call) {
  return (
    call.tracking_number_name ||
    call.source ||
    call.campaign_name ||
    call.tracking_label ||
    call.campaign_source ||
    'Calls'
  );
}

function getCallerName(call) {
  return call.caller?.name || call.name || call.caller_name || '';
}

function getCallerNumber(call) {
  return (
    call.caller?.number ||
    call.contact_number ||
    call.caller_number ||
    call.phone_number ||
    call.from_number ||
    ''
  );
}

function getToNumber(call) {
  return call.tracking_number || call.to_number || call.dialed_number || call.number_dialed || '';
}

function getDuration(call) {
  return (
    call.duration ||
    call.duration_sec ||
    call.duration_seconds ||
    call.talk_time ||
    call.call_duration ||
    null
  );
}

function parseTimestamp(call) {
  const unixCandidate = call.unix_time || call.unixTime || call.unix_timestamp;
  let timestampMs = null;
  let unixTime = null;
  if (unixCandidate) {
    const numeric = Number(unixCandidate);
    if (!Number.isNaN(numeric) && numeric > 0) {
      unixTime = numeric;
      timestampMs = numeric * 1000;
    }
  }
  if (!timestampMs) {
    const candidates = [call.start_time, call.started_at, call.call_time, call.created_at, call.timestamp];
    for (const entry of candidates) {
      if (!entry) continue;
      let numeric = null;
      if (typeof entry === 'number') {
        numeric = entry > 1e12 ? entry : entry * 1000;
      } else {
        const parsed = Date.parse(entry);
        if (!Number.isNaN(parsed)) numeric = parsed;
      }
      if (numeric) {
        timestampMs = numeric;
        unixTime = Math.floor(numeric / 1000);
        break;
      }
    }
  }
  return {
    timestampMs,
    unixTime,
    startedAtIso: timestampMs ? new Date(timestampMs).toISOString() : null
  };
}

function buildTranscriptUrl(unixTime) {
  if (!unixTime) return '';
  const after = Buffer.from(String(unixTime)).toString('base64');
  return `https://calltrackingapp.com/calls#after=${encodeURIComponent(after)}&callNav=caller_transcription`;
}

function extractAssets(call) {
  const assets = [];
  if (Array.isArray(call.recordings)) {
    call.recordings.forEach((rec, index) => {
      const url = rec.public_url || rec.url;
      if (!url) return;
      assets.push({
        id: rec.id || rec.uuid || `${call.id || call.call_id || 'rec'}-${index}`,
        name: rec.name || 'Recording',
        url,
        created_at: rec.created_at || null
      });
    });
  } else if (call.recording_url) {
    assets.push({
      id: `recording_${call.id || call.call_id || 'call'}`,
      name: 'Recording',
      url: call.recording_url,
      created_at: call.started_at || null
    });
  }
  return assets;
}

function mapCategory(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return CATEGORY_MAP[slug] || (slug || 'unreviewed');
}

const CATEGORY_PATTERNS = [
  { key: 'needs_attention', phrases: ['needs_attention', 'needs attention', 'attention needed'] },
  { key: 'very_hot', phrases: ['very hot', 'ready to book', 'booked appointment'] },
  { key: 'warm', phrases: ['warm', 'interested lead', 'promising lead'] },
  { key: 'voicemail', phrases: ['voicemail', 'voice mail'] },
  { key: 'unanswered', phrases: ['unanswered', 'no answer', 'no response'] },
  { key: 'negative', phrases: ['negative', 'not interested', 'unhappy'] },
  { key: 'spam', phrases: ['spam', 'telemarketer', 'scam', 'robocall'] },
  { key: 'neutral', phrases: ['neutral', 'general inquiry', 'info request'] }
];

function inferCategoryFromText(text = '') {
  const lower = text.toLowerCase();
  for (const entry of CATEGORY_PATTERNS) {
    if (entry.phrases.some((phrase) => lower.includes(phrase))) {
      return entry.key;
    }
  }
  return null;
}

export async function classifyContent(prompt, transcript, message) {
  const content = transcript || message;
  if (!content) {
    return {
      classification: 'unreviewed',
      summary: 'No transcript or message available.',
      category: 'unreviewed'
    };
  }
  const payloadPreview = content.slice(0, 500);
  try {
    const raw = await generateAiResponse({
      prompt: `${transcript ? 'Caller transcript:\n' : 'Form or message content:\n'}${content.slice(
        0,
        6000
      )}\n\nRespond ONLY with JSON like {"category":"needs_attention","summary":"single sentence"}. Categories: warm, very_hot, voicemail, needs_attention, unanswered, negative, spam, neutral.`,
      systemPrompt: prompt || DEFAULT_AI_PROMPT,
      temperature: 0.2,
      maxTokens: 200,
      model: process.env.VERTEX_CLASSIFIER_MODEL || process.env.VERTEX_MODEL || undefined
    });
    let classification = raw;
    let summary = raw;
    if (raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        classification = parsed.category || classification;
        summary = parsed.summary || summary;
      } catch {
        summary = raw;
      }
    }
    if (!classification || classification === raw) {
      const categoryMatch = raw.match(/"category"\s*:\s*"([^"]+)"/i);
      if (categoryMatch) {
        classification = categoryMatch[1];
      }
    }
    if (!summary || summary === raw) {
      const summaryMatch = raw.match(/"summary"\s*:\s*"([^"]+)"/i);
      if (summaryMatch) {
        summary = summaryMatch[1];
      }
    }
    if (!classification || classification === raw) {
      const inferred = inferCategoryFromText(raw);
      if (inferred) classification = inferred;
    }
    const mappedCategory = mapCategory(classification);
    let finalCategory = mappedCategory;
    if (!mappedCategory || mappedCategory === 'unreviewed') {
      const inferredFromSummary = inferCategoryFromText(summary);
      if (inferredFromSummary) {
        finalCategory = mapCategory(inferredFromSummary);
        classification = inferredFromSummary;
      }
    }
    if (!classification || !summary) {
      console.warn('[ctm:classify] Empty classification or summary', {
        classification,
        summary,
        category: finalCategory,
        preview: payloadPreview
      });
    }
    return {
      classification,
      summary,
      category: finalCategory
    };
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error('[ctm:classify]', {
      error: details,
      preview: payloadPreview
    });
    return { classification: 'unreviewed', summary: 'AI classification failed.', category: 'unreviewed' };
  }
}

async function fetchCtmCalls({ accountId, apiKey, apiSecret }, perPage = 100, maxPages = 5, extraParams = {}) {
  if (!accountId || !apiKey || !apiSecret) {
    throw new Error('CallTrackingMetrics credentials not configured.');
  }
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);
  const calls = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const resp = await axios.get(`${CTM_BASE}/api/v1/accounts/${accountId}/calls`, {
      params: {
        per_page: perPage,
        page,
        order: 'desc',
        start_date: startDate,
        end_date: endDate,
        ...extraParams
      },
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        Accept: 'application/json'
      },
      timeout: 20000
    });
    const payload = Array.isArray(resp.data?.data?.calls)
      ? resp.data.data.calls
      : Array.isArray(resp.data?.calls)
      ? resp.data.calls
      : Array.isArray(resp.data?.data)
      ? resp.data.data
      : [];
    if (!payload.length) break;
    calls.push(...payload);
    if (payload.length < perPage) break;
  }
  return calls;
}

export async function pullCallsFromCtm({ credentials, prompt = DEFAULT_AI_PROMPT, existingRows = [], autoStarEnabled = false }) {
  const existingMap = new Map();
  existingRows.forEach((row) => {
    if (row && row.call_id) existingMap.set(row.call_id, row);
  });
  const rawCalls = await fetchCtmCalls(credentials);
  const limited = rawCalls.slice(0, MAX_CALLS);
  const results = [];
  let classified = 0;
  for (const raw of limited) {
    const callId =
      raw.id ||
      raw.call_id ||
      raw.sid ||
      raw.uuid ||
      raw.callSid ||
      raw.callSid ||
      raw.call_uuid ||
      raw.callId;
    if (!callId) continue;
    const stringId = String(callId);
    const existing = existingMap.get(stringId);
    const prevMeta = existing?.meta || {};
    
    // Get existing score from CTM or database
    const existingScore = existing?.score || raw.sale?.score || raw.score || 0;
    
    const transcript = getTranscript(raw);
    const message = buildMessage(raw);
    const stubMessage = isCtmStubMessage(message);
    const hasConversation = Boolean(
      (transcript && transcript.trim()) ||
        (!stubMessage && message && message.trim().length > 10)
    );
    const unansweredLikely = isLikelyUnanswered(raw);
    let classification = prevMeta.classification || '';
    let summary = prevMeta.classification_summary || '';
    let category = prevMeta.category || 'unreviewed';
    let shouldAutoStar = false;
    
    if (unansweredLikely && !hasConversation) {
      classification = 'unanswered';
      summary = 'Call was unanswered with no voicemail.';
      category = 'unanswered';
    } else if (stubMessage && !transcript) {
      classification = 'neutral';
      summary = 'Call logged from CTM metadata.';
      category = 'neutral';
    } else if ((!classification || !summary) && hasConversation) {
      if (classified < CLASSIFY_LIMIT) {
        const ai = await classifyContent(prompt, transcript, message);
        classification = ai.classification;
        summary = ai.summary;
        category = ai.category;
        classified += 1;
        shouldAutoStar = true; // New AI classification, eligible for auto-star
      } else if (!classification) {
        classification = 'unreviewed';
        summary = summary || 'AI classification skipped.';
        category = category || 'unreviewed';
      }
    }
    
    // Determine final score
    let finalScore = existingScore;
    if (autoStarEnabled && shouldAutoStar && existingScore === 0) {
      // Only auto-star if there's no existing score and auto-star is enabled
      finalScore = getAutoStarRating(category);
    }
    
    const { timestampMs, unixTime, startedAtIso } = parseTimestamp(raw);
    const source = getSource(raw);
    const assets = extractAssets(raw);
    const callData = {
      id: stringId,
      name: getCallerName(raw) || `Call ${stringId}`,
      source,
      source_key: sanitizeSourceKey(source),
      call_time: timestampMs ? formatDate(timestampMs) : '',
      timestamp: timestampMs || null,
      unix_time: unixTime || null,
      caller_name: getCallerName(raw),
      caller_number: getCallerNumber(raw),
      to_number: getToNumber(raw),
      region: buildRegion(raw),
      transcript,
      message,
      transcript_url: buildTranscriptUrl(unixTime),
      recording_url: assets[0]?.url || raw.recording_url || '',
      direction: (raw.direction || '').toLowerCase(),
      activity_type: determineActivityType(raw.direction),
      classification,
      classification_summary: summary || '',
      category,
      assets,
      duration_sec: getDuration(raw),
      started_at: startedAtIso,
      score: finalScore
    };
    const needsAttention = category === 'needs_attention';
    results.push({
      call: callData,
      meta: { ...callData },
      shouldPostScore: autoStarEnabled && shouldAutoStar && finalScore > 0,
      notifyNeedsAttention: needsAttention && shouldAutoStar
    });
  }
  return results;
}

function isLikelyUnanswered(raw = {}) {
  const duration =
    Number(raw.duration) ||
    Number(raw.duration_sec) ||
    Number(raw.talk_time) ||
    Number(raw.time_on_phone) ||
    0;
  const statusString = [raw.status, raw.result, raw.call_status, raw.callResult]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (duration === 0 && statusString.includes('voicemail')) {
    return false;
  }
  if (
    duration === 0 ||
    statusString.includes('missed') ||
    statusString.includes('unanswered') ||
    statusString.includes('no answer') ||
    statusString.includes('busy')
  ) {
    return true;
  }
  if (Array.isArray(raw.actions)) {
    return raw.actions.some((action) => {
      const value = `${action?.event || ''} ${action?.name || ''}`.toLowerCase();
      return value.includes('missed') || value.includes('unanswered') || value.includes('no answer');
    });
  }
  return false;
}

function isCtmStubMessage(text = '') {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('new call from:') ||
    normalized.startsWith('repeat call from:') ||
    normalized.startsWith('caller transcript:') ||
    normalized.startsWith('call from:') ||
    normalized.startsWith('website visitor') ||
    normalized === 'website'
  );
}

export function buildCallsFromCache(rows = []) {
  return rows
    .map((row) => {
      if (!row.call_id) return null;
      const meta = row.meta || {};
      return {
        id: row.call_id,
        rating: row.score || 0,
        ...meta
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

/**
 * Posts a sale/score to CallTrackingMetrics for a specific call
 * This marks the call as starred/scored in the CTM dashboard
 * 
 * @param {Object} credentials - CTM API credentials { accountId, apiKey, apiSecret }
 * @param {string} callId - The CTM call ID
 * @param {Object} saleData - Sale data to post { score, conversion, value, sale_date }
 * @returns {Promise<Object>} Response from CTM API
 */
export async function postSaleToCTM(credentials, callId, saleData = {}) {
  const { accountId, apiKey, apiSecret } = credentials;
  
  if (!accountId || !apiKey || !apiSecret) {
    throw new Error('CallTrackingMetrics credentials not configured.');
  }
  
  if (!callId) {
    throw new Error('Missing call ID for CTM sale posting.');
  }

  const url = `${CTM_BASE}/api/v1/accounts/${encodeURIComponent(accountId)}/calls/${encodeURIComponent(callId)}/sale`;
  
  const payload = {
    score: saleData.score || 5,
    conversion: saleData.conversion !== undefined ? saleData.conversion : 1,
    value: saleData.value || 0,
    sale_date: saleData.sale_date || new Date().toISOString().slice(0, 10)
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`
      },
      timeout: 20000
    });
    
    return response.data;
  } catch (err) {
    const status = err.response?.status || 500;
    const errorData = err.response?.data;
    const message = errorData?.message || errorData?.error || err.message || 'Failed to update CallTrackingMetrics sale';
    
    console.error('[ctm:postSale] Failed to post sale to CTM', {
      callId,
      status,
      error: message,
      payload
    });
    
    // Re-throw with more context
    const error = new Error(`CTM API Error (${status}): ${message}`);
    error.status = status;
    error.data = errorData;
    throw error;
  }
}

export async function fetchPhoneInteractionSources(credentials, phoneNumber, perPage = 100, maxPages = 5) {
  const { accountId, apiKey, apiSecret } = credentials || {};
  if (!accountId || !apiKey || !apiSecret || !phoneNumber) return [];
  const normalized = String(phoneNumber).replace(/[^\d+]/g, '');
  const sources = new Set();
  for (let page = 1; page <= maxPages; page += 1) {
    const resp = await axios.get(`${CTM_BASE}/api/v1/accounts/${encodeURIComponent(accountId)}/calls`, {
      params: {
        per_page: perPage,
        page,
        order: 'desc',
        caller_number: normalized
      },
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        Accept: 'application/json'
      },
      timeout: 20000
    });
    const payload = Array.isArray(resp.data?.data?.calls)
      ? resp.data.data.calls
      : Array.isArray(resp.data?.calls)
      ? resp.data.calls
      : Array.isArray(resp.data?.data)
      ? resp.data.data
      : [];
    if (!payload.length) break;
    payload.forEach((entry) => {
      const src = getSource(entry);
      if (src) sources.add(src);
    });
    if (payload.length < perPage) break;
  }
  return Array.from(sources);
}
