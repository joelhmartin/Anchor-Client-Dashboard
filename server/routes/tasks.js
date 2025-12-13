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

const groupCreateSchema = z.object({
  name: z.string().min(1).max(200),
  order_index: z.number().int().min(0).optional()
});

const itemCreateSchema = z.object({
  name: z.string().min(1).max(500),
  status: z.enum(['todo', 'working', 'blocked', 'done', 'needs_attention']).optional(),
  due_date: z.string().optional().nullable(), // YYYY-MM-DD
  is_voicemail: z.boolean().optional(),
  needs_attention: z.boolean().optional()
});

const itemUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  status: z.enum(['todo', 'working', 'blocked', 'done', 'needs_attention']).optional(),
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
  trigger_type: z.enum(['status_change']),
  trigger_config: z
    .object({
      to_status: z.enum(['todo', 'working', 'blocked', 'done', 'needs_attention']).optional()
    })
    .optional(),
  action_type: z.enum(['notify_admins', 'notify_assignees']),
  action_config: z
    .object({
      title: z.string().min(1).max(200).optional(),
      body: z.string().max(2000).optional(),
      link_url: z.string().max(500).optional()
    })
    .optional(),
  is_active: z.boolean().optional()
});

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
  status: z.enum(['todo', 'working', 'blocked', 'done', 'needs_attention']).optional(),
  due_date: z.string().optional().nullable() // YYYY-MM-DD
});

const subitemUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  status: z.enum(['todo', 'working', 'blocked', 'done', 'needs_attention']).optional(),
  due_date: z.string().optional().nullable()
});

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
  if (effRole === 'superadmin' || effRole === 'admin') return true;
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
    const email = String(match[1] || '').trim().toLowerCase();
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

  const staff = users.filter((u) => ['superadmin', 'admin', 'team'].includes(u.role));
  if (!staff.length) return;

  // Only notify users who can access this workspace (avoid leaking references).
  const allowedIds = [];
  for (const u of staff) {
    if (!u?.id || u.id === actorUserId) continue;
    const ok = await assertWorkspaceAccess({ effRole: u.role, userId: u.id, workspaceId });
    if (ok) allowedIds.push(u.id);
  }
  if (!allowedIds.length) return;

  const { rows: itemRows } = await query('SELECT id, name FROM task_items WHERE id = $1 LIMIT 1', [itemId]);
  const itemName = itemRows[0]?.name || 'Task item';
  const boardId = await getBoardIdForItem(itemId);
  const linkUrl = boardId ? `/tasks?board=${encodeURIComponent(boardId)}&item=${encodeURIComponent(itemId)}` : '/tasks';

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

async function runBoardAutomationsForItemChange({ itemBefore, itemAfter, actorUserId }) {
  if (!itemBefore || !itemAfter) return;
  const boardId = await getBoardIdForItem(itemAfter.id);
  if (!boardId) return;

  const { rows: automations } = await query(
    `SELECT *
     FROM task_board_automations
     WHERE board_id = $1 AND is_active = TRUE
     ORDER BY created_at ASC`,
    [boardId]
  );
  if (!automations.length) return;

  for (const rule of automations) {
    if (rule.trigger_type === 'status_change') {
      const trigger = rule.trigger_config || {};
      const toStatus = trigger?.to_status;
      const didChange = itemBefore.status !== itemAfter.status;
      const matches = !toStatus || itemAfter.status === toStatus;
      if (!didChange || !matches) continue;

      const action = rule.action_config || {};
      const title = action?.title || `Task status updated: ${itemAfter.status}`;
      const body = action?.body || `${itemAfter.name}`;
      const defaultDeepLink = `/tasks?board=${encodeURIComponent(boardId)}&item=${encodeURIComponent(itemAfter.id)}`;
      const linkUrl = action?.link_url || defaultDeepLink;
      const meta = {
        source: 'tasks_automation',
        board_id: boardId,
        item_id: itemAfter.id,
        automation_id: rule.id,
        actor_user_id: actorUserId,
        to_status: itemAfter.status,
        from_status: itemBefore.status
      };

      if (rule.action_type === 'notify_admins') {
        const { rows: admins } = await query("SELECT id FROM users WHERE role IN ('superadmin','admin')");
        await Promise.all(
          admins.map((u) =>
            createNotification({
              userId: u.id,
              title,
              body,
              linkUrl,
              meta
            })
          )
        );
      }

      if (rule.action_type === 'notify_assignees') {
        const { rows: assignees } = await query(`SELECT user_id FROM task_item_assignees WHERE item_id = $1`, [
          itemAfter.id
        ]);
        await Promise.all(
          assignees.map((a) =>
            createNotification({
              userId: a.user_id,
              title,
              body,
              linkUrl,
              meta
            })
          )
        );
      }
    }
  }
}

