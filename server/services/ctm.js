import axios from 'axios';
import { generateAiResponse } from './ai.js';

const CTM_BASE = process.env.CTM_API_BASE || 'https://api.calltrackingmetrics.com';

// Canonical category definitions - ALWAYS appended to any prompt during classification
// This ensures consistent categories regardless of custom business prompts
export const CATEGORY_DEFINITIONS = `
CATEGORIES (use exactly these values):
- converted: Caller explicitly agreed to purchase/book a service
- warm: Promising lead interested in services
- very_hot: Ready to book/buy now, high intent
- needs_attention: Left voicemail requesting callback or follow-up
- voicemail: Voicemail with no actionable details
- unanswered: No conversation occurred, no message left
- not_a_fit: Caller is not a fit for services (wrong service type, outside service area, etc.)
- spam: Telemarketer, robocall, wrong number, or irrelevant sales call
- neutral: General inquiry or information request, unclear intent
- applicant: ONLY use if caller explicitly asks about jobs, careers, employment, or applying for a position at the company. Do NOT use for service inquiries.

Respond ONLY with JSON: {"category":"<category>","summary":"One sentence summary"}
`.trim();

export const DEFAULT_AI_PROMPT =
  process.env.DEFAULT_AI_PROMPT ||
  'You are an assistant that classifies call transcripts for service businesses. Analyze the conversation and determine the caller intent.';

