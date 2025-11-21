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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  logos JSONB NOT NULL DEFAULT '[]',
  style_guides JSONB NOT NULL DEFAULT '[]',
  brand_notes TEXT,
  website_admin_email TEXT,
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

-- Idempotent alter helpers
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS ctm_account_number TEXT;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS ctm_api_key TEXT;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS ctm_api_secret TEXT;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS ai_prompt TEXT;
