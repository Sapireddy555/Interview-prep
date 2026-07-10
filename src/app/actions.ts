"use server";

import { after } from "next/server";
import { extractTextWithADI } from "@/lib/azure-id-verify";
import {
  claimReportGeneration,
  normalizeTranscriptForAnalysis,
  setReportStatus,
} from "@/lib/interview-report";
import { ai } from "@/ai/genkit";
import { generateAzureOpenAIJson, isAzureOpenAIConfigured } from "@/lib/azure-openai";
import { analyzeFrameWithAzure } from "@/lib/azure-vision-proctor";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getInterviewQuestionSetForRole, getQuestionListForRole, getTechnicalQuestionPool } from "@/lib/interview-constants";
import type { InterviewQuestion } from "@/lib/interview-constants";
import {
  buildResumeProjectQuestionPrompts,
  extractResumeProjectsFromText,
} from "@/lib/resume-project-parser";
import { computeSuspicionScoreFromEvents, mergeSuspicionScores } from "@/lib/suspicion-scoring";
import type { ReviewerScorecard, SecurityEvent } from "@/lib/types";

export async function processInterviewTurn(input: {
  role: string,
  difficulty: "easy" | "medium" | "hard",
  questionBank?: string,
  transcript: { role: 'user' | 'ai', content: string }[],
  userResponse: string
}) {
  // Intentional: no AI usage. We only use AI for final post-interview feedback.
  const questionList = getQuestionListForRole(input.role, input.questionBank);
  const askedCount = (input.transcript || []).filter(m => m.role === "ai").length;
  const nextQuestion = questionList[askedCount] ?? "The interview is now complete. Thank you for your time.";
  const isComplete = askedCount >= questionList.length;

  return {
    success: true,
    data: {
      feedback: "",
      suggestions: "",
      score: 0,
      nextQuestion,
      isComplete,
    }
  };
}

export async function getInitialQuestion(input: { role: string, difficulty: string, questionBank?: string }) {
  // Intentional: no AI usage. We only use AI for final post-interview feedback.
  const questionList = getQuestionListForRole(input.role, input.questionBank);
  const nextQuestion = questionList[0] ?? "Please introduce yourself.";

  return {
    success: true,
    data: {
      feedback: "",
      suggestions: "",
      score: 0,
      nextQuestion,
      isComplete: questionList.length <= 1,
    }
  };
}

// Firebase imports commented out - using local implementations
// import { addInterviewSession, getInterviewSession, getInterviewSessions, updateInterviewSession } from "@/lib/firestore";
import type { InterviewSession } from "@/lib/types";

// Deprecated actions removed

const MAX_INTERVIEW_ATTEMPTS_PER_CANDIDATE = 2;

export async function createInterviewSession(
  session: Omit<InterviewSession, 'id' | 'date' | 'feedback' | 'transcript' | 'summaryReport' | 'violations'> & { id?: string }
) {
    const localId = `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('Creating interview session with ID:', localId);
    
    try {
        const candidateId = session.id?.trim().toUpperCase() || null;
        if (candidateId) {
            const attempts = await getCandidateInterviewAttemptCount(candidateId);
            if (attempts >= MAX_INTERVIEW_ATTEMPTS_PER_CANDIDATE) {
                return {
                    success: false,
                    error: `This unique ID has already been used for ${MAX_INTERVIEW_ATTEMPTS_PER_CANDIDATE} attempts. Please contact the recruiter for a new test link.`,
                };
            }
        }

        await db.query(
            `INSERT INTO sessions (id, candidate_id, role, duration) 
             VALUES ($1, $2, $3, $4)`,
            [localId, candidateId, session.role, session.duration || '0']
        );
        return { success: true, id: localId };
    } catch (error) {
        console.error("DB Error creating session:", error);
        return { success: false, error: String(error) };
    }
}

export async function saveInterviewSession(id: string, session: Omit<InterviewSession, 'id' | 'date' | 'role' | 'summaryReport'>) {
    console.log('Saving interview session:', id);
    try {
        const securityEvents = (session.securityEvents || []) as SecurityEvent[];
        const computedSuspicion = computeSuspicionScoreFromEvents(securityEvents);
        const suspicionScore = mergeSuspicionScores(session.suspicionScore || 0, computedSuspicion);

        await db.query(
            `UPDATE sessions SET 
             score = $1, 
             duration = $2, 
             feedback = $3, 
             transcript = $4, 
             violations = $5,
             security_events = $6,
             suspicion_score = $7
             WHERE id = $8`,
            [
                session.score || 0, 
                session.duration, 
                JSON.stringify(session.feedback || []), 
                JSON.stringify(session.transcript || []), 
                JSON.stringify(session.violations || []), 
                JSON.stringify(securityEvents), 
                suspicionScore,
                id
            ]
        );
        return { success: true, id, suspicionScore };
    } catch (error) {
        console.error("DB Error saving session:", error);
        return { success: false, error: String(error) };
    }
}

export async function fetchInterviewSessions() {
    const res = await db.query(
        `SELECT s.*, c.l2_panel_name, c.l2_panel_email, c.name AS candidate_name
         FROM sessions s
         LEFT JOIN candidates c ON s.candidate_id = c.id
         ORDER BY s.date DESC`
    );
    return res.rows.map(normalizeSessionRow);
}

export async function fetchInterviewSession(id: string) {
    const res = await db.query(
        `SELECT s.*, c.l2_panel_name, c.l2_panel_email, c.name AS candidate_name
         FROM sessions s
         LEFT JOIN candidates c ON s.candidate_id = c.id
         WHERE s.id = $1`,
        [id]
    );
    const row = res.rows[0];
    return row ? normalizeSessionRow(row) : null;
}

export async function getCandidate(id: string) {
    const res = await db.query("SELECT * FROM candidates WHERE id = $1", [id]);
    return res.rows[0] || null;
}

async function getCandidateInterviewAttemptCount(candidateId: string) {
    const res = await db.query("SELECT COUNT(*)::int AS count FROM sessions WHERE candidate_id = $1", [candidateId]);
    return Number(res.rows[0]?.count || 0);
}

export async function fetchInterviewQuestionBank(interviewId: string) {
    try {
        const res = await db.query(
            `SELECT c.question_bank, c.resume_text, s.role
             FROM sessions s
             LEFT JOIN candidates c ON c.id = s.candidate_id
             WHERE s.id = $1`,
            [interviewId]
        );

        const row = res.rows[0];
        const questionBank = augmentQuestionBankWithResumeProjects(
            row?.question_bank || "",
            row?.resume_text || "",
            row?.role || "Software Engineer"
        );

        return { success: true, questionBank };
    } catch (error) {
        console.error("Error loading interview question bank:", error);
        return { success: false, questionBank: "", error: String(error) };
    }
}

export async function fetchViolationEventsForSession(interviewId: string) {
    try {
        const res = await db.query(
            `SELECT id, session_id, event_ts, event_type, image_url, metadata
             FROM violation_events
             WHERE session_id = $1
             ORDER BY event_ts ASC`,
            [interviewId]
        );

        return {
            success: true,
            events: res.rows.map((row) => ({
                id: row.id,
                sessionId: row.session_id,
                eventTs:
                    typeof row.event_ts === "string"
                        ? row.event_ts
                        : row.event_ts?.toISOString?.() ?? String(row.event_ts),
                eventType: row.event_type,
                imageUrl: row.image_url,
                metadata: row.metadata ?? {},
            })),
        };
    } catch (error) {
        console.error("Error loading violation events:", error);
        return { success: false, events: [], error: String(error) };
    }
}

export async function saveReviewerScorecardAction(input: { interviewId: string; scorecard: ReviewerScorecard }) {
  try {
    await db.query("UPDATE sessions SET reviewer_scorecard = $1 WHERE id = $2", [
      JSON.stringify(input.scorecard),
      input.interviewId,
    ]);
    return { success: true };
  } catch (error) {
    console.error("DB Error saving reviewer scorecard:", error);
    return { success: false, error: String(error) };
  }
}

export async function validateCandidateUniqueId(id: string) {
    const normalizedId = id.trim().toUpperCase();
    if (!normalizedId) {
        return { success: false, error: "Unique ID is required." };
    }

    try {
        const candidate = await getCandidate(normalizedId);
        if (!candidate) {
            return { success: false, error: "Invalid Unique ID." };
        }

        const attempts = await getCandidateInterviewAttemptCount(normalizedId);
        if (attempts >= MAX_INTERVIEW_ATTEMPTS_PER_CANDIDATE) {
            return {
                success: false,
                error: `This unique ID has reached the maximum of ${MAX_INTERVIEW_ATTEMPTS_PER_CANDIDATE} interview attempts. Please contact the recruiter for a new test link.`,
            };
        }

        return {
            success: true,
            attemptsUsed: attempts,
            attemptsRemaining: MAX_INTERVIEW_ATTEMPTS_PER_CANDIDATE - attempts,
            candidate: {
                id: candidate.id,
                name: candidate.name,
                email: candidate.email,
                role: candidate.role,
                difficulty: candidate.difficulty,
                l2PanelName: candidate.l2_panel_name,
                l2PanelEmail: candidate.l2_panel_email,
            },
        };
    } catch (error) {
        console.error("Error validating candidate ID:", error);
        return { success: false, error: String(error) };
    }
}

export async function storeCandidateSelfieAction(input: { candidateId: string; imageUri: string }) {
    const candidateId = input.candidateId.trim().toUpperCase();
    if (!candidateId || !input.imageUri) {
        return { success: false, error: "Candidate ID and selfie image are required." };
    }

    try {
        const candidate = await getCandidate(candidateId);
        if (!candidate) {
            return { success: false, error: "Candidate not found." };
        }

        const image = parseDataUri(input.imageUri);
        if (!image.contentType.startsWith("image/")) {
            return { success: false, error: "Selfie must be an image." };
        }

        await ensureSinglePersonDetectedWithAzureVision(image.buffer, "Reference selfie");

        const upload = await uploadCandidateSelfieToAzure(candidateId, image.buffer, image.contentType);
        await db.query(
            `UPDATE candidates
             SET selfie_url = $1, selfie_blob_name = $2, selfie_captured_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [upload.url, upload.blobName, candidateId]
        );

        return { success: true, selfieUrl: upload.url };
    } catch (error) {
        console.error("Error storing candidate selfie:", error);
        return { success: false, error: String(error) };
    }
}

