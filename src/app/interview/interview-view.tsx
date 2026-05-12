
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

  const onFinalResult = useCallback((text: string) => {
    const msg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, msg]);
    setShowNextButton(true);
  }, []);

  const { isListening, isSpeaking, isVoiceEnabled, toggleVoice, speak, startContinuous, stopContinuous } = useAzureSpeech(onFinalResult, toast);

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
    else stopControlledRecordingAndSubmit();
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
      // Keep the first two questions fixed (general intro), randomize the rest starting from index 2
      const firstTwo = baseList.slice(0, 2);
      const remainder = baseList.slice(2);
      const shuffledRemainder = shuffleArray(remainder);
      const finalList = firstTwo.concat(shuffledRemainder);
      setQuestionListState(finalList);
      const firstQuestion = finalList[0] || baseList[0];
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
  const BUILD_TAG = "fcb2e8b"; // temporary debug badge to confirm running build

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
    <div className="flex flex-col items-center h-full max-w-6xl mx-auto w-full">
      <div className="fixed left-4 bottom-4 z-50">
        <div className="text-[10px] font-mono bg-slate-800 text-white px-2 py-1 rounded-md shadow">BUILD {BUILD_TAG}</div>
      </div>
      {/* hidden proctoring video to keep camera frames even during screen-share */}
      <video ref={proctorVideoRef} style={{ display: 'none' }} autoPlay muted playsInline />
      <div className="w-full flex-grow flex bg-card/40 backdrop-blur-md p-6 rounded-3xl border shadow-xl overflow-hidden relative">
        <div className="w-full flex gap-6 h-full">
          {/* Left: Large fixed candidate video and message timeline */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="rounded-2xl overflow-hidden bg-black relative h-96 md:h-[520px]">
              <div className="absolute top-4 left-4 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full z-10">LIVE PROCTOR</div>
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
              { !hasCameraPermission && (
                <div className="absolute inset-0 bg-red-50 flex items-center justify-center">
                  <VolumeX className="h-12 w-12 text-red-400" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <ScrollArea className="h-full mt-2" ref={scrollAreaRef}>
                <div className="space-y-6 pb-4">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex items-start gap-4 ${message.role === 'user' ? 'justify-end' : ''}`}>
                      {message.role === 'ai' && (
                        <Avatar className={`h-8 w-8 ring-1 ring-slate-200 ${isSpeaking && isLastMessageFromAI && message.id === messages[messages.length-1].id ? "ring-2 ring-primary scale-105" : ""}`}>
                          <AvatarImage src={aiAvatar?.imageUrl} />
                          <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                      )}
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                          message.role === 'ai' ? 'bg-white text-slate-800' : 'bg-slate-900 text-white'
                      }`}>
                        <p className="leading-relaxed">{message.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Right: Sidebar with interview header, question, controls, violations */}
          <aside className="w-96 flex-shrink-0 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold">{settings?.role}</h1>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Interviewer Protocol Active</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Progress</div>
                <div className="text-sm font-mono font-bold">{currentQuestionIndex + 1} / {(questionListState.length || (ROLE_BASED_QUESTIONS[settings?.role || ""] || FALLBACK_QUESTIONS).length)}</div>
                <div className="mt-2 flex items-center gap-2 justify-end">
                  <div className="text-sm font-mono">{new Date(remainingSeconds * 1000).toISOString().substr(11, 8)}</div>
                  <Button size="sm" variant="destructive" onClick={() => handleInterviewCompletion(messages)}>End Interview</Button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-white rounded-xl shadow-sm border">
              <h3 className="text-sm font-semibold mb-1">Question</h3>
              <p className="text-sm text-slate-700">{messages[messages.length - 1]?.content}</p>
            </div>

            <div className="p-3 bg-white rounded-xl border flex flex-col gap-3">
              <Button onClick={handleRecordToggle} disabled={!audioStream} className="w-full">
                {isRecordingControlled ? 'Stop & Submit' : 'Record My Answer'}
              </Button>
              <p className="text-xs text-muted-foreground">* If unsure of your answer, press Submit to move on.</p>
            </div>

            <div className="p-3 rounded-xl bg-white border flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">Violations</div>
                <div className="text-xs text-muted-foreground">{violations.length} detected</div>
              </div>
              <div>
                <Button size="sm" variant="ghost" onClick={() => setShowViolationsPanel(v => !v)}>
                  {showViolationsPanel ? 'Hide' : 'Details'}
                </Button>
              </div>
            </div>

            {showViolationsPanel && (
              <div className="p-3 bg-red-50 rounded-xl border text-xs">
                {violations.length === 0 ? (
                  <div className="text-muted-foreground">No violations detected.</div>
                ) : (
                  <ul className="space-y-2">
                    {violations.map((v, i) => (
                      <li key={i} className="flex justify-between">
                        <span className="text-xs">{v.timestamp}</span>
                        <span className="text-xs font-semibold text-red-600">{v.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </div>

        <div className="mt-auto pt-6 border-t flex flex-col gap-4">
            {showNextButton && !isSpeaking ? (
                <Button 
                    size="lg" 
                    onClick={handleNextQuestion}
                    className="w-full h-14 text-lg font-bold rounded-2xl shadow-lg hover:translate-y-[-2px] transition-all bg-primary hover:bg-primary/90"
                >
                    {currentQuestionIndex + 1 >= (ROLE_BASED_QUESTIONS[settings?.role || ""] || FALLBACK_QUESTIONS).length ? "Finish Interview" : "Proceed to Next Question"}
                    <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
            ) : (
                <div className="flex flex-col items-center">
                    <div className={`w-full py-6 px-8 rounded-3xl border-2 border-dashed transition-all duration-700 flex flex-col items-center gap-2 ${isListening ? "border-primary/40 bg-primary/[0.02] shadow-inner" : "border-slate-100 bg-slate-50/30"}`}>
                        <div className="flex items-center gap-3">
                            {isListening ? (
                                <div className="flex gap-1">
                                    {[1,2,3,4].map(i => (
                                        <div key={i} className="w-1 bg-primary rounded-full animate-pulse" style={{ height: `${Math.random()*20 + 5}px`, animationDelay: `${i*150}ms` }} />
                                    ))}
                                </div>
                            ) : <MicOff className="h-4 w-4 text-slate-300" />}
                            <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isListening ? "text-primary" : "text-slate-400"}`}>
                                {isListening ? "Live Audio Stream" : "Awaiting Input"}
                            </span>
                        </div>
                        <div className="h-4" />
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full">
                        <div className={`w-1.5 h-1.5 rounded-full ${isListening ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} />
                        <span className="text-[9px] font-black text-slate-500 uppercase">Mic {isListening ? "Active" : "Muted"}</span>
                        </div>
                </div>
                
                <div className="flex gap-2">
                        <Button onClick={toggleVoice} variant="outline" size="sm" className="h-8 w-8 p-0 rounded-full bg-white" disabled={isSpeaking}>
                        {isVoiceEnabled ? <Volume2 className="h-4 w-4"/> : <VolumeX className="h-4 w-4"/>}
                    </Button>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
