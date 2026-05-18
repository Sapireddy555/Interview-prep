# **App Name**: ProPrep AI

## Core Features:

- Voice-Enabled Interaction: Enable voice input and output for both the user and the AI agent during mock interviews.
- AI Interviewer: AI-powered agent capable of conducting realistic mock interviews for technical and non-technical roles, including asking follow-up questions.
- Question Bank Upload: Allow users to provide custom questions for the AI to incorporate during the interview.
- Real-time Feedback: Provide immediate feedback on the user's responses, including suggestions for improvement, powered by the AI.
- Interview Recording and Playback: Record the mock interview session for later review and analysis.
- Performance Analytics Dashboard: Present a dashboard that shows key performance indicators from all recorded interviews.
- Customizable Interview Scenarios: Allow users to customize the interview scenario, including role, difficulty level, and specific topics to cover.

## Feature status (what is implemented today)

- Interview creation + session IDs: implemented (`/start` → Postgres session insert).
- AI interviewer + follow-ups: implemented (Genkit + Gemini interview turn flow).
- Voice input: implemented via Azure Speech token endpoint (requires Azure credentials).
- Voice output: implemented via browser text-to-speech (no server dependency).
- Proctoring: implemented via Azure Vision (optional; mock/no-op when missing credentials).
- Reporting:
  - Post-interview report generation: implemented and stored in Postgres.
  - HTML export to Azure Blob: implemented (optional).
- Dashboards (candidate + HR): implemented (reads from Postgres).
- Question bank:
  - Current implementation: user pastes questions as text (one per line).
  - Planned enhancement: Excel upload + parsing.
- Recording:
  - Chunk upload path: implemented (optional Azure Blob).
  - Playback UX: partial (link exists; dedicated player can be expanded).

## User journeys (functional)

### Candidate journey

1. Start at `/start` and choose role + difficulty (and optional topics/question bank).
2. Enter `/interview` and complete a structured interview flow.
3. Receive an AI-generated post-interview report.
4. Review past interviews in `/review` and track progress in `/dashboard`.

### HR / reviewer journey

1. Open `/hr-dashboard` to see recent sessions.
2. Triage sessions by score and proctoring flags.
3. Open a session report (`/review/[id]`) to read summary + transcript.
4. (Optional) Watch the recording playback when storage is configured.

## Implementation mapping (where things live)

- Start interview: `src/app/start/page.tsx` → `src/app/actions.ts#createInterviewSession`
- Interview UI: `src/app/interview/interview-view.tsx`
- AI interview turn: `src/app/actions.ts#processInterviewTurn` → `src/ai/flows/interview-turn.ts`
- Full report generation: `src/app/actions.ts#generateAndSaveSummaryReport` → `src/ai/flows/full-interview-analysis.ts`
- Data storage: `src/lib/db.ts`, schema in `src/lib/init-db.ts`
- Proctoring: `src/lib/azure-vision-proctor.ts`
- Speech-to-text token: `src/app/api/speech-token/route.ts`
- Dashboards: `src/app/dashboard/page.tsx`, `src/app/review/page.tsx`, `src/app/hr-dashboard/page.tsx`

## Style Guidelines:

- Primary color: Deep Indigo (#3F51B5) for a professional and trustworthy feel.
- Background color: Light Gray (#F5F5F5), providing a clean and modern backdrop.
- Accent color: Teal (#009688) to highlight key interactive elements, ensuring visibility and a touch of sophistication.
- Font pairing: 'Inter' (sans-serif) for both headlines and body text to ensure readability and a modern, neutral appearance.
- Use a set of consistent, professional icons to represent key functions such as recording, feedback, and settings.
- Clean, structured layout with clear sectioning to avoid overwhelming the user and facilitate easy navigation.
- Subtle, non-distracting transitions and animations to provide feedback on interactions and maintain user engagement without being obtrusive.
