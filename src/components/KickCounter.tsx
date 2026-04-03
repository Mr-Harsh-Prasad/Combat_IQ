/**
 * KickCounter.tsx
 * Glassmorphic overlay panel showing live session kick statistics.
 * Mounts on top of the camera feed in the Live Coach tab.
 * Displays: Total Kicks, Good Kicks, Bad Kicks, Last Kick Type, Accuracy Bar.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { KickSession } from '../hooks/useKickCounter';

interface KickCounterProps {
  session: KickSession;
  isActive: boolean;
}

/** Animated number that smoothly counts up when value changes */
const Counter: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    if (value === prev) return;
    prevRef.current = value;

    // Quick 300ms count animation
    const steps = Math.min(Math.abs(value - prev), 8);
    const step  = (value - prev) / steps;
    let current = prev;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      current += step;
      setDisplay(Math.round(current));
      if (i >= steps) {
        setDisplay(value);
        clearInterval(interval);
      }
    }, 35);
    return () => clearInterval(interval);
  }, [value]);

  return (
    <span
      style={{
        fontSize: 28,
        fontWeight: 900,
        fontFamily: "'Outfit', 'Inter', sans-serif",
        color,
        lineHeight: 1,
        display: 'block',
        textShadow: `0 0 16px ${color}55`,
        transition: 'color 0.3s',
      }}
    >
      {display}
    </span>
  );
};

export const KickCounter: React.FC<KickCounterProps> = ({ session, isActive }) => {
  if (!isActive) return null;

  const accuracy = session.total > 0
    ? Math.round((session.good / session.total) * 100)
    : 0;

  const lastKick = session.kickLog.length > 0
    ? session.kickLog[session.kickLog.length - 1]
    : null;

  const accuracyColor = accuracy >= 70 ? '#10b981' : accuracy >= 45 ? '#f59e0b' : '#ef4444';

  return (
    <div
      id="kick-counter-overlay"
      style={{
        position:        'absolute',
        top:             12,
        right:           12,
        zIndex:          30,
        borderRadius:    16,
        padding:         '14px 16px',
        minWidth:        180,
        background:      'rgba(10, 11, 20, 0.72)',
        backdropFilter:  'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border:          '1px solid rgba(255,255,255,0.10)',
        boxShadow:       '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        display:         'flex',
        flexDirection:   'column',
        gap:             10,
        pointerEvents:   'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#3a86ff',
          boxShadow: '0 0 6px #3a86ff',
          animation: 'pulse 2s infinite',
        }} />
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
          fontFamily: "'Inter', sans-serif",
        }}>
          Session Stats
        </span>
      </div>

      {/* Big 3 counters */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
        {/* Total */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Counter value={session.total} color="rgba(255,255,255,0.9)" />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Total
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 34, background: 'rgba(255,255,255,0.08)', marginBottom: 14 }} />

        {/* Good */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Counter value={session.good} color="#10b981" />
          <span style={{ fontSize: 9, color: '#10b98188', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ✅ Good
          </span>
        </div>

        {/* Bad */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Counter value={session.bad} color="#ef4444" />
          <span style={{ fontSize: 9, color: '#ef444488', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ❌ Bad
          </span>
        </div>
      </div>

      {/* Accuracy bar */}
      {session.total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Accuracy
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: accuracyColor, fontFamily: "'Outfit', 'Inter', sans-serif" }}>
              {accuracy}%
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 99,
                background: `linear-gradient(90deg, ${accuracyColor}88, ${accuracyColor})`,
                width: `${accuracy}%`,
                transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                boxShadow: `0 0 8px ${accuracyColor}66`,
              }}
            />
          </div>
        </div>
      )}

      {/* Last kick */}
      {lastKick && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span style={{ fontSize: 10 }}>{lastKick.isGood ? '✅' : '⚠️'}</span>
          <span style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.55)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 140,
          }}>
            {lastKick.kickType.split(' (')[0]}
          </span>
        </div>
      )}
    </div>
  );
};

export default KickCounter;
