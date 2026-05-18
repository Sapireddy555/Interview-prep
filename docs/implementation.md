# Technical Implementation (ProPrep AI)

This document explains how the app works end-to-end at a technical level, and maps “what users see” to the underlying routes, server actions, data models, and integrations.

## System components

### Frontend (Next.js App Router)

- UI routes live under `src/app/*`.
- The live interview experience is `src/app/interview/interview-view.tsx`.
- Dashboards/review pages:
  - `src/app/dashboard/page.tsx`
  - `src/app/review/page.tsx`
  - `src/app/review/[id]/page.tsx`
  - `src/app/hr-dashboard/page.tsx`

### Backend (Server Actions)

Server actions live in `src/app/actions.ts` and are called directly from client components.

Key actions:
- `createInterviewSession(...)`: inserts a new session row.
- `saveInterviewSession(...)`: updates transcript/feedback/violations/duration/score.
- `fetchInterviewSessions()`: reads sessions for dashboards.
- `fetchInterviewSession(id)`: reads one session for report view.
- `processInterviewTurn(...)`: calls the AI to produce the next question + scoring metadata.
- `checkProctoring(...)`: runs an Azure Vision proctoring check (optional).
- `generateAndSaveSummaryReport(interviewId)`: runs full interview analysis and stores it + exports HTML to Azure Blob (optional).
- `uploadRecordingChunk(formData)`: appends audio/video recording chunks to Azure Blob (optional).
- `validateAadharAction(...)`: calls Azure Document Intelligence to verify ID (optional).

### AI layer (Genkit + Gemini)

- Genkit configuration: `src/ai/genkit.ts`
- Primary interview turn flow: `src/ai/flows/interview-turn.ts`
  - Input: role, difficulty, transcript, userResponse, optional questionBank
  - Output: nextQuestion + minimal internal feedback/suggestions + score + isComplete
- Post-interview analysis: `src/ai/flows/full-interview-analysis.ts`
  - Output is stored in Postgres `sessions.summary_report` and can be exported as HTML.

AI credentials:
- `GEMINI_API_KEY` or `GOOGLE_GENAI_API_KEY` must be set for AI flows.

### Persistence (Postgres via `pg`)

- DB adapter: `src/lib/db.ts`
- Schema expectations + seed data: `src/lib/init-db.ts`

Core tables:
- `candidates`: seed candidates + generated IDs (used to mint login links)
- `sessions`: interview sessions and generated artifacts

What gets stored:
- `sessions.transcript`: the full conversation (AI + user messages)
- `sessions.feedback`: per-turn coaching metadata (when captured)
- `sessions.violations`: proctoring alerts with timestamps
- `sessions.summary_report`: the final AI report object (JSON)

### Azure integrations (optional)

Speech (STT token):
- API route: `src/app/api/speech-token/route.ts`
- Env: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`

Proctoring (Vision):
- Library: `src/lib/azure-vision-proctor.ts`
- Env: `AZURE_VISION_ENDPOINT`, `AZURE_VISION_KEY`
- Behavior when missing: returns “no violation” to keep dev/test unblocked.

ID verification (Document Intelligence):
- Library: `src/lib/azure-id-verify.ts`
- Env: `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`
- Behavior when missing: returns a mock “verified” result (dev convenience).

Blob Storage (recordings + report exports):
- Server action helpers inside `src/app/actions.ts`
- Env: `AZURE_STORAGE_CONNECTION_STRING` or `AZURE_STORAGE_SAS_URL`
- Behavior when missing: logs and returns success (no-op).

ACS Email (candidate invitations):
- Server action helper inside `src/app/actions.ts`
- Env: `AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING` or `AZURE_COMMUNICATION_CONNECTION_STRING`
- Env: `AZURE_COMMUNICATION_EMAIL_SENDER`
- Behavior when missing: candidate registration still completes and reports that email was not sent.

## End-to-end flows

### 1) Start interview (session creation)

User action:
- Candidate configures role/difficulty in `/start` and clicks “Start Interview”.

Recruiter action:
- Recruiter registers a candidate in `/tag` with name, email, resume PDF, and job description PDF.
- The app uploads both PDFs to Azure Blob Storage, stores the candidate record in Postgres, generates a unique test ID, and sends the invitation through ACS Email.

Implementation:
- `src/app/start/page.tsx` calls `createInterviewSession(...)`.
- `createInterviewSession(...)` inserts into Postgres `sessions`.
- UI navigates to `/interview?role=...&difficulty=...&interviewId=...`.

### 2) Interview turn (ask next question + evaluate response)

User action:
- Candidate answers by voice (STT) or text.

Implementation:
- The interview UI keeps a local transcript array in `InterviewView`.
- On each response, the client calls `processInterviewTurn(...)`.
- `processInterviewTurn(...)` calls `interviewTurn(...)` (Genkit/Gemini), with basic retry on transient 503s.
- The AI returns JSON (validated by Zod schemas) with `nextQuestion`, `score`, and `isComplete`.
- The UI appends the new AI question to the transcript and continues.

### 3) Proctoring (periodic)

User action:
- While interviewing, a small camera preview is shown.

Implementation:
- The UI periodically captures a video frame to a JPEG data URI.
- It calls `checkProctoring(...)` which delegates to `analyzeFrameWithAzure(...)`.
- If the result indicates a violation, the UI:
  - stores it in memory (`violationsRef`)
  - displays a warning toast

### 4) Recording upload (optional)

User action:
- The browser records a WebM stream during the interview.

Implementation:
- The UI chunks the recording and posts each chunk via `uploadRecordingChunk(...)`.
- The server action appends chunks into an Azure Append Blob named `{interviewId}.webm`.
- If Azure storage credentials are not configured, uploads become a no-op (dev mode).

### 5) Completion (save session + generate report)

User action:
- Candidate finishes the interview.

Implementation:
- The UI calls `saveInterviewSession(...)` with:
  - `duration`
  - `transcript`
  - `violations`
  - (and any per-turn feedback captured)
- In the background, the UI triggers `generateAndSaveSummaryReport(interviewId)`:
  - Loads the session from Postgres
  - Calls `analyzeFullInterview(...)` to produce a structured report
  - Stores it in Postgres `sessions.summary_report`
  - Optionally exports an HTML report to Azure Blob Storage

### 6) Review dashboards

User action:
- Users open `/dashboard`, `/review`, or `/hr-dashboard`.

Implementation:
- Pages call `fetchInterviewSessions()` and render:
  - totals and charts (`/dashboard`)
  - history + “View Report” link (`/review`)
  - HR view with proctoring flags + playback link (`/hr-dashboard`)
- “View Report” (`/review/[id]`) calls `fetchInterviewSession(id)` and shows:
  - summary report (from `summary_report`)
  - transcript (from `transcript`)

## Operational notes (talking points)

- Reliability: AI calls use basic retry on transient 503s (`withRetry`).
- Cost control: prompts constrain output fields and encourage short per-turn feedback to reduce tokens.
- Feature gating: Azure services are optional; missing credentials should not break dev flows (except STT token).
- Data sensitivity: transcripts and ID images can contain sensitive information; store and retain only what is required by policy.
