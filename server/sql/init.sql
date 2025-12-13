-- Enable UUIDs and create users table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name VARCHAR(60) NOT NULL,
  last_name VARCHAR(60) NOT NULL,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful index for lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Client profile metadata
CREATE TABLE IF NOT EXISTS client_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  looker_url TEXT,
  monday_board_id TEXT,
  monday_group_id TEXT,
  monday_active_group_id TEXT,
  monday_completed_group_id TEXT,
  client_identifier_value TEXT,
  account_manager_person_id TEXT,
  ctm_account_number TEXT,
  ctm_api_key TEXT,
  ctm_api_secret TEXT,
  ai_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Brand assets per client
CREATE TABLE IF NOT EXISTS brand_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT,
  business_description TEXT,
  logos JSONB NOT NULL DEFAULT '[]',
  style_guides JSONB NOT NULL DEFAULT '[]',
  brand_notes TEXT,
  website_admin_email TEXT,
  website_url TEXT,
  ga_emails TEXT,
  meta_bm_email TEXT,
  social_links JSONB NOT NULL DEFAULT '{}',
  pricing_list_url TEXT,
  promo_calendar_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brand_assets_user ON brand_assets(user_id);

-- Documents (client + admin uploaded)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  name TEXT,
  url TEXT,
  origin TEXT DEFAULT 'client',
  type TEXT DEFAULT 'client',
  review_status TEXT DEFAULT 'none',
  review_requested_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  status TEXT NOT NULL DEFAULT 'unread',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

-- Calls (CTM)
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_id TEXT UNIQUE,
  direction TEXT,
  from_number TEXT,
  to_number TEXT,
  started_at TIMESTAMPTZ,
  duration_sec INTEGER,
  score INTEGER,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs(user_id);

-- Requests/tasks (create items on monday.com)
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  due_date DATE,
  rush BOOLEAN NOT NULL DEFAULT FALSE,
  person_override TEXT,
  monday_item_id TEXT,
  monday_board_id TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);

