import express from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { isStaff } from '../middleware/roles.js';
import { createNotification } from '../services/notifications.js';
import { generateAiResponse } from '../services/ai.js';
import { runDueDateAutomations, runEventAutomationsForAssigneeAdded, runEventAutomationsForItemChange } from '../services/taskAutomations.js';

const router = express.Router();

router.use(requireAuth);
router.use(isStaff);

const workspaceCreateSchema = z.object({
  name: z.string().min(1).max(200)
});

const boardCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable()
});

const boardUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  workspace_id: z.string().uuid().optional()
});

const bulkBoardReportSchema = z.object({
  board_ids: z.array(z.string().uuid()).min(1),
  start_date: z.string().optional().nullable(), // YYYY-MM-DD
  end_date: z.string().optional().nullable() // YYYY-MM-DD
});

const groupCreateSchema = z.object({
  name: z.string().min(1).max(200),
  order_index: z.number().int().min(0).optional()
});

const itemCreateSchema = z.object({
  name: z.string().min(1).max(500),
  status: z.string().max(100).optional(), // Now accepts any string - board-specific labels
  due_date: z.string().optional().nullable(), // YYYY-MM-DD
  is_voicemail: z.boolean().optional(),
  needs_attention: z.boolean().optional()
});

const itemUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  status: z.string().max(100).optional(), // Now accepts any string - board-specific labels
  due_date: z.string().optional().nullable(),
  is_voicemail: z.boolean().optional(),
  needs_attention: z.boolean().optional()
});

const updateCreateSchema = z.object({
  content: z.string().min(1).max(20000)
});

const timeEntryCreateSchema = z.object({
  time_spent_minutes: z.coerce.number().int().min(0),
  billable_minutes: z.coerce.number().int().min(0).optional(),
  description: z.string().max(5000).optional().nullable(),
  work_category: z.string().max(120).optional().nullable(),
  is_billable: z.coerce.boolean().optional()
});

const automationCreateSchema = z.object({
  name: z.string().min(1).max(200),
  trigger_type: z.enum(['status_change', 'assignee_added', 'due_date_relative']),
  trigger_config: z.record(z.any()).optional(),
  action_type: z.enum(['notify_admins', 'notify_assignees', 'set_status', 'set_needs_attention', 'add_update']),
  action_config: z.record(z.any()).optional(),
  is_active: z.boolean().optional()
});

const automationUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  trigger_type: z.enum(['status_change', 'assignee_added', 'due_date_relative']).optional(),
  trigger_config: z.record(z.any()).optional(),
  action_type: z.enum(['notify_admins', 'notify_assignees', 'set_status', 'set_needs_attention', 'add_update']).optional(),
  action_config: z.record(z.any()).optional(),
  is_active: z.boolean().optional()
});

function validateAutomationPayload(payload) {
  const triggerType = String(payload.trigger_type || '');
  const actionType = String(payload.action_type || '');
  const trigger = payload.trigger_config || {};
  const action = payload.action_config || {};

  if (triggerType === 'status_change') {
    if (trigger.to_status !== undefined && typeof trigger.to_status !== 'string') {
      throw new Error('trigger_config.to_status must be a string');
    }
  }

  if (triggerType === 'due_date_relative') {
    const n = Number(trigger.days_from_due);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error('trigger_config.days_from_due must be an integer');
    }
    if (n < -365 || n > 365) {
      throw new Error('trigger_config.days_from_due must be between -365 and 365');
    }
  }

  if (actionType === 'set_status') {
    if (!String(action.status || '').trim()) {
      throw new Error('action_config.status is required for set_status');
    }
  }

  if (actionType === 'set_needs_attention') {
    if (action.value === undefined) {
      throw new Error('action_config.value is required for set_needs_attention');
    }
  }

  if (actionType === 'add_update') {
    if (!String(action.content || '').trim()) {
      throw new Error('action_config.content is required for add_update');
    }
  }
}

const workspaceMemberAddSchema = z
  .object({
    user_id: z.string().uuid().optional(),
    email: z.string().email().optional(),
    role: z.enum(['admin', 'member']).optional()
  })
  .refine((v) => Boolean(v.user_id || v.email), { message: 'user_id or email is required' });

const workspaceMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member'])
});

const itemAssigneeAddSchema = z
  .object({
    user_id: z.string().uuid().optional(),
    email: z.string().email().optional()
  })
  .refine((v) => Boolean(v.user_id || v.email), { message: 'user_id or email is required' });

const subitemCreateSchema = z.object({
  name: z.string().min(1).max(500),
  status: z.string().max(100).optional(), // Now accepts any string status label
  due_date: z.string().optional().nullable() // YYYY-MM-DD
});

const subitemUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  status: z.string().max(100).optional(), // Now accepts any string status label
  due_date: z.string().optional().nullable()
});

// Status label management schema
const colorHexSchema = z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);

const statusLabelCreateSchema = z.object({
  label: z.string().min(1).max(100),
  color: colorHexSchema.optional(), // supports #RRGGBB and #RRGGBBAA
  order_index: z.number().int().min(0).optional(),
  is_done_state: z.boolean().optional()
});

const statusLabelUpdateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  color: colorHexSchema.optional(), // supports #RRGGBB and #RRGGBBAA
  order_index: z.number().int().min(0).optional(),
  is_done_state: z.boolean().optional()
});

const globalStatusLabelCreateSchema = statusLabelCreateSchema;

function getEffectiveRole(req) {
  return req.user?.effective_role || req.user?.role;
}

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
const taskFilesDir = path.join(uploadRoot, 'tasks');
if (!fs.existsSync(taskFilesDir)) fs.mkdirSync(taskFilesDir, { recursive: true });

function safeFilename(name) {
  return String(name || 'upload').replace(/[^\w.-]+/g, '_');
}

const uploadTaskFile = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, taskFilesDir),
    filename: (_req, file, cb) => {
      const rand = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}_${rand}_${safeFilename(file.originalname)}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

async function assertWorkspaceAccess({ effRole, userId, workspaceId }) {
  // Staff are implicit members of all task workspaces/boards.
  if (effRole === 'superadmin' || effRole === 'admin' || effRole === 'team') return true;
  const { rowCount } = await query(
    `SELECT 1
     FROM task_workspace_memberships
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
  return rowCount > 0;
}

function extractMentionEmails(text = '') {
  const input = String(text || '');
  // Mentions are @email@example.com
  const regex = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const emails = new Set();
  let match;
  while ((match = regex.exec(input)) !== null) {
    const email = String(match[1] || '')
      .trim()
      .toLowerCase();
    if (email) emails.add(email);
  }
  return Array.from(emails);
}

async function notifyMentionedUsers({ itemId, workspaceId, actorUserId, content }) {
  const emails = extractMentionEmails(content);
  if (!emails.length) return;

  const { rows: users } = await query(
    `SELECT id, email, role
     FROM users
     WHERE lower(email) = ANY($1)`,
    [emails]
  );
  if (!users.length) return;

  // Only notify users who can access this workspace (avoid leaking references).
  const allowedIds = [];
  for (const u of users) {
    if (!u?.id || u.id === actorUserId) continue;
    const ok = await assertWorkspaceAccess({ effRole: u.role, userId: u.id, workspaceId });
    if (ok) allowedIds.push(u.id);
  }
  if (!allowedIds.length) return;

  const { rows: itemRows } = await query('SELECT id, name FROM task_items WHERE id = $1 LIMIT 1', [itemId]);
  const itemName = itemRows[0]?.name || 'Task item';
  const boardId = await getBoardIdForItem(itemId);
  const linkUrl = boardId
    ? `/tasks?pane=boards&board=${encodeURIComponent(boardId)}&item=${encodeURIComponent(itemId)}`
    : '/tasks?pane=boards';

  await Promise.all(
    allowedIds.map((uid) =>
      createNotification({
        userId: uid,
        title: 'You were mentioned in a task update',
        body: `${itemName}`,
        linkUrl,
        meta: {
          source: 'task_mention',
          item_id: itemId,
          workspace_id: workspaceId,
          actor_user_id: actorUserId
        }
      })
    )
  );
}

async function getWorkspaceIdForBoard(boardId) {
  const { rows } = await query('SELECT workspace_id FROM task_boards WHERE id = $1', [boardId]);
  return rows[0]?.workspace_id || null;
}

async function getWorkspaceIdForGroup(groupId) {
  const { rows } = await query(
    `SELECT b.workspace_id
     FROM task_groups g
     JOIN task_boards b ON b.id = g.board_id
     WHERE g.id = $1`,
    [groupId]
  );
  return rows[0]?.workspace_id || null;
}

async function getWorkspaceIdForItem(itemId) {
  const { rows } = await query(
    `SELECT b.workspace_id
     FROM task_items i
     JOIN task_groups g ON g.id = i.group_id
     JOIN task_boards b ON b.id = g.board_id
     WHERE i.id = $1`,
    [itemId]
  );
  return rows[0]?.workspace_id || null;
}

async function getBoardIdForItem(itemId) {
  const { rows } = await query(
    `SELECT g.board_id
     FROM task_items i
     JOIN task_groups g ON g.id = i.group_id
     WHERE i.id = $1`,
    [itemId]
  );
  return rows[0]?.board_id || null;
}

async function getBoardIdForGroup(groupId) {
  const { rows } = await query('SELECT board_id FROM task_groups WHERE id = $1', [groupId]);
  return rows[0]?.board_id || null;
}

async function getWorkspaceIdForSubitem(subitemId) {
  const { rows } = await query(
    `SELECT b.workspace_id
     FROM task_subitems s
     JOIN task_items i ON i.id = s.parent_item_id
     JOIN task_groups g ON g.id = i.group_id
     JOIN task_boards b ON b.id = g.board_id
     WHERE s.id = $1`,
    [subitemId]
  );
  return rows[0]?.workspace_id || null;
}

// Automations are implemented in server/services/taskAutomations.js

router.get('/workspaces', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  try {
    // Staff are implicit members of all task workspaces.
    if (eff === 'superadmin' || eff === 'admin' || eff === 'team') {
      const { rows } = await query('SELECT * FROM task_workspaces ORDER BY created_at DESC');
      return res.json({ workspaces: rows });
    }
    const { rows } = await query(
      `SELECT w.*
       FROM task_workspaces w
       JOIN task_workspace_memberships m ON m.workspace_id = w.id
       WHERE m.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    );
    return res.json({ workspaces: rows });
  } catch (err) {
    console.error('[tasks:workspaces:list]', err);
    return res.status(500).json({ message: 'Unable to load workspaces' });
  }
});

