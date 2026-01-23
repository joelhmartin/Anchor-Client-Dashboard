import { query } from '../db.js';
import { sendMailgunMessageWithLogging, isMailgunConfigured } from './mailgun.js';
import { createNotification, createNotificationsForAdmins, notifyAdminsByEmail } from './notifications.js';
import { getMondaySettings, findPersonById } from './monday.js';

function formatClientName(row) {
  const name = `${row.client_first_name || ''} ${row.client_last_name || ''}`.trim();
  return name || row.client_email || 'Client';
}

async function findInternalUserIdByEmail(email) {
  if (!email) return null;
  const { rows } = await query(
    `SELECT id
     FROM users
     WHERE email = $1 AND role IN ('superadmin','admin','team')
     LIMIT 1`,
    [String(email).toLowerCase()]
  );
  return rows[0]?.id || null;
}

export async function sendOnboardingExpiryReminders({ baseUrl } = {}) {
  // Find expired, unconsumed, unrevoked tokens that haven't had a reminder sent.
  const { rows } = await query(
    `SELECT
       t.id AS token_id,
       t.user_id AS client_user_id,
       t.expires_at,
       u.email AS client_email,
       u.first_name AS client_first_name,
       u.last_name AS client_last_name,
       cp.account_manager_person_id,
       cp.onboarding_completed_at
     FROM client_onboarding_tokens t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE t.consumed_at IS NULL
       AND t.revoked_at IS NULL
       AND t.reminder_sent_at IS NULL
       AND t.expires_at < NOW()
       AND (cp.onboarding_completed_at IS NULL)`,
    []
  );

  if (!rows.length) return { processed: 0 };

  const settings = await getMondaySettings();
  const appUrl = baseUrl || process.env.APP_BASE_URL || process.env.CLIENT_APP_URL || 'http://localhost:3000';
  const hubUrl = `${String(appUrl).replace(/\/$/, '')}/client-hub`;

  let processed = 0;
  for (const r of rows) {
    const clientLabel = formatClientName(r);
    try {
      let managerEmail = '';
      let managerName = '';
      if (r.account_manager_person_id) {
        const person = await findPersonById(r.account_manager_person_id, settings);
        managerEmail = person?.email || '';
        managerName = person?.name || '';
      }

      // If we can map account manager to an internal user, create in-app notification.
      const managerUserId = managerEmail ? await findInternalUserIdByEmail(managerEmail) : null;
      const title = 'Client onboarding link expired';
      const body = `${clientLabel} did not complete onboarding before the link expired. Click "Send onboarding email" to resend.`;
      const meta = { client_id: r.client_user_id, token_id: r.token_id, type: 'onboarding_expired' };

      if (managerUserId) {
        await createNotification({ userId: managerUserId, title, body, linkUrl: '/client-hub', meta });
      } else {
        // Fallback: notify admins if we can't resolve account manager.
        await createNotificationsForAdmins({ title, body, linkUrl: '/client-hub', meta });
      }

      if (isMailgunConfigured()) {
        if (managerEmail) {
          const greeting = managerName ? `Hi ${managerName},` : 'Hi there,';
          await sendMailgunMessageWithLogging(
            {
              to: managerEmail,
              subject: `Onboarding link expired: ${clientLabel}`,
              text: `${greeting}\n\n${body}\n\nOpen Client Hub: ${hubUrl}\n`,
              html: `<p>${greeting}</p><p>${body}</p><p><a href="${hubUrl}" target="_blank" rel="noopener">Open Client Hub</a></p>`
            },
            {
              emailType: 'onboarding_reminder',
              recipientName: managerName,
              clientId: r.client_user_id,
              metadata: { token_id: r.token_id, manager_notified: true }
            }
          );
        } else {
          // Fallback email to admins if no manager email available.
          await notifyAdminsByEmail({
            subject: `Onboarding link expired: ${clientLabel}`,
            text: `${body}\n\nOpen Client Hub: ${hubUrl}\n`,
            html: `<p>${body}</p><p><a href="${hubUrl}" target="_blank" rel="noopener">Open Client Hub</a></p>`
          });
        }
      }

      await query('UPDATE client_onboarding_tokens SET reminder_sent_at = NOW() WHERE id = $1', [r.token_id]);
      processed += 1;
    } catch (err) {
      console.error('[onboarding:reminder]', err);
      // Don't mark reminder_sent_at on failure; we'll retry next run.
    }
  }

  return { processed };
}


