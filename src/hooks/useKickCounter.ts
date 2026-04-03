/**
 * useKickCounter.ts
 * Tracks per-session kick statistics: total, good, bad kicks, and a rolling log.
 * Resets on session stop.
 */

import { useState, useCallback } from 'react';

export interface KickEntry {
  kickType:    string;
  isGood:      boolean;
  overallScore: number;
  timestamp:   number;
}

export interface KickSession {
  total:   number;
  good:    number;
  bad:     number;
  kickLog: KickEntry[];
}

const EMPTY_SESSION: KickSession = { total: 0, good: 0, bad: 0, kickLog: [] };

export function useKickCounter() {
  const [session, setSession] = useState<KickSession>(EMPTY_SESSION);

  const recordKick = useCallback((kickType: string, isGood: boolean, overallScore: number) => {
    const entry: KickEntry = {
      kickType,
      isGood,
      overallScore,
      timestamp: Date.now(),
    };
    setSession(prev => ({
      total:   prev.total + 1,
      good:    prev.good  + (isGood ? 1 : 0),
      bad:     prev.bad   + (isGood ? 0 : 1),
      kickLog: [...prev.kickLog.slice(-49), entry], // keep last 50
    }));
  }, []);

  const resetSession = useCallback(() => {
    setSession(EMPTY_SESSION);
  }, []);

  return { session, recordKick, resetSession };
}