router.post('/workspaces', async (req, res) => {
  const eff = getEffectiveRole(req);
  if (eff !== 'superadmin' && eff !== 'admin') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }
  try {
    const payload = workspaceCreateSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO task_workspaces (name, created_by)
       VALUES ($1, $2)
       RETURNING *`,
      [payload.name.trim(), req.user.id]
    );
    // creator becomes workspace admin
    await query(
      `INSERT INTO task_workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'admin'`,
      [rows[0].id, req.user.id]
    );
    return res.status(201).json({ workspace: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    }
    console.error('[tasks:workspaces:create]', err);
    return res.status(500).json({ message: 'Unable to create workspace' });
  }
});

// Delete a workspace (cascades boards/groups/items)
router.delete('/workspaces/:workspaceId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { workspaceId } = req.params;
  if (eff !== 'superadmin' && eff !== 'admin') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }
  try {
    const { rows: exists } = await query('SELECT id FROM task_workspaces WHERE id = $1 LIMIT 1', [workspaceId]);
    if (!exists.length) return res.status(404).json({ message: 'Workspace not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    await query('DELETE FROM task_workspaces WHERE id = $1', [workspaceId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[tasks:workspaces:delete]', err);
    return res.status(500).json({ message: 'Unable to delete workspace' });
  }
});

// Workspace members (admin UI)
router.get('/workspaces/:workspaceId/members', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { workspaceId } = req.params;
  try {
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    // Include implicit staff members for every workspace.
    const { rows } = await query(
      `WITH explicit_members AS (
         SELECT
           m.user_id,
           m.role AS membership_role,
           m.created_at,
           u.email,
           u.first_name,
           u.last_name,
           u.role AS user_role,
           u.avatar_url,
           1 AS precedence
         FROM task_workspace_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = $1
       ),
       implicit_staff AS (
         SELECT
           u.id AS user_id,
           CASE WHEN u.role IN ('superadmin','admin') THEN 'admin' ELSE 'member' END AS membership_role,
           NULL::timestamptz AS created_at,
           u.email,
           u.first_name,
           u.last_name,
           u.role AS user_role,
           u.avatar_url,
           2 AS precedence
         FROM users u
         WHERE u.role IN ('superadmin','admin','team')
       )
       SELECT DISTINCT ON (user_id)
         user_id, membership_role, created_at, email, first_name, last_name, user_role, avatar_url
       FROM (
         SELECT * FROM explicit_members
         UNION ALL
         SELECT * FROM implicit_staff
       ) t
       ORDER BY user_id, precedence`,
      [workspaceId]
    );
    return res.json({ members: rows });
  } catch (err) {
    console.error('[tasks:workspace-members:list]', err);
    return res.status(500).json({ message: 'Unable to load workspace members' });
  }
});

router.get('/workspaces/:workspaceId/members/search', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { workspaceId } = req.params;
  const q = String(req.query.q || '').trim();
  try {
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    if (!q) return res.json({ members: [] });
    const like = `%${q.toLowerCase()}%`;
    const { rows } = await query(
      `WITH explicit_members AS (
         SELECT
           m.user_id,
           m.role AS membership_role,
           u.email,
           u.first_name,
           u.last_name,
           u.role AS user_role,
           1 AS precedence
         FROM task_workspace_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = $1
       ),
       implicit_staff AS (
         SELECT
           u.id AS user_id,
           CASE WHEN u.role IN ('superadmin','admin') THEN 'admin' ELSE 'member' END AS membership_role,
           u.email,
           u.first_name,
           u.last_name,
           u.role AS user_role,
           2 AS precedence
         FROM users u
         WHERE u.role IN ('superadmin','admin','team')
       ),
       combined AS (
         SELECT DISTINCT ON (user_id)
           user_id, membership_role, email, first_name, last_name, user_role
         FROM (
           SELECT * FROM explicit_members
           UNION ALL
           SELECT * FROM implicit_staff
         ) t
         ORDER BY user_id, precedence
       )
       SELECT *
       FROM combined
       WHERE (
         lower(email) LIKE $2
         OR lower(first_name) LIKE $2
         OR lower(last_name) LIKE $2
         OR lower(first_name || ' ' || last_name) LIKE $2
       )
       ORDER BY email ASC
       LIMIT 10`,
      [workspaceId, like]
    );
    return res.json({ members: rows });
  } catch (err) {
    console.error('[tasks:workspace-members:search]', err);
    return res.status(500).json({ message: 'Unable to search workspace members' });
  }
});

router.post('/workspaces/:workspaceId/members', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { workspaceId } = req.params;
  if (eff !== 'superadmin' && eff !== 'admin') return res.status(403).json({ message: 'Insufficient permissions' });
  try {
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = workspaceMemberAddSchema.parse(req.body);
    let targetUserId = payload.user_id;
    if (!targetUserId && payload.email) {
      const { rows } = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [payload.email]);
      targetUserId = rows[0]?.id || null;
    }
    if (!targetUserId) return res.status(404).json({ message: 'User not found' });

    const role = payload.role || 'member';
    await query(
      `INSERT INTO task_workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [workspaceId, targetUserId, role]
    );

    const { rows: members } = await query(
      `SELECT
         m.user_id,
         m.role AS membership_role,
         m.created_at,
         u.email,
         u.first_name,
         u.last_name,
         u.role AS user_role
       FROM task_workspace_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = $1 AND m.user_id = $2
       LIMIT 1`,
      [workspaceId, targetUserId]
    );
    return res.status(201).json({ member: members[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:workspace-members:add]', err);
    return res.status(500).json({ message: 'Unable to add workspace member' });
  }
});

router.patch('/workspaces/:workspaceId/members/:memberUserId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { workspaceId, memberUserId } = req.params;
  if (eff !== 'superadmin' && eff !== 'admin') return res.status(403).json({ message: 'Insufficient permissions' });
  try {
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = workspaceMemberRoleSchema.parse(req.body);
    const { rowCount } = await query(
      `UPDATE task_workspace_memberships
       SET role = $1
       WHERE workspace_id = $2 AND user_id = $3`,
      [payload.role, workspaceId, memberUserId]
    );
    if (!rowCount) return res.status(404).json({ message: 'Member not found' });

    const { rows } = await query(
      `SELECT
         m.user_id,
         m.role AS membership_role,
         m.created_at,
         u.email,
         u.first_name,
         u.last_name,
         u.role AS user_role
       FROM task_workspace_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = $1 AND m.user_id = $2
       LIMIT 1`,
      [workspaceId, memberUserId]
    );
    return res.json({ member: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:workspace-members:update]', err);
    return res.status(500).json({ message: 'Unable to update workspace member' });
  }
});

router.delete('/workspaces/:workspaceId/members/:memberUserId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { workspaceId, memberUserId } = req.params;
  if (eff !== 'superadmin' && eff !== 'admin') return res.status(403).json({ message: 'Insufficient permissions' });
  try {
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const { rowCount } = await query(`DELETE FROM task_workspace_memberships WHERE workspace_id = $1 AND user_id = $2`, [
      workspaceId,
      memberUserId
    ]);
    if (!rowCount) return res.status(404).json({ message: 'Member not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[tasks:workspace-members:remove]', err);
    return res.status(500).json({ message: 'Unable to remove workspace member' });
  }
});

