import Mailgun from 'mailgun.js';
import formData from 'form-data';

// Prefer prod keys/domains; in non-production allow sandbox if prod not set.
const isProd = process.env.NODE_ENV === 'production';
const apiKey = process.env.MAILGUN_API_KEY || (!isProd ? process.env.MAILGUN_SANDBOX_API_KEY : undefined);
const rawDomain = process.env.MAILGUN_DOMAIN || (!isProd ? process.env.MAILGUN_SANDBOX_DOMAIN : undefined);
const resolvedDomain = rawDomain && rawDomain.includes('.') ? rawDomain : rawDomain ? `${rawDomain}.mailgun.org` : undefined;

const defaultFrom = process.env.MAILGUN_DEFAULT_FROM || (resolvedDomain ? `Anchor Dashboard <webforms@${resolvedDomain}>` : undefined);

let client = null;
if (apiKey && resolvedDomain) {
  const mailgun = new Mailgun(formData);
  client = mailgun.client({
    username: 'api',
    key: apiKey
  });
}

export function isMailgunConfigured() {
  return Boolean(client && resolvedDomain);
}

export async function sendMailgunMessage({ to, subject, text, html, from }) {
  if (!isMailgunConfigured()) {
    throw new Error('Mailgun is not configured');
  }
  if (!to || (Array.isArray(to) && !to.length)) {
    throw new Error('Recipient is required');
  }
  if (!subject) {
    throw new Error('Subject is required');
  }
  if (!text && !html) {
    throw new Error('Either text or html content is required');
  }

  const recipients = Array.isArray(to) ? to : [to];
  const payload = {
    from: from || defaultFrom || `webforms@${resolvedDomain}`,
    to: recipients,
    subject,
    text,
    html
  };
  return client.messages.create(resolvedDomain, payload);
}
