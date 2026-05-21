import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildInterviewExportPack } from "@/lib/export-pack";

function toMarkdown(session: any): string {
  const report = session.summary_report;
  const lines: string[] = [];

  lines.push(`# Interview Packet: ${session.role}`);
  lines.push(`**Interview ID:** ${session.id}`);
  lines.push(`**Date:** ${new Date(session.date).toLocaleString()}`);
  lines.push(`**Duration:** ${session.duration ?? "0"} minutes`);
  if (typeof session.suspicion_score === "number") lines.push(`**Suspicion Score:** ${session.suspicion_score}/100`);
  lines.push("");

  if (report) {
    lines.push(`## Overall`);
    lines.push(`**Overall Score:** ${report.overallScore}/100`);
    lines.push(`**Recommendation:** ${report.hiringRecommendation}`);
    lines.push("");
    lines.push(`## Executive Summary`);
    lines.push(report.summary);
    lines.push("");

    lines.push(`## Strengths`);
    (report.strengths ?? []).forEach((s: string) => lines.push(`- ${s}`));
    lines.push("");

    lines.push(`## Areas for Improvement`);
    (report.weaknesses ?? []).forEach((w: string) => lines.push(`- ${w}`));
    lines.push("");

    if (report.rubric?.competencies?.length) {
      lines.push(`## Rubric`);
      report.rubric.competencies.forEach((c: any) => {
        lines.push(`### ${c.name}: ${c.score}/100`);
        (c.evidence ?? []).forEach((e: any) => lines.push(`- "${e.quote}" (${e.speaker}) — ${e.whyItMatters}`));
        lines.push("");
      });
      if (report.rubric.overallNotes) {
        lines.push(`### Notes`);
        lines.push(report.rubric.overallNotes);
        lines.push("");
      }
    }

    lines.push(`## Technical Assessment`);
    lines.push(report.technicalFeedback ?? "");
    lines.push("");
    lines.push(`## Behavioral Assessment`);
    lines.push(report.behavioralFeedback ?? "");
    lines.push("");

    if (report.questionFeedback?.length) {
      lines.push(`## Question-by-Question`);
      report.questionFeedback.forEach((q: any, i: number) => {
        lines.push(`### Q${i + 1}: ${q.question}`);
        lines.push(`**Score:** ${q.score}/100`);
        lines.push(q.feedback);
        if (q.evidence?.length) {
          q.evidence.forEach((e: any) => lines.push(`- "${e.quote}" (${e.speaker})`));
        }
        lines.push("");
      });
    }
  }

  if (session.security_events?.length) {
    lines.push(`## Security Events`);
    session.security_events.forEach((e: any) => lines.push(`- [${e.timestamp}] ${e.type}${e.details ? ` (${e.details})` : ""}`));
    lines.push("");
  }

  if (session.violations?.length) {
    lines.push(`## Proctoring Warnings`);
    session.violations.forEach((v: any) => lines.push(`- [${v.timestamp}] ${v.message}`));
    lines.push("");
  }

  if (session.transcript?.length) {
    lines.push(`## Transcript`);
    session.transcript.forEach((m: any) => {
      lines.push(`**${String(m.role).toUpperCase()}:** ${m.content}`);
      lines.push("");
    });
  }

  return lines.join("\n");
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const format = new URL(request.url).searchParams.get("format") || "json";

  const res = await db.query("SELECT * FROM sessions WHERE id = $1", [id]);
  const session = res.rows[0];
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (format === "md" || format === "markdown") {
    const md = toMarkdown(session);
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="review_packet_${id}.md"`,
      },
    });
  }

  if (format === "html") {
    const html = session.summary_report?.htmlReport || "<div>No HTML report available.</div>";
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="review_packet_${id}.html"`,
      },
    });
  }

  if (format === "zip") {
    const violationRes = await db.query(
      `SELECT id, session_id, event_ts, event_type, image_url, metadata
       FROM violation_events
       WHERE session_id = $1
       ORDER BY event_ts ASC`,
      [id]
    );
    const { content, filename } = await buildInterviewExportPack(session, violationRes.rows);
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const payload = {
    id: session.id,
    role: session.role,
    date: session.date,
    duration: session.duration,
    score: session.score,
    suspicionScore: session.suspicion_score ?? 0,
    report: session.summary_report ?? null,
    reviewerScorecard: session.reviewer_scorecard ?? null,
    violations: session.violations ?? [],
    securityEvents: session.security_events ?? [],
    transcript: session.transcript ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="review_packet_${id}.json"`,
    },
  });
}
