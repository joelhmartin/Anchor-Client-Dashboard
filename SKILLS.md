# Anchor Client Dashboard - Application Skills & Capabilities

> ⚠️ **MAINTENANCE REMINDERS**:
> - **Database Changes**: When making database schema changes (adding tables, columns, indexes), **ALWAYS update the Database Schema Map section** at the bottom of this file to keep it synchronized with `server/sql/init.sql`.
> - **Package Installs**: When adding or updating npm packages, **ALWAYS run `yarn install`** to update `yarn.lock`, then commit both `package.json` and `yarn.lock`. Cloud Build uses `--immutable` and will fail if the lockfile is out of sync.

## Overview

The Anchor Client Dashboard is a comprehensive CRM and client management platform designed for service businesses. It integrates call tracking, lead management, client onboarding, task management, and content creation into a unified dashboard.

---

## 📚 Related Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Project overview and quick start |
| [docs/SETUP.md](docs/SETUP.md) | Development environment setup |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and design patterns |
| [docs/DATA_FLOWS.md](docs/DATA_FLOWS.md) | Business workflow documentation |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Complete API endpoint documentation |
| [docs/SECURITY.md](docs/SECURITY.md) | Authentication and security architecture |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Third-party integration guides |

---

## 🎯 Core Capabilities

### 1. Lead Management (CTM Integration)

**Call Tracking Metrics Integration**

- Pulls calls from CTM with paginated incremental sync
- Two-way rating sync (changes in CTM reflect in the app and vice versa)
- Automatic AI classification of calls using Vertex AI (Gemini)
- Manual classification override capability

**Lead Categories**

> **Note:** The `converted` category is **manual only** - it is not assigned by AI classification. It is set when a user marks a lead as 5 stars or uses "Agreed to Service".

| Category | Description | Star Rating | AI-Assigned? |
|----------|-------------|-------------|--------------|
| `converted` | Agreed to purchase/book service | ⭐⭐⭐⭐⭐ | ❌ Manual only |
| `warm` | Promising lead interested in services | ⭐⭐⭐ | ✅ |
| `very_good` | Ready to book/buy now | ⭐⭐⭐⭐ | ✅ |
| `needs_attention` | Left voicemail requesting callback | ⭐⭐⭐ | ✅ |
| `voicemail` | Voicemail with no actionable details | — | ✅ |
| `unanswered` | No conversation occurred | — | ✅ |
| `not_a_fit` | Not a fit for services | ⭐⭐ | ✅ |
| `spam` | Telemarketer, robocall, irrelevant | ⭐ | ✅ |
| `neutral` | General inquiry, unclear intent | — | ✅ |
| `applicant` | Job/employment inquiry only | — | ✅ |
| `unreviewed` | Default state, not yet classified | — | ✅ (default) |

**Lead Features**

- Star rating system (1-5 stars, synced with CTM)
- Custom tagging system
- Transcript viewing
- Call history by phone number
- Repeat caller detection ("Repeat Caller" / "Returning Customer" badges)
- Lead notes and communication logs
- Saved filter views
- CSV export
- Pipeline stage management
- **Reclassify Leads**: Admin feature to re-run AI classification on existing leads without re-fetching from CTM (visible in leads list when admin is in client view mode)

---

### 2. Client Journey Management

**Journey Workflow**

- Create journeys from leads with assigned services/concerns
- Multi-journey support (same client can have multiple journeys)
- Step-based progress tracking
- Step-level notes
- Timeline view of journey events
- Status management: `pending`, `in_progress`, `active_client`, `won`, `lost`, `archived`

**Journey Templates**

- Create reusable journey templates
- Apply templates to new journeys
- Customize steps per client

**Active Client Conversion**

- Convert journeys to active clients
- Link calls to existing active clients
- Track services agreed to with dates

---

### 3. Client Onboarding

**Multi-Step Wizard**

- Profile setup (name, email, password, phone, communication preferences)
- Services selection
- Brand assets upload (logo, style guides)
- Website access credentials
- Google Analytics 4 access
- Google Ads access
- Meta/Facebook access
- Website forms configuration

**Onboarding Features**

- Token-based secure onboarding links
- "Save and Continue Later" functionality
- Progress persistence across sessions
- Account activation by admin
- Onboarding completion emails
- Automatic reminders for incomplete onboarding

---

### 4. Admin Hub

**User Management**

- Create/edit/delete admin users
- Create/edit/delete client accounts
- Role management: `superadmin`, `admin`, `team`, `client`, `editor`
- "Act as Client" mode for admins

**Client Configuration**

- Client type presets (Medical, Home Service, Food Service, Other)
- Subtype-specific configurations:
  - **Medical**: Dental, TMJ & Sleep, Med Spa, Chiropractic
  - **Home Service**: Roofing, Plumbing, HVAC, Landscaping/Hardscaping
  - **Food Service**: General
- Custom AI classification prompts
- CTM credentials configuration
- Monday.com integration settings
- Service package management

**Email Logs**

- View all client-facing emails sent from the system
- Email status tracking (sent, failed)
- Full email content viewing
- 30-day statistics summary

---

### 5. Document Management

**Client Documents**

- Upload/download client-specific documents
- Mark documents as viewed
- Admin review and approval workflow

**Shared Documents**

- Admin-uploaded documents shared with all clients
- Drag-and-drop reordering
- Category/title management

---

### 6. Brand Asset Management

- Logo upload and storage
- Style guide uploads (PDFs, images)
- Brand color specifications
- Font preferences
- Persistent storage in PostgreSQL (survives deployments)

---

### 7. Task Management

**Task Features**

- Create tasks with title, description, status
- Task assignment
- Due date tracking
- Status workflow: pending → in_progress → complete
- Task attachments

**Monday.com Integration**

- Sync tasks with Monday.com boards
- Board/group configuration per client
- Column mapping

---

### 8. Blog/Content Management

**Blog Editor**

- Rich text editing
- AI-powered content generation (Vertex AI)
- Draft/publish workflow
- Client-specific blogs

**AI Features**

- Blog post generation from prompts
- Content optimization suggestions
- Image generation (Vertex Imagen)

---

### 10. Analytics & Reporting

**Looker Integration**

- Embedded Looker dashboards
- Client-specific analytics URLs

**Lead Statistics**

- Category breakdown
- Conversion funnel visualization
- Source tracking

---

### 11. Reviews Management (Google Business Profile)

**Review Dashboard**

- Centralized view of all Google reviews
- Filtering by rating, response status, priority, sentiment
- Search functionality across reviews
- Pagination with configurable page size
- Statistics cards showing key metrics

**Review Response System**

- Manual response composition
- AI-assisted response drafting using Google Vertex AI
- Tone selection: Professional, Friendly, Casual, Formal, Empathetic
- Response preview and editing
- One-click send after human review
- Draft history tracking

**Review Management**

- Priority levels: Low, Normal, High, Urgent
- Flagging system for reviews needing attention
- Auto-flag reviews at or below configurable rating threshold
- Internal notes per review
- Sentiment analysis (Positive, Neutral, Negative, Mixed)

**Review Request Workflow**

- Generate review request links
- Multiple delivery methods: Email, SMS, Link copy
- Customer information tracking
- Request status tracking
- Campaign management support

**AI Automation (Future-Ready)**