export async function verifyCandidateSelfieAction(input: { candidateId: string; interviewId: string; imageUri: string }) {
    const candidateId = input.candidateId.trim().toUpperCase();
    const interviewId = input.interviewId.trim();
    if (!candidateId || !interviewId || !input.imageUri) {
        return { success: false, matched: false, error: "Candidate ID, interview ID, and live image are required." };
    }

    try {
        const candidate = await getCandidate(candidateId);
        if (!candidate?.selfie_blob_name) {
            const error = "Reference selfie is not available for this candidate.";
            await saveIdentityVerificationResult(interviewId, "failed", null, error);
            return { success: false, matched: false, error };
        }

        const referenceImage = await downloadCandidateSelfieFromAzure(candidate.selfie_blob_name);
        const liveImage = parseDataUri(input.imageUri);
        const result = await verifyIdentityPresenceWithAzureVision(referenceImage, liveImage.buffer);
        const matched = result.matched;

        await saveIdentityVerificationResult(
            interviewId,
            matched ? "matched" : "failed",
            result.confidence,
            matched ? null : result.message
        );

        return {
            success: true,
            matched,
            confidence: result.confidence,
            threshold: result.threshold,
            message: result.message,
        };
    } catch (error) {
        console.error("Error verifying candidate selfie:", error);
        await saveIdentityVerificationResult(interviewId, "failed", null, String(error));
        return { success: false, matched: false, error: String(error) };
    }
}

