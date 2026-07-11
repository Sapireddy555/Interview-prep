"use client";

import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import React, { useEffect, useState } from "react";
import { fetchInterviewSessions, scheduleL2InterviewAction } from "../actions";
import type { InterviewSession } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Loader2, PlayCircle, ShieldAlert, UserCheck, UserX, Calendar, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function HRDashboardPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // L2 Scheduling state
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [panelEmail, setPanelEmail] = useState("");
  const [panelName, setPanelName] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [purgingId, setPurgingId] = useState<string | null>(null);

  const handlePurgeCandidate = async (candidateId: string | null | undefined, name: string) => {
    if (!candidateId) {
      toast({
        variant: "destructive",
        title: "Cannot Purge",
        description: "No candidate ID associated with this session.",
      });
      return;
    }

    const confirmPurge = window.confirm(
      `WARNING: Are you sure you want to permanently delete all data, resumes, video recordings, and evaluation records for candidate "${name}"?\n\nThis complies with DPDP Act (Right to Erase) and cannot be undone.`
    );
    if (!confirmPurge) return;

    setPurgingId(candidateId);
    try {
      const { purgeCandidateDataAction } = await import("../actions/privacy");
      const result = await purgeCandidateDataAction(candidateId);

      if (result.success) {
        toast({
          title: "Data Purged Successfully",
          description: `All records and cloud artifacts for "${name}" have been permanently erased.`,
        });
        setSessions(prev => prev.filter(s => s.candidateId !== candidateId));
      } else {
        toast({
          variant: "destructive",
          title: "Purge Failed",
          description: result.error || "Please try again.",
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Purge Error",
        description: "An unexpected error occurred during database purge.",
      });
    } finally {
      setPurgingId(null);
    }
  };

  useEffect(() => {
    async function loadSessions() {
      setLoading(true);
      const fetchedSessions = await fetchInterviewSessions();
      setSessions(fetchedSessions);
      setLoading(false);
    }
    loadSessions();
  }, []);

  const openScheduleModal = (session: any) => {
    setSelectedSession(session);
    setScheduleTime("");
    setPanelEmail(session.l2PanelEmail || "");
    setPanelName(session.l2PanelName || "");
    setShowScheduleModal(true);
  };

  const handleScheduleL2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !scheduleTime) return;

    setIsScheduling(true);
    try {
      const result = await scheduleL2InterviewAction({
        sessionId: selectedSession.id,
        scheduledTime: new Date(scheduleTime).toISOString(),
        panelEmail: panelEmail.trim() || undefined,
        panelName: panelName.trim() || undefined,
      });

      if (result.success) {
        toast({
          title: "Interview Scheduled",
          description: `L2 round scheduled for ${format(parseISO(new Date(scheduleTime).toISOString()), "PPpp")}`,
        });

        // Update local session data
        const updated = sessions.map((s) => {
          if (s.id === selectedSession.id) {
            return {
              ...s,
              l2ScheduledTime: new Date(scheduleTime).toISOString(),
              l2PanelEmail: panelEmail.trim() || s.l2PanelEmail,
              l2PanelName: panelName.trim() || s.l2PanelName,
            };
          }
          return s;
        });
        setSessions(updated);
        setShowScheduleModal(false);
      } else {
        toast({
          variant: "destructive",
          title: "Scheduling Failed",
          description: result.error || "Please try again.",
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Scheduling Error",
        description: "An unexpected error occurred.",
      });
    } finally {
      setIsScheduling(false);
    }
  };

  const completedSessions = sessions.filter((session) => parseInt(session.duration, 10) > 0);
  const reviewedSessions = completedSessions.filter((session) => session.summaryReport?.hiringRecommendation);
  const recommendedForNextRound = reviewedSessions.filter(
    (session) => session.summaryReport?.hiringRecommendation !== "No Hire"
  ).length;
  const rejectedCandidates = reviewedSessions.filter(
    (session) => session.summaryReport?.hiringRecommendation === "No Hire"
  ).length;

  if (loading) {
    return (
      <AppShell>
         <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
         </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">HR Evaluations Dashboard</h1>
          <p className="text-muted-foreground">Monitor and review candidate mock interviews from the TAG Team.</p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-gradient-to-br from-emerald-100 to-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recommended For Next Round</CardTitle>
              <UserCheck className="h-4 w-4 text-emerald-700" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-700">{recommendedForNextRound}</div>
              <p className="text-xs text-muted-foreground">
                Completed interviews with recommendation other than No Hire
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-rose-100 to-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
              <UserX className="h-4 w-4 text-rose-700" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-rose-700">{rejectedCandidates}</div>
              <p className="text-xs text-muted-foreground">
                Completed interviews marked No Hire
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Candidate Sessions</CardTitle>
            <CardDescription>View scores, proctoring alerts, and recording playbacks.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Date Completed</TableHead>
                  <TableHead>L1 Score</TableHead>
                  <TableHead>L1 Recommendation</TableHead>
                  <TableHead>L2 Panel</TableHead>
                  <TableHead>L2 Scheduled Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length > 0 ? sessions.map((s) => {
                  const isHiredL1 = s.summaryReport?.hiringRecommendation === "Strong Hire" || 
                                    s.summaryReport?.hiringRecommendation === "Hire" || 
                                    s.summaryReport?.hiringRecommendation === "Leaning Hire";
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-bold text-slate-800">{s.candidateName || s.id}</TableCell>
                      <TableCell>{s.role}</TableCell>
                      <TableCell>{format(parseISO(s.date), "PPpp")}</TableCell>
                      <TableCell>
                        <Badge variant={s.score > 70 ? "default" : "secondary"}>
                          {s.score > 0 ? `${s.score}%` : 'Incomplete'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.summaryReport?.hiringRecommendation ? (
                          <Badge variant={s.summaryReport.hiringRecommendation === "No Hire" ? "destructive" : "default"}>
                            {s.summaryReport.hiringRecommendation}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Pending</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.l2PanelName ? (
                          <div>
                            <p className="font-bold text-slate-800">{s.l2PanelName}</p>
                            <p className="text-slate-500 font-mono">{s.l2PanelEmail}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None assigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.l2ScheduledTime ? (
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <Calendar className="h-3.5 w-3.5 text-blue-500" />
                            {format(parseISO(s.l2ScheduledTime), "PPpp")}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not scheduled</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" asChild disabled={s.score === 0} className="h-8 px-2 text-xs">
                            <Link href={`/review?id=${s.id}`}>
                              L1 Report
                            </Link>
                          </Button>
                          {isHiredL1 && (
                            <Button 
                              size="sm" 
                              onClick={() => openScheduleModal(s)}
                              className="h-8 px-2 text-xs bg-[#056BFC] hover:bg-[#024099]"
                            >
                              Schedule L2
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={purgingId === s.candidateId}
                            onClick={() => handlePurgeCandidate(s.candidateId, s.candidateName || s.id)}
                            className="h-8 px-2 text-xs"
                          >
                            {purgingId === s.candidateId ? "Purging..." : "Purge Data"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                   <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No sessions recorded yet. Waiting for candidates to use the unique links.
                      </TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* L2 Interview Scheduling Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <Card className="w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900">Schedule L2 Round</CardTitle>
                  <CardDescription className="mt-0.5">
                    Book L2 technical round for {selectedSession?.candidateName || selectedSession?.id}.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowScheduleModal(false)} className="rounded-full h-8 w-8 p-0">
                  &times;
                </Button>
              </div>
            </CardHeader>
            <form onSubmit={handleScheduleL2}>
              <CardContent className="py-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="schedTime">L2 Interview Date & Time</Label>
                  <Input
                    id="schedTime"
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    required
                    className="h-10 rounded-lg border-slate-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pName">Panel Name</Label>
                    <Input
                      id="pName"
                      placeholder="John Doe"
                      value={panelName}
                      onChange={(e) => setPanelName(e.target.value)}
                      required
                      className="h-10 rounded-lg border-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pEmail">Panel Email</Label>
                    <Input
                      id="pEmail"
                      type="email"
                      placeholder="john.doe@corp.com"
                      value={panelEmail}
                      onChange={(e) => setPanelEmail(e.target.value)}
                      required
                      className="h-10 rounded-lg border-slate-200"
                    />
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[11px] leading-5 text-blue-900">
                  <span className="font-bold block">Microsoft Teams Calendar Integration:</span>
                  The system will automatically query the panel member's calendar for availability and schedule the Microsoft Teams meeting online link.
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t border-slate-100 justify-end py-3 gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowScheduleModal(false)}
                  className="rounded-lg h-10"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="rounded-lg h-10 bg-[#056BFC] hover:bg-[#024099] font-bold"
                  disabled={isScheduling}
                >
                  {isScheduling ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scheduling...</>
                  ) : (
                    "Schedule Interview"
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