- Automation rules engine (designed but not auto-enabled)
- Configurable triggers: Rating range, sentiment, keywords
- Action types: Draft, Auto-send, Flag, Notify
- Human approval gates for negative reviews
- Rate limiting (hourly/daily limits)
- Full audit trail of AI actions

**Business Context Integration**

- Pulls business name and description from brand assets
- Reviewer name personalization
- Configurable response signature
- Multi-location support via OAuth resources

---

## 🔧 Technical Capabilities

### Authentication & Security

**Token-Based Session Management**

- Short-lived JWT access tokens (15 minutes)
- Rotating refresh tokens with reuse detection
- Absolute session lifetime (90 days)
- Session revocation on security events (password change, MFA change)
- Device fingerprinting and tracking

**Multi-Factor Authentication (MFA)**

- Conditional MFA based on risk signals
- Email OTP (6-digit, 10-minute expiry)
- Trusted device management (30-day trust window)
- MFA triggers: new device, new IP/country, inactivity

**Password Security**

- Argon2id password hashing (bcrypt fallback for migration)
- Strong password policy (12+ chars, complexity requirements)
- Automatic hash upgrade on login

**OAuth 2.0 Support (Architecture Ready)**

- Google OAuth integration
- Microsoft 365 OAuth integration
- Provider MFA trust (no app-level MFA for OAuth users)

**Rate Limiting & Brute Force Protection**

- IP-based and user-based rate limiting
- Account lockout after repeated failures
- Automatic lockout expiry

**Security Audit Logging**

- Immutable security event log
- Login attempts, MFA challenges, session events
- Compliance-ready (SOC 2, HIPAA aligned)

**Legacy Support**

- Role-based access control (RBAC): superadmin, admin, team, editor, client
- Secure onboarding tokens with expiration
- Content Security Policy (CSP) headers
- CORS configuration

### API Architecture

- RESTful API design
- Express.js backend
- PostgreSQL database
- File upload handling (Multer)
- Rate limiting

### Integrations

| Service                   | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| CallTrackingMetrics (CTM) | Call data and scoring                                     |
| Monday.com                | Task management sync                                      |
| Mailgun                   | Transactional emails                                      |
| Google Vertex AI          | Content generation, call classification, review responses |
| Google Vertex Imagen      | Image generation                                          |
| Google Business Profile   | Review management and responses                           |
| Looker                    | Analytics dashboards                                      |

### Deployment

- Cloud Run optimized
- Automatic database migrations
- Environment-based configuration
- Static asset caching with immutable headers
- Health check endpoint

---

## 📱 User Roles & Permissions

| Role         | Capabilities                               |
| ------------ | ------------------------------------------ |
| `superadmin` | Full system access, all admin features     |
| `admin`      | Client management, settings, act-as-client |
| `team`       | Task management, limited admin             |
| `editor`     | Content editing, client view               |
| `client`     | Own portal access only                     |

---

## 🎨 UI/UX Features

- Material-UI (MUI) component library
- Responsive design
- Dark/light theme support
- Toast notifications
- Drawer-based detail views
- Tabbed interfaces
- Drag-and-drop support
- Keyboard shortcuts
- Error boundaries with auto-reload for chunk failures

---

## 📁 Service Type Presets

### Medical

- **Dental**: Exams, whitening, implants, root canals, Invisalign, crowns, emergency, pediatric, cosmetic, periodontal
- **TMJ & Sleep**: TMJ, CPAP, sleep apnea, appliances, pediatric, Nightlase, sleep study, Nuvola, Botox, oral surgery
- **Med Spa**: Botox & fillers, microneedling, laser hair removal, Hydrafacial, chemical peel, CoolSculpting, IPL, body contouring
- **Chiropractic**: Spinal adjustment, posture correction, sports injury, prenatal, massage, corrective exercises, pain relief

### Home Service

- **Roofing**: Inspection, repair, replacement, storm damage, gutters, skylights
- **Plumbing**: Drain cleaning, water heater, tankless install, pipe replacement, leak detection, sewer line
- **HVAC**: AC install/repair, furnace install/repair, heat pump, duct cleaning, tune-up
- **Landscaping**: Landscape design, lawn maintenance, patio & pavers, retaining walls, lighting, irrigation, tree care, sod, hardscape, seasonal cleanup

### Food Service

- General catering and hospitality

---

## 🔄 Scheduled Jobs

| Job                        | Schedule        | Purpose                                  |
| -------------------------- | --------------- | ---------------------------------------- |
| Onboarding reminders       | Daily           | Send reminders for incomplete onboarding |
| Task cleanup               | Daily           | Archive completed tasks after 30 days    |
| Service redaction          | Daily           | Redact old service records after 90 days |
| Form submission processing | Every 2 minutes | Process queued form submissions          |
| Due date automations       | Every 5 minutes | Update task statuses based on due dates  |

---

## 📧 Email Types

- Onboarding invitations
- Onboarding completion confirmations
- Password reset requests
- Account activation notices
- Document review requests
- Blog post notifications
- Rush job requests
- Form submission notifications
- Onboarding reminders

---

## 🗄️ Database Schema Map

> ⚠️ **IMPORTANT**: This section must be kept in sync with `server/sql/init.sql`. When adding/modifying tables or columns, update this documentation.

### Core User Tables

#### `users`

Primary user accounts for all roles.

| Column          | Type        | Description                                       |
| --------------- | ----------- | ------------------------------------------------- |
| `id`            | UUID        | Primary key                                       |
| `first_name`    | VARCHAR(60) | User's first name                                 |
| `last_name`     | VARCHAR(60) | User's last name                                  |
| `email`         | CITEXT      | Unique email (case-insensitive)                   |
| `password_hash` | TEXT        | Bcrypt hashed password                            |
| `avatar_url`    | TEXT        | Optional avatar URL                               |
| `role`          | TEXT        | `superadmin`, `admin`, `team`, `editor`, `client` |
| `created_at`    | TIMESTAMPTZ | Account creation time                             |
| `updated_at`    | TIMESTAMPTZ | Last update time                                  |

#### `user_avatars`

Binary avatar storage (for Cloud Run persistence).

| Column         | Type        | Description                    |
| -------------- | ----------- | ------------------------------ |
| `user_id`      | UUID        | FK → users.id (PK)             |
| `content_type` | TEXT        | MIME type (e.g., `image/jpeg`) |
| `bytes`        | BYTEA       | Raw image data                 |
| `updated_at`   | TIMESTAMPTZ | Last update time               |

---

### Client Profile & Configuration

#### `client_profiles`

Extended client configuration and onboarding state.

