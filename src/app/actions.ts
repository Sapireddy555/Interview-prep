"use server";

import { verifyAadharWithADI } from "@/lib/azure-id-verify";
import { extractTextWithADI } from "@/lib/azure-id-verify";
import { analyzeFrameWithAzure } from "@/lib/azure-vision-proctor";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getInterviewQuestionSetForRole, getQuestionListForRole, getTechnicalQuestionPool } from "@/lib/interview-constants";
import type { InterviewQuestion } from "@/lib/interview-constants";
import type { ReviewerScorecard } from "@/lib/types";

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

export async function createInterviewSession(
  session: Omit<InterviewSession, 'id' | 'date' | 'feedback' | 'transcript' | 'summaryReport' | 'violations'> & { id?: string }
) {
    const localId = `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('Creating interview session with ID:', localId);
    
    try {
        await db.query(
            `INSERT INTO sessions (id, candidate_id, role, duration) 
             VALUES ($1, $2, $3, $4)`,
            [localId, session.id || null, session.role, session.duration || '0']
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
                JSON.stringify(session.securityEvents || []),
                session.suspicionScore || 0,
                id
            ]
        );
        return { success: true, id };
    } catch (error) {
        console.error("DB Error saving session:", error);
        return { success: false, error: String(error) };
    }
}

export async function fetchInterviewSessions() {
    const res = await db.query("SELECT * FROM sessions ORDER BY date DESC");
    return res.rows.map(normalizeSessionRow);
}

export async function fetchInterviewSession(id: string) {
    const res = await db.query("SELECT * FROM sessions WHERE id = $1", [id]);
    const row = res.rows[0];
    return row ? normalizeSessionRow(row) : null;
}

export async function getCandidate(id: string) {
    const res = await db.query("SELECT * FROM candidates WHERE id = $1", [id]);
    return res.rows[0] || null;
}

export async function fetchInterviewQuestionBank(interviewId: string) {
    try {
        const res = await db.query(
            `SELECT c.question_bank
             FROM sessions s
             LEFT JOIN candidates c ON c.id = s.candidate_id
             WHERE s.id = $1`,
            [interviewId]
        );

        return { success: true, questionBank: res.rows[0]?.question_bank || "" };
    } catch (error) {
        console.error("Error loading interview question bank:", error);
        return { success: false, questionBank: "", error: String(error) };
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

        return {
            success: true,
            candidate: {
                id: candidate.id,
                name: candidate.name,
                email: candidate.email,
                role: candidate.role,
                difficulty: candidate.difficulty,
            },
        };
    } catch (error) {
        console.error("Error validating candidate ID:", error);
        return { success: false, error: String(error) };
    }
}

export async function registerCandidateAction(formData: FormData) {
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const role = String(formData.get("role") || "Generative AI Engineer").trim();
    const difficulty = String(formData.get("difficulty") || "medium").trim();
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
        const questionBank = buildCandidateQuestionBank(role, resumeText, jobDescriptionText);

        await db.query(
            `INSERT INTO candidates (
                id, name, email, role, difficulty, resume_url, resume_file_name,
                job_description_url, job_description_file_name, resume_text, job_description_text, question_bank
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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

function buildJobDescriptionQuestionBank(role: string, _jobDescriptionText: string) {
    const technicalQuestions = getTechnicalQuestionPool(role)
        .slice(0, 5)
        .map((question) => `[technical] ${question}`);

    return ["[no_resume_projects]", ...technicalQuestions].join("\n");
}

function buildCandidateQuestionBank(role: string, resumeText: string, jobDescriptionText: string) {
    const resume = compactDocumentText(resumeText);
    const jd = compactDocumentText(jobDescriptionText);

    const technicalQuestions = getTechnicalQuestionPool(role)
        .slice(0, 5)
        .map((question) => `[technical] ${question}`);

    const resumeQuestions = resume || jd
        ? [
            `[resume_projects] Choose the project from your resume that is most relevant to this ${role} role. Walk me through the architecture, your responsibilities, and the technical outcome.`,
            `[resume_projects] From one of your resume projects, explain the toughest technical problem you personally solved, including the constraints and trade-offs.`,
            `[resume_projects] Pick a resume project where quality, scale, performance, or reliability mattered. What technical decisions did you make, and what would you improve now?`,
        ]
        : [];

    return [...technicalQuestions, ...resumeQuestions].join("\n");
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

export async function generateAndSaveSummaryReport(interviewId: string) {
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

    const report = await analyzeFullInterview({
      role: session.role,
      transcript: (session.transcript || []).map((m: any) => ({
        role: m.role as 'user' | 'ai',
        content: m.content,
        sectionId: m.sectionId,
        sectionTitle: m.sectionTitle,
      })),
    });

    report.htmlReport = formatReportToHtml(interviewId, report, session);

    await db.query(
        "UPDATE sessions SET summary_report = $1, score = $2 WHERE id = $3",
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
    console.error("Error generating or saving summary report:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return { success: false, error: errorMessage };
  }
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
    reviewerScorecard: row.reviewer_scorecard ?? null,
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
            containerClient = blobServiceClient.getContainerClient("interview-reports");
            await containerClient.createIfNotExists();
        }

        const reportContent = Buffer.from(report.htmlReport || formatReportToHtml(interviewId, report, session), "utf8");
        const blockBlobClient = containerClient.getBlockBlobClient(`report_${interviewId}.html`);
        
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

        return { url: blockBlobClient.url };
    } catch (error) {
        console.error("Failed to upload %s to Azure:", documentType, error);
        throw new Error(`Failed to upload ${documentType} PDF to Azure Storage.`);
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
                "1. Open the interview link in a quiet room with a stable internet connection.",
                "2. Enter your unique ID exactly as shown above.",
                "3. Keep your Aadhar ID ready for verification.",
                "4. Allow camera and microphone access when prompted.",
                "5. Do not use additional devices, screens, notes, or external assistance.",
                "6. The interview will be recorded and reviewed by the ValueMomentum hiring team.",
                "",
                "Regards,",
                "ValueMomentum Talent Acquisition",
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
                    <ol>
                        <li>Open the interview link in a quiet room with a stable internet connection.</li>
                        <li>Enter your unique ID exactly as shown above.</li>
                        <li>Keep your Aadhar ID ready for verification.</li>
                        <li>Allow camera and microphone access when prompted.</li>
                        <li>Do not use additional devices, screens, notes, or external assistance.</li>
                        <li>The interview will be recorded and reviewed by the ValueMomentum hiring team.</li>
                    </ol>
                    <p>Regards,<br/><strong>ValueMomentum Talent Acquisition</strong></p>
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
          <h2 style="margin: 0; color: ${colors.heading}; font-size: 22px;">${escapeHtml(section.sectionTitle)}</h2>
          <span style="background: ${colors.accent}; color: white; padding: 8px 14px; border-radius: 999px; font-weight: 700;">${section.score}/100</span>
        </div>
        <p style="margin: 0 0 16px 0; color: #334155; line-height: 1.6;">${escapeHtml(section.summary || "")}</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div style="background: white; border-radius: 16px; padding: 16px;">
            <h3 style="margin: 0 0 10px 0; color: ${colors.heading}; font-size: 15px;">Strengths</h3>
            <ul style="margin: 0; padding-left: 18px; color: #334155;">${strengths || '<li>Not specified</li>'}</ul>
          </div>
          <div style="background: white; border-radius: 16px; padding: 16px;">
            <h3 style="margin: 0 0 10px 0; color: ${colors.heading}; font-size: 15px;">Improvement Areas</h3>
            <ul style="margin: 0; padding-left: 18px; color: #334155;">${improvements || '<li>Not specified</li>'}</ul>
          </div>
        </div>
        <div style="margin-top: 16px; background: rgba(255,255,255,0.75); border-radius: 16px; padding: 16px;">
          <h3 style="margin: 0 0 10px 0; color: ${colors.heading}; font-size: 15px;">Questions Covered</h3>
          <ul style="margin: 0; padding-left: 18px; color: #475569;">${renderQuestionListItems(questionSet, section.sectionTitle)}</ul>
        </div>
      </section>
    `;
  }).join("");

  const questionFeedbackRows = (report.questionFeedback || []).map((question: any, index: number) => `
    <tr>
      <td style="padding: 12px; border-top: 1px solid #e2e8f0;">Q${index + 1}</td>
      <td style="padding: 12px; border-top: 1px solid #e2e8f0;">${escapeHtml(question.sectionTitle || "General")}</td>
      <td style="padding: 12px; border-top: 1px solid #e2e8f0;">${escapeHtml(question.question || "")}</td>
      <td style="padding: 12px; border-top: 1px solid #e2e8f0; font-weight: 700;">${question.score}/100</td>
      <td style="padding: 12px; border-top: 1px solid #e2e8f0;">${escapeHtml(question.feedback || "")}</td>
    </tr>
  `).join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; padding: 24px;">
      <div style="max-width: 1120px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0f172a, #1d4ed8); color: white; border-radius: 24px; padding: 28px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; gap: 20px; align-items: start;">
            <div>
              <div style="font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.8;">Interview Assessment Report</div>
              <h1 style="margin: 8px 0 6px 0; font-size: 32px;">${escapeHtml(session.role || "Interview")}</h1>
              <p style="margin: 0; max-width: 720px; line-height: 1.7; opacity: 0.92;">${escapeHtml(report.summary || "")}</p>
            </div>
            <div style="min-width: 210px; background: rgba(255,255,255,0.12); border-radius: 20px; padding: 18px;">
              <div style="font-size: 12px; opacity: 0.8; text-transform: uppercase;">Overall Score</div>
              <div style="font-size: 40px; font-weight: 800; margin: 6px 0 12px 0;">${report.overallScore}/100</div>
              <div style="font-size: 12px; opacity: 0.8; text-transform: uppercase;">Recommendation</div>
              <div style="font-size: 18px; font-weight: 700; margin-top: 6px;">${escapeHtml(report.hiringRecommendation || "")}</div>
            </div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
          <section style="background: white; border-radius: 20px; padding: 22px; box-shadow: 0 8px 30px rgba(15,23,42,0.06);">
            <h2 style="margin: 0 0 14px 0; font-size: 20px;">Top Strengths</h2>
            <ul style="margin: 0; padding-left: 18px; color: #334155;">${(report.strengths || []).map((item: string) => `<li style="margin-bottom: 8px;">${escapeHtml(item)}</li>`).join("")}</ul>
          </section>
          <section style="background: white; border-radius: 20px; padding: 22px; box-shadow: 0 8px 30px rgba(15,23,42,0.06);">
            <h2 style="margin: 0 0 14px 0; font-size: 20px;">Areas to Watch</h2>
            <ul style="margin: 0; padding-left: 18px; color: #334155;">${(report.weaknesses || []).map((item: string) => `<li style="margin-bottom: 8px;">${escapeHtml(item)}</li>`).join("")}</ul>
          </section>
        </div>
        ${sectionBlocks}
        <section style="background: white; border-radius: 20px; padding: 22px; margin-bottom: 24px; box-shadow: 0 8px 30px rgba(15,23,42,0.06);">
          <h2 style="margin: 0 0 12px 0; font-size: 20px;">Detailed Commentary</h2>
          <p style="margin: 0 0 16px 0; color: #334155;"><strong>Behavioral:</strong> ${escapeHtml(report.behavioralFeedback || "")}</p>
          <p style="margin: 0; color: #334155;"><strong>Technical:</strong> ${escapeHtml(report.technicalFeedback || "")}</p>
        </section>
        <section style="background: white; border-radius: 20px; padding: 22px; box-shadow: 0 8px 30px rgba(15,23,42,0.06);">
          <h2 style="margin: 0 0 12px 0; font-size: 20px;">Question-by-Question Breakdown</h2>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; color: #334155;">
              <thead>
                <tr style="background: #eff6ff; color: #1e3a8a;">
                  <th style="text-align: left; padding: 12px;">#</th>
                  <th style="text-align: left; padding: 12px;">Section</th>
                  <th style="text-align: left; padding: 12px;">Question</th>
                  <th style="text-align: left; padding: 12px;">Score</th>
                  <th style="text-align: left; padding: 12px;">Feedback</th>
                </tr>
              </thead>
              <tbody>
                ${questionFeedbackRows}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;
}

export async function validateAadharAction(input: { imageUri: string }) {
  try {
    const result = await verifyAadharWithADI(input.imageUri);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error validating aadhar:", error);
    return { success: false, error: String(error) };
  }
}

export async function uploadRecordingChunk(formData: FormData) {
  const interviewId = formData.get("interviewId") as string;
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
        containerClient = blobServiceClient.getContainerClient("interview-recordings");
        await containerClient.createIfNotExists();
      }

      const blobName = `${interviewId}.webm`;
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
  const timestamp = (formData.get("timestamp") as string) || String(Date.now());
  const imageFile = formData.get("image") as File | null;

  if (!imageFile) return { success: false, error: "No image file" };

  const sasUrl = process.env.AZURE_STORAGE_SAS_URL;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const blobName = `violation_${interviewId}_${timestamp}.png`;

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
      containerClient = blobServiceClient.getContainerClient("interview-violations");
      await containerClient.createIfNotExists();
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: imageFile.type || "image/png" },
    });

    const url = sasUrl ? `${sasUrl.replace(/\/$/, '')}/${blobName}` : `${containerClient.url}/${blobName}`;

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