-- App-wide settings (JSON payloads by key)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Services (user's service offerings for their clients)
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  base_price DECIMAL(10, 2),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active Clients (user's customers converted from leads)
CREATE TABLE IF NOT EXISTS active_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  source TEXT,
  funnel_data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

-- Client Journey tracking
CREATE TABLE IF NOT EXISTS client_journeys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_call_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  lead_call_key TEXT REFERENCES call_logs(call_id) ON DELETE SET NULL,
  active_client_id UUID REFERENCES active_clients(id) ON DELETE SET NULL,
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
  symptoms_redacted BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending',
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  next_action_at TIMESTAMPTZ,
  notes_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_client_journeys_owner ON client_journeys(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_client_journeys_status ON client_journeys(status);
CREATE INDEX IF NOT EXISTS idx_client_journeys_lead_call_key ON client_journeys(lead_call_key);

CREATE TABLE IF NOT EXISTS client_journey_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id UUID NOT NULL REFERENCES client_journeys(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  channel TEXT,
  message TEXT,
  offset_weeks INTEGER DEFAULT 0,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_journey_steps_journey ON client_journey_steps(journey_id);

CREATE TABLE IF NOT EXISTS client_journey_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id UUID NOT NULL REFERENCES client_journeys(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_journey_notes_journey ON client_journey_notes(journey_id);

-- Client Services (junction table with pricing and service history)
CREATE TABLE IF NOT EXISTS client_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  active_client_id UUID NOT NULL REFERENCES active_clients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  agreed_price DECIMAL(10, 2),
  agreed_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_services_active_client ON client_services(active_client_id);
CREATE INDEX IF NOT EXISTS idx_client_services_service ON client_services(service_id);
CREATE INDEX IF NOT EXISTS idx_client_services_redacted ON client_services(redacted_at);

-- Blog Posts
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON blog_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);

-- Client onboarding tokens
CREATE TABLE IF NOT EXISTS client_onboarding_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_onboarding_tokens_user ON client_onboarding_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_client_onboarding_tokens_token ON client_onboarding_tokens(token_hash);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);

-- ==========================
-- Internal task platform v1
-- ==========================

CREATE TABLE IF NOT EXISTS task_workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_workspace_memberships (
  workspace_id UUID NOT NULL REFERENCES task_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS task_boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES task_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_boards_workspace ON task_boards(workspace_id);

CREATE TABLE IF NOT EXISTS task_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_task_groups_board ON task_groups(board_id);

CREATE TABLE IF NOT EXISTS task_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES task_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  due_date DATE,
  is_voicemail BOOLEAN NOT NULL DEFAULT FALSE,
  needs_attention BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_items_status_check CHECK (status IN ('todo','working','blocked','done','needs_attention'))
);
CREATE INDEX IF NOT EXISTS idx_task_items_group ON task_items(group_id);
CREATE INDEX IF NOT EXISTS idx_task_items_status ON task_items(status);

CREATE TABLE IF NOT EXISTS task_subitems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_subitems_status_check CHECK (status IN ('todo','working','blocked','done','needs_attention'))
);
CREATE INDEX IF NOT EXISTS idx_task_subitems_parent ON task_subitems(parent_item_id);

CREATE TABLE IF NOT EXISTS task_item_assignees (
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, user_id)
);

CREATE TABLE IF NOT EXISTS task_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_updates_item ON task_updates(item_id);

CREATE TABLE IF NOT EXISTS task_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES task_items(id) ON DELETE CASCADE,
  update_id UUID REFERENCES task_updates(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_files_item ON task_files(item_id);
CREATE INDEX IF NOT EXISTS idx_task_files_update ON task_files(update_id);

CREATE TABLE IF NOT EXISTS task_time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  time_spent_minutes INTEGER NOT NULL DEFAULT 0,
  billable_minutes INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  work_category TEXT,
  is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_time_billable_minutes_check CHECK (billable_minutes >= 0),
  CONSTRAINT task_time_spent_minutes_check CHECK (time_spent_minutes >= 0)
);
CREATE INDEX IF NOT EXISTS idx_task_time_entries_item ON task_time_entries(item_id);
CREATE INDEX IF NOT EXISTS idx_task_time_entries_user ON task_time_entries(user_id);

-- Automations (v1: board-scoped rules)
CREATE TABLE IF NOT EXISTS task_board_automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_board_automations_board ON task_board_automations(board_id);
CREATE INDEX IF NOT EXISTS idx_task_board_automations_active ON task_board_automations(is_active);

-- AI summaries (cached)
CREATE TABLE IF NOT EXISTS task_item_ai_summaries (
  item_id UUID PRIMARY KEY REFERENCES task_items(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'vertex',
  model TEXT,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_meta JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_task_item_ai_summaries_generated_at ON task_item_ai_summaries(generated_at);

-- Idempotent alter helpers
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS ctm_account_number TEXT;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS ctm_api_key TEXT;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS ctm_api_secret TEXT;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS ai_prompt TEXT;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS auto_star_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS monthly_revenue_goal DECIMAL(10, 2);
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS client_type TEXT;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS client_subtype TEXT;
ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS business_description TEXT;
ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Add user_id columns to services and active_clients tables
ALTER TABLE services ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE active_clients ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE active_clients ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE active_clients ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE active_clients ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE active_clients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS agreed_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE client_journeys ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE client_journeys ADD COLUMN IF NOT EXISTS lead_call_key TEXT;
ALTER TABLE client_journeys ADD COLUMN IF NOT EXISTS symptoms_redacted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_client_journeys_lead_call_key ON client_journeys(lead_call_key);
UPDATE client_journeys cj
SET lead_call_key = cl.call_id
FROM call_logs cl
WHERE cj.lead_call_key IS NULL AND cj.lead_call_id = cl.id;

-- Create indexes AFTER adding columns
CREATE INDEX IF NOT EXISTS idx_services_user ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_active_clients_owner ON active_clients(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_client_services_agreed_date ON client_services(agreed_date);
