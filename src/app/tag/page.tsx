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
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col">
      <header className="h-20 bg-white border-b flex items-center px-8 justify-between sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <div className="bg-[#056BFC] p-2 rounded-xl shadow-md">
            <Image src={organizationLogo} alt="ValueMomentum Logo" className="h-6 w-auto object-contain" />
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 bg-[#F8F8F8] rounded-lg flex items-center justify-center text-[#056BFC] font-black text-sm border">A</div>
            <div>
              <h1 className="text-sm font-black text-[#303030] leading-none">Aura</h1>
              <p className="text-[9px] uppercase font-bold text-[#056BFC] tracking-widest mt-0.5">TAG Hub</p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild className="rounded-xl">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </header>

      <main className="flex-1 p-6 md:p-12 flex flex-col items-center">
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
          <div className="lg:col-span-2 space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-[#056BFC] rounded-full text-[10px] font-black uppercase tracking-wider">
                {isSingleMode ? <UserPlus className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {isSingleMode ? "Single Invite" : "Bulk Sharing"}
              </div>
              <h2 className="text-4xl font-black text-[#303030] tracking-tight leading-tight">
                {isSingleMode ? (
                  <>
                    Register a New <br />
                    <span className="text-[#056BFC]">Candidate</span>
                  </>
                ) : (
                  <>
                    Share a <br />
                    <span className="text-[#056BFC]">Bulk Test</span>
                  </>
                )}
              </h2>
              <p className="text-slate-500 leading-relaxed text-sm">
                {isSingleMode
                  ? "Use single invite when the candidate resume is available. The test uses resume, job description, common, and technical sections."
                  : "Use bulk sharing when resumes are not required. The test uses one job description plus common and aptitude sections."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
              <Button
                type="button"
                variant={isSingleMode ? "default" : "ghost"}
                className={`h-11 rounded-xl text-xs font-black ${isSingleMode ? "bg-[#056BFC] hover:bg-[#024099]" : "text-slate-600"}`}
                onClick={() => setMode("single")}
              >
                <UserPlus className="mr-2 h-4 w-4" /> Single
              </Button>
              <Button
                type="button"
                variant={!isSingleMode ? "default" : "ghost"}
                className={`h-11 rounded-xl text-xs font-black ${!isSingleMode ? "bg-[#056BFC] hover:bg-[#024099]" : "text-slate-600"}`}
                onClick={() => setMode("bulk")}
              >
                <Users className="mr-2 h-4 w-4" /> Bulk
              </Button>
            </div>

            <div className="space-y-6">
              {(isSingleMode
                ? [
                    ["Enter Details", "Provide candidate details, resume, and job description."],
                    ["Select Role", "Pick from GenAI, React, or Java tracks."],
                    ["Generate Link", "System sends ACS email with access code."],
                  ]
                : [
                    ["Name the Test", "Use the correct test or role name shown to candidates."],
                    ["Set Level", "Choose easy, medium, or hard for the assessment."],
                    ["Add Emails and JD", "Candidates receive common/aptitude and JD-based technical questions."],
                  ]).map(([title, description], index) => (
                <div key={title} className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-lg bg-white shadow-sm border flex items-center justify-center font-bold text-slate-400">{index + 1}</div>
                  <div>
                    <p className="text-sm font-bold text-[#303030]">{title}</p>
                    <p className="text-xs text-slate-500">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Card className="lg:col-span-3 shadow-2xl border-none rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-white pb-8 pt-10 px-10">
              <CardTitle className="text-2xl font-black text-[#303030]">
                {isSingleMode ? "Candidate Information" : "Bulk Test Sharing"}
              </CardTitle>
              <CardDescription>
                {isSingleMode
                  ? "Fill in the candidate details and upload both PDFs."
                  : "Enter test details, paste candidate emails, and upload one job description PDF."}
              </CardDescription>
            </CardHeader>

            {isSingleMode ? (
              <form onSubmit={handleSingleSubmit}>
                <CardContent className="space-y-6 px-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-xs font-bold text-slate-500">Full Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g. Sarah Connor"
                        className="h-12 rounded-xl bg-slate-50 border-none focus:bg-white transition-all"
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
                        className="h-12 rounded-xl bg-slate-50 border-none focus:bg-white transition-all"
                        value={singleFormData.email}
                        onChange={(e) => setSingleFormData({ ...singleFormData, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role" className="text-xs font-bold text-slate-500">Interview Track / Role</Label>
                    <Select value={singleFormData.role} onValueChange={(v) => setSingleFormData({ ...singleFormData, role: v })}>
                      <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Generative AI Engineer">Generative AI Engineer</SelectItem>
                        <SelectItem value="React Engineer">React Engineer</SelectItem>
                        <SelectItem value="Java Engineer">Java Engineer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="singleDifficulty" className="text-xs font-bold text-slate-500">Assessment Difficulty</Label>
                    <Select value={singleFormData.difficulty} onValueChange={(v) => setSingleFormData({ ...singleFormData, difficulty: v })}>
                      <SelectTrigger id="singleDifficulty" className="h-12 rounded-xl bg-slate-50 border-none">
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy (Fundamentals)</SelectItem>
                        <SelectItem value="medium">Medium (Standard)</SelectItem>
                        <SelectItem value="hard">Hard (Advanced / Architect)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="resume" className="text-xs font-bold text-slate-500">Candidate Resume PDF</Label>
                      <Input
                        id="resume"
                        type="file"
                        accept="application/pdf"
                        className="h-12 rounded-xl bg-slate-50 border-none file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#056BFC]"
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
                        className="h-12 rounded-xl bg-slate-50 border-none file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#056BFC]"
                        onChange={(e) => setSingleJobDescriptionFile(e.target.files?.[0] || null)}
                        required
                      />
                      {singleJobDescriptionFile ? (
                        <p className="flex items-center gap-1 text-[11px] font-medium text-slate-500"><FileText className="h-3 w-3" /> {singleJobDescriptionFile.name}</p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-10 bg-slate-50/50">
                  <Button type="submit" className="w-full h-16 text-xl font-black bg-[#056BFC] hover:bg-[#024099] rounded-2xl shadow-xl hover:translate-y-[-2px] transition-all" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Registering...</> : "Generate Interview Link"}
                  </Button>
                </CardFooter>
              </form>
            ) : (
              <form onSubmit={handleBulkSubmit}>
                <CardContent className="space-y-6 px-10">
                  <div className="space-y-2">
                    <Label htmlFor="testName" className="text-xs font-bold text-slate-500">Test Name</Label>
                    <Input
                      id="testName"
                      placeholder="e.g. Java Developer Assessment"
                      className="h-12 rounded-xl bg-slate-50 border-none focus:bg-white transition-all"
                      value={bulkFormData.testName}
                      onChange={(e) => setBulkFormData({ ...bulkFormData, testName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bulkDifficulty" className="text-xs font-bold text-slate-500">Level</Label>
                    <Select value={bulkFormData.difficulty} onValueChange={(v) => setBulkFormData({ ...bulkFormData, difficulty: v })}>
                      <SelectTrigger id="bulkDifficulty" className="h-12 rounded-xl bg-slate-50 border-none">
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="emails" className="text-xs font-bold text-slate-500">Candidate Email IDs</Label>
                      <span className="text-[11px] font-bold text-[#056BFC]">{bulkEmailCount} entered</span>
                    </div>
                    <Textarea
                      id="emails"
                      placeholder={"candidate.one@company.com\ncandidate.two@company.com\ncandidate.three@company.com"}
                      className="min-h-36 rounded-xl bg-slate-50 border-none focus:bg-white transition-all"
                      value={bulkFormData.emails}
                      onChange={(e) => setBulkFormData({ ...bulkFormData, emails: e.target.value })}
                      required
                    />
                    <p className="text-[11px] text-slate-500">Separate emails with a new line, comma, semicolon, or space.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bulkJobDescription" className="text-xs font-bold text-slate-500">Job Description PDF</Label>
                    <Input
                      id="bulkJobDescription"
                      type="file"
                      accept="application/pdf"
                      className="h-12 rounded-xl bg-slate-50 border-none file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#056BFC]"
                      onChange={(e) => setBulkJobDescriptionFile(e.target.files?.[0] || null)}
                      required
                    />
                    {bulkJobDescriptionFile ? (
                      <p className="flex items-center gap-1 text-[11px] font-medium text-slate-500"><FileText className="h-3 w-3" /> {bulkJobDescriptionFile.name}</p>
                    ) : null}
                  </div>
                </CardContent>
                <CardFooter className="p-10 bg-slate-50/50">
                  <Button type="submit" className="w-full h-16 text-xl font-black bg-[#056BFC] hover:bg-[#024099] rounded-2xl shadow-xl hover:translate-y-[-2px] transition-all" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Sharing...</> : "Share Bulk Test"}
                  </Button>
                </CardFooter>
              </form>
            )}
          </Card>
        </div>
      </main>

      <footer className="py-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        Authorized TAG Access Only &bull; &copy; 2026 Aura Technologies
      </footer>
    </div>
  );
}
