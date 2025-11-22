import axios from 'axios';
import { query } from '../db.js';

const DEFAULT_SETTINGS_KEY = 'monday';

export async function getMondaySettings({ includeToken = false } = {}) {
  const { rows } = await query('SELECT value FROM app_settings WHERE key=$1', [DEFAULT_SETTINGS_KEY]);
  const val = rows[0]?.value || {};
  // Never return token to callers unless explicitly requested
  if (!includeToken && val.monday_token) {
    delete val.monday_token;
  }
  return val;
}

export async function saveMondaySettings(value, { includeToken = false } = {}) {
  const existing = await getMondaySettings({ includeToken: true });
  const merged = { ...existing, ...value };
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [DEFAULT_SETTINGS_KEY, merged]
  );
  if (includeToken) return merged;

  const filtered = { ...merged };
  delete filtered.monday_token;
  return filtered;
}

function getToken(settings) {
  return process.env.MONDAY_API_TOKEN || settings.monday_token || '';
}

async function mondayRequest({ query: gql, variables = {}, settings }) {
  const token = getToken(settings);
  if (!token) throw new Error('Monday token not configured');

  console.log('[monday:request]', {
    query: gql.split('\n')[0].trim().slice(0, 100) + '...',
    variables
  });

  const resp = await axios.post(
    'https://api.monday.com/v2',
    { query: gql, variables },
    {
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  if (resp.data?.errors) {
    const msg = resp.data.errors[0]?.message || 'Monday API error';
    console.error('[monday:error]', {
      errors: resp.data.errors,
      query: gql.split('\n')[0].trim(),
      variables
    });
    throw new Error(msg);
  }

  console.log('[monday:response]', {
    dataKeys: Object.keys(resp.data?.data || {}),
    data: resp.data?.data
  });

  return resp.data?.data;
}

export async function listBoards(settings) {
  const data = await mondayRequest({
    settings,
    query: `query ($limit: Int!) { boards (limit: $limit) { id name } }`,
    variables: { limit: 200 }
  });
  const boards = Array.isArray(data?.boards) ? data.boards : [];
  return boards.filter((b) => b && b.id && b.name).map((b) => ({ id: String(b.id), name: b.name }));
}

export async function listGroups(boardId, settings) {
  const data = await mondayRequest({
    settings,
    query: `query ($boardId: [ID!]) { boards (ids: $boardId) { groups { id title } } }`,
    variables: { boardId: Number(boardId) }
  });
  return data?.boards?.[0]?.groups || [];
}

export async function listColumns(boardId, settings) {
  const data = await mondayRequest({
    settings,
    query: `query ($boardId: [ID!]) { boards (ids: $boardId) { columns { id title type } } }`,
    variables: { boardId: Number(boardId) }
  });
  return data?.boards?.[0]?.columns || [];
}

export async function listPeople(settings) {
  const data = await mondayRequest({
    settings,
    query: `query { users { id name email } }`
  });
  return data?.users || [];
}

export function buildRequestColumnValues({ settings, profile, form }) {
  const values = {};

  if (settings.monday_client_column_id && profile.client_identifier_value) {
    values[settings.monday_client_column_id] = profile.client_identifier_value;
  }

  const personCol = settings.monday_person_column_id || 'person';
  const personId = form.person_override || profile.account_manager_person_id || settings.monday_person_id;
  if (personId) {
    values[personCol] = { personsAndTeams: [{ id: Number(personId), kind: 'person' }] };
  }

  if (settings.monday_status_column_id) {
    const label = form.rush ? settings.monday_rush_status_label || 'Rush Job' : settings.monday_status_label || '';
    if (label) {
      values[settings.monday_status_column_id] = { label };
    }
  }

  if (settings.monday_due_date_column_id && form.due_date) {
    values[settings.monday_due_date_column_id] = { date: form.due_date };
  }

  return values;
}

export async function createRequestItem({ boardId, groupId, name, columnValues, settings }) {
  console.log('[monday:createItem] Attempting to create item', {
    boardId,
    groupId,
    itemName: name,
    columnValues
  });

  const data = await mondayRequest({
    settings,
    query: `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
        id
        name
      }
    }`,
    variables: {
      boardId: Number(boardId),
      groupId: groupId,
      itemName: name || 'Request',
      columnValues: JSON.stringify(columnValues)
    }
  });

  console.log('[monday:createItem] Item created', {
    itemId: data?.create_item?.id,
    itemName: data?.create_item?.name
  });

  return data?.create_item;
}

export async function listItemsByGroups({ boardId, groupIds = [], settings, columnIds = [] }) {
  console.log('[monday:listItemsByGroups] Fetching items', {
    boardId,
    groupIds,
    columnIds
  });

  const data = await mondayRequest({
    settings,
    query: `query ($boardId: [ID!], $groupIds: [String]) {
      boards (ids: $boardId) {
        groups (ids: $groupIds) {
          id
          title
          items_page (limit: 100) {
            items {
              id
              name
              column_values {
                id
                text
                value
                type
              }
            }
          }
        }
      }
    }`,
    variables: {
      boardId: Number(boardId),
      groupIds
    }
  });

  const groups = data?.boards?.[0]?.groups || [];

  // Extract items from items_page wrapper
  const shapedGroups = groups.map((g) => ({
    id: g.id,
    title: g.title,
    items: g.items_page?.items || []
  }));

  console.log('[monday:listItemsByGroups] Groups fetched', {
    groupCount: shapedGroups.length,
    groups: shapedGroups.map((g) => ({ id: g.id, title: g.title, itemCount: g.items?.length || 0 }))
  });

  return shapedGroups;
}
