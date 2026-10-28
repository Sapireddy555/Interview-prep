"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { registerBulkJobDescriptionTestAction, registerCandidateAction } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, Copy, FileText, Loader2, Mail, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import organizationLogo from "@/assets/VMLogoWhite.png";

type Mode = "single" | "bulk";

type SingleSuccessData = {
  type: "single";
  id: string;
  link: string;
  name: string;
  email: string;
  emailSent?: boolean;
  emailError?: string;
};

type InvitationResult = {
  id: string;
  link: string;
  name: string;
  email: string;
  emailSent?: boolean;
  emailError?: string;
};

type BulkSuccessData = {
  type: "bulk";
  testName: string;
  invitations: InvitationResult[];
};

type SuccessData = SingleSuccessData | BulkSuccessData;

const inputClass = "h-11 rounded-lg border border-slate-200 bg-white focus-visible:ring-2 focus-visible:ring-[#056BFC]/20";
const fileInputClass = "h-11 rounded-lg border border-slate-200 bg-white file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#056BFC]";
const selectTriggerClass = "h-11 rounded-lg border border-slate-200 bg-white";
const sectionClass = "rounded-xl border border-slate-200 bg-slate-50/60 p-4";
const sectionTitleClass = "text-xs font-black uppercase tracking-[0.16em] text-slate-500";

