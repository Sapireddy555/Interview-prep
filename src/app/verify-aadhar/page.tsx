"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Camera, CheckCircle, Info, Loader2, ShieldCheck, UserCheck, VolumeX } from "lucide-react";
import { createInterviewSession, getCandidate, storeCandidateSelfieAction } from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getMockCandidate } from "@/lib/mock-db";

function SelfieVerificationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [uniqueId, setUniqueId] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState("Candidate");
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
  const [showReadyPopup, setShowReadyPopup] = useState(false);

  useEffect(() => {
    const id = searchParams.get("id")?.trim().toUpperCase();
    if (!id) {
      router.push("/login");
      return;
    }
    setUniqueId(id);

    let cancelled = false;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setHasCameraPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (error) {
        console.error("Camera access denied:", error);
        setHasCameraPermission(false);
      }
    }

    void setupCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [router, searchParams]);

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

  const captureSelfie = () => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 960;
    const height = video.videoHeight || 540;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.92);
  };

  const proceedToInterview = async (selfieDataUri: string) => {
    if (!uniqueId) return;

    setIsCapturing(true);

    try {
      const selfieResult = await storeCandidateSelfieAction({
        candidateId: uniqueId,
        imageUri: selfieDataUri,
      });

      if (!selfieResult.success) {
        throw new Error(selfieResult.error || "Could not store reference selfie.");
      }

      let candidate = null;
      try {
        candidate = await getCandidate(uniqueId);
      } catch (error) {
        console.error("Failed to fetch candidate from DB:", error);
      }

      candidate = candidate || getMockCandidate(uniqueId);
      if (!candidate) {
        throw new Error("Candidate details were not found.");
      }

      const displayName = candidate.name || candidateName || "Candidate";
      setCandidateName(displayName);

      const sessionResult = await createInterviewSession({
        id: uniqueId,
        role: candidate.role,
        score: 0,
        duration: "0",
      });

      if (!sessionResult.success || !sessionResult.id) {
        throw new Error(sessionResult.error || "Could not create interview session.");
      }

      const params = new URLSearchParams({
        role: candidate.role,
        difficulty: candidate.difficulty,
        interviewId: sessionResult.id,
        candidateId: uniqueId,
        candidateName: displayName,
      });
      const candidateTopics = Array.isArray(candidate.topics) ? candidate.topics : [];
      if (candidateTopics.length) params.append("topics", candidateTopics.join(","));

      setShowReadyPopup(true);
      window.setTimeout(() => {
        router.push(`/interview?${params.toString()}`);
      }, 2500);
    } catch (error) {
      toast({
        title: "Selfie not accepted",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      setCapturedSelfie(null);
      setIsCapturing(false);
    }
  };

  const proceedToInterviewWithoutSelfie = async () => {
    if (!uniqueId) return;
    if (!confirm("Skip selfie verification and continue to the interview?")) return;

    setIsCapturing(true);

    try {
      let candidate = null;
      try {
        candidate = await getCandidate(uniqueId);
      } catch (error) {
        console.error("Failed to fetch candidate from DB:", error);
      }

      candidate = candidate || getMockCandidate(uniqueId);
      if (!candidate) {
        throw new Error("Candidate details were not found.");
      }

      const displayName = candidate.name || candidateName || "Candidate";
      setCandidateName(displayName);

      const sessionResult = await createInterviewSession({
        id: uniqueId,
        role: candidate.role,
        score: 0,
        duration: "0",
      });

      if (!sessionResult.success || !sessionResult.id) {
        throw new Error(sessionResult.error || "Could not create interview session.");
      }

      const params = new URLSearchParams({
        role: candidate.role,
        difficulty: candidate.difficulty,
        interviewId: sessionResult.id,
        candidateName: displayName,
      });
      const candidateTopics = Array.isArray(candidate.topics) ? candidate.topics : [];
      if (candidateTopics.length) params.append("topics", candidateTopics.join(","));

      setShowReadyPopup(true);
      window.setTimeout(() => {
        router.push(`/interview?${params.toString()}`);
      }, 2500);
    } catch (error) {
      toast({
        title: "Unable to start interview",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      setIsCapturing(false);
    }
  };

  const handleCaptureAndContinue = async () => {
    const selfie = captureSelfie();
    if (!selfie) {
      toast({
        title: "Unable to capture selfie",
        description: "Please make sure your camera is active and try again.",
        variant: "destructive",
      });
      return;
    }

    setCapturedSelfie(selfie);
    await proceedToInterview(selfie);
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-5xl justify-center px-4 py-8">
        <Card className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <UserCheck className="h-6 w-6 text-[#056BFC]" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black tracking-tight text-slate-900">Selfie Verification</CardTitle>
                <CardDescription className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  Capture a clear reference selfie. At the start of the interview, Aura will compare your live camera image with this selfie before allowing the session to continue.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
            <div className="space-y-4">
              {!hasCameraPermission ? (
                <Alert variant="destructive">
                  <VolumeX className="h-4 w-4" />
                  <AlertTitle>Camera Required</AlertTitle>
                  <AlertDescription>Please enable camera permissions to capture your verification selfie.</AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <div className="relative aspect-video">
                    <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="h-[58%] w-[38%] rounded-[50%] border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.18)]" />
                    </div>
                    <div className="absolute left-3 top-3 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm">
                      Live Camera
                    </div>
                  </div>
                </div>
              )}

              <Alert className="border-blue-100 bg-blue-50 text-blue-900">
                <Info className="h-4 w-4" />
                <AlertTitle>Selfie quality matters</AlertTitle>
                <AlertDescription>
                  Face the camera directly, keep your face inside the oval, use good lighting, and make sure only you are visible. Aura will check that exactly one face is detectable before saving.
                </AlertDescription>
              </Alert>
            </div>

            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Candidate</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">{candidateName}</h2>
                <p className="mt-1 font-mono text-xs font-semibold text-[#056BFC]">{uniqueId}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Identity continuity check</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">This selfie will be matched against your live interview camera feed.</p>
                  </div>
                </div>
              </div>

              {capturedSelfie ? (
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">Captured reference</p>
                  <img src={capturedSelfie} alt="Captured selfie preview" className="mt-2 aspect-video w-full rounded-md object-cover" />
                </div>
              ) : null}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <p className="text-xs leading-5 text-slate-500">
              By continuing, you consent to selfie capture and identity matching for this interview session.
            </p>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Button
                variant="ghost"
                className="h-11 rounded-lg px-5 font-bold text-slate-600"
                disabled={isCapturing}
                onClick={proceedToInterviewWithoutSelfie}
              >
                Skip Verification
              </Button>
              <Button
                className="h-11 rounded-lg bg-[#056BFC] px-5 font-bold hover:bg-[#024099]"
                disabled={!hasCameraPermission || isCapturing}
                onClick={handleCaptureAndContinue}
              >
                {isCapturing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                {isCapturing ? "Preparing Interview..." : "Capture Selfie and Continue"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      {showReadyPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-xl bg-white px-8 py-10 text-center shadow-2xl">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" />
            <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-[#056BFC]">Reference Selfie Saved</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900">All the Best {candidateName}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Your interview will open shortly. Aura will confirm your face match before the first question.
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
      <SelfieVerificationContent />
    </Suspense>
  );
}