| Column                             | Type          | Description                                        |
| ---------------------------------- | ------------- | -------------------------------------------------- |
| `user_id`                          | UUID          | FK → users.id (PK)                                 |
| `client_type`                      | TEXT          | `medical`, `home_service`, `food_service`, `other` |
| `client_subtype`                   | TEXT          | e.g., `dental`, `roofing`, `landscaping`           |
| `client_package`                   | TEXT          | Service package name                               |
| `looker_url`                       | TEXT          | Embedded Looker dashboard URL                      |
| **Contact Info**                   |               |                                                    |
| `call_tracking_main_number`        | TEXT          | Main CTM phone number                              |
| `front_desk_emails`                | TEXT          | Front desk email(s)                                |
| `office_admin_name`                | TEXT          | Office admin contact name                          |
| `office_admin_email`               | TEXT          | Office admin email                                 |
| `office_admin_phone`               | TEXT          | Office admin phone                                 |
| `form_email_recipients`            | TEXT          | Form submission recipients                         |
| **CTM Integration**                |               |                                                    |
| `ctm_account_number`               | TEXT          | CTM account ID                                     |
| `ctm_api_key`                      | TEXT          | CTM API key                                        |
| `ctm_api_secret`                   | TEXT          | CTM API secret                                     |
| `ctm_sync_cursor`                  | TIMESTAMPTZ   | Last sync timestamp for incremental fetch          |
| `ctm_last_page_token`              | TEXT          | Pagination token for CTM sync                      |
| **AI Configuration**               |               |                                                    |
| `ai_prompt`                        | TEXT          | Custom AI classification prompt                    |
| `auto_star_enabled`                | BOOLEAN       | Enable auto-star rating                            |
| **Onboarding Status Flags**        |               |                                                    |
| `website_access_status`            | TEXT          | `not_started`, `in_progress`, `complete`           |
| `ga4_access_status`                | TEXT          | GA4 access status                                  |
| `google_ads_access_status`         | TEXT          | Google Ads access status                           |
| `google_ads_account_id`            | TEXT          | Google Ads account ID                              |
| `meta_access_status`               | TEXT          | Meta/Facebook access status                        |
| `website_forms_details_status`     | TEXT          | Forms step status                                  |
| **Step Requirements (Admin)**      |               |                                                    |
| `requires_website_access`          | BOOLEAN       | Enable website access step                         |
| `requires_ga4_access`              | BOOLEAN       | Enable GA4 step                                    |
| `requires_google_ads_access`       | BOOLEAN       | Enable Google Ads step                             |
| `requires_meta_access`             | BOOLEAN       | Enable Meta step                                   |
| `requires_forms_step`              | BOOLEAN       | Enable forms step                                  |
| **Client Confirmations**           |               |                                                    |
| `website_access_provided`          | BOOLEAN       | Client provided website access                     |
| `website_access_understood`        | BOOLEAN       | Client confirmed understanding                     |
| `ga4_access_provided`              | BOOLEAN       | Client provided GA4 access                         |
| `ga4_access_understood`            | BOOLEAN       | Client confirmed GA4 understanding                 |
| `google_ads_access_provided`       | BOOLEAN       | Client provided Google Ads access                  |
| `google_ads_access_understood`     | BOOLEAN       | Client confirmed Google Ads understanding          |
| `meta_access_provided`             | BOOLEAN       | Client provided Meta access                        |
| `meta_access_understood`           | BOOLEAN       | Client confirmed Meta understanding                |
| `website_forms_details_provided`   | BOOLEAN       | Client provided form details                       |
| `website_forms_details_understood` | BOOLEAN       | Client confirmed forms understanding               |
| `website_forms_uses_third_party`   | BOOLEAN       | Uses third-party forms                             |
| `website_forms_uses_hipaa`         | BOOLEAN       | HIPAA-compliant forms                              |
| `website_forms_connected_crm`      | BOOLEAN       | Forms connected to CRM                             |
| `website_forms_custom`             | BOOLEAN       | Custom form implementation                         |
| `website_forms_notes`              | TEXT          | Additional form notes                              |
| **Monday.com Integration**         |               |                                                    |
| `monday_board_id`                  | TEXT          | Monday.com board ID                                |
| `monday_group_id`                  | TEXT          | Monday.com group ID                                |
| `monday_active_group_id`           | TEXT          | Active items group                                 |
| `monday_completed_group_id`        | TEXT          | Completed items group                              |
| `client_identifier_value`          | TEXT          | Client identifier for Monday                       |
| `account_manager_person_id`        | TEXT          | Account manager ID                                 |
| **Internal Task Manager**          |               |                                                    |
| `task_workspace_id`                | UUID          | FK → task_workspaces.id                            |
| `task_board_id`                    | UUID          | FK → task_boards.id                                |
| `board_prefix`                     | TEXT          | Board item prefix                                  |
| **Onboarding State**               |               |                                                    |
| `onboarding_completed_at`          | TIMESTAMPTZ   | When onboarding finished                           |
| `activated_at`                     | TIMESTAMPTZ   | When admin activated account                       |
| `onboarding_draft_json`            | JSONB         | Save & continue later state                        |
| `onboarding_draft_saved_at`        | TIMESTAMPTZ   | Last draft save time                               |
| `monthly_revenue_goal`             | DECIMAL(10,2) | Revenue target                                     |
| `created_at`                       | TIMESTAMPTZ   | Profile creation time                              |
| `updated_at`                       | TIMESTAMPTZ   | Last update time                                   |

#### `brand_assets`

Client branding information and assets.

| Column                 | Type        | Description                                 |
| ---------------------- | ----------- | ------------------------------------------- |
| `id`                   | UUID        | Primary key                                 |
| `user_id`              | UUID        | FK → users.id                               |
| `business_name`        | TEXT        | Business name                               |
| `business_description` | TEXT        | Business description for AI context         |
| `primary_brand_colors` | TEXT        | Brand colors (hex codes)                    |
| `logos`                | JSONB       | Array of logo objects `[{name, url, type}]` |
| `style_guides`         | JSONB       | Array of style guide objects                |
| `brand_notes`          | TEXT        | Additional branding notes                   |
| `website_url`          | TEXT        | Client website URL                          |
| `updated_at`           | TIMESTAMPTZ | Last update time                            |

---

### Lead & Call Management (CTM)

#### `call_logs`

Call records from CallTrackingMetrics.

| Column              | Type        | Description                                  |
| ------------------- | ----------- | -------------------------------------------- |
| `id`                | UUID        | Primary key                                  |
| `user_id`           | UUID        | FK → users.id (legacy, use owner_user_id)    |
| `owner_user_id`     | UUID        | FK → users.id (client owner)                 |
| `call_id`           | TEXT        | CTM call ID (unique)                         |
| `direction`         | TEXT        | `inbound`, `outbound`                        |
| `from_number`       | TEXT        | Caller phone number                          |
| `to_number`         | TEXT        | Called number                                |
| `started_at`        | TIMESTAMPTZ | Call start time                              |
| `duration_sec`      | INTEGER     | Call duration in seconds                     |
| `score`             | INTEGER     | Star rating (1-5)                            |
| `meta`              | JSONB       | Full CTM data, AI classification, transcript |
| `caller_type`       | TEXT        | `new`, `repeat`, `returning_customer`        |
| `call_sequence`     | INTEGER     | Nth call from this number                    |
| `active_client_id`  | UUID        | FK → active_clients.id (if linked)           |
| `pipeline_stage_id` | UUID        | FK → lead_pipeline_stages.id                 |
| `created_at`        | TIMESTAMPTZ | Record creation time                         |

**Key `meta` JSONB fields:**

- `category`: AI classification (`converted`, `warm`, `very_good`, `needs_attention`, `voicemail`, `unanswered`, `not_a_fit`, `spam`, `neutral`, `applicant`, `unreviewed`)
- `classification_summary`: AI-generated summary
- `transcript`: Full call transcript text
- `transcript_url`: CTM transcript URL
- `recording_url`: Call recording URL
- `caller_name`: Caller's name from CTM

#### `lead_pipeline_stages`

Custom pipeline stages for lead management.

