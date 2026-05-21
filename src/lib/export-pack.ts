import JSZip from "jszip";
import { computeSuspicionScoreFromEvents } from "@/lib/suspicion-scoring";
import type { SecurityEvent } from "@/lib/types";

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function buildRecordingUrl(candidateId: string | null, interviewId: string) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const sasUrl = process.env.AZURE_STORAGE_SAS_URL;
  if (!connectionString && !sasUrl) return null;

  const ownerFolder = candidateId || "anonymous";
  if (sasUrl) {
    const base = sasUrl.split("?")[0];
    const query = sasUrl.includes("?") ? `?${sasUrl.split("?")[1]}` : "";
    return `${base.replace(/\/$/, "")}/interview-artifacts/${ownerFolder}/${interviewId}/recording.webm${query}`;
  }

  return `azure://interview-artifacts/${ownerFolder}/${interviewId}/recording.webm`;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export async function buildInterviewExportPack(sessionRow: any, violationRows: any[]) {
  const zip = new JSZip();
  const transcript = parseJsonField(sessionRow.transcript, []);
  const violations = parseJsonField(sessionRow.violations, []);
  const securityEvents = parseJsonField<SecurityEvent[]>(sessionRow.security_events, []);
  const reviewerScorecard = parseJsonField(sessionRow.reviewer_scorecard, null);
  const summaryReport = parseJsonField<any>(sessionRow.summary_report, null);
  const suspicionScore = Math.max(
    Number(sessionRow.suspicion_score || 0),
    computeSuspicionScoreFromEvents(securityEvents)
  );

  const recordingUrl = buildRecordingUrl(sessionRow.candidate_id ?? null, sessionRow.id);

  const manifest = {
    interviewId: sessionRow.id,
    candidateId: sessionRow.candidate_id ?? null,
    role: sessionRow.role,
    date: sessionRow.date,
    duration: sessionRow.duration,
    score: sessionRow.score,
    suspicionScore,
    recordingUrl,
    violationCount: violations.length,
    securityEventCount: securityEvents.length,
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("transcript.json", JSON.stringify(transcript, null, 2));
  zip.file("violations.json", JSON.stringify(violations, null, 2));
  zip.file("security-events.json", JSON.stringify(securityEvents, null, 2));
  zip.file("reviewer-scorecard.json", JSON.stringify(reviewerScorecard, null, 2));
  zip.file("summary-report.json", JSON.stringify(summaryReport, null, 2));

  if (summaryReport?.htmlReport) {
    zip.file("summary-report.html", summaryReport.htmlReport);
  }

  if (recordingUrl) {
    zip.file("recording-link.txt", recordingUrl);
  }

  const evidenceFolder = zip.folder("violation-screenshots");
  for (const [index, event] of violationRows.entries()) {
    if (!event.image_url || !evidenceFolder) continue;
    const imageBuffer = await fetchImageBuffer(event.image_url);
    if (!imageBuffer) {
      evidenceFolder.file(`event-${index + 1}-link.txt`, event.image_url);
      continue;
    }
    evidenceFolder.file(`event-${index + 1}.png`, imageBuffer);
  }

  const markdown = [
    `# Interview Export Pack`,
    ``,
    `**Interview ID:** ${sessionRow.id}`,
    `**Role:** ${sessionRow.role}`,
    `**Suspicion Score:** ${suspicionScore}/100`,
    `**Recording:** ${recordingUrl ?? "Not configured"}`,
    ``,
    `## Proctoring Warnings`,
    ...violations.map((v: any) => `- [${v.timestamp}] ${v.message}`),
    ``,
    `## Security Events`,
    ...securityEvents.map((e) => `- [${e.timestamp}] ${e.type}${e.details ? ` (${e.details})` : ""}`),
    ``,
    `## Transcript`,
    ...transcript.map((m: any) => `**${String(m.role).toUpperCase()}:** ${m.content}`),
  ].join("\n");

  zip.file("interview-pack.md", markdown);

  const content = await zip.generateAsync({ type: "nodebuffer" });
  return { content, filename: `interview_pack_${sessionRow.id}.zip` };
}
