/**
 * useCoachStateMachine.ts
 * Orchestrates the coaching lifecycle:
 *   IDLE → DETECTING → ANALYZING → FEEDBACK → WAITING → IDLE
 *
 * Handles:
 *  - Kick detection gating (debounce per kick event)
 *  - 0.5–1s "thinking" delay before guess
 *  - Guess display → full feedback transition
 *  - Auto-dismiss feedback after 4s
 *  - Idle reminders at 5s / 10s / 15s
 *  - No overlapping states
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TKDMetrics } from '../utils/tkd-math';
import type { StructuredFeedback } from '../utils/CoachBrain';
import { guessKickType, getStructuredFeedback, assessKickQuality, detectKickType } from '../utils/CoachBrain';

export type CoachState =
  | 'idle'
  | 'detecting'
  | 'analyzing'
  | 'feedback'
  | 'waiting';

export type IdleLevel = 0 | 1 | 2 | 3;

export interface CoachStateData {
  coachState: CoachState;
  guessText: string;                       // e.g. "Hmm... looks like a Roundhouse Kick 👀"
  feedback: StructuredFeedback | null;
  idleLevel: IdleLevel;                    // 0=none, 1=ready, 2=come on, 3=stay active
}

const KICK_DETECT_COOLDOWN_MS = 5000;     // Minimum time between kick events
const THINKING_DELAY_MS       = 750;      // 0.5–1s thinking pause
const GUESS_DISPLAY_MS        = 1800;     // How long guess shows before full card
const FEEDBACK_DISPLAY_MS     = 4500;     // Feedback card auto-hide
const WAITING_TO_IDLE_MS      = 2500;     // Silent wait before going back to IDLE
const IDLE_LEVEL_1_MS         = 5000;     // "Ready when you are"
const IDLE_LEVEL_2_MS         = 10000;    // "Come on… throw your next kick"
const IDLE_LEVEL_3_MS         = 16000;    // "Stay active. Try a faster kick"

export function useCoachStateMachine(
  isActive: boolean,
  voiceSpeak?: (text: string, interrupt?: boolean) => void,
  onKickRecorded?: (kickType: string, isGood: boolean, overallScore: number) => void,
) {
  const [coachState, setCoachState] = useState<CoachState>('idle');
  const [guessText, setGuessText]   = useState('');
  const [feedback, setFeedback]     = useState<StructuredFeedback | null>(null);
  const [idleLevel, setIdleLevel]   = useState<IdleLevel>(0);

  // Refs for timer cleanup
  const lockRef            = useRef(false);     // Prevents re-entry during async flow
  const lastKickTimeRef    = useRef(0);         // Cooldown gating
  const idleTimersRef      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flowTimersRef      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latestMetricsRef   = useRef<TKDMetrics | null>(null);

  // ── Idle timer management ────────────────────────────────────────────────
  const clearIdleTimers = useCallback(() => {
    idleTimersRef.current.forEach(clearTimeout);
    idleTimersRef.current = [];
    setIdleLevel(0);
  }, []);

  const startIdleTimers = useCallback(() => {
    clearIdleTimers();
    const t1 = setTimeout(() => setIdleLevel(1), IDLE_LEVEL_1_MS);
    const t2 = setTimeout(() => setIdleLevel(2), IDLE_LEVEL_2_MS);
    const t3 = setTimeout(() => setIdleLevel(3), IDLE_LEVEL_3_MS);
    idleTimersRef.current = [t1, t2, t3];
  }, [clearIdleTimers]);

  // ── Flow timer management ───────────────────────────────────────────────
  const clearFlowTimers = useCallback(() => {
    flowTimersRef.current.forEach(clearTimeout);
    flowTimersRef.current = [];
  }, []);

  const addFlowTimer = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    flowTimersRef.current.push(t);
    return t;
  }, []);

  // ── Main kick processing flow ────────────────────────────────────────────
  const processKick = useCallback(async (metrics: TKDMetrics) => {
    if (lockRef.current) return;
    const now = Date.now();
    if (now - lastKickTimeRef.current < KICK_DETECT_COOLDOWN_MS) return;
    lastKickTimeRef.current = now;
    lockRef.current = true;

    clearIdleTimers();
    clearFlowTimers();

    // Assess quality BEFORE async flow
    const { isGood, overallScore } = assessKickQuality(metrics);
    const kickInfo = detectKickType(metrics);
    const kickQuality: 'good' | 'bad' = isGood ? 'good' : 'bad';

    // 1. DETECTING — kick registered
    setCoachState('detecting');
    setGuessText('');
    setFeedback(null);

    // 2. ANALYZING — after thinking delay
    addFlowTimer(async () => {
      setCoachState('analyzing');

      // Show kick type guess
      const guess = guessKickType(metrics);
      setGuessText(guess);

      // Voice: for good kick say something encouraging; for bad say kick name
      if (isGood) {
        voiceSpeak?.(`${kickInfo.name}! Let's see the analysis.`, false);
      } else {
        voiceSpeak?.(`${kickInfo.name} detected.`, false);
      }

      // 3. Get structured feedback (async) and show FEEDBACK state
      addFlowTimer(async () => {
        let fb: StructuredFeedback;
        try {
          fb = await getStructuredFeedback(metrics, kickQuality);
        } catch {
          // Fallback: local computation
          fb = buildLocalFeedback(metrics, kickQuality);
        }

        setFeedback(fb);
        setCoachState('feedback');

        // Record kick in counter
        onKickRecorded?.(kickInfo.name, isGood, overallScore);

        // Voice: praise for good, first tip for bad
        if (isGood) {
          addFlowTimer(() => {
            voiceSpeak?.(`${fb.tips[0] ?? 'Excellent technique!'}`, false);
          }, 400);
        } else if (fb.tips.length > 0) {
          addFlowTimer(() => {
            voiceSpeak?.(`${fb.tips[0]}`, false);
          }, 600);
        }

        // 4. Auto-dismiss feedback → WAITING
        addFlowTimer(() => {
          setCoachState('waiting');

          // 5. Back to IDLE after brief silence
          addFlowTimer(() => {
            setCoachState('idle');
            setGuessText('');
            setFeedback(null);
            lockRef.current = false;
            startIdleTimers();
          }, WAITING_TO_IDLE_MS);
        }, FEEDBACK_DISPLAY_MS);
      }, GUESS_DISPLAY_MS);
    }, THINKING_DELAY_MS);
  }, [addFlowTimer, clearFlowTimers, clearIdleTimers, startIdleTimers, voiceSpeak, onKickRecorded]);

  // ── Public: called by PoseTracker on every metrics update ───────────────
  const onMetrics = useCallback((metrics: TKDMetrics) => {
    latestMetricsRef.current = metrics;

    if (!isActive) return;
    if (lockRef.current) return;
    if (coachState !== 'idle') return;

    // Gate: only trigger if a kick is actually detected
    if (metrics.kickDetected) {
      processKick(metrics);
    }
  }, [isActive, coachState, processKick]);

  // ── Reset when session stops ─────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) {
      clearIdleTimers();
      clearFlowTimers();
      lockRef.current = false;
      lastKickTimeRef.current = 0;
      setCoachState('idle');
      setGuessText('');
      setFeedback(null);
      setIdleLevel(0);
    } else {
      startIdleTimers();
    }
    return () => {
      clearIdleTimers();
      clearFlowTimers();
    };
  }, [isActive, clearIdleTimers, clearFlowTimers, startIdleTimers]);

  return {
    coachState,
    guessText,
    feedback,
    idleLevel,
    onMetrics,
  } satisfies CoachStateData & { onMetrics: typeof onMetrics };
}

// ── Local (rule-based) feedback fallback ───────────────────────────────────

function buildLocalFeedback(m: TKDMetrics, kickQuality: 'good' | 'bad' = 'bad'): StructuredFeedback {
  const speedScore     = Math.min(Math.round(m.extensionSnap * 8000), 100);
  const chamberScore   = Math.min(Math.round(m.chamberHeight * 100), 100);
  const balanceScore   = Math.min(Math.round((m.pivotAngle / 90) * 100), 100);
  const extensionScore = speedScore;

  const height: StructuredFeedback['height'] =
    chamberScore >= 80 ? 'head' : chamberScore >= 55 ? 'mid' : 'low';

  const tips: string[] = [];
  if (kickQuality === 'good') {
    tips.push('Excellent technique — clean and powerful execution!');
    tips.push('Keep maintaining this level of form in every kick.');
  } else {
    if (chamberScore < 70)   tips.push('Raise your knee higher — chamber above the hip before extending.');
    if (balanceScore < 60)   tips.push('Pivot your support foot more — rotate on the ball of your foot.');
    if (speedScore < 50)     tips.push('Snap your kick faster — retract immediately after extension.');
    if (tips.length === 0)   tips.push('Good form! Focus on maintaining guard throughout the kick.');
  }

  return {
    kickType:    guessKickType(m),
    speed:       speedScore,
    height,
    balance:     balanceScore,
    chamber:     chamberScore,
    extension:   extensionScore,
    tips:        tips.slice(0, 3),
    kickQuality,
  };
}
