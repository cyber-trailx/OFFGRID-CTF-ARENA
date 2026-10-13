# OFFGRID CTF ARENA

A practical local-first cybersecurity CTF platform with React + TypeScript, Express, SQLite, session authentication, 50 seeded challenges, downloadable synthetic artifacts, scoring, leaderboard, and an organizer-only answer key.

> **Scope note:** No existing repository was attached to this chat, so this ZIP is a standalone implementation rather than a patch against your original repository. Merge it into the existing project only after backing that project up and comparing its files.

## Included functionality

- Registration and login; bcrypt password hashing; server-side sessions in SQLite.
- Participant / organizer / administrator roles, with backend authorization.
- One active sample competition, join workflow, rules and announcements endpoint.
- Exactly 50 seeded challenges: 10 categories × 5 challenges.
- 50 local synthetic artifact files and README notes.
- Server-only canonical flags; exact flag comparison with constant-time comparison for equal-length values.
- Submission history, transaction-wrapped unique solves, fixed scoring, progress, leaderboard.
- Organizer answer key, submission review and statistics; admin user management and audit log endpoints.
- Dark responsive frontend, search/category/difficulty filters, challenge details, hint display, download, submit, leaderboard, progress and organizer views.
- Basic automated tests for seed invariants and flag/artifact data shape.

## Requirements

- Node.js 20 or newer (recommended).
- npm 10 or newer.

## Quick start

From the extracted `offgrid-ctf-arena` directory:

```bash
cp .env.example .env
# Edit .env: set SESSION_SECRET to a random string of 32+ characters.
npm install
npm run artifacts
npm run seed
npm run dev
```

Open `http://localhost:5173`. API is at `http://localhost:4000/api/health`.

Local seed organizer:
- Email: `organizer@offgrid.local`
- Password: `ChangeThisLocalOnly!42`

These are **local-only demo credentials**. Change them in `.env` before seeding on a machine used by others. Never expose this demo account to a public deployment.

Admin seed account:
- Email: `admin@offgrid.local`
- Password: `ChangeThisAdminOnly!42`

Set `SEED_ADMIN_PASSWORD` in `.env` before running seed if you need a different local password. Seed uses `INSERT OR IGNORE`; changing env passwords after an account already exists does not change its password. To reset a local demo DB, stop the app and delete `server/data/offgrid.sqlite` and `server/sessions/sessions.sqlite`, then seed again.

## Tests and build

```bash
npm test
npm run build
```

The automated suite currently validates exactly 50 challenge specs, 10 categories with 5 each, unique canonical flags, required flag format, and artifact/solution fields. It is **not** a substitute for end-to-end API security testing; see limitations below.

## Environment

`.env.example` documents all supported variables. `DATABASE_PATH` is relative to the server process working directory; default is `./data/offgrid.sqlite` when running scripts via npm workspace. `SESSION_SECRET` must be changed before deployment. `CLIENT_ORIGIN` should be the exact frontend origin.

## Project layout

```text
offgrid-ctf-arena/
  client/                 React + TypeScript + Vite UI
  server/src/app.ts       API routes, authentication and authorization
  server/src/db.ts        SQLite schema and indexes
  server/src/challenges.ts 50 original challenge definitions
  server/src/seed.ts      database seed
  server/src/artifacts.ts local artifact generator
  server/test/            seed-data tests
  artifacts/              generated challenge artifacts
  .env.example
```

## Challenge authoring

1. Add a new entry to `server/src/challenges.ts`.
2. Each spec defines category, title, difficulty, description, instructions, artifact filename/content, points, canonical flag, solve explanation, and hint.
3. Run `npm run artifacts` to regenerate local artifacts.
4. Run `npm run seed` to insert new challenge slugs. The seed currently uses deterministic slugs `challenge-01` to `challenge-50`; for replacing existing challenge content during development, reset the local database or implement a versioned update migration. Do not reset a database with real competition data.
5. Run `npm test` and verify the challenge manually.

The organizer UI includes the protected answer key and submission review. A simple create-challenge endpoint exists and newly created challenges default to disabled. The current UI does not expose a full challenge-editing form; organizers can use the API or extend the UI.

## Flag security model

- Canonical flags are stored in the SQLite `challenges.flag` column and are never included in participant challenge list/detail API queries.
- Only `/api/organizer/answer-key`, guarded by organizer/admin role middleware, returns canonical flags and solutions.
- Submission comparison happens on the server; flags are compared exactly (no trimming, case folding, or silent normalization).
- Submissions store correctness only, not the submitted flag string.
- Rate limits apply to login/register and submissions.
- Unique solve constraints and a transaction prevent duplicate point awards for repeated or concurrent correct submissions.

## Competition operation checklist

1. Change session secret and demo passwords.
2. Confirm competition start/end times and status in SQLite.
3. Confirm challenge flags and solutions using organizer answer key.
4. Test participant registration, join, artifact download, wrong flag, correct flag, repeat correct flag and leaderboard.
5. Back up database before changing challenge data.
6. Publish rules and announcement details.
7. After the end time, scoring submissions are rejected by the backend.

## Backup and restore

Stop the app first, then back up `server/data/offgrid.sqlite` and `server/sessions/sessions.sqlite`. SQLite WAL mode is enabled; stopping the process before copying ensures a consistent backup. Restore by replacing the database files while the app is stopped. Keep backups encrypted and restrict filesystem permissions.

## Production deployment notes — read before exposing to the internet

This is a local demonstration baseline, not a fully audited public competition service.

Before public deployment:
- Use HTTPS and set `NODE_ENV=production`; secure cookies require HTTPS.
- Configure a strong `SESSION_SECRET` and exact `CLIENT_ORIGIN`.
- Replace SQLite with PostgreSQL if concurrent event scale requires it, and configure reliable backups.
- Add CSRF token retrieval to all API clients and verify session cookie policy for your deployment topology.
- Configure a reverse proxy, trusted-proxy settings, monitoring, structured logging, and alerting.
- Add API integration tests for login, CSRF, role enforcement, race conditions, ended competitions, disabled challenges, downloads, and leaderboard totals.
- Review session-store path permissions and use a persistent disk.
- Do not execute uploaded artifacts. This app intentionally does not provide participant file uploads.
- Consider a dedicated competition-membership model per competition before running multiple simultaneous competitions. The initial scoring workflow targets the seeded `offgrid-launch` competition.
- Have an experienced security engineer review this application before handling real users or prizes.

## Known limitations / honest status

- Initial scoring and progress routes target the seeded `offgrid-launch` competition.
- Announcements are read-only in the UI; management CRUD is not included yet.
- Organizer challenge creation is available as an API endpoint, but editing/deleting challenges and artifact uploads are not exposed in the UI.
- Admin user management and audit logs are API endpoints, not yet full UI screens.
- The automated tests focus on challenge seed integrity. Full integration/security tests should be added before real competitions.
- The 50 artifacts are synthetic, self-contained clue files; this is an educational first release, not 50 isolated vulnerable web services or exploit binaries.
