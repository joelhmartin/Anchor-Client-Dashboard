# Anchor Client Dashboard - Application Skills & Capabilities

## Overview

The Anchor Client Dashboard is a comprehensive CRM and client management platform designed for service businesses. It integrates call tracking, lead management, client onboarding, task management, and content creation into a unified dashboard.

---

## 🎯 Core Capabilities

### 1. Lead Management (CTM Integration)

**Call Tracking Metrics Integration**
- Pulls calls from CTM with paginated incremental sync
- Two-way rating sync (changes in CTM reflect in the app and vice versa)
- Automatic AI classification of calls using Vertex AI (Gemini)
- Manual classification override capability

**Lead Categories**
| Category | Description | Star Rating |
|----------|-------------|-------------|
| `converted` | Agreed to purchase/book service | ⭐⭐⭐⭐⭐ |
| `warm` | Promising lead interested in services | ⭐⭐⭐ |
| `very_hot` | Ready to book/buy now | ⭐⭐⭐ |
| `needs_attention` | Left voicemail requesting callback | ⭐⭐⭐ |
| `voicemail` | Voicemail with no actionable details | — |
| `unanswered` | No conversation occurred | — |
| `not_a_fit` | Not a fit for services | ⭐⭐ |
| `spam` | Telemarketer, robocall, irrelevant | ⭐ |
| `neutral` | General inquiry, unclear intent | — |
| `applicant` | Job/employment inquiry only | — |

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

### 8. Forms Management

**Form Builder**
- Visual form builder with Monaco Editor
- Custom field types
- Conditional logic support
- Multi-step forms

**Form Embedding**
- Embeddable form scripts
- Cross-origin support
- Custom styling per embed

**Form Submissions**
- Submission processing with AI
- Email notifications
- PDF generation of submissions

---

### 9. Blog/Content Management

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

## 🔧 Technical Capabilities

### Authentication & Security
- JWT-based authentication with HTTP-only cookies
- Role-based access control (RBAC)
- Password hashing with bcrypt
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
| Service | Purpose |
|---------|---------|
| CallTrackingMetrics (CTM) | Call data and scoring |
| Monday.com | Task management sync |
| Mailgun | Transactional emails |
| Google Vertex AI | Content generation, call classification |
| Google Vertex Imagen | Image generation |
| Looker | Analytics dashboards |

### Deployment
- Cloud Run optimized
- Automatic database migrations
- Environment-based configuration
- Static asset caching with immutable headers
- Health check endpoint

---

## 📱 User Roles & Permissions

| Role | Capabilities |
|------|--------------|
| `superadmin` | Full system access, all admin features |
| `admin` | Client management, settings, act-as-client |
| `team` | Task management, forms, limited admin |
| `editor` | Content editing, client view |
| `client` | Own portal access only |

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

| Job | Schedule | Purpose |
|-----|----------|---------|
| Onboarding reminders | Daily | Send reminders for incomplete onboarding |
| Task cleanup | Daily | Archive completed tasks after 30 days |
| Service redaction | Daily | Redact old service records after 90 days |
| Form submission processing | Every 2 minutes | Process queued form submissions |
| Due date automations | Every 5 minutes | Update task statuses based on due dates |

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

*Last updated: January 2026*

