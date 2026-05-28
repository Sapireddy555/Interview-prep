"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

export interface SpeechHookResult {
  isListening: boolean;
  isSpeaking: boolean;
  isVoiceEnabled: boolean;
  currentTranscript: string;
  toggleVoice: () => void;
  speak: (text: string) => void;
  startContinuous: () => void;
  stopContinuous: () => Promise<string>;
  resetTranscript: () => void;
}

export const useAzureSpeech = (
  onFinalResult: (text: string) => void,
  toast: (options: any) => void
): SpeechHookResult => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [currentTranscript, setCurrentTranscript] = useState("");
  
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const transcriptSegmentsRef = useRef<string[]>([]);
  const partialTranscriptRef = useRef<string>("");
  const isStartingRef = useRef<boolean>(false);

  const resetTranscript = useCallback(() => {
    transcriptSegmentsRef.current = [];
    partialTranscriptRef.current = "";
    setCurrentTranscript("");
  }, []);

  const stopContinuous = useCallback(() => {
    const buildFinalTranscript = () => {
      const parts = [...transcriptSegmentsRef.current];
      const partial = partialTranscriptRef.current.trim();
      if (partial && parts[parts.length - 1] !== partial) {
        parts.push(partial);
      }
      return parts.map((part) => part.trim()).filter(Boolean).join(" ").trim();
    };

    return new Promise<string>((resolve) => {
      const finalize = () => {
        const finalTranscript = buildFinalTranscript();
        if (finalTranscript.length > 0) {
          onFinalResult(finalTranscript);
          setCurrentTranscript(finalTranscript);
        }
        resolve(finalTranscript);
      };

      if (recognizerRef.current) {
        const recognizer = recognizerRef.current;
        recognizer.stopContinuousRecognitionAsync(() => {
          setIsListening(false);
          recognizerRef.current = null;
          window.setTimeout(finalize, 150);
        }, () => {
          setIsListening(false);
          recognizerRef.current = null;
          finalize();
        });
        return;
      }

        setIsListening(false);
      finalize();
    });
  }, [onFinalResult]);

  const startContinuous = useCallback(async () => {
    if (recognizerRef.current || isStartingRef.current || isSpeaking) return;
    isStartingRef.current = true;
    resetTranscript();

    try {
      const res = await fetch('/api/speech-token');
      const { token, region } = await res.json();

      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
      speechConfig.speechRecognitionLanguage = "en-IN";
      speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;
      speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "10000");
      speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1800");
      speechConfig.setProperty("Speech_SegmentationSilenceTimeoutMs", "1800");

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

      recognizer.recognizing = (s, e) => {
        partialTranscriptRef.current = e.result.text || "";
        const partialTranscript = [...transcriptSegmentsRef.current, partialTranscriptRef.current]
          .map((part) => part.trim())
          .filter(Boolean)
          .join(" ");
        setCurrentTranscript(partialTranscript);
      };

      recognizer.recognized = (s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = (e.result.text || "").trim();
          if (text) {
            transcriptSegmentsRef.current.push(text);
            partialTranscriptRef.current = "";
            setCurrentTranscript(transcriptSegmentsRef.current.join(" "));
            onFinalResult(transcriptSegmentsRef.current.join(" "));
          }
        }
      };

      recognizer.canceled = (s, e) => {
        console.warn("Speech recognition canceled:", e.errorDetails);
        setIsListening(false);
      };

      recognizer.startContinuousRecognitionAsync(() => {
        setIsListening(true);
      });

      recognizerRef.current = recognizer;

    } catch (error) {
    } finally {
      isStartingRef.current = false;
    }
  }, [isSpeaking, onFinalResult, resetTranscript, toast]);

  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const selectIndianEnglishVoice = useCallback(() => {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find((v) => v.lang === "en-IN" && /neural|natural|online/i.test(v.name)) ||
      voices.find((v) => v.lang === "en-IN") ||
      voices.find((v) => /india|indian|heera|ravi|neerja|prabhat/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith("en-"));

    preferredVoiceRef.current = voice || null;
    return preferredVoiceRef.current;
  }, []);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    selectIndianEnglishVoice();
    window.speechSynthesis.onvoiceschanged = selectIndianEnglishVoice;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [selectIndianEnglishVoice]);

  const speak = useCallback((text: string) => {
    if (!isVoiceEnabled || !window.speechSynthesis) return;
    
    // Stop listening while AI is speaking to avoid feedback loop
    void stopContinuous();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.94;
    utterance.pitch = 1;
    
    if (!preferredVoiceRef.current) {
      selectIndianEnglishVoice();
    }

    if (preferredVoiceRef.current) {
        utterance.voice = preferredVoiceRef.current;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
        setIsSpeaking(false);
        // Resume listening after AI finishes
        setTimeout(startContinuous, 500);
    };
    
    window.speechSynthesis.speak(utterance);
  }, [isVoiceEnabled, selectIndianEnglishVoice, startContinuous, stopContinuous]);

  const toggleVoice = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      startContinuous();
    }
    setIsVoiceEnabled(prev => !prev);
  }

  useEffect(() => {
    return () => {
      void stopContinuous();
    };
  }, [stopContinuous]);

  return { 
    isListening, 
    isSpeaking, 
    isVoiceEnabled, 
    currentTranscript, 
    toggleVoice, 
    speak, 
    startContinuous, 
    stopContinuous,
    resetTranscript,
  };
};