// Boards
router.get('/workspaces/:workspaceId/boards', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { workspaceId } = req.params;
  try {
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const { rows } = await query(
      `SELECT *
       FROM task_boards
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    return res.json({ boards: rows });
  } catch (err) {
    console.error('[tasks:boards:list]', err);
    return res.status(500).json({ message: 'Unable to load boards' });
  }
});

router.get('/boards', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  try {
    // Staff can see all boards. Non-staff never hit this router because router.use(isStaff).
    const { rows } = await query(
      `SELECT b.*, w.name AS workspace_name
       FROM task_boards b
       JOIN task_workspaces w ON w.id = b.workspace_id
       ORDER BY w.created_at DESC, b.created_at DESC`
    );
    return res.json({ boards: rows });
  } catch (err) {
    console.error('[tasks:boards:list-all]', err);
    return res.status(500).json({ message: 'Unable to load boards' });
  }
});

router.post('/workspaces/:workspaceId/boards', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { workspaceId } = req.params;
  try {
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const payload = boardCreateSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO task_boards (workspace_id, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [workspaceId, payload.name.trim(), payload.description ?? null, req.user.id]
    );
    return res.status(201).json({ board: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:boards:create]', err);
    return res.status(500).json({ message: 'Unable to create board' });
  }
});

// Delete a board (cascades groups/items)
router.delete('/boards/:boardId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  if (eff !== 'superadmin' && eff !== 'admin') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    await query('DELETE FROM task_boards WHERE id = $1', [boardId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[tasks:boards:delete]', err);
    return res.status(500).json({ message: 'Unable to delete board' });
  }
});

router.patch('/boards/:boardId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = boardUpdateSchema.parse(req.body);
    const fields = [];
    const values = [];
    let i = 1;
    if (payload.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(payload.name.trim());
    }
    if (payload.description !== undefined) {
      fields.push(`description = $${i++}`);
      values.push(payload.description ?? null);
    }
    if (payload.workspace_id !== undefined && payload.workspace_id !== workspaceId) {
      // Ensure user has access to destination workspace too.
      const okDest = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId: payload.workspace_id });
      if (!okDest) return res.status(403).json({ message: 'Insufficient permissions for destination workspace' });
      fields.push(`workspace_id = $${i++}`);
      values.push(payload.workspace_id);
    }
    if (!fields.length) return res.status(400).json({ message: 'No changes provided' });
    values.push(boardId);
    const { rows } = await query(
      `UPDATE task_boards
       SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING *`,
      values
    );
    return res.json({ board: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:boards:update]', err);
    return res.status(500).json({ message: 'Unable to update board' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATUS LABELS (per board)
// ─────────────────────────────────────────────────────────────────────────────

// Get status labels for a board
router.get('/boards/:boardId/status-labels', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const [{ rows: boardRows }, { rows: globalRows }] = await Promise.all([
      query(
      `SELECT * FROM task_board_status_labels
       WHERE board_id = $1
       ORDER BY order_index ASC, label ASC`,
        [boardId]
      ),
      query(
        `SELECT * FROM task_global_status_labels
         ORDER BY order_index ASC, label ASC`,
        []
      )
    ]);

    // Merge global + board labels. Board labels override global ones with the same label text.
    const merged = [];
    const seen = new Map(); // key=labelLower -> index
    for (const r of globalRows) {
      const key = String(r.label || '').trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.set(key, merged.length);
      merged.push({ ...r, is_global: true });
    }
    for (const r of boardRows) {
      const key = String(r.label || '').trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        merged[seen.get(key)] = { ...r, is_global: false };
      } else {
        seen.set(key, merged.length);
        merged.push({ ...r, is_global: false });
      }
    }

    // Return defaults if none exist
    const defaultLabels = [
      { id: 'default-todo', label: 'To Do', color: '#808080', order_index: 0, is_done_state: false },
      { id: 'default-working', label: 'Working on it', color: '#fdab3d', order_index: 1, is_done_state: false },
      { id: 'default-stuck', label: 'Stuck', color: '#e2445c', order_index: 2, is_done_state: false },
      { id: 'default-done', label: 'Done', color: '#00c875', order_index: 3, is_done_state: true },
      { id: 'default-needs-attention', label: 'Needs Attention', color: '#ff642e', order_index: 4, is_done_state: false }
    ];

    return res.json({ status_labels: merged.length ? merged : defaultLabels });
  } catch (err) {
    console.error('[tasks:status-labels:list]', err);
    return res.status(500).json({ message: 'Unable to load status labels' });
  }
});

// List global status labels
router.get('/status-labels/global', async (req, res) => {
  const eff = getEffectiveRole(req);
  if (!['superadmin', 'admin'].includes(eff)) {
    return res.status(403).json({ message: 'Only admins can manage status labels' });
  }
  try {
    const { rows } = await query(
      `SELECT * FROM task_global_status_labels ORDER BY order_index ASC, label ASC`,
      []
    );
    return res.json({ status_labels: rows });
  } catch (err) {
    console.error('[tasks:status-labels:global:list]', err);
    return res.status(500).json({ message: 'Unable to load global status labels' });
  }
});

// Create a global status label
router.post('/status-labels/global', async (req, res) => {
  const eff = getEffectiveRole(req);
  if (!['superadmin', 'admin'].includes(eff)) {
    return res.status(403).json({ message: 'Only admins can manage status labels' });
  }
  try {
    const payload = globalStatusLabelCreateSchema.parse(req.body);
    const { rows: maxRows } = await query(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM task_global_status_labels`,
      []
    );
    const orderIndex = payload.order_index ?? maxRows[0].next_order;
    const { rows } = await query(
      `INSERT INTO task_global_status_labels (label, color, order_index, is_done_state, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [payload.label.trim(), payload.color || '#808080', orderIndex, payload.is_done_state ?? false, req.user.id]
    );
    return res.status(201).json({ status_label: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:status-labels:global:create]', err);
    return res.status(500).json({ message: 'Unable to create global status label' });
  }
});

// Create a status label for a board
router.post('/boards/:boardId/status-labels', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    // Only admins can create status labels
    if (!['superadmin', 'admin'].includes(eff)) {
      return res.status(403).json({ message: 'Only admins can manage status labels' });
    }

    const payload = statusLabelCreateSchema.parse(req.body);

    // Get max order_index
    const { rows: maxRows } = await query(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM task_board_status_labels WHERE board_id = $1`,
      [boardId]
    );
    const orderIndex = payload.order_index ?? maxRows[0].next_order;

    const { rows } = await query(
      `INSERT INTO task_board_status_labels (board_id, label, color, order_index, is_done_state)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [boardId, payload.label.trim(), payload.color || '#808080', orderIndex, payload.is_done_state ?? false]
    );

    return res.status(201).json({ status_label: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:status-labels:create]', err);
    return res.status(500).json({ message: 'Unable to create status label' });
  }
});

// Update a status label
router.patch('/status-labels/:labelId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { labelId } = req.params;
  try {
    // Get the label to find its board
    const { rows: labelRows } = await query('SELECT * FROM task_board_status_labels WHERE id = $1', [labelId]);
    if (!labelRows.length) return res.status(404).json({ message: 'Status label not found' });
    const label = labelRows[0];

    const workspaceId = await getWorkspaceIdForBoard(label.board_id);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    // Only admins can update status labels
    if (!['superadmin', 'admin'].includes(eff)) {
      return res.status(403).json({ message: 'Only admins can manage status labels' });
    }

    const payload = statusLabelUpdateSchema.parse(req.body);
    const fields = [];
    const values = [];
    let i = 1;
    if (payload.label !== undefined) {
      fields.push(`label = $${i++}`);
      values.push(payload.label.trim());
    }
    if (payload.color !== undefined) {
      fields.push(`color = $${i++}`);
      values.push(payload.color);
    }
    if (payload.order_index !== undefined) {
      fields.push(`order_index = $${i++}`);
      values.push(payload.order_index);
    }
    if (payload.is_done_state !== undefined) {
      fields.push(`is_done_state = $${i++}`);
      values.push(payload.is_done_state);
    }
    if (!fields.length) return res.status(400).json({ message: 'No changes provided' });
    values.push(labelId);
    const { rows } = await query(
      `UPDATE task_board_status_labels SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return res.json({ status_label: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:status-labels:update]', err);
    return res.status(500).json({ message: 'Unable to update status label' });
  }
});

// Delete a status label
router.delete('/status-labels/:labelId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { labelId } = req.params;
  try {
    // Get the label to find its board
    const { rows: labelRows } = await query('SELECT * FROM task_board_status_labels WHERE id = $1', [labelId]);
    if (!labelRows.length) return res.status(404).json({ message: 'Status label not found' });
    const label = labelRows[0];

    const workspaceId = await getWorkspaceIdForBoard(label.board_id);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    // Only admins can delete status labels
    if (!['superadmin', 'admin'].includes(eff)) {
      return res.status(403).json({ message: 'Only admins can manage status labels' });
    }

    await query('DELETE FROM task_board_status_labels WHERE id = $1', [labelId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[tasks:status-labels:delete]', err);
    return res.status(500).json({ message: 'Unable to delete status label' });
  }
});

// Initialize default labels for a board (copies defaults to DB so they can be customized)
router.post('/boards/:boardId/status-labels/init', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    // Only admins can initialize status labels
    if (!['superadmin', 'admin'].includes(eff)) {
      return res.status(403).json({ message: 'Only admins can manage status labels' });
    }

    // Check if labels already exist
    const { rows: existing } = await query('SELECT COUNT(*) FROM task_board_status_labels WHERE board_id = $1', [boardId]);
    if (Number(existing[0].count) > 0) {
      return res.status(400).json({ message: 'Status labels already initialized for this board' });
    }

    // Insert default labels
    const defaults = [
      { label: 'To Do', color: '#808080', order_index: 0, is_done_state: false },
      { label: 'Working on it', color: '#fdab3d', order_index: 1, is_done_state: false },
      { label: 'Stuck', color: '#e2445c', order_index: 2, is_done_state: false },
      { label: 'Done', color: '#00c875', order_index: 3, is_done_state: true },
      { label: 'Needs Attention', color: '#ff642e', order_index: 4, is_done_state: false }
    ];

    const insertedLabels = [];
    for (const d of defaults) {
      const { rows } = await query(
        `INSERT INTO task_board_status_labels (board_id, label, color, order_index, is_done_state)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [boardId, d.label, d.color, d.order_index, d.is_done_state]
      );
      insertedLabels.push(rows[0]);
    }

    return res.status(201).json({ status_labels: insertedLabels });
  } catch (err) {
    console.error('[tasks:status-labels:init]', err);
    return res.status(500).json({ message: 'Unable to initialize status labels' });
  }
});

router.post('/reports/boards', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  try {
    const payload = bulkBoardReportSchema.parse(req.body);
    const boardIds = payload.board_ids;
    const startDate = payload.start_date ? `${payload.start_date}T00:00:00.000Z` : null;
    const endDate = payload.end_date ? `${payload.end_date}T23:59:59.999Z` : null;

    // Ensure requester can access each board's workspace (team/staff are implicit).
    const { rows: boardRows } = await query(
      `SELECT b.id, b.name, b.workspace_id, w.name AS workspace_name
       FROM task_boards b
       JOIN task_workspaces w ON w.id = b.workspace_id
       WHERE b.id = ANY($1)`,
      [boardIds]
    );
    if (!boardRows.length) return res.json({ rows: [] });
    for (const b of boardRows) {
      const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId: b.workspace_id });
      if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { rows: itemAgg } = await query(
      `SELECT
         b.id AS board_id,
         COUNT(i.*)::int AS total_items,
         SUM(CASE WHEN i.status = 'todo' THEN 1 ELSE 0 END)::int AS todo,
         SUM(CASE WHEN i.status = 'working' THEN 1 ELSE 0 END)::int AS working,
         SUM(CASE WHEN i.status = 'blocked' THEN 1 ELSE 0 END)::int AS blocked,
         SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END)::int AS done,
         SUM(CASE WHEN i.status = 'needs_attention' THEN 1 ELSE 0 END)::int AS needs_attention_status,
         SUM(CASE WHEN i.needs_attention = TRUE THEN 1 ELSE 0 END)::int AS needs_attention_flag,
         SUM(CASE WHEN i.is_voicemail = TRUE THEN 1 ELSE 0 END)::int AS voicemail,
         SUM(CASE WHEN $2::timestamptz IS NOT NULL AND $3::timestamptz IS NOT NULL AND i.updated_at BETWEEN $2 AND $3 THEN 1 ELSE 0 END)::int AS items_updated_in_range,
         SUM(CASE WHEN $2::timestamptz IS NOT NULL AND $3::timestamptz IS NOT NULL AND i.created_at BETWEEN $2 AND $3 THEN 1 ELSE 0 END)::int AS items_created_in_range
       FROM task_boards b
       JOIN task_groups g ON g.board_id = b.id
       JOIN task_items i ON i.group_id = g.id
       WHERE b.id = ANY($1)
         AND i.archived_at IS NULL
       GROUP BY b.id`,
      [boardIds, startDate, endDate]
    );

    const { rows: updatesAgg } = await query(
      `SELECT
         b.id AS board_id,
         COUNT(u.*)::int AS updates_in_range
       FROM task_boards b
       JOIN task_groups g ON g.board_id = b.id
       JOIN task_items i ON i.group_id = g.id
       JOIN task_updates u ON u.item_id = i.id
       WHERE b.id = ANY($1)
         AND i.archived_at IS NULL
         AND ($2::timestamptz IS NULL OR u.created_at >= $2)
         AND ($3::timestamptz IS NULL OR u.created_at <= $3)
       GROUP BY b.id`,
      [boardIds, startDate, endDate]
    );

    const { rows: timeAgg } = await query(
      `SELECT
         b.id AS board_id,
         COALESCE(SUM(t.time_spent_minutes), 0)::int AS time_minutes_in_range
       FROM task_boards b
       JOIN task_groups g ON g.board_id = b.id
       JOIN task_items i ON i.group_id = g.id
       JOIN task_time_entries t ON t.item_id = i.id
       WHERE b.id = ANY($1)
         AND i.archived_at IS NULL
         AND ($2::timestamptz IS NULL OR t.created_at >= $2)
         AND ($3::timestamptz IS NULL OR t.created_at <= $3)
       GROUP BY b.id`,
      [boardIds, startDate, endDate]
    );

    const updatesMap = Object.fromEntries(updatesAgg.map((r) => [r.board_id, r]));
    const timeMap = Object.fromEntries(timeAgg.map((r) => [r.board_id, r]));
    const itemMap = Object.fromEntries(itemAgg.map((r) => [r.board_id, r]));

    const rowsOut = boardRows.map((b) => {
      const items = itemMap[b.id] || {};
      const updates = updatesMap[b.id] || {};
      const time = timeMap[b.id] || {};
      return {
        board_id: b.id,
        board_name: b.name,
        workspace_name: b.workspace_name,
        ...items,
        updates_in_range: Number(updates.updates_in_range || 0),
        time_minutes_in_range: Number(time.time_minutes_in_range || 0)
      };
    });

    return res.json({ rows: rowsOut });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:reports:boards]', err);
    return res.status(500).json({ message: 'Unable to run report' });
  }
});

// Billing report - item-level time entries for selected boards within date range
router.post('/reports/billing', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  try {
    const payload = bulkBoardReportSchema.parse(req.body);
    const boardIds = payload.board_ids;
    const startDate = payload.start_date ? `${payload.start_date}T00:00:00.000Z` : null;
    const endDate = payload.end_date ? `${payload.end_date}T23:59:59.999Z` : null;

    // Ensure requester can access each board's workspace
    const { rows: boardRows } = await query(
      `SELECT b.id, b.name, b.workspace_id, w.name AS workspace_name
       FROM task_boards b
       JOIN task_workspaces w ON w.id = b.workspace_id
       WHERE b.id = ANY($1)`,
      [boardIds]
    );
    if (!boardRows.length) return res.json({ items: [] });
    for (const b of boardRows) {
      const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId: b.workspace_id });
      if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Get all items from selected boards
    const { rows: items } = await query(
      `SELECT
         i.id AS item_id,
         i.name AS item_name,
         i.status,
         to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
         g.name AS group_name,
         b.id AS board_id,
         b.name AS board_name,
         w.name AS workspace_name
       FROM task_items i
       JOIN task_groups g ON g.id = i.group_id
       JOIN task_boards b ON b.id = g.board_id
       JOIN task_workspaces w ON w.id = b.workspace_id
       WHERE b.id = ANY($1)
         AND i.archived_at IS NULL
       ORDER BY w.name, b.name, g.name, i.name`,
      [boardIds]
    );

    // Get time entries for these items within date range
    const itemIds = items.map((i) => i.item_id);
    let timeEntries = [];
    if (itemIds.length) {
      let timeQuery = `
        SELECT
          t.id AS entry_id,
          t.item_id,
          t.time_spent_minutes,
          t.billable_minutes,
          t.is_billable,
          t.work_category,
          t.description,
          t.created_at,
          COALESCE(u.first_name || ' ' || u.last_name, u.email, 'Unknown') AS user_name
        FROM task_time_entries t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.item_id = ANY($1)
      `;
      const params = [itemIds];
      if (startDate) {
        timeQuery += ` AND t.created_at >= $${params.length + 1}`;
        params.push(startDate);
      }
      if (endDate) {
        timeQuery += ` AND t.created_at <= $${params.length + 1}`;
        params.push(endDate);
      }
      timeQuery += ' ORDER BY t.created_at DESC';
      const { rows } = await query(timeQuery, params);
      timeEntries = rows;
    }

    // Group time entries by item
    const timeByItem = {};
    for (const t of timeEntries) {
      if (!timeByItem[t.item_id]) timeByItem[t.item_id] = [];
      timeByItem[t.item_id].push(t);
    }

    // Build final rows: one row per item with aggregated time info
    const output = items.map((item) => {
      const entries = timeByItem[item.item_id] || [];
      const totalMinutes = entries.reduce((sum, e) => sum + (e.time_spent_minutes || 0), 0);
      const billableMinutes = entries.reduce((sum, e) => sum + (e.billable_minutes || 0), 0);
      return {
        ...item,
        time_entries: entries,
        total_minutes: totalMinutes,
        billable_minutes: billableMinutes,
        entry_count: entries.length
      };
    });

    // Filter to only items with time entries in range (for billing relevance)
    const filtered = output.filter((r) => r.entry_count > 0);

    return res.json({ items: filtered });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:reports:billing]', err);
    return res.status(500).json({ message: 'Unable to run billing report' });
  }
});

// Board view (board + groups + items)
router.get('/boards/:boardId/view', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const boardRes = await query('SELECT * FROM task_boards WHERE id = $1', [boardId]);
    const groupsRes = await query(
      `SELECT *
       FROM task_groups
       WHERE board_id = $1
       ORDER BY order_index ASC, name ASC`,
      [boardId]
    );
    const itemsRes = await query(
      `SELECT i.*
       FROM task_items i
       JOIN task_groups g ON g.id = i.group_id
       WHERE g.board_id = $1
         AND i.archived_at IS NULL
       ORDER BY i.updated_at DESC, i.created_at DESC`,
      [boardId]
    );
    const itemIds = itemsRes.rows.map((r) => r.id);

    let assigneesByItem = {};
    let timeTotalsByItem = {};
    let updateCountsByItem = {};

    if (itemIds.length) {
      const { rows: assigneeRows } = await query(
        `SELECT a.item_id, u.id AS user_id, u.email, u.first_name, u.last_name, u.avatar_url
         FROM task_item_assignees a
         JOIN users u ON u.id = a.user_id
         WHERE a.item_id = ANY($1)
         ORDER BY u.email ASC`,
        [itemIds]
      );
      for (const r of assigneeRows) {
        if (!assigneesByItem[r.item_id]) assigneesByItem[r.item_id] = [];
        assigneesByItem[r.item_id].push({
          user_id: r.user_id,
          email: r.email,
          first_name: r.first_name,
          last_name: r.last_name,
          avatar_url: r.avatar_url
        });
      }

      const { rows: timeRows } = await query(
        `SELECT item_id, SUM(time_spent_minutes)::int AS total_minutes
         FROM task_time_entries
         WHERE item_id = ANY($1)
         GROUP BY item_id`,
        [itemIds]
      );
      for (const r of timeRows) {
        timeTotalsByItem[r.item_id] = Number(r.total_minutes || 0);
      }

      const { rows: updateRows } = await query(
        `SELECT item_id, COUNT(*)::int AS update_count
         FROM task_updates
         WHERE item_id = ANY($1)
         GROUP BY item_id`,
        [itemIds]
      );
      for (const r of updateRows) {
        updateCountsByItem[r.item_id] = Number(r.update_count || 0);
      }
    }

    // Fetch status labels for this board
    const [{ rows: statusLabels }, { rows: globalLabels }] = await Promise.all([
      query(
        `SELECT * FROM task_board_status_labels
         WHERE board_id = $1
         ORDER BY order_index ASC, label ASC`,
        [boardId]
      ),
      query(
        `SELECT * FROM task_global_status_labels
         ORDER BY order_index ASC, label ASC`,
        []
      )
    ]);

    const mergedLabels = [];
    const seen = new Map();
    for (const r of globalLabels) {
      const key = String(r.label || '').trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.set(key, mergedLabels.length);
      mergedLabels.push({ ...r, is_global: true });
    }
    for (const r of statusLabels) {
      const key = String(r.label || '').trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        mergedLabels[seen.get(key)] = { ...r, is_global: false };
      } else {
        seen.set(key, mergedLabels.length);
        mergedLabels.push({ ...r, is_global: false });
      }
    }

    // If no custom labels, return default labels
    const defaultLabels = [
      { id: 'default-todo', label: 'To Do', color: '#808080', order_index: 0, is_done_state: false },
      { id: 'default-working', label: 'Working on it', color: '#fdab3d', order_index: 1, is_done_state: false },
      { id: 'default-stuck', label: 'Stuck', color: '#e2445c', order_index: 2, is_done_state: false },
      { id: 'default-done', label: 'Done', color: '#00c875', order_index: 3, is_done_state: true },
      { id: 'default-needs-attention', label: 'Needs Attention', color: '#ff642e', order_index: 4, is_done_state: false }
    ];

    return res.json({
      board: boardRes.rows[0],
      groups: groupsRes.rows,
      items: itemsRes.rows,
      assignees_by_item: assigneesByItem,
      time_totals_by_item: timeTotalsByItem,
      update_counts_by_item: updateCountsByItem,
      status_labels: mergedLabels.length ? mergedLabels : defaultLabels
    });
  } catch (err) {
    console.error('[tasks:boards:view]', err);
    return res.status(500).json({ message: 'Unable to load board' });
  }
});

// Groups
router.post('/boards/:boardId/groups', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = groupCreateSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO task_groups (board_id, name, order_index)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [boardId, payload.name.trim(), payload.order_index ?? 0]
    );
    return res.status(201).json({ group: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:groups:create]', err);
    return res.status(500).json({ message: 'Unable to create group' });
  }
});

// Delete a group (cascades items)
router.delete('/groups/:groupId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { groupId } = req.params;
  if (eff !== 'superadmin' && eff !== 'admin') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }
  try {
    const workspaceId = await getWorkspaceIdForGroup(groupId);
    if (!workspaceId) return res.status(404).json({ message: 'Group not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    await query('DELETE FROM task_groups WHERE id = $1', [groupId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[tasks:groups:delete]', err);
    return res.status(500).json({ message: 'Unable to delete group' });
  }
});

// Items
router.post('/groups/:groupId/items', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { groupId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForGroup(groupId);
    if (!workspaceId) return res.status(404).json({ message: 'Group not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = itemCreateSchema.parse(req.body);

    const applyBoardPrefix = (prefix, rawName) => {
      const p = String(prefix || '').trim();
      const n = String(rawName || '').trim();
      if (!p) return n;
      const lowerP = p.toLowerCase();
      const lowerN = n.toLowerCase();
      if (lowerN === lowerP) return n;
      if (lowerN.startsWith(lowerP)) {
        // already prefixed (allow common separators)
        const nextChar = lowerN.slice(lowerP.length, lowerP.length + 2);
        if (!nextChar || nextChar.startsWith(' ') || nextChar.startsWith('-') || nextChar.startsWith(':')) return n;
      }
      return `${p} ${n}`.trim();
    };

    // If the board has a prefix configured, prepend it to the item name.
    let finalName = payload.name.trim();
    try {
      const { rows: bpRows } = await query(
        `SELECT b.board_prefix
         FROM task_boards b
         JOIN task_groups g ON g.board_id = b.id
         WHERE g.id = $1
         LIMIT 1`,
        [groupId]
      );
      finalName = applyBoardPrefix(bpRows[0]?.board_prefix, finalName);
    } catch (_err) {
      // non-fatal: fallback to raw name
    }

    const { rows } = await query(
      `INSERT INTO task_items (group_id, name, status, due_date, is_voicemail, needs_attention, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        groupId,
        finalName,
        payload.status ?? 'To Do',
        payload.due_date ?? null,
        payload.is_voicemail ?? false,
        payload.needs_attention ?? false,
        req.user.id
      ]
    );
    return res.status(201).json({ item: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:items:create]', err);
    return res.status(500).json({ message: 'Unable to create item' });
  }
});

router.patch('/items/:itemId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const beforeRes = await query('SELECT * FROM task_items WHERE id = $1', [itemId]);
    const itemBefore = beforeRes.rows[0] || null;
    if (itemBefore?.archived_at) {
      return res.status(400).json({ message: 'Item is archived' });
    }

    const payload = itemUpdateSchema.parse(req.body);
    const fields = [];
    const values = [];
    let i = 1;
    if (payload.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(payload.name.trim());
    }
    if (payload.status !== undefined) {
      fields.push(`status = $${i++}`);
      values.push(payload.status);
    }
    if (payload.due_date !== undefined) {
      fields.push(`due_date = $${i++}`);
      values.push(payload.due_date);
    }
    if (payload.is_voicemail !== undefined) {
      fields.push(`is_voicemail = $${i++}`);
      values.push(payload.is_voicemail);
    }
    if (payload.needs_attention !== undefined) {
      fields.push(`needs_attention = $${i++}`);
      values.push(payload.needs_attention);
    }
    if (!fields.length) return res.status(400).json({ message: 'No changes provided' });

    fields.push(`updated_at = NOW()`);
    values.push(itemId);
    const { rows } = await query(
      `UPDATE task_items
       SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING *`,
      values
    );
    const itemAfter = rows[0];
    // Run automations asynchronously; don't block client response
    runEventAutomationsForItemChange({ itemBefore, itemAfter, actorUserId: req.user.id }).catch((err) =>
      console.error('[tasks:automations:run:item-change]', err)
    );
    return res.json({ item: itemAfter });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:items:update]', err);
    return res.status(500).json({ message: 'Unable to update item' });
  }
});