| Column          | Type        | Description      |
| --------------- | ----------- | ---------------- |
| `id`            | UUID        | Primary key      |
| `owner_user_id` | UUID        | FK → users.id    |
| `name`          | TEXT        | Stage name       |
| `color`         | TEXT        | Hex color code   |
| `position`      | INTEGER     | Sort order       |
| `is_won_stage`  | BOOLEAN     | Marks won deals  |
| `is_lost_stage` | BOOLEAN     | Marks lost deals |
| `created_at`    | TIMESTAMPTZ | Creation time    |
| `updated_at`    | TIMESTAMPTZ | Last update time |

#### `lead_notes`

Communication log entries for leads.

| Column          | Type        | Description                               |
| --------------- | ----------- | ----------------------------------------- |
| `id`            | UUID        | Primary key                               |
| `owner_user_id` | UUID        | FK → users.id                             |
| `call_id`       | TEXT        | CTM call ID (not FK)                      |
| `author_id`     | UUID        | FK → users.id                             |
| `note_type`     | TEXT        | `note`, `call`, `email`, `sms`, `meeting` |
| `body`          | TEXT        | Note content                              |
| `metadata`      | JSONB       | Additional data                           |
| `created_at`    | TIMESTAMPTZ | Creation time                             |

#### `lead_saved_views`

Saved filter configurations.

| Column          | Type        | Description          |
| --------------- | ----------- | -------------------- |
| `id`            | UUID        | Primary key          |
| `owner_user_id` | UUID        | FK → users.id        |
| `name`          | TEXT        | View name            |
| `filters`       | JSONB       | Filter configuration |
| `is_default`    | BOOLEAN     | Default view flag    |
| `created_at`    | TIMESTAMPTZ | Creation time        |
| `updated_at`    | TIMESTAMPTZ | Last update time     |

#### `lead_tags`

Custom tags for organizing leads.

| Column          | Type        | Description                 |
| --------------- | ----------- | --------------------------- |
| `id`            | UUID        | Primary key                 |
| `owner_user_id` | UUID        | FK → users.id               |
| `name`          | TEXT        | Tag name (unique per owner) |
| `color`         | TEXT        | Hex color code              |
| `created_at`    | TIMESTAMPTZ | Creation time               |

#### `call_log_tags`

Junction table linking calls to tags.

| Column       | Type        | Description       |
| ------------ | ----------- | ----------------- |
| `id`         | UUID        | Primary key       |
| `call_id`    | TEXT        | CTM call ID       |
| `tag_id`     | UUID        | FK → lead_tags.id |
| `created_at` | TIMESTAMPTZ | Creation time     |

---

### Client Journey & Active Clients

#### `active_clients`

Converted leads / current customers.

| Column          | Type        | Description                      |
| --------------- | ----------- | -------------------------------- |
| `id`            | UUID        | Primary key                      |
| `owner_user_id` | UUID        | FK → users.id                    |
| `client_name`   | TEXT        | Client's name                    |
| `client_phone`  | TEXT        | Client's phone                   |
| `client_email`  | TEXT        | Client's email                   |
| `source`        | TEXT        | Lead source                      |
| `funnel_data`   | JSONB       | Conversion funnel data           |
| `status`        | TEXT        | `active`, `inactive`, `archived` |
| `created_at`    | TIMESTAMPTZ | Creation time                    |
| `updated_at`    | TIMESTAMPTZ | Last update time                 |
| `archived_at`   | TIMESTAMPTZ | Archive timestamp                |

#### `client_journeys`

Client journey tracking records.

| Column              | Type        | Description                                                          |
| ------------------- | ----------- | -------------------------------------------------------------------- |
| `id`                | UUID        | Primary key                                                          |
| `owner_user_id`     | UUID        | FK → users.id                                                        |
| `lead_call_id`      | UUID        | FK → call_logs.id                                                    |
| `lead_call_key`     | TEXT        | FK → call_logs.call_id                                               |
| `active_client_id`  | UUID        | FK → active_clients.id                                               |
| `service_id`        | UUID        | FK → services.id                                                     |
| `parent_journey_id` | UUID        | FK → client_journeys.id (for multi-journey)                          |
| `client_name`       | TEXT        | Client's name                                                        |
| `client_phone`      | TEXT        | Client's phone                                                       |
| `client_email`      | TEXT        | Client's email                                                       |
| `symptoms`          | JSONB       | Array of concerns/services                                           |
| `symptoms_redacted` | BOOLEAN     | Privacy redaction flag                                               |
| `status`            | TEXT        | `pending`, `in_progress`, `active_client`, `won`, `lost`, `archived` |
| `paused`            | BOOLEAN     | Journey paused flag                                                  |
| `next_action_at`    | TIMESTAMPTZ | Next scheduled action                                                |
| `notes_summary`     | TEXT        | Summary of notes                                                     |
| `created_at`        | TIMESTAMPTZ | Creation time                                                        |
| `updated_at`        | TIMESTAMPTZ | Last update time                                                     |
| `archived_at`       | TIMESTAMPTZ | Archive timestamp                                                    |

#### `client_journey_steps`

Individual steps within a journey.

| Column         | Type        | Description             |
| -------------- | ----------- | ----------------------- |
| `id`           | UUID        | Primary key             |
| `journey_id`   | UUID        | FK → client_journeys.id |
| `position`     | INTEGER     | Step order              |
| `label`        | TEXT        | Step name               |
| `channel`      | TEXT        | Communication channel   |
| `message`      | TEXT        | Message template        |
| `offset_weeks` | INTEGER     | Weeks offset from start |
| `due_at`       | TIMESTAMPTZ | Due date                |
| `completed_at` | TIMESTAMPTZ | Completion timestamp    |
| `notes`        | TEXT        | Step-level notes        |
| `created_at`   | TIMESTAMPTZ | Creation time           |

#### `client_journey_notes`

Notes attached to journeys.

| Column       | Type        | Description             |
| ------------ | ----------- | ----------------------- |
| `id`         | UUID        | Primary key             |
| `journey_id` | UUID        | FK → client_journeys.id |
| `author_id`  | UUID        | FK → users.id           |
| `body`       | TEXT        | Note content            |
| `created_at` | TIMESTAMPTZ | Creation time           |

---

### Services & Client Services

#### `services`

Available services that can be offered to clients.

| Column        | Type          | Description           |
| ------------- | ------------- | --------------------- |
| `id`          | UUID          | Primary key           |
| `user_id`     | UUID          | FK → users.id (owner) |
| `name`        | TEXT          | Service name          |
| `description` | TEXT          | Service description   |
| `base_price`  | DECIMAL(10,2) | Base price            |
| `active`      | BOOLEAN       | Is service active     |
| `created_at`  | TIMESTAMPTZ   | Creation time         |
| `updated_at`  | TIMESTAMPTZ   | Last update time      |

#### `client_services`

Junction table for services agreed by active clients.

| Column             | Type          | Description                 |
| ------------------ | ------------- | --------------------------- |
| `id`               | UUID          | Primary key                 |
| `active_client_id` | UUID          | FK → active_clients.id      |
| `service_id`       | UUID          | FK → services.id            |
| `agreed_price`     | DECIMAL(10,2) | Negotiated price            |
| `agreed_date`      | TIMESTAMPTZ   | When client agreed          |
| `redacted_at`      | TIMESTAMPTZ   | Privacy redaction timestamp |
| `created_at`       | TIMESTAMPTZ   | Creation time               |

