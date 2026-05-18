"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registerCandidateAction } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Copy, Mail, UserPlus, ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import organizationLogo from "@/assets/VMLogoWhite.png";

export default function RecruiterPortal() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [successData, setSuccessData] = useState<{ id: string, link: string, name: string, emailSent?: boolean, emailError?: string } | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobDescriptionFile, setJobDescriptionFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "Generative AI Engineer",
    difficulty: "medium"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = new FormData();
      payload.append("name", formData.name);
      payload.append("email", formData.email);
      payload.append("role", formData.role);
      payload.append("difficulty", formData.difficulty);
      if (resumeFile) payload.append("resume", resumeFile);
      if (jobDescriptionFile) payload.append("jobDescription", jobDescriptionFile);

      const result = await registerCandidateAction(payload);
      if (result.success && result.id && result.link) {
        setSuccessData({
          id: result.id,
          link: result.link,
          name: result.name || formData.name,
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
      console.error("Submit error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (successData) {
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
                      ? <>Invitation email sent to <span className="underline">{formData.email}</span>.</>
                      : <>Candidate registered, but ACS email was not sent: {successData.emailError || "email service is not configured"}.</>}
                </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button className="w-full h-14 text-lg font-bold bg-[#056BFC] hover:bg-[#024099] rounded-2xl" onClick={() => {
              setSuccessData(null);
              setResumeFile(null);
              setJobDescriptionFile(null);
            }}>
              Register Another Candidate
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
                <p className="text-[9px] uppercase font-bold text-[#056BFC] tracking-widest mt-0.5">Recruiter Hub</p>
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
                    <UserPlus className="h-3 w-3" /> Internal Tool
                </div>
                <h2 className="text-4xl font-black text-[#303030] tracking-tight leading-tight">
                    Register a New <br/>
                    <span className="text-[#056BFC]">Candidate</span>
                </h2>
                <p className="text-slate-500 leading-relaxed text-sm">
                    Register candidates here to trigger the interview workflow. The system uploads candidate documents, generates a unique test ID, and sends the invitation email.
                </p>
            </div>

            <div className="space-y-6">
                <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm border flex items-center justify-center font-bold text-slate-400">1</div>
                    <div>
                        <p className="text-sm font-bold text-[#303030]">Enter Details</p>
                        <p className="text-xs text-slate-500">Provide candidate details, resume, and job description.</p>
                    </div>
                </div>
                <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm border flex items-center justify-center font-bold text-slate-400">2</div>
                    <div>
                        <p className="text-sm font-bold text-[#303030]">Select Role</p>
                        <p className="text-xs text-slate-500">Pick from GenAI, React, or Java tracks.</p>
                    </div>
                </div>
                <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm border flex items-center justify-center font-bold text-slate-400">3</div>
                    <div>
                        <p className="text-sm font-bold text-[#303030]">Generate Link</p>
                        <p className="text-xs text-slate-500">System sends ACS email with access code.</p>
                    </div>
                </div>
            </div>
          </div>

          <Card className="lg:col-span-3 shadow-2xl border-none rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-white pb-8 pt-10 px-10">
              <CardTitle className="text-2xl font-black text-[#303030]">Candidate Information</CardTitle>
              <CardDescription>Fill in the details below to initialize the session.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6 px-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-xs font-bold text-slate-500">Full Name</Label>
                    <Input id="name" placeholder="e.g. Sarah Connor" className="h-12 rounded-xl bg-slate-50 border-none focus:bg-white transition-all" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-bold text-slate-500">Email Address</Label>
                    <Input id="email" type="email" placeholder="sarah@corp.com" className="h-12 rounded-xl bg-slate-50 border-none focus:bg-white transition-all" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role" className="text-xs font-bold text-slate-500">Interview Track / Role</Label>
                  <Select value={formData.role} onValueChange={(v) => setFormData({...formData, role: v})}>
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
                  <Label htmlFor="difficulty" className="text-xs font-bold text-slate-500">Assessment Difficulty</Label>
                  <Select value={formData.difficulty} onValueChange={(v) => setFormData({...formData, difficulty: v})}>
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none">
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
                      onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                      required
                    />
                    {resumeFile ? (
                      <p className="flex items-center gap-1 text-[11px] font-medium text-slate-500"><FileText className="h-3 w-3" /> {resumeFile.name}</p>
                    ) : null}
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
                </div>
              </CardContent>
              <CardFooter className="p-10 bg-slate-50/50">
                <Button type="submit" className="w-full h-16 text-xl font-black bg-[#056BFC] hover:bg-[#024099] rounded-2xl shadow-xl hover:translate-y-[-2px] transition-all" disabled={isLoading}>
                  {isLoading ? <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Registering...</> : "Generate Interview Link"}
                </Button>
              </CardFooter>
            </form>
          </Card>

        </div>
      </main>
      
      <footer className="py-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
         Authorized Recruiter Access Only • &copy; 2026 Aura Technologies
      </footer>
    </div>
  );
}