// Archive (soft delete) an item (retained for 30 days, then purged by cron)
router.delete('/items/:itemId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const { rows } = await query(
      `UPDATE task_items
       SET archived_at = COALESCE(archived_at, NOW()),
           archived_by = COALESCE(archived_by, $2),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, archived_at`,
      [itemId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Item not found' });
    return res.json({ ok: true, archived_at: rows[0].archived_at });
  } catch (err) {
    console.error('[tasks:items:archive]', err);
    return res.status(500).json({ message: 'Unable to archive item' });
  }
});

// Restore an archived item (within retention window)
router.post('/items/:itemId/restore', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const { rows } = await query(
      `UPDATE task_items
       SET archived_at = NULL,
           archived_by = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [itemId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Item not found' });
    return res.json({ item: rows[0] });
  } catch (err) {
    console.error('[tasks:items:restore]', err);
    return res.status(500).json({ message: 'Unable to restore item' });
  }
});

// Automations (board-scoped)
router.get('/boards/:boardId/automations', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const { rows } = await query(
      `SELECT *
       FROM task_board_automations
       WHERE board_id = $1
       ORDER BY created_at DESC`,
      [boardId]
    );
    return res.json({ automations: rows });
  } catch (err) {
    console.error('[tasks:automations:list]', err);
    return res.status(500).json({ message: 'Unable to load automations' });
  }
});

router.post('/boards/:boardId/automations', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  if (eff !== 'superadmin' && eff !== 'admin') return res.status(403).json({ message: 'Insufficient permissions' });
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });

    const payload = automationCreateSchema.parse(req.body);
    validateAutomationPayload(payload);
    const { rows } = await query(
      `INSERT INTO task_board_automations (board_id, name, trigger_type, trigger_config, action_type, action_config, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        boardId,
        payload.name.trim(),
        payload.trigger_type,
        JSON.stringify(payload.trigger_config || {}),
        payload.action_type,
        JSON.stringify(payload.action_config || {}),
        payload.is_active !== undefined ? payload.is_active : true,
        req.user.id
      ]
    );
    return res.status(201).json({ automation: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    if (String(err?.message || '').includes('trigger_config') || String(err?.message || '').includes('action_config')) {
      return res.status(400).json({ message: err.message });
    }
    console.error('[tasks:automations:create]', err);
    return res.status(500).json({ message: 'Unable to create automation' });
  }
});