export async function registerCandidateAction(formData: FormData) {
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const role = String(formData.get("role") || "Generative AI Engineer").trim();
    const difficulty = String(formData.get("difficulty") || "medium").trim();
    const l2PanelName = String(formData.get("l2PanelName") || "").trim();
    const l2PanelEmail = String(formData.get("l2PanelEmail") || "").trim();
    const resume = formData.get("resume");
    const jobDescription = formData.get("jobDescription");

    if (!name || !email || !role || !difficulty) {
        return { success: false, error: "Name, email, role, and difficulty are required." };
    }

    if (!(resume instanceof File) || resume.size === 0 || resume.type !== "application/pdf") {
        return { success: false, error: "Candidate resume must be uploaded as a PDF." };
    }

    if (!(jobDescription instanceof File) || jobDescription.size === 0 || jobDescription.type !== "application/pdf") {
        return { success: false, error: "Job description must be uploaded as a PDF." };
    }

    const uniqueId = await createUniqueCandidateId();
    
    try {
        const [resumeUpload, jdUpload, resumeText, jobDescriptionText] = await Promise.all([
            uploadCandidateDocumentToAzure(uniqueId, resume, "resume"),
            uploadCandidateDocumentToAzure(uniqueId, jobDescription, "job-description"),
            extractTextWithADI(resume),
            extractTextWithADI(jobDescription),
        ]);
        const questionBank = await generateQuestionBankWithAI(role, difficulty, resumeText, jobDescriptionText);

        await db.query(
            `INSERT INTO candidates (
                id, name, email, role, difficulty, resume_url, resume_file_name,
                job_description_url, job_description_file_name, resume_text, job_description_text, question_bank,
                l2_panel_name, l2_panel_email
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
                uniqueId,
                name,
                email,
                role,
                difficulty,
                resumeUpload.url,
                resume.name,
                jdUpload.url,
                jobDescription.name,
                resumeText,
                jobDescriptionText,
                questionBank,
                l2PanelName,
                l2PanelEmail,
            ]
        );
        
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://interview-prep-ucdu.onrender.com";
        const interviewLink = `${baseUrl}/login?id=${uniqueId}`;
        const loginLink = `${baseUrl}/login`;
        const emailResult = await sendCandidateInvitationEmail({
            candidateName: name,
            candidateEmail: email,
            uniqueId,
            interviewLink: loginLink,
            role,
        });
        
        return { 
            success: true, 
            id: uniqueId, 
            link: interviewLink,
            name,
            emailSent: emailResult.success,
            emailError: emailResult.error,
        };
    } catch (error) {
        console.error("Error registering candidate:", error);
        return { success: false, error: String(error) };
    }
}

export async function registerBulkJobDescriptionTestAction(formData: FormData) {
    const testName = String(formData.get("testName") || "").trim();
    const difficulty = String(formData.get("difficulty") || "medium").trim();
    const emailText = String(formData.get("emails") || "").trim();
    const jobDescription = formData.get("jobDescription");
    const emails = parseBulkEmailList(emailText);

    if (!testName || !difficulty || emails.length === 0) {
        return { success: false, error: "Test name, level, and at least one candidate email are required." };
    }

    if (emails.invalid.length > 0) {
        return { success: false, error: `Invalid email address: ${emails.invalid[0]}` };
    }

    if (!(jobDescription instanceof File) || jobDescription.size === 0 || jobDescription.type !== "application/pdf") {
        return { success: false, error: "Job description must be uploaded as a PDF." };
    }

    const batchId = `BULK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    try {
        const [jdUpload, jobDescriptionText] = await Promise.all([
            uploadCandidateDocumentToAzure(batchId, jobDescription, "job-description"),
            extractTextWithADI(jobDescription),
        ]);
        const questionBank = buildJobDescriptionQuestionBank(testName, jobDescriptionText);
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://interview-prep-ucdu.onrender.com";
        const loginLink = `${baseUrl}/login`;
        const invitations = [];

        for (const email of emails.valid) {
            const uniqueId = await createUniqueCandidateId();
            const candidateName = formatCandidateNameFromEmail(email);

            await db.query(
                `INSERT INTO candidates (
                    id, name, email, role, difficulty, resume_url, resume_file_name,
                    job_description_url, job_description_file_name, resume_text, job_description_text, question_bank
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    uniqueId,
                    candidateName,
                    email,
                    testName,
                    difficulty,
                    null,
                    null,
                    jdUpload.url,
                    jobDescription.name,
                    "",
                    jobDescriptionText,
                    questionBank,
                ]
            );

            const interviewLink = `${baseUrl}/login?id=${uniqueId}`;
            const emailResult = await sendCandidateInvitationEmail({
                candidateName,
                candidateEmail: email,
                uniqueId,
                interviewLink: loginLink,
                role: testName,
            });

            invitations.push({
                id: uniqueId,
                link: interviewLink,
                name: candidateName,
                email,
                emailSent: emailResult.success,
                emailError: emailResult.error,
            });
        }

        return {
            success: true,
            testName,
            count: invitations.length,
            invitations,
        };
    } catch (error) {
        console.error("Error registering bulk job-description test:", error);
        return { success: false, error: String(error) };
    }
}

async function createUniqueCandidateId() {
    for (let attempt = 0; attempt < 5; attempt++) {
        const uniqueId = `AURA-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const existing = await db.query("SELECT 1 FROM candidates WHERE id = $1", [uniqueId]);
        if (existing.rowCount === 0) return uniqueId;
    }

    throw new Error("Unable to generate a unique candidate ID.");
}

function parseBulkEmailList(value: string) {
    const seen = new Set<string>();
    const entries = value
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const email of entries) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            invalid.push(email);
            continue;
        }

        if (!seen.has(email)) {
            seen.add(email);
            valid.push(email);
        }
    }

    return { valid, invalid, length: valid.length };
}

function formatCandidateNameFromEmail(email: string) {
    const localPart = email.split("@")[0] || "Candidate";
    const words = localPart
        .replace(/[._-]+/g, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean);

    if (words.length === 0) return "Candidate";

    return words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

function compactDocumentText(text: string, maxLength = 3500) {
    return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildJobDescriptionQuestionBank(role: string, jobDescriptionText: string) {
    const jd = compactDocumentText(jobDescriptionText);
    const technicalQuestions = jd
        ? [
            `[technical] This test is for ${role}. Based on the uploaded job description, summarize the responsibilities you consider most important and explain your relevant experience.`,
            `[technical] Pick one required skill or responsibility from the job description and walk through how you would apply it in a real project.`,
            `[technical] Based on the job description, describe the architecture, tools, or process you would use to deliver the core work successfully.`,
            `[technical] What risks, trade-offs, or quality concerns would you watch for while performing the responsibilities described in this job description?`,
            `[technical] How would you measure success for this ${role} test based on the expectations in the job description?`,
        ]
        : getTechnicalQuestionPool(role)
            .slice(0, 5)
            .map((question) => `[technical] ${question}`);

    return ["[no_resume_projects]", ...technicalQuestions].join("\n");
}

function hasGenericResumeProjectQuestions(questionBank: string) {
    return /choose the project|pick a resume project|pick one of your resume|from one of your resume projects/i.test(
        questionBank
    );
}

function augmentQuestionBankWithResumeProjects(questionBank: string, resumeText: string, role: string) {
    const resume = compactDocumentText(resumeText);
    if (!resume) return questionBank;

    const needsReplacement = !questionBank || hasGenericResumeProjectQuestions(questionBank);
    const projects = extractResumeProjectsFromText(resume, 2);
    const resumePrompts = buildResumeProjectQuestionPrompts(projects, role, 3);
    if (!resumePrompts.length) return questionBank;

    if (!needsReplacement) return questionBank;

    const preservedLines = (questionBank || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/^\[resume_projects\]/i.test(line) && !/^\[(no_resume_projects|jd_only)\]/i.test(line));

    return [...preservedLines, ...resumePrompts].join("\n");
}

function buildCandidateQuestionBank(role: string, resumeText: string, _jobDescriptionText: string) {
    const resume = compactDocumentText(resumeText);

    const technicalQuestions = getTechnicalQuestionPool(role)
        .slice(0, 5)
        .map((question) => `[technical] ${question}`);

    const projects = extractResumeProjectsFromText(resume, 2);
    const resumeQuestions = projects.length
        ? buildResumeProjectQuestionPrompts(projects, role, 3)
        : [];

    return [...technicalQuestions, ...resumeQuestions].join("\n");
}

export async function generateQuestionBankWithAI(
  role: string,
  difficulty: string,
  resumeText: string,
  jobDescriptionText: string
): Promise<string> {
  const promptText = `You are a Senior Principal Interviewer generating structured, role-specific interview questions.
Generate exactly 5 technical questions and exactly 3 project-based questions for a candidate interviewing for the role of ${role} (${difficulty} level).

CANDIDATE RESUME TEXT:
${resumeText || "No resume provided."}

JOB DESCRIPTION TEXT:
${jobDescriptionText || "No job description provided."}

INSTRUCTIONS:
1. Generate exactly 5 technical questions. Prefix each question with "[technical]". These must cover core skills needed for the role and the job description.
2. Generate exactly 3 real-world project questions. Prefix each question with "[resume_projects]". These should query specific achievements, decisions, trade-offs, or architectures mentioned in their resume projects. If no resume projects are available, generate scenario-based project design questions.
3. Make sure all questions are challenging and direct (max 1-2 sentences each). Do not include introductory text, explanations, or notes.
4. Output them as separate lines, each starting with the appropriate tag prefix.

Example Output format:
[technical] Question 1
[technical] Question 2
[technical] Question 3
[technical] Question 4
[technical] Question 5
[resume_projects] Project Question 1
[resume_projects] Project Question 2
[resume_projects] Project Question 3
`;

  try {
    const preferAzure = process.env.AI_PRIMARY_PROVIDER?.toLowerCase() === 'azure';
    if (preferAzure && isAzureOpenAIConfigured()) {
      const response = await generateAzureOpenAIJson<{ questions: string[] }>({
        system: "You are an expert technical interviewer. You output strict JSON matching the requested schema.",
        user: `${promptText}\nReturn JSON in this shape: { "questions": ["(tagged question 1)", ...] }`,
        temperature: 0.75,
      });
      if (response && Array.isArray(response.questions)) {
        return response.questions.join("\n");
      }
    }

    // Default to Gemini (using genkit)
    const geminiResponse = await ai.generate({
      prompt: promptText,
      config: {
        temperature: 0.75,
      }
    });
    return geminiResponse.text;
  } catch (error) {
    console.error("AI question generation failed, falling back to static questions:", error);
    return buildCandidateQuestionBank(role, resumeText, jobDescriptionText);
  }
}


const proctoringInputSchema = z.object({
  videoFrameDataUri: z.string(),
});

export async function checkProctoring(input: { videoFrameDataUri: string }) {
  try {
    const result = await analyzeFrameWithAzure(input.videoFrameDataUri);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error in checkProctoring:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return { success: false, error: errorMessage };
  }
}

import { analyzeFullInterview } from "@/ai/flows/full-interview-analysis";

export async function runInterviewReportGeneration(interviewId: string) {
  const claimed = await claimReportGeneration(interviewId);
  if (!claimed) {
    return {
      success: true,
      skipped: true,
      message: "Report generation is already in progress or complete.",
    };
  }

  try {
    const sessionRes = await db.query(
      `SELECT s.*, c.question_bank
       FROM sessions s
       LEFT JOIN candidates c ON c.id = s.candidate_id
       WHERE s.id = $1`,
      [interviewId]
    );
    const session = sessionRes.rows[0];
    if (!session) {
      throw new Error("Interview session not found.");
    }

    const transcript = normalizeTranscriptForAnalysis(session.transcript);
    if (!transcript.length) {
      throw new Error("Interview transcript is empty. Cannot generate a report.");
    }

    const report = await analyzeFullInterview({
      role: session.role,
      transcript,
    });

    report.htmlReport = formatReportToHtml(interviewId, report, session);

    await db.query(
      "UPDATE sessions SET summary_report = $1, score = $2, report_status = 'complete', report_error = NULL WHERE id = $3",
      [JSON.stringify(report), report.overallScore ?? 0, interviewId]
    );

    let storageWarning: string | undefined;
    try {
      await uploadReportToAzure(interviewId, report, session);
    } catch (storageError) {
      storageWarning = storageError instanceof Error ? storageError.message : String(storageError);
      console.error("Report generated and saved, but Azure report upload failed:", storageError);
    }

    return { success: true, data: report, storageWarning };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error("Error generating or saving summary report:", error);
    await setReportStatus(interviewId, "failed", errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function generateAndSaveSummaryReport(interviewId: string) {
  return runInterviewReportGeneration(interviewId);
}

export async function finishInterviewAction(input: {
  interviewId: string;
  session: Omit<InterviewSession, "id" | "date" | "role" | "summaryReport">;
}) {
  const saveResult = await saveInterviewSession(input.interviewId, input.session);
  if (!saveResult.success) {
    return { success: false, error: saveResult.error || "Failed to save interview session." };
  }

  await setReportStatus(input.interviewId, "pending");

  after(async () => {
    await runInterviewReportGeneration(input.interviewId);
  });

  return {
    success: true,
    reportStatus: "generating" as const,
    suspicionScore: saveResult.suspicionScore,
  };
}

function parseReviewerScorecard(value: unknown): ReviewerScorecard | null {
    if (!value) return null;
    if (typeof value === "string") {
        try {
            return JSON.parse(value) as ReviewerScorecard;
        } catch {
            return null;
        }
    }
    return value as ReviewerScorecard;
}

function normalizeSessionRow(row: any): InterviewSession {
  const normalizedDate =
    typeof row.date === "string"
      ? row.date
      : row.date?.toISOString?.()
        ? row.date.toISOString()
        : String(row.date ?? "");

  const normalizedDuration =
    typeof row.duration === "string" ? row.duration : String(row.duration ?? "0");

  return {
    id: row.id,
    date: normalizedDate,
    role: row.role,
    score: row.score ?? 0,
    duration: normalizedDuration,
    feedback: row.feedback ?? [],
    transcript: row.transcript ?? [],
    summaryReport: row.summary_report ?? null,
    violations: row.violations ?? [],
    securityEvents: row.security_events ?? [],
    suspicionScore: row.suspicion_score ?? 0,
    reviewerScorecard: parseReviewerScorecard(row.reviewer_scorecard),
    identityStatus: row.identity_status ?? null,
    identityScore: row.identity_score !== undefined && row.identity_score !== null ? Number(row.identity_score) : null,
    identityVerifiedAt:
      typeof row.identity_verified_at === "string"
        ? row.identity_verified_at
        : row.identity_verified_at?.toISOString?.()
          ? row.identity_verified_at.toISOString()
          : null,
    identityError: row.identity_error ?? null,
    reportStatus: row.report_status ?? "pending",
    reportError: row.report_error ?? null,
    l2Scorecard: row.l2_scorecard ?? null,
    l2ScheduledTime: row.l2_scheduled_time ? (typeof row.l2_scheduled_time === 'string' ? row.l2_scheduled_time : row.l2_scheduled_time.toISOString()) : null,
    l2PanelName: row.l2_panel_name ?? null,
    l2PanelEmail: row.l2_panel_email ?? null,
    candidateName: row.candidate_name ?? null,
  };
}

async function uploadReportToAzure(interviewId: string, report: any, session: any) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const sasUrl = process.env.AZURE_STORAGE_SAS_URL;

    if (!connectionString && !sasUrl) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("Azure Storage is not configured for report upload.");
        }
        console.log(`[Mock Azure Report Upload] Saving report for ${interviewId} to local mock storage.`);
        return;
    }

    try {
        const { BlobServiceClient, ContainerClient } = await import("@azure/storage-blob");
        let containerClient;

        if (sasUrl) {
            containerClient = new ContainerClient(sasUrl);
        } else {
            const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString!);
            containerClient = blobServiceClient.getContainerClient("interview-artifacts");
            await containerClient.createIfNotExists();
        }

        const ownerFolder = getArtifactOwnerFolder(session.candidate_id || interviewId);
        const reportContent = Buffer.from(report.htmlReport || formatReportToHtml(interviewId, report, session), "utf8");
        const blockBlobClient = containerClient.getBlockBlobClient(`${ownerFolder}/${interviewId}/feedback.html`);
        
        await blockBlobClient.uploadData(reportContent, {
            blobHTTPHeaders: { blobContentType: "text/html; charset=utf-8" }
        });

        console.log(`Successfully uploaded HTML report for ${interviewId} to Azure Storage.`);
    } catch (error) {
        console.error("Failed to upload report to Azure:", error);
        throw error;
    }
}

async function uploadCandidateDocumentToAzure(candidateId: string, file: File, documentType: "resume" | "job-description") {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const sasUrl = process.env.AZURE_STORAGE_SAS_URL;
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobName = `${candidateId}/${documentType}_${Date.now()}_${safeFileName}`;

    if (!connectionString && !sasUrl) {
        console.log(`[Mock Azure Document Upload] Skipping ${documentType} upload for ${candidateId}.`);
        return { url: null };
    }

    try {
        const { BlobServiceClient, ContainerClient } = await import("@azure/storage-blob");
        let containerClient;

        if (sasUrl) {
            containerClient = new ContainerClient(sasUrl);
        } else {
            const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString!);
            containerClient = blobServiceClient.getContainerClient("candidate-documents");
            await containerClient.createIfNotExists();
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: "application/pdf" },
            metadata: {
                candidateId,
                documentType,
                originalFileName: safeFileName,
            },
        });

        return { url: (blockBlobClient as any).url };
    } catch (error) {
        console.error(`Failed to upload ${documentType} to Azure:`, error);
        throw new Error(`Failed to upload ${documentType} PDF to Azure Storage.`);
    }
}

