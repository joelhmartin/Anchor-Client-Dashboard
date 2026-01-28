# API Reference

Complete documentation of all REST API endpoints in the Anchor Client Dashboard.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication Routes](#authentication-routes-apiauth)
3. [Hub Routes](#hub-routes-apihub)
4. [Onboarding Routes](#onboarding-routes-apionboarding)
5. [Tasks Routes](#tasks-routes-apitasks)
6. [Forms Routes](#forms-routes-apiforms)
7. [Reviews Routes](#reviews-routes-apireviews)
8. [Webhooks Routes](#webhooks-routes-apiwebhooks)
9. [Public Routes](#public-routes-embed)

---

## Overview

### Base URL

- **Development**: `http://localhost:4000/api`
- **Production**: `https://your-domain.com/api`

### Authentication

Most endpoints require authentication via JWT Bearer token:

```
Authorization: Bearer <access_token>
```

Access tokens are short-lived (15 minutes). Use the refresh endpoint to obtain new tokens.

### Response Format

All responses are JSON:

```json
{
  "data": { ... },  // or array
  "message": "Success message",
  "error": "Error message (if applicable)"
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

### Role Requirements

| Role | Access Level |
|------|--------------|
| `superadmin` | Full access |
| `admin` | Client management, act-as-client |
| `team` | Tasks, forms, limited admin |
| `editor` | Content editing |
| `client` | Own data only |

---

## Authentication Routes (`/api/auth`)

### POST `/api/auth/login`

Authenticate user with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "deviceId": "optional-device-id",
  "deviceFingerprint": "optional-fingerprint",
  "trustDevice": false
}
```

**Response (Success):**
```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "role": "admin",
    "avatar_url": "/uploads/avatars/...",
    "onboarding_completed_at": "2024-01-15T...",
    "effective_role": "admin"
  }
}
```

**Response (MFA Required):**
```json
{
  "requiresMfa": true,
  "challengeId": "uuid",
  "mfaType": "email_otp",
  "maskedEmail": "u***@example.com"
}
```

---

### POST `/api/auth/verify-mfa`

Verify MFA code after login challenge.

**Request:**
```json
{
  "challengeId": "uuid",
  "code": "123456",
  "trustDevice": true
}
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "user": { ... }
}
```

---

### POST `/api/auth/refresh`

Refresh access token using refresh token cookie.

**Request:** None (uses HTTP-only cookie)

**Response:**
```json
{
  "accessToken": "eyJ...",
  "user": { ... }
}
```

---

### POST `/api/auth/logout`

End current session.

**Auth Required:** Yes

**Response:**
```json
{
  "message": "Logged out"
}
```

---

### POST `/api/auth/register`

Register new user (typically disabled in production).

**Request:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

---

### POST `/api/auth/password-reset/request`

Request password reset email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "If that email exists, a reset link was sent."
}
```

---

### POST `/api/auth/password-reset`

Reset password with token.

**Request:**
```json
{
  "token": "reset-token-from-email",
  "password": "NewSecurePass123!"
}
```

---

### GET `/api/auth/me`

Get current authenticated user.

**Auth Required:** Yes

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "role": "admin",
    "effective_role": "admin",
    "avatar_url": "...",
    "onboarding_completed_at": "...",
    "activated_at": "..."
  },
  "impersonator": null
}
```

---

### POST `/api/auth/impersonate/:userId`

Admin impersonates a client.

**Auth Required:** Admin+

**Response:**
```json
{
  "accessToken": "eyJ...",
  "user": { ... },
  "impersonator": { ... }
}
```

---

### POST `/api/auth/stop-impersonation`

Return to original admin account.

**Auth Required:** Yes (while impersonating)

---

### GET `/api/auth/sessions`

List user's active sessions.

**Auth Required:** Yes

---

### DELETE `/api/auth/sessions/:sessionId`

Revoke a specific session.

**Auth Required:** Yes

---

## Hub Routes (`/api/hub`)

Main CRM operations. All require authentication.

### Clients

#### GET `/api/hub/clients`

List all clients (admin only).

**Auth Required:** Admin+

**Query Params:**
- `search` - Filter by name/email
- `status` - Filter by status

**Response:**
```json
{
  "clients": [
    {
      "id": "uuid",
      "email": "client@example.com",
      "first_name": "Client",
      "last_name": "User",
      "role": "client",
      "business_name": "Acme Corp",
      "display_name": "Client User",
      "onboarding_completed_at": "...",
      "activated_at": "..."
    }
  ]
}
```

---

#### GET `/api/hub/clients/:id`

Get single client details.

**Auth Required:** Admin+

---

#### POST `/api/hub/clients`

Create new client.

**Auth Required:** Admin+

**Request:**
```json
{
  "email": "newclient@example.com",
  "first_name": "New",
  "last_name": "Client",
  "client_type": "medical",
  "client_subtype": "dental",
  "send_email": true
}
```

---

#### PUT `/api/hub/clients/:id`

Update client profile.

**Auth Required:** Admin+

---

#### DELETE `/api/hub/clients/:id`

Delete client (soft delete).

**Auth Required:** Admin+

---

#### GET `/api/hub/clients/:id/onboarding-link`

Generate new onboarding link for client.

**Auth Required:** Admin+

**Response:**
```json
{
  "url": "https://domain.com/onboarding?token=...",
  "expiresAt": "2024-01-20T..."
}
```

---

#### POST `/api/hub/clients/:id/reclassify-leads`

Re-run AI classification on client's leads.

**Auth Required:** Admin+

**Request:**
```json
{
  "limit": 200,
  "force": true
}
```

---

### Calls / Leads

#### GET `/api/hub/calls`

Get call logs for client.

**Auth Required:** Yes

**Query Params:**
- `search` - Search transcripts, names
- `category` - Filter by classification
- `caller_type` - `new`, `repeat`, `returning_customer`
- `date_from`, `date_to` - Date range
- `page`, `limit` - Pagination

**Response:**
```json
{
  "calls": [
    {
      "id": "uuid",
      "call_id": "ctm-call-id",
      "from_number": "+15551234567",
      "started_at": "2024-01-15T...",
      "duration_sec": 120,
      "score": 4,
      "caller_type": "new",
      "meta": {
        "category": "warm",
        "classification_summary": "Interested in dental cleaning",
        "caller_name": "John Smith",
        "transcript": "..."
      }
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 25
}
```

---

#### POST `/api/hub/calls/sync`

Sync calls from CTM (incremental).

**Auth Required:** Yes

---

#### POST `/api/hub/calls/full-sync`

Full historical sync from CTM.

**Auth Required:** Admin+

---

#### POST `/api/hub/calls/:id/score`

Set star rating on call.

**Auth Required:** Yes

**Request:**
```json
{
  "score": 4
}
```

---

#### DELETE `/api/hub/calls/:id/score`

Remove star rating from call.

**Auth Required:** Yes

---

#### PUT `/api/hub/calls/:id/category`

Update call classification.

**Auth Required:** Yes

**Request:**
```json
{
  "category": "warm"
}
```

---

#### POST `/api/hub/calls/:id/link-client`

Link call to active client.

**Auth Required:** Yes

**Request:**
```json
{
  "activeClientId": "uuid"
}
```

---

#### DELETE `/api/hub/calls/:id/link-client`

Unlink call from active client.

**Auth Required:** Yes

---

#### GET `/api/hub/calls/:id/history`

Get call history for phone number.

**Auth Required:** Yes

---

### Tags

#### GET `/api/hub/tags`

Get all lead tags.

**Auth Required:** Yes

---

#### POST `/api/hub/tags`

Create new tag.

**Auth Required:** Yes

**Request:**
```json
{
  "name": "Hot Lead",
  "color": "#FF5733"
}
```

---

#### POST `/api/hub/calls/:callId/tags`

Add tag to call.

**Auth Required:** Yes

**Request:**
```json
{
  "tagId": "uuid"
}
```

---

#### DELETE `/api/hub/calls/:callId/tags/:tagId`

Remove tag from call.

**Auth Required:** Yes

---

### Journeys

#### GET `/api/hub/journeys`

Get all journeys for owner.

**Auth Required:** Yes

---

#### POST `/api/hub/journeys`

Create new journey.

**Auth Required:** Yes

**Request:**
```json
{
  "lead_call_id": "uuid",
  "client_name": "John Smith",
  "client_phone": "+15551234567",
  "symptoms": ["Teeth Cleaning", "Whitening"],
  "service_id": "uuid",
  "force_new": true,
  "active_client_id": "uuid"
}
```

---

#### GET `/api/hub/journeys/:id`

Get journey details with steps.

**Auth Required:** Yes

---

#### PUT `/api/hub/journeys/:id`

Update journey.

**Auth Required:** Yes

---

#### PUT `/api/hub/journeys/:id/status`

Update journey status.

**Auth Required:** Yes

**Request:**
```json
{
  "status": "in_progress"
}
```

---

#### POST `/api/hub/journeys/:id/steps`

Add step to journey.

**Auth Required:** Yes

---

#### PUT `/api/hub/journeys/:journeyId/steps/:stepId`

Update journey step.

**Auth Required:** Yes

---

#### PUT `/api/hub/journeys/:journeyId/steps/:stepId/complete`

Mark step as complete.

**Auth Required:** Yes

---

#### POST `/api/hub/journeys/:id/notes`

Add note to journey.

**Auth Required:** Yes

---

### Active Clients

#### GET `/api/hub/active-clients`

Get all active clients.

**Auth Required:** Yes

---

#### POST `/api/hub/active-clients`

Create active client (convert from journey).

**Auth Required:** Yes

**Request:**
```json
{
  "client_name": "John Smith",
  "client_phone": "+15551234567",
  "client_email": "john@example.com",
  "source": "CTM Call",
  "services": [
    {
      "service_id": "uuid",
      "agreed_price": 250.00,
      "agreed_date": "2024-01-15"
    }
  ]
}
```

---

#### PUT `/api/hub/active-clients/:id`

Update active client.

**Auth Required:** Yes

---

### Services

#### GET `/api/hub/services`

Get available services.

**Auth Required:** Yes

---

#### POST `/api/hub/services`

Create service.

**Auth Required:** Admin+

---

#### PUT `/api/hub/services/:id`

Update service.

**Auth Required:** Admin+

---

#### DELETE `/api/hub/services/:id`

Delete service.

**Auth Required:** Admin+

---

### Profile & Brand

#### GET `/api/hub/profileMe`

Get authenticated user's profile.

**Auth Required:** Yes

---

#### PUT `/api/hub/profileMe`

Update authenticated user's profile.

**Auth Required:** Yes

---

#### POST `/api/hub/avatarMe`

Upload avatar (multipart/form-data).

**Auth Required:** Yes

---

#### GET `/api/hub/brandMe`

Get brand assets.

**Auth Required:** Yes

---

#### PUT `/api/hub/brandMe`

Update brand assets.

**Auth Required:** Yes

---

### Documents

#### GET `/api/hub/documentsMe`

Get user's documents.

**Auth Required:** Yes

---

#### POST `/api/hub/documentsMe`

Upload document (multipart/form-data).

**Auth Required:** Yes

---

#### DELETE `/api/hub/documentsMe/:id`

Delete document.

**Auth Required:** Yes

---

### Email Logs

#### GET `/api/hub/email-logs`

Get email logs (admin only).

**Auth Required:** Admin+

**Query Params:**
- `page`, `limit` - Pagination
- `search` - Search recipient
- `email_type` - Filter by type
- `status` - Filter by status

---

#### GET `/api/hub/email-logs/stats`

Get email statistics (30-day summary).

**Auth Required:** Admin+

---

#### GET `/api/hub/email-logs/:id`

Get single email log with full content.

**Auth Required:** Admin+

---

### OAuth Providers (Admin)

#### GET `/api/hub/oauth-providers`

List OAuth providers.

**Auth Required:** Admin+

---

#### POST `/api/hub/oauth-providers`

Create OAuth provider.

**Auth Required:** Admin+

---

#### PUT `/api/hub/oauth-providers/:id`

Update OAuth provider.

**Auth Required:** Admin+

---

#### DELETE `/api/hub/oauth-providers/:id`

Delete OAuth provider.

**Auth Required:** Admin+

---

### OAuth Connections (Per Client)

#### GET `/api/hub/clients/:clientId/oauth-connections`

Get client's OAuth connections.

**Auth Required:** Admin+

---

#### POST `/api/hub/clients/:clientId/oauth-connections`

Create OAuth connection.

**Auth Required:** Admin+

---

#### POST `/api/hub/oauth-connections/:id/revoke`

Revoke OAuth connection.

**Auth Required:** Admin+

---

### Notifications

#### GET `/api/hub/notifications`

Get user's notifications.

**Auth Required:** Yes

---

#### PUT `/api/hub/notifications/:id/read`

Mark notification as read.

**Auth Required:** Yes

---

#### PUT `/api/hub/notifications/read-all`

Mark all notifications as read.

**Auth Required:** Yes

---

## Onboarding Routes (`/api/onboarding`)

Client onboarding wizard endpoints.

### GET `/api/onboarding/:token`

Validate onboarding token and get state.

**Response:**
```json
{
  "valid": true,
  "userId": "uuid",
  "email": "client@example.com",
  "profile": { ... },
  "draftJson": { ... }
}
```

---

### POST `/api/onboarding/:token/activate`

Complete step 1 (set password).

**Request:**
```json
{
  "display_name": "John Doe",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJ...",
  "user": { ... }
}
```

---

### POST `/api/onboarding/:token/draft`

Save draft progress (token-based).

**Request:**
```json
{
  "draftJson": {
    "currentStep": 2,
    "profile": { ... },
    "services": [ ... ]
  }
}
```

---

### POST `/api/onboarding/me/draft`

Save draft progress (authenticated).

**Auth Required:** Yes

---

### POST `/api/onboarding/me/complete`

Complete onboarding.

**Auth Required:** Yes

---

### POST `/api/onboarding/:token/upload/avatar`

Upload avatar (token-based, multipart/form-data).

---

### POST `/api/onboarding/:token/upload/brand`

Upload brand asset (token-based, multipart/form-data).

---

### POST `/api/onboarding/me/upload/brand`

Upload brand asset (authenticated, multipart/form-data).

**Auth Required:** Yes

---

## Tasks Routes (`/api/tasks`)

Task management system. Requires `team` role or higher.

### Workspaces

#### GET `/api/tasks/workspaces`

List workspaces user has access to.

---

#### POST `/api/tasks/workspaces`

Create workspace.

**Request:**
```json
{
  "name": "My Workspace"
}
```

---

### Boards

#### GET `/api/tasks/workspaces/:workspaceId/boards`

List boards in workspace.

---

#### POST `/api/tasks/workspaces/:workspaceId/boards`

Create board.

**Request:**
```json
{
  "name": "Project Board",
  "description": "Main project tasks"
}
```

---

#### PUT `/api/tasks/boards/:boardId`

Update board.

---

#### DELETE `/api/tasks/boards/:boardId`

Delete board.

---

### Groups

#### GET `/api/tasks/boards/:boardId/groups`

List groups in board.

---

#### POST `/api/tasks/boards/:boardId/groups`

Create group.

**Request:**
```json
{
  "name": "In Progress",
  "order_index": 1
}
```

---

### Items

#### GET `/api/tasks/groups/:groupId/items`

List items in group.

---

#### POST `/api/tasks/groups/:groupId/items`

Create item.

**Request:**
```json
{
  "name": "Implement feature X",
  "status": "Working",
  "due_date": "2024-02-01"
}
```

---

#### PUT `/api/tasks/items/:itemId`

Update item.

---

#### DELETE `/api/tasks/items/:itemId`

Delete item.

---

#### POST `/api/tasks/items/:itemId/archive`

Archive item.

---

### Subitems

#### GET `/api/tasks/items/:itemId/subitems`

List subitems.

---

#### POST `/api/tasks/items/:itemId/subitems`

Create subitem.

---

### Updates (Comments)

#### GET `/api/tasks/items/:itemId/updates`

List updates on item.

---

#### POST `/api/tasks/items/:itemId/updates`

Create update.

**Request:**
```json
{
  "content": "Started working on this task"
}
```

---

### Time Entries

#### GET `/api/tasks/items/:itemId/time-entries`

List time entries.

---

#### POST `/api/tasks/items/:itemId/time-entries`

Create time entry.

**Request:**
```json
{
  "time_spent_minutes": 90,
  "description": "Research and planning",
  "is_billable": true
}
```

---

### Automations

#### GET `/api/tasks/boards/:boardId/automations`

List board automations.

---

#### POST `/api/tasks/boards/:boardId/automations`

Create automation.

**Request:**
```json
{
  "name": "Notify on completion",
  "trigger_type": "status_change",
  "trigger_config": { "to_status": "Done" },
  "action_type": "notify_assignees",
  "action_config": {}
}
```

---

### Status Labels

#### GET `/api/tasks/boards/:boardId/status-labels`

List board status labels.

---

#### POST `/api/tasks/boards/:boardId/status-labels`

Create status label.

---

### AI Features

#### POST `/api/tasks/items/:itemId/ai-summary`

Generate AI summary for item.

---

#### GET `/api/tasks/daily-overview`

Get AI daily overview.

---

## Forms Routes (`/api/forms`)

Form builder and management. Requires `team` role or higher.

### GET `/api/forms`

List all forms.

---

### POST `/api/forms`

Create form.

**Request:**
```json
{
  "name": "Contact Form",
  "schema": {
    "fields": [
      { "name": "name", "type": "text", "required": true },
      { "name": "email", "type": "email", "required": true },
      { "name": "message", "type": "textarea" }
    ]
  }
}
```

---

### GET `/api/forms/:id`

Get form details.

---

### PUT `/api/forms/:id`

Update form.

---

### DELETE `/api/forms/:id`

Delete form.

---

### GET `/api/forms/:id/submissions`

Get form submissions.

---

### POST `/api/forms/:id/ai-generate`

AI-generate form based on description.

---

## Reviews Routes (`/api/reviews`)

Google Business Profile review management.

### GET `/api/reviews`

List reviews.

**Query Params:**
- `rating` - Filter by star rating
- `response_status` - `pending`, `responded`
- `priority` - `low`, `normal`, `high`, `urgent`

---

### GET `/api/reviews/:id`

Get review details.

---

### POST `/api/reviews/:id/draft`

Generate AI draft response.

**Request:**
```json
{
  "tone": "professional"
}
```

---

### POST `/api/reviews/:id/respond`

Post response to Google.

**Request:**
```json
{
  "response": "Thank you for your feedback..."
}
```

---

### PUT `/api/reviews/:id/priority`

Set review priority.

---

### PUT `/api/reviews/:id/flag`

Flag review for attention.

---

### POST `/api/reviews/:id/notes`

Add internal note.

---

## Webhooks Routes (`/api/webhooks`)

External webhook handlers.

### POST `/api/webhooks/mailgun`

Mailgun event webhook (delivery, open, click, bounce, etc.).

**Note:** Authenticated via Mailgun signature verification.

---

## Public Routes (`/embed`)

Public form embed endpoints (no auth required).

### GET `/embed/:formId`

Get form embed script.

---

### GET `/embed/:formId/json`

Get form schema as JSON.

---

### POST `/embed/:formId/submit`

Submit form data.

**Request:**
```json
{
  "fields": {
    "name": "John",
    "email": "john@example.com",
    "message": "Hello..."
  },
  "metadata": {
    "page_url": "https://example.com/contact",
    "referrer": "https://google.com"
  }
}
```

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [DATA_FLOWS.md](DATA_FLOWS.md) - Business workflows
- [SECURITY.md](SECURITY.md) - Authentication details
- [INTEGRATIONS.md](INTEGRATIONS.md) - Third-party services
- [SKILLS.md](../SKILLS.md) - Database schema

---

*Last updated: January 2026*