router.patch('/automations/:automationId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { automationId } = req.params;
  if (eff !== 'superadmin' && eff !== 'admin') return res.status(403).json({ message: 'Insufficient permissions' });
  try {
    // Look up in board automations first, then global.
    const { rows: boardRows } = await query('SELECT * FROM task_board_automations WHERE id = $1', [automationId]);
    const boardRow = boardRows[0] || null;

    const { rows: globalRows } = boardRow ? { rows: [] } : await query('SELECT * FROM task_global_automations WHERE id = $1', [automationId]);
    const globalRow = globalRows[0] || null;

    const scope = boardRow ? 'board' : globalRow ? 'global' : null;
    const existing = boardRow || globalRow;
    if (!scope || !existing) return res.status(404).json({ message: 'Automation not found' });

    if (scope === 'board') {
      const workspaceId = await getWorkspaceIdForBoard(existing.board_id);
      if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
      const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
      if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const payload = automationUpdateSchema.parse(req.body);
    const merged = {
      ...existing,
      ...payload,
      trigger_config: payload.trigger_config !== undefined ? payload.trigger_config : existing.trigger_config,
      action_config: payload.action_config !== undefined ? payload.action_config : existing.action_config
    };
    validateAutomationPayload(merged);

    const fields = [];
    const values = [];
    let i = 1;
    if (payload.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(payload.name.trim());
    }
    if (payload.trigger_type !== undefined) {
      fields.push(`trigger_type = $${i++}`);
      values.push(payload.trigger_type);
    }
    if (payload.trigger_config !== undefined) {
      fields.push(`trigger_config = $${i++}`);
      values.push(JSON.stringify(payload.trigger_config || {}));
    }
    if (payload.action_type !== undefined) {
      fields.push(`action_type = $${i++}`);
      values.push(payload.action_type);
    }
    if (payload.action_config !== undefined) {
      fields.push(`action_config = $${i++}`);
      values.push(JSON.stringify(payload.action_config || {}));
    }
    if (payload.is_active !== undefined) {
      fields.push(`is_active = $${i++}`);
      values.push(payload.is_active);
    }
    if (!fields.length) return res.status(400).json({ message: 'No changes provided' });

    values.push(automationId);
    const table = scope === 'board' ? 'task_board_automations' : 'task_global_automations';
    const { rows } = await query(
      `UPDATE ${table}
       SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING *`,
      values
    );
    return res.json({ automation: rows[0], scope });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    if (String(err?.message || '').includes('trigger_config') || String(err?.message || '').includes('action_config')) {
      return res.status(400).json({ message: err.message });
    }
    console.error('[tasks:automations:update]', err);
    return res.status(500).json({ message: 'Unable to update automation' });
  }
});

router.delete('/automations/:automationId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { automationId } = req.params;
  if (eff !== 'superadmin' && eff !== 'admin') return res.status(403).json({ message: 'Insufficient permissions' });
  try {
    const { rows: boardRows } = await query('SELECT * FROM task_board_automations WHERE id = $1', [automationId]);
    const boardRow = boardRows[0] || null;

    const { rows: globalRows } = boardRow ? { rows: [] } : await query('SELECT * FROM task_global_automations WHERE id = $1', [automationId]);
    const globalRow = globalRows[0] || null;

    const scope = boardRow ? 'board' : globalRow ? 'global' : null;
    const existing = boardRow || globalRow;
    if (!scope || !existing) return res.status(404).json({ message: 'Automation not found' });

    if (scope === 'board') {
      const workspaceId = await getWorkspaceIdForBoard(existing.board_id);
      if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
      const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
      if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const table = scope === 'board' ? 'task_board_automations' : 'task_global_automations';
    await query(`DELETE FROM ${table} WHERE id = $1`, [automationId]);
    return res.json({ ok: true, scope });
  } catch (err) {
    console.error('[tasks:automations:delete]', err);
    return res.status(500).json({ message: 'Unable to delete automation' });
  }
});

// Global automations
router.get('/automations/global', async (req, res) => {
  const eff = getEffectiveRole(req);
  if (eff !== 'superadmin' && eff !== 'admin') return res.status(403).json({ message: 'Insufficient permissions' });
  try {
    const { rows } = await query(`SELECT * FROM task_global_automations ORDER BY created_at DESC`);
    return res.json({ automations: rows });
  } catch (err) {
    console.error('[tasks:automations:global:list]', err);
    return res.status(500).json({ message: 'Unable to load automations' });
  }
});

router.post('/automations/global', async (req, res) => {
  const eff = getEffectiveRole(req);
  if (eff !== 'superadmin' && eff !== 'admin') return res.status(403).json({ message: 'Insufficient permissions' });
  try {
    const payload = automationCreateSchema.parse(req.body);
    validateAutomationPayload(payload);
    const { rows } = await query(
      `INSERT INTO task_global_automations (name, trigger_type, trigger_config, action_type, action_config, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        payload.name.trim(),
        payload.trigger_type,
        JSON.stringify(payload.trigger_config || {}),
        payload.action_type,
        JSON.stringify(payload.action_config || {}),
        payload.is_active !== undefined ? payload.is_active : true,
        req.user.id
      ]
    );
    return res.status(201).json({ automation: rows[0], scope: 'global' });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    if (String(err?.message || '').includes('trigger_config') || String(err?.message || '').includes('action_config')) {
      return res.status(400).json({ message: err.message });
    }
    console.error('[tasks:automations:global:create]', err);
    return res.status(500).json({ message: 'Unable to create automation' });
  }
});

// Execution log (recent)
router.get('/automations/runs', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 50)));
  const scope = String(req.query?.scope || '').trim(); // 'board'|'global'|''
  const boardId = String(req.query?.board_id || '').trim();
  try {
    if (scope === 'board' && boardId) {
      const workspaceId = await getWorkspaceIdForBoard(boardId);
      if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
      const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
      if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    }
    // Global runs: staff-only route already; no extra check needed.
    const clauses = [];
    const params = [];
    let i = 1;
    if (scope === 'board' || scope === 'global') {
      clauses.push(`scope = $${i++}`);
      params.push(scope);
    }
    if (boardId) {
      clauses.push(`board_id = $${i++}`);
      params.push(boardId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(limit);
    const { rows } = await query(
      `SELECT *
       FROM task_automation_runs
       ${where}
       ORDER BY ran_at DESC
       LIMIT $${i}`,
      params
    );
    return res.json({ runs: rows });
  } catch (err) {
    console.error('[tasks:automations:runs]', err);
    return res.status(500).json({ message: 'Unable to load automation runs' });
  }
});

// Reporting + export
router.get('/boards/:boardId/report', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const { rows } = await query(
      `SELECT
         COUNT(*)::int AS total,
         SUM(CASE WHEN i.status = 'todo' THEN 1 ELSE 0 END)::int AS todo,
         SUM(CASE WHEN i.status = 'working' THEN 1 ELSE 0 END)::int AS working,
         SUM(CASE WHEN i.status = 'blocked' THEN 1 ELSE 0 END)::int AS blocked,
         SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END)::int AS done,
         SUM(CASE WHEN i.status = 'needs_attention' THEN 1 ELSE 0 END)::int AS needs_attention_status,
         SUM(CASE WHEN i.needs_attention = TRUE THEN 1 ELSE 0 END)::int AS needs_attention_flag,
         SUM(CASE WHEN i.is_voicemail = TRUE THEN 1 ELSE 0 END)::int AS voicemail,
         MAX(i.updated_at) AS last_updated_at
       FROM task_items i
       JOIN task_groups g ON g.id = i.group_id
       WHERE g.board_id = $1
         AND i.archived_at IS NULL`,
      [boardId]
    );

    return res.json({ report: rows[0] || null });
  } catch (err) {
    console.error('[tasks:report]', err);
    return res.status(500).json({ message: 'Unable to load report' });
  }
});

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

router.get('/boards/:boardId/export.csv', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { boardId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForBoard(boardId);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const { rows } = await query(
      `SELECT
         i.id,
         i.name,
         i.status,
         i.due_date,
         i.needs_attention,
         i.is_voicemail,
         i.created_at,
         i.updated_at,
         g.name AS group_name
       FROM task_items i
       JOIN task_groups g ON g.id = i.group_id
       WHERE g.board_id = $1
         AND i.archived_at IS NULL
       ORDER BY g.order_index ASC, i.updated_at DESC`,
      [boardId]
    );

    const header = ['id', 'name', 'status', 'due_date', 'needs_attention', 'is_voicemail', 'group_name', 'created_at', 'updated_at'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          csvEscape(r.id),
          csvEscape(r.name),
          csvEscape(r.status),
          csvEscape(r.due_date),
          csvEscape(r.needs_attention),
          csvEscape(r.is_voicemail),
          csvEscape(r.group_name),
          csvEscape(r.created_at),
          csvEscape(r.updated_at)
        ].join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="board-${boardId}.csv"`);
    return res.send(lines.join('\n'));
  } catch (err) {
    console.error('[tasks:export]', err);
    return res.status(500).json({ message: 'Unable to export CSV' });
  }
});

