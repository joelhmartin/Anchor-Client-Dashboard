import axios from 'axios';
import { query } from '../db.js';

const DEFAULT_SETTINGS_KEY = 'monday';

export async function getMondaySettings() {
  const { rows } = await query('SELECT value FROM app_settings WHERE key=$1', [DEFAULT_SETTINGS_KEY]);
  const val = rows[0]?.value || {};
  // Never return token to clients; token is sourced from env
  if (val.monday_token) {
    delete val.monday_token;
  }
  return val;
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
  return boards
    .filter((b) => b && b.id && b.name)
    .map((b) => ({ id: String(b.id), name: b.name }));
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
  return data?.create_item;
}

export async function listItemsByGroups({ boardId, groupIds = [], settings, columnIds = [] }) {
  const data = await mondayRequest({
    settings,
    query: `query ($boardId: [ID!], $groupIds: [String], $columns: [String]) {
      boards (ids: $boardId) {
        groups (ids: $groupIds) {
          id
          title
          items {
            id
            name
            column_values (ids: $columns) {
              id
              text
              value
              title
              type
            }
          }
        }
      }
    }`,
    variables: {
      boardId: Number(boardId),
      groupIds,
      columns: columnIds.length ? columnIds : null
    }
  });
  return data?.boards?.[0]?.groups || [];
}
