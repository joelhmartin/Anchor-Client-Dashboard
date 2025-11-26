import { query } from '../db.js';
import { sendMailgunMessage, isMailgunConfigured } from './mailgun.js';

const ADMIN_FALLBACK_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;

export async function createNotification({ userId, title, body, linkUrl, meta = {} }) {
  if (!userId || !title) return null;
  const { rows } = await query(
    `INSERT INTO notifications (user_id, title, body, link_url, meta)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [userId, title, body || null, linkUrl || null, JSON.stringify(meta || {})]
  );
  return rows[0];
}

export async function createNotificationsForAdmins(payload) {
  const { rows } = await query("SELECT id FROM users WHERE role = 'admin'");
  await Promise.all(rows.map((admin) => createNotification({ ...payload, userId: admin.id })));
  return rows;
}

export async function fetchUserNotifications(userId, limit = 25) {
  const { rows } = await query(
    `SELECT id, title, body, link_url, status, meta, created_at, read_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  const unreadCount = await getUnreadCount(userId);
  return { notifications: rows, unread: unreadCount };
}

export async function getUnreadCount(userId) {
  const { rows } = await query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND status = $2', [
    userId,
    'unread'
  ]);
  return Number(rows[0]?.count || 0);
}

export async function markNotificationRead(userId, notificationId) {
  await query(
    `UPDATE notifications
     SET status = 'read', read_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
}

export async function markAllNotificationsRead(userId) {
  await query(
    `UPDATE notifications
     SET status = 'read', read_at = NOW()
     WHERE user_id = $1 AND status = 'unread'`,
    [userId]
  );
}

export async function notifyAdminsByEmail({ subject, text, html }) {
  if (!isMailgunConfigured()) return;
  const { rows } = await query("SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL");
  const recipients = rows.map((row) => row.email).filter(Boolean);
  if (!recipients.length && ADMIN_FALLBACK_EMAIL) {
    recipients.push(ADMIN_FALLBACK_EMAIL);
  }
  if (!recipients.length) return;
  await sendMailgunMessage({
    to: recipients,
    subject,
    text,
    html
  });
}