function parseDataUri(dataUri: string) {
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        throw new Error("Invalid image data.");
    }

    return {
        contentType: match[1],
        buffer: Buffer.from(match[2], "base64"),
    };
}

function getArtifactOwnerFolder(value: string) {
    return (value || "unassigned").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function getCandidateIdForInterview(interviewId: string) {
    try {
        const res = await db.query("SELECT candidate_id FROM sessions WHERE id = $1", [interviewId]);
        return res.rows[0]?.candidate_id || "";
    } catch (error) {
        console.error("Failed to resolve candidate ID for interview artifact:", error);
        return "";
    }
}

async function getCandidateSelfieContainer() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const sasUrl = process.env.AZURE_STORAGE_SAS_URL;

    if (!connectionString && !sasUrl) {
        throw new Error("Azure Storage is not configured for candidate selfie storage.");
    }

    const { BlobServiceClient, ContainerClient } = await import("@azure/storage-blob");

    if (sasUrl) {
        return new ContainerClient(sasUrl);
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString!);
    const containerClient = blobServiceClient.getContainerClient("candidate-selfies");
    await containerClient.createIfNotExists();
    return containerClient;
}

async function uploadCandidateSelfieToAzure(candidateId: string, buffer: Buffer, contentType: string) {
    const containerClient = await getCandidateSelfieContainer();
    const extension = contentType.includes("png") ? "png" : "jpg";
    const blobName = `${candidateId}/reference_selfie_${Date.now()}.${extension}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: contentType },
        metadata: {
            candidateId,
            documentType: "reference-selfie",
        },
    });

    return { url: (blockBlobClient as any).url, blobName };
}

async function downloadCandidateSelfieFromAzure(blobName: string) {
    const containerClient = await getCandidateSelfieContainer();
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const timeoutMs = Number(process.env.AZURE_BLOB_DOWNLOAD_TIMEOUT_MS || "20000");

    const downloadPromise = blockBlobClient.downloadToBuffer().then((buffer) => Buffer.from(buffer));
    const timeoutPromise = new Promise<Buffer>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Selfie download timed out after ${Math.round(timeoutMs / 1000)} seconds.`)),
        timeoutMs
      );
    });

    return Promise.race([downloadPromise, timeoutPromise]);
}

function getAzureFaceConfig() {
    const endpoint = (process.env.AZURE_FACE_ENDPOINT || "").replace(/\/$/, "");
    const key = process.env.AZURE_FACE_KEY || process.env.AZURE_FACE_API_KEY || "";

    if (!endpoint || !key) {
        throw new Error("Azure Face API is not configured.");
    }

    return { endpoint, key };
}

function getAzureVisionConfig() {
    const endpoint = (
        process.env.AZURE_VISION_ENDPOINT ||
        process.env.AZURE_COMPUTER_VISION_ENDPOINT ||
        ""
    ).replace(/\/$/, "");
    const key =
        process.env.AZURE_VISION_KEY ||
        process.env.AZURE_COMPUTER_VISION_KEY ||
        "";

    if (!endpoint || !key) {
        throw new Error("Azure Vision API is not configured.");
    }

    return { endpoint, key };
}

