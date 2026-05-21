
"use client";

import { useSearchParams } from "next/navigation";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { saveInterviewSession, checkProctoring, generateAndSaveSummaryReport, uploadRecordingChunk, uploadViolationScreenshot, fetchInterviewQuestionBank } from "@/app/actions";
import { getInterviewQuestionSetForRole, INTERVIEW_SECTION_TITLES } from "@/lib/interview-constants";
import type { InterviewQuestion } from "@/lib/interview-constants";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MicOff, Volume2, VolumeX, Loader2 } from "lucide-react";
import type { InterviewSettings, Message, SecurityEvent } from "@/lib/types";
import { useAzureSpeech } from "@/hooks/use-azure-speech";
import { useToast } from "@/hooks/use-toast";
import organizationLogo from "@/assets/VMLogoWhite.png";

export function InterviewView() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [settings, setSettings] = useState<InterviewSettings | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionListState, setQuestionListState] = useState<InterviewQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isRecordingControlled, setIsRecordingControlled] = useState(false);
  const controlledRecorderRef = useRef<MediaRecorder | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(60 * 60); // 60 minutes
  const [violations, setViolations] = useState<{ timestamp: string; message: string }[]>([]);
  const [showViolationsPanel, setShowViolationsPanel] = useState(false);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasAcceptedConsent, setHasAcceptedConsent] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [consents, setConsents] = useState({
    integrity: false,
    devices: false,
    recording: false,
  });
  const [draftResponse, setDraftResponse] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const interviewStartTime = useRef<Date | null>(null);
  const proctoringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const devtoolsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fullInterviewRecorderRef = useRef<MediaRecorder | null>(null);
  const fullRecordingChunkIndexRef = useRef<number>(0);
  const recordingUploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const recordingUploadErrorRef = useRef<Error | null>(null);
  const violationsRef = useRef<{ timestamp: string; message: string }[]>([]);
  const securityEventsRef = useRef<SecurityEvent[]>([]);
  const suspicionScoreRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const proctorVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const autoCloseTimeoutRef = useRef<number | null>(null);

  const closeInterviewWindow = useCallback(() => {
    window.open("", "_self");
    window.close();
  }, []);

  const getRelativeTimestamp = useCallback(() => {
    if (!interviewStartTime.current) return new Date().toISOString();
    const diff = Math.max(0, Date.now() - (interviewStartTime.current?.getTime() || 0));
    const mm = Math.floor(diff / 60000).toString().padStart(2, "0");
    const ss = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }, []);

  const addSecurityEvent = useCallback((type: SecurityEvent["type"], details?: string) => {
    const evt: SecurityEvent = { timestamp: getRelativeTimestamp(), type, details };
    securityEventsRef.current.push(evt);
  }, [getRelativeTimestamp]);

  const attachCameraStream = useCallback((stream: MediaStream | null = cameraStreamRef.current) => {
    if (!stream) return;

    if (proctorVideoRef.current && proctorVideoRef.current.srcObject !== stream) {
      proctorVideoRef.current.srcObject = stream;
    }

    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch((error) => {
        console.warn("Unable to autoplay candidate camera preview:", error);
      });
    }
  }, []);

  const totalQuestionCount =
    questionListState.length || getInterviewQuestionSetForRole(settings?.role || "", settings?.questionBank).length;

  const formattedRemainingTime = `${Math.floor(remainingSeconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((remainingSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(remainingSeconds % 60).toString().padStart(2, "0")}`;

  const currentQuestionMeta = questionListState[currentQuestionIndex];
  const currentSectionTitle = currentQuestionMeta?.sectionTitle || INTERVIEW_SECTION_TITLES.communication;
  const timerTone =
    remainingSeconds <= 10 * 60
      ? {
          wrapper: "border-red-200 bg-red-50",
          label: "text-red-700",
          value: "text-red-700",
        }
      : remainingSeconds <= 30 * 60
        ? {
            wrapper: "border-amber-200 bg-amber-50",
            label: "text-amber-700",
            value: "text-amber-700",
          }
        : {
            wrapper: "border-emerald-200 bg-emerald-50",
            label: "text-emerald-700",
            value: "text-emerald-700",
          };

  const sectionQuestionCounts = questionListState.reduce<Record<string, number>>((acc, question) => {
    acc[question.sectionTitle] = (acc[question.sectionTitle] || 0) + 1;
    return acc;
  }, {});

  const currentSectionQuestionNumber = questionListState
    .slice(0, currentQuestionIndex + 1)
    .filter((question) => question.sectionTitle === currentSectionTitle).length;

  const onFinalResult = useCallback((text: string) => {
    setDraftResponse(text.trim());
  }, []);

  const { isListening, isSpeaking, isVoiceEnabled, toggleVoice, startContinuous, stopContinuous, resetTranscript } =
    useAzureSpeech(onFinalResult, toast);

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

  const startFullInterviewRecording = useCallback((stream: MediaStream, id: string) => {
    if (fullInterviewRecorderRef.current?.state === "recording") return;

    try {
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      fullRecordingChunkIndexRef.current = 0;
      recordingUploadChainRef.current = Promise.resolve();
      recordingUploadErrorRef.current = null;
      fullInterviewRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;

        const chunkIndex = fullRecordingChunkIndexRef.current;
        const formData = new FormData();
        formData.append("interviewId", id);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("chunk", new File([event.data], `interview_${id}_${chunkIndex}.webm`, {
          type: event.data.type || "video/webm",
        }));
        fullRecordingChunkIndexRef.current += 1;

        recordingUploadChainRef.current = recordingUploadChainRef.current
          .then(async () => {
            const result = await uploadRecordingChunk(formData);
            if (!result.success) {
              throw new Error(result.error || `Recording chunk ${chunkIndex} upload failed.`);
            }
          })
          .catch((error) => {
            console.error("Full interview recording upload failed:", error);
            recordingUploadErrorRef.current = error instanceof Error ? error : new Error(String(error));
          });
      };

      recorder.start(10000);
    } catch (error) {
      console.error("Unable to start full interview recording:", error);
      toast({
        title: "Recording unavailable",
        description: "The interview can continue, but the full recording could not be started.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopFullInterviewRecording = useCallback(async () => {
    const recorder = fullInterviewRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const previousOnStop = recorder.onstop;
        recorder.onstop = (event) => {
          previousOnStop?.call(recorder, event);
          resolve();
        };

        try {
          recorder.requestData();
        } catch (error) {
          console.warn("Unable to request final recording data:", error);
        }

        recorder.stop();
      });
    }

    await recordingUploadChainRef.current;
    if (recordingUploadErrorRef.current) {
      throw recordingUploadErrorRef.current;
    }
  }, []);

  const handleInterviewCompletion = async (msgs: Message[] = messages) => {
    if (!interviewId) return;
    let recordingWarning: string | null = null;
    try {
      try {
        await stopFullInterviewRecording();
      } catch (recordingError) {
        console.error("Recording upload failed, continuing with interview save:", recordingError);
        recordingWarning = recordingError instanceof Error ? recordingError.message : String(recordingError);
      }
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
      const reportResult = await generateAndSaveSummaryReport(interviewId);
      if (!reportResult.success) {
        throw new Error(reportResult.error || "Report generation or upload failed.");
      }
      setIsCompleted(true);
      const storageWarning = recordingWarning || reportResult.storageWarning;
      toast({
        title: 'Interview saved',
        description: storageWarning ? 'Session saved. Azure Storage needs attention.' : 'Session data and report saved.',
      });
    } catch (err) {
      console.error('Error completing interview', err);
      toast({ title: 'Save failed', description: 'Could not save interview session', variant: 'destructive' });
    }
  };
  

  useEffect(() => {
    isMountedRef.current = true;
    const id = searchParams.get("interviewId");

    const getCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        setHasCameraPermission(true);
        cameraStreamRef.current = stream;
        setCameraStream(stream);
        attachCameraStream(stream);

        if (id) {
            startFullInterviewRecording(stream, id);

            // keep audio stream for controlled per-question recordings
            const tracks = stream.getAudioTracks();
            if (tracks.length > 0) {
              setAudioStream(new MediaStream(tracks));
            } else {
              console.warn("No audio track available for recording");
            }
        }

        proctoringIntervalRef.current = setInterval(runProctoring, 3000);

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
        if (controlledRecorderRef.current && controlledRecorderRef.current.state !== "inactive") {
          controlledRecorderRef.current.stop();
        }
        void stopFullInterviewRecording();
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
    }
  }, [toast, runProctoring, searchParams, startFullInterviewRecording, stopFullInterviewRecording]);

  useEffect(() => {
    if (!hasAcceptedConsent || !cameraStream) return;
    attachCameraStream(cameraStream);
  }, [attachCameraStream, cameraStream, hasAcceptedConsent]);

  useEffect(() => {
    if (!interviewId || isCompleted) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [interviewId, isCompleted]);

  useEffect(() => {
    if (remainingSeconds === 0 && !isCompleted) {
      handleInterviewCompletion(messages);
    }
  }, [isCompleted, messages, remainingSeconds]);

  useEffect(() => {
    if (!isCompleted) return;

    autoCloseTimeoutRef.current = window.setTimeout(() => {
      closeInterviewWindow();
    }, 5000);

    return () => {
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current);
        autoCloseTimeoutRef.current = null;
      }
    };
  }, [closeInterviewWindow, isCompleted]);

  const startControlledRecording = () => {
    if (!audioStream || !interviewId) return;
    try {
      recordedChunksRef.current = [];
      resetTranscript();
      setDraftResponse("");
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
      } catch (e) {
        recorder = new MediaRecorder(audioStream);
      }
      controlledRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.start();
      startContinuous();
      setIsRecordingControlled(true);
    } catch (err) {
      console.error('Start recording error', err);
    }
  };

  const stopControlledRecording = async () => {
    if (controlledRecorderRef.current && controlledRecorderRef.current.state !== 'inactive') {
      controlledRecorderRef.current.stop();
    }
    stopContinuous();
    setIsRecordingControlled(false);
  };

  const handleRecordToggle = () => {
    if (!isRecordingControlled) startControlledRecording();
    else {
      void stopControlledRecording();
    }
  };

  const handleSubmitAnswer = async () => {
    if (isRecordingControlled) {
      await stopControlledRecording();
      toast({
        title: "Recording stopped",
        description: "Review or edit your response, then click Submit Answer.",
      });
      return;
    }

    const trimmedResponse = draftResponse.trim();
    if (!trimmedResponse) {
      toast({
        title: "No response entered",
        description: "Record or type a response before submitting, or use Skip Question.",
        variant: "destructive",
      });
      return;
    }

    const updatedMessages = [
      ...messages,
      { id: `${Date.now()}_user`, role: "user" as const, content: trimmedResponse },
    ];

    setMessages(updatedMessages);
    setDraftResponse("");
    resetTranscript();
    handleNextQuestion(updatedMessages);
  };

  const handleSkipQuestion = async () => {
    if (isRecordingControlled) {
      await stopControlledRecording();
    }

    setDraftResponse("");
    resetTranscript();
    handleNextQuestion(messages);
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
    let cancelled = false;

    async function initializeInterview() {
      const role = searchParams.get("role");
      const difficulty = searchParams.get("difficulty") as InterviewSettings['difficulty'] | null;
      const id = searchParams.get("interviewId");

      if (role && difficulty && id) {
        setInterviewId(id);
        const fallbackQuestionBank = searchParams.get("questionBank") || "";
        const questionBankResult = await fetchInterviewQuestionBank(id);
        if (cancelled) return;

        const questionBank = questionBankResult.success && questionBankResult.questionBank
          ? questionBankResult.questionBank
          : fallbackQuestionBank;
        setSettings({ role, difficulty, topics: searchParams.get("topics") || "", questionBank });
        interviewStartTime.current = new Date();
        
        setIsLoading(true);
        const orderedQuestionList = getInterviewQuestionSetForRole(role, questionBank);
        setQuestionListState(orderedQuestionList);
        setCurrentQuestionIndex(0);
        const firstQuestion = orderedQuestionList[0];
        const firstMessage: Message = {
          id: Date.now().toString(),
          role: "ai",
          content: firstQuestion?.prompt ?? "Tell me about yourself.",
          sectionId: firstQuestion?.sectionId,
          sectionTitle: firstQuestion?.sectionTitle,
        };
        setMessages([firstMessage]);
        setDraftResponse("");
        setRemainingSeconds(60 * 60);
        resetTranscript();
        
        setTimeout(() => {
          if (!cancelled) setIsLoading(false);
        }, 1000);
      }
    }

    void initializeInterview();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, toast]);

  const handleNextQuestion = (updatedMessages: Message[] = messages) => {
    const nextIndex = currentQuestionIndex + 1;
    const questionList =
      questionListState.length
        ? questionListState
        : getInterviewQuestionSetForRole(settings?.role || "", settings?.questionBank);

    if (nextIndex < questionList.length) {
      const nextQuestion = questionList[nextIndex];
      const aiMessage: Message = {
        id: Date.now().toString(),
        role: 'ai',
        content: nextQuestion.prompt,
        sectionId: nextQuestion.sectionId,
        sectionTitle: nextQuestion.sectionTitle,
      };
      setMessages([...updatedMessages, aiMessage]);
      setCurrentQuestionIndex(nextIndex);
    } else {
      handleInterviewCompletion(updatedMessages);
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

  const currentQuestion = [...messages].reverse().find((message) => message.role === "ai");
  const isMicActive = isRecordingControlled || isListening;
  const allConsentsAccepted = Object.values(consents).every(Boolean);

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
                onClick={closeInterviewWindow} 
                className="w-full h-16 text-xl font-bold rounded-2xl shadow-xl bg-slate-900 hover:bg-slate-800 transition-all active:scale-95"
              >
                Close Interview
              </Button>
              <p className="mt-4 text-xs text-slate-400 font-medium">This window will close automatically in 5 seconds.</p>
           </div>
        </div>
      </div>
    );
  }

  if (!hasAcceptedConsent) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-4 border-b border-slate-200 px-6 py-4">
            <Image
              src={organizationLogo}
              alt="ValueMomentum Logo"
              className="h-6 w-auto object-contain"
            />
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <p className="text-sm font-black leading-none text-slate-900">Aura Interview</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#056BFC]">Candidate Consent</p>
            </div>
          </div>

          <div className="p-6 md:p-7">
          <div className="mb-5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Before You Start</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Please confirm the interview integrity requirements. The test will begin after all acknowledgements are selected.
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <Checkbox
                checked={consents.integrity}
                onCheckedChange={(checked) => setConsents((current) => ({ ...current, integrity: checked === true }))}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">I will complete this interview honestly.</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">I will not receive help from another person or use unauthorized assistance.</span>
              </span>
            </label>

            <label className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <Checkbox
                checked={consents.devices}
                onCheckedChange={(checked) => setConsents((current) => ({ ...current, devices: checked === true }))}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">I will not use additional devices or screens.</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">I will keep only this interview window active unless instructed otherwise.</span>
              </span>
            </label>

            <label className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <Checkbox
                checked={consents.recording}
                onCheckedChange={(checked) => setConsents((current) => ({ ...current, recording: checked === true }))}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">I consent to recording and proctoring.</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">My camera, microphone, transcript, and integrity events may be reviewed by ValueMomentum.</span>
              </span>
            </label>
          </div>

          <Button
            className="mt-6 h-11 w-full rounded-lg bg-[#056BFC] text-base font-bold hover:bg-[#024099]"
            disabled={!allConsentsAccepted}
            onClick={() => setHasAcceptedConsent(true)}
          >
            Start Test
          </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* hidden proctoring video to keep camera frames even during screen-share */}
      <video ref={proctorVideoRef} style={{ display: 'none' }} autoPlay muted playsInline />
      <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-3 flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Interview Session</p>
            <h1 className="mt-0.5 text-lg font-bold text-slate-900">{settings?.role || "Interview"}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Question</p>
              <p className="font-mono text-xs font-semibold text-slate-900">
                {currentQuestionIndex + 1} / {totalQuestionCount}
              </p>
            </div>
            <div className={`rounded-lg border px-2.5 py-1 text-sm transition-colors ${timerTone.wrapper}`}>
              <p className={`text-[9px] font-bold uppercase tracking-[0.18em] ${timerTone.label}`}>Timer</p>
              <p className={`font-mono text-xs font-semibold ${timerTone.value}`}>{formattedRemainingTime}</p>
            </div>
            <Button variant="destructive" className="h-8 rounded-lg px-3 text-xs" onClick={() => handleInterviewCompletion(messages)}>
              End Interview
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(230px,290px)_minmax(0,1fr)]">
          <aside className="min-h-0 lg:sticky lg:top-0 lg:self-start">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="relative aspect-[4/3.95] bg-slate-100">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                {!hasCameraPermission && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                    <div className="rounded-lg border border-red-200 bg-white px-6 py-5 text-center shadow-sm">
                      <VolumeX className="mx-auto mb-3 h-8 w-8 text-red-500" />
                      <p className="text-sm font-semibold text-slate-900">Camera unavailable</p>
                      <p className="mt-1 text-xs text-slate-500">Enable permissions to continue proctoring.</p>
                    </div>
                  </div>
                )}

                <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full border border-red-200 bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-red-600 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  Live
                </div>

                <div className="absolute bottom-2.5 left-2.5 right-2.5 rounded-lg border border-slate-200 bg-white/90 p-2.5 shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Recording Status</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-900">
                        {isRecordingControlled ? "Answer recording in progress" : "Ready for next response"}
                      </p>
                    </div>
                    <div className={`h-3 w-3 rounded-full ${isRecordingControlled ? "bg-red-400 animate-pulse" : "bg-emerald-400"}`} />
                  </div>
                </div>
              </div>

            </div>
          </aside>

          <section className="flex min-h-0 flex-col gap-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
                    Current Question - {String(currentQuestionIndex + 1).padStart(2, "0")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                      {currentSectionTitle}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500">
                      Section Progress {currentSectionQuestionNumber} / {sectionQuestionCounts[currentSectionTitle] || 0}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-900 md:text-[0.95rem]">
                    {currentQuestion?.content}
                  </p>
                </div>
                <Button onClick={toggleVoice} variant="outline" size="sm" className="rounded-lg bg-white" disabled={isSpeaking}>
                  {isVoiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex flex-col gap-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Interview Sections</p>
                  <div className="mt-2 space-y-2">
                    {Object.entries(INTERVIEW_SECTION_TITLES).map(([sectionId, sectionTitle]) => {
                      const completedCount = questionListState
                        .slice(0, Math.max(0, currentQuestionIndex))
                        .filter((question) => question.sectionId === sectionId).length;
                      const totalCount = questionListState.filter((question) => question.sectionId === sectionId).length;
                      if (totalCount === 0) return null;
                      const isActiveSection = currentSectionTitle === sectionTitle;
                      const isCompletedSection = totalCount > 0 && completedCount >= totalCount && !isActiveSection;
                      const sectionTone = isCompletedSection
                        ? "border-emerald-100 bg-emerald-50/70 text-emerald-700"
                        : isActiveSection
                          ? "border-blue-200 bg-blue-50 text-[#056BFC]"
                          : "border-slate-200 bg-slate-50 text-slate-700";

                      return (
                        <div
                          key={sectionId}
                          className={`rounded-lg border px-3 py-2 text-xs transition-colors ${sectionTone}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold">{sectionTitle}</span>
                            <span className={`font-mono ${isCompletedSection ? "text-emerald-700" : isActiveSection ? "text-primary" : "text-slate-500"}`}>
                              {Math.min(completedCount + (isActiveSection ? 1 : 0), totalCount)} / {totalCount}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Response Controls</p>
                  <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
                    <Button onClick={handleSubmitAnswer} className="h-9 rounded-lg bg-[#056BFC] px-3 text-xs font-bold hover:bg-[#024099]">
                      {isRecordingControlled
                        ? "Stop Recording"
                        : currentQuestionIndex + 1 >= totalQuestionCount
                          ? "Finish Interview"
                          : "Submit Answer"}
                    </Button>
                    <Button onClick={handleRecordToggle} disabled={!audioStream} variant="outline" className="h-9 rounded-lg border-slate-300 px-3 text-xs font-bold">
                      {isRecordingControlled ? "Stop" : "Record"}
                    </Button>
                    <Button onClick={handleSkipQuestion} variant="ghost" className="h-9 rounded-lg px-3 text-xs font-bold text-slate-600">
                      Skip
                    </Button>
                  </div>
                  <div className="mt-2">
                    <Textarea
                      value={draftResponse}
                      onChange={(event) => setDraftResponse(event.target.value)}
                      placeholder="Your recorded response will appear here. You can edit it before submitting."
                      className="min-h-20 rounded-lg border-slate-200 resize-none text-xs"
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Use Record to capture audio, then Submit Answer to continue.
                  </p>
                </div>

                <div
                  className={`rounded-[1.5rem] border-2 border-dashed p-3 transition-all ${
                    isMicActive ? "border-primary/40 bg-primary/[0.03]" : "border-slate-200 bg-slate-50/70"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isMicActive ? (
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
                      <p className={`text-[9px] font-bold uppercase tracking-[0.16em] ${isMicActive ? "text-primary" : "text-slate-500"}`}>
                        {isMicActive ? "Live Audio Stream" : "Awaiting Input"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {isRecordingControlled ? "Recording answer now." : "Press record when you're ready to respond."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-3.5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Violation Monitor</p>
                      <p className="text-[11px] text-slate-500">{violations.length} events detected</p>
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
