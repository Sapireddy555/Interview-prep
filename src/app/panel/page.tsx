"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  fetchPanelCandidates, 
  saveL2ScorecardAction, 
  generatePanelL2QuestionsAction 
} from "@/app/actions";
import { 
  Loader2, 
  Mail, 
  User, 
  Calendar, 
  FileText, 
  CheckCircle, 
  HelpCircle, 
  PlusCircle, 
  LogOut, 
  FileCheck2,
  CalendarCheck2
} from "lucide-react";
import Link from "next/link";
import { format, parseISO } from "date-fns";

export default function PanelPortalPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  
  // Custom AI Questions Modal state
  const [questions, setQuestions] = useState<string[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);

  // L2 Scorecard Form state
  const [l2Form, setL2Form] = useState({
    recommendation: "Hire",
    score: 80,
    comments: ""
  });
  const [isSavingScorecard, setIsSavingScorecard] = useState(false);
  const [showScorecardModal, setShowScorecardModal] = useState(false);

  // Load candidates once email is entered
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    try {
      const result = await fetchPanelCandidates(email);
      if (result.success) {
        setCandidates(result.candidates || []);
        setIsLoggedIn(true);
        toast({
          title: "Logged In Successfully",
          description: `Loaded ${result.candidates?.length || 0} candidates assigned to ${email}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Fetch Candidates",
          description: result.error || "Please verify your email or connection.",
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Login Error",
        description: "An unexpected error occurred.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCandidates([]);
    setEmail("");
    setSelectedCandidate(null);
  };

  const openQuestionsModal = async (cand: any) => {
    setSelectedCandidate(cand);
    setIsLoadingQuestions(true);
    setShowQuestionsModal(true);
    setQuestions([]);
    
    try {
      const result = await generatePanelL2QuestionsAction(cand.candidateId);
      if (result.success && result.questions) {
        setQuestions(result.questions);
      } else {
        toast({
          variant: "destructive",
          title: "Questions Generation Failed",
          description: result.error || "Unable to extract custom resume project questions.",
        });
        setQuestions([
          "Walk me through the architecture of a complex project you designed.",
          "What was the hardest technical decision you made on your last project, and what trade-offs did you face?",
          "How do you handle scalability and concurrent requests in production environments?"
        ]);
      }
    } catch (err) {
      console.error(err);
      setQuestions([
        "Walk me through the architecture of a complex project you designed.",
        "What was the hardest technical decision you made on your last project, and what trade-offs did you face?"
      ]);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const openScorecardModal = (cand: any) => {
    setSelectedCandidate(cand);
    const existing = cand.l2Scorecard || {};
    setL2Form({
      recommendation: existing.recommendation || "Hire",
      score: existing.score !== undefined ? existing.score : 80,
      comments: existing.comments || ""
    });
    setShowScorecardModal(true);
  };

  const handleSaveScorecard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;

    setIsSavingScorecard(true);
    try {
      const result = await saveL2ScorecardAction({
        sessionId: selectedCandidate.sessionId,
        scorecard: {
          recommendation: l2Form.recommendation,
          score: Number(l2Form.score),
          comments: l2Form.comments,
          submittedAt: new Date().toISOString(),
          submittedBy: email
        }
      });

      if (result.success) {
        toast({
          title: "Scorecard Saved",
          description: "L2 Assessment Report saved successfully.",
        });
        
        // Refresh local state
        const updated = candidates.map(c => {
          if (c.sessionId === selectedCandidate.sessionId) {
            return {
              ...c,
              l2Scorecard: {
                recommendation: l2Form.recommendation,
                score: Number(l2Form.score),
                comments: l2Form.comments
              }
            };
          }
          return c;
        });
        setCandidates(updated);
        setShowScorecardModal(false);
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Save Scorecard",
          description: result.error || "Please try again.",
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Error Saving",
        description: "An unexpected error occurred.",
      });
    } finally {
      setIsSavingScorecard(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <AppShell hideLayout={true}>
        <div className="flex min-h-[80vh] items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-2xl border-t-8 border-t-[#056BFC]">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                <FileCheck2 className="h-6 w-6 text-[#056BFC]" />
              </div>
              <CardTitle className="text-2xl font-black text-[#303030]">L2 Panel Portal</CardTitle>
              <CardDescription>
                Enter your registered panel email address to view scheduled candidates and resume questions.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="panelEmail">Panel Email Address</Label>
                  <Input
                    id="panelEmail"
                    type="email"
                    placeholder="panel.member@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 rounded-lg border-slate-200"
                  />
                </div>
                <div className="text-xs text-muted-foreground bg-slate-50 p-3 rounded-lg border border-dashed leading-5">
                  <p className="font-semibold text-slate-800">Assigned L2 Panel Access Only</p>
                  <p>Upon validation, the portal loads candidate evaluation details and project questions directly mapped from your calendar.</p>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-[#056BFC] hover:bg-[#024099] font-bold text-base rounded-lg shadow-lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Accessing Portal...</>
                  ) : (
                    "Login to Portal"
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hideLayout={true}>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full px-2 py-4">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#056BFC]">L2 Panel Portal</span>
              {candidates.some(c => c.l2ScheduledTime) && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Interviews Scheduled
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black text-[#303030] tracking-tight mt-1">Evaluations & Assessments</h1>
            <p className="text-slate-500 text-sm mt-0.5">Logged in as: <span className="font-bold text-slate-800">{email}</span></p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-lg border-slate-200">
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </header>
 
        {/* Candidates List Table */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-[#303030]">Scheduled L2 Assessments</CardTitle>
            <CardDescription>Select a candidate to view resume questions and submit the L2 assessment report.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="font-bold text-slate-600">Candidate Name</TableHead>
                  <TableHead className="font-bold text-slate-600">Email ID</TableHead>
                  <TableHead className="font-bold text-slate-600">L1 Score</TableHead>
                  <TableHead className="font-bold text-slate-600">Scheduled L2 Time</TableHead>
                  <TableHead className="font-bold text-slate-600">L2 Decision</TableHead>
                  <TableHead className="font-bold text-slate-600">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.length > 0 ? (
                  candidates.map((cand) => (
                    <TableRow key={cand.sessionId} className="hover:bg-slate-50/50">
                      <TableCell className="font-bold text-slate-800">{cand.candidateName}</TableCell>
                      <TableCell className="font-mono text-xs">{cand.candidateEmail}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-bold">
                          {cand.l1Score}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {cand.l2ScheduledTime ? (
                          <span className="flex items-center gap-1 text-slate-700">
                            <Calendar className="h-3.5 w-3.5 text-blue-500" />
                            {format(parseISO(cand.l2ScheduledTime), "PPpp")}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not scheduled</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {cand.l2Scorecard?.recommendation ? (
                          <Badge className={
                            cand.l2Scorecard.recommendation === "No Hire" 
                              ? "bg-red-100 text-red-800 hover:bg-red-100" 
                              : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          }>
                            {cand.l2Scorecard.recommendation} ({cand.l2Scorecard.score}%)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-400 border-slate-200">
                            Pending L2
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" asChild className="rounded-lg h-8 px-2 text-xs">
                            <Link href={`/review?id=${cand.sessionId}`}>
                              <FileText className="mr-1 h-3.5 w-3.5" /> L1 Report
                            </Link>
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => openQuestionsModal(cand)}
                            className="rounded-lg h-8 px-2 text-xs border-blue-200 text-[#056BFC] hover:bg-blue-50"
                          >
                            <HelpCircle className="mr-1 h-3.5 w-3.5" /> Questions
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => openScorecardModal(cand)}
                            className="rounded-lg h-8 px-2 text-xs bg-[#056BFC] hover:bg-[#024099]"
                          >
                            <CheckCircle className="mr-1 h-3.5 w-3.5" /> Score L2
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-slate-400 italic">
                      No candidates assigned to your panel email yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Microsoft Teams calendar availability note */}
        <Card className="border-blue-100 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-[#056BFC] flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4" /> Microsoft Teams Calendar Synchronization Info
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-blue-800 leading-5">
            <p>
              Your Microsoft Teams/Outlook Calendar is synchronized. Recruiter/TAG teams can query your calendar slots to book interviews automatically. 
            </p>
            <p className="mt-1 font-semibold">
              Calendar Integration Status: Active &bull; Scope: Calendars.ReadWrite, OnlineMeetings.ReadWrite
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Resume Project Questions Modal */}
      {showQuestionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <Card className="w-full max-w-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900">Custom Resume Questions</CardTitle>
                  <CardDescription className="mt-0.5">
                    Tailored for {selectedCandidate?.candidateName} based on their projects.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowQuestionsModal(false)} className="rounded-full h-8 w-8 p-0">
                  &times;
                </Button>
              </div>
            </CardHeader>
            <CardContent className="py-6 space-y-4">
              {isLoadingQuestions ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                  <Loader2 className="h-10 w-10 animate-spin text-[#056BFC]" />
                  <p className="text-sm text-slate-500 font-medium">Extracting project experiences and generating technical L2 questions...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-900">
                    <strong>Interviewer Tip:</strong> These questions are dynamically generated by Gemini from the candidate's PDF resume. Use them to probe deeply into their direct contributions.
                  </div>
                  <ul className="space-y-3">
                    {questions.map((q, idx) => (
                      <li key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-800 leading-6">
                        <span className="font-bold text-[#056BFC] block mb-1">Question {idx + 1}</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-slate-50 border-t border-slate-100 justify-end py-3">
              <Button onClick={() => setShowQuestionsModal(false)} className="rounded-lg h-10 px-6 font-bold bg-[#056BFC] hover:bg-[#024099]">
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* L2 Scorecard Modal */}
      {showScorecardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900">L2 Evaluation Scorecard</CardTitle>
                  <CardDescription className="mt-0.5">
                    Evaluate {selectedCandidate?.candidateName} for the L2 Round.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowScorecardModal(false)} className="rounded-full h-8 w-8 p-0">
                  &times;
                </Button>
              </div>
            </CardHeader>
            <form onSubmit={handleSaveScorecard}>
              <CardContent className="py-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="l2Recommend">Hiring Recommendation</Label>
                    <select
                      id="l2Recommend"
                      value={l2Form.recommendation}
                      onChange={(e) => setL2Form({ ...l2Form, recommendation: e.target.value })}
                      className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="Strong Hire">Strong Hire</option>
                      <option value="Hire">Hire</option>
                      <option value="Leaning Hire">Leaning Hire</option>
                      <option value="No Hire">No Hire</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="l2Score">L2 Technical Score (0-100)</Label>
                    <Input
                      id="l2Score"
                      type="number"
                      min="0"
                      max="100"
                      value={l2Form.score}
                      onChange={(e) => setL2Form({ ...l2Form, score: Number(e.target.value) })}
                      required
                      className="h-10 rounded-lg border-slate-200"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="l2Comments">Assessment Report / Feedback Summary</Label>
                  <textarea
                    id="l2Comments"
                    placeholder="Provide specific notes on technical depth, project ownership, coding skills, and architectural decisions discussed."
                    value={l2Form.comments}
                    onChange={(e) => setL2Form({ ...l2Form, comments: e.target.value })}
                    required
                    rows={5}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t border-slate-100 justify-end py-3 gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowScorecardModal(false)}
                  className="rounded-lg h-10"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="rounded-lg h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  disabled={isSavingScorecard}
                >
                  {isSavingScorecard ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                  ) : (
                    "Submit Assessment"
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
