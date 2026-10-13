# Implementation guide (part by part)

## Part 1 — Extract and install
Extract the ZIP. Open the project root in VS Code. Install Node.js 20+. Run `cp .env.example .env` (Windows PowerShell: `Copy-Item .env.example .env`) and set a long random `SESSION_SECRET`.

## Part 2 — Generate challenge files and database
Run `npm install`, then `npm run artifacts`, then `npm run seed`. The artifact script writes 50 directories under `artifacts/`; the seed creates SQLite tables and inserts the competition, organizer accounts, challenge records, and hints.

## Part 3 — Start both apps
Run `npm run dev`. Vite serves the frontend at `http://localhost:5173`; Express serves the API at `http://localhost:4000`. Keep both terminal processes running.

## Part 4 — Verify participant workflow
Create a participant account, open Arena, join the competition, open a challenge, download its artifact, inspect it, submit the exact flag you derived, and check Progress and Leaderboard. Wrong flags are recorded as incorrect; raw submitted values are not stored.

## Part 5 — Verify organizer workflow
Sign out. Sign in with the local organizer credentials listed in README. Open Organizer. The dashboard loads statistics, submissions, and the answer key. The answer-key endpoint is backend-protected.

## Part 6 — Test and build
Run `npm test`, then `npm run build`. Fix any environment-specific install errors before deployment. Do not report an unexecuted test as passed.

## Part 7 — What to improve next
1. Add API integration tests using Supertest for auth, CSRF, authorization, solve uniqueness, race conditions, disabled challenges and ended events.
2. Add a competition selector and scope every score/submission query by selected competition.
3. Add organizer UI forms for challenge creation/editing and announcements.
4. Add migrations rather than relying on startup schema creation.
5. Perform an independent security review before any public launch.
