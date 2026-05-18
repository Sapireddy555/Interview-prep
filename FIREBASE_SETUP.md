# Data Layer: Firebase Disabled, Postgres Enabled

This repo originally started from a Firebase Studio template, but **Firebase is intentionally disabled** to avoid any initialization/runtime coupling. The app currently persists interview data in **Postgres** (via `pg`) and uses Azure services optionally for speech, proctoring, and storage exports.

## Current status (as of 2026-04-24)

- Firebase client SDK: not installed in `package.json`.
- Firebase runtime wiring: stubbed/disabled in code.
- Primary persistence: Postgres (sessions, transcripts, feedback, summary reports).
- Optional exports: Azure Blob Storage for recordings + HTML versions of reports.

## What was changed (technical)

### Firebase disabled/stubbed

- `src/lib/firebase.ts` exports dummy values and prevents Firebase initialization.
- `src/lib/firestore.ts` contains stub implementations (no-ops) for prior Firestore calls.
- `apphosting.yaml` is commented/disabled to avoid Firebase App Hosting configuration drift.

### Postgres persistence enabled

- `src/lib/db.ts` defines the `pg` connection pool used by server actions.
- `src/app/actions.ts` writes/reads:
  - `sessions` table for interview sessions
  - `candidates` table for candidate records (used for generated login links)
- `src/lib/init-db.ts` documents the expected schema (tables + seed candidates).

## Functional behavior (what management cares about)

What works end-to-end:
- Start an interview: creates a session row in Postgres (`createInterviewSession`).
- Run interview turns: AI asks questions and evaluates responses (Genkit + Gemini).
- Proctoring alerts (optional): Azure Vision detects “no face/multiple people/phone detected” events.
- Recording upload (optional): browser records WebM and uploads chunks to Azure Blob.
- Report generation: after completion, a full AI analysis is generated and stored in `sessions.summary_report`.
- Dashboards: `/dashboard`, `/review`, `/hr-dashboard` load sessions from Postgres.

What is intentionally “optional / mock” when credentials are missing:
- Azure Speech token endpoint errors without `AZURE_SPEECH_KEY` (STT won’t work).
- Azure Vision/Azure Document Intelligence return safe mock results when credentials are missing.
- Azure Blob export becomes a no-op when storage credentials are missing.

## Postgres schema expectations

The schema definition lives in `src/lib/init-db.ts`. At minimum, the app expects:
- `candidates(id, role, difficulty, topics)`
- `sessions(id, candidate_id, date, role, score, duration, feedback, transcript, summary_report, violations)`

## Re-enabling Firebase later (optional roadmap)

If you decide to move back to Firebase/Firestore, treat it as a deliberate migration (not a toggle):

1. Add Firebase client dependency back:
   - `npm install firebase`
2. Re-implement `src/lib/firebase.ts` with real `initializeApp` + `getFirestore` wiring.
3. Replace stubbed CRUD in `src/lib/firestore.ts` with real Firestore operations.
4. Update server actions to use Firestore instead of Postgres (or run both in parallel during migration):
   - `createInterviewSession`
   - `saveInterviewSession`
   - `fetchInterviewSessions`
   - `fetchInterviewSession`
   - `getCandidate` / `registerCandidateAction`
5. Decide how to migrate existing data:
   - One-time backfill Postgres → Firestore, or
   - Dual-write for a period, then cut over.

Recommended approach for management: timebox this as a project with clear acceptance criteria (data parity, dashboard correctness, rollback plan).
