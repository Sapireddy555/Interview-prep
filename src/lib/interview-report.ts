import { db } from "@/lib/db";

export type ReportStatus = "pending" | "generating" | "complete" | "failed";

function parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : fallback;
    } catch {
      return fallback;
    }
  }
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export async function claimReportGeneration(interviewId: string): Promise<boolean> {
  const res = await db.query(
    `UPDATE sessions
     SET report_status = 'generating', report_error = NULL
     WHERE id = $1
       AND (report_status IS NULL OR report_status IN ('pending', 'failed'))
     RETURNING id`,
    [interviewId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function setReportStatus(interviewId: string, status: ReportStatus, error?: string | null) {
  await db.query(
    `UPDATE sessions SET report_status = $1, report_error = $2 WHERE id = $3`,
    [status, error ?? null, interviewId]
  );
}

type TranscriptMessage = {
  role: "user" | "ai";
  content: string;
  sectionId?: "communication" | "technical" | "resume_projects";
  sectionTitle?: string;
};

function normalizeSectionId(value?: string): TranscriptMessage["sectionId"] {
  if (value === "communication" || value === "technical" || value === "resume_projects") {
    return value;
  }
  return undefined;
}

export function normalizeTranscriptForAnalysis(transcript: unknown): TranscriptMessage[] {
  return parseJsonArray<{ role: "user" | "ai"; content: string; sectionId?: string; sectionTitle?: string }>(
    transcript,
    []
  ).map((message) => ({
    role: message.role,
    content: message.content,
    sectionId: normalizeSectionId(message.sectionId),
    sectionTitle: message.sectionTitle,
  }));
}
