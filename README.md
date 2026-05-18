# ProPrep AI (Mock Interview Platform)

ProPrep AI is a Next.js app for running AI-assisted mock interviews (voice + text), generating real-time coaching, and producing post-interview reports for candidates and HR reviewers.

## One-minute overview (for management)

- What it does: runs a structured mock interview, captures a transcript, and generates an AI report + score.
- Who uses it: candidates (practice) and HR/reviewers (evaluate sessions, watch playback, read reports).
- Key integrations:
  - AI: Genkit + Gemini (Google AI) for question generation and analysis.
  - Persistence: Postgres (via `pg`) for sessions, transcripts, feedback, and summary reports.
  - Optional Azure services: Speech (STT token), Vision (proctoring signals), Blob Storage (recordings + exported HTML reports).

## Architecture at a glance

```
Browser (Next.js UI)
  ├─ /start → creates session (Server Action) → Postgres
  ├─ /interview → live interview UI
  │    ├─ interview turns (Server Action) → Genkit/Gemini
  │    ├─ proctoring snapshots (Server Action) → Azure Vision (optional)
  │    ├─ recording chunks (Server Action) → Azure Blob (optional)
  │    └─ session save + summary generation (Server Action) → Postgres (+ Blob export optional)
  └─ /dashboard, /review, /hr-dashboard → reads sessions from Postgres
```

## Local development

### Environment variables

Required:
- `DATABASE_URL` (Postgres connection string)
- `GEMINI_API_KEY` (or `GOOGLE_GENAI_API_KEY`)

Optional (feature-gated; code falls back to mock/no-op when missing):
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (speech-to-text token endpoint)
- `AZURE_VISION_ENDPOINT`, `AZURE_VISION_KEY` (proctoring checks)
- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY` (Aadhar/ID verification)
- `AZURE_STORAGE_CONNECTION_STRING` or `AZURE_STORAGE_SAS_URL` (recordings + HTML report export)
- `AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING` or `AZURE_COMMUNICATION_CONNECTION_STRING` (ACS invitation email)
- `AZURE_COMMUNICATION_EMAIL_SENDER` (verified ACS sender address)

### Commands

- Install: `npm install`
- Run app: `npm run dev` (default port is `9002`)
- Genkit dev (optional): `npm run genkit:dev`

## Implementation detail: Persistence (Firebase removed/disabled)

This repo originally started as a “Firebase Studio” template, but **Firebase client/Firestore usage is currently disabled** and the app persists data in **Postgres** instead.

- Firebase is intentionally stubbed in:
  - `src/lib/firebase.ts`
  - `src/lib/firestore.ts`
  - `apphosting.yaml` (disabled)
- Postgres is used by server actions in `src/app/actions.ts` through `src/lib/db.ts`.
- Postgres schema expectations are defined in `src/lib/init-db.ts`.

For the detailed technical + functional write-up (including how to re-enable Firebase later), see `FIREBASE_SETUP.md`.

## Documentation

- Product blueprint (features + UX): `docs/blueprint.md`
- Technical implementation details: `docs/implementation.md`
- Management-ready summary (scope/risks/next steps): `docs/management-summary.md`
