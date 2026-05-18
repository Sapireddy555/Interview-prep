"use client";

import React, { useRef, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera } from "lucide-react";
import { validateAadharAction, createInterviewSession, getCandidate } from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getMockCandidate } from "@/lib/mock-db";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Smartphone, Upload, Scan, Info } from "lucide-react";

function VerifyAadharContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanAttempts, setScanAttempts] = useState(0);
  const [uniqueId, setUniqueId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("live-scan");
  const [candidateName, setCandidateName] = useState("Candidate");
  const [showBestWishPopup, setShowBestWishPopup] = useState(false);
  const [isRedirectingToInterview, setIsRedirectingToInterview] = useState(false);

  const MAX_SCAN_ATTEMPTS = 10;

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) {
      router.push("/login");
      return;
    }
    setUniqueId(id);

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setHasCameraPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Camera access denied:", error);
        setHasCameraPermission(false);
      }
    }
    
    if (activeTab === "live-scan") {
      setupCamera();
    }

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [router, searchParams, activeTab]);

  useEffect(() => {
    if (!uniqueId) return;

    let isCancelled = false;
    const candidateId = uniqueId;

    async function loadCandidateName() {
      try {
        const candidate = await getCandidate(candidateId);
        if (!isCancelled && candidate?.name) {
          setCandidateName(candidate.name);
          return;
        }
      } catch (error) {
        console.error("Failed to load candidate from DB:", error);
      }

      const mockCandidate = getMockCandidate(candidateId);
      if (!isCancelled) {
        setCandidateName(mockCandidate?.name || "Candidate");
      }
    }

    void loadCandidateName();

    return () => {
      isCancelled = true;
    };
  }, [uniqueId]);

  // Auto-Capture Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isScanning && activeTab === "live-scan") {
      interval = setInterval(() => {
        if (scanAttempts < MAX_SCAN_ATTEMPTS) {
          handleCaptureAndVerify(true);
          setScanAttempts(prev => prev + 1);
        } else {
          setIsScanning(false);
          toast({
            title: "Scan Timeout",
            description: "We couldn't verify your ID after several attempts. Please try manual upload or ensure better lighting.",
            variant: "destructive"
          });
        }
      }, 3000); // Try every 3 seconds
    }

    return () => clearInterval(interval);
  }, [isScanning, scanAttempts, activeTab]);

  const handleCaptureAndVerify = async (isAuto = false) => {
    if (!videoRef.current || !canvasRef.current || !uniqueId) return;

    if (!isAuto) setIsCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL("image/jpeg", 0.9);

      const ocrResult = await validateAadharAction({ imageUri: dataUri });
      
      if (ocrResult.success && ocrResult.data?.verified) {
        setIsScanning(false);
        toast({
          title: "Verification Successful",
          description: `Identity verified. Starting your session...`,
        });
        await proceedToInterview();
      } else if (!isAuto) {
        toast({
          variant: "destructive",
          title: "Verification Failed",
          description: ocrResult.data?.message || "Could not find a valid Aadhar card. Please try again.",
        });
      }
    } catch (error) {
      if (!isAuto) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "An unexpected error occurred during verification.",
        });
      }
    } finally {
      if (!isAuto) setIsCapturing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uniqueId) return;

    setIsCapturing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUri = reader.result as string;
      try {
        const ocrResult = await validateAadharAction({ imageUri: dataUri });
        if (ocrResult.success && ocrResult.data?.verified) {
          toast({ title: "Success", description: "Identity verified via uploaded document." });
          await proceedToInterview();
        } else {
          toast({
            variant: "destructive",
            title: "Verification Failed",
            description: ocrResult.data?.message || "Could not extract Aadhar details from the image.",
          });
        }
      } catch (err) {
        toast({ variant: "destructive", title: "Error", description: "Verification failed." });
      } finally {
        setIsCapturing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const proceedToInterview = async () => {
    if (!uniqueId) return;
    if (isRedirectingToInterview) return;

    setIsRedirectingToInterview(true);

    let candidate = null;

    try {
      candidate = await getCandidate(uniqueId);
    } catch (error) {
      console.error("Failed to fetch candidate from DB:", error);
    }

    candidate = candidate || getMockCandidate(uniqueId);
    if (!candidate) {
      setIsRedirectingToInterview(false);
      return;
    }

    const displayName = candidate.name || candidateName || "Candidate";
    setCandidateName(displayName);

    const sessionResult = await createInterviewSession({
      id: uniqueId,
      role: candidate.role,
      score: 0,
      duration: "0",
    });

    if (sessionResult.success && sessionResult.id) {
      const params = new URLSearchParams({
        role: candidate.role,
        difficulty: candidate.difficulty,
        interviewId: sessionResult.id,
        candidateName: displayName,
      });
      const candidateTopics = Array.isArray(candidate.topics) ? candidate.topics : [];
      if (candidateTopics.length) params.append("topics", candidateTopics.join(","));
      setShowBestWishPopup(true);
      window.setTimeout(() => {
        router.push(`/interview?${params.toString()}`);
      }, 5000);
      return;
    }

    setIsRedirectingToInterview(false);
  };

  return (
    <AppShell>
      <div className="flex justify-center max-w-4xl mx-auto px-4 py-8">
        <Card className="w-full border-none shadow-2xl bg-card/50 backdrop-blur-sm overflow-hidden">
          <CardHeader className="text-center space-y-2 pb-8 border-b bg-muted/30">
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-2">
              <Scan className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">Identity Verification</CardTitle>
            <CardDescription className="text-base max-w-md mx-auto">
              Please verify your Aadhar Identity to begin your AI-Proctored Interview.
            </CardDescription>
          </CardHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 w-full rounded-none h-14 bg-muted/50 p-1">
              <TabsTrigger value="live-scan" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Scan className="mr-2 h-4 w-4" /> Live Scan
              </TabsTrigger>
              <TabsTrigger value="upload" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Upload className="mr-2 h-4 w-4" /> Manual Upload
              </TabsTrigger>
              <TabsTrigger value="mobile" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Smartphone className="mr-2 h-4 w-4" /> Mobile Handoff
              </TabsTrigger>
            </TabsList>

            <CardContent className="p-8">
              <TabsContent value="live-scan" className="mt-0 space-y-6">
                {!hasCameraPermission ? (
                  <Alert variant="destructive">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Camera Required</AlertTitle>
                    <AlertDescription>
                      Please enable camera permissions in your browser to proceed with live verification.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-6">
                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border-4 border-muted/20 group">
                      <video autoPlay playsInline muted ref={videoRef} className="w-full h-full object-cover" />
                      <canvas ref={canvasRef} className="hidden" />
                      
                      {/* Scanning Overlay */}
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                         <div className={`w-2/3 h-1/2 border-2 rounded-xl transition-all duration-500 flex flex-col items-center justify-center
                           ${isScanning ? "border-primary shadow-[0_0_20px_rgba(59,130,246,0.5)] bg-primary/5" : "border-white/30 border-dashed"}
                         `}>
                             {isScanning && <div className="absolute top-0 w-full h-0.5 bg-primary animate-scanner" />}
                             <div className="text-white/80 text-xs font-medium uppercase tracking-widest mt-auto mb-4 bg-black/40 px-3 py-1 rounded-full backdrop-blur-md">
                                {isScanning ? "Scanning ID Card..." : "Place ID inside frame"}
                             </div>
                         </div>
                      </div>

                      {isScanning && (
                         <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10">
                            <div className="flex justify-between items-center mb-2">
                               <span className="text-xs text-white/80 font-medium tracking-tight">Verification Attempts</span>
                               <span className="text-xs text-primary font-bold">{scanAttempts} / {MAX_SCAN_ATTEMPTS}</span>
                            </div>
                            <Progress value={(scanAttempts/MAX_SCAN_ATTEMPTS)*100} className="h-1.5" />
                         </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {isScanning ? (
                        <Button variant="outline" size="lg" onClick={() => setIsScanning(false)} className="w-full bg-background hover:bg-muted text-foreground">
                          Stop Automatic Scan
                        </Button>
                      ) : (
                        <div className="flex gap-3">
                        <Button size="lg" className="flex-1 shadow-lg" onClick={() => { setScanAttempts(0); setIsScanning(true); }} disabled={isRedirectingToInterview}>
                          <Scan className="mr-2 h-5 w-5" /> Start Auto-Scan
                        </Button>
                          <Button variant="secondary" size="lg" onClick={() => handleCaptureAndVerify()} disabled={isCapturing || isRedirectingToInterview}>
                             {isCapturing ? <Loader2 className="animate-spin h-5 w-5" /> : <Camera className="h-5 w-5" />}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-sm text-muted-foreground bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                      <div className="bg-blue-500/10 p-2 rounded-lg">
                        <Info className="h-4 w-4 text-blue-600" />
                      </div>
                      <p><strong>Tip:</strong> Hold the Aadhar card steady in good lighting. Front-side only verification.</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="upload" className="mt-0">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted rounded-2xl p-12 bg-muted/10 hover:bg-muted/20 transition-all cursor-pointer relative group">
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="bg-primary/10 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Upload Aadhar Image</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                    Select a high-resolution photo of your Aadhar card front-side. JPEG and PNG supported.
                  </p>
                  <Button variant="outline" className="group-hover:bg-primary group-hover:text-white">Choose File</Button>
                </div>
              </TabsContent>

              <TabsContent value="mobile" className="mt-0">
                <div className="flex flex-col items-center p-8 bg-muted/20 rounded-2xl border">
                  <div className="bg-white p-6 rounded-2xl shadow-xl mb-8 relative">
                    <div className="w-48 h-48 bg-muted animate-pulse rounded-lg flex items-center justify-center">
                       <Smartphone className="h-24 w-24 text-muted-foreground/30" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <span className="bg-primary text-white text-xs px-2 py-1 rounded">QR Code Placeholder</span>
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-4">Scan with your Phone</h3>
                  <ol className="space-y-3 text-sm text-muted-foreground max-w-xs mb-8">
                    <li className="flex gap-3"><span className="font-bold text-primary">1.</span> Open your phone camera</li>
                    <li className="flex gap-3"><span className="font-bold text-primary">2.</span> Scan the QR code above</li>
                    <li className="flex gap-3"><span className="font-bold text-primary">3.</span> Follow instructions on your mobile device</li>
                  </ol>
                  <Button variant="link" className="text-primary hover:no-underline font-bold">Resend verification link via SMS</Button>
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>

           <CardFooter className="bg-muted/10 border-t p-6 flex justify-between items-center">
             <div className="flex items-center gap-6 opacity-60">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-green-500" />
                   <span className="text-xs font-semibold">SSL SECURE</span>
                </div>
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-blue-500" />
                   <span className="text-xs font-semibold">AI POWERED</span>
                </div>
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-gray-500" />
                   <span className="text-xs font-semibold">ISO 27001</span>
                </div>
             </div>
             <div className="flex items-center gap-4">
               <Button variant="ghost" size="sm" disabled={isRedirectingToInterview} onClick={() => {
                 if (confirm('Skip identity verification and continue to the interview?')) {
                   void proceedToInterview();
                 }
               }}>
                 {isRedirectingToInterview ? "Starting Interview..." : "Skip Verification"}
               </Button>
             </div>
          </CardFooter>
        </Card>
      </div>
      {showBestWishPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white px-8 py-10 text-center shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-primary">Interview Ready</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
              All the Best {candidateName}
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              Your interview will begin automatically in a few seconds.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function VerifyAadharPage() {
  return (
    <Suspense fallback={
      <AppShell>
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </AppShell>
    }>
      <VerifyAadharContent />
    </Suspense>
  );
}
