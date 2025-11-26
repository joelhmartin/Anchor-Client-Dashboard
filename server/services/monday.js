import axios from 'axios';
import FormData from 'form-data';
import { query } from '../db.js';

const DEFAULT_SETTINGS_KEY = 'monday';
const DEFAULT_MONDAY_SETTINGS = {
  monday_status_column_id: 'status',
  monday_status_label: 'Assigned',
  monday_rush_status_label: 'Rush Job',
  monday_due_date_column_id: 'date4',
  monday_client_files_column_id: 'monday_doc_v2_mkmqcqrg',
  monday_account_url: 'https://app.monday.com'
};

function applyMondayDefaults(settings = {}) {
  return { ...DEFAULT_MONDAY_SETTINGS, ...settings };
}

export async function getMondaySettings() {
  const { rows } = await query('SELECT value FROM app_settings WHERE key=$1', [DEFAULT_SETTINGS_KEY]);
  const val = rows[0]?.value || {};
  // Never return token to clients; token is sourced from env
  if (val.monday_token) {
    delete val.monday_token;
  }
  return applyMondayDefaults(val);
}

export async function saveMondaySettings(value) {
  const existing = await getMondaySettings();
  const merged = { ...existing, ...value };
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [DEFAULT_SETTINGS_KEY, merged]
  );
  return merged;
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

async function mondayFileRequest({ query: gql, fileFieldName = 'file', fileBuffer, fileName, mimeType, settings }) {
  const token = getToken(settings);
  if (!token) throw new Error('Monday token not configured');
  if (!fileBuffer) throw new Error('File buffer is required');

  const form = new FormData();
  form.append('query', gql);
  form.append(`variables[${fileFieldName}]`, fileBuffer, {
    filename: fileName || 'attachment',
    contentType: mimeType || 'application/octet-stream'
  });

  const resp = await axios.post('https://api.monday.com/v2/file', form, {
    headers: {
      Authorization: token,
      ...form.getHeaders()
    },
    timeout: 15000
  });

  if (resp.data?.errors) {
    const msg = resp.data.errors[0]?.message || 'Monday file upload error';
    console.error('[monday:file:error]', {
      errors: resp.data.errors
    });
    throw new Error(msg);
  }

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

export async function findPersonById(personId, settings) {
  if (!personId) return null;
  const idNum = Number(personId);
  if (!Number.isFinite(idNum)) return null;
  const data = await mondayRequest({
    settings,
    query: `query ($ids: [ID!]) { users (ids: $ids) { id name email } }`,
    variables: { ids: [idNum] }
  });
  const user = data?.users?.[0];
  if (!user) return null;
  return {
    id: String(user.id),
    name: user.name || '',
    email: user.email || ''
  };
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
    const label = form.rush
      ? settings.monday_rush_status_label || 'Rush Job'
      : settings.monday_status_label || 'Assigned';
    if (label) values[settings.monday_status_column_id] = { label };
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

export async function createItemUpdate({ itemId, body, settings }) {
  if (!itemId || !body) return null;
  const data = await mondayRequest({
    settings,
    query: `mutation ($itemId: ID!, $body: String!) {
      create_update (item_id: $itemId, body: $body) { id }
    }`,
    variables: {
      itemId: Number(itemId),
      body
    }
  });
  return data?.create_update;
}

export async function changeColumnValue({ boardId, itemId, columnId, value, settings }) {
  if (!boardId || !itemId || !columnId || value === undefined) return null;
  const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
  const data = await mondayRequest({
    settings,
    query: `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value (board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
    }`,
    variables: {
      boardId: Number(boardId),
      itemId: Number(itemId),
      columnId,
      value: serializedValue
    }
  });
  return data?.change_column_value;
}

export async function uploadFileToColumn({ itemId, columnId, fileBuffer, fileName, mimeType, settings }) {
  if (!itemId || !columnId || !fileBuffer) return null;
  const query = `mutation ($file: File!) {
    add_file_to_column (item_id: ${Number(itemId)}, column_id: "${columnId}", file: $file) { id }
  }`;
  return mondayFileRequest({
    query,
    fileFieldName: 'file',
    fileBuffer,
    fileName,
    mimeType,
    settings
  });
}
