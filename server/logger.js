const HTTP_LOGGING_ENABLED = String(process.env.HTTP_LOGGING || 'true').toLowerCase() === 'true';

function safeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const clone = {};
  Object.entries(body).forEach(([key, value]) => {
    if (value === undefined) return;
    if (typeof value === 'string' && value.length > 500) {
      clone[key] = `${value.slice(0, 500)}…`;
    } else {
      clone[key] = value;
    }
  });
  return clone;
}

export function logHttp(event, payload = {}) {
  if (!HTTP_LOGGING_ENABLED) return;
  const timestamp = new Date().toISOString();
  if (payload && Object.keys(payload).length) {
    // eslint-disable-next-line no-console
    console.log(`[${timestamp}] ${event}`, payload);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[${timestamp}] ${event}`);
  }
}

export function logIncomingRequest(req) {
  logHttp('http:incoming', {
    method: req.method,
    path: req.originalUrl || req.url,
    query: req.query,
    body: safeBody(req.body),
    user: req.user?.id || null
  });
}

export function logOutgoingRequest(label, details) {
  logHttp(`http:outgoing:${label}`, details);
}

export function logOutgoingResponse(label, details) {
  logHttp(`http:outgoing:${label}:response`, details);
}
