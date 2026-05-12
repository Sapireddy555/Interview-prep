
"use client";

import { useSearchParams } from "next/navigation";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { saveInterviewSession, checkProctoring, generateAndSaveSummaryReport, uploadRecordingChunk, uploadViolationScreenshot } from "@/app/actions";
import { ROLE_BASED_QUESTIONS, FALLBACK_QUESTIONS } from "@/lib/interview-constants";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MicOff, Volume2, VolumeX, Loader2, ChevronRight } from "lucide-react";
import type { InterviewSettings, Message, SecurityEvent } from "@/lib/types";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAzureSpeech } from "@/hooks/use-azure-speech";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

export function InterviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [settings, setSettings] = useState<InterviewSettings | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionListState, setQuestionListState] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isRecordingControlled, setIsRecordingControlled] = useState(false);
  const controlledRecorderRef = useRef<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(60 * 60); // 60 minutes
  const [violations, setViolations] = useState<{ timestamp: string; message: string }[]>([]);
  const [showViolationsPanel, setShowViolationsPanel] = useState(false);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const interviewStartTime = useRef<Date | null>(null);
  const proctoringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const devtoolsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkIndexRef = useRef<number>(0);
  const violationsRef = useRef<{ timestamp: string; message: string }[]>([]);
  const securityEventsRef = useRef<SecurityEvent[]>([]);
  const suspicionScoreRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const proctorVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);

  const getRelativeTimestamp = () => {
    if (!interviewStartTime.current) return new Date().toISOString();
    const diff = Math.max(0, Date.now() - (interviewStartTime.current?.getTime() || 0));
    const mm = Math.floor(diff / 60000).toString().padStart(2, "0");
    const ss = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const addSecurityEvent = (type: SecurityEvent["type"], details?: string) => {
    const evt: SecurityEvent = { timestamp: getRelativeTimestamp(), type, details };
    securityEventsRef.current.push(evt);
  };

  const [showNextButton, setShowNextButton] = useState(false);

  const totalQuestionCount =
    questionListState.length || (ROLE_BASED_QUESTIONS[settings?.role || ""] || FALLBACK_QUESTIONS).length;

  const formattedRemainingTime = new Date(remainingSeconds * 1000).toISOString().substr(11, 8);

  const onFinalResult = useCallback((text: string) => {
    const msg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, msg]);
    setShowNextButton(true);
  }, []);

  const { isListening, isSpeaking, isVoiceEnabled, toggleVoice } = useAzureSpeech(onFinalResult, toast);

  const runProctoring = useCallback(async () => {
    if (!isMountedRef.current) return;
    const v = proctorVideoRef.current || videoRef.current;
    if (v && v.readyState >= 3) {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUri = canvas.toDataURL("image/jpeg");
        try {
          const res = await checkProctoring({ videoFrameDataUri: dataUri });
          if (res.success && res.data?.hasViolation) {
            const timestamp = getRelativeTimestamp();
            violationsRef.current.push({ timestamp, message: res.data.warningMessage });
            const eventType =
              res.data.violationType === "looking_away"
                ? "proctor_looking_away"
                : res.data.violationType === "typing"
                  ? "proctor_typing"
                  : res.data.violationType === "phone_detected"
                    ? "proctor_phone_detected"
                    : "visibility_visible";
            addSecurityEvent(eventType, res.data.violationType);

            toast({
              title: "Proctoring Warning",
              description: res.data.warningMessage,
              variant: "destructive",
            });

            try {
              const hiCanvas = document.createElement("canvas");
              const maxW = Math.min(1280, v.videoWidth || 1280);
              const maxH = Math.min(720, v.videoHeight || 720);
              hiCanvas.width = maxW;
              hiCanvas.height = maxH;
              const hiCtx = hiCanvas.getContext("2d");
              if (hiCtx) {
                hiCtx.drawImage(v, 0, 0, maxW, maxH);
                hiCanvas.toBlob(async (blob) => {
                  if (blob && interviewId) {
                    try {
                      const formData = new FormData();
                      formData.append("interviewId", interviewId);
                      formData.append("timestamp", timestamp);
                      formData.append("image", new File([blob], `violation_${interviewId}_${Date.now()}.png`, { type: blob.type || "image/png" }));
                      await uploadViolationScreenshot(formData);
                    } catch (e) {
                      console.error("Error uploading violation screenshot:", e);
                    }
                  }
                }, "image/png", 0.9);
              }
            } catch (e) {
              console.error("Error capturing/uploading hi-res screenshot:", e);
            }
          }
        } catch (err) {
          console.error('Error in proctoring check:', err);
        }
      }
    }
  }, [addSecurityEvent, getRelativeTimestamp, toast, interviewId]);

  const shuffleArray = (arr: string[]) => {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const handleInterviewCompletion = async (msgs: Message[] = messages) => {
    setIsCompleted(true);
    if (!interviewId) return;
    try {
      const durationSeconds = interviewStartTime.current ? Math.max(0, Math.floor((Date.now() - interviewStartTime.current.getTime()) / 1000)) : 0;
      const sessionPayload = {
        score: 0,
        duration: String(durationSeconds),
        feedback: [],
        transcript: msgs,
        violations: violationsRef.current,
        securityEvents: securityEventsRef.current,
        suspicionScore: suspicionScoreRef.current || 0,
      };
      await saveInterviewSession(interviewId, sessionPayload as any);
      await generateAndSaveSummaryReport(interviewId);
      toast({ title: 'Interview saved', description: 'Session data and report saved.' });
    } catch (err) {
      console.error('Error completing interview', err);
      toast({ title: 'Save failed', description: 'Could not save interview session', variant: 'destructive' });
    }
  };
  

  useEffect(() => {
    const id = searchParams.get("interviewId");

    const getCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        setHasCameraPermission(true);

        // Attach camera stream to a dedicated hidden proctor video element
        if (proctorVideoRef.current) {
          proctorVideoRef.current.srcObject = stream;
        }
        // Only set the visible video if not already set (so screen-share won't clobber the proctor stream)
        if (videoRef.current && !videoRef.current.srcObject) {
          videoRef.current.srcObject = stream;
        }

        if (id) {
            // keep audio stream for controlled per-question recordings
            const tracks = stream.getAudioTracks();
            if (tracks.length > 0) {
              setAudioStream(new MediaStream(tracks));
            } else {
              console.warn("No audio track available for recording");
            }
        }

        proctoringIntervalRef.current = setInterval(runProctoring, 5000);

        // timer
        timerRef.current = window.setInterval(() => setRemainingSeconds(s => Math.max(0, s - 1)), 1000);

        const onVisibility = () => {
          addSecurityEvent(document.hidden ? "visibility_hidden" : "visibility_visible");
        };
        const onBlur = () => addSecurityEvent("window_blur");
        const onFocus = () => addSecurityEvent("window_focus");
        const onCopy = () => addSecurityEvent("copy");
        const onCut = () => addSecurityEvent("cut");
        const onPaste = () => addSecurityEvent("paste");
        const onContextMenu = () => addSecurityEvent("context_menu");

        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("blur", onBlur);
        window.addEventListener("focus", onFocus);
        window.addEventListener("copy", onCopy);
        window.addEventListener("cut", onCut);
        window.addEventListener("paste", onPaste);
        window.addEventListener("contextmenu", onContextMenu);

        // Best-effort devtools detection (heuristic).
        devtoolsIntervalRef.current = setInterval(() => {
          const widthGap = Math.abs(window.outerWidth - window.innerWidth);
          const heightGap = Math.abs(window.outerHeight - window.innerHeight);
          if (widthGap > 160 || heightGap > 160) addSecurityEvent("devtools_suspected", `gap:${widthGap}x${heightGap}`);
        }, 2000);

        // Cleanup handler stored on ref via closure.
        (window as any).__auraSecCleanup = () => {
          document.removeEventListener("visibilitychange", onVisibility);
          window.removeEventListener("blur", onBlur);
          window.removeEventListener("focus", onFocus);
          window.removeEventListener("copy", onCopy);
          window.removeEventListener("cut", onCut);
          window.removeEventListener("paste", onPaste);
          window.removeEventListener("contextmenu", onContextMenu);
        };
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions in your browser settings to use this app.',
        });
      }
    };

    getCameraPermission();

    return () => {
        isMountedRef.current = false;
        if(proctoringIntervalRef.current) {
            clearInterval(proctoringIntervalRef.current);
        }
        if (devtoolsIntervalRef.current) {
          clearInterval(devtoolsIntervalRef.current);
        }
        if ((window as any).__auraSecCleanup) {
          try { (window as any).__auraSecCleanup(); } catch {}
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }
        if (controlledRecorderRef.current && controlledRecorderRef.current.state !== "inactive") {
          controlledRecorderRef.current.stop();
        }
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
    }
  }, [toast, runProctoring, searchParams]);

  const startControlledRecording = () => {
    if (!audioStream || !interviewId) return;
    try {
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
      } catch (e) {
        recorder = new MediaRecorder(audioStream);
      }
      controlledRecorderRef.current = recorder;
      setRecordedChunks([]);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) setRecordedChunks(prev => [...prev, e.data]);
      };
      recorder.onstop = async () => {
        if (!interviewId) return;
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('interviewId', interviewId);
        formData.append('chunkIndex', chunkIndexRef.current.toString());
        formData.append('chunk', new File([blob], `response_${currentQuestionIndex}.webm`, { type: blob.type }));
        chunkIndexRef.current++;
        try {
          await uploadRecordingChunk(formData);
        } catch (err) {
          console.error('Upload error', err);
        }
      };
      recorder.start();
      setIsRecordingControlled(true);
    } catch (err) {
      console.error('Start recording error', err);
    }
  };

  const stopControlledRecordingAndSubmit = async () => {
    if (controlledRecorderRef.current && controlledRecorderRef.current.state !== 'inactive') {
      controlledRecorderRef.current.stop();
    }
    setIsRecordingControlled(false);
    // advance to next question after uploading
    handleNextQuestion();
  };

  const handleRecordToggle = () => {
    if (!isRecordingControlled) startControlledRecording();
    else if (controlledRecorderRef.current && controlledRecorderRef.current.state !== "inactive") {
      controlledRecorderRef.current.stop();
      setIsRecordingControlled(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (isRecordingControlled) {
      await stopControlledRecordingAndSubmit();
      return;
    }

    handleNextQuestion();
  };

  useEffect(() => {
    // sync violations from ref to state for rendering
    const interval = setInterval(() => {
      if (violationsRef.current.length !== violations.length) {
        setViolations([...violationsRef.current]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [violations.length]);


  useEffect(() => {
    const role = searchParams.get("role");
    const difficulty = searchParams.get("difficulty") as InterviewSettings['difficulty'] | null;
    const id = searchParams.get("interviewId");

    if (role && difficulty && id) {
      setInterviewId(id);
      setSettings({ role, difficulty, topics: searchParams.get("topics") || "", questionBank: searchParams.get("questionBank") || "" });
      interviewStartTime.current = new Date();
      
      setIsLoading(true);
      const baseList = ROLE_BASED_QUESTIONS[role] || FALLBACK_QUESTIONS;
      const shuffled = shuffleArray(baseList);
      setQuestionListState(shuffled);
      const firstQuestion = shuffled[0] || baseList[0];
      const firstMessage: Message = { id: Date.now().toString(), role: "ai", content: firstQuestion };
      setMessages([firstMessage]);
      
      setTimeout(() => {
          setIsLoading(false);
      }, 1000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, toast]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const aiAvatar = PlaceHolderImages.find(img => img.id === 'ai-avatar');

  const handleNextQuestion = () => {
    const nextIndex = currentQuestionIndex + 1;
    const questionList = questionListState.length ? questionListState : (ROLE_BASED_QUESTIONS[settings?.role || ""] || FALLBACK_QUESTIONS);

    if (nextIndex < questionList.length) {
      const nextQuestion = questionList[nextIndex];
      const aiMessage: Message = { id: Date.now().toString(), role: 'ai', content: nextQuestion };
      setMessages(prev => [...prev, aiMessage]);
      setCurrentQuestionIndex(nextIndex);
      setShowNextButton(false);
    } else {
      handleInterviewCompletion(messages);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-full space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center">
          <p className="text-lg font-medium">Preparing your interview...</p>
          <p className="text-sm text-muted-foreground">Initializing protocols</p>
        </div>
      </div>
    );
  }

  const isLastMessageFromAI = messages.length > 0 && messages[messages.length - 1].role === 'ai';

  if (isCompleted) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border flex flex-col items-center space-y-6">
           <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
              </svg>
           </div>
           <h1 className="text-4xl font-black text-slate-900 tracking-tight">Interview Completed</h1>
           <p className="text-lg text-slate-500 max-w-md leading-relaxed">
             Thank you for your time. Your responses have been securely recorded and submitted for evaluation.
           </p>
           <div className="pt-8 w-full">
              <Button 
                size="lg" 
                onClick={() => window.close()} 
                className="w-full h-16 text-xl font-bold rounded-2xl shadow-xl bg-slate-900 hover:bg-slate-800 transition-all active:scale-95"
              >
                Close Interview
              </Button>
              <p className="mt-4 text-xs text-slate-400 font-medium">You can now safely close this tab or window.</p>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* hidden proctoring video to keep camera frames even during screen-share */}
      <video ref={proctorVideoRef} style={{ display: 'none' }} autoPlay muted playsInline />
      <div className="flex h-full min-h-0 flex-col rounded-[2rem] border border-slate-200/80 bg-card/70 p-4 shadow-xl backdrop-blur md:p-6">
        <div className="mb-4 flex flex-col gap-4 rounded-[1.75rem] border border-slate-200 bg-white/90 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary">Interview Session</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{settings?.role || "Interview"}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Question</p>
              <p className="font-mono font-semibold text-slate-900">
                {currentQuestionIndex + 1} / {totalQuestionCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Timer</p>
              <p className="font-mono font-semibold text-slate-900">{formattedRemainingTime}</p>
            </div>
            <Button variant="destructive" className="rounded-2xl px-5" onClick={() => handleInterviewCompletion(messages)}>
              End Interview
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
          <aside className="min-h-0 lg:sticky lg:top-0 lg:self-start">
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">Candidate View</p>
                  <p className="text-sm text-white/80">Camera remains fixed during the interview</p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-red-200">
                  <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  Live
                </div>
              </div>

              <div className="relative aspect-[4/5] bg-slate-900">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                {!hasCameraPermission && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90">
                    <div className="rounded-3xl border border-red-400/30 bg-red-500/10 px-6 py-5 text-center">
                      <VolumeX className="mx-auto mb-3 h-8 w-8 text-red-300" />
                      <p className="text-sm font-semibold text-red-100">Camera unavailable</p>
                      <p className="mt-1 text-xs text-red-100/70">Enable permissions to continue proctoring.</p>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-4 left-4 right-4 rounded-[1.5rem] border border-white/10 bg-black/45 p-4 backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/60">Recording Status</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {isRecordingControlled ? "Answer recording in progress" : "Ready for next response"}
                      </p>
                    </div>
                    <div className={`h-3 w-3 rounded-full ${isRecordingControlled ? "bg-red-400 animate-pulse" : "bg-emerald-400"}`} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-white/5 px-5 py-4 text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Mic</p>
                  <p className="mt-1 font-semibold text-white">{isListening ? "Active" : "Muted"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Violations</p>
                  <p className="mt-1 font-semibold text-white">{violations.length} detected</p>
                </div>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col gap-4">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Current Question</p>
                  <p className="mt-3 text-lg font-semibold leading-8 text-slate-900">{messages[messages.length - 1]?.content}</p>
                </div>
                <Button onClick={toggleVoice} variant="outline" size="sm" className="rounded-full bg-white" disabled={isSpeaking}>
                  {isVoiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex min-h-0 flex-col rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary">Interview Flow</p>
                    <p className="text-sm text-slate-500">Questions and captured candidate responses</p>
                  </div>
                </div>

                <ScrollArea className="min-h-0 flex-1 pr-4" ref={scrollAreaRef}>
                  <div className="space-y-6 pb-4">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex items-start gap-4 ${message.role === 'user' ? 'justify-end' : ''}`}>
                        {message.role === 'ai' && (
                          <Avatar className={`h-8 w-8 ring-1 ring-slate-200 ${isSpeaking && isLastMessageFromAI && message.id === messages[messages.length - 1].id ? "ring-2 ring-primary scale-105" : ""}`}>
                            <AvatarImage src={aiAvatar?.imageUrl} />
                            <AvatarFallback>AI</AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                            message.role === 'ai' ? 'bg-slate-50 text-slate-800 border border-slate-200' : 'bg-slate-900 text-white'
                          }`}
                        >
                          <p className="leading-relaxed">{message.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary">Response Controls</p>
                  <div className="mt-4 grid gap-3">
                    <Button onClick={handleRecordToggle} disabled={!audioStream} className="h-12 rounded-2xl">
                      {isRecordingControlled ? "Stop Recording" : "Record Answer"}
                    </Button>
                    <Button onClick={handleSubmitAnswer} variant="outline" className="h-12 rounded-2xl border-slate-300">
                      {currentQuestionIndex + 1 >= totalQuestionCount ? "Submit & Finish" : "Submit Answer"}
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Use record to capture your response, then submit to move to the next question. You can also submit without recording to skip.
                  </p>
                </div>

                <div
                  className={`rounded-[2rem] border-2 border-dashed p-5 transition-all ${
                    isListening ? "border-primary/40 bg-primary/[0.03]" : "border-slate-200 bg-slate-50/70"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isListening ? (
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="w-1 rounded-full bg-primary animate-pulse"
                            style={{ height: `${Math.random() * 20 + 5}px`, animationDelay: `${i * 150}ms` }}
                          />
                        ))}
                      </div>
                    ) : (
                      <MicOff className="h-4 w-4 text-slate-400" />
                    )}
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isListening ? "text-primary" : "text-slate-500"}`}>
                        {isListening ? "Live Audio Stream" : "Awaiting Input"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {isRecordingControlled ? "Recording answer now." : "Press record when you're ready to respond."}
                      </p>
                    </div>
                  </div>
                </div>

                {showNextButton && !isSpeaking && (
                  <Button
                    size="lg"
                    onClick={handleNextQuestion}
                    className="h-12 rounded-2xl bg-primary font-bold shadow-lg hover:bg-primary/90"
                  >
                    {currentQuestionIndex + 1 >= totalQuestionCount ? "Finish Interview" : "Proceed to Next Question"}
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                )}

                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary">Violation Monitor</p>
                      <p className="text-sm text-slate-500">{violations.length} events detected</p>
                    </div>
                    <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setShowViolationsPanel(v => !v)}>
                      {showViolationsPanel ? "Hide" : "Details"}
                    </Button>
                  </div>

                  {showViolationsPanel && (
                    <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs">
                      {violations.length === 0 ? (
                        <div className="text-muted-foreground">No violations detected.</div>
                      ) : (
                        <ul className="space-y-2">
                          {violations.map((v, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span className="font-mono text-slate-500">{v.timestamp}</span>
                              <span className="text-right font-semibold text-red-600">{v.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
