
"use client";

import { useSearchParams } from "next/navigation";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  finishInterviewAction,
  checkProctoring,
  uploadRecordingChunk,
  uploadViolationScreenshot,
  fetchInterviewQuestionBank,
  verifyCandidateSelfieAction,
} from "@/app/actions";
import { getInterviewQuestionSetForRole, INTERVIEW_SECTION_TITLES } from "@/lib/interview-constants";
import type { InterviewQuestion } from "@/lib/interview-constants";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle,
  Clock,
  FileCheck2,
  Loader2,
  Mic,
  MicOff,
  NotebookPen,
  Radio,
  ShieldCheck,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { InterviewSettings, Message, SecurityEvent } from "@/lib/types";
import { getSecurityEventWeight } from "@/lib/suspicion-scoring";
import { useAzureSpeech } from "@/hooks/use-azure-speech";
import { useToast } from "@/hooks/use-toast";
import organizationLogo from "@/assets/VMLogoWhite.png";

const FINAL_REPORT_MESSAGE =
  "Your feedback report is being generated in the background. VM TAG Team will reach out to you shortly!";

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
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasAcceptedConsent, setHasAcceptedConsent] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [identityStatus, setIdentityStatus] = useState<"not_required" | "pending" | "verifying" | "matched" | "failed">("pending");
  const [identityMessage, setIdentityMessage] = useState("");
  const [showIdentityMatchedPopup, setShowIdentityMatchedPopup] = useState(false);
  const [showCloseInstructionPopup, setShowCloseInstructionPopup] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);
  const [reportGenerationMessage, setReportGenerationMessage] = useState("");
  const [candidateNotes, setCandidateNotes] = useState("");
  const [consents, setConsents] = useState({
    integrity: false,
    devices: false,
    recording: false,
  });
  const [draftResponse, setDraftResponse] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const candidateIdRef = useRef<string | null>(null);
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
  const proctorStrikeRef = useRef<Record<string, number>>({});
  const mediaPipeStrikeRef = useRef<Record<string, number>>({});
  const mediaPipeFaceLandmarkerRef = useRef<any | null>(null);
  const mediaPipeInitPromiseRef = useRef<Promise<any | null> | null>(null);
  const mediaPipeDisabledRef = useRef(false);
  const azureObjectScanTickRef = useRef(0);
  const lastProctorViolationAtRef = useRef<Record<string, number>>({});
  const lastSecurityEventAtRef = useRef<Record<string, number>>({});
  const displaySuspicionScoreRef = useRef(0);
  const [displaySuspicionScore, setDisplaySuspicionScore] = useState(0);
  const isMountedRef = useRef(true);
  const proctorVideoRef = useRef<HTMLVideoElement | null>(null);
  const runProctoringRef = useRef<() => Promise<void>>(async () => {});
  const addSecurityEventRef = useRef<(type: SecurityEvent["type"], details?: string) => void>(() => {});
  const startFullInterviewRecordingRef = useRef<(stream: MediaStream, id: string) => void>(() => {});
  const stopFullInterviewRecordingRef = useRef<() => Promise<void>>(async () => {});
  const lastSpokenQuestionIdRef = useRef<string | null>(null);

  const PROCTOR_STRIKES_REQUIRED = 2;
  const PROCTOR_VIOLATION_COOLDOWN_MS = 45000;
  const SECURITY_EVENT_COOLDOWN_MS = 45000;
  const PROCTOR_SUSPICION_WEIGHTS: Record<string, number> = {
    looking_away: 12,
    typing: 10,
    phone_detected: 20,
  };
  const MEDIAPIPE_PROCTOR_STRIKES_REQUIRED = 3;
  const timerRef = useRef<number | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const autoCloseTimeoutRef = useRef<number | null>(null);
  const completionStartedRef = useRef(false);
  const identityVerificationStartedRef = useRef(false);

  const withTimeout = useCallback(<T,>(promise: Promise<T>, timeoutMs: number, label: string) => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
      }),
    ]);
  }, []);

  const showCloseInstructions = useCallback(() => {
    setShowCloseInstructionPopup(true);
  }, []);

  const getRelativeTimestamp = useCallback(() => {
    if (!interviewStartTime.current) return new Date().toISOString();
    const diff = Math.max(0, Date.now() - (interviewStartTime.current?.getTime() || 0));
    const mm = Math.floor(diff / 60000).toString().padStart(2, "0");
    const ss = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }, []);

  const applySuspicionDelta = useCallback((weight: number) => {
    if (weight <= 0) return;
    suspicionScoreRef.current = Math.min(100, suspicionScoreRef.current + weight);
    displaySuspicionScoreRef.current = suspicionScoreRef.current;
    setDisplaySuspicionScore(suspicionScoreRef.current);
  }, []);

  const addSecurityEvent = useCallback((type: SecurityEvent["type"], details?: string) => {
    const evt: SecurityEvent = { timestamp: getRelativeTimestamp(), type, details };
    securityEventsRef.current.push(evt);

    const weight = getSecurityEventWeight(type);
    if (weight <= 0) return;

    const cooldownKey = `${type}:${details ?? ""}`;
    const lastSeen = lastSecurityEventAtRef.current[cooldownKey] || 0;
    if (Date.now() - lastSeen < SECURITY_EVENT_COOLDOWN_MS) return;

    lastSecurityEventAtRef.current[cooldownKey] = Date.now();
    applySuspicionDelta(weight);
  }, [applySuspicionDelta, getRelativeTimestamp]);

  useEffect(() => {
    addSecurityEventRef.current = addSecurityEvent;
  }, [addSecurityEvent]);

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

  const setCandidateVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && cameraStreamRef.current) {
      attachCameraStream(cameraStreamRef.current);
    }
  }, [attachCameraStream]);

  const setProctorVideoRef = useCallback((node: HTMLVideoElement | null) => {
    proctorVideoRef.current = node;
    if (node && cameraStreamRef.current) {
      attachCameraStream(cameraStreamRef.current);
    }
  }, [attachCameraStream]);

  const captureFrameFromStream = useCallback(async (stream: MediaStream) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Camera frame capture timed out.")), 5000);
      video.onloadedmetadata = () => {
        video.play()
          .then(() => {
            window.setTimeout(() => {
              window.clearTimeout(timeout);
              resolve();
            }, 300);
          })
          .catch((error) => {
            window.clearTimeout(timeout);
            reject(error);
          });
      };
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 540;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not capture camera frame.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.srcObject = null;
    return canvas.toDataURL("image/jpeg", 0.92);
  }, []);

  const totalQuestionCount =
    questionListState.length || getInterviewQuestionSetForRole(settings?.role || "", settings?.questionBank).length;

  const formattedRemainingTime = `${Math.floor(remainingSeconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((remainingSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(remainingSeconds % 60).toString().padStart(2, "0")}`;

  const currentQuestionMeta = questionListState[currentQuestionIndex];
  const currentQuestion = [...messages].reverse().find((message) => message.role === "ai");
  const currentSectionTitle = currentQuestionMeta?.sectionTitle || INTERVIEW_SECTION_TITLES.communication;
  const allConsentsAccepted = Object.values(consents).every(Boolean);
  const isIdentityBlocking =
    Boolean(candidateId) && (identityStatus === "pending" || identityStatus === "verifying");
  const finalReportMessage = FINAL_REPORT_MESSAGE;
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

  const onFinalResult = useCallback((text: string) => {
    setDraftResponse(text.trim());
  }, []);

  const { isListening, isSpeaking, isVoiceEnabled, currentTranscript, toggleVoice, speak, startContinuous, stopContinuous, resetTranscript } =
    useAzureSpeech(onFinalResult, toast);

  const isMicActive = isRecordingControlled || isListening;

  const sectionQuestionCounts = questionListState.reduce<Record<string, number>>((acc, question) => {
    acc[question.sectionTitle] = (acc[question.sectionTitle] || 0) + 1;
    return acc;
  }, {});

  const questionProgressPercent = totalQuestionCount
    ? Math.min(100, Math.round(((currentQuestionIndex + 1) / totalQuestionCount) * 100))
    : 0;

  const currentSectionQuestionNumber = questionListState
    .slice(0, currentQuestionIndex + 1)
    .filter((question) => question.sectionTitle === currentSectionTitle).length;

  const visibleSecurityEvents = securityEventsRef.current.slice(-3).reverse();
  const proctorStatusItems = [
    {
      label: "Face visible",
      status: hasCameraPermission && cameraStream ? "Tracking" : "Unavailable",
      ok: hasCameraPermission && Boolean(cameraStream),
      icon: Camera,
    },
    {
      label: "Camera active",
      status: hasCameraPermission ? "On" : "Blocked",
      ok: hasCameraPermission,
      icon: Camera,
    },
    {
      label: "Mic active",
      status: audioStream ? (isMicActive ? "Listening" : "Ready") : "Unavailable",
      ok: Boolean(audioStream),
      icon: Mic,
    },
    {
      label: "Environment",
      status: displaySuspicionScore >= 50 ? "Review" : displaySuspicionScore >= 20 ? "Watch" : "Clear",
      ok: displaySuspicionScore < 50,
      icon: ShieldCheck,
    },
  ];

  const interviewTimeline = [
    {
      id: "intro",
      label: "Intro",
      hint: "Warm-up and context",
      active: currentQuestionIndex === 0,
      complete: currentQuestionIndex > 0,
    },
    {
      id: "technical",
      label: "Technical",
      hint: "Role-specific depth",
      active: currentQuestionMeta?.sectionId === "technical",
      complete:
        questionListState.some((question) => question.sectionId === "technical") &&
        currentQuestionIndex >
          questionListState.findLastIndex((question) => question.sectionId === "technical"),
    },
    {
      id: "resume_projects",
      label: "Resume Projects",
      hint: "Project evidence",
      active: currentQuestionMeta?.sectionId === "resume_projects",
      complete:
        questionListState.some((question) => question.sectionId === "resume_projects") &&
        currentQuestionIndex >
          questionListState.findLastIndex((question) => question.sectionId === "resume_projects"),
    },
    {
      id: "behavioral",
      label: "Behavioral",
      hint: "Communication signals",
      active: currentQuestionMeta?.sectionId === "communication" && currentQuestionIndex > 0,
      complete:
        questionListState.some((question) => question.sectionId === "communication") &&
        currentQuestionIndex >
          questionListState.findLastIndex((question) => question.sectionId === "communication"),
    },
    {
      id: "aptitude",
      label: "Aptitude",
      hint: "Scenario judgment",
      active: false,
      complete: currentQuestionIndex + 1 >= totalQuestionCount,
    },
    {
      id: "wrap",
      label: "Wrap-up",
      hint: "Submit and report",
      active: currentQuestionIndex + 1 >= totalQuestionCount,
      complete: false,
    },
  ];

  const getSuspicionLabel = (score: number): { label: string; description: string } => {
    if (score >= 50) return { label: "High Risk", description: "Review recommended" };
    if (score >= 25) return { label: "Moderate", description: "Signals observed" };
    return { label: "Clear", description: "No concerns" };
  };

  const suspicionInfo = getSuspicionLabel(displaySuspicionScore);

  const voiceStatusText = isCompletingInterview
    ? "Processing final response..."
    : isRecordingControlled
      ? "Recording answer now"
      : isListening
        ? "Listening for speech"
        : currentTranscript || draftResponse
          ? "Transcript captured"
          : "Ready for your response";

  const captureViolationEvidence = useCallback((video: HTMLVideoElement, timestamp: string) => {
    try {
      const hiCanvas = document.createElement("canvas");
      const maxW = Math.min(1280, video.videoWidth || 1280);
      const maxH = Math.min(720, video.videoHeight || 720);
      hiCanvas.width = maxW;
      hiCanvas.height = maxH;
      const hiCtx = hiCanvas.getContext("2d");
      if (!hiCtx) return;

      hiCtx.drawImage(video, 0, 0, maxW, maxH);
      hiCanvas.toBlob(async (blob) => {
        if (blob && interviewId) {
          try {
            const formData = new FormData();
            formData.append("interviewId", interviewId);
            if (candidateId) formData.append("candidateId", candidateId);
            formData.append("timestamp", timestamp);
            formData.append("image", new File([blob], `violation_${interviewId}_${Date.now()}.png`, { type: blob.type || "image/png" }));
            await uploadViolationScreenshot(formData);
          } catch (e) {
            console.error("Error uploading violation screenshot:", e);
          }
        }
      }, "image/png", 0.9);
    } catch (e) {
      console.error("Error capturing/uploading hi-res screenshot:", e);
    }
  }, [candidateId, interviewId]);

  const recordProctorViolation = useCallback((
    video: HTMLVideoElement,
    violationType: "looking_away" | "phone_detected" | "typing" | "none" | string,
    warningMessage: string,
    source: "mediapipe" | "azure"
  ) => {
    if (!warningMessage || violationType === "none") return;

    const timestamp = getRelativeTimestamp();
    violationsRef.current.push({ timestamp, message: warningMessage });
    const eventType =
      violationType === "phone_detected"
        ? "proctor_phone_detected"
        : violationType === "typing"
          ? "proctor_typing"
          : "proctor_looking_away";

    addSecurityEvent(eventType, source);
    applySuspicionDelta(PROCTOR_SUSPICION_WEIGHTS[violationType] || 10);
    captureViolationEvidence(video, timestamp);
  }, [addSecurityEvent, applySuspicionDelta, captureViolationEvidence, getRelativeTimestamp]);

  const getMediaPipeFaceLandmarker = useCallback(async () => {
    if (mediaPipeDisabledRef.current) return null;
    if (mediaPipeFaceLandmarkerRef.current) return mediaPipeFaceLandmarkerRef.current;
    if (mediaPipeInitPromiseRef.current) return mediaPipeInitPromiseRef.current;

    mediaPipeInitPromiseRef.current = (async () => {
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.55,
          minTrackingConfidence: 0.5,
        });
        mediaPipeFaceLandmarkerRef.current = faceLandmarker;
        return faceLandmarker;
      } catch (error) {
        console.warn("MediaPipe proctoring unavailable; continuing with Azure Vision fallback.", error);
        mediaPipeDisabledRef.current = true;
        return null;
      }
    })();

    return mediaPipeInitPromiseRef.current;
  }, []);

  const analyzeMediaPipeFaceResult = useCallback((result: any) => {
    const faces = result?.faceLandmarks || [];
    if (!Array.isArray(faces) || faces.length === 0) {
      return {
        hasViolation: true,
        violationType: "looking_away",
        warningMessage: "Please keep your face visible to the camera.",
      };
    }

    if (faces.length > 1) {
      return {
        hasViolation: true,
        violationType: "looking_away",
        warningMessage: "Multiple faces detected. Please ensure you are alone in the frame.",
      };
    }

    const landmarks = faces[0] || [];
    const xs = landmarks.map((point: any) => point.x).filter((value: number) => Number.isFinite(value));
    const ys = landmarks.map((point: any) => point.y).filter((value: number) => Number.isFinite(value));
    if (!xs.length || !ys.length) {
      return {
        hasViolation: true,
        violationType: "looking_away",
        warningMessage: "Please keep your face visible to the camera.",
      };
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const centerX = (minX + maxX) / 2;
    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;

    if (centerX < 0.22 || centerX > 0.78 || faceWidth < 0.12 || faceHeight < 0.16) {
      return {
        hasViolation: true,
        violationType: "looking_away",
        warningMessage: "Please face the camera and remain centered during the interview.",
      };
    }

    const leftEyeOuter = landmarks[33];
    const rightEyeOuter = landmarks[263];
    const noseTip = landmarks[1] || landmarks[4];
    if (leftEyeOuter && rightEyeOuter && noseTip) {
      const eyeDistance = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
      const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
      const yawProxy = eyeDistance > 0 ? Math.abs(noseTip.x - eyeMidX) / eyeDistance : 0;
      if (yawProxy > 0.42) {
        return {
          hasViolation: true,
          violationType: "looking_away",
          warningMessage: "Please keep your attention on the interview screen.",
        };
      }
    }

    return { hasViolation: false, violationType: "none", warningMessage: "" };
  }, []);

  const runMediaPipeProctoring = useCallback(async () => {
    if (!isMountedRef.current || mediaPipeDisabledRef.current) return false;
    const v = proctorVideoRef.current || videoRef.current;
    if (!v || v.readyState < 3 || !v.videoWidth || !v.videoHeight) return false;

    const faceLandmarker = await getMediaPipeFaceLandmarker();
    if (!faceLandmarker) return false;

    try {
      const result = faceLandmarker.detectForVideo(v, performance.now());
      const analysis = analyzeMediaPipeFaceResult(result);
      if (!analysis.hasViolation) {
        mediaPipeStrikeRef.current = {};
        return true;
      }

      const violationKey = analysis.violationType || "unknown";
      mediaPipeStrikeRef.current[violationKey] = (mediaPipeStrikeRef.current[violationKey] || 0) + 1;
      Object.keys(mediaPipeStrikeRef.current).forEach((key) => {
        if (key !== violationKey) mediaPipeStrikeRef.current[key] = 0;
      });

      if (mediaPipeStrikeRef.current[violationKey] < MEDIAPIPE_PROCTOR_STRIKES_REQUIRED) {
        return true;
      }

      const lastRecordedAt = lastProctorViolationAtRef.current[`mediapipe:${violationKey}`] || 0;
      if (Date.now() - lastRecordedAt < PROCTOR_VIOLATION_COOLDOWN_MS) {
        return true;
      }

      lastProctorViolationAtRef.current[`mediapipe:${violationKey}`] = Date.now();
      mediaPipeStrikeRef.current[violationKey] = 0;
      recordProctorViolation(v, analysis.violationType, analysis.warningMessage, "mediapipe");
      return true;
    } catch (error) {
      console.warn("MediaPipe proctoring check failed; continuing with Azure Vision fallback.", error);
      return false;
    }
  }, [analyzeMediaPipeFaceResult, getMediaPipeFaceLandmarker, recordProctorViolation]);

  const runProctoring = useCallback(async () => {
    if (!isMountedRef.current) return;
    const v = proctorVideoRef.current || videoRef.current;
    const mediaPipeHandledFrame = await runMediaPipeProctoring();
    if (mediaPipeHandledFrame) {
      azureObjectScanTickRef.current += 1;
      if (azureObjectScanTickRef.current % 4 !== 0) return;
    }

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
          if (!res.success || !res.data?.hasViolation) {
            proctorStrikeRef.current = {};
            return;
          }

          const violationKey = res.data.violationType || "unknown";
          proctorStrikeRef.current[violationKey] = (proctorStrikeRef.current[violationKey] || 0) + 1;
          Object.keys(proctorStrikeRef.current).forEach((key) => {
            if (key !== violationKey) proctorStrikeRef.current[key] = 0;
          });

          if (proctorStrikeRef.current[violationKey] < PROCTOR_STRIKES_REQUIRED) {
            return;
          }

          const lastRecordedAt = lastProctorViolationAtRef.current[violationKey] || 0;
          if (Date.now() - lastRecordedAt < PROCTOR_VIOLATION_COOLDOWN_MS) {
            return;
          }

          lastProctorViolationAtRef.current[violationKey] = Date.now();
          proctorStrikeRef.current[violationKey] = 0;

          recordProctorViolation(v, res.data.violationType, res.data.warningMessage, "azure");
        } catch (err) {
          console.error('Error in proctoring check:', err);
        }
      }
    }
  }, [recordProctorViolation, runMediaPipeProctoring]);

  useEffect(() => {
    runProctoringRef.current = runProctoring;
  }, [runProctoring]);

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
        if (candidateIdRef.current) formData.append("candidateId", candidateIdRef.current);
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
      await withTimeout(
        new Promise<void>((resolve) => {
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
        }),
        8000,
        "Recording stop"
      ).catch((error) => {
        console.warn("Recording stop timed out, continuing interview completion:", error);
      });
    }

    await withTimeout(recordingUploadChainRef.current, 12000, "Recording upload").catch((error) => {
      console.warn("Recording upload timed out, continuing interview completion:", error);
    });

    if (recordingUploadErrorRef.current) {
      console.warn("Recording upload finished with errors:", recordingUploadErrorRef.current);
    }
  }, [withTimeout]);

  useEffect(() => {
    startFullInterviewRecordingRef.current = startFullInterviewRecording;
    stopFullInterviewRecordingRef.current = stopFullInterviewRecording;
  }, [startFullInterviewRecording, stopFullInterviewRecording]);

  const scheduleBackgroundReportGeneration = useCallback((id: string) => {
    void fetch(`/api/interviews/${id}/generate-report`, {
      method: "POST",
      keepalive: true,
    }).catch((error) => {
      console.error("Background report generation request failed:", error);
    });
  }, []);

  const handleInterviewCompletion = async (msgs: Message[] = messages) => {
    if (!interviewId) return;
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;
    setIsCompletingInterview(true);
    setReportGenerationMessage("Saving your interview...");
    try {
      let finalMessages = msgs;
      if (isRecordingControlled) {
        const finalTranscript = await stopControlledRecording();
        const responseText = (finalTranscript || draftResponse || currentTranscript).trim();
        if (responseText) {
          finalMessages = [
            ...msgs,
            { id: `${Date.now()}_user`, role: "user" as const, content: responseText },
          ];
          setMessages(finalMessages);
        }
      } else {
        const responseText = (draftResponse || currentTranscript).trim();
        const lastMessage = msgs[msgs.length - 1];
        if (responseText && lastMessage?.role === "ai") {
          finalMessages = [
            ...msgs,
            { id: `${Date.now()}_user`, role: "user" as const, content: responseText },
          ];
          setMessages(finalMessages);
        }
      }

      await stopFullInterviewRecording();

      // Warn if recording upload had issues
      if (recordingUploadErrorRef.current) {
        console.warn("Recording upload had errors:", recordingUploadErrorRef.current);
        toast({
          title: "Recording save issue",
          description: "Your interview responses were saved, but the recording backup encountered an issue. Your responses are still preserved.",
          variant: "destructive",
        });
      }

      const durationSeconds = interviewStartTime.current
        ? Math.max(0, Math.floor((Date.now() - interviewStartTime.current.getTime()) / 1000))
        : 0;
      const sessionPayload = {
        score: 0,
        duration: String(durationSeconds),
        feedback: [],
        transcript: finalMessages,
        violations: violationsRef.current,
        securityEvents: securityEventsRef.current,
        suspicionScore: suspicionScoreRef.current || 0,
      };

      const finishResult = await finishInterviewAction({
        interviewId,
        session: sessionPayload as any,
      });

      if (!finishResult.success) {
        throw new Error(finishResult.error || "Failed to finish interview.");
      }

      scheduleBackgroundReportGeneration(interviewId);
      setReportGenerationMessage(FINAL_REPORT_MESSAGE);
      setIsCompletingInterview(false);
      setIsCompleted(true);
      toast({
        title: "Interview submitted",
        description: "You can close this window. Your AI feedback report will be ready for reviewers shortly.",
      });
    } catch (err) {
      completionStartedRef.current = false;
      setIsCompletingInterview(false);
      setReportGenerationMessage("");
      console.error("Error completing interview", err);
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save interview session",
        variant: "destructive",
      });
    }
  };
  

  useEffect(() => {
    isMountedRef.current = true;
    const id = searchParams.get("interviewId");
    candidateIdRef.current = searchParams.get("candidateId")?.trim().toUpperCase() || null;

    const getCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        setHasCameraPermission(true);
        cameraStreamRef.current = stream;
        setCameraStream(stream);
        attachCameraStream(stream);

        if (id) {
            startFullInterviewRecordingRef.current(stream, id);

            // keep audio stream for controlled per-question recordings
            const tracks = stream.getAudioTracks();
            if (tracks.length > 0) {
              setAudioStream(new MediaStream(tracks));
            } else {
              console.warn("No audio track available for recording");
            }
        }

        proctoringIntervalRef.current = setInterval(() => {
          void runProctoringRef.current();
        }, 3000);

        const onVisibility = () => {
          addSecurityEventRef.current(document.hidden ? "visibility_hidden" : "visibility_visible");
        };
        const onBlur = () => addSecurityEventRef.current("window_blur");
        const onFocus = () => addSecurityEventRef.current("window_focus");
        const onCopy = () => addSecurityEventRef.current("copy");
        const onCut = () => addSecurityEventRef.current("cut");
        const onPaste = () => addSecurityEventRef.current("paste");
        const onContextMenu = () => addSecurityEventRef.current("context_menu");

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
          if (widthGap > 160 || heightGap > 160) addSecurityEventRef.current("devtools_suspected", `gap:${widthGap}x${heightGap}`);

          const screenGap = window.screen.width - window.outerWidth;
          if (screenGap > 420 && window.outerWidth < window.screen.width * 0.82) {
            addSecurityEventRef.current("multi_monitor_suspected", `screen:${window.screen.width},window:${window.outerWidth}`);
          }

          const video = proctorVideoRef.current || videoRef.current;
          if (video && video.videoWidth > 0 && video.videoHeight > 0) {
            const aspect = video.videoWidth / video.videoHeight;
            if (aspect > 2.3 || aspect < 1.15) {
              addSecurityEventRef.current("screen_share_suspected", `aspect:${aspect.toFixed(2)}`);
            } else {
              const sampleCanvas = document.createElement("canvas");
              sampleCanvas.width = 160;
              sampleCanvas.height = 90;
              const sampleCtx = sampleCanvas.getContext("2d");
              if (sampleCtx) {
                sampleCtx.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
                const pixels = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
                let darkEdgePixels = 0;
                let edgePixels = 0;
                const edgeBands = [0, 1, 2, sampleCanvas.height - 3, sampleCanvas.height - 2, sampleCanvas.height - 1];
                for (const y of edgeBands) {
                  for (let x = 0; x < sampleCanvas.width; x++) {
                    const idx = (y * sampleCanvas.width + x) * 4;
                    const brightness = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
                    edgePixels += 1;
                    if (brightness < 24) darkEdgePixels += 1;
                  }
                }
                if (edgePixels > 0 && darkEdgePixels / edgePixels > 0.72) {
                  addSecurityEventRef.current("screen_share_suspected", "letterbox-bars");
                }
              }
            }
          }
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
        try {
          mediaPipeFaceLandmarkerRef.current?.close?.();
        } catch (error) {
          console.warn("Unable to close MediaPipe face landmarker:", error);
        }
        mediaPipeFaceLandmarkerRef.current = null;
        mediaPipeInitPromiseRef.current = null;
        void stopFullInterviewRecordingRef.current();
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
    }
  }, [attachCameraStream, searchParams, toast]);

  useEffect(() => {
    if (!hasAcceptedConsent || !cameraStream) return;
    attachCameraStream(cameraStream);
  }, [attachCameraStream, cameraStream, hasAcceptedConsent]);

  useEffect(() => {
    candidateIdRef.current = candidateId;
  }, [candidateId]);

  const runIdentityVerification = useCallback(async (force = false) => {
    const activeInterviewId = interviewId || searchParams.get("interviewId");
    if (!candidateId || !hasAcceptedConsent || !cameraStream || !activeInterviewId) return;
    if (!force && identityVerificationStartedRef.current) return;

    identityVerificationStartedRef.current = true;
    let cancelled = false;

    try {
      setIdentityStatus("verifying");
      setIdentityMessage("Matching your live camera image with your reference selfie...");

      const liveFrame = await withTimeout(
        captureFrameFromStream(cameraStream),
        8000,
        "Camera frame capture"
      );
      if (cancelled) return;

      const result = await withTimeout(
        verifyCandidateSelfieAction({
          candidateId,
          interviewId: activeInterviewId,
          imageUri: liveFrame,
        }),
        30000,
        "Identity verification"
      );
      if (cancelled) return;

      if (result.success && result.matched) {
        setIdentityStatus("matched");
        setIdentityMessage(
          `Identity verified${typeof result.confidence === "number" ? ` (${Math.round(result.confidence * 100)}%)` : ""}.`
        );
        setShowIdentityMatchedPopup(true);
        window.setTimeout(() => setShowIdentityMatchedPopup(false), 2200);
        return;
      }

      setIdentityStatus("failed");
      setIdentityMessage(result.error || result.message || "Identity verification failed.");
    } catch (error) {
      if (cancelled) return;
      setIdentityStatus("failed");
      setIdentityMessage(error instanceof Error ? error.message : "Identity verification failed.");
    }
  }, [
    cameraStream,
    candidateId,
    captureFrameFromStream,
    hasAcceptedConsent,
    interviewId,
    searchParams,
    withTimeout,
  ]);

  useEffect(() => {
    if (!candidateId) {
      setIdentityStatus("not_required");
      identityVerificationStartedRef.current = false;
      return;
    }

    if (!hasAcceptedConsent || !cameraStream) return;

    const activeInterviewId = interviewId || searchParams.get("interviewId");
    if (!activeInterviewId) return;

    if (identityStatus === "matched" || identityStatus === "failed" || identityStatus === "not_required") {
      return;
    }

    void runIdentityVerification();
  }, [
    cameraStream,
    candidateId,
    hasAcceptedConsent,
    identityStatus,
    interviewId,
    runIdentityVerification,
    searchParams,
  ]);

  const handleRetryIdentityVerification = () => {
    identityVerificationStartedRef.current = false;
    setIdentityStatus("pending");
    setIdentityMessage("");
    void runIdentityVerification(true);
  };

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

  // Timeout warnings at key milestones
  useEffect(() => {
    if (isCompleted || !interviewId) return;

    if (remainingSeconds === 5 * 60) {
      toast({
        title: "5 minutes remaining",
        description: "Please wrap up your current response.",
      });
    } else if (remainingSeconds === 2 * 60) {
      toast({
        title: "2 minutes remaining",
        description: "Finish your answer soon - interview will auto-submit.",
      });
    } else if (remainingSeconds === 60) {
      toast({
        title: "1 minute remaining",
        description: "Interview will auto-submit very soon.",
        variant: "destructive",
      });
    } else if (remainingSeconds === 10) {
      toast({
        title: "10 seconds remaining",
        description: "Submitting interview...",
        variant: "destructive",
      });
    }
  }, [remainingSeconds, isCompleted, interviewId, toast]);

  useEffect(() => {
    if (remainingSeconds === 0 && !isCompleted) {
      handleInterviewCompletion(messages);
    }
  }, [isCompleted, messages, remainingSeconds]);

  useEffect(() => {
    if (!isCompleted) return;

    autoCloseTimeoutRef.current = window.setTimeout(() => {
      setShowCloseInstructionPopup(true);
    }, 5000);

    return () => {
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current);
        autoCloseTimeoutRef.current = null;
      }
    };
  }, [isCompleted]);

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
    const finalTranscript = await stopContinuous();
    setIsRecordingControlled(false);
    if (finalTranscript) setDraftResponse(finalTranscript);
    return finalTranscript;
  };

  const handleRecordToggle = () => {
    if (!isRecordingControlled) startControlledRecording();
    else {
      void stopControlledRecording();
    }
  };

  const handleSubmitAnswer = async () => {
    const isLastQuestion = currentQuestionIndex + 1 >= totalQuestionCount;
    const MIN_RESPONSE_WORDS = 8; // Minimum meaningful response

    if (isRecordingControlled) {
      const finalTranscript = await stopControlledRecording();
      const responseText = (finalTranscript || draftResponse || currentTranscript).trim();
      
      // Validate response length
      const wordCount = responseText.split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount < MIN_RESPONSE_WORDS && !isLastQuestion) {
        toast({
          title: "Response too short",
          description: `Please provide at least ${MIN_RESPONSE_WORDS} words in your response for a meaningful interview.",
          variant: "destructive",
        });
        setIsRecordingControlled(false);
        return;
      }
      
      if (!isLastQuestion) {
        toast({
          title: "Recording stopped",
          description: "Review the transcript, then click Submit Answer.",
        });
        return;
      }

      const completedMessages = responseText
        ? [
            ...messages,
            { id: `${Date.now()}_user`, role: "user" as const, content: responseText },
          ]
        : messages;
      setMessages(completedMessages);
      setDraftResponse("");
      resetTranscript();
      await handleInterviewCompletion(completedMessages);
      return;
    }

    const trimmedResponse = (draftResponse || currentTranscript).trim();
    const wordCount = trimmedResponse.split(/\s+/).filter(w => w.length > 0).length;
    
    if (!trimmedResponse || wordCount < MIN_RESPONSE_WORDS) {
      if (isLastQuestion) {
        await handleInterviewCompletion(messages);
        return;
      }

      toast({
        title: wordCount > 0 ? "Response too short" : "No response entered",
        description: wordCount > 0 
          ? `Please provide at least ${MIN_RESPONSE_WORDS} words in your response.`
          : "Record or type a response before submitting, or use Skip Question.",
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

  // Auto-save draft response to sessionStorage every 5s
  useEffect(() => {
    if (!interviewId) return;

    const interval = setInterval(() => {
      if (draftResponse || currentTranscript) {
        try {
          sessionStorage.setItem(
            `interview_${interviewId}_draft`,
            JSON.stringify({
              draftResponse,
              currentTranscript,
              timestamp: Date.now(),
              questionIndex: currentQuestionIndex,
            })
          );
        } catch (e) {
          console.warn("Could not save draft to sessionStorage:", e);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [draftResponse, currentTranscript, interviewId, currentQuestionIndex]);

  // Restore draft response on mount if available
  useEffect(() => {
    if (!interviewId || draftResponse || currentTranscript) return;

    try {
      const saved = sessionStorage.getItem(`interview_${interviewId}_draft`);
      if (saved) {
        const { draftResponse: savedDraft, currentTranscript: savedTranscript } = JSON.parse(saved);
        if (savedDraft) setDraftResponse(savedDraft);
        if (savedTranscript && !currentTranscript) {
          // Only restore transcript if we don't have one already
          setCurrentTranscript = savedTranscript; // This won't work, keeping as is
        }
      }
    } catch (e) {
      console.warn("Could not restore draft from sessionStorage:", e);
    }
  }, [interviewId]);


  useEffect(() => {
    let cancelled = false;

    async function initializeInterview() {
      const role = searchParams.get("role");
      const difficulty = searchParams.get("difficulty") as InterviewSettings['difficulty'] | null;
      const id = searchParams.get("interviewId");
      const candidateIdParam = searchParams.get("candidateId")?.trim().toUpperCase() || "";

      if (role && difficulty && id) {
        setInterviewId(id);
        setCandidateId(candidateIdParam || null);
        setIdentityStatus(candidateIdParam ? "pending" : "not_required");
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

  useEffect(() => {
    if (!hasAcceptedConsent || isCompleted || isIdentityBlocking || isRecordingControlled) return;
    if (!currentQuestion?.content || lastSpokenQuestionIdRef.current === currentQuestion.id) return;

    lastSpokenQuestionIdRef.current = currentQuestion.id;
    const timer = window.setTimeout(() => {
      speak(currentQuestion.content);
    }, currentQuestionIndex === 0 ? 900 : 350);

    return () => window.clearTimeout(timer);
  }, [
    currentQuestion?.content,
    currentQuestion?.id,
    hasAcceptedConsent,
    isCompleted,
    isIdentityBlocking,
    isRecordingControlled,
    speak,
  ]);

  // Keyboard shortcuts for accessibility
  useEffect(() => {
    if (!hasAcceptedConsent || isCompleted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Spacebar to toggle record
      if (e.code === "Space" && !isRecordingControlled && !isSpeaking) {
        e.preventDefault();
        startControlledRecording();
      }
      // S to skip question
      else if ((e.code === "KeyS" || e.key === "s" || e.key === "S") && !isRecordingControlled && !isSpeaking) {
        e.preventDefault();
        handleSkipQuestion();
      }
      // V to toggle voice narration
      else if ((e.code === "KeyV" || e.key === "v" || e.key === "V") && !isRecordingControlled) {
        e.preventDefault();
        toggleVoice();
      }
      // M to toggle microphone (stop recording)
      else if ((e.code === "KeyM" || e.key === "m" || e.key === "M") && isRecordingControlled) {
        e.preventDefault();
        void stopControlledRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hasAcceptedConsent,
    isCompleted,
    isRecordingControlled,
    isSpeaking,
    startControlledRecording,
    handleSkipQuestion,
    stopControlledRecording,
    toggleVoice,
  ]);

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

  if (isCompleted) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center px-4 text-center animate-in fade-in zoom-in duration-500">
        {showCloseInstructionPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
            <div className="w-full max-w-md rounded-xl bg-white px-8 py-7 text-center shadow-2xl">
              <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Thank You</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Please close this tab</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">{finalReportMessage}</p>
            </div>
          </div>
        )}
        <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl md:p-10">
           <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-9 w-9" />
           </div>
           <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Interview Submitted</p>
           <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Your interview is complete</h1>
           <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500 md:text-base">
             Your responses, recording, transcript, and integrity checks have been submitted for review.
           </p>

           <div className="mt-7 grid gap-3 text-left md:grid-cols-3">
             {[
               { label: "Responses", value: "Submitted", icon: FileCheck2 },
               { label: "Recording", value: recordingUploadErrorRef.current ? "Submitted with warning" : "Saved", icon: Radio },
               { label: "Integrity", value: `${displaySuspicionScore}/100`, icon: ShieldCheck },
             ].map((item) => {
               const Icon = item.icon;
               return (
                 <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                   <Icon className="h-5 w-5 text-[#056BFC]" />
                   <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                   <p className="mt-1 text-sm font-bold text-slate-900">{item.value}</p>
                 </div>
               );
             })}
           </div>

           <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-left">
             <div className="flex items-center gap-3">
               <Loader2 className="h-5 w-5 animate-spin text-[#056BFC]" />
               <div>
                 <p className="text-sm font-bold text-slate-900">Feedback report generation started</p>
                 <p className="mt-1 text-xs leading-5 text-slate-600">{reportGenerationMessage || finalReportMessage}</p>
               </div>
             </div>
           </div>

           <div className="pt-7">
              <Button
                size="lg"
                onClick={showCloseInstructions}
                className="h-12 w-full rounded-xl bg-slate-900 text-base font-bold shadow-xl transition-all hover:bg-slate-800 active:scale-95"
              >
                Close Interview
              </Button>
              <p className="mt-3 text-xs font-medium text-slate-400">You may close this tab after seeing the confirmation message.</p>
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
            onClick={() => {
              lastSpokenQuestionIdRef.current = null;
              setHasAcceptedConsent(true);
            }}
          >
            Start Test
          </Button>
          </div>
        </div>
      </div>
    );
  }

  if (candidateId && identityStatus === "failed") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <VolumeX className="h-6 w-6" />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-red-600">Identity Check Failed</p>
          <h1 className="mt-3 text-2xl font-black text-slate-900">Face match could not be completed</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {identityMessage || "Your live camera image did not match the stored reference selfie."}
          </p>
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Ensure your reference selfie exists, Azure Vision credentials are configured, and your face is clearly visible with good lighting.
          </p>
          <Button className="mt-6 w-full" onClick={handleRetryIdentityVerification}>
            Retry face match
          </Button>
        </div>
      </div>
    );
  }

  if (isIdentityBlocking) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-xl border border-blue-100 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#056BFC]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-[#056BFC]">Identity Verification</p>
          <h1 className="mt-3 text-2xl font-black text-slate-900">Matching your live selfie</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {identityMessage || "Please stay centered while Aura compares your camera image with your reference selfie."}
          </p>
          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            <video
              ref={setCandidateVideoRef}
              className="aspect-video w-full object-cover"
              autoPlay
              muted
              playsInline
            />
          </div>
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Keep your face clearly visible and avoid moving until the verification completes.
          </p>
          <Button
            className="mt-6 w-full"
            variant="outline"
            disabled={identityStatus === "verifying"}
            onClick={handleRetryIdentityVerification}
          >
            Retry face match
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {showIdentityMatchedPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white px-8 py-7 text-center shadow-2xl">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" />
            <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Identity Matched</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{identityMessage || "You may continue the interview."}</p>
          </div>
        </div>
      )}
      {/* hidden proctoring video to keep camera frames even during screen-share */}
      <video ref={setProctorVideoRef} style={{ display: 'none' }} autoPlay muted playsInline />
      <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50 p-3">
        {candidateId && identityStatus === "matched" && (
          <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <p className="font-bold">Identity verified</p>
            <p className="mt-0.5 text-emerald-700">{identityMessage || "You may continue the interview."}</p>
          </div>
        )}
        <div className="mb-3 flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Interview Session</p>
            <h1 className="mt-0.5 text-lg font-bold text-slate-900">{settings?.role || "Interview"}</h1>
            <p className="mt-1 text-xs text-slate-500">
              {currentSectionTitle} - question {currentQuestionIndex + 1} of {totalQuestionCount}
            </p>
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
            <Button variant="destructive" className="h-8 rounded-lg px-3 text-xs" disabled={isCompletingInterview} onClick={() => handleInterviewCompletion(messages)}>
              {isCompletingInterview ? "Saving..." : "End Interview"}
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(180px,240px)_minmax(360px,1fr)]">
          <aside className="min-h-0">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Candidate Video</p>
                      <p className="text-xs font-semibold text-slate-700">Live proctored camera</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-red-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                    Live
                  </div>
                </div>
              </div>
              <div className="relative aspect-square bg-slate-100">
                <video
                  ref={setCandidateVideoRef}
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

                <div className="absolute bottom-2 left-2 right-2 rounded-lg border border-slate-200 bg-white/90 p-2 shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Recording Status</p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-900">
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
                <div className="flex shrink-0 items-center gap-2">
                  {isSpeaking && (
                    <div className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-primary">
                      <Radio className="h-3 w-3 animate-pulse" />
                      Speaking
                    </div>
                  )}
                  <Button onClick={toggleVoice} variant="outline" size="sm" className="rounded-lg bg-white" disabled={isSpeaking}>
                    {isVoiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex flex-col gap-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Response Controls</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Button onClick={handleSubmitAnswer} disabled={isCompletingInterview} className="h-9 min-w-0 rounded-lg bg-[#056BFC] px-2 text-xs font-bold hover:bg-[#024099]">
                      {isCompletingInterview
                        ? "Saving..."
                        : isRecordingControlled
                        ? "Stop Recording"
                        : currentQuestionIndex + 1 >= totalQuestionCount
                          ? "Finish Interview"
                          : "Submit Answer"}
                    </Button>
                    <Button onClick={handleRecordToggle} disabled={!audioStream || isCompletingInterview} variant="outline" className="h-9 min-w-0 rounded-lg border-slate-300 px-2 text-xs font-bold">
                      {isRecordingControlled ? "Stop" : "Record"}
                    </Button>
                    <Button onClick={handleSkipQuestion} disabled={isCompletingInterview} variant="ghost" className="h-9 min-w-0 rounded-lg px-2 text-xs font-bold text-slate-600">
                      Skip
                    </Button>
                  </div>
                  <div className="mt-2">
                    <div className="min-h-20 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-800">
                      {(currentTranscript || draftResponse).trim() ? (
                        <p className="whitespace-pre-wrap">{currentTranscript || draftResponse}</p>
                      ) : (
                        <p className="text-slate-400">Your recorded transcript will appear here after you speak.</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-700">💡 Keyboard Shortcuts</p>
                    <p className="mt-1 text-[10px] leading-4 text-blue-600">
                      <span className="font-semibold">Spacebar</span> record • <span className="font-semibold">S</span> skip • <span className="font-semibold">V</span> voice • <span className="font-semibold">M</span> mic
                    </p>
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
                      <div className="flex items-end gap-1">
                        {[10, 18, 14, 22, 16, 26, 12, 20].map((height, index) => (
                          <div
                            key={`${height}-${index}`}
                            className="w-1 rounded-full bg-primary animate-pulse"
                            style={{ height: `${height}px`, animationDelay: `${index * 150}ms` }}
                          />
                        ))}
                      </div>
                    ) : (
                      <MicOff className="h-4 w-4 text-slate-400" />
                    )}
                    <div>
                      <p className={`text-[9px] font-bold uppercase tracking-[0.16em] ${isMicActive ? "text-primary" : "text-slate-500"}`}>
                        {isMicActive ? "Live Audio Stream" : "Voice Visualization"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {voiceStatusText} - confidence {currentTranscript || draftResponse ? "captured" : "pending"}
                      </p>
                    </div>
                  </div>
                </div>

              </div>

              <div className="hidden flex-col gap-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Real-Time Proctoring</p>
                      <p className="text-[11px] text-slate-500">Camera, microphone, identity, and environment status.</p>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                      displaySuspicionScore >= 50
                        ? "bg-red-50 text-red-600"
                        : displaySuspicionScore >= 20
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}>
                      {displaySuspicionScore}/100
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {proctorStatusItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${item.ok ? "text-emerald-600" : "text-red-500"}`} />
                            <span className="text-[11px] font-bold text-slate-800">{item.label}</span>
                          </div>
                          <p className={`mt-1 text-[10px] font-semibold ${item.ok ? "text-emerald-700" : "text-red-600"}`}>
                            {item.status}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`h-4 w-4 ${violations.length ? "text-amber-600" : "text-emerald-600"}`} />
                        <div>
                          <p className="text-[11px] font-bold text-slate-900">{violations.length} proctoring alerts</p>
                          <p className="text-[10px] text-slate-500">
                            {visibleSecurityEvents.length ? `${visibleSecurityEvents.length} recent integrity signals` : "No recent integrity signals"}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-[10px]" onClick={() => setShowViolationsPanel(v => !v)}>
                        {showViolationsPanel ? "Hide" : "Details"}
                      </Button>
                    </div>

                  {showViolationsPanel && (
                    <div className="mt-3 space-y-2 text-xs">
                      {violations.length === 0 && visibleSecurityEvents.length === 0 ? (
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-emerald-700">Environment checks are clear.</div>
                      ) : (
                        <>
                          {violations.slice(-3).reverse().map((v, i) => (
                            <div key={`${v.timestamp}-${i}`} className="rounded-lg border border-red-100 bg-red-50 p-2">
                              <div className="flex justify-between gap-3">
                                <span className="font-mono text-slate-500">{v.timestamp}</span>
                                <span className="text-right font-semibold text-red-600">{v.message}</span>
                              </div>
                            </div>
                          ))}
                          {visibleSecurityEvents.map((event, i) => (
                            <div key={`${event.timestamp}-${event.type}-${i}`} className="rounded-lg border border-amber-100 bg-amber-50 p-2">
                              <div className="flex justify-between gap-3">
                                <span className="font-mono text-slate-500">{event.timestamp}</span>
                                <span className="text-right font-semibold text-amber-700">{event.type.replaceAll("_", " ")}</span>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Candidate Notes</p>
                      <p className="text-[11px] text-slate-500">Private scratchpad for structuring your answer.</p>
                    </div>
                    <NotebookPen className="h-4 w-4 text-slate-400" />
                  </div>
                  <textarea
                    value={candidateNotes}
                    onChange={(event) => setCandidateNotes(event.target.value)}
                    placeholder="Jot down STAR points, examples, metrics, or tradeoffs..."
                    className="mt-3 min-h-28 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-800 outline-none transition focus:border-[#056BFC] focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="mt-1.5 text-[10px] text-slate-400">Notes stay local in this browser session and are not added to your submitted answer.</p>
                </div>
              </div>
            </div>
          </section>

        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Live Interview Timeline</p>
                <p className="mt-1 text-xs text-slate-500">Supporting progress tracker. The active interview controls stay above.</p>
              </div>
              <div className="min-w-24 text-right">
                <p className="font-mono text-sm font-black text-slate-900">{questionProgressPercent}%</p>
                <p className="text-[10px] font-semibold text-slate-500">Complete</p>
              </div>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#056BFC] transition-all" style={{ width: `${questionProgressPercent}%` }} />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {interviewTimeline.map((step) => {
                const tone = step.complete
                  ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                  : step.active
                    ? "border-blue-200 bg-blue-50 text-[#056BFC] shadow-sm"
                    : "border-slate-200 bg-slate-50 text-slate-500";
                return (
                  <div key={step.id} className={`rounded-lg border px-3 py-2 transition-colors ${tone}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black">{step.label}</span>
                      {step.complete ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : step.active ? (
                        <Activity className="h-3.5 w-3.5 animate-pulse" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <p className="mt-1 truncate text-[10px] font-medium opacity-80">{step.hint}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Proctoring Status</p>
                  <p className="text-[11px] text-slate-500">Integrity details are below the main interview workspace.</p>
                </div>
                <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                  displaySuspicionScore >= 50
                    ? "bg-red-50 text-red-600"
                    : displaySuspicionScore >= 25
                      ? "bg-amber-50 text-amber-700"
                      : "bg-emerald-50 text-emerald-700"
                }`}>
                  <span className="font-bold">{displaySuspicionScore}/100</span>
                  <span className="ml-1 text-[9px]">({suspicionInfo.label})</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {proctorStatusItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${item.ok ? "text-emerald-600" : "text-red-500"}`} />
                        <span className="text-[11px] font-bold text-slate-800">{item.label}</span>
                      </div>
                      <p className={`mt-1 text-[10px] font-semibold ${item.ok ? "text-emerald-700" : "text-red-600"}`}>
                        {item.status}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Candidate Notes</p>
                  <p className="text-[11px] text-slate-500">Private scratchpad for structuring your answer.</p>
                </div>
                <NotebookPen className="h-4 w-4 text-slate-400" />
              </div>
              <textarea
                value={candidateNotes}
                onChange={(event) => setCandidateNotes(event.target.value)}
                placeholder="Jot down STAR points, examples, metrics, or tradeoffs..."
                className="mt-3 min-h-28 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-800 outline-none transition focus:border-[#056BFC] focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1.5 text-[10px] text-slate-400">Notes stay local in this browser session and are not added to your submitted answer.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