// My Work - items assigned to current user, grouped by board
router.get('/my-work', async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await query(
      `
        WITH my_items AS (
          SELECT
            i.id,
            i.name,
            i.status,
            i.due_date,
            i.needs_attention,
            i.is_voicemail,
            i.updated_at,
            g.board_id,
            b.name AS board_name,
            w.id AS workspace_id,
            w.name AS workspace_name
          FROM task_item_assignees a
          JOIN task_items i ON i.id = a.item_id
          JOIN task_groups g ON g.id = i.group_id
          JOIN task_boards b ON b.id = g.board_id
          JOIN task_workspaces w ON w.id = b.workspace_id
          WHERE a.user_id = $1
            AND i.archived_at IS NULL
        ),
        item_assignees AS (
          SELECT
            a.item_id,
            json_agg(
              json_build_object(
                'user_id', u.id,
                'email', u.email,
                'first_name', u.first_name,
                'last_name', u.last_name,
                'avatar_url', u.avatar_url
              )
            ) AS assignees
          FROM task_item_assignees a
          JOIN users u ON u.id = a.user_id
          WHERE a.item_id IN (SELECT id FROM my_items)
          GROUP BY a.item_id
        )
        SELECT
          m.board_id,
          m.board_name,
          m.workspace_id,
          m.workspace_name,
          json_agg(
            json_build_object(
              'id', m.id,
              'name', m.name,
              'status', m.status,
              'due_date', to_char(m.due_date, 'YYYY-MM-DD'),
              'needs_attention', m.needs_attention,
              'is_voicemail', m.is_voicemail,
              'assignees', COALESCE(ia.assignees, '[]'::json),
              'update_count', COALESCE(uc.update_count, 0),
              'time_total_minutes', COALESCE(tt.time_total_minutes, 0)
            )
            ORDER BY m.updated_at DESC
          ) AS items
        FROM my_items m
        LEFT JOIN item_assignees ia ON ia.item_id = m.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS update_count FROM task_updates u WHERE u.item_id = m.id
        ) uc ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(time_spent_minutes), 0) AS time_total_minutes FROM task_time_entries t WHERE t.item_id = m.id
        ) tt ON TRUE
        GROUP BY m.board_id, m.board_name, m.workspace_id, m.workspace_name
        ORDER BY m.workspace_name, m.board_name
      `,
      [userId]
    );
    return res.json({ boards: rows || [] });
  } catch (err) {
    console.error('[tasks:my-work]', err);
    return res.status(500).json({ message: 'Unable to load my work' });
  }
});

function localSummarizeUpdates({ itemName, updates }) {
  const lines = [];
  lines.push(`Task: ${itemName}`);
  if (!updates.length) {
    lines.push('No updates yet.');
    return lines.join('\n');
  }
  lines.push('');
  lines.push('Recent updates:');
  for (const u of updates.slice(0, 6)) {
    const author = u.author_name || 'Unknown';
    const content = String(u.content || '')
      .trim()
      .replace(/\s+/g, ' ');
    lines.push(`- ${author}: ${content.slice(0, 180)}${content.length > 180 ? '…' : ''}`);
  }
  lines.push('');
  lines.push('Next steps:');
  lines.push('- (AI not configured) Refresh summary when Vertex is available.');
  return lines.join('\n');
}

async function buildItemUpdateContext(itemId) {
  const itemRes = await query('SELECT id, name, status, due_date, updated_at FROM task_items WHERE id = $1', [itemId]);
  const item = itemRes.rows[0] || null;
  const updatesRes = await query(
    `SELECT u.*, COALESCE(us.first_name || ' ' || us.last_name, 'Unknown') AS author_name
     FROM task_updates u
     LEFT JOIN users us ON us.id = u.user_id
     WHERE u.item_id = $1
     ORDER BY u.created_at DESC
     LIMIT 50`,
    [itemId]
  );
  const updates = updatesRes.rows || [];
  const latestUpdateAt = updates[0]?.created_at || null;
  return { item, updates, latestUpdateAt };
}

router.get('/items/:itemId/ai-summary', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const [{ rows: summaryRows }, ctx] = await Promise.all([
      query('SELECT * FROM task_item_ai_summaries WHERE item_id = $1 LIMIT 1', [itemId]),
      buildItemUpdateContext(itemId)
    ]);
    const summary = summaryRows[0] || null;
    const latestUpdateAt = ctx.latestUpdateAt;
    const usedUpdateAt = summary?.source_meta?.latest_update_at || null;
    const isStale = Boolean(latestUpdateAt && usedUpdateAt && String(latestUpdateAt) !== String(usedUpdateAt));
    return res.json({ summary, is_stale: isStale, latest_update_at: latestUpdateAt });
  } catch (err) {
    console.error('[tasks:ai-summary:get]', err);
    return res.status(500).json({ message: 'Unable to load AI summary' });
  }
});

router.post('/items/:itemId/ai-summary/refresh', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const { item, updates, latestUpdateAt } = await buildItemUpdateContext(itemId);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    let provider = 'vertex';
    let model = process.env.VERTEX_MODEL || 'gemini-2.5-flash';
    let summaryText = '';

    const updateTranscript = updates
      .slice()
      .reverse()
      .map((u) => {
        const ts = u.created_at ? new Date(u.created_at).toISOString() : '';
        const author = u.author_name || 'Unknown';
        return `[${ts}] ${author}: ${u.content || ''}`;
      })
      .join('\n');

    const prompt = `Summarize the task updates below for internal team tracking.\n\nTask: ${item.name}\nStatus: ${item.status}\nDue date: ${
      item.due_date || 'none'
    }\n\nUpdates (oldest to newest):\n${updateTranscript}\n\nOutput format:\n- Summary (2-5 sentences)\n- Current status\n- Blockers (if any)\n- Next steps (3 bullets max)\n\nBe concise and action-oriented.`;

    try {
      summaryText = await generateAiResponse({
        prompt,
        systemPrompt: 'You summarize internal task updates for a project management system. Keep it concise, factual, and useful.',
        temperature: 0.2,
        maxTokens: 350
      });
    } catch (aiErr) {
      provider = 'fallback';
      model = null;
      summaryText = localSummarizeUpdates({ itemName: item.name, updates });
      console.warn('[tasks:ai-summary:fallback]', aiErr?.message || aiErr);
    }

    const sourceMeta = {
      latest_update_at: latestUpdateAt,
      update_count: updates.length,
      item_updated_at: item.updated_at
    };

    const { rows } = await query(
      `INSERT INTO task_item_ai_summaries (item_id, summary, provider, model, generated_by, generated_at, source_meta)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6)
       ON CONFLICT (item_id) DO UPDATE
         SET summary = EXCLUDED.summary,
             provider = EXCLUDED.provider,
             model = EXCLUDED.model,
             generated_by = EXCLUDED.generated_by,
             generated_at = NOW(),
             source_meta = EXCLUDED.source_meta
       RETURNING *`,
      [itemId, summaryText, provider, model, req.user.id, JSON.stringify(sourceMeta)]
    );

    return res.status(201).json({ summary: rows[0] });
  } catch (err) {
    console.error('[tasks:ai-summary:refresh]', err);
    return res.status(500).json({ message: 'Unable to refresh AI summary' });
  }
});

// Updates
router.get('/items/:itemId/updates', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const { rows } = await query(
      `SELECT u.*, COALESCE(us.first_name || ' ' || us.last_name, 'Unknown') AS author_name
       FROM task_updates u
       LEFT JOIN users us ON us.id = u.user_id
       WHERE u.item_id = $1
       ORDER BY u.created_at DESC`,
      [itemId]
    );
    return res.json({ updates: rows });
  } catch (err) {
    console.error('[tasks:updates:list]', err);
    return res.status(500).json({ message: 'Unable to load updates' });
  }
});

router.post('/items/:itemId/updates', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = updateCreateSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO task_updates (item_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [itemId, req.user.id, payload.content]
    );
    // Fire-and-forget mention notifications.
    notifyMentionedUsers({
      itemId,
      workspaceId,
      actorUserId: req.user.id,
      content: payload.content
    }).catch((err) => console.error('[tasks:mentions]', err));
    return res.status(201).json({ update: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:updates:create]', err);
    return res.status(500).json({ message: 'Unable to create update' });
  }
});

// Files (attachments)
router.get('/items/:itemId/files', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const { rows } = await query(
      `SELECT f.*, COALESCE(us.first_name || ' ' || us.last_name, 'Unknown') AS uploaded_by_name
       FROM task_files f
       LEFT JOIN users us ON us.id = f.uploaded_by
       WHERE f.item_id = $1
       ORDER BY f.created_at DESC`,
      [itemId]
    );
    return res.json({ files: rows });
  } catch (err) {
    console.error('[tasks:files:list]', err);
    return res.status(500).json({ message: 'Unable to load files' });
  }
});