async function fetchWithTimeout(url: string | URL, init: RequestInit, timeoutMs = Number(process.env.AZURE_FACE_TIMEOUT_MS || "15000")) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(`Azure Face API request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

type VisionPersonDetection = {
    boundingBox: { x: number; y: number; w: number; h: number };
    confidence: number;
    areaRatio: number;
    centerX: number;
};

function normalizeVisionBoundingBox(person: any) {
    const bbox = person?.boundingBox;
    if (!bbox) return null;

    const x = bbox.x ?? bbox.left ?? 0;
    const y = bbox.y ?? bbox.top ?? 0;
    const w = bbox.w ?? bbox.width ?? 0;
    const h = bbox.h ?? bbox.height ?? 0;
    if (!w || !h) return null;

    return { x, y, w, h };
}

function getVisionImageDimensions(result: any) {
    return {
        width: result?.metadata?.width ?? result?.imageMetadata?.width ?? result?.width ?? 0,
        height: result?.metadata?.height ?? result?.imageMetadata?.height ?? result?.height ?? 0,
    };
}

function toVisionPersonDetections(result: any): VisionPersonDetection[] {
    const rawPeople = result?.peopleResult?.values || [];
    const { width, height } = getVisionImageDimensions(result);
    const frameArea = width && height ? width * height : 0;

    return (Array.isArray(rawPeople) ? rawPeople : [])
        .map((person) => {
            const boundingBox = normalizeVisionBoundingBox(person);
            if (!boundingBox) return null;

            const confidence = person?.confidence ?? person?.confidenceScore ?? person?.score ?? 1;
            const areaRatio = frameArea ? (boundingBox.w * boundingBox.h) / frameArea : 0;
            const centerX = width ? (boundingBox.x + boundingBox.w / 2) / width : 0.5;

            return { boundingBox, confidence, areaRatio, centerX };
        })
        .filter((person): person is VisionPersonDetection => !!person)
        .filter((person) => person.confidence >= Number(process.env.IDENTITY_VISION_MIN_PERSON_CONFIDENCE || "0.5"))
        .filter((person) => person.areaRatio >= Number(process.env.IDENTITY_VISION_MIN_PERSON_AREA_RATIO || "0.025"))
        .sort((a, b) => b.areaRatio - a.areaRatio);
}

async function analyzeIdentityImageWithAzureVision(image: Buffer, label: string) {
    const { endpoint, key } = getAzureVisionConfig();
    const url = new URL(`${endpoint}/computervision/imageanalysis:analyze`);
    url.searchParams.set("features", "People");
    url.searchParams.set("api-version", "2024-02-01");

    const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(image),
    }, Number(process.env.AZURE_VISION_TIMEOUT_MS || "15000"));

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure Vision analysis failed for ${label} (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const people = toVisionPersonDetections(result);
    const primary = people[0] || null;
    const secondary = people[1] || null;

    return { people, primary, secondary };
}

async function ensureSinglePersonDetectedWithAzureVision(image: Buffer, label: string) {
    const analysis = await analyzeIdentityImageWithAzureVision(image, label);
    if (!analysis.primary) {
        throw new Error(`${label}: no person was detected. Please face the camera directly in good lighting.`);
    }

    const maxSecondAreaRatio = Number(process.env.IDENTITY_VISION_SECOND_PERSON_AREA_RATIO || "0.08");
    const maxSecondRelativeArea = Number(process.env.IDENTITY_VISION_SECOND_PERSON_RELATIVE_AREA || "0.35");
    if (
        analysis.secondary &&
        (analysis.secondary.areaRatio >= maxSecondAreaRatio ||
            analysis.secondary.areaRatio >= analysis.primary.areaRatio * maxSecondRelativeArea)
    ) {
        throw new Error(`${label}: multiple people were detected. Please ensure only the candidate is visible.`);
    }

    return analysis.primary;
}

async function verifyIdentityPresenceWithAzureVision(referenceImage: Buffer, liveImage: Buffer) {
    const [referencePerson, livePerson] = await Promise.all([
        ensureSinglePersonDetectedWithAzureVision(referenceImage, "Reference selfie"),
        ensureSinglePersonDetectedWithAzureVision(liveImage, "Live camera image"),
    ]);

    const minLiveAreaRatio = Number(process.env.IDENTITY_VISION_MIN_LIVE_AREA_RATIO || "0.04");
    const minConfidence = Number(process.env.IDENTITY_VISION_MATCH_THRESHOLD || "0.5");
    const liveCentered = livePerson.centerX >= 0.18 && livePerson.centerX <= 0.82;
    const liveLargeEnough = livePerson.areaRatio >= minLiveAreaRatio;
    const confidence = Math.min(referencePerson.confidence, livePerson.confidence);
    const matched = confidence >= minConfidence && liveCentered && liveLargeEnough;

    return {
        matched,
        confidence,
        threshold: minConfidence,
        message: matched
            ? "Identity presence verified with Azure Vision."
            : "Live camera image could not be verified. Keep your face centered, clearly visible, and ensure only you are in frame.",
    };
}

function formatAzureFaceError(status: number, errorText: string) {
    if (/UnsupportedFeature|facerecognition|Identification,Verification/i.test(errorText)) {
        return "Azure Face verification is not enabled for this resource. Enable Limited Access approval for Face Identification/Verification at https://aka.ms/facerecognition, or use a Face resource that already has verification access.";
    }

    if (status === 401 || status === 403) {
        return `Azure Face API access denied (${status}). Check the Face API key, endpoint, region, and Limited Access approval for face verification.`;
    }

    return `Azure Face API failed (${status}): ${errorText}`;
}

async function detectFacesWithAzureFace(image: Buffer, returnFaceId: boolean) {
    const { endpoint, key } = getAzureFaceConfig();
    const url = new URL(`${endpoint}/face/v1.0/detect`);
    url.searchParams.set("returnFaceId", String(returnFaceId));
    url.searchParams.set("recognitionModel", "recognition_04");
    url.searchParams.set("detectionModel", "detection_03");
    if (returnFaceId) {
        url.searchParams.set("faceIdTimeToLive", "120");
    }

    const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(image),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(formatAzureFaceError(response.status, errorText));
    }

    return await response.json();
}

function filterSignificantFaces(faces: any[]) {
    const parsed = (Array.isArray(faces) ? faces : [])
        .map((face) => {
            const rect = face?.faceRectangle;
            if (!rect?.width || !rect?.height) return null;
            return {
                face,
                area: rect.width * rect.height,
            };
        })
        .filter((entry): entry is { face: any; area: number } => !!entry)
        .sort((a, b) => b.area - a.area);

    if (parsed.length <= 1) {
        return parsed.map((entry) => entry.face);
    }

    const primaryArea = parsed[0].area;
    return parsed
        .filter((entry, index) => {
            if (index === 0) return true;
            return entry.area >= primaryArea * 0.25;
        })
        .map((entry) => entry.face);
}

async function ensureSingleFaceDetectedWithAzureFace(image: Buffer, label: string) {
    const faces = filterSignificantFaces(await detectFacesWithAzureFace(image, false));
    if (faces.length === 0) {
        throw new Error(`${label}: no face was detected. Please face the camera directly in good lighting.`);
    }
    if (faces.length > 1) {
        throw new Error(`${label}: multiple faces were detected. Please ensure only the candidate is visible.`);
    }
}

async function detectFaceIdWithAzureFace(image: Buffer, label: string) {
    const faces = filterSignificantFaces(await detectFacesWithAzureFace(image, true));
    if (faces.length !== 1 || !faces[0]?.faceId) {
        if (faces.length > 1) {
            throw new Error(`${label}: multiple faces were detected. Please ensure only the candidate is visible.`);
        }
        throw new Error(`${label}: no face was detected. Please face the camera directly in good lighting.`);
    }

    return faces[0].faceId as string;
}

async function verifyFacesWithAzureFace(referenceImage: Buffer, liveImage: Buffer) {
    const { endpoint, key } = getAzureFaceConfig();

    const [referenceFaceId, liveFaceId] = await Promise.all([
        detectFaceIdWithAzureFace(referenceImage, "Reference selfie"),
        detectFaceIdWithAzureFace(liveImage, "Live camera image"),
    ]);

    const response = await fetchWithTimeout(`${endpoint}/face/v1.0/verify`, {
        method: "POST",
        headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ faceId1: referenceFaceId, faceId2: liveFaceId }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(formatAzureFaceError(response.status, errorText));
    }

    const result = await response.json();
    return {
        isIdentical: Boolean(result.isIdentical),
        confidence: Number(result.confidence || 0),
    };
}

async function saveIdentityVerificationResult(interviewId: string, status: "matched" | "failed", score: number | null, error: string | null) {
    try {
        await db.query(
            `UPDATE sessions
             SET identity_status = $1,
                 identity_score = $2,
                 identity_verified_at = CURRENT_TIMESTAMP,
                 identity_error = $3
             WHERE id = $4`,
            [status, score, error, interviewId]
        );
    } catch (dbError) {
        console.error("Failed to save identity verification result:", dbError);
    }
}

function parseAcsConnectionString(connectionString: string) {
    const parts = Object.fromEntries(
        connectionString
            .split(";")
            .map((part) => part.split("="))
            .filter(([key, value]) => key && value)
            .map(([key, ...value]) => [key.toLowerCase(), value.join("=")])
    );

    return {
        endpoint: parts.endpoint,
        accessKey: parts.accesskey,
    };
}

function createAcsHeaders(method: string, url: URL, body: string, accessKey: string) {
    const timestamp = new Date().toUTCString();
    const contentHash = crypto.createHash("sha256").update(body).digest("base64");
    const pathAndQuery = `${url.pathname}${url.search}`;
    const stringToSign = `${method}\n${pathAndQuery}\n${timestamp};${url.host};${contentHash}`;
    const signature = crypto
        .createHmac("sha256", Buffer.from(accessKey, "base64"))
        .update(stringToSign, "utf8")
        .digest("base64");

    return {
        "Content-Type": "application/json",
        "x-ms-date": timestamp,
        "x-ms-content-sha256": contentHash,
        Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
    };
}

async function sendCandidateInvitationEmail(input: {
    candidateName: string;
    candidateEmail: string;
    uniqueId: string;
    interviewLink: string;
    role: string;
}) {
    const connectionString =
        process.env.AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING ||
        process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
    const senderAddress = process.env.AZURE_COMMUNICATION_EMAIL_SENDER;
    const logoUrl =
        process.env.EMAIL_LOGO_URL ||
        process.env.NEXT_PUBLIC_EMAIL_LOGO_URL ||
        "https://valuemomentum.com/wp-content/uploads/2026/03/ValueMomentum_logo.svg";

    if (!connectionString || !senderAddress) {
        console.log(`[Mock ACS Email] Invitation for ${input.candidateEmail}: ${input.interviewLink}`);
        return { success: false, error: "ACS email environment variables are not configured." };
    }

    const { endpoint, accessKey } = parseAcsConnectionString(connectionString);
    if (!endpoint || !accessKey) {
        return { success: false, error: "ACS connection string must include endpoint and accessKey." };
    }

    const url = new URL("/emails:send?api-version=2023-03-31", endpoint);
    const body = JSON.stringify({
        senderAddress,
        content: {
            subject: `ValueMomentum Interview Invitation - ${input.role}`,
            plainText: [
                `Hello ${input.candidateName},`,
                "",
                `ValueMomentum has invited you to complete an Aura interview for ${input.role}.`,
                `Interview link: ${input.interviewLink}`,
                `Unique ID: ${input.uniqueId}`,
                "",
                "Instructions:",
                "Attend the interview from a distraction-free location with a stable internet connection.",
                "Enter your unique ID carefully, exactly as shared above.",
                "Keep your camera prepared for the selfie verification step.",
                "Provide access to your camera and microphone when the browser requests permission.",
                "The use of additional devices, secondary screens, notes, or external support is strictly prohibited.",
                "The interview process will be recorded and assessed by the ValueMomentum recruitment team, and further communication will be shared based on your performance in the interview.",
                "",
                "Regards,",
                "VM TAG Team",
            ].join("\n"),
            html: `
                <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 640px;">
                    <div style="padding: 0 0 18px 0;">
                        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="ValueMomentum" style="height: 34px; width: auto; display: block;" />` : `<div style="color: #0f172a; font-size: 20px; font-weight: 800;">ValueMomentum</div>`}
                    </div>
                    <div style="border: 1px solid #e2e8f0; padding: 24px; border-radius: 14px;">
                    <div style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #056BFC; font-weight: 800;">Aura Interview</div>
                    <h2 style="margin: 8px 0 12px 0;">ValueMomentum Interview Invitation</h2>
                    <p>Hello ${escapeHtml(input.candidateName)},</p>
                    <p>ValueMomentum has invited you to complete an Aura interview for <strong>${escapeHtml(input.role)}</strong>.</p>
                    <p><strong>Unique ID:</strong> <code style="font-size: 16px; background: #f1f5f9; padding: 4px 8px; border-radius: 6px;">${escapeHtml(input.uniqueId)}</code></p>
                    <p><a href="${escapeHtml(input.interviewLink)}" style="background: #056BFC; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; display: inline-block;">Start Interview</a></p>
                    <h3>Instructions</h3>
                    <ul style="padding-left: 20px; margin: 0 0 18px 0;">
                        <li>Attend the interview from a distraction-free location with a stable internet connection.</li>
                        <li>Enter your unique ID carefully, exactly as shared above.</li>
                        <li>Keep your camera prepared for the selfie verification step.</li>
                        <li>Provide access to your camera and microphone when the browser requests permission.</li>
                        <li>The use of additional devices, secondary screens, notes, or external support is strictly prohibited.</li>
                        <li>The interview process will be recorded and assessed by the ValueMomentum recruitment team, and further communication will be shared based on your performance in the interview.</li>
                    </ul>
                    <p>Regards,<br/><strong>VM TAG Team</strong></p>
                    </div>
                </div>
            `,
        },
        recipients: {
            to: [
                {
                    address: input.candidateEmail,
                    displayName: input.candidateName,
                },
            ],
        },
    });

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: createAcsHeaders("POST", url, body, accessKey),
            body,
        });

        if (!response.ok && response.status !== 202) {
            const errorText = await response.text();
            return { success: false, error: `ACS email failed (${response.status}): ${errorText}` };
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to send ACS invitation email:", error);
        return { success: false, error: String(error) };
    }
}

