"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import organizationLogo from "@/assets/VMLogoWhite.png";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import { validateCandidateUniqueId } from "@/app/actions";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [uniqueId, setUniqueId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await validateCandidateUniqueId(uniqueId);
      if (result.success) {
        toast({
          title: "Credential Accepted",
          description: "Proceeding to Aadhar verification...",
        });
        router.push(`/verify-aadhar?id=${uniqueId.trim().toUpperCase()}`);
      } else {
        toast({
          variant: "destructive",
          title: "Invalid Unique ID",
          description: result.error || "Please check the interview link or ID provided to you.",
        });
        setIsLoading(false);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unable to Validate",
        description: "Please try again or contact the recruiter.",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:flex flex-col items-start justify-center space-y-8 bg-gradient-to-br from-[#056BFC]/20 to-[#3FD534]/30 p-12 text-foreground">
        <div className="flex items-center gap-6">
          <Image src={organizationLogo} alt="ValueMomentum Logo" className="h-8 w-auto object-contain" />
          <div className="w-px h-10 bg-black/10" />
          <div className="flex items-center gap-2">
             <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center text-[#056BFC] font-black text-lg shadow-sm">A</div>
             <h1 className="text-3xl font-bold tracking-tight text-[#303030]">Aura</h1>
          </div>
        </div>
        <h2 className="text-5xl font-black tracking-tighter text-[#303030] leading-none">
          The Future of <br/>
          <span className="text-[#056BFC]">AI Interviews</span>
        </h2>
        <ul className="space-y-4 text-lg text-muted-foreground">
          <li className="flex items-start gap-3">
            <CheckCircle className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <span>
              Enter the unique ID provided in your invitation email to begin.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <span>
              Ensure you have your Aadhar card ready for mandatory OCR verification on the next step.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <span>
              The session will be fully recorded as per organization guidelines.
            </span>
          </li>
        </ul>
      </div>
      <div className="flex items-center justify-center p-4">
        <Card className="w-full max-w-sm shadow-2xl">
          <CardHeader className="text-center">
            <div className="mb-4 flex justify-center lg:hidden">
                <Image src={organizationLogo} alt="Organization Logo" className="h-10 w-auto object-contain" />
            </div>
            <CardTitle className="text-2xl font-bold text-[#303030]">Candidate Login</CardTitle>
            <CardDescription>
              Securely enter your unique Aura Interview ID.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="uniqueId">Unique ID</Label>
                <Input
                  id="uniqueId"
                  placeholder="e.g. cand-se-001"
                  className="focus:ring-[#056BFC]"
                  value={uniqueId}
                  onChange={(e) => setUniqueId(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="text-xs text-muted-foreground bg-slate-50 p-3 rounded-lg border border-dashed">
                  <p className="font-medium">Use the unique ID from your invitation email.</p>
                  <p>Your name, role, and test configuration will be loaded securely after validation.</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-[#056BFC] hover:bg-[#024099] shadow-lg h-12 text-lg font-bold" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? "Validating..." : "Enter Session"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
