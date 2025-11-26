import axios from 'axios';

const CTM_BASE = process.env.CTM_API_BASE || 'https://api.calltrackingmetrics.com';
export const DEFAULT_AI_PROMPT =
  process.env.DEFAULT_AI_PROMPT ||
  'You are an assistant that classifies call transcripts for Renting or Buying A Home using your realtor company, Aragona & Associates. Possible categories: warm (promising lead), very_hot (ready to book), voicemail (reached voicemail or unanswered), unanswered (no conversation), negative (unhappy caller), spam (irrelevant/sales), neutral (general inquiry). Return a short JSON object like {"category":"warm","summary":"One sentence summary"}.';

const MAX_CALLS = Number(process.env.CTM_MAX_CALLS || 200);
const CLASSIFY_LIMIT = Number(process.env.CTM_CLASSIFY_LIMIT || 40);
const CATEGORY_MAP = {
  warm: 'warm',
  very_hot: 'very_good',
  'very-hot': 'very_good',
  hot: 'very_good',
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

export async function classifyContent(prompt, transcript, message) {
  const content = transcript || message;
  if (!content) {
    return {
      classification: 'unreviewed',
      summary: 'No transcript or message available.',
      category: 'unreviewed'
    };
  }
  const apiKey = process.env.OPEN_AI_API_KEY;
  if (!apiKey) {
    return {
      classification: 'unreviewed',
      summary: 'AI classification unavailable (missing API key).',
      category: 'unreviewed'
    };
  }
  try {
    const body = {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 150,
      messages: [
        { role: 'system', content: prompt || DEFAULT_AI_PROMPT },
        {
          role: 'user',
          content: `${transcript ? 'Caller transcript:\n' : 'Form or message content:\n'}${content.slice(0, 4000)}`
        }
      ]
    };
    const response = await axios.post('https://api.openai.com/v1/chat/completions', body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });
    let raw = response.data?.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return { classification: 'unreviewed', summary: 'AI classification unavailable.', category: 'unreviewed' };
    }
    let classification = raw;
    let summary = '';
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        classification = parsed.category || classification;
        summary = parsed.summary || summary;
      } catch {
        summary = raw;
      }
    } else {
      summary = raw;
    }
    return {
      classification,
      summary,
      category: mapCategory(classification)
    };
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error('[ctm:classify]', details);
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
    let classification = prevMeta.classification || '';
    let summary = prevMeta.classification_summary || '';
    let category = prevMeta.category || 'unreviewed';
    let shouldAutoStar = false;
    
    if ((!classification || !summary) && (transcript || message)) {
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
    results.push({ call: callData, meta: { ...callData }, shouldPostScore: autoStarEnabled && shouldAutoStar && finalScore > 0 });
  }
  return results;
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
