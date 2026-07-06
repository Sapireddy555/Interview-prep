# Interview Platform - Recommended Improvements & Fixes

## Critical Fixes (High Priority)

### 1. **Speech Synthesis Resume Bug** 
**File:** `src/hooks/use-azure-speech.ts`
**Issue:** When AI finishes speaking, `speak()` auto-calls `startContinuous()` without waiting. Can cause double-start or conflict.
**Fix:** Add proper state sequencing
```tsx
utterance.onend = () => {
  setIsSpeaking(false);
  // Only resume if we didn't manually toggle voice off
  if (isVoiceEnabled) {
    setTimeout(startContinuous, 800); // Increased delay for cleanup
  }
};
```

### 2. **Response Validation Missing**
**File:** `src/app/interview/interview-view.tsx`
**Issue:** Candidates can submit single-word or very short responses that don't meet interview standards.
**Fix:** Add minimum word count validation
```tsx
const MIN_RESPONSE_WORDS = 10;
const wordCount = trimmedResponse.split(/\s+/).filter(w => w.length > 0).length;
if (wordCount < MIN_RESPONSE_WORDS) {
  toast({
    title: "Response too short",
    description: `Please provide at least ${MIN_RESPONSE_WORDS} words in your response.`,
    variant: "destructive",
  });
  return;
}
```

### 3. **Recording Upload Failures Silent**
**File:** `src/app/interview/interview-view.tsx` (line ~700)
**Issue:** `recordingUploadErrorRef` silently tracks errors, but completion proceeds without warning.
**Fix:** Warn user and offer retry
```tsx
if (recordingUploadErrorRef.current) {
  const shouldContinue = await new Promise(resolve => {
    // Show modal: "Recording failed. Continue anyway?"
    resolve(true); // or false to retry
  });
  if (!shouldContinue) {
    // Retry upload logic
  }
}
```

---

## UX Improvements (Medium Priority)

### 4. **Add Keyboard Shortcuts**
**File:** `src/app/interview/interview-view.tsx`
**Add support for:**
- `Spacebar` → Toggle record/stop
- `Enter` → Submit answer
- `S` → Skip question
- `M` → Toggle microphone
- `V` → Toggle voice

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (isCompletingInterview || !hasAcceptedConsent) return;
    
    if (e.code === 'Space' && !isRecordingControlled) {
      e.preventDefault();
      handleRecordToggle();
    } else if (e.code === 'Enter' && isRecordingControlled) {
      e.preventDefault();
      handleSubmitAnswer();
    } else if (e.code === 'KeyS' && !isRecordingControlled) {
      e.preventDefault();
      handleSkipQuestion();
    } else if (e.code === 'KeyV') {
      e.preventDefault();
      toggleVoice();
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [isRecordingControlled, isCompletingInterview, hasAcceptedConsent]);
```

### 5. **Add Pause/Resume Interview**
**File:** `src/app/interview/interview-view.tsx`
**Issue:** If candidate needs a break, they must keep talking or lose session.
**Fix:** Add pause button that freezes timer (for X seconds max)
```tsx
const [isPaused, setIsPaused] = useState(false);
const pauseStartTimeRef = useRef<number | null>(null);
const MAX_PAUSE_DURATION = 5 * 60; // 5 minutes max

const handlePause = () => {
  if (isPaused) {
    // Resume
    const pausedDuration = Date.now() - (pauseStartTimeRef.current || Date.now());
    if (pausedDuration <= MAX_PAUSE_DURATION * 1000) {
      setIsPaused(false);
      pauseStartTimeRef.current = null;
    }
  } else {
    setIsPaused(true);
    pauseStartTimeRef.current = Date.now();
  }
};
```

### 6. **Draft Response Auto-Save**
**File:** `src/app/interview/interview-view.tsx`
**Issue:** If browser crashes, candidate loses typed response.
**Fix:** Save to localStorage every 5s
```tsx
useEffect(() => {
  const interval = setInterval(() => {
    if (draftResponse && interviewId) {
      sessionStorage.setItem(
        `interview_${interviewId}_draft`,
        JSON.stringify({
          draftResponse,
          currentTranscript,
          timestamp: Date.now(),
        })
      );
    }
  }, 5000);
  
  return () => clearInterval(interval);
}, [draftResponse, currentTranscript, interviewId]);

