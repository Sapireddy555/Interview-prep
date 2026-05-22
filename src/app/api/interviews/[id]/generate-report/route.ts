import { NextResponse } from "next/server";
import { runInterviewReportGeneration } from "@/app/actions";

export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Interview ID is required." }, { status: 400 });
  }

  const result = await runInterviewReportGeneration(id);
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