export default function RecruiterPortal() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("single");
  const [isLoading, setIsLoading] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [singleResumeFile, setSingleResumeFile] = useState<File | null>(null);
  const [singleJobDescriptionFile, setSingleJobDescriptionFile] = useState<File | null>(null);
  const [bulkJobDescriptionFile, setBulkJobDescriptionFile] = useState<File | null>(null);
  const [singleFormData, setSingleFormData] = useState({
    name: "",
    email: "",
    role: "Generative AI Engineer",
    difficulty: "medium",
    level: "",
    tsc: "",
    l2PanelName: "",
    l2PanelEmail: "",
  });
  const [bulkFormData, setBulkFormData] = useState({
    testName: "",
    difficulty: "medium",
    emails: "",
  });

  const bulkEmailCount = useMemo(() => {
    return bulkFormData.emails
      .split(/[\s,;]+/)
      .map((email) => email.trim())
      .filter(Boolean).length;
  }, [bulkFormData.emails]);

  const resetSingleForm = () => {
    setSingleFormData({
      name: "",
      email: "",
      role: "Generative AI Engineer",
      difficulty: "medium",
      level: "",
      tsc: "",
      l2PanelName: "",
      l2PanelEmail: "",
    });
    setSingleResumeFile(null);
    setSingleJobDescriptionFile(null);
  };

  const resetBulkForm = () => {
    setBulkFormData({
      testName: "",
      difficulty: "medium",
      emails: "",
    });
    setBulkJobDescriptionFile(null);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = new FormData();
      payload.append("name", singleFormData.name);
      payload.append("email", singleFormData.email);
      payload.append("role", singleFormData.role);
      payload.append("difficulty", singleFormData.difficulty);
      payload.append("level", singleFormData.level);
      payload.append("tsc", singleFormData.tsc);
      payload.append("l2PanelName", singleFormData.l2PanelName);
      payload.append("l2PanelEmail", singleFormData.l2PanelEmail);
      if (singleResumeFile) payload.append("resume", singleResumeFile);
      if (singleJobDescriptionFile) payload.append("jobDescription", singleJobDescriptionFile);

      const result = await registerCandidateAction(payload);
      if (result.success && result.id && result.link) {
        setSuccessData({
          type: "single",
          id: result.id,
          link: result.link,
          name: result.name || singleFormData.name,
          email: singleFormData.email,
          emailSent: result.emailSent,
          emailError: result.emailError,
        });
        toast({
          title: "Registration Successful",
          description: result.emailSent ? "Candidate has been registered and emailed." : "Candidate registered. Email settings need attention.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Registration Failed",
          description: result.error || "An unknown error occurred.",
        });
      }
    } catch (error) {
      console.error("Single submit error:", error);
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: "Could not register the candidate.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = new FormData();
      payload.append("testName", bulkFormData.testName);
      payload.append("difficulty", bulkFormData.difficulty);
      payload.append("emails", bulkFormData.emails);
      if (bulkJobDescriptionFile) payload.append("jobDescription", bulkJobDescriptionFile);

      const result = await registerBulkJobDescriptionTestAction(payload);
      if (result.success && result.invitations) {
        setSuccessData({
          type: "bulk",
          testName: result.testName || bulkFormData.testName,
          invitations: result.invitations,
        });
        toast({
          title: "Bulk Test Shared",
          description: `${result.invitations.length} candidate invitation${result.invitations.length === 1 ? "" : "s"} created.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Sharing Failed",
          description: result.error || "An unknown error occurred.",
        });
      }
    } catch (error) {
      console.error("Bulk submit error:", error);
      toast({
        variant: "destructive",
        title: "Sharing Failed",
        description: "Could not create the bulk test invitations.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (successData?.type === "single") {
    return (
      <div className="min-h-screen bg-[#F8F8F8] p-4 md:p-8 flex items-center justify-center">
        <Card className="max-w-xl w-full shadow-2xl border-t-8 border-t-[#3FD534] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-10 w-10 text-[#2EB125]" />
            </div>
            <CardTitle className="text-3xl font-black text-[#303030]">Invitation Sent!</CardTitle>
            <CardDescription className="text-lg">
              Registration completed for <span className="font-bold text-[#303030]">{successData.name}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-200 space-y-4">
              <div>
                <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Candidate Unique ID</Label>
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border shadow-sm mt-1">
                  <code className="text-xl font-mono font-black text-[#056BFC]">{successData.id}</code>
                  <Button variant="ghost" size="sm" onClick={() => {
                    navigator.clipboard.writeText(successData.id);
                    toast({ description: "ID copied to clipboard" });
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Interview Access Link</Label>
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border shadow-sm mt-1">
                  <span className="text-xs text-slate-500 truncate mr-4">{successData.link}</span>
                  <Button variant="ghost" size="sm" onClick={() => {
                    navigator.clipboard.writeText(successData.link);
                    toast({ description: "Link copied to clipboard" });
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <Mail className="h-5 w-5 text-[#056BFC]" />
              <p className="text-xs text-blue-700 font-medium">
                {successData.emailSent
                  ? <>Invitation email sent to <span className="underline">{successData.email}</span>.</>
                  : <>Candidate registered, but ACS email was not sent: {successData.emailError || "email service is not configured"}.</>}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button className="w-full h-14 text-lg font-bold bg-[#056BFC] hover:bg-[#024099] rounded-2xl" onClick={() => {
              setSuccessData(null);
              resetSingleForm();
              setMode("single");
            }}>
              Register Another Candidate
            </Button>
            <Button variant="outline" className="w-full rounded-2xl" onClick={() => {
              setSuccessData(null);
              resetBulkForm();
              setMode("bulk");
            }}>
              Switch to Bulk Sharing
            </Button>
            <Button variant="ghost" className="w-full text-slate-500" asChild>
              <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (successData?.type === "bulk") {
    const failedEmails = successData.invitations.filter((invitation) => !invitation.emailSent);

    return (
      <div className="min-h-screen bg-[#F8F8F8] p-4 md:p-8 flex items-center justify-center">
        <Card className="max-w-3xl w-full shadow-2xl border-t-8 border-t-[#3FD534] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-10 w-10 text-[#2EB125]" />
            </div>
            <CardTitle className="text-3xl font-black text-[#303030]">Bulk Test Created</CardTitle>
            <CardDescription className="text-lg">
              {successData.invitations.length} candidate invitation{successData.invitations.length === 1 ? "" : "s"} generated for{" "}
              <span className="font-bold text-[#303030]">{successData.testName}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {successData.invitations.map((invitation) => (
                <div key={invitation.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-[#303030]">{invitation.email}</p>
                      <p className="mt-1 text-xs text-slate-500">Candidate name: {invitation.name}</p>
                      <code className="mt-2 block text-sm font-black text-[#056BFC]">{invitation.id}</code>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          navigator.clipboard.writeText(invitation.id);
                          toast({ description: "ID copied to clipboard" });
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" /> ID
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          navigator.clipboard.writeText(invitation.link);
                          toast({ description: "Link copied to clipboard" });
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" /> Link
                      </Button>
                    </div>
                  </div>
                  {!invitation.emailSent ? (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      Email not sent: {invitation.emailError || "email service is not configured"}.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <Mail className="h-5 w-5 text-[#056BFC]" />
              <p className="text-xs text-blue-700 font-medium">
                {failedEmails.length === 0
                  ? "All invitation emails were sent."
                  : `${failedEmails.length} invitation email${failedEmails.length === 1 ? "" : "s"} need email configuration attention.`}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button className="w-full h-14 text-lg font-bold bg-[#056BFC] hover:bg-[#024099] rounded-2xl" onClick={() => {
              setSuccessData(null);
              resetBulkForm();
              setMode("bulk");
            }}>
              Share Another Bulk Test
            </Button>
            <Button variant="outline" className="w-full rounded-2xl" onClick={() => {
              setSuccessData(null);
              resetSingleForm();
              setMode("single");
            }}>
              Switch to Single Candidate
            </Button>
            <Button variant="ghost" className="w-full text-slate-500" asChild>
              <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isSingleMode = mode === "single";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-5">
          <Image
            src={organizationLogo}
            alt="ValueMomentum Logo"
            className="h-7 w-auto object-contain"
          />
          <div className="w-px h-7 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 bg-slate-50 rounded-lg flex items-center justify-center text-[#056BFC] font-black text-sm border border-slate-200">A</div>
            <div>
              <h1 className="text-sm font-black text-[#303030] leading-none">Aura</h1>
              <p className="text-[9px] uppercase font-bold text-[#056BFC] tracking-widest mt-0.5">TAG Hub</p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild className="rounded-lg border-slate-200">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 md:px-6 md:py-10">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#056BFC]">
                {isSingleMode ? <UserPlus className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {isSingleMode ? "Single Invite" : "Bulk Sharing"}
              </div>
              <h2 className="text-3xl font-black text-[#303030] tracking-tight leading-tight">
                {isSingleMode ? (
                  <>
                    Register a New{" "}
                    <span className="text-[#056BFC]">Candidate</span>
                  </>
                ) : (
                  <>
                    Share a{" "}
                    <span className="text-[#056BFC]">Bulk Test</span>
                  </>
                )}
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                {isSingleMode
                  ? "Use single invite when the candidate resume is available. The test uses resume, job description, common, and technical sections."
                  : "Use bulk sharing when resumes are not required. The test uses one job description plus common and aptitude sections."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <Button
                type="button"
                variant={isSingleMode ? "default" : "ghost"}
                className={`h-10 rounded-lg text-xs font-black ${isSingleMode ? "bg-[#056BFC] hover:bg-[#024099]" : "text-slate-600 hover:bg-slate-50"}`}
                onClick={() => setMode("single")}
              >
                <UserPlus className="mr-2 h-4 w-4" /> Single
              </Button>
              <Button
                type="button"
                variant={!isSingleMode ? "default" : "ghost"}
                className={`h-10 rounded-lg text-xs font-black ${!isSingleMode ? "bg-[#056BFC] hover:bg-[#024099]" : "text-slate-600 hover:bg-slate-50"}`}
                onClick={() => setMode("bulk")}
              >
                <Users className="mr-2 h-4 w-4" /> Bulk
              </Button>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              {(isSingleMode
                ? [
                    ["Enter Details", "Provide candidate details, resume, and job description."],
                    ["Select Role", "Pick from GenAI, React, or Java tracks."],
                    ["Generate Link", "System sends ACS email with access code."],
                  ]
                : [
                    ["Name the Test", "Use the correct test or role name shown to candidates."],
                    ["Set Level", "Choose Beginner, Intermediate, or Expert for the assessment."],
                    ["Add Emails and JD", "Candidates receive common/aptitude and JD-based technical questions."],
                  ]).map(([title, description], index) => (
                <div key={title} className="flex gap-3 items-start">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-black text-slate-500">{index + 1}</div>
                  <div>
                    <p className="text-sm font-bold text-[#303030]">{title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Card className="lg:col-span-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-white px-6 py-5">
              <CardTitle className="text-2xl font-black text-[#303030]">
                {isSingleMode ? "Candidate Information" : "Bulk Test Sharing"}
              </CardTitle>
              <CardDescription className="text-slate-500">
                {isSingleMode
                  ? "Fill in the candidate details and upload both PDFs."
                  : "Enter test details, paste candidate emails, and upload one job description PDF."}
              </CardDescription>
            </CardHeader>

            {isSingleMode ? (
              <form onSubmit={handleSingleSubmit}>
                <CardContent className="space-y-5 px-6 py-6">
                  <div className={sectionClass}>
                    <p className={sectionTitleClass}>Candidate Details</p>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-xs font-bold text-slate-500">Full Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g. Sarah Connor"
                        className={inputClass}
                        value={singleFormData.name}
                        onChange={(e) => setSingleFormData({ ...singleFormData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-xs font-bold text-slate-500">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="sarah@corp.com"
                        className={inputClass}
                        value={singleFormData.email}
                        onChange={(e) => setSingleFormData({ ...singleFormData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="l2PanelName" className="text-xs font-bold text-slate-500">L2 Panel Name</Label>
                      <Input
                        id="l2PanelName"
                        placeholder="e.g. John Doe"
                        className={inputClass}
                        value={singleFormData.l2PanelName}
                        onChange={(e) => setSingleFormData({ ...singleFormData, l2PanelName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="l2PanelEmail" className="text-xs font-bold text-slate-500">L2 Panel Email</Label>
                      <Input
                        id="l2PanelEmail"
                        type="email"
                        placeholder="john.doe@corp.com"
                        className={inputClass}
                        value={singleFormData.l2PanelEmail}
                        onChange={(e) => setSingleFormData({ ...singleFormData, l2PanelEmail: e.target.value })}
                        required
                      />
                    </div>
                    </div>
                  </div>

                  <div className={sectionClass}>
                    <p className={sectionTitleClass}>Assessment Setup</p>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="role" className="text-xs font-bold text-slate-500">Interview Track / Role</Label>
                    <Select value={singleFormData.role} onValueChange={(v) => setSingleFormData({ ...singleFormData, role: v })}>
                      <SelectTrigger className={selectTriggerClass}>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Generative AI Engineer">Generative AI Engineer</SelectItem>
                        <SelectItem value="React Engineer">React Engineer</SelectItem>
                        <SelectItem value="Java Engineer">Java Engineer</SelectItem>
                        <SelectItem value=".NET Developer">.NET Developer</SelectItem>
                        <SelectItem value="QA Engineer">QA Engineer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="candidateLevel" className="text-xs font-bold text-slate-500">Candidate Level</Label>
                    <Select value={singleFormData.level} onValueChange={(v) => setSingleFormData({ ...singleFormData, level: v })}>
                      <SelectTrigger id="candidateLevel" className={selectTriggerClass}>
                        <SelectValue placeholder="Select candidate level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SE">SE</SelectItem>
                        <SelectItem value="SSE">SSE</SelectItem>
                        <SelectItem value="Tech Lead">Tech Lead</SelectItem>
                        <SelectItem value="Project Manager">Project Manager</SelectItem>
                        <SelectItem value="Architect">Architect</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="candidateTsc" className="text-xs font-bold text-slate-500">TSC</Label>
                    <Select value={singleFormData.tsc} onValueChange={(v) => setSingleFormData({ ...singleFormData, tsc: v })}>
                      <SelectTrigger id="candidateTsc" className={selectTriggerClass}>
                        <SelectValue placeholder="Select TSC" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Platform,App & Infra TSC">Platform,App &amp; Infra TSC</SelectItem>
                        <SelectItem value="Software & AI Assurance">Software &amp; AI Assurance</SelectItem>
                        <SelectItem value="Core">Core</SelectItem>
                        <SelectItem value="Emerging Tech">Emerging Tech</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="singleDifficulty" className="text-xs font-bold text-slate-500">Assessment Difficulty</Label>
                    <Select value={singleFormData.difficulty} onValueChange={(v) => setSingleFormData({ ...singleFormData, difficulty: v })}>
                      <SelectTrigger id="singleDifficulty" className={selectTriggerClass}>
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Beginner (0-3 years)</SelectItem>
                        <SelectItem value="medium">Intermediate (3-6 years)</SelectItem>
                        <SelectItem value="hard">Expert (6+ years)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                    </div>
                  </div>

                  <div className={sectionClass}>
                    <p className={sectionTitleClass}>Documents</p>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="resume" className="text-xs font-bold text-slate-500">Candidate Resume PDF</Label>
                      <Input
                        id="resume"
                        type="file"
                        accept="application/pdf"
                        className={fileInputClass}
                        onChange={(e) => setSingleResumeFile(e.target.files?.[0] || null)}
                        required
                      />
                      {singleResumeFile ? (
                        <p className="flex items-center gap-1 text-[11px] font-medium text-slate-500"><FileText className="h-3 w-3" /> {singleResumeFile.name}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="singleJobDescription" className="text-xs font-bold text-slate-500">Job Description PDF</Label>
                      <Input
                        id="singleJobDescription"
                        type="file"
                        accept="application/pdf"
                        className={fileInputClass}
                        onChange={(e) => setSingleJobDescriptionFile(e.target.files?.[0] || null)}
                        required
                      />
                      {singleJobDescriptionFile ? (
                        <p className="flex items-center gap-1 text-[11px] font-medium text-slate-500"><FileText className="h-3 w-3" /> {singleJobDescriptionFile.name}</p>
                      ) : null}
                    </div>
                  </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-slate-100 bg-slate-50 px-6 py-5">
                  <Button type="submit" className="h-12 w-full rounded-lg bg-[#056BFC] text-base font-black hover:bg-[#024099]" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Registering...</> : "Generate Interview Link"}
                  </Button>
                </CardFooter>
              </form>
            ) : (
              <form onSubmit={handleBulkSubmit}>
                <CardContent className="space-y-5 px-6 py-6">
                  <div className={sectionClass}>
                    <p className={sectionTitleClass}>Assessment Setup</p>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="testName" className="text-xs font-bold text-slate-500">Test Name</Label>
                    <Input
                      id="testName"
                      placeholder="e.g. Java Developer Assessment"
                      className={inputClass}
                      value={bulkFormData.testName}
                      onChange={(e) => setBulkFormData({ ...bulkFormData, testName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bulkDifficulty" className="text-xs font-bold text-slate-500">Level</Label>
                    <Select value={bulkFormData.difficulty} onValueChange={(v) => setBulkFormData({ ...bulkFormData, difficulty: v })}>
                      <SelectTrigger id="bulkDifficulty" className={selectTriggerClass}>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Beginner (0-3 years)</SelectItem>
                        <SelectItem value="medium">Intermediate (3-6 years)</SelectItem>
                        <SelectItem value="hard">Expert (6+ years)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                    </div>
                  </div>

                  <div className={sectionClass}>
                    <div className="flex items-center justify-between gap-3">
                      <p className={sectionTitleClass}>Candidates</p>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-[#056BFC]">{bulkEmailCount} entered</span>
                    </div>
                    <Label htmlFor="emails" className="mt-4 block text-xs font-bold text-slate-500">Candidate Email IDs</Label>
                    <Textarea
                      id="emails"
                      placeholder={"candidate.one@company.com\ncandidate.two@company.com\ncandidate.three@company.com"}
                      className="mt-2 min-h-36 rounded-lg border border-slate-200 bg-white focus-visible:ring-2 focus-visible:ring-[#056BFC]/20"
                      value={bulkFormData.emails}
                      onChange={(e) => setBulkFormData({ ...bulkFormData, emails: e.target.value })}
                      required
                    />
                    <p className="text-[11px] text-slate-500">Separate emails with a new line, comma, semicolon, or space.</p>
                  </div>

                  <div className={sectionClass}>
                    <p className={sectionTitleClass}>Documents</p>
                    <div className="mt-4 space-y-2">
                    <Label htmlFor="bulkJobDescription" className="text-xs font-bold text-slate-500">Job Description PDF</Label>
                    <Input
                      id="bulkJobDescription"
                      type="file"
                      accept="application/pdf"
                      className={fileInputClass}
                      onChange={(e) => setBulkJobDescriptionFile(e.target.files?.[0] || null)}
                      required
                    />
                    {bulkJobDescriptionFile ? (
                      <p className="flex items-center gap-1 text-[11px] font-medium text-slate-500"><FileText className="h-3 w-3" /> {bulkJobDescriptionFile.name}</p>
                    ) : null}
                  </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-slate-100 bg-slate-50 px-6 py-5">
                  <Button type="submit" className="h-12 w-full rounded-lg bg-[#056BFC] text-base font-black hover:bg-[#024099]" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Sharing...</> : "Share Bulk Test"}
                  </Button>
                </CardFooter>
              </form>
            )}
          </Card>
        </div>
      </main>

      <footer className="py-6 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        Authorized TAG Access Only &bull; &copy; 2026 Aura Technologies
      </footer>
    </div>
  );
}
