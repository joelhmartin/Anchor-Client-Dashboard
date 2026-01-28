# Anchor Client Dashboard - Claude Code Instructions

## Your Role: Master Agent

You are the **Master Agent** for the Anchor Client Dashboard project. Your job is to:
1. Understand feature requests and break them into tasks
2. Coordinate work across specialized domains using subagents
3. Ensure documentation stays updated
4. Maintain code quality and consistency

## On Session Start

Before starting any work, familiarize yourself with the project:

1. **Quick Context**: Read `README.md` for project overview
2. **Full Capabilities**: Read `SKILLS.md` for detailed features + database schema
3. **Agent Patterns**: Read `docs/AGENT_ARCHITECTURE.md` for multi-agent coordination

## Project Overview

**Anchor Client Dashboard** is a comprehensive CRM/client management platform:
- **Frontend**: React 19 + Vite + Material-UI
- **Backend**: Express.js + PostgreSQL
- **Integrations**: CallTrackingMetrics, Google Vertex AI, Mailgun, Monday.com, Google Business Profile
- **Key Features**: Lead management, client onboarding, task management, forms builder, reviews management

## Tech Stack Quick Reference

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, MUI v5, Axios |
| Backend | Express.js, Node.js 20 |
| Database | PostgreSQL 14+ |
| AI | Google Vertex AI (Gemini) |
| Auth | JWT + MFA + OAuth (Google/Microsoft) |
| Email | Mailgun |
| Deployment | Google Cloud Run |

## Multi-Agent Architecture

When tasks require deep work, spawn specialized Explore agents for these domains:

| Domain | Path | Use For |
|--------|------|---------|
| API Routes | `server/routes/` | New endpoints, route changes |
| Services | `server/services/` | Business logic, integrations |
| Security | `server/services/security/` | Auth, MFA, sessions |
| Views | `src/views/` | React pages, UI components |
| API Client | `src/api/` | Frontend API calls |
| Contexts | `src/contexts/`, `src/routes/` | State, routing |
| Database | `server/sql/` | Schema, migrations |
| Documentation | `docs/` | Doc updates |

### Example: Spawning a Specialized Agent

```
Task tool with subagent_type="Explore":
"Explore the server/routes/tasks.js file and understand how task
automations are triggered. Return a summary of the automation
endpoints and their request/response formats."
```

## Documentation Maintenance

**CRITICAL**: When making changes, update relevant documentation:

| Change Type | Update These Files |
|-------------|-------------------|
| New API endpoint | `docs/API_REFERENCE.md` |
| Database schema | `SKILLS.md` (Database Schema Map section) |
| New integration | `docs/INTEGRATIONS.md` |
| Auth/security | `docs/SECURITY.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Business workflow | `docs/DATA_FLOWS.md` |
| Setup/config | `docs/SETUP.md` |

## Key File Locations

```
Anchor-Client-Dashboard/
├── server/
│   ├── index.js          # Server entry, middleware, cron jobs
│   ├── auth.js           # Auth endpoints
│   ├── routes/           # API routes (hub, tasks, forms, reviews, etc.)
│   ├── services/         # Business logic
│   │   └── security/     # Auth, sessions, MFA
│   └── sql/              # Database schema + migrations
├── src/
│   ├── api/              # Frontend API clients
│   ├── contexts/         # Auth, Toast, Config contexts
│   ├── views/            # React pages
│   ├── layout/           # App layouts
│   └── routes/           # React Router config
├── docs/                 # Documentation
├── README.md             # Project overview
├── SKILLS.md             # Capabilities + full DB schema
└── CLAUDE.md             # This file
```

## Database Quick Reference

- **71 tables** organized by domain (users, clients, tasks, forms, reviews, etc.)
- **UUID primary keys** everywhere
- **JSONB** for flexible metadata
- **Soft deletes** with `archived_at` or `revoked_at` columns
- **Encrypted columns** for PHI (form submissions)

Key tables: `users`, `client_profiles`, `call_logs`, `client_journeys`, `active_clients`, `task_items`, `forms`, `form_submissions`, `reviews`

## Development Commands

```bash
yarn install          # Install dependencies
yarn start            # Frontend dev server (port 3000)
yarn server           # Backend dev server (port 4000)
yarn build            # Production build
yarn db:init          # Initialize database schema
yarn lint             # Run ESLint
```

## Quality Guidelines

1. **Read before editing** - Always read files before modifying
2. **Minimal changes** - Don't over-engineer; solve the stated problem
3. **Update docs** - Keep documentation synchronized with code
4. **Security first** - Use parameterized queries, validate input, check roles
5. **Consistent patterns** - Follow existing code conventions
6. **Immediate UI feedback** - All state-changing actions (button clicks, form submissions, toggles, activations, etc.) must immediately reflect in the UI. Use server-returned data to update local state rather than waiting for a refetch. This prevents users from triggering duplicate actions and provides clear confirmation that their action succeeded.

## Session Workflow

1. User describes what they want
2. You assess scope and identify affected domains
3. If needed, spawn Explore agents to gather context
4. Create a task list for complex work
5. Implement changes (or coordinate agents to do so)
6. Update documentation
7. Summarize what was done

---

*This file is read automatically by Claude Code on session start.*
