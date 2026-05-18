
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Activity,
  CheckCircle,
  Clock,
  Target,
  Inbox,
  Loader2,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import React, { useEffect, useState } from 'react';
import { fetchInterviewSessions } from "../actions";
import type { InterviewSession } from "@/lib/types";
import { format, parseISO } from "date-fns";

const chartConfig = {
  score: {
    label: "Score",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

export default function DashboardPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSessions() {
      setLoading(true);
      const fetchedSessions = await fetchInterviewSessions();
      setSessions(fetchedSessions);
      setLoading(false);
    }
    loadSessions();
  }, []);

  const totalInterviews = sessions.length;
  const completedSessions = sessions.filter(s => parseInt(s.duration, 10) > 0);
  const reviewedSessions = completedSessions.filter((session) => session.summaryReport?.hiringRecommendation);
  const recommendedForNextRound = reviewedSessions.filter(
    (session) => session.summaryReport?.hiringRecommendation !== "No Hire"
  ).length;
  const rejectedCandidates = reviewedSessions.filter(
    (session) => session.summaryReport?.hiringRecommendation === "No Hire"
  ).length;

  const averageScore = completedSessions.length > 0
    ? completedSessions.reduce((sum, s) => sum + s.score, 0) / completedSessions.length
    : 0;

  const averageDuration = completedSessions.length > 0 ?
    completedSessions.reduce((sum, s) => sum + parseInt(s.duration, 10), 0) / completedSessions.length
    : 0;

  const mostFrequentRole = totalInterviews > 0 ?
    Object.entries(sessions.reduce((acc, s) => {
        acc[s.role] = (acc[s.role] || 0) + 1;
        return acc;
    }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])[0][0]
    : "N/A";

  const interviewsThisMonth = sessions.filter(s => {
    const sessionDate = parseISO(s.date);
    const today = new Date();
    return sessionDate.getMonth() === today.getMonth() && sessionDate.getFullYear() === today.getFullYear();
  }).length;
  
  const chartData = completedSessions.map(s => ({
      month: format(parseISO(s.date), 'MMM'),
      score: s.score
  })).reverse();
  
  const recentInterviews = sessions.slice(0, 5);

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
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here's your interview performance at a glance.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-6">
          <Card className="relative overflow-hidden bg-gradient-to-br from-primary/20 to-secondary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Interviews
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalInterviews}</div>
              <p className="text-xs text-muted-foreground">
                +{interviewsThisMonth} this month
              </p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden bg-gradient-to-br from-accent/20 to-secondary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{averageScore.toFixed(0)}%</div>
               <p className="text-xs text-muted-foreground">
                For completed interviews
              </p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Average Duration
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{averageDuration.toFixed(0)}m</div>
               <p className="text-xs text-muted-foreground">
                For completed interviews
              </p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Most Frequent Role
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mostFrequentRole}</div>
              <p className="text-xs text-muted-foreground">
                Based on your sessions
              </p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-100 to-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Next Round
              </CardTitle>
              <UserCheck className="h-4 w-4 text-emerald-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-700">{recommendedForNextRound}</div>
              <p className="text-xs text-muted-foreground">
                Reviewed candidates recommended forward
              </p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden bg-gradient-to-br from-rose-100 to-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Rejected
              </CardTitle>
              <UserX className="h-4 w-4 text-rose-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-700">{rejectedCandidates}</div>
              <p className="text-xs text-muted-foreground">
                Reviewed candidates marked No Hire
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Performance Over Time</CardTitle>
              <CardDescription>
                Your interview scores over the last few sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                {chartData.length > 0 ? (
                  <BarChart accessibilityLayer data={chartData}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      tickFormatter={(value) => value.slice(0, 3)}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      domain={[0, 100]}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent />}
                    />
                    <Bar dataKey="score" fill="var(--color-score)" radius={8} />
                  </BarChart>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Inbox className="h-12 w-12" />
                    <p>No data to display</p>
                    <p className="text-xs">Complete an interview to see your performance.</p>
                  </div>
                )}
              </ChartContainer>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent Interviews</CardTitle>
              <CardDescription>
                Your most recent practice sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInterviews.length > 0 ? (
                    recentInterviews.map((interview) => (
                      <TableRow key={interview.id}>
                        <TableCell className="font-medium">
                          {interview.role}
                        </TableCell>
                        <TableCell>{format(parseISO(interview.date), "PPP")}</TableCell>
                        <TableCell className="text-right">
                          {interview.score > 0 ? `${interview.score}%` : 'In Progress'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center">
                        No recent interviews.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="mt-4 flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <Link href="/review">View All Interviews</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
