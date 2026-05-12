# Management Documentation & Presentation Pack (ProPrep AI / Interview Prep)

This document is designed to be “presentation-ready”: it includes a management narrative, a slide-by-slide outline, and a fact-based comparison to major market tools (HackerRank and iMocha) focused specifically on **AI interviewer / evaluation** and **integrity** features.

Last updated: 2026-05-05

---

## 1) Executive summary (what we built)

**ProPrep AI** is a lightweight, end-to-end mock interview platform with:

- A structured interview experience (voice + webcam) with recording
- Integrity signals (proctoring warnings + security events) and a session-level **Suspicion Score**
- A single **AI-powered final evaluation** step that generates a rubric, evidence-backed feedback, and a hire-style recommendation
- Reviewer workflow: **review packet exports** (JSON/Markdown) and an editable **reviewer scorecard**

**Key positioning:** We intentionally use AI only where it adds the most value (final evaluation), and keep the interview flow deterministic and cost-controlled.

---

## 2) Slide outline for management presentation

### Slide 1 — Title & purpose
- “ProPrep AI: AI-assisted mock interview + integrity + reviewer workflow”
- Objective: reduce interviewer effort, standardize feedback, and provide audit-friendly review artifacts

### Slide 2 — The problem
- Interview prep and internal screening are time-consuming and inconsistent
- Reviewers lack a consistent rubric + evidence trail
- Integrity is hard to establish in remote formats (tab switching, device usage, etc.)

### Slide 3 — What ProPrep AI delivers
- Candidate experience: voice-enabled interview + recording + structured question flow
- HR/reviewer experience: review report, transcript, integrity timeline, reviewer scorecard
- Exportable “review packet” for audit, sharing, and management reporting

### Slide 4 — “Minimal AI” strategy (cost + control)
- AI used **only after the interview** to produce final feedback/rubric
- Deterministic interview flow (role/question list or pasted question bank)
- Benefits:
  - predictable cost and latency
  - easier compliance / governance
  - simpler debugging and repeatability

### Slide 5 — Integrity & auditability
- Session captures:
  - Webcam-based proctoring warnings (via Azure Vision integration)
  - Security events: tab hide/show, blur/focus, copy/paste/context menu, devtools heuristic
  - Aggregated **Suspicion Score (0–100)**
- Review UI shows suspicion score and event timeline

### Slide 6 — Reviewer workflow
- AI debrief includes rubric + evidence snippets
- Reviewer can override via scorecard sliders + notes
- Reviewer scorecard persisted in DB
- Downloadable review packets:
  - JSON: machine-readable for dashboards / BI
  - Markdown: human-readable for sharing

### Slide 7 — Architecture (high level)
- Next.js App Router UI + Server Actions
- Postgres persistence for sessions/transcripts/reports
- Azure integrations (optional): Speech token, Vision proctoring, Document Intelligence (ID), Blob storage (recording/report export)
- Genkit flow for final evaluation only

### Slide 8 — Differentiation vs market tools (where we win)
- “Purpose-built, lightweight, and controllable” vs “large enterprise platforms”
- Strong differentiation for internal mock/prep and controlled screening:
  - minimal AI footprint by design
  - evidence-backed rubric + reviewer override workflow
  - exportable packets + audit trail
  - customizable deployment (data ownership)
  - optional ID verification step (Aadhar workflow)

### Slide 9 — Gaps vs market tools (what we’re not trying to be)
- We are not currently a full “enterprise interview IDE” with compilers, large libraries, and collaborative whiteboarding
- Not a large assessment marketplace (10k+ tests)
- These gaps are intentional for MVP scope and cost control; can be roadmap items if required

### Slide 10 — Roadmap (optional)
- Integrity hardening: multi-monitor detection, fullscreen enforcement (desktop wrapper), stronger device checks
- Role-based access control (candidate vs HR vs admin)
- Playback: show recording in review page when storage configured
- Optional: live coding workspace mode (if management wants parity with interview IDE platforms)

---

## 3) Product flows (how users move through the system)

### 3.1 Recruiter / TAG portal flow
1. Recruiter opens `/tag`
2. Registers candidate and receives:
   - unique candidate ID
   - interview link (`/login?id=<candidateId>`)
3. Candidate uses the link to begin verification and interview

### 3.2 Candidate flow
1. Candidate opens `/login`
2. Proceeds through `/verify-aadhar` (optional integration; can be mocked)
3. Enters `/interview` and completes the session
4. System saves transcript, integrity signals, and recording (optional)
5. After completion, system triggers final AI debrief and stores it in Postgres

### 3.3 HR / reviewer flow
1. HR opens `/hr-dashboard` to triage sessions
2. Opens `/review/[id]`:
   - AI debrief + rubric + evidence
   - suspicion score + security events
   - reviewer scorecard editor
3. Exports review packet (`/api/review-packet/[id]`) for sharing/audit

---

## 4) Technical architecture (what runs where)

### 4.1 Frontend (Next.js)
- Main routes:
  - `/tag`: recruiter portal
  - `/login` → `/verify-aadhar` → `/interview`
  - `/dashboard`, `/review`, `/review/[id]`, `/hr-dashboard`

### 4.2 Backend (Server Actions + API routes)
- Server actions: `src/app/actions.ts`
  - session create/save/fetch
  - final AI report generation + persistence
  - reviewer scorecard persistence
  - optional Azure upload utilities
- API routes:
  - Speech token: `src/app/api/speech-token/route.ts`
  - Review packet export: `src/app/api/review-packet/[id]/route.ts`