---

### OAuth Integration

#### `oauth_providers`

App-level OAuth credentials (admin-configured).

| Column          | Type        | Description                                 |
| --------------- | ----------- | ------------------------------------------- |
| `id`            | UUID        | Primary key                                 |
| `provider`      | TEXT        | `google`, `facebook`, `instagram`, `tiktok` |
| `client_id`     | TEXT        | OAuth client ID                             |
| `client_secret` | TEXT        | OAuth client secret                         |
| `redirect_uri`  | TEXT        | OAuth redirect URI                          |
| `auth_url`      | TEXT        | Authorization URL                           |
| `token_url`     | TEXT        | Token exchange URL                          |
| `scopes`        | JSONB       | Required scopes array                       |
| `is_active`     | BOOLEAN     | Provider enabled                            |
| `notes`         | TEXT        | Admin notes                                 |
| `created_at`    | TIMESTAMPTZ | Creation time                               |
| `updated_at`    | TIMESTAMPTZ | Last update time                            |

#### `oauth_connections`

Per-client OAuth connections.

| Column                    | Type        | Description                                 |
| ------------------------- | ----------- | ------------------------------------------- |
| `id`                      | UUID        | Primary key                                 |
| `client_id`               | UUID        | FK → users.id                               |
| `provider`                | TEXT        | `google`, `facebook`, `instagram`, `tiktok` |
| `provider_account_id`     | TEXT        | Account ID from provider                    |
| `provider_account_name`   | TEXT        | Display name                                |
| `access_token`            | TEXT        | OAuth access token                          |
| `refresh_token`           | TEXT        | OAuth refresh token                         |
| `token_type`              | TEXT        | Token type (usually `Bearer`)               |
| `scope_granted`           | JSONB       | Granted scopes array                        |
| `expires_at`              | TIMESTAMPTZ | Token expiration                            |
| `is_connected`            | BOOLEAN     | Connection active                           |
| `revoked_at`              | TIMESTAMPTZ | When revoked                                |
| `last_refreshed_at`       | TIMESTAMPTZ | Last token refresh                          |
| `last_error`              | TEXT        | Last error message                          |
| `external_metadata`       | JSONB       | Provider-specific data                      |
| **Security Fields**       |             |                                             |
| `encrypted_access_token`  | TEXT        | Encrypted access token                      |
| `encrypted_refresh_token` | TEXT        | Encrypted refresh token                     |
| `token_hash`              | TEXT        | Token hash for validation                   |
| `kms_key_id`              | TEXT        | KMS key identifier                          |
| `last_rotated_at`         | TIMESTAMPTZ | Last key rotation                           |
| `created_at`              | TIMESTAMPTZ | Creation time                               |
| `updated_at`              | TIMESTAMPTZ | Last update time                            |

#### `oauth_resources`

Resources (pages/locations) under OAuth connections.

| Column                | Type        | Description                                                               |
| --------------------- | ----------- | ------------------------------------------------------------------------- |
| `id`                  | UUID        | Primary key                                                               |
| `client_id`           | UUID        | FK → users.id                                                             |
| `oauth_connection_id` | UUID        | FK → oauth_connections.id                                                 |
| `provider`            | TEXT        | `google`, `facebook`, `instagram`, `tiktok`                               |
| `resource_type`       | TEXT        | `google_location`, `facebook_page`, `instagram_account`, `tiktok_account` |
| `resource_id`         | TEXT        | Platform's resource ID                                                    |
| `resource_name`       | TEXT        | Display name                                                              |
| `resource_username`   | TEXT        | Username/handle                                                           |
| `resource_url`        | TEXT        | Resource URL                                                              |
| `is_primary`          | BOOLEAN     | Primary resource flag                                                     |
| `is_enabled`          | BOOLEAN     | Resource enabled                                                          |
| `created_at`          | TIMESTAMPTZ | Creation time                                                             |
| `updated_at`          | TIMESTAMPTZ | Last update time                                                          |

---

### Documents

#### `documents`

Client and admin uploaded documents.

| Column                | Type        | Description                   |
| --------------------- | ----------- | ----------------------------- |
| `id`                  | UUID        | Primary key                   |
| `user_id`             | UUID        | FK → users.id                 |
| `label`               | TEXT        | Document label                |
| `name`                | TEXT        | Original filename             |
| `url`                 | TEXT        | Storage URL                   |
| `origin`              | TEXT        | `client`, `admin`             |
| `type`                | TEXT        | Document type                 |
| `review_status`       | TEXT        | `none`, `pending`, `approved` |
| `review_requested_at` | TIMESTAMPTZ | Review request time           |
| `viewed_at`           | TIMESTAMPTZ | Last viewed time              |
| `created_at`          | TIMESTAMPTZ | Upload time                   |
| `created_by`          | UUID        | FK → users.id                 |

#### `shared_documents`

Admin-uploaded documents for all clients.

| Column        | Type        | Description          |
| ------------- | ----------- | -------------------- |
| `id`          | UUID        | Primary key          |
| `label`       | TEXT        | Document label       |
| `name`        | TEXT        | Original filename    |
| `url`         | TEXT        | Storage URL          |
| `description` | TEXT        | Document description |
| `sort_order`  | INTEGER     | Display order        |
| `created_by`  | UUID        | FK → users.id        |
| `created_at`  | TIMESTAMPTZ | Upload time          |
| `updated_at`  | TIMESTAMPTZ | Last update time     |

---

### Blog & Content

#### `blog_posts`

Client blog posts.

| Column         | Type        | Description                  |
| -------------- | ----------- | ---------------------------- |
| `id`           | UUID        | Primary key                  |
| `user_id`      | UUID        | FK → users.id                |
| `title`        | TEXT        | Post title                   |
| `content`      | TEXT        | Post content (HTML/Markdown) |
| `status`       | TEXT        | `draft`, `published`         |
| `created_at`   | TIMESTAMPTZ | Creation time                |
| `updated_at`   | TIMESTAMPTZ | Last update time             |
| `published_at` | TIMESTAMPTZ | Publish timestamp            |

---

### Authentication & Tokens

#### `client_onboarding_tokens`

Secure onboarding invitation tokens.

| Column             | Type        | Description            |
| ------------------ | ----------- | ---------------------- |
| `id`               | UUID        | Primary key            |
| `user_id`          | UUID        | FK → users.id          |
| `token_hash`       | TEXT        | Hashed token value     |
| `expires_at`       | TIMESTAMPTZ | Token expiration       |
| `consumed_at`      | TIMESTAMPTZ | When token was used    |
| `revoked_at`       | TIMESTAMPTZ | When token was revoked |
| `reminder_sent_at` | TIMESTAMPTZ | Reminder email sent    |
| `metadata`         | JSONB       | Additional data        |
| `created_at`       | TIMESTAMPTZ | Creation time          |

#### `password_reset_tokens`

Password reset tokens.

| Column       | Type        | Description         |
| ------------ | ----------- | ------------------- |
| `id`         | UUID        | Primary key         |
| `user_id`    | UUID        | FK → users.id       |
| `token_hash` | TEXT        | Hashed token value  |
| `expires_at` | TIMESTAMPTZ | Token expiration    |
| `used_at`    | TIMESTAMPTZ | When token was used |
| `created_at` | TIMESTAMPTZ | Creation time       |

