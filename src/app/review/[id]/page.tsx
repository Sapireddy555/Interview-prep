
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";

import { AppShell } from "@/components/app-shell";
import { fetchInterviewSession, fetchViolationEventsForSession, saveReviewerScorecardAction } from "@/app/actions";
import type { InterviewSession, Message, ReviewerScorecard } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { PlaceHolderImages } from "@/lib/placeholder-images";
import { getSecurityEventLabel, getSecurityRiskLevel } from "@/lib/suspicion-scoring";
import { ArrowLeft, BarChart, Clock, FileDown, ImageIcon, Loader2, Save, Shield, Star, TrendingUp, Lightbulb } from "lucide-react";

type ViolationEventRecord = {
  id: string;
  sessionId: string;
  eventTs: string;
  eventType: string;
  imageUrl: string;
  metadata: Record<string, unknown>;
};

function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-1/3 bg-muted rounded-md" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-24 bg-muted rounded-lg" />
        <div className="h-24 bg-muted rounded-lg" />
        <div className="h-24 bg-muted rounded-lg" />
      </div>
      <div className="space-y-4">
        <div className="h-6 w-1/4 bg-muted rounded-md" />
        <div className="h-20 w-full bg-muted rounded-lg" />
      </div>
      <div className="space-y-4">
        <div className="h-6 w-1/4 bg-muted rounded-md" />
        <div className="h-20 w-full bg-muted rounded-lg" />
      </div>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scorecard, setScorecard] = useState<ReviewerScorecard | null>(null);
  const [violationEvents, setViolationEvents] = useState<ViolationEventRecord[]>([]);

  useEffect(() => {
    if (!id) return;
    const loadSession = async () => {
      setLoading(true);
      const [fetchedSession, violationResult] = await Promise.all([
        fetchInterviewSession(id),
        fetchViolationEventsForSession(id),
      ]);
      if (fetchedSession) {
        setSession(fetchedSession);
        const reportCompetencies = fetchedSession.summaryReport?.rubric?.competencies ?? [];
        setScorecard(
          fetchedSession.reviewerScorecard ?? {
            competencies: reportCompetencies.map((c) => ({ name: c.name, score: c.score })),
            overallNotes: "",
            recommendation: fetchedSession.summaryReport?.hiringRecommendation,
          }
        );
      }
      if (violationResult.success) {
        setViolationEvents(violationResult.events);
      }
      setLoading(false);
    };
    loadSession();
  }, [id]);

  const aiAvatar = PlaceHolderImages.find((img) => img.id === "ai-avatar");
  const userAvatar = PlaceHolderImages.find((img) => img.id === "user-avatar");

  const userMessagesWithFeedback = session?.transcript
    .filter((m) => m.role === "user")
    .map((message, index) => ({ ...message, feedback: session?.feedback?.[index] ?? null }));

  const feedbackMap = new Map(userMessagesWithFeedback?.map((m) => [m.id, m.feedback]));
  const suspicionScore = session?.suspicionScore ?? 0;
  const riskLevel = getSecurityRiskLevel(suspicionScore);

  const handleSaveScorecard = async () => {
    if (!scorecard) return;
    setSaving(true);
    const res = await saveReviewerScorecardAction({ interviewId: id, scorecard });
    setSaving(false);
    if (res.success) {
      const refreshed = await fetchInterviewSession(id);
      if (refreshed) {
        setSession(refreshed);
        setScorecard(refreshed.reviewerScorecard ?? scorecard);
      }
      toast({ title: "Scorecard saved", description: "Reviewer notes and recommendation were stored." });
      return;
    }
    toast({
      title: "Could not save scorecard",
      description: res.error || "Please try again.",
      variant: "destructive",
    });
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/review">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Interview Report</h1>
            <p className="text-muted-foreground">Debrief, rubric, and reviewer scorecard.</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/review-packet/${id}?format=html`}>
                <FileDown className="h-4 w-4 mr-2" />
                Packet HTML
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/review-packet/${id}?format=json`}>
                <FileDown className="h-4 w-4 mr-2" />
                Packet JSON
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/review-packet/${id}?format=md`}>
                <FileDown className="h-4 w-4 mr-2" />
                Packet MD
              </a>
            </Button>
            <Button size="sm" asChild>
              <a href={`/api/review-packet/${id}?format=zip`}>
                <FileDown className="h-4 w-4 mr-2" />
                Export Pack (ZIP)
              </a>
            </Button>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>AI Debrief</CardTitle>
                <CardDescription>
                  {session ? `${session.role} on ${format(parseISO(session.date), "PPP")}` : "Loading..."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ReportSkeleton />
                ) : !session?.summaryReport ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                    <p className="font-semibold">Feedback report is not ready yet.</p>
                    <p className="mt-2 text-amber-800">
                      Status: {session?.reportStatus ?? "pending"}
                      {session?.reportError ? ` — ${session.reportError}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-amber-700">
                      Reports are generated in the background after the candidate finishes. Refresh this page in a minute.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                      <Card className="p-4 bg-secondary">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-0">
                          <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
                          <BarChart className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="text-2xl font-bold">{session.summaryReport.overallScore}/100</div>
                        </CardContent>
                      </Card>
                      <Card className="p-4 bg-secondary">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-0">
                          <CardTitle className="text-sm font-medium">Duration</CardTitle>
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="text-2xl font-bold">{session.duration}m</div>
                        </CardContent>
                      </Card>
                      <Card className="p-4 bg-secondary">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-0">
                          <CardTitle className="text-sm font-medium">Recommendation</CardTitle>
                          <Star className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="text-lg font-bold">{session.summaryReport.hiringRecommendation}</div>
                        </CardContent>
                      </Card>
                    </div>

                    <div>
                      <h3 className="flex items-center font-semibold mb-3 text-lg">
                        <Star className="mr-2 h-5 w-5 text-primary" />
                        Recruiter-Friendly HTML Assessment
                      </h3>
                      <div
                        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                        dangerouslySetInnerHTML={{ __html: session.summaryReport.htmlReport }}
                      />
                    </div>

                    <Separator />

                    <div>
                      <h3 className="flex items-center font-semibold mb-2 text-lg">
                        <TrendingUp className="mr-2 h-5 w-5 text-green-500" />
                        Strengths
                      </h3>
                      <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                        {session.summaryReport.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="flex items-center font-semibold mb-2 text-lg">
                        <Lightbulb className="mr-2 h-5 w-5 text-yellow-500" />
                        Areas for Improvement
                      </h3>
                      <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                        {session.summaryReport.weaknesses.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="font-semibold mb-2 text-lg">Rubric (AI)</h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {session.summaryReport.rubric.competencies.map((c, i) => (
                          <Card key={i} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold">{c.name}</div>
                              <Badge variant="secondary">{c.score}/100</Badge>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground space-y-2">
                              {(c.evidence ?? []).slice(0, 2).map((e, j) => (
                                <div key={j} className="border-l pl-3">
                                  <div className="italic">“{e.quote}”</div>
                                  <div>{e.whyItMatters}</div>
                                </div>
                              ))}
                            </div>
                          </Card>
                        ))}
                      </div>
                      {session.summaryReport.rubric.overallNotes ? (
                        <p className="mt-3 text-muted-foreground prose prose-sm max-w-none">
                          {session.summaryReport.rubric.overallNotes}
                        </p>
                      ) : null}
                    </div>

                    <Separator />

                    <div>
                      <h3 className="font-semibold mb-2 text-lg">Reviewer Scorecard</h3>
                      {!scorecard ? (
                        <div className="text-muted-foreground text-sm">Loading scorecard…</div>
                      ) : (
                        <div className="space-y-4">
                          {scorecard.competencies.map((c, idx) => (
                            <div key={idx} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium">{c.name}</div>
                                <Badge variant="outline">{c.score}/100</Badge>
                              </div>
                              <Slider
                                value={[c.score]}
                                min={0}
                                max={100}
                                step={1}
                                onValueChange={(v) => {
                                  const value = v[0] ?? 0;
                                  setScorecard((prev) => {
                                    if (!prev) return prev;
                                    const next = [...prev.competencies];
                                    next[idx] = { ...next[idx], score: value };
                                    return { ...prev, competencies: next };
                                  });
                                }}
                              />
                              <Textarea
                                value={c.notes ?? ""}
                                placeholder="Notes (optional)"
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setScorecard((prev) => {
                                    if (!prev) return prev;
                                    const next = [...prev.competencies];
                                    next[idx] = { ...next[idx], notes: value };
                                    return { ...prev, competencies: next };
                                  });
                                }}
                              />
                            </div>
                          ))}
                          <div className="space-y-2">
                            <div className="text-sm font-medium">Recommendation</div>
                            <Select
                              value={scorecard.recommendation ?? ""}
                              onValueChange={(value) =>
                                setScorecard((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        recommendation: value as ReviewerScorecard["recommendation"],
                                      }
                                    : prev
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select recommendation" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Strong Hire">Strong Hire</SelectItem>
                                <SelectItem value="Hire">Hire</SelectItem>
                                <SelectItem value="Leaning Hire">Leaning Hire</SelectItem>
                                <SelectItem value="No Hire">No Hire</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Textarea
                            value={scorecard.overallNotes ?? ""}
                            placeholder="Overall notes"
                            onChange={(e) =>
                              setScorecard((prev) => (prev ? { ...prev, overallNotes: e.target.value } : prev))
                            }
                          />
                          <Button onClick={handleSaveScorecard} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Scorecard
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-1">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Transcript & Signals</CardTitle>
                <CardDescription>Conversation plus integrity signals.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Card className="p-4 bg-secondary">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-0">
                      <CardTitle className="text-sm font-medium">Suspicion Score</CardTitle>
                      <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="flex items-center gap-2">
                        <div className="text-2xl font-bold">{suspicionScore}/100</div>
                        <Badge variant={riskLevel === "critical" || riskLevel === "high" ? "destructive" : "outline"}>
                          {riskLevel.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Heuristic signals: tab switching, focus loss, clipboard events, proctoring warnings.
                      </p>
                    </CardContent>
                  </Card>

                  <ScrollArea className="h-[44vh] pr-4">
                    {loading ? (
                      <div className="space-y-4">
                        <div className="h-16 w-full bg-muted rounded-lg" />
                        <div className="h-20 w-full bg-muted rounded-lg" />
                        <div className="h-16 w-full bg-muted rounded-lg" />
                      </div>
                    ) : session && session.transcript ? (
                      <div className="space-y-6">
                        {session.transcript.map((message: Message) => {
                          const feedback = message.role === "user" ? feedbackMap.get(message.id) : null;
                          return (
                            <div key={message.id} className={`flex items-start gap-3 ${message.role === "user" ? "justify-end" : ""}`}>
                              {message.role === "ai" && (
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={aiAvatar?.imageUrl} data-ai-hint={aiAvatar?.imageHint} />
                                  <AvatarFallback>AI</AvatarFallback>
                                </Avatar>
                              )}
                              <div className={`max-w-xs rounded-lg p-3 text-sm ${message.role === "ai" ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                                <p>{message.content}</p>
                                {feedback && <Badge variant="secondary" className="mt-2">Score: {feedback.score}%</Badge>}
                              </div>
                              {message.role === "user" && (
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={userAvatar?.imageUrl} data-ai-hint={userAvatar?.imageHint} />
                                  <AvatarFallback>U</AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-12">No transcript available.</div>
                    )}
                  </ScrollArea>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Violation Evidence</div>
                      <Badge variant="outline">{violationEvents.length}</Badge>
                    </div>
                    {violationEvents.length ? (
                      <div className="grid grid-cols-2 gap-2">
                        {violationEvents.map((event) => (
                          <a
                            key={event.id}
                            href={event.imageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group overflow-hidden rounded-lg border bg-background"
                          >
                            <div className="relative aspect-video bg-muted">
                              {event.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={event.imageUrl}
                                  alt={`Violation ${event.id}`}
                                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-muted-foreground">
                                  <ImageIcon className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                            <div className="space-y-1 p-2 text-[11px] text-muted-foreground">
                              <div className="font-mono">
                                {Number.isNaN(Date.parse(event.eventTs))
                                  ? event.eventTs
                                  : format(parseISO(event.eventTs), "PP pp")}
                              </div>
                              <div>{event.eventType}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No violation screenshots stored for this session.</div>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Security Events</div>
                    <ScrollArea className="h-32 pr-4">
                      <div className="space-y-2 text-xs text-muted-foreground">
                        {(session?.securityEvents ?? []).length ? (
                          (session?.securityEvents ?? [])
                            .slice()
                            .reverse()
                            .slice(0, 50)
                            .map((e, i) => (
                              <div key={i} className="flex justify-between gap-2">
                                <span className="font-mono">{e.timestamp}</span>
                                <span className="flex-1">{getSecurityEventLabel(e.type)}</span>
                              </div>
                            ))
                        ) : (
                          <div>No security events recorded.</div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
