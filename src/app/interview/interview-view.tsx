
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
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const interviewStartTime = useRef<Date | null>(null);
  const proctoringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkIndexRef = useRef<number>(0);
  const violationsRef = useRef<{ timestamp: string; message: string }[]>([]);
  const securityEventsRef = useRef<SecurityEvent[]>([]);
  const suspicionScoreRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const [showNextButton, setShowNextButton] = useState(false);
  const devtoolsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getRelativeTimestamp = useCallback(() => {
    if (!interviewStartTime.current) return "00:00";
    return new Date(Date.now() - interviewStartTime.current.getTime())
      .toISOString()
      .substring(14, 19);
  }, []);

  const addSecurityEvent = useCallback((type: SecurityEvent["type"], details?: string) => {
    const timestamp = getRelativeTimestamp();
    securityEventsRef.current.push({ timestamp, type, details });

    // Lightweight suspicion scoring (kept intentionally simple to avoid false positives).
    const weights: Record<SecurityEvent["type"], number> = {
      visibility_hidden: 10,
      visibility_visible: 0,
      window_blur: 6,
      window_focus: 0,
      copy: 4,
      cut: 2,
      paste: 6,
      context_menu: 2,
      devtools_suspected: 8,
      proctor_looking_away: 10,
      proctor_typing: 6,
      proctor_phone_detected: 20,
    };
    suspicionScoreRef.current = Math.min(100, suspicionScoreRef.current + (weights[type] ?? 0));
  }, [getRelativeTimestamp]);

  const handleInterviewCompletion = useCallback(async (finalTranscript: Message[]) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (!interviewId || !interviewStartTime.current) return;
  
    const endTime = new Date();
    const durationInMinutes = Math.round((endTime.getTime() - interviewStartTime.current.getTime()) / 60000);
  
    const sessionData = {
      score: 0, 
      duration: durationInMinutes.toString(),
      feedback: [], 
      transcript: finalTranscript,
      violations: violationsRef.current,
      securityEvents: securityEventsRef.current,
      suspicionScore: suspicionScoreRef.current,
    };
  
    const result = await saveInterviewSession(interviewId, sessionData);
  
    if (result.success) {
      // Logic for background report generation and storage upload
      generateAndSaveSummaryReport(interviewId);
      
      // Transition to final state immediately
      setIsCompleted(true);
    } else {
      toast({
        title: "Error",
        description: "Could not save your interview session. Please try again.",
        variant: "destructive",
      });
    }
  }, [interviewId, toast]);

  const processUserResponse = useCallback((responseText: string) => {
    if (!responseText.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: responseText };
    setMessages(prev => {
        const newMessages = [...prev, userMessage];
        setShowNextButton(true);
        return newMessages;
    });
  }, []);

  const { 
    isListening, 
    isSpeaking, 
    isVoiceEnabled, 
    toggleVoice, 
    speak, 
    startContinuous 
  } = useAzureSpeech(
    (text) => processUserResponse(text), 
    toast
  );

  const runProctoring = useCallback(async () => {
    if (!isMountedRef.current) return;
    if (videoRef.current && videoRef.current.readyState >= 3) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUri = canvas.toDataURL("image/jpeg");
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
          // Capture a higher-quality screenshot and upload it for record
          try {
            const hiCanvas = document.createElement("canvas");
            const maxW = Math.min(1280, videoRef.current.videoWidth || 1280);
            const maxH = Math.min(720, videoRef.current.videoHeight || 720);
            hiCanvas.width = maxW;
            hiCanvas.height = maxH;
            const hiCtx = hiCanvas.getContext("2d");
            if (hiCtx) {
              hiCtx.drawImage(videoRef.current, 0, 0, maxW, maxH);
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
      }
    }
  }, [addSecurityEvent, getRelativeTimestamp, toast, interviewId]);

  useEffect(() => {
    const id = searchParams.get("interviewId");

    const getCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        if (id) {
            // prefer audio-only uploads to reduce storage; keep video stream for proctoring
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
              const audioStream = new MediaStream(audioTracks);
              let mediaRecorder;
              try {
                mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
              } catch (e) {
                mediaRecorder = new MediaRecorder(audioStream);
              }
              mediaRecorderRef.current = mediaRecorder;

              mediaRecorder.ondataavailable = async (e) => {
                  if (e.data.size > 0 && id) {
                      const formData = new FormData();
                      formData.append("interviewId", id);
                      formData.append("chunkIndex", chunkIndexRef.current.toString());
                      formData.append("chunk", new File([e.data], "chunk.webm", { type: e.data.type }));
                      chunkIndexRef.current++;
                      uploadRecordingChunk(formData).catch(err => console.error("Upload chunk error:", err));
                  }
              };
              mediaRecorder.start(10000);
            } else {
              console.warn("No audio track available for recording");
            }
        }

        proctoringIntervalRef.current = setInterval(runProctoring, 5000);

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
    }
  }, [toast, runProctoring, searchParams]);


  useEffect(() => {
    const role = searchParams.get("role");
    const difficulty = searchParams.get("difficulty") as InterviewSettings['difficulty'] | null;
    const id = searchParams.get("interviewId");

    if (role && difficulty && id) {
      setInterviewId(id);
      setSettings({ role, difficulty, topics: searchParams.get("topics") || "", questionBank: searchParams.get("questionBank") || "" });
      interviewStartTime.current = new Date();
      
      setIsLoading(true);
      const questionList = ROLE_BASED_QUESTIONS[role] || FALLBACK_QUESTIONS;
      const firstQuestion = questionList[0];
      const firstMessage: Message = { id: Date.now().toString(), role: "ai", content: firstQuestion };
      setMessages([firstMessage]);
      
      setTimeout(() => {
          setIsLoading(false);
          speak(firstQuestion);
          setTimeout(startContinuous, 3000);
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
    const questionList = ROLE_BASED_QUESTIONS[settings?.role || ""] || FALLBACK_QUESTIONS;
    
    if (nextIndex < questionList.length) {
        const nextQuestion = questionList[nextIndex];
        const aiMessage: Message = { id: Date.now().toString(), role: 'ai', content: nextQuestion };
        setMessages(prev => [...prev, aiMessage]);
        setCurrentQuestionIndex(nextIndex);
        setShowNextButton(false);
        speak(nextQuestion);
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
    <div className="flex flex-col items-center h-full max-w-4xl mx-auto w-full">
      <div className="w-full flex-grow flex flex-col bg-card/40 backdrop-blur-md p-6 rounded-3xl border shadow-xl overflow-hidden relative">
        <div className="flex justify-between items-center mb-6 pb-4 border-b gap-6">
            <div className="flex-1">
                <h1 className="text-xl font-bold text-slate-900">{settings?.role}</h1>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Interviewer Protocol Active</p>
            </div>
            <div className="flex items-center gap-4">
                 <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Progress</p>
                    <p className="text-sm font-mono font-bold">{currentQuestionIndex + 1} / {(ROLE_BASED_QUESTIONS[settings?.role || ""] || FALLBACK_QUESTIONS).length}</p>
                 </div>
                 <div className="relative group">
                    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full animate-pulse z-10 flex items-center gap-1">
                        <div className="w-1 h-1 bg-white rounded-full" /> LIVE PROCTOR
                    </div>
                    <video 
                        ref={videoRef} 
                        className="h-32 w-44 rounded-2xl object-cover ring-4 ring-white shadow-2xl transition-all border-2 border-slate-100" 
                        autoPlay 
                        muted 
                    />
                    { !(hasCameraPermission) && (
                        <div className="absolute inset-0 bg-red-50 flex items-center justify-center rounded-2xl border-2 border-red-200">
                           <VolumeX className="h-8 w-8 text-red-400" />
                        </div>
                    )}
                 </div>
            </div>
        </div>

        <ScrollArea className="flex-grow mb-6 pr-4" ref={scrollAreaRef}>
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
                    <div className={`w-full py-6 px-8 rounded-3xl border-2 border-dashed transition-all duration-700 flex flex-col items-center gap-2
                        ${isListening ? "border-primary/40 bg-primary/[0.02] shadow-inner" : "border-slate-100 bg-slate-50/30"}
                    `}>
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
  );
}