const MAX_CALLS = Number(process.env.CTM_MAX_CALLS || 200);
const CLASSIFY_LIMIT = Number(process.env.CTM_CLASSIFY_LIMIT || 40);
const CATEGORY_MAP = {
  converted: 'converted',
  warm: 'warm',
  very_hot: 'very_good',
  'very-hot': 'very_good',
  hot: 'very_good',
  needs_attention: 'needs_attention',
  applicant: 'applicant',
  voicemail: 'voicemail',
  unanswered: 'unanswered',
  not_a_fit: 'not_a_fit',
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
    case 'not_a_fit':
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

/**
 * Maps star rating (from CTM) to category for display/organization
 * This is the reverse of getAutoStarRating - used when leads already have ratings
 * 1 = Spam
 * 2 = Not a fit
 * 3 = Solid lead (very_good)
 * 4 = Great lead (very_good)
 * 5 = Converted (agreed to service)
 */
export function getCategoryFromRating(score) {
  switch (score) {
    case 1:
      return 'spam';
    case 2:
      return 'not_a_fit';
    case 3:
      return 'very_good';
    case 4:
      return 'very_good';
    case 5:
      return 'converted';
    default:
      return null; // No rating - use AI classification
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
  { key: 'converted', phrases: ['converted', 'agreed to service', 'booked', 'scheduled appointment', 'signed up'] },
  { key: 'needs_attention', phrases: ['needs_attention', 'needs attention', 'attention needed'] },
  { key: 'very_hot', phrases: ['very hot', 'ready to book', 'ready to schedule'] },
  { key: 'warm', phrases: ['warm', 'interested lead', 'promising lead'] },
  { key: 'voicemail', phrases: ['voicemail', 'voice mail'] },
  { key: 'unanswered', phrases: ['unanswered', 'no answer', 'no response'] },
  { key: 'not_a_fit', phrases: ['not a fit', 'not interested', 'unhappy', 'negative'] },
  { key: 'spam', phrases: ['spam', 'telemarketer', 'scam', 'robocall'] },
  { key: 'neutral', phrases: ['neutral', 'general inquiry', 'info request'] },
  // Only match job-related phrases that are unambiguous (not "apply for service" etc)
  { key: 'applicant', phrases: ['job opening', 'job inquiry', 'career opportunity', 'employment inquiry', 'hiring', 'looking for work', 'seeking employment', 'job applicant', 'resume', 'cv submission'] }
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
  
  // Build the system prompt: custom business context + canonical category definitions
  const businessContext = prompt || DEFAULT_AI_PROMPT;
  const systemPrompt = `${businessContext}\n\n${CATEGORY_DEFINITIONS}`;
  
  try {
    const raw = await generateAiResponse({
      prompt: `${transcript ? 'Caller transcript:\n' : 'Form or message content:\n'}${content.slice(0, 6000)}`,
      systemPrompt,
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

/**
 * Normalize phone number for consistent comparison
 * Strips all non-digit characters except leading +
 */
export function normalizePhoneNumber(phone) {
  if (!phone) return '';
  const str = String(phone).trim();
  // Keep leading + if present, strip everything else non-numeric
  if (str.startsWith('+')) {
    return '+' + str.slice(1).replace(/\D/g, '');
  }
  return str.replace(/\D/g, '');
}

/**
 * Fetch calls from CTM API with pagination support
 * @param {Object} credentials - CTM API credentials
 * @param {Object} options - Fetch options
 * @param {Date|string} options.sinceTimestamp - Only fetch calls after this timestamp (incremental sync)
 * @param {number} options.perPage - Results per page (default 100)
 * @param {number} options.maxPages - Max pages to fetch, 0 = unlimited (default 0 for full sync)
 * @param {boolean} options.fullSync - If true, ignores sinceTimestamp and fetches all available data
 * @param {Object} options.extraParams - Additional CTM API params
 */
async function fetchCtmCalls({ accountId, apiKey, apiSecret }, options = {}) {
  const {
    sinceTimestamp = null,
    perPage = 100,
    maxPages = 0, // 0 = unlimited
    fullSync = false,
    extraParams = {}
  } = options;

  if (!accountId || !apiKey || !apiSecret) {
    throw new Error('CallTrackingMetrics credentials not configured.');
  }

  // CTM date filters are day-based; include tomorrow to ensure "today" is fully captured across timezones
  const now = Date.now();
  const endDate = new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  // For incremental sync, use sinceTimestamp; for full sync, go back 1 year by default
  let startDate;
  if (fullSync || !sinceTimestamp) {
    // Full sync: fetch up to 1 year of history (CTM may have its own limits)
    const defaultLookback = Number(process.env.CTM_FULL_SYNC_DAYS || 365);
    startDate = new Date(now - defaultLookback * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  } else {
    // Incremental sync: start from last sync cursor
    const cursorDate = new Date(sinceTimestamp);
    // Go back 1 day from cursor to catch any edge cases with timezone/timing
    cursorDate.setDate(cursorDate.getDate() - 1);
    startDate = cursorDate.toISOString().slice(0, 10);
  }

  const calls = [];
  let page = 1;
  let latestTimestamp = null;
  const pageLimit = maxPages > 0 ? maxPages : 1000; // Safety limit

  while (page <= pageLimit) {
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
      timeout: 30000
    });

    const payload = Array.isArray(resp.data?.data?.calls)
      ? resp.data.data.calls
      : Array.isArray(resp.data?.calls)
      ? resp.data.calls
      : Array.isArray(resp.data?.data)
      ? resp.data.data
      : [];

    if (!payload.length) break;

    // Track the latest timestamp for cursor update
    for (const call of payload) {
      const { timestampMs } = parseTimestamp(call);
      if (timestampMs && (!latestTimestamp || timestampMs > latestTimestamp)) {
        latestTimestamp = timestampMs;
      }
    }

    calls.push(...payload);

    // Stop if we got fewer results than requested (last page)
    if (payload.length < perPage) break;

    page += 1;
  }

  return {
    calls,
    latestTimestamp,
    pagesProcessed: page,
    startDate,
    endDate
  };
}

export async function pullCallsFromCtm({ 
  credentials, 
  prompt = DEFAULT_AI_PROMPT, 
  existingRows = [], 
  autoStarEnabled = false, 
  syncRatings = false,
  sinceTimestamp = null,
  fullSync = false 
}) {
  const existingMap = new Map();
  existingRows.forEach((row) => {
    if (row && row.call_id) existingMap.set(row.call_id, row);
  });
  
  const fetchResult = await fetchCtmCalls(credentials, {
    sinceTimestamp,
    fullSync,
    perPage: 100,
    maxPages: 0 // Unlimited for full pagination
  });
  
  const rawCalls = fetchResult.calls || [];
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
    
    // Get score from CTM (this is the authoritative source for two-way sync)
    const ctmScore = raw.sale?.score || raw.score || 0;
    const dbScore = existing?.score || 0;
    
    // Check if CTM rating changed (for two-way sync)
    const ratingChangedInCtm = syncRatings && existing && ctmScore !== dbScore && ctmScore > 0;
    // Check if rating was removed (had rating before, now 0)
    const ratingWasRemoved = syncRatings && existing && dbScore > 0 && ctmScore === 0;
    
    // Use CTM score as authoritative when syncing ratings
    const existingScore = syncRatings ? ctmScore : (dbScore || ctmScore);
    
    const transcript = getTranscript(raw);
    const message = buildMessage(raw);
    const stubMessage = isCtmStubMessage(message);
    const hasConversation = Boolean(
      (transcript && transcript.trim()) ||
        (!stubMessage && message && message.trim().length > 10)
    );
    const unansweredLikely = isLikelyUnanswered(raw);
    const voicemailFlag = isVoicemail(raw);
    let classification = prevMeta.classification || '';
    let summary = prevMeta.classification_summary || '';
    let category = prevMeta.category || 'unreviewed';
    let shouldAutoStar = false;
    
    // Check if lead already has a rating from CTM
    const hasExistingCtmRating = ctmScore > 0;
    const categoryFromRating = getCategoryFromRating(ctmScore);
    
    // IMPORTANT: If CTM has a rating, it ALWAYS determines the category
    // This ensures two-way sync works - when ratings change in CTM, category updates
    if (hasExistingCtmRating && categoryFromRating) {
      category = categoryFromRating;
    } else if (ratingWasRemoved) {
      // Rating was removed in CTM - reset to unreviewed
      category = 'unreviewed';
    }
    
    // Now handle classification and summary (AI analysis)
    if (unansweredLikely && !hasConversation) {
      classification = 'unanswered';
      summary = summary || 'Call was unanswered with no voicemail.';
      // Only set category if no CTM rating
      if (!hasExistingCtmRating) {
        category = 'unanswered';
      }
    } else if (stubMessage && !transcript) {
      classification = 'neutral';
      summary = summary || 'Call logged from CTM metadata.';
      // Only set category if no CTM rating
      if (!hasExistingCtmRating) {
        category = 'neutral';
      }
    } else if (hasConversation) {
      // Run AI classification if we don't have a summary yet
      if (!summary && classified < CLASSIFY_LIMIT) {
        const ai = await classifyContent(prompt, transcript, message);
        classification = ai.classification;
        summary = ai.summary;
        // Only use AI category if there's no existing CTM rating
        if (!hasExistingCtmRating) {
          category = ai.category;
          shouldAutoStar = true; // Only eligible for auto-star if no existing rating
        }
        classified += 1;
      } else if (!classification) {
        classification = 'unreviewed';
        summary = summary || 'AI classification skipped.';
        if (!hasExistingCtmRating) {
          category = category || 'unreviewed';
        }
      }
    }

    // If voicemail but this is a good/applicant lead, elevate to needs_attention
    // Only if NOT rated by CTM (rating takes priority)
    const goodLead = category === 'warm' || category === 'very_good' || category === 'applicant';
    if (voicemailFlag && goodLead && !hasExistingCtmRating) {
      category = 'needs_attention';
    }
    
    // Determine final score - NEVER overwrite existing CTM ratings
    let finalScore = existingScore;
    if (autoStarEnabled && shouldAutoStar && !hasExistingCtmRating && existingScore === 0) {
      // Only auto-star if:
      // 1. Auto-star is enabled
      // 2. We just ran AI classification (shouldAutoStar)
      // 3. CTM doesn't already have a rating
      // 4. Our local DB doesn't have a rating either
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
      is_voicemail: voicemailFlag,
      assets,
      duration_sec: getDuration(raw),
      started_at: startedAtIso,
      score: finalScore
    };
    const needsAttention = category === 'needs_attention';
    results.push({
      call: callData,
      meta: { ...callData },
      // Only post score to CTM if we auto-starred AND CTM doesn't already have a rating
      shouldPostScore: autoStarEnabled && shouldAutoStar && finalScore > 0 && !hasExistingCtmRating,
      notifyNeedsAttention: needsAttention && shouldAutoStar && !hasExistingCtmRating,
      isRatingUpdate: ratingChangedInCtm,
      isNew: !existing,
      hadExistingRating: hasExistingCtmRating
    });
  }
  
  return {
    results,
    syncMeta: {
      latestTimestamp: fetchResult.latestTimestamp,
      pagesProcessed: fetchResult.pagesProcessed,
      startDate: fetchResult.startDate,
      endDate: fetchResult.endDate,
      totalFetched: rawCalls.length,
      processedCount: results.length
    }
  };
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

function isVoicemail(raw = {}) {
  const statusString = [raw.status, raw.result, raw.call_status, raw.callResult, raw.direction]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (statusString.includes('voicemail') || statusString.includes('voice mail')) return true;
  if (Array.isArray(raw.actions)) {
    return raw.actions.some((action) => {
      const value = `${action?.event || ''} ${action?.name || ''}`.toLowerCase();
      return value.includes('voicemail') || value.includes('voice mail');
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
      const durationSec = row.duration_sec || meta.duration_sec || 0;
      const direction = row.direction || meta.direction || 'inbound';
      const startedAt = row.started_at || meta.started_at;
      
      // Format duration as human-readable string
      const formatDuration = (seconds) => {
        if (!seconds || seconds < 1) return '0s';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
      };
      
      // Calculate time ago for relative timestamps
      const getTimeAgo = (timestamp) => {
        if (!timestamp) return null;
        const now = Date.now();
        const then = new Date(timestamp).getTime();
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return `${Math.floor(diffDays / 30)}mo ago`;
      };
      
      return {
        id: row.call_id,
        rating: row.score || 0,
        caller_type: row.caller_type || meta.callerType || 'new',
        active_client_id: row.active_client_id || meta.activeClientId || null,
        call_sequence: row.call_sequence || meta.callSequence || 1,
        active_client: meta.activeClient || null,
        previous_calls: meta.previousCalls || [],
        // Explicit fields for UI
        duration_sec: durationSec,
        duration_formatted: formatDuration(durationSec),
        direction: direction,
        is_inbound: direction === 'inbound' || direction === 'in',
        started_at: startedAt,
        time_ago: getTimeAgo(startedAt),
        from_number: row.from_number || meta.caller_number || null,
        to_number: row.to_number || meta.to_number || null,
        // Explicitly include transcript fields
        transcript: meta.transcript || null,
        transcript_url: meta.transcript_url || null,
        recording_url: meta.recording_url || (meta.assets?.[0]?.url) || null,
        message: meta.message || null,
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

/**
 * Enrich a call with caller type based on phone number
 * Determines if caller is: new, repeat, or returning_customer
 * @param {Object} db - Database query function
 * @param {string} userId - Owner user ID
 * @param {string} phoneNumber - Caller's phone number
 * @param {string} currentCallId - Current call's ID (to exclude from count)
 * @returns {Object} { callerType, activeClientId, callSequence, previousCalls }
 */
export async function enrichCallerType(query, userId, phoneNumber, currentCallId = null) {
  if (!phoneNumber) {
    return { callerType: 'new', activeClientId: null, callSequence: 1, previousCalls: [] };
  }
  
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized || normalized.length < 7) {
    return { callerType: 'new', activeClientId: null, callSequence: 1, previousCalls: [] };
  }

  // 1. Check active_clients for exact phone match
  const clientResult = await query(
    `SELECT id, client_name, client_email, status 
     FROM active_clients 
     WHERE owner_user_id = $1 
       AND client_phone IS NOT NULL 
       AND REGEXP_REPLACE(client_phone, '[^0-9]', '', 'g') = REGEXP_REPLACE($2, '[^0-9]', '', 'g')
       AND (archived_at IS NULL OR archived_at > NOW())
     LIMIT 1`,
    [userId, normalized]
  );
  
  // 2. Get previous calls from this phone number
  let callFilter = `owner_user_id = $1 
    AND from_number IS NOT NULL 
    AND REGEXP_REPLACE(from_number, '[^0-9]', '', 'g') = REGEXP_REPLACE($2, '[^0-9]', '', 'g')`;
  const params = [userId, normalized];
  
  if (currentCallId) {
    callFilter += ` AND call_id != $3`;
    params.push(currentCallId);
  }
  
  const previousCallsResult = await query(
    `SELECT call_id, started_at, score, meta->>'classification' as classification,
            meta->>'classification_summary' as summary
     FROM call_logs 
     WHERE ${callFilter}
     ORDER BY started_at DESC
     LIMIT 10`,
    params
  );
  
  const previousCalls = previousCallsResult?.rows || [];
  const callSequence = previousCalls.length + 1;
  
  // 3. Determine caller type
  if (clientResult?.rows?.length > 0) {
    const client = clientResult.rows[0];
    return { 
      callerType: 'returning_customer', 
      activeClientId: client.id,
      activeClient: client,
      callSequence,
      previousCalls 
    };
  }
  
  if (previousCalls.length > 0) {
    return { 
      callerType: 'repeat', 
      activeClientId: null, 
      callSequence,
      previousCalls 
    };
  }
  
  return { 
    callerType: 'new', 
    activeClientId: null, 
    callSequence: 1,
    previousCalls: [] 
  };
}

/**
 * Get all journeys for an active client
 * @param {Function} query - Database query function
 * @param {string} activeClientId - Active client UUID
 * @returns {Array} List of journeys with service info
 */
export async function getClientJourneys(query, activeClientId) {
  if (!activeClientId) return [];
  
  const result = await query(
    `SELECT cj.*, s.name as service_name, s.description as service_description
     FROM client_journeys cj
     LEFT JOIN services s ON cj.service_id = s.id
     WHERE cj.active_client_id = $1 
       AND (cj.archived_at IS NULL OR cj.archived_at > NOW())
     ORDER BY cj.created_at DESC`,
    [activeClientId]
  );
  
  return result?.rows || [];
}