// On mount, restore draft
useEffect(() => {
  if (interviewId) {
    const saved = sessionStorage.getItem(`interview_${interviewId}_draft`);
    if (saved) {
      try {
        const { draftResponse: savedDraft } = JSON.parse(saved);
        setDraftResponse(savedDraft);
      } catch {}
    }
  }
}, [interviewId]);
```

### 7. **Better Session Timeout UX**
**File:** `src/app/interview/interview-view.tsx`
**Current:** Timer just runs down silently until 0.
**Fix:** Add milestones and warnings
```tsx
useEffect(() => {
  // Warn at 5 min remaining
  if (remainingSeconds === 5 * 60) {
    toast({
      title: "5 minutes remaining",
      description: "Please wrap up your current response.",
    });
  }
  // Warn at 1 min remaining
  if (remainingSeconds === 60) {
    toast({
      title: "1 minute remaining",
      description: "Interview will auto-submit soon.",
      variant: "destructive",
    });
  }
}, [remainingSeconds, toast]);
```

---

## Proctoring Improvements (Medium Priority)

### 8. **Reduce False Positives in Face Detection**
**File:** `src/app/interview/interview-view.tsx` (line ~460)
**Issue:** MediaPipe strike thresholds might be too aggressive, causing false "looking away" warnings.
**Fix:** Add confidence scoring
```tsx
// Add confidence threshold
const MEDIAPIPE_CONFIDENCE_THRESHOLD = 0.65; // was hardcoded at 0.55

// Tune strike requirements based on violation type
const STRIKE_REQUIREMENTS: Record<string, number> = {
  looking_away: 4, // More tolerance
  multiple_faces: 2, // Stricter
  face_too_small: 3,
};

// Add recovery suggestions in violation messages
const violationMessages = {
  looking_away: "Please keep your attention on the screen. You may need to adjust your camera position.",
  multiple_faces: "Please ensure only one person is visible in the camera frame.",
  face_too_small: "Please move closer to the camera or adjust the distance.",
};
```

### 9. **Improve Proctoring Status Feedback**
**File:** `src/app/interview/interview-view.tsx`
**Add clarity on:**
- What triggers "Review" suspicion score
- How violations are weighted
- Show recent violations with timestamps and recovery suggestions (not just alerts)

---

## Performance Optimizations (Low Priority)

### 10. **Lazy Load Proctoring Components**
**File:** `src/app/interview/interview-view.tsx`
**Issue:** MediaPipe loads at startup even if candidate disables it.
**Fix:** Lazy load MediaPipe only when needed
```tsx
const getMediaPipeFaceLandmarker = useCallback(async () => {
  if (!isMountedRef.current || mediaPipeDisabledRef.current) return null;
  
  // Only import if needed
  if (mediaPipeFaceLandmarkerRef.current) return mediaPipeFaceLandmarkerRef.current;
  
  // Load on-demand
  // ... existing logic
}, []);
```

### 11. **Optimize State Updates**
**File:** `src/app/interview/interview-view.tsx`
**Issue:** `violations` state syncs from ref every 1s (line ~1265), causing unnecessary re-renders.
**Fix:** Use `useTransition` for non-blocking updates
```tsx
const [_isPending, startTransition] = useTransition();

useEffect(() => {
  const interval = setInterval(() => {
    startTransition(() => {
      if (violationsRef.current.length !== violations.length) {
        setViolations([...violationsRef.current]);
      }
    });
  }, 1000);
  return () => clearInterval(interval);
}, [violations.length]);
```

---

## Type Safety & Code Quality

### 12. **Fix TypeScript Warnings**
- Replace `any` with proper types in MediaPipe landmarker (line 93-94)
- Use `msgs.at(-1)` instead of `msgs[msgs.length - 1]` (line 752)
- Remove `void` operator misuse (lines 180, 834, 942, 1030, 1045)

### 13. **Error Boundaries for Recording**
**File:** `src/app/interview/interview-view.tsx`
**Add graceful fallback if recording fails:**
```tsx
try {
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
} catch (e) {
  console.warn("WebM codec unavailable, falling back to default");
  recorder = new MediaRecorder(stream);
}
```

---

## Summary of Changes by Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **Critical** | Fix speech resume bug | 30 min | Prevents audio loop errors |
| **Critical** | Add response validation | 20 min | Prevents low-quality responses |
| **Critical** | Improve recording error UX | 45 min | Prevents silent failures |
| **High** | Add keyboard shortcuts | 45 min | Better accessibility |
| **High** | Draft auto-save | 30 min | Prevents data loss |
| **High** | Better timeout warnings | 20 min | Better UX |
| **Medium** | Pause/resume | 60 min | Better UX for nervous candidates |
| **Medium** | Improve proctoring feedback | 60 min | Reduce frustration with false positives |
| **Low** | Lazy load MediaPipe | 30 min | ~50KB less initial JS |
| **Low** | Optimize state updates | 30 min | Smoother UI |

**Estimated Total Effort:** ~8-10 hours for all improvements
**Recommended Implementation Order:** Critical → High → Medium → Low
