# Management Summary (ProPrep AI)

This is a management-ready overview of what the team built, how it works at a high level, what’s in scope today, and what’s next.

## Goals

- Reduce interview preparation time for candidates with realistic practice sessions.
- Standardize interview evaluation via consistent scoring and structured reports.
- Provide HR/reviewers with a quick “triage view” of sessions, including proctoring flags and playback.

## What is delivered (current state as of 2026-04-24)

- Live mock interview experience (voice + text)
  - AI asks questions and adapts based on candidate responses.
  - Speech-to-text is supported via Azure Speech tokenization (requires Azure credentials).
  - Text-to-speech uses the browser for natural playback (no server dependency).
- Proctoring signals (optional)
  - Detects “face not visible / multiple people / phone detected” using Azure Vision (requires Azure credentials).
  - Captures violations as timestamped events for HR review.
- Persistent session storage
  - Interview sessions, transcripts, violations, and AI-generated reports are stored in Postgres.
  - Dashboards and review pages are backed by the same persistent data source.
- Reporting
  - Generates a structured post-interview report after completion (overall score, strengths, weaknesses, per-question notes).
  - Can export an HTML report to Azure Blob Storage when configured.
- Review and dashboards
  - Candidate dashboard: performance over time and recent sessions.
  - Review page: list of past interviews and “View Report”.
  - HR dashboard: sessions list with proctoring flags + playback link.

## What is intentionally optional / mocked in dev

- If Azure Vision/Document Intelligence credentials are missing, the system returns safe mock results so development can continue.
- If Azure Blob Storage credentials are missing, recording/report exports are treated as no-ops.
- If Azure Speech credentials are missing, speech-to-text won’t work (token endpoint returns an error).

## Dependencies (external services)

- Gemini (via Genkit): generates questions and analysis.
- Postgres: persistence layer for sessions and reports.
- Azure Speech / Vision / Document Intelligence (optional): voice input, proctoring, ID verification.
- Azure Blob Storage (optional): recordings + report export.

## Key risks and mitigations

- Data privacy (transcripts/ID images): define retention policy and access controls; redact or avoid storing sensitive ID images unless required.
- AI variability: enforce structured outputs via schemas, add guardrails, and track quality metrics.
- Cost/latency: keep prompts concise, rate-limit where needed, and prefer background report generation.
- Vendor coupling: keep integrations modular (Azure + Gemini are behind small adapters and server actions).

## Next steps (recommended roadmap)

- Stabilize data layer:
  - ensure `DATABASE_URL` is configured per environment and not embedded in code
  - add a repeatable DB initialization path for new environments
- Improve question bank upload:
  - support Excel upload + parsing (currently the UI accepts pasted text)
- Playback UX:
  - surface recording URLs and integrate a playback player in `/review/[id]`
- Governance:
  - define role-based access (candidate vs HR) and audit logging
- Firebase decision:
  - if Firebase must be re-enabled, plan it as a migration project (dual-write/backfill, acceptance criteria)