router.get('/workspaces', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  try {
    if (eff === 'superadmin' || eff === 'admin') {
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

// Workspace members (admin UI)
router.get('/workspaces/:workspaceId/members', async (req, res) => {
  const eff = getEffectiveRole(req);
  const userId = req.user.id;
  const { workspaceId } = req.params;
  try {
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });
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
       WHERE m.workspace_id = $1
       ORDER BY m.created_at ASC`,
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
      `SELECT
         m.user_id,
         m.role AS membership_role,
         u.email,
         u.first_name,
         u.last_name,
         u.role AS user_role
       FROM task_workspace_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = $1
         AND (
           lower(u.email) LIKE $2
           OR lower(u.first_name) LIKE $2
           OR lower(u.last_name) LIKE $2
           OR lower(u.first_name || ' ' || u.last_name) LIKE $2
         )
       ORDER BY u.email ASC
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
    const { rowCount } = await query(
      `DELETE FROM task_workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, memberUserId]
    );
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
       ORDER BY i.updated_at DESC, i.created_at DESC`,
      [boardId]
    );
    return res.json({ board: boardRes.rows[0], groups: groupsRes.rows, items: itemsRes.rows });
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
    const { rows } = await query(
      `INSERT INTO task_items (group_id, name, status, due_date, is_voicemail, needs_attention, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        groupId,
        payload.name.trim(),
        payload.status ?? 'todo',
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
    runBoardAutomationsForItemChange({ itemBefore, itemAfter, actorUserId: req.user.id }).catch((err) =>
      console.error('[tasks:automations:run]', err)
    );
    return res.json({ item: itemAfter });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:items:update]', err);
    return res.status(500).json({ message: 'Unable to update item' });
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
    const { rows: existingRows } = await query('SELECT * FROM task_board_automations WHERE id = $1', [automationId]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'Automation not found' });

    const workspaceId = await getWorkspaceIdForBoard(existing.board_id);
    if (!workspaceId) return res.status(404).json({ message: 'Board not found' });
    const ok = await assertWorkspaceAccess({ effRole: eff, userId, workspaceId });
    if (!ok) return res.status(403).json({ message: 'Insufficient permissions' });

    const schema = z.object({ is_active: z.boolean() });
    const payload = schema.parse(req.body);
    const { rows } = await query(
      `UPDATE task_board_automations
       SET is_active = $1
       WHERE id = $2
       RETURNING *`,
      [payload.is_active, automationId]
    );
    return res.json({ automation: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    console.error('[tasks:automations:update]', err);
    return res.status(500).json({ message: 'Unable to update automation' });
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
       WHERE g.board_id = $1`,
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
       ORDER BY g.order_index ASC, i.updated_at DESC`,
      [boardId]
    );

    const header = [
      'id',
      'name',
      'status',
      'due_date',
      'needs_attention',
      'is_voicemail',
      'group_name',
      'created_at',
      'updated_at'
    ];
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
    const content = String(u.content || '').trim().replace(/\s+/g, ' ');
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
        systemPrompt:
          'You summarize internal task updates for a project management system. Keep it concise, factual, and useful.',
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
      [itemId, payload.name.trim(), payload.status ?? 'todo', payload.due_date ?? null]
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
    const { rowCount } = await query('DELETE FROM task_subitems WHERE id = $1', [subitemId]);
    if (!rowCount) return res.status(404).json({ message: 'Subitem not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[tasks:subitems:delete]', err);
    return res.status(500).json({ message: 'Unable to delete subitem' });
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
         u.role AS user_role
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

    await query(
      `INSERT INTO task_item_assignees (item_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (item_id, user_id) DO NOTHING`,
      [itemId, targetUserId]
    );
    const { rows } = await query(
      `SELECT
         a.user_id,
         u.email,
         u.first_name,
         u.last_name,
         u.role AS user_role
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

    const { rowCount } = await query('DELETE FROM task_item_assignees WHERE item_id = $1 AND user_id = $2', [
      itemId,
      assigneeUserId
    ]);
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

export default router;


