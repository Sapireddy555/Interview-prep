"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { registerBulkJobDescriptionTestAction } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, Copy, FileText, Loader2, Mail, Users } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import organizationLogo from "@/assets/VMLogoWhite.png";

type InvitationResult = {
  id: string;
  link: string;
  name: string;
  email: string;
  emailSent?: boolean;
  emailError?: string;
};

type SuccessData = {
  testName: string;
  invitations: InvitationResult[];
};

export default function RecruiterPortal() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [jobDescriptionFile, setJobDescriptionFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    testName: "",
    difficulty: "medium",
    emails: "",
  });

  const emailCount = useMemo(() => {
    return formData.emails
      .split(/[\s,;]+/)
      .map((email) => email.trim())
      .filter(Boolean).length;
  }, [formData.emails]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = new FormData();
      payload.append("testName", formData.testName);
      payload.append("difficulty", formData.difficulty);
      payload.append("emails", formData.emails);
      if (jobDescriptionFile) payload.append("jobDescription", jobDescriptionFile);

      const result = await registerBulkJobDescriptionTestAction(payload);
      if (result.success && result.invitations) {
        setSuccessData({
          testName: result.testName || formData.testName,
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
      console.error("Submit error:", error);
      toast({
        variant: "destructive",
        title: "Sharing Failed",
        description: "Could not create the bulk test invitations.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (successData) {
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
            <Button
              className="w-full h-14 text-lg font-bold bg-[#056BFC] hover:bg-[#024099] rounded-2xl"
              onClick={() => {
                setSuccessData(null);
                setJobDescriptionFile(null);
                setFormData({ testName: "", difficulty: "medium", emails: "" });
              }}
            >
              Share Another Bulk Test
            </Button>
            <Button variant="ghost" className="w-full text-slate-500" asChild>
              <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

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
                <Users className="h-3 w-3" /> Bulk Sharing
              </div>
              <h2 className="text-4xl font-black text-[#303030] tracking-tight leading-tight">
                Share a <br />
                <span className="text-[#056BFC]">Bulk Test</span>
              </h2>
              <p className="text-slate-500 leading-relaxed text-sm">
                Create one test from a job description and send it to multiple candidates. This format does not require resumes.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-lg bg-white shadow-sm border flex items-center justify-center font-bold text-slate-400">1</div>
                <div>
                  <p className="text-sm font-bold text-[#303030]">Name the Test</p>
                  <p className="text-xs text-slate-500">Use the correct test or role name shown to candidates.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-lg bg-white shadow-sm border flex items-center justify-center font-bold text-slate-400">2</div>
                <div>
                  <p className="text-sm font-bold text-[#303030]">Set Level</p>
                  <p className="text-xs text-slate-500">Choose easy, medium, or hard for the assessment.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-lg bg-white shadow-sm border flex items-center justify-center font-bold text-slate-400">3</div>
                <div>
                  <p className="text-sm font-bold text-[#303030]">Add Emails and JD</p>
                  <p className="text-xs text-slate-500">Candidates receive common/aptitude and JD-based technical questions.</p>
                </div>
              </div>
            </div>
          </div>

          <Card className="lg:col-span-3 shadow-2xl border-none rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-white pb-8 pt-10 px-10">
              <CardTitle className="text-2xl font-black text-[#303030]">Bulk Test Sharing</CardTitle>
              <CardDescription>Enter test details, paste candidate emails, and upload one job description PDF.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6 px-10">
                <div className="space-y-2">
                  <Label htmlFor="testName" className="text-xs font-bold text-slate-500">Test Name</Label>
                  <Input
                    id="testName"
                    placeholder="e.g. Java Developer Assessment"
                    className="h-12 rounded-xl bg-slate-50 border-none focus:bg-white transition-all"
                    value={formData.testName}
                    onChange={(e) => setFormData({ ...formData, testName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="difficulty" className="text-xs font-bold text-slate-500">Level</Label>
                  <Select value={formData.difficulty} onValueChange={(v) => setFormData({ ...formData, difficulty: v })}>
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none">
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
                    <span className="text-[11px] font-bold text-[#056BFC]">{emailCount} entered</span>
                  </div>
                  <Textarea
                    id="emails"
                    placeholder={"candidate.one@company.com\ncandidate.two@company.com\ncandidate.three@company.com"}
                    className="min-h-36 rounded-xl bg-slate-50 border-none focus:bg-white transition-all"
                    value={formData.emails}
                    onChange={(e) => setFormData({ ...formData, emails: e.target.value })}
                    required
                  />
                  <p className="text-[11px] text-slate-500">Separate emails with a new line, comma, semicolon, or space.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="jobDescription" className="text-xs font-bold text-slate-500">Job Description PDF</Label>
                  <Input
                    id="jobDescription"
                    type="file"
                    accept="application/pdf"
                    className="h-12 rounded-xl bg-slate-50 border-none file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#056BFC]"
                    onChange={(e) => setJobDescriptionFile(e.target.files?.[0] || null)}
                    required
                  />
                  {jobDescriptionFile ? (
                    <p className="flex items-center gap-1 text-[11px] font-medium text-slate-500"><FileText className="h-3 w-3" /> {jobDescriptionFile.name}</p>
                  ) : null}
                </div>
              </CardContent>
              <CardFooter className="p-10 bg-slate-50/50">
                <Button type="submit" className="w-full h-16 text-xl font-black bg-[#056BFC] hover:bg-[#024099] rounded-2xl shadow-xl hover:translate-y-[-2px] transition-all" disabled={isLoading}>
                  {isLoading ? <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Sharing...</> : "Share Bulk Test"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </main>

      <footer className="py-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        Authorized TAG Access Only &bull; &copy; 2026 Aura Technologies
      </footer>
    </div>
  );
}