---

### Email Logging

#### `email_logs`

Track all emails sent from the application.

| Column            | Type        | Description                                                    |
| ----------------- | ----------- | -------------------------------------------------------------- |
| `id`              | UUID        | Primary key                                                    |
| `email_type`      | TEXT        | `onboarding_invite`, `password_reset`, `form_submission`, etc. |
| `recipient_email` | TEXT        | To address                                                     |
| `recipient_name`  | TEXT        | Recipient's name                                               |
| `cc_emails`       | TEXT[]      | CC addresses                                                   |
| `bcc_emails`      | TEXT[]      | BCC addresses                                                  |
| `subject`         | TEXT        | Email subject                                                  |
| `text_body`       | TEXT        | Plain text body                                                |
| `html_body`       | TEXT        | HTML body                                                      |
| `status`          | TEXT        | `pending`, `sent`, `failed`                                    |
| `mailgun_id`      | TEXT        | Mailgun message ID                                             |
| `mailgun_message` | TEXT        | Mailgun response                                               |
| `error_message`   | TEXT        | Error details                                                  |
| `triggered_by_id` | UUID        | FK → users.id (who triggered)                                  |
| `client_id`       | UUID        | FK → users.id (related client)                                 |
| `metadata`        | JSONB       | Additional data                                                |
| `created_at`      | TIMESTAMPTZ | Creation time                                                  |
| `sent_at`         | TIMESTAMPTZ | Send timestamp                                                 |

---

### Notifications

#### `notifications`

User notifications.

| Column       | Type        | Description        |
| ------------ | ----------- | ------------------ |
| `id`         | UUID        | Primary key        |
| `user_id`    | UUID        | FK → users.id      |
| `title`      | TEXT        | Notification title |
| `body`       | TEXT        | Notification body  |
| `link_url`   | TEXT        | Action URL         |
| `status`     | TEXT        | `unread`, `read`   |
| `meta`       | JSONB       | Additional data    |
| `read_at`    | TIMESTAMPTZ | When read          |
| `created_at` | TIMESTAMPTZ | Creation time      |

---

### Task Management System

#### `task_workspaces`

Top-level task workspace containers.

| Column       | Type        | Description    |
| ------------ | ----------- | -------------- |
| `id`         | UUID        | Primary key    |
| `name`       | TEXT        | Workspace name |
| `created_by` | UUID        | FK → users.id  |
| `created_at` | TIMESTAMPTZ | Creation time  |

#### `task_workspace_memberships`

User membership in workspaces.

| Column         | Type        | Description                  |
| -------------- | ----------- | ---------------------------- |
| `workspace_id` | UUID        | FK → task_workspaces.id (PK) |
| `user_id`      | UUID        | FK → users.id (PK)           |
| `role`         | TEXT        | `member`, `admin`            |
| `created_at`   | TIMESTAMPTZ | Creation time                |

#### `task_boards`

Boards within a workspace.

| Column         | Type        | Description                 |
| -------------- | ----------- | --------------------------- |
| `id`           | UUID        | Primary key                 |
| `workspace_id` | UUID        | FK → task_workspaces.id     |
| `name`         | TEXT        | Board name                  |
| `description`  | TEXT        | Board description           |
| `board_prefix` | TEXT        | Item prefix (e.g., "TASK-") |
| `created_by`   | UUID        | FK → users.id               |
| `created_at`   | TIMESTAMPTZ | Creation time               |

#### `task_groups`

Groups/columns within a board.

| Column        | Type    | Description         |
| ------------- | ------- | ------------------- |
| `id`          | UUID    | Primary key         |
| `board_id`    | UUID    | FK → task_boards.id |
| `name`        | TEXT    | Group name          |
| `order_index` | INTEGER | Display order       |

#### `task_items`

Individual task items.

| Column            | Type        | Description           |
| ----------------- | ----------- | --------------------- |
| `id`              | UUID        | Primary key           |
| `group_id`        | UUID        | FK → task_groups.id   |
| `name`            | TEXT        | Task name             |
| `status`          | TEXT        | Current status label  |
| `due_date`        | DATE        | Due date              |
| `is_voicemail`    | BOOLEAN     | Voicemail task flag   |
| `needs_attention` | BOOLEAN     | Attention needed flag |
| `created_by`      | UUID        | FK → users.id         |
| `archived_at`     | TIMESTAMPTZ | Archive timestamp     |
| `archived_by`     | UUID        | FK → users.id         |
| `created_at`      | TIMESTAMPTZ | Creation time         |
| `updated_at`      | TIMESTAMPTZ | Last update time      |

#### `task_subitems`

Subtasks under a task item.

| Column           | Type        | Description          |
| ---------------- | ----------- | -------------------- |
| `id`             | UUID        | Primary key          |
| `parent_item_id` | UUID        | FK → task_items.id   |
| `name`           | TEXT        | Subtask name         |
| `status`         | TEXT        | Current status label |
| `due_date`       | DATE        | Due date             |
| `archived_at`    | TIMESTAMPTZ | Archive timestamp    |
| `archived_by`    | UUID        | FK → users.id        |
| `created_at`     | TIMESTAMPTZ | Creation time        |

#### `task_item_assignees`

Task assignment junction.

| Column       | Type        | Description             |
| ------------ | ----------- | ----------------------- |
| `item_id`    | UUID        | FK → task_items.id (PK) |
| `user_id`    | UUID        | FK → users.id (PK)      |
| `created_at` | TIMESTAMPTZ | Assignment time         |

#### `task_updates`

Comments/updates on tasks.

| Column       | Type        | Description        |
| ------------ | ----------- | ------------------ |
| `id`         | UUID        | Primary key        |
| `item_id`    | UUID        | FK → task_items.id |
| `user_id`    | UUID        | FK → users.id      |
| `content`    | TEXT        | Update content     |
| `created_at` | TIMESTAMPTZ | Creation time      |

#### `task_files`

File attachments on tasks/updates.

| Column        | Type        | Description          |
| ------------- | ----------- | -------------------- |
| `id`          | UUID        | Primary key          |
| `item_id`     | UUID        | FK → task_items.id   |
| `update_id`   | UUID        | FK → task_updates.id |
| `uploaded_by` | UUID        | FK → users.id        |
| `file_url`    | TEXT        | Storage URL          |
| `file_name`   | TEXT        | Original filename    |
| `created_at`  | TIMESTAMPTZ | Upload time          |

#### `task_time_entries`

Time tracking entries.

| Column               | Type        | Description        |
| -------------------- | ----------- | ------------------ |
| `id`                 | UUID        | Primary key        |
| `item_id`            | UUID        | FK → task_items.id |
| `user_id`            | UUID        | FK → users.id      |
| `time_spent_minutes` | INTEGER     | Total time spent   |
| `billable_minutes`   | INTEGER     | Billable portion   |
| `description`        | TEXT        | Work description   |
| `work_category`      | TEXT        | Category of work   |
| `is_billable`        | BOOLEAN     | Billable flag      |
| `created_at`         | TIMESTAMPTZ | Entry time         |

#### `task_update_views`

Track who viewed updates.

| Column      | Type        | Description          |
| ----------- | ----------- | -------------------- |
| `id`        | UUID        | Primary key          |
| `update_id` | UUID        | FK → task_updates.id |
| `user_id`   | UUID        | FK → users.id        |
| `viewed_at` | TIMESTAMPTZ | View timestamp       |

