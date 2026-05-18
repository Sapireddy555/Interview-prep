"use client";

import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { fetchInterviewSessions } from "../actions";
import type { InterviewSession } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Loader2, PlayCircle, ShieldAlert, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HRDashboardPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSessions() {
      setLoading(true);
      const fetchedSessions = await fetchInterviewSessions();
      // Map to ensure new object isn't strictly reversed in place causing mutation errors if read-only
      setSessions([...fetchedSessions].reverse());
      setLoading(false);
    }
    loadSessions();
  }, []);

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
                  <TableHead>Candidate ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Date Completed</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead>Proctoring</TableHead>
                  <TableHead className="text-right">Playback</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length > 0 ? sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.id}</TableCell>
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
                    <TableCell>
                      {s.violations && s.violations.length > 0 ? (
                        <div className="flex items-center text-destructive text-xs font-semibold">
                          <ShieldAlert className="mr-1 h-4 w-4" />
                          {s.violations.length} Flags
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Clean</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild disabled={s.score === 0}>
                        <Link href={`/review?id=${s.id}`}>
                           <PlayCircle className="mr-2 h-4 w-4" /> Watch
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
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
    </AppShell>
  );
}