function formatReportToMarkdown(id: string, report: any, session: any): string {
    let md = `# Interview Report: ${session.role}\n`;
    md += `**Interview ID:** ${id}\n`;
    md += `**Date:** ${new Date(session.date).toLocaleString()}\n`;
    md += `**Overall Score:** ${report.overallScore}/100\n`;
    md += `**Duration:** ${session.duration} minutes\n`;
    md += `**Recommendation:** ${report.hiringRecommendation}\n\n`;

    md += `## Executive Summary\n${report.summary}\n\n`;

    md += `## Strengths\n`;
    report.strengths.forEach((s: string) => md += `- ${s}\n`);
    md += `\n`;

    md += `## Areas for Improvement\n`;
    report.weaknesses.forEach((w: string) => md += `- ${w}\n`);
    md += `\n`;

    if (report.sectionFeedback?.length) {
        md += `## Section Feedback\n`;
        report.sectionFeedback.forEach((section: any) => {
            md += `### ${section.sectionTitle}\n`;
            md += `**Score:** ${section.score}/100\n`;
            md += `${section.summary}\n\n`;
            if (section.strengths?.length) {
                md += `**Strengths**\n`;
                section.strengths.forEach((item: string) => md += `- ${item}\n`);
            }
            if (section.improvements?.length) {
                md += `**Improvements**\n`;
                section.improvements.forEach((item: string) => md += `- ${item}\n`);
            }
            md += `\n`;
        });
    }

    md += `## Detailed Feedback\n`;
    md += `### Technical Assessment\n${report.technicalFeedback}\n\n`;
    md += `### Behavioral Assessment\n${report.behavioralFeedback}\n\n`;

    md += `## Question-by-Question Evaluation\n`;
    report.questionFeedback.forEach((q: any, i: number) => {
        md += `### Q${i + 1}: ${q.question}\n`;
        md += `**Section:** ${q.sectionTitle}\n`;
        md += `**Score:** ${q.score}/100\n`;
        md += `**Feedback:** ${q.feedback}\n\n`;
    });

    md += `## Full Transcript\n`;
    session.transcript.forEach((m: any) => {
        md += `**${m.role.toUpperCase()}:** ${m.content}\n\n`;
    });

    return md;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSectionColorTokens(sectionId: string) {
  if (sectionId === "communication") {
    return {
      accent: "#15803d",
      soft: "#dcfce7",
      border: "#86efac",
      heading: "#14532d",
    };
  }
  if (sectionId === "technical") {
    return {
      accent: "#1d4ed8",
      soft: "#dbeafe",
      border: "#93c5fd",
      heading: "#1e3a8a",
    };
  }
  return {
    accent: "#7c3aed",
    soft: "#ede9fe",
    border: "#c4b5fd",
    heading: "#4c1d95",
  };
}

function renderQuestionListItems(questions: InterviewQuestion[], sectionTitle: string) {
  return questions
    .filter((question) => question.sectionTitle === sectionTitle)
    .map((question, index) => `<li style="margin: 0 0 8px 18px;">Q${index + 1}: ${escapeHtml(question.prompt)}</li>`)
    .join("");
}

function formatReportToHtml(id: string, report: any, session: any): string {
  const questionSet = getInterviewQuestionSetForRole(session.role || "Software Engineer", session.question_bank || "");
  const sectionBlocks = (report.sectionFeedback || []).map((section: any) => {
    const colors = getSectionColorTokens(section.sectionId);
    const strengths = (section.strengths || [])
      .map((item: string) => `<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`)
      .join("");
    const improvements = (section.improvements || [])
      .map((item: string) => `<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`)
      .join("");

    return `
      <section style="border: 1px solid ${colors.border}; background: ${colors.soft}; border-radius: 20px; padding: 24px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 12px;">
          <h2 style="margin: 0; color: ${colors.heading}; font-size: 20px; font-weight: 700;">${escapeHtml(section.sectionTitle)}</h2>
          <span style="background: ${colors.accent}; color: white; padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">${section.score}/100</span>
        </div>
        <p style="margin: 0 0 16px 0; color: #334155; line-height: 1.6; font-size: 14px;">${escapeHtml(section.summary || "")}</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div style="background: white; border-radius: 16px; padding: 16px; border: 1px solid rgba(0,0,0,0.05);">
            <h3 style="margin: 0 0 10px 0; color: ${colors.heading}; font-size: 14px; font-weight: 700;">Strengths</h3>
            <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 13.5px; line-height: 1.5;">${strengths || '<li>Not specified</li>'}</ul>
          </div>
          <div style="background: white; border-radius: 16px; padding: 16px; border: 1px solid rgba(0,0,0,0.05);">
            <h3 style="margin: 0 0 10px 0; color: ${colors.heading}; font-size: 14px; font-weight: 700;">Improvement Areas</h3>
            <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 13.5px; line-height: 1.5;">${improvements || '<li>Not specified</li>'}</ul>
          </div>
        </div>
        <div style="margin-top: 16px; background: rgba(255,255,255,0.75); border-radius: 16px; padding: 16px; border: 1px solid rgba(0,0,0,0.02);">
          <h3 style="margin: 0 0 10px 0; color: ${colors.heading}; font-size: 14px; font-weight: 700;">Questions Covered</h3>
          <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 13.5px; line-height: 1.5;">${renderQuestionListItems(questionSet, section.sectionTitle)}</ul>
        </div>
      </section>
    `;
  }).join("");

  const transcriptList = Array.isArray(session.transcript) ? session.transcript : [];
  const questionFeedbackRows = (report.questionFeedback || []).map((question: any, index: number) => {
    let userResponse = "No answer was recorded.";
    const qIndex = transcriptList.findIndex(
      (msg: any) => msg.role === "ai" && msg.content?.trim().toLowerCase() === question.question?.trim().toLowerCase()
    );
    if (qIndex !== -1 && qIndex + 1 < transcriptList.length) {
      const nextMsg = transcriptList[qIndex + 1];
      if (nextMsg.role === "user") {
        userResponse = nextMsg.content;
      }
    } else {
      const qIndexSub = transcriptList.findIndex(
        (msg: any) => msg.role === "ai" && (msg.content?.toLowerCase().includes(question.question?.toLowerCase().slice(0, 30)) || question.question?.toLowerCase().includes(msg.content?.toLowerCase().slice(0, 30)))
      );
      if (qIndexSub !== -1 && qIndexSub + 1 < transcriptList.length) {
        const nextMsg = transcriptList[qIndexSub + 1];
        if (nextMsg.role === "user") {
          userResponse = nextMsg.content;
        }
      }
    }

    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 16px 12px; font-weight: bold; color: #64748b; font-size: 13px;">Q${index + 1}</td>
        <td style="padding: 16px 12px; font-weight: 600; color: #1e3a8a; font-size: 13px;">${escapeHtml(question.sectionTitle || "General")}</td>
        <td style="padding: 16px 12px; color: #334155; font-size: 13.5px; line-height: 1.5; font-weight: 500;">${escapeHtml(question.question || "")}</td>
        <td style="padding: 16px 12px; background: #fafafa; border-left: 3px solid #3b82f6; font-style: italic; white-space: pre-wrap; font-size: 13px; color: #475569; line-height: 1.5;">"${escapeHtml(userResponse)}"</td>
        <td style="padding: 16px 12px; font-weight: 800; color: #0f172a; font-size: 14px;">${question.score}/100</td>
        <td style="padding: 16px 12px; color: #475569; font-size: 13px; line-height: 1.5;">${escapeHtml(question.feedback || "")}</td>
      </tr>
    `;
  }).join("");

  const rawDuration = parseFloat(session.duration || "0");
  const min = Math.floor(rawDuration / 60);
  const sec = Math.floor(rawDuration % 60);
  const formattedDuration = `${min}m ${sec}s`;
  const violationsList = Array.isArray(session.violations) ? session.violations : [];
  const violationCount = violationsList.length;

  let recBadgeBg = "#10b981"; // green
  if (report.hiringRecommendation === "No Hire") {
    recBadgeBg = "#ef4444"; // red
  } else if (report.hiringRecommendation === "Leaning Hire") {
    recBadgeBg = "#f59e0b"; // amber
  }

  return `
    <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; color: #1e293b; background: #f8fafc; padding: 32px 16px; min-height: 100vh; line-height: 1.5;">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
      </style>
      <div style="max-width: 1080px; margin: 0 auto; background: white; border-radius: 24px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -4px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden;">
        
        <!-- Premium Branding Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 32px; background: #ffffff; border-bottom: 1px solid #f1f5f9;">
          <img src="https://valuemomentum.com/wp-content/uploads/2026/03/ValueMomentum_logo.svg" style="height: 32px; width: auto;" alt="ValueMomentum Logo" />
          <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: #94a3b8; background: #f8fafc; padding: 6px 12px; border-radius: 8px; border: 1px solid #f1f5f9;">Aura AI Assessment Report</span>
        </div>

        <!-- Banner Block -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white; padding: 40px 32px; position: relative;">
          <div style="display: flex; flex-direction: column; justify-content: space-between; gap: 24px; align-items: flex-start;">
            <div style="flex: 1; width: 100%;">
              <div style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.75; font-weight: 700;">Aura AI Assessment</div>
              <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 16px; margin-top: 8px;">
                <h1 style="margin: 0; font-size: 32px; font-weight: 800; tracking-tight; line-height: 1.2;">${escapeHtml(session.role || "Software Engineer")}</h1>
                <div style="background: rgba(255,255,255,0.07); backdrop-filter: blur(10px); border-radius: 16px; padding: 12px 20px; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: right; min-width: 140px;">
                  <div style="font-size: 10px; opacity: 0.75; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 2px;">L1 Score</div>
                  <div style="font-size: 28px; font-weight: 850; font-family: monospace;">${report.overallScore}<span style="font-size: 16px; font-weight: 500; opacity: 0.7;">%</span></div>
                </div>
              </div>
              <p style="margin: 12px 0 0 0; max-width: 680px; line-height: 1.6; opacity: 0.9; font-size: 14.5px; font-weight: 400;">${escapeHtml(report.summary || "")}</p>
            </div>
          </div>
        </div>

        <div style="padding: 32px;">

          <!-- Session Metadata Cards -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px;">
            <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 16px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8;">Candidate Name</div>
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(session.candidateName || "Candidate")}</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 16px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8;">Session ID</div>
              <div style="font-size: 13.5px; font-weight: 700; color: #056bfc; margin-top: 4px; font-family: monospace;">${id}</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 16px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8;">Interview Level</div>
              <div style="font-size: 14.5px; font-weight: 700; color: #0f172a; margin-top: 4px; text-transform: capitalize;">${escapeHtml(session.difficulty || "medium")}</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 16px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8;">Duration</div>
              <div style="font-size: 14.5px; font-weight: 700; color: #0f172a; margin-top: 4px;">${formattedDuration}</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 16px; ${violationCount > 0 ? 'border-color: #fca5a5; background: #fff5f5;' : ''}">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${violationCount > 0 ? '#ef4444' : '#94a3b8'};">Proctoring Flags</div>
              <div style="font-size: 14.5px; font-weight: 700; color: ${violationCount > 0 ? '#ef4444' : '#0f172a'}; margin-top: 4px;">${violationCount} Alerts</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 16px; ${session.suspicionScore > 50 ? 'border-color: #fde047; background: #fefce8;' : ''}">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${session.suspicionScore > 50 ? '#ca8a04' : '#94a3b8'};">Suspicion Index</div>
              <div style="font-size: 14.5px; font-weight: 700; color: ${session.suspicionScore > 50 ? '#ca8a04' : '#0f172a'}; margin-top: 4px;">${session.suspicionScore || 0}%</div>
            </div>
          </div>

          <!-- Summary Highlights (Strengths vs Areas to Watch) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
            <section style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 8px; height: 16px; background-color: #10b981; border-radius: 4px;"></span>
                Top Strengths
              </h2>
              <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 14px; line-height: 1.6;">${(report.strengths || []).map((item: string) => `<li style="margin-bottom: 10px;">${escapeHtml(item)}</li>`).join("")}</ul>
            </section>
            <section style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 8px; height: 16px; background-color: #ef4444; border-radius: 4px;"></span>
                Areas to Watch
              </h2>
              <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 14px; line-height: 1.6;">${(report.weaknesses || []).map((item: string) => `<li style="margin-bottom: 10px;">${escapeHtml(item)}</li>`).join("")}</ul>
            </section>
          </div>

          <!-- Section Feedback Blocks -->
          <div style="margin-bottom: 32px;">
            ${sectionBlocks}
          </div>

          <!-- Detailed Commentary -->
          <section style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 24px; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
            <h2 style="margin: 0 0 18px 0; font-size: 18px; font-weight: 800; color: #0f172a;">Detailed Commentary</h2>
            <div style="display: flex; flex-direction: column; gap: 16px;">
              <div style="background: #f8fafc; padding: 18px; border-radius: 14px; border: 1px solid #f1f5f9;">
                <strong style="color: #1e3a8a; font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Behavioral Feedback</strong>
                <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6;">${escapeHtml(report.behavioralFeedback || "")}</p>
              </div>
              <div style="background: #f8fafc; padding: 18px; border-radius: 14px; border: 1px solid #f1f5f9;">
                <strong style="color: #1e3a8a; font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Technical Feedback</strong>
                <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6;">${escapeHtml(report.technicalFeedback || "")}</p>
              </div>
            </div>
          </section>

          <!-- Question-by-Question Breakdown -->
          <section style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); overflow: hidden;">
            <h2 style="margin: 0 0 18px 0; font-size: 18px; font-weight: 800; color: #0f172a;">Question-by-Question Breakdown</h2>
            <div style="overflow-x: auto; margin: 0 -24px -24px -24px;">
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                  <tr style="background: #eff6ff; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #dbeafe;">
                    <th style="padding: 14px 12px; font-weight: 800; color: #1e3a8a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; width: 45px;">#</th>
                    <th style="padding: 14px 12px; font-weight: 800; color: #1e3a8a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; width: 100px;">Section</th>
                    <th style="padding: 14px 12px; font-weight: 800; color: #1e3a8a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; width: 220px;">Question</th>
                    <th style="padding: 14px 12px; font-weight: 800; color: #1e3a8a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; width: 280px;">Candidate Answer</th>
                    <th style="padding: 14px 12px; font-weight: 800; color: #1e3a8a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; width: 85px;">Score</th>
                    <th style="padding: 14px 12px; font-weight: 800; color: #1e3a8a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  ${questionFeedbackRows}
                </tbody>
              </table>
            </div>
          </section>

        </div>

        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; letter-spacing: 0.05em;">
          ValueMomentum Mock Interview Platform &bull; Evaluation Powered by Aura AI Engine
        </div>

      </div>
    </div>
  `;
}

export async function uploadRecordingChunk(formData: FormData) {
  const interviewId = formData.get("interviewId") as string;
  const candidateIdFromForm = String(formData.get("candidateId") || "").trim();
  const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
  const chunkFile = formData.get("chunk") as File | null;
  
  if (!chunkFile) return { success: false, error: "No chunk file" };

  const sasUrl = process.env.AZURE_STORAGE_SAS_URL;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!sasUrl && !connectionString) {
      if (process.env.NODE_ENV === "production") {
        return { success: false, error: "Azure Storage is not configured for recording upload." };
      }
      console.log(`[Mock Azure Upload] Received chunk ${chunkIndex} for ${interviewId}, size: ${chunkFile.size} bytes`);
      return { success: true };
  }

  try {
      const { BlobServiceClient, ContainerClient } = await import("@azure/storage-blob");
      let containerClient;

      if (sasUrl) {
        containerClient = new ContainerClient(sasUrl);
      } else {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString!);
        containerClient = blobServiceClient.getContainerClient("interview-artifacts");
        await containerClient.createIfNotExists();
      }

      const ownerFolder = getArtifactOwnerFolder(candidateIdFromForm || await getCandidateIdForInterview(interviewId) || interviewId);
      const blobName = `${ownerFolder}/${interviewId}/recording.webm`;
      const appendBlobClient = containerClient.getAppendBlobClient(blobName);
      
      try {
        await appendBlobClient.createIfNotExists();
      } catch(e) {
        console.warn("Append Blob creation check:", e);
      }

      const buffer = Buffer.from(await chunkFile.arrayBuffer());
      await appendBlobClient.appendBlock(buffer, buffer.length);
      
      return { success: true };
  } catch (error) {
      console.error("Error uploading chunk to azure:", error);
      return { success: false, error: String(error) };
  }
}

export async function uploadViolationScreenshot(formData: FormData) {
  const interviewId = formData.get("interviewId") as string;
  const candidateIdFromForm = String(formData.get("candidateId") || "").trim();
  const timestamp = (formData.get("timestamp") as string) || String(Date.now());
  const imageFile = formData.get("image") as File | null;

  if (!imageFile) return { success: false, error: "No image file" };

  const sasUrl = process.env.AZURE_STORAGE_SAS_URL;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const ownerFolder = getArtifactOwnerFolder(candidateIdFromForm || await getCandidateIdForInterview(interviewId) || interviewId);
  const blobName = `${ownerFolder}/${interviewId}/violations/violation_${timestamp}.png`;

  if (!sasUrl && !connectionString) {
    console.log(`[Mock Azure Violation Upload] Received violation for ${interviewId} at ${timestamp}, size: ${imageFile.size}`);
    const mockUrl = `/mock/violations/${blobName}`;
    try {
      const event = [{ timestamp, type: "proctoring_violation", imageUrl: mockUrl }];
      await db.query("UPDATE sessions SET violations = COALESCE(violations, '[]'::jsonb) || $1::jsonb WHERE id = $2", [JSON.stringify(event), interviewId]);
    } catch (e) {
      console.error("DB Error saving violation (mock):", e);
    }
    return { success: true, url: mockUrl };
  }

  try {
    const { BlobServiceClient, ContainerClient } = await import("@azure/storage-blob");
    let containerClient;

    if (sasUrl) {
      containerClient = new ContainerClient(sasUrl);
    } else {
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString!);
      containerClient = blobServiceClient.getContainerClient("interview-artifacts");
      await containerClient.createIfNotExists();
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: imageFile.type || "image/png" },
    });

    const url = sasUrl ? `${sasUrl.replace(/\/$/, '')}/${blobName}` : `${(containerClient as any).url}/${blobName}`;

    const event = [{ timestamp, type: "proctoring_violation", imageUrl: url }];
    await db.query("UPDATE sessions SET violations = COALESCE(violations, '[]'::jsonb) || $1::jsonb WHERE id = $2", [JSON.stringify(event), interviewId]);

    try {
      const violationId = `violation_${Date.now()}_${Math.random().toString(36).substr(2,8)}`;
      await db.query(
        `INSERT INTO violation_events (id, session_id, event_ts, event_type, image_url, metadata) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5)`,
        [violationId, interviewId, 'proctoring_violation', url, JSON.stringify({ timestamp })]
      );
    } catch (e) {
      console.error('Error inserting violation_events row:', e);
    }

    return { success: true, url };
  } catch (error) {
    console.error("Error uploading violation screenshot:", error);
    return { success: false, error: String(error) };
  }
}

export async function fetchPanelCandidates(panelEmail: string) {
    try {
        const res = await db.query(
            `SELECT 
                s.id AS session_id,
                s.score AS l1_score,
                s.summary_report,
                s.reviewer_scorecard,
                s.l2_scorecard,
                s.l2_scheduled_time,
                c.id AS candidate_id,
                c.name AS candidate_name,
                c.email AS candidate_email,
                c.resume_text,
                c.l2_panel_name,
                c.l2_panel_email
             FROM sessions s
             INNER JOIN candidates c ON s.candidate_id = c.id
             WHERE LOWER(c.l2_panel_email) = LOWER($1)
               AND (s.summary_report->>'hiringRecommendation' = 'Strong Hire' 
                    OR s.summary_report->>'hiringRecommendation' = 'Hire' 
                    OR s.summary_report->>'hiringRecommendation' = 'Leaning Hire')
             ORDER BY s.date DESC`,
            [panelEmail.trim()]
        );

        return {
            success: true,
            candidates: res.rows.map((row) => ({
                sessionId: row.session_id,
                l1Score: row.l1_score,
                summaryReport: row.summary_report,
                reviewerScorecard: row.reviewer_scorecard,
                l2Scorecard: row.l2_scorecard || {},
                l2ScheduledTime: row.l2_scheduled_time ? (typeof row.l2_scheduled_time === 'string' ? row.l2_scheduled_time : row.l2_scheduled_time.toISOString()) : null,
                candidateId: row.candidate_id,
                candidateName: row.candidate_name,
                candidateEmail: row.candidate_email,
                resumeText: row.resume_text,
                l2PanelName: row.l2_panel_name,
                l2PanelEmail: row.l2_panel_email
            }))
        };
    } catch (error) {
        console.error("Error fetching panel candidates:", error);
        return { success: false, candidates: [], error: String(error) };
    }
}

export async function saveL2ScorecardAction(input: { sessionId: string; scorecard: any }) {
    try {
        await db.query(
            "UPDATE sessions SET l2_scorecard = $1 WHERE id = $2",
            [JSON.stringify(input.scorecard), input.sessionId]
        );
        return { success: true };
    } catch (error) {
        console.error("Error saving L2 scorecard:", error);
        return { success: false, error: String(error) };
    }
}

export async function scheduleL2InterviewAction(input: { sessionId: string; scheduledTime: string; panelEmail?: string; panelName?: string }) {
    try {
        if (input.panelEmail && input.panelName) {
            await db.query(
                `UPDATE candidates SET l2_panel_email = $1, l2_panel_name = $2 
                 WHERE id = (SELECT candidate_id FROM sessions WHERE id = $3)`,
                [input.panelEmail, input.panelName, input.sessionId]
            );
        }
        await db.query(
            "UPDATE sessions SET l2_scheduled_time = $1 WHERE id = $2",
            [input.scheduledTime, input.sessionId]
        );
        return { success: true };
    } catch (error) {
        console.error("Error scheduling L2 interview:", error);
        return { success: false, error: String(error) };
    }
}

export async function generatePanelL2QuestionsAction(candidateId: string) {
    try {
        const res = await db.query("SELECT name, role, resume_text FROM candidates WHERE id = $1", [candidateId]);
        const candidate = res.rows[0];
        if (!candidate) return { success: false, error: "Candidate not found." };

        const resume = compactDocumentText(candidate.resume_text || "");
        if (!resume) {
            return {
                success: true,
                questions: [
                    "Walk me through the architecture of a complex project you designed.",
                    "What was the hardest technical decision you made on your last project, and what trade-offs did you face?",
                    "How do you handle scalability and concurrent requests in production environments?"
                ]
            };
        }

        const promptText = `You are a Senior Principal Interviewer conducting an L2 Technical Assessment for the role of ${candidate.role || "Software Engineer"}.
Based on the candidate's resume text below, extract their primary projects and generate exactly 3 deep-dive, project-specific technical questions that an L2 panel member should ask to evaluate their engineering depth, architectural decisions, and trade-offs.

CANDIDATE NAME: ${candidate.name}
CANDIDATE RESUME TEXT:
${resume}

INSTRUCTIONS:
1. Generate exactly 3 technical questions targeting their specific projects.
2. Focus on architecture, scale, failure modes, database choice, or engineering decisions they made.
3. Keep the questions direct and professional.
4. Output them as a JSON list.

Return JSON in this shape: { "questions": ["Question 1...", "Question 2...", "Question 3..."] }
`;

        try {
            const preferAzure = process.env.AI_PRIMARY_PROVIDER?.toLowerCase() === 'azure';
            if (preferAzure && isAzureOpenAIConfigured()) {
                const response = await generateAzureOpenAIJson<{ questions: string[] }>({
                    system: "You are an expert technical interviewer.",
                    user: promptText,
                    temperature: 0.75,
                });
                if (response && Array.isArray(response.questions)) {
                    return { success: true, questions: response.questions };
                }
            }

            const geminiResponse = await ai.generate({
                prompt: promptText,
                config: {
                    temperature: 0.75,
                }
            });

            let questions = [];
            try {
                // Try JSON parsing
                let jsonStr = geminiResponse.text;
                const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) jsonStr = jsonMatch[0];
                const parsed = JSON.parse(jsonStr);
                questions = parsed.questions || [];
            } catch {
                questions = geminiResponse.text
                    .split(/\n+/)
                    .map((q) => q.replace(/^\d+\.\s*|^- \s*/, "").trim())
                    .filter(Boolean)
                    .slice(0, 3);
            }

            if (!questions.length) {
                throw new Error("No questions extracted.");
            }

            return { success: true, questions };
        } catch (aiError) {
            console.error("AI questions extraction failed, falling back to static questions:", aiError);
            const projects = extractResumeProjectsFromText(resume, 1);
            const resumeQuestions = projects.length
                ? buildResumeProjectQuestionPrompts(projects, candidate.role || "Software Engineer", 3)
                : [
                    "Walk me through the architecture of a complex project you designed.",
                    "What was the hardest technical decision you made on your last project, and what trade-offs did you face?",
                    "How do you handle scalability and concurrent requests in production environments?"
                ];
            return { success: true, questions: resumeQuestions.map(q => q.replace(/^\[resume_projects\]\s*/i, "")) };
        }
    } catch (error) {
        console.error("Error generating panel L2 questions:", error);
        return { success: false, error: String(error) };
    }
}