---

### Task Automation

#### `task_board_automations`

Board-scoped automation rules.

| Column           | Type        | Description           |
| ---------------- | ----------- | --------------------- |
| `id`             | UUID        | Primary key           |
| `board_id`       | UUID        | FK → task_boards.id   |
| `name`           | TEXT        | Automation name       |
| `trigger_type`   | TEXT        | Trigger type          |
| `trigger_config` | JSONB       | Trigger configuration |
| `action_type`    | TEXT        | Action type           |
| `action_config`  | JSONB       | Action configuration  |
| `is_active`      | BOOLEAN     | Automation enabled    |
| `created_by`     | UUID        | FK → users.id         |
| `created_at`     | TIMESTAMPTZ | Creation time         |

#### `task_global_automations`

Global automation rules (all boards).

| Column           | Type        | Description           |
| ---------------- | ----------- | --------------------- |
| `id`             | UUID        | Primary key           |
| `name`           | TEXT        | Automation name       |
| `trigger_type`   | TEXT        | Trigger type          |
| `trigger_config` | JSONB       | Trigger configuration |
| `action_type`    | TEXT        | Action type           |
| `action_config`  | JSONB       | Action configuration  |
| `is_active`      | BOOLEAN     | Automation enabled    |
| `created_by`     | UUID        | FK → users.id         |
| `created_at`     | TIMESTAMPTZ | Creation time         |

#### `task_automation_runs`

Automation execution log.

| Column                | Type        | Description                   |
| --------------------- | ----------- | ----------------------------- |
| `id`                  | UUID        | Primary key                   |
| `scope`               | TEXT        | `board`, `global`             |
| `automation_id`       | UUID        | Reference to automation       |
| `board_id`            | UUID        | FK → task_boards.id           |
| `item_id`             | UUID        | FK → task_items.id            |
| `trigger_type`        | TEXT        | What triggered it             |
| `trigger_fingerprint` | TEXT        | Deduplication key             |
| `status`              | TEXT        | `success`, `error`, `skipped` |
| `error`               | TEXT        | Error message                 |
| `meta`                | JSONB       | Additional data               |
| `ran_at`              | TIMESTAMPTZ | Execution time                |

---

### Task Status Labels

#### `task_board_status_labels`

Custom status labels per board.

| Column          | Type        | Description         |
| --------------- | ----------- | ------------------- |
| `id`            | UUID        | Primary key         |
| `board_id`      | UUID        | FK → task_boards.id |
| `label`         | TEXT        | Status label text   |
| `color`         | TEXT        | Hex color code      |
| `order_index`   | INTEGER     | Display order       |
| `is_done_state` | BOOLEAN     | Marks completion    |
| `created_at`    | TIMESTAMPTZ | Creation time       |

#### `task_global_status_labels`

Global status labels (all boards).

| Column          | Type        | Description       |
| --------------- | ----------- | ----------------- |
| `id`            | UUID        | Primary key       |
| `label`         | TEXT        | Status label text |
| `color`         | TEXT        | Hex color code    |
| `order_index`   | INTEGER     | Display order     |
| `is_done_state` | BOOLEAN     | Marks completion  |
| `created_by`    | UUID        | FK → users.id     |
| `created_at`    | TIMESTAMPTZ | Creation time     |

---

### AI Features

#### `task_item_ai_summaries`

Cached AI summaries for tasks.

| Column         | Type        | Description             |
| -------------- | ----------- | ----------------------- |
| `item_id`      | UUID        | FK → task_items.id (PK) |
| `summary`      | TEXT        | AI-generated summary    |
| `provider`     | TEXT        | AI provider (`vertex`)  |
| `model`        | TEXT        | Model used              |
| `generated_by` | UUID        | FK → users.id           |
| `generated_at` | TIMESTAMPTZ | Generation time         |
| `source_meta`  | JSONB       | Source data reference   |

#### `task_ai_daily_overviews`

Daily AI overview cache.

| Column                | Type        | Description          |
| --------------------- | ----------- | -------------------- |
| `id`                  | UUID        | Primary key          |
| `user_id`             | UUID        | FK → users.id        |
| `overview_date`       | DATE        | Date of overview     |
| `summary`             | TEXT        | Daily summary        |
| `todo_items`          | JSONB       | To-do list items     |
| `pending_mentions`    | JSONB       | Pending @mentions    |
| `unanswered_mentions` | JSONB       | Unanswered @mentions |
| `provider`            | TEXT        | AI provider          |
| `model`               | TEXT        | Model used           |
| `generated_at`        | TIMESTAMPTZ | Generation time      |

---

### Security & Session Management

#### `user_sessions`

Active user sessions with refresh token tracking.

| Column                 | Type        | Description                                                 |
| ---------------------- | ----------- | ----------------------------------------------------------- |
| `id`                   | UUID        | Primary key                                                 |
| `user_id`              | UUID        | FK → users.id                                               |
| `refresh_token_hash`   | TEXT        | Hashed refresh token (unique)                               |
| `refresh_token_family` | UUID        | Token family for reuse detection                            |
| `device_id`            | UUID        | Stable device identifier                                    |
| `device_fingerprint`   | TEXT        | Browser fingerprint hash                                    |
| `device_name`          | TEXT        | Human-readable device name                                  |
| `is_trusted`           | BOOLEAN     | Device is trusted (skip MFA)                                |
| `trusted_until`        | TIMESTAMPTZ | Trust expiration                                            |
| `ip_address`           | INET        | Client IP address                                           |
| `user_agent`           | TEXT        | Browser user agent                                          |
| `country_code`         | CHAR(2)     | Country from IP geolocation                                 |
| `city`                 | TEXT        | City from IP geolocation                                    |
| `created_at`           | TIMESTAMPTZ | Session creation time                                       |
| `last_activity_at`     | TIMESTAMPTZ | Last activity timestamp                                     |
| `absolute_expiry_at`   | TIMESTAMPTZ | Hard session limit (90 days)                                |
| `refresh_expiry_at`    | TIMESTAMPTZ | Refresh token expiry (30 days sliding)                      |
| `revoked_at`           | TIMESTAMPTZ | When session was revoked                                    |
| `revoked_reason`       | TEXT        | `logout`, `password_change`, `mfa_change`, `reuse_detected` |

#### `user_trusted_devices`

Trusted devices for skipping MFA.

| Column               | Type        | Description                |
| -------------------- | ----------- | -------------------------- |
| `id`                 | UUID        | Primary key                |
| `user_id`            | UUID        | FK → users.id              |
| `device_id`          | UUID        | Device identifier          |
| `device_fingerprint` | TEXT        | Browser fingerprint hash   |
| `device_name`        | TEXT        | Human-readable device name |
| `trusted_at`         | TIMESTAMPTZ | When device was trusted    |
| `expires_at`         | TIMESTAMPTZ | Trust expiration (30 days) |
| `last_used_at`       | TIMESTAMPTZ | Last use timestamp         |
| `revoked_at`         | TIMESTAMPTZ | When trust was revoked     |

#### `user_mfa_settings`

Per-user MFA configuration.

