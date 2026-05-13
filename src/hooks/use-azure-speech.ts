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
  stopContinuous: () => void;
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
  const accumulatedTranscriptRef = useRef<string>("");
  const isStartingRef = useRef<boolean>(false);

  const resetTranscript = useCallback(() => {
    accumulatedTranscriptRef.current = "";
    setCurrentTranscript("");
  }, []);

  const stopContinuous = useCallback(() => {
    if (recognizerRef.current) {
      recognizerRef.current.stopContinuousRecognitionAsync(() => {
        setIsListening(false);
        recognizerRef.current = null;
      });
    }

    const finalTranscript = accumulatedTranscriptRef.current.trim();
    if (finalTranscript.length > 0) {
      onFinalResult(finalTranscript);
    }
  }, [onFinalResult]);

  const startContinuous = useCallback(async () => {
    if (recognizerRef.current || isStartingRef.current || isSpeaking) return;
    isStartingRef.current = true;
    resetTranscript();

    try {
      const res = await fetch('/api/speech-token');
      const { token, region } = await res.json();

      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
      speechConfig.speechRecognitionLanguage = "en-US";

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

      recognizer.recognizing = (s, e) => {
        const partialTranscript = [accumulatedTranscriptRef.current, e.result.text]
          .map((part) => part.trim())
          .filter(Boolean)
          .join(" ");
        setCurrentTranscript(partialTranscript);
      };

      recognizer.recognized = (s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          accumulatedTranscriptRef.current = [accumulatedTranscriptRef.current, e.result.text]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(" ");
          setCurrentTranscript(accumulatedTranscriptRef.current);
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

  const speak = useCallback((text: string) => {
    if (!isVoiceEnabled || !window.speechSynthesis) return;
    
    // Stop listening while AI is speaking to avoid feedback loop
    stopContinuous();

    const utterance = new SpeechSynthesisUtterance(text);
    
    if (!preferredVoiceRef.current) {
        const voices = window.speechSynthesis.getVoices();
        // Priority: Google US English -> Microsoft Aria -> Natural -> first English voice
        const voice = 
            voices.find(v => v.name === "Google US English") || 
            voices.find(v => v.name.includes("Aria")) ||
            voices.find(v => v.name.includes("Natural")) ||
            voices.find(v => v.lang.startsWith("en-"));
        
        if (voice) preferredVoiceRef.current = voice;
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
  }, [isVoiceEnabled, startContinuous, stopContinuous]);

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
      stopContinuous();
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
