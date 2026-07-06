# Quick Enhancement Reference

## What Was Changed

### Removed ❌
- Avatar/video UI (Aarav, Meera, Priya, Rahul characters)
- Interviewer profile selection logic
- `Bot` icon usage
- 3-column grid layout

### Added ✅
- Audio-only interview interface (cleaner, simpler)
- Response length validation (min 8 words)
- Keyboard shortcuts (Spacebar, S, V, M)
- Draft auto-save (every 5 seconds)
- Session timeout warnings (5m, 2m, 1m, 10s)
- Better error messages for recording failures
- Suspicion score interpretation labels

---

## Keyboard Shortcuts (New!)

| Key | Action | When Available |
|-----|--------|------------------|
| `Spacebar` | Start/Stop Recording | During question |
| `S` | Skip Question | During question |
| `V` | Toggle Voice Narration | Anytime (after consent) |
| `M` | Stop Microphone | While recording |

**Hint:** Shown in the response control card during interview

---

## Error & Status Indicators

### Suspicion Score Labels
- **🔴 High Risk (50+):** Review recommended
- **🟡 Moderate (25-50):** Signals observed
- **🟢 Clear (0-24):** No concerns

### Recording Status
- **✅ Uploaded:** Recording chunk saved successfully
- **⚠️ Issue:** Recording couldn't save, but interview responses preserved
- **🔴 Error:** Recording failed completely (rare)

### Response Validation
- **Too Short:** "Please provide at least 8 words"
- **No Response:** "Record or type a response before submitting"
- **Valid:** ✅ Ready to submit

---

## Session Recovery

**If browser crashes:**
1. Refresh page
2. Your last draft response auto-restores
3. Click "Resume Interview" to continue

**Data saved automatically every 5 seconds:**
- Your typed/transcribed answer
- Current question index
- Timestamp

---

## Timeout Milestones

Interview will warn you at:
- ⏰ **5 minutes left:** "Wrap up your current response"
- ⏰ **2 minutes left:** "Finish your answer soon"
- ⏰ **1 minute left:** "Submitting interview soon..." (red)
- ⏰ **10 seconds left:** Final alert

After time expires: Interview auto-submits

---

## Tips for Best Results

1. **Use Keyboard Shortcuts:** Much faster than clicking
2. **Respond with substance:** Aim for 15-30 seconds per answer
3. **If unsure about recording:** Check the Speaking badge indicator
4. **Low suspicion score?** You're doing great! Continue as normal
5. **Feel camera isn't working?** Proctoring status shows in bottom right

---

## FAQ

**Q: Can I pause the interview?**
A: Not yet, but coming soon. For now, if you need a break, press `V` to stop voice narration.

**Q: What if my recording fails?**
A: Your written/spoken response is saved. Recording is backup only. Interview continues normally.

**Q: How many words should I use?**
A: Minimum 8 words (enforced). Aim for 2-3 sentences per question for best results.

**Q: What's the "Speaking" badge?**
A: Shows when AI is reading the question aloud. Helpful to know if you should wait before speaking.

**Q: Does suspicion score affect my result?**
A: No, it's for proctoring review only. Your interview quality comes from your answers.

**Q: Can I use keyboard shortcuts with screen readers?**
A: Yes! All shortcuts work alongside accessibility tools.

---

## Support

**Issue with recording?** → Check microphone permissions in browser settings  
**Can't hear narration?** → Press `V` to toggle, check volume  
**Timing out?** → Interview will auto-submit. Your answers are saved.  
**Lost draft?** → Browser sessionStorage should have restored it. Refresh if needed.

---

**Version:** 2.0 (Audio-Only, Enhanced)  
**Last Updated:** July 6, 2026  
**Status:** Production Ready
