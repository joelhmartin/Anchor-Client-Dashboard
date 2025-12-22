/**
 * Form Submission Job Processor
 * 
 * Handles asynchronous processing of form submissions:
 * - CTM conversion events
 * - Email notifications
 * 
 * Uses a job queue for reliability with retry logic.
 */

import { query, getClient } from '../db.js';
import { sendMailgunMessage } from './mailgun.js';

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5000; // 5 seconds base delay

/**
 * Process pending submission jobs
 * Called by cron scheduler
 */
export async function processSubmissionJobs() {
  const client = await getClient();
  
  try {
    // Get pending jobs (up to 10 at a time)
    const { rows: jobs } = await client.query(`
      SELECT j.*, s.form_id, s.submission_kind, s.non_phi_payload, s.attribution_json,
             f.name as form_name, f.form_type, f.settings_json
      FROM form_submission_jobs j
      JOIN form_submissions s ON j.submission_id = s.id
      JOIN forms f ON s.form_id = f.id
      WHERE j.status IN ('pending', 'failed')
        AND j.attempts < j.max_attempts
        AND j.scheduled_at <= NOW()
      ORDER BY j.scheduled_at ASC
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    `);

    for (const job of jobs) {
      try {
        // Mark as processing
        await client.query(
          `UPDATE form_submission_jobs SET status = 'processing', started_at = NOW() WHERE id = $1`,
          [job.id]
        );

        // Process based on job type
        if (job.job_type === 'ctm_conversion') {
          await processCTMJob(client, job);
        } else if (job.job_type === 'email_notification') {
          await processEmailJob(client, job);
        }

        // Mark as completed
        await client.query(
          `UPDATE form_submission_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
          [job.id]
        );

        // Update submission record
        if (job.job_type === 'ctm_conversion') {
          await client.query(
            `UPDATE form_submissions SET ctm_sent = TRUE, ctm_sent_at = NOW() WHERE id = $1`,
            [job.submission_id]
          );
        } else if (job.job_type === 'email_notification') {
          await client.query(
            `UPDATE form_submissions SET email_sent = TRUE, email_sent_at = NOW() WHERE id = $1`,
            [job.submission_id]
          );
        }

      } catch (err) {
        console.error(`Job ${job.id} failed:`, err);

        // Calculate next retry with exponential backoff
        const nextRetryMs = RETRY_DELAY_MS * Math.pow(2, job.attempts);
        const nextScheduled = new Date(Date.now() + nextRetryMs);

        await client.query(`
          UPDATE form_submission_jobs 
          SET status = 'failed', 
              attempts = attempts + 1, 
              last_error = $1,
              scheduled_at = $2
          WHERE id = $3
        `, [err.message, nextScheduled, job.id]);
      }
    }

    return { processed: jobs.length };
  } finally {
    client.release();
  }
}

/**
 * Process CTM conversion event
 */
async function processCTMJob(client, job) {
  const settings = job.settings_json || {};
  
  // Only send CTM for conversion forms (never for intake/PHI)
  if (job.form_type === 'intake') {
    // For intake forms, we only send a conversion event with attribution
    // Never send PHI to CTM
    const ctmPayload = {
      form_name: job.form_name,
      form_id: job.form_id,
      submission_id: job.submission_id,
      timestamp: new Date().toISOString(),
      conversion_type: 'intake_completed',
      five_star_lead: settings.ctm_five_star_enabled || false,
      // Only include safe attribution data
      ...(job.attribution_json?.utms || {}),
      referrer: job.attribution_json?.referrer || null,
      landing_page: job.attribution_json?.landing_page || null
    };

    await sendToCTM(ctmPayload, settings);
  } else {
    // For conversion forms, send the full payload (non-PHI)
    const ctmPayload = {
      form_name: job.form_name,
      form_id: job.form_id,
      submission_id: job.submission_id,
      timestamp: new Date().toISOString(),
      conversion_type: 'contact_form',
      // Include form data (verified non-PHI)
      ...(job.non_phi_payload || {}),
      // Include attribution
      ...(job.attribution_json?.utms || {}),
      referrer: job.attribution_json?.referrer || null,
      landing_page: job.attribution_json?.landing_page || null
    };

    await sendToCTM(ctmPayload, settings);
  }
}

/**
 * Send data to Call Tracking Metrics
 */
async function sendToCTM(payload, settings) {
  // CTM API integration
  const ctmEnabled = settings.ctm_enabled && settings.ctm_conversion_action_id;
  
  if (!ctmEnabled) {
    console.log('[CTM] Skipping - not configured');
    return;
  }

  // TODO: Implement actual CTM API call
  // For now, just log
  console.log('[CTM] Would send:', JSON.stringify(payload, null, 2));
}

/**
 * Process email notification
 */
async function processEmailJob(client, job) {
  const settings = job.settings_json || {};
  const recipients = settings.email_recipients || [];

  if (!recipients.length) {
    console.log('[Email] No recipients configured');
    return;
  }

  // Build email content
  const isIntake = job.form_type === 'intake';
  const payload = job.non_phi_payload || {};

  // For intake forms, redact PHI in email
  let emailBody = `New form submission received.\n\n`;
  emailBody += `Form: ${job.form_name}\n`;
  emailBody += `Type: ${isIntake ? 'Intake (PHI)' : 'Contact'}\n`;
  emailBody += `Submitted: ${new Date().toLocaleString()}\n\n`;

  if (isIntake) {
    emailBody += `⚠️ This is a PHI submission. View the full submission in the dashboard.\n`;
    emailBody += `Submission ID: ${job.submission_id}\n`;
  } else {
    emailBody += `--- Form Data ---\n`;
    Object.entries(payload).forEach(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      emailBody += `${label}: ${value}\n`;
    });
  }

  // Send email to each recipient
  for (const recipient of recipients) {
    try {
      await sendMailgunMessage({
        to: recipient,
        subject: `New ${job.form_name} Submission`,
        text: emailBody,
        from: process.env.MAILGUN_DEFAULT_FROM || 'forms@anchorcorps.com'
      });
    } catch (err) {
      console.error(`Failed to send email to ${recipient}:`, err);
      throw err; // Will trigger retry
    }
  }
}

/**
 * Create jobs for a new submission
 */
export async function createSubmissionJobs(submissionId, formSettings = {}) {
  const client = await getClient();
  
  try {
    const jobs = [];

    // CTM job (if enabled)
    if (formSettings.ctm_enabled) {
      const { rows } = await client.query(`
        INSERT INTO form_submission_jobs (submission_id, job_type, idempotency_key)
        VALUES ($1, 'ctm_conversion', $2)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      `, [submissionId, `ctm_${submissionId}`]);
      if (rows.length) jobs.push(rows[0].id);
    }

    // Email job (if recipients configured)
    if (formSettings.email_recipients?.length && formSettings.email_on_submission !== false) {
      const { rows } = await client.query(`
        INSERT INTO form_submission_jobs (submission_id, job_type, idempotency_key)
        VALUES ($1, 'email_notification', $2)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      `, [submissionId, `email_${submissionId}`]);
      if (rows.length) jobs.push(rows[0].id);
    }

    return jobs;
  } finally {
    client.release();
  }
}