router.post('/items/:itemId/files', uploadTaskFile.single('file'), async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const url = `/uploads/tasks/${req.file.filename}`.replace(/\\/g, '/');
    const fileName = req.file.originalname || req.file.filename;
    const { rows } = await query(
      `INSERT INTO task_files (item_id, uploaded_by, file_url, file_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [itemId, req.user.id, url, fileName]
    );
    return res.status(201).json({ file: rows[0] });
  } catch (err) {
    console.error('[tasks:files:upload]', err);
    return res.status(500).json({ message: 'Unable to upload file' });
  }
});

// Subitems
router.get('/items/:itemId/subitems', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const { rows } = await query(
      `SELECT *
       FROM task_subitems
       WHERE parent_item_id = $1
         AND archived_at IS NULL
       ORDER BY created_at DESC`,
      [itemId]
    );
    return res.json({ subitems: rows });
  } catch (err) {
    console.error('[tasks:subitems:list]', err);
    return res.status(500).json({ message: 'Unable to load subitems' });
  }
});

router.post('/items/:itemId/subitems', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = subitemCreateSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO task_subitems (parent_item_id, name, status, due_date)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [itemId, payload.name.trim(), payload.status ?? 'To Do', payload.due_date ?? null]
    );
    return res.status(201).json({ subitem: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:subitems:create]', err);
    return res.status(500).json({ message: 'Unable to create subitem' });
  }
});

router.patch('/subitems/:subitemId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { subitemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForSubitem(subitemId);
    if (!workspaceId) return res.status(404).json({ message: 'Subitem not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = subitemUpdateSchema.parse(req.body);
    const fields = [];
    const values = [];
    let i = 1;
    if (payload.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(payload.name.trim());
    }
    if (payload.status !== undefined) {
      fields.push(`status = $${i++}`);
      values.push(payload.status);
    }
    if (payload.due_date !== undefined) {
      fields.push(`due_date = $${i++}`);
      values.push(payload.due_date);
    }
    if (!fields.length) return res.status(400).json({ message: 'No changes provided' });
    values.push(subitemId);
    const { rows } = await query(
      `UPDATE task_subitems
       SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING *`,
      values
    );
    return res.json({ subitem: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:subitems:update]', err);
    return res.status(500).json({ message: 'Unable to update subitem' });
  }
});

router.delete('/subitems/:subitemId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { subitemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForSubitem(subitemId);
    if (!workspaceId) return res.status(404).json({ message: 'Subitem not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const { rows } = await query(
      `UPDATE task_subitems
       SET archived_at = COALESCE(archived_at, NOW()),
           archived_by = COALESCE(archived_by, $2)
       WHERE id = $1
       RETURNING id, archived_at`,
      [subitemId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Subitem not found' });
    return res.json({ ok: true, archived_at: rows[0].archived_at });
  } catch (err) {
    console.error('[tasks:subitems:delete]', err);
    return res.status(500).json({ message: 'Unable to delete subitem' });
  }
});

router.post('/subitems/:subitemId/restore', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { subitemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForSubitem(subitemId);
    if (!workspaceId) return res.status(404).json({ message: 'Subitem not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const { rows } = await query(
      `UPDATE task_subitems
       SET archived_at = NULL, archived_by = NULL
       WHERE id = $1
       RETURNING *`,
      [subitemId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Subitem not found' });
    return res.json({ subitem: rows[0] });
  } catch (err) {
    console.error('[tasks:subitems:restore]', err);
    return res.status(500).json({ message: 'Unable to restore subitem' });
  }
});

// Assignees
router.get('/items/:itemId/assignees', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const { rows } = await query(
      `SELECT
         a.user_id,
         u.email,
         u.first_name,
         u.last_name,
         u.role AS user_role,
         u.avatar_url
       FROM task_item_assignees a
       JOIN users u ON u.id = a.user_id
       WHERE a.item_id = $1
       ORDER BY u.email ASC`,
      [itemId]
    );
    return res.json({ assignees: rows });
  } catch (err) {
    console.error('[tasks:assignees:list]', err);
    return res.status(500).json({ message: 'Unable to load assignees' });
  }
});

router.post('/items/:itemId/assignees', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = itemAssigneeAddSchema.parse(req.body);
    let targetUserId = payload.user_id;
    if (!targetUserId && payload.email) {
      const { rows } = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [payload.email]);
      targetUserId = rows[0]?.id || null;
    }
    if (!targetUserId) return res.status(404).json({ message: 'User not found' });

    // only allow assigning users who have workspace access (avoid leaking user IDs)
    const { rows: userRows } = await query('SELECT id, role FROM users WHERE id = $1 LIMIT 1', [targetUserId]);
    const targetRole = userRows[0]?.role;
    const targetOk = await assertWorkspaceAccess({ effRole: targetRole, userId: targetUserId, workspaceId });
    if (!targetOk) return res.status(403).json({ message: 'User does not have workspace access' });

    const insertedRes = await query(
      `INSERT INTO task_item_assignees (item_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (item_id, user_id) DO NOTHING
       RETURNING user_id`,
      [itemId, targetUserId]
    );

    // Notify the assignee (in-app + email) when newly assigned, but never notify the actor.
    if (insertedRes.rowCount && targetUserId !== req.user.id) {
      const { rows: itemRows } = await query('SELECT id, name FROM task_items WHERE id = $1 LIMIT 1', [itemId]);
      const itemName = itemRows[0]?.name || 'Task item';
      const boardId = await getBoardIdForItem(itemId);
      const linkUrl = boardId
        ? `/tasks?pane=boards&board=${encodeURIComponent(boardId)}&item=${encodeURIComponent(itemId)}`
        : '/tasks?pane=boards';
      await createNotification({
        userId: targetUserId,
        title: 'You were assigned to a task',
        body: itemName,
        linkUrl,
        meta: {
          source: 'task_assignment',
          item_id: itemId,
          workspace_id: workspaceId,
          actor_user_id: req.user.id
        }
      });
    }

    // Fire automations for assignee_added asynchronously (global + board).
    if (insertedRes.rowCount) {
      runEventAutomationsForAssigneeAdded({ itemId, assigneeUserId: targetUserId, actorUserId: req.user.id }).catch((err) =>
        console.error('[tasks:automations:run:assignee-added]', err)
      );
    }

    const { rows } = await query(
      `SELECT
         a.user_id,
         u.email,
         u.first_name,
         u.last_name,
         u.role AS user_role,
         u.avatar_url
       FROM task_item_assignees a
       JOIN users u ON u.id = a.user_id
       WHERE a.item_id = $1 AND a.user_id = $2
       LIMIT 1`,
      [itemId, targetUserId]
    );
    return res.status(201).json({ assignee: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:assignees:add]', err);
    return res.status(500).json({ message: 'Unable to add assignee' });
  }
});

router.delete('/items/:itemId/assignees/:assigneeUserId', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId, assigneeUserId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const { rowCount } = await query('DELETE FROM task_item_assignees WHERE item_id = $1 AND user_id = $2', [itemId, assigneeUserId]);
    if (!rowCount) return res.status(404).json({ message: 'Assignee not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[tasks:assignees:remove]', err);
    return res.status(500).json({ message: 'Unable to remove assignee' });
  }
});

// Time tracking
router.get('/items/:itemId/time-entries', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
    const { rows } = await query(
      `SELECT t.*, COALESCE(us.first_name || ' ' || us.last_name, 'Unknown') AS user_name
       FROM task_time_entries t
       LEFT JOIN users us ON us.id = t.user_id
       WHERE t.item_id = $1
       ORDER BY t.created_at DESC`,
      [itemId]
    );
    return res.json({ time_entries: rows });
  } catch (err) {
    console.error('[tasks:time:list]', err);
    return res.status(500).json({ message: 'Unable to load time entries' });
  }
});

router.post('/items/:itemId/time-entries', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { itemId } = req.params;
  try {
    const workspaceId = await getWorkspaceIdForItem(itemId);
    if (!workspaceId) return res.status(404).json({ message: 'Item not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const payload = timeEntryCreateSchema.parse(req.body);
    const isBillable = payload.is_billable !== undefined ? payload.is_billable : true;
    const spent = payload.time_spent_minutes;
    const billable = payload.billable_minutes !== undefined ? payload.billable_minutes : isBillable ? spent : 0;

    const { rows } = await query(
      `INSERT INTO task_time_entries (item_id, user_id, time_spent_minutes, billable_minutes, description, work_category, is_billable)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [itemId, req.user.id, spent, billable, payload.description ?? null, payload.work_category ?? null, isBillable]
    );
    return res.status(201).json({ time_entry: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:time:create]', err);
    return res.status(500).json({ message: 'Unable to create time entry' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE VIEW TRACKING
// ─────────────────────────────────────────────────────────────────────────────

// Mark updates as viewed by the current user (batch)
router.post('/updates/mark-viewed', async (req, res) => {
  const userId = req.user.id;
  try {
    const { update_ids } = req.body;
    if (!Array.isArray(update_ids) || !update_ids.length) {
      return res.status(400).json({ message: 'update_ids required' });
    }
    // Insert views, ignoring duplicates
    for (const updateId of update_ids) {
      await query(
        `INSERT INTO task_update_views (update_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (update_id, user_id) DO NOTHING`,
        [updateId, userId]
      );
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[tasks:updates:mark-viewed]', err);
    return res.status(500).json({ message: 'Unable to mark updates as viewed' });
  }
});

// Get view info for updates (who viewed each)
router.post('/updates/views', async (req, res) => {
  try {
    const { update_ids } = req.body;
    if (!Array.isArray(update_ids) || !update_ids.length) {
      return res.status(400).json({ message: 'update_ids required' });
    }
    const { rows } = await query(
      `SELECT v.update_id, v.user_id, v.viewed_at,
              COALESCE(u.first_name || ' ' || u.last_name, u.email, 'Unknown') AS user_name,
              u.avatar_url
       FROM task_update_views v
       JOIN users u ON u.id = v.user_id
       WHERE v.update_id = ANY($1)
       ORDER BY v.viewed_at ASC`,
      [update_ids]
    );
    // Group by update_id
    const viewsByUpdate = {};
    for (const row of rows) {
      if (!viewsByUpdate[row.update_id]) viewsByUpdate[row.update_id] = [];
      viewsByUpdate[row.update_id].push({
        user_id: row.user_id,
        user_name: row.user_name,
        avatar_url: row.avatar_url,
        viewed_at: row.viewed_at
      });
    }
    return res.json({ views: viewsByUpdate });
  } catch (err) {
    console.error('[tasks:updates:views]', err);
    return res.status(500).json({ message: 'Unable to load update views' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI DAILY OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

router.get('/ai/daily-overview', async (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Check for cached overview from today
    const { rows: cached } = await query(
      `SELECT * FROM task_ai_daily_overviews
       WHERE user_id = $1 AND overview_date = $2`,
      [userId, today]
    );
    if (cached.length && !req.query.refresh) {
      return res.json({ overview: cached[0], cached: true });
    }

    // Get user info
    const { rows: userRows } = await query(
      `SELECT first_name, last_name, email FROM users WHERE id = $1`,
      [userId]
    );
    const userName = userRows[0]?.first_name || userRows[0]?.email || 'User';

    // 1. Get items assigned to this user that are not done
    const { rows: assignedItems } = await query(
      `SELECT i.id, i.name, i.status, i.due_date, i.created_at,
              g.name AS group_name,
              b.name AS board_name,
              w.name AS workspace_name
       FROM task_items i
       JOIN task_item_assignees a ON a.item_id = i.id AND a.user_id = $1
       JOIN task_groups g ON g.id = i.group_id
       JOIN task_boards b ON b.id = g.board_id
       JOIN task_workspaces w ON w.id = b.workspace_id
       WHERE i.status != 'done'
         AND i.archived_at IS NULL
       ORDER BY i.due_date ASC NULLS LAST, i.created_at DESC`,
      [userId]
    );

    // 2. Get all updates from last 60 days for these items
    const itemIds = assignedItems.map((i) => i.id);
    let allUpdates = [];
    if (itemIds.length) {
      const { rows: updates } = await query(
        `SELECT u.id, u.item_id, u.content, u.created_at, u.user_id,
                COALESCE(us.first_name || ' ' || us.last_name, us.email, 'Unknown') AS author_name,
                i.name AS item_name
         FROM task_updates u
         JOIN users us ON us.id = u.user_id
         JOIN task_items i ON i.id = u.item_id
         WHERE u.item_id = ANY($1)
           AND u.created_at >= NOW() - INTERVAL '60 days'
         ORDER BY u.created_at DESC`,
        [itemIds]
      );
      allUpdates = updates;
    }

    // 3. Find mentions of this user (@mentions in content)
    const { rows: userInfo } = await query(
      `SELECT email, first_name, last_name FROM users WHERE id = $1`,
      [userId]
    );
    const userEmail = userInfo[0]?.email || '';
    const userFirstName = userInfo[0]?.first_name || '';
    const mentionPatterns = [userEmail, userFirstName].filter(Boolean).map((s) => s.toLowerCase());

    // Mentions received (updates by others that mention this user)
    const mentionsReceived = allUpdates.filter((u) => {
      if (u.user_id === userId) return false;
      const contentLower = (u.content || '').toLowerCase();
      return mentionPatterns.some((p) => contentLower.includes(`@${p}`) || contentLower.includes(p));
    });

    // Mentions made by user
    const mentionsMade = allUpdates.filter((u) => u.user_id === userId && u.content.includes('@'));

    // Check if user responded to mentions
    const pendingMentions = [];
    for (const mention of mentionsReceived) {
      // Check if user replied after this mention
      const replied = allUpdates.some(
        (u) => u.user_id === userId && u.item_id === mention.item_id && new Date(u.created_at) > new Date(mention.created_at)
      );
      if (!replied) {
        pendingMentions.push({
          update_id: mention.id,
          item_id: mention.item_id,
          item_name: mention.item_name,
          author_name: mention.author_name,
          content: mention.content.slice(0, 200),
          created_at: mention.created_at
        });
      }
    }

    // Check if mentions user made got replies
    const unansweredMentions = [];
    for (const mention of mentionsMade) {
      // Check if anyone else replied after this mention
      const replied = allUpdates.some(
        (u) => u.user_id !== userId && u.item_id === mention.item_id && new Date(u.created_at) > new Date(mention.created_at)
      );
      if (!replied) {
        unansweredMentions.push({
          update_id: mention.id,
          item_id: mention.item_id,
          item_name: mention.item_name,
          content: mention.content.slice(0, 200),
          created_at: mention.created_at
        });
      }
    }

    // 4. Build AI prompt using structured agent prompt
    const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Prepare items with activity info
    const itemsForPrompt = assignedItems.map((i) => {
      const itemUpdates = allUpdates.filter((u) => u.item_id === i.id);
      const lastActivity = itemUpdates.length ? itemUpdates[0].created_at : i.created_at;
      const daysSinceActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
      return {
        name: i.name,
        status: i.status,
        due_date: i.due_date ? new Date(i.due_date).toLocaleDateString() : null,
        board: i.board_name,
        group: i.group_name,
        created_at: new Date(i.created_at).toLocaleDateString(),
        last_activity: new Date(lastActivity).toLocaleDateString(),
        days_since_activity: daysSinceActivity,
        update_count: itemUpdates.length
      };
    });

    const prompt = `## Role

You are a proactive personal work assistant. Your job is to generate a concise, actionable daily overview for ${userName} based on their assigned work items, activity feeds, and mentions.

## Context Provided

Today's date: ${todayDate}

### Assigned Work Items (${assignedItems.length} total, excluding done):
${JSON.stringify(itemsForPrompt, null, 2)}

### Mentions Where ${userName} Was Mentioned But Has Not Responded (${pendingMentions.length}):
${pendingMentions.slice(0, 15).map((m) => `- "${m.content}" from ${m.author_name} on item "${m.item_name}" (${new Date(m.created_at).toLocaleDateString()})`).join('\n') || 'None'}

### Mentions ${userName} Made That Have Not Received Replies (${unansweredMentions.length}):
${unansweredMentions.slice(0, 15).map((m) => `- "${m.content}" on item "${m.item_name}" (${new Date(m.created_at).toLocaleDateString()})`).join('\n') || 'None'}

## Primary Objectives

### Daily Overview Summary
- Summarize what ${userName} should focus on today in plain language.
- Highlight time-sensitive work, unresolved conversations, and priority risks.
- Keep the tone clear, supportive, and efficient.

### Mention Awareness
- Identify mentions where ${userName} was mentioned and has not yet responded.
- Identify mentions where ${userName} mentioned others and has not received a reply.
- Group these separately and describe what follow-up is needed.

### To-Do List Generation
Generate a prioritized to-do list by analyzing:
- Items due today or overdue (highest priority)
- Items coming up soon
- Titles that imply large or complex projects (e.g. words like "launch", "migration", "integration", "review", "phase", "rollout", "redesign", "implementation")
- Promote large or high-impact items earlier in the list, even if not due today.
- Items currently in "working" or "blocked" status need attention.
- Exclude low-urgency items unless there is capacity.

### Status Intelligence
- Identify any items that appear stalled (no recent activity, days_since_activity > 7).
- Flag items that may need attention based on inactivity, unclear ownership, or repeated mentions.

## Constraints
- Be concise and practical.
- Do not repeat raw data back to the user.
- Do not speculate beyond the provided information.
- Do not assign new tasks, only summarize and prioritize existing ones.

## Output Format

Return a JSON object with these sections:

{
  "greeting": "A brief, friendly greeting appropriate for the time of day",
  "today_at_a_glance": "3-5 sentences summarizing the day's focus, time-sensitive work, and key priorities",
  "top_priorities": [
    { "priority": 1, "task": "Clear task description", "item_name": "Original item name", "reason": "Brief rationale for priority" }
  ],
  "mentions_needing_response": [
    { "from": "Person name", "item": "Item name", "summary": "Brief description of what needs response" }
  ],
  "mentions_awaiting_replies": [
    { "item": "Item name", "summary": "Brief description of what you're waiting on" }
  ],
  "upcoming_and_at_risk": [
    { "item_name": "Item name", "risk": "Brief explanation (due soon, stalled, blocked, etc.)" }
  ],
  "suggestions": ["Optional light suggestions for sequencing work or quick wins"]
}`;

    let aiResponse;
    try {
      aiResponse = await generateAiResponse(prompt, { maxTokens: 2000 });
    } catch (aiErr) {
      console.error('[tasks:ai:daily-overview:ai-call]', aiErr);
      // Return a fallback response using new structure
      const fallbackOverview = {
        greeting: `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${userName}!`,
        today_at_a_glance: `You have ${assignedItems.length} active items assigned to you. ${pendingMentions.length > 0 ? `There are ${pendingMentions.length} mentions waiting for your response.` : ''} ${unansweredMentions.length > 0 ? `You have ${unansweredMentions.length} mentions awaiting replies from others.` : ''}`.trim(),
        top_priorities: assignedItems.slice(0, 5).map((i, idx) => ({
          priority: idx + 1,
          task: i.name,
          item_name: i.name,
          reason: i.due_date ? `Due: ${new Date(i.due_date).toLocaleDateString()}` : 'Active task'
        })),
        mentions_needing_response: pendingMentions.slice(0, 5).map((m) => ({
          from: m.author_name,
          item: m.item_name,
          summary: m.content.slice(0, 100)
        })),
        mentions_awaiting_replies: unansweredMentions.slice(0, 5).map((m) => ({
          item: m.item_name,
          summary: m.content.slice(0, 100)
        })),
        upcoming_and_at_risk: [],
        suggestions: ['Focus on one task at a time', 'Address pending mentions early in the day']
      };
      return res.json({
        overview: {
          user_id: userId,
          overview_date: today,
          summary: JSON.stringify(fallbackOverview),
          todo_items: fallbackOverview.top_priorities,
          pending_mentions: pendingMentions.slice(0, 20),
          unanswered_mentions: unansweredMentions.slice(0, 20),
          generated_at: new Date().toISOString()
        },
        cached: false,
        ai_error: true
      });
    }

    // Parse AI response
    let parsed;
    try {
      // Extract JSON from response (may have markdown code blocks)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiResponse);
    } catch (parseErr) {
      console.error('[tasks:ai:daily-overview:parse]', parseErr);
      parsed = {
        greeting: `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${userName}!`,
        today_at_a_glance: aiResponse.slice(0, 500),
        top_priorities: [],
        mentions_needing_response: [],
        mentions_awaiting_replies: [],
        upcoming_and_at_risk: [],
        suggestions: []
      };
    }

    // Save to cache
    await query(
      `INSERT INTO task_ai_daily_overviews (user_id, overview_date, summary, todo_items, pending_mentions, unanswered_mentions, provider, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, overview_date) DO UPDATE SET
         summary = EXCLUDED.summary,
         todo_items = EXCLUDED.todo_items,
         pending_mentions = EXCLUDED.pending_mentions,
         unanswered_mentions = EXCLUDED.unanswered_mentions,
         generated_at = NOW()`,
      [
        userId,
        today,
        JSON.stringify(parsed),
        JSON.stringify(parsed.top_priorities || []),
        JSON.stringify(pendingMentions.slice(0, 20)),
        JSON.stringify(unansweredMentions.slice(0, 20)),
        'vertex',
        null
      ]
    );

    return res.json({
      overview: {
        user_id: userId,
        overview_date: today,
        summary: JSON.stringify(parsed),
        todo_items: parsed.top_priorities || [],
        pending_mentions: pendingMentions.slice(0, 20),
        unanswered_mentions: unansweredMentions.slice(0, 20),
        generated_at: new Date().toISOString()
      },
      cached: false
    });
  } catch (err) {
    console.error('[tasks:ai:daily-overview]', err);
    return res.status(500).json({ message: 'Unable to generate daily overview' });
  }
});

export default router;