### 4.3 Persistence (Postgres)
- Schema: `src/lib/init-db.ts`
- Tables:
  - `candidates`: registered candidates (created from `/tag`)
  - `sessions`: transcripts, reports, integrity signals, reviewer scorecards

### 4.4 AI usage (intentionally limited)
- **Only** the final post-interview evaluation uses AI:
  - Flow: `src/ai/flows/full-interview-analysis.ts`
  - Called by: `generateAndSaveSummaryReport(...)` in `src/app/actions.ts`
- The interview question flow is deterministic (question list or pasted question bank)

### 4.5 Integrity signals
- Proctoring warnings: Azure Vision integration (optional)
- Security events: captured in-browser and saved with the session
- Suspicion Score: simple weighted aggregation (0–100)

---

## 5) Differentiation vs HackerRank and iMocha (AI interviewer focus)

### 5.1 What HackerRank and iMocha emphasize (public docs)

**HackerRank AI Interviewer**:
- Autonomous interviews, follow-ups, hints, and scoring/reporting
- Mentions fairness and suspicious activity detection

**HackerRank Interviews (live coding)**:
- Real code environment/IDE, collaboration, transcript/reporting, scorecard assist

**iMocha**:
- Large assessment library, multiple compilers, AI proctoring with tab switching + audit logs
- “Tara” AI interviewer and interview automation

Sources:
- HackerRank AI Interviewer feature page: https://www.hackerrank.com/features/ai-interviewer
- HackerRank AI Interviewer support article: https://support.hackerrank.com/articles/6908366644
- HackerRank Interviews product page: https://www.hackerrank.com/products/interview
- HackerRank AI features catalog (dated 2026-03-11): https://support.hackerrank.com/hc/en-us/articles/35288933801491-HackerRank-s-AI-Features
- iMocha skills assessment overview: https://www.imocha.io/products/skills-assessment

### 5.2 Where we are better (clear, honest differentiators)

We win where management cares about **control, auditability, customization, and cost** for internal mock/prep or lightweight screening:

1) **AI-minimized by design**
- We use AI only for final evaluation (single call per interview), reducing:
  - cost variance
  - runtime failure points
  - governance complexity

2) **Evidence-backed rubric + reviewer override workflow built-in**
- AI rubric includes evidence snippets and per-competency scoring
- Reviewer can adjust scores/notes and persist the scorecard
- Exportable review packet supports audits and downstream analytics

3) **Audit trail for integrity**
- Session-level Suspicion Score plus a timeline of:
  - tab switching / focus events
  - clipboard events (copy/paste)
  - proctoring warnings

4) **Data ownership and extensibility**
- First-party data model in Postgres
- Clear points to integrate enterprise identity, storage, BI, and retention policies

5) **Unique internal requirement support**
- Optional Aadhar verification integration (Document Intelligence workflow)
- If your management needs “ID verification before interview”, this is a strong differentiator for certain geographies

### 5.3 Where HackerRank / iMocha are stronger (and why that’s OK)

- Massive question/assessment libraries and enterprise-grade authoring
- Full live-coding IDE environments, compilers, collaboration tooling (whiteboards, real repos)
- Deep proctoring modes (desktop lockdown, multi-monitor detection, replays) depending on product tier
- Enterprise admin, integrations, and compliance packaging

Our platform is intentionally lighter-weight and focused on controllable mock interviews and reviewer artifacts.

### 5.4 Feature matrix (AI interviewer + integrity + review)

Legend: ✅ = supported, ⚠️ = partial / optional, ❌ = not in current repo

| Capability (scope) | ProPrep AI (this repo) | HackerRank (AI Interviewer / Interviews) | iMocha (Skills + Interview suite) |
|---|---:|---:|---:|
| AI used during interview | ❌ (deterministic questions) | ✅ (AI interviewer, hints/follow-ups) | ✅ (AI interviewer / conversational interviews) |
| AI used for final evaluation | ✅ (rubric + evidence) | ✅ (reports, scorecards/assist) | ✅ (AI scoring/insights) |
| Live coding IDE + compilers | ❌ | ✅ | ✅ |
| Large assessment / question library | ❌ | ✅ | ✅ |
| Webcam proctoring signals | ⚠️ (optional Azure Vision) | ✅ | ✅ |
| Tab switching / integrity logging | ✅ (security events timeline) | ✅ | ✅ |
| Suspicion / integrity score | ✅ (heuristic 0–100) | ✅ (product-tier dependent) | ✅ (proctoring suite) |
| Reviewer scorecard overrides | ✅ (persisted) | ✅ | ✅ |
| Review packet export (JSON/MD) | ✅ | ⚠️ (reports/APIs vary by plan) | ⚠️ (exports/APIs vary by plan) |
| Custom on-prem / data ownership | ✅ (your infra) | ⚠️ | ⚠️ |
| Aadhar/ID verification flow | ✅ (optional integration) | ❌ (not a standard feature) | ❌ (not a standard feature) |

---

## 6) What management can measure (KPIs)

- Completion rate (% sessions completed vs started)
- Average score over time (per candidate, per role)
- Reviewer throughput (sessions reviewed per day)
- Integrity distribution (average suspicion score; top causes)
- Time-to-feedback (interview end → report generated)

---

## 7) Risk, compliance, and governance notes

- **Secrets management**: never commit `.env` with keys; use `.env.local` locally and secret managers in production
- **Data retention**: define retention for transcripts, recordings, and ID verification artifacts
- **Access control**: add RBAC (candidate vs recruiter vs HR vs admin) before broad rollout
- **False positives**: suspicion score is heuristic and should be treated as a “signal”, not a verdict
