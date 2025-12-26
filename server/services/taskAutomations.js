import { query } from '../db.js';
import { createNotification } from './notifications.js';

const MAX_DUE_DAY_SPAN = 365;

function safeJson(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return {};
    }
  }
  return {};
}

function buildItemLink({ boardId, itemId }) {
  if (boardId && itemId) {
    return `/tasks?pane=boards&board=${encodeURIComponent(boardId)}&item=${encodeURIComponent(itemId)}`;
  }
  if (boardId) return `/tasks?pane=boards&board=${encodeURIComponent(boardId)}`;
  return '/tasks?pane=boards';
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

async function getActiveBoardAutomations(boardId) {
  const { rows } = await query(
    `SELECT *
     FROM task_board_automations
     WHERE board_id = $1 AND is_active = TRUE
     ORDER BY created_at ASC`,
    [boardId]
  );
  return rows || [];
}

async function getActiveGlobalAutomations() {
  const { rows } = await query(
    `SELECT *
     FROM task_global_automations
     WHERE is_active = TRUE
     ORDER BY created_at ASC`
  );
  return rows || [];
}

async function logAutomationRun({
  scope,
  automationId,
  boardId,
  itemId,
  triggerType,
  triggerFingerprint,
  status,
  error,
  meta
}) {
  try {
    await query(
      `INSERT INTO task_automation_runs (scope, automation_id, board_id, item_id, trigger_type, trigger_fingerprint, status, error, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (scope, automation_id, item_id, trigger_fingerprint)
       WHERE $6 IS NOT NULL
       DO NOTHING`,
      [
        scope,
        automationId,
        boardId || null,
        itemId || null,
        triggerType,
        triggerFingerprint || null,
        status || 'success',
        error || null,
        JSON.stringify(meta || {})
      ]
    );
    return true;
  } catch {
    return false;
  }
}

async function wasScheduledRunAlreadyLogged({ scope, automationId, itemId, triggerFingerprint }) {
  if (!triggerFingerprint) return false;
  const { rowCount } = await query(
    `SELECT 1
     FROM task_automation_runs
     WHERE scope = $1 AND automation_id = $2 AND item_id = $3 AND trigger_fingerprint = $4
     LIMIT 1`,
    [scope, automationId, itemId, triggerFingerprint]
  );
  return rowCount > 0;
}

async function executeAction({ scope, rule, boardId, item, actorUserId, event }) {
  const actionType = String(rule.action_type || '');
  const action = safeJson(rule.action_config);
  const itemId = item?.id;
  const linkUrl = action.link_url || buildItemLink({ boardId, itemId });
  const title = action.title || 'Task automation';
  const body = action.body || item?.name || '';

  const meta = {
    source: 'tasks_automation',
    scope,
    board_id: boardId || null,
    item_id: itemId || null,
    automation_id: rule.id,
    actor_user_id: actorUserId || null,
    event: event || null
  };

  if (actionType === 'notify_admins') {
    const { rows: admins } = await query("SELECT id FROM users WHERE role IN ('superadmin','admin')");
    await Promise.all(admins.map((u) => createNotification({ userId: u.id, title, body, linkUrl, meta })));
    return { ok: true };
  }

  if (actionType === 'notify_assignees') {
    // Special-case: for assignee_added trigger, notify ONLY the newly added assignee by default.
    if (String(rule.trigger_type) === 'assignee_added' && event?.assignee_user_id) {
      if (event.assignee_user_id !== actorUserId) {
        await createNotification({ userId: event.assignee_user_id, title, body, linkUrl, meta });
      }
      return { ok: true };
    }

    const { rows: assignees } = await query(`SELECT user_id FROM task_item_assignees WHERE item_id = $1`, [itemId]);
    await Promise.all(
      assignees
        .map((a) => a.user_id)
        .filter(Boolean)
        .filter((uid) => uid !== actorUserId)
        .map((uid) => createNotification({ userId: uid, title, body, linkUrl, meta }))
    );
    return { ok: true };
  }

  if (actionType === 'set_status') {
    const nextStatus = String(action.status || '').trim();
    if (!nextStatus) return { ok: false, error: 'Missing status' };
    await query(`UPDATE task_items SET status = $1, updated_at = NOW() WHERE id = $2`, [nextStatus, itemId]);
    return { ok: true };
  }

  if (actionType === 'set_needs_attention') {
    const next = Boolean(action.value);
    await query(`UPDATE task_items SET needs_attention = $1, updated_at = NOW() WHERE id = $2`, [next, itemId]);
    return { ok: true };
  }

  if (actionType === 'add_update') {
    const content = String(action.content || '').trim();
    if (!content) return { ok: false, error: 'Missing content' };
    await query(`INSERT INTO task_updates (item_id, user_id, content) VALUES ($1, NULL, $2)`, [itemId, content]);
    return { ok: true };
  }

  return { ok: false, error: `Unsupported action_type: ${actionType}` };
}

function matchesStatusChange({ rule, itemBefore, itemAfter }) {
  if (!itemBefore || !itemAfter) return false;
  if (itemBefore.status === itemAfter.status) return false;
  const trigger = safeJson(rule.trigger_config);
  const toStatus = trigger?.to_status;
  if (!toStatus) return true;
  return itemAfter.status === toStatus;
}

export async function runEventAutomationsForItemChange({ itemBefore, itemAfter, actorUserId }) {
  if (!itemBefore || !itemAfter) return;
  const boardId = await getBoardIdForItem(itemAfter.id);
  if (!boardId) return;

  const [boardRules, globalRules] = await Promise.all([getActiveBoardAutomations(boardId), getActiveGlobalAutomations()]);
  const all = [
    ...boardRules.map((r) => ({ scope: 'board', boardId, rule: r })),
    ...globalRules.map((r) => ({ scope: 'global', boardId, rule: r }))
  ];

  for (const entry of all) {
    const { scope, rule } = entry;
    if (String(rule.trigger_type) !== 'status_change') continue;
    if (!matchesStatusChange({ rule, itemBefore, itemAfter })) continue;

    try {
      const result = await executeAction({
        scope,
        rule,
        boardId,
        item: itemAfter,
        actorUserId,
        event: { type: 'status_change', from_status: itemBefore.status, to_status: itemAfter.status }
      });
      await logAutomationRun({
        scope,
        automationId: rule.id,
        boardId: scope === 'board' ? boardId : null,
        itemId: itemAfter.id,
        triggerType: 'status_change',
        triggerFingerprint: null,
        status: result.ok ? 'success' : 'error',
        error: result.ok ? null : result.error,
        meta: { from_status: itemBefore.status, to_status: itemAfter.status }
      });
    } catch (err) {
      await logAutomationRun({
        scope,
        automationId: rule.id,
        boardId: scope === 'board' ? boardId : null,
        itemId: itemAfter.id,
        triggerType: 'status_change',
        triggerFingerprint: null,
        status: 'error',
        error: err?.message || String(err),
        meta: { from_status: itemBefore.status, to_status: itemAfter.status }
      });
    }
  }
}

export async function runEventAutomationsForAssigneeAdded({ itemId, assigneeUserId, actorUserId }) {
  if (!itemId || !assigneeUserId) return;
  const boardId = await getBoardIdForItem(itemId);
  if (!boardId) return;

  const { rows: itemRows } = await query(`SELECT * FROM task_items WHERE id = $1 LIMIT 1`, [itemId]);
  const item = itemRows[0];
  if (!item) return;

  const [boardRules, globalRules] = await Promise.all([getActiveBoardAutomations(boardId), getActiveGlobalAutomations()]);
  const all = [
    ...boardRules.map((r) => ({ scope: 'board', boardId, rule: r })),
    ...globalRules.map((r) => ({ scope: 'global', boardId, rule: r }))
  ];

  for (const entry of all) {
    const { scope, rule } = entry;
    if (String(rule.trigger_type) !== 'assignee_added') continue;
    try {
      const result = await executeAction({
        scope,
        rule,
        boardId,
        item,
        actorUserId,
        event: { type: 'assignee_added', assignee_user_id: assigneeUserId }
      });
      await logAutomationRun({
        scope,
        automationId: rule.id,
        boardId: scope === 'board' ? boardId : null,
        itemId,
        triggerType: 'assignee_added',
        triggerFingerprint: null,
        status: result.ok ? 'success' : 'error',
        error: result.ok ? null : result.error,
        meta: { assignee_user_id: assigneeUserId }
      });
    } catch (err) {
      await logAutomationRun({
        scope,
        automationId: rule.id,
        boardId: scope === 'board' ? boardId : null,
        itemId,
        triggerType: 'assignee_added',
        triggerFingerprint: null,
        status: 'error',
        error: err?.message || String(err),
        meta: { assignee_user_id: assigneeUserId }
      });
    }
  }
}

export async function runDueDateAutomations({ now = new Date() } = {}) {
  const today = new Date(now);
  // Use UTC date to avoid server timezone drift on comparisons (DB uses DATE).
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  // Gather all active rules with due_date_relative trigger.
  const [boardRules, globalRules] = await Promise.all([
    query(
      `SELECT a.*, b.workspace_id
       FROM task_board_automations a
       JOIN task_boards b ON b.id = a.board_id
       WHERE a.is_active = TRUE AND a.trigger_type = 'due_date_relative'`
    ).then((r) => r.rows || []),
    query(`SELECT * FROM task_global_automations WHERE is_active = TRUE AND trigger_type = 'due_date_relative'`).then((r) => r.rows || [])
  ]);

  // Helper to compute due_date target: due_date = today - days_from_due
  async function processRule({ scope, rule, boardId }) {
    const trigger = safeJson(rule.trigger_config);
    const daysFromDueRaw = Number(trigger?.days_from_due);
    if (!Number.isFinite(daysFromDueRaw)) return { processed: 0 };
    const daysFromDue = Math.max(-MAX_DUE_DAY_SPAN, Math.min(MAX_DUE_DAY_SPAN, Math.trunc(daysFromDueRaw)));

    // due_date = today - days_from_due
    // (for -10 => 10 days before due; for 0 => on due; for +1 => 1 day after due)
    const { rows: items } = await query(
      `SELECT i.*
       FROM task_items i
       JOIN task_groups g ON g.id = i.group_id
       JOIN task_boards b ON b.id = g.board_id
       WHERE i.due_date = ($1::date - ($2::int * INTERVAL '1 day'))::date
         AND i.archived_at IS NULL
         ${boardId ? 'AND b.id = $3' : ''}`,
      boardId ? [todayStr, daysFromDue, boardId] : [todayStr, daysFromDue]
    );

    let processed = 0;
    for (const item of items) {
      const itemId = item.id;
      const resolvedBoardId = boardId || (await getBoardIdForItem(itemId));
      const triggerFingerprint = `due_date_relative:${daysFromDue}:${item.due_date}`;
      const dedupeScope = scope;
      const dedupeId = rule.id;

      // Dedupe (scheduled rules) so we only fire once per item due_date per rule.
      const already = await wasScheduledRunAlreadyLogged({
        scope: dedupeScope,
        automationId: dedupeId,
        itemId,
        triggerFingerprint
      });
      if (already) continue;

      try {
        const result = await executeAction({
          scope,
          rule,
          boardId: resolvedBoardId,
          item,
          actorUserId: null,
          event: { type: 'due_date_relative', days_from_due: daysFromDue, due_date: item.due_date }
        });
        await logAutomationRun({
          scope,
          automationId: rule.id,
          boardId: scope === 'board' ? resolvedBoardId : null,
          itemId,
          triggerType: 'due_date_relative',
          triggerFingerprint,
          status: result.ok ? 'success' : 'error',
          error: result.ok ? null : result.error,
          meta: { days_from_due: daysFromDue, due_date: item.due_date }
        });
      } catch (err) {
        await logAutomationRun({
          scope,
          automationId: rule.id,
          boardId: scope === 'board' ? resolvedBoardId : null,
          itemId,
          triggerType: 'due_date_relative',
          triggerFingerprint,
          status: 'error',
          error: err?.message || String(err),
          meta: { days_from_due: daysFromDue, due_date: item.due_date }
        });
      }
      processed += 1;
    }
    return { processed };
  }

  let total = 0;
  for (const r of boardRules) {
    const out = await processRule({ scope: 'board', rule: r, boardId: r.board_id });
    total += out.processed;
  }
  for (const r of globalRules) {
    const out = await processRule({ scope: 'global', rule: r, boardId: null });
    total += out.processed;
  }

  return { processed: total };
}