| Column                        | Type        | Description                    |
| ----------------------------- | ----------- | ------------------------------ |
| `user_id`                     | UUID        | FK → users.id (PK)             |
| `email_otp_enabled`           | BOOLEAN     | Email OTP enabled              |
| `totp_enabled`                | BOOLEAN     | TOTP authenticator enabled     |
| `totp_secret_encrypted`       | TEXT        | KMS-encrypted TOTP secret      |
| `totp_backup_codes_encrypted` | TEXT        | Encrypted backup codes         |
| `webauthn_enabled`            | BOOLEAN     | WebAuthn security keys enabled |
| `preferred_method`            | TEXT        | `email`, `totp`, `webauthn`    |
| `require_mfa_always`          | BOOLEAN     | Admin-enforced MFA             |
| `created_at`                  | TIMESTAMPTZ | Creation time                  |
| `updated_at`                  | TIMESTAMPTZ | Last update time               |

#### `mfa_challenges`

Pending MFA verification challenges.

| Column           | Type        | Description                                |
| ---------------- | ----------- | ------------------------------------------ |
| `id`             | UUID        | Primary key                                |
| `user_id`        | UUID        | FK → users.id                              |
| `session_id`     | UUID        | FK → user_sessions.id                      |
| `challenge_type` | TEXT        | `email_otp`, `totp`, `webauthn`            |
| `otp_hash`       | TEXT        | Hashed OTP code                            |
| `created_at`     | TIMESTAMPTZ | Challenge creation time                    |
| `expires_at`     | TIMESTAMPTZ | Challenge expiration (10 min)              |
| `verified_at`    | TIMESTAMPTZ | When challenge was verified                |
| `attempts`       | INTEGER     | Verification attempts                      |
| `max_attempts`   | INTEGER     | Maximum allowed attempts (5)               |
| `trigger_reason` | TEXT        | `new_device`, `new_ip`, `inactivity`, etc. |
| `ip_address`     | INET        | Client IP address                          |
| `user_agent`     | TEXT        | Browser user agent                         |

#### `user_oauth_identities`

OAuth login identities (Google, Microsoft).

| Column                    | Type        | Description                |
| ------------------------- | ----------- | -------------------------- |
| `id`                      | UUID        | Primary key                |
| `user_id`                 | UUID        | FK → users.id              |
| `provider`                | TEXT        | `google`, `microsoft`      |
| `provider_user_id`        | TEXT        | Provider's user ID         |
| `provider_email`          | TEXT        | Email from provider        |
| `provider_email_verified` | BOOLEAN     | Email verified by provider |
| `provider_name`           | TEXT        | Display name from provider |
| `provider_picture`        | TEXT        | Profile picture URL        |
| `created_at`              | TIMESTAMPTZ | Creation time              |
| `last_login_at`           | TIMESTAMPTZ | Last OAuth login           |

#### `security_audit_log`

Immutable security event audit trail.

| Column           | Type        | Description                              |
| ---------------- | ----------- | ---------------------------------------- |
| `id`             | UUID        | Primary key                              |
| `user_id`        | UUID        | FK → users.id                            |
| `session_id`     | UUID        | Session ID if applicable                 |
| `event_type`     | TEXT        | `login_success`, `mfa_challenge`, etc.   |
| `event_category` | TEXT        | `authentication`, `session`, `mfa`, etc. |
| `ip_address`     | INET        | Client IP address                        |
| `user_agent`     | TEXT        | Browser user agent                       |
| `country_code`   | CHAR(2)     | Country from IP                          |
| `device_id`      | UUID        | Device identifier                        |
| `details`        | JSONB       | Event details (no sensitive data)        |
| `success`        | BOOLEAN     | Event outcome                            |
| `failure_reason` | TEXT        | Reason for failure                       |
| `created_at`     | TIMESTAMPTZ | Event timestamp                          |

#### `auth_rate_limits`

Rate limiting tracking for authentication endpoints.

| Column             | Type        | Description                    |
| ------------------ | ----------- | ------------------------------ |
| `id`               | UUID        | Primary key                    |
| `limit_key`        | TEXT        | Hashed identifier (IP/user)    |
| `limit_type`       | TEXT        | `login_ip`, `login_user`, etc. |
| `attempts`         | INTEGER     | Number of attempts             |
| `first_attempt_at` | TIMESTAMPTZ | First attempt timestamp        |
| `last_attempt_at`  | TIMESTAMPTZ | Last attempt timestamp         |
| `locked_until`     | TIMESTAMPTZ | Lockout expiration             |

#### `email_verification_tokens`

Email verification tokens for new accounts.

| Column        | Type        | Description             |
| ------------- | ----------- | ----------------------- |
| `id`          | UUID        | Primary key             |
| `user_id`     | UUID        | FK → users.id           |
| `token_hash`  | TEXT        | Hashed token            |
| `email`       | TEXT        | Email being verified    |
| `expires_at`  | TIMESTAMPTZ | Token expiration        |
| `verified_at` | TIMESTAMPTZ | When email was verified |
| `created_at`  | TIMESTAMPTZ | Token creation time     |

**Additional columns on `users` table:**

| Column                | Type        | Description                    |
| --------------------- | ----------- | ------------------------------ |
| `email_verified_at`   | TIMESTAMPTZ | When email was verified        |
| `password_changed_at` | TIMESTAMPTZ | Last password change           |
| `last_login_at`       | TIMESTAMPTZ | Last successful login          |
| `login_count`         | INTEGER     | Total successful logins        |
| `failed_login_count`  | INTEGER     | Failed login attempts          |
| `locked_until`        | TIMESTAMPTZ | Account lockout expiration     |
| `auth_provider`       | TEXT        | `local`, `google`, `microsoft` |

---

### Miscellaneous

#### `requests`

Legacy task/request system (Monday.com sync).

| Column            | Type        | Description              |
| ----------------- | ----------- | ------------------------ |
| `id`              | UUID        | Primary key              |
| `user_id`         | UUID        | FK → users.id            |
| `title`           | TEXT        | Request title            |
| `description`     | TEXT        | Request description      |
| `due_date`        | DATE        | Due date                 |
| `rush`            | BOOLEAN     | Rush priority flag       |
| `person_override` | TEXT        | Assigned person override |
| `monday_item_id`  | TEXT        | Monday.com item ID       |
| `monday_board_id` | TEXT        | Monday.com board ID      |
| `status`          | TEXT        | Request status           |
| `created_at`      | TIMESTAMPTZ | Creation time            |

#### `app_settings`

Global application settings (key-value).

| Column       | Type        | Description      |
| ------------ | ----------- | ---------------- |
| `key`        | TEXT        | Setting key (PK) |
| `value`      | JSONB       | Setting value    |
| `updated_at` | TIMESTAMPTZ | Last update time |

---

## Quick Links

- **Get Started**: [README.md](README.md) | [docs/SETUP.md](docs/SETUP.md)
- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **APIs**: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- **Security**: [docs/SECURITY.md](docs/SECURITY.md)
- **Integrations**: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)
- **Workflows**: [docs/DATA_FLOWS.md](docs/DATA_FLOWS.md)

---

_Last updated: January 2026_

**Recent updates:**
- Documentation suite added (README, SETUP, ARCHITECTURE, DATA_FLOWS, API_REFERENCE, SECURITY, INTEGRATIONS)
- Lead categories: `converted` is now manual-only (not AI-assigned)
- Reclassify Leads feature added for admins
- Security infrastructure: sessions, MFA, audit logging
