/**
 * FeedbackCard.tsx
 * Floating structured feedback card displayed after kick analysis.
 * Shows kick type, speed/balance/chamber/extension bars, height badge, and tips/praise.
 * 
 * kickQuality === 'good'  → Green glow border, PERFECT badge, praise messages
 * kickQuality === 'bad'   → Red/orange glow, improvement corrections
 */
import React from 'react';
import type { StructuredFeedback } from '../utils/CoachBrain';

interface FeedbackCardProps {
  feedback: StructuredFeedback;
  visible: boolean; // controls fade-out class
}

function scoreColor(score: number): string {
  if (score >= 70) return 'bar-green';
  if (score >= 40) return 'bar-yellow';
  return 'bar-red';
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Good';
  if (score >= 40) return 'Average';
  return 'Needs Work';
}

const HEIGHT_LABELS = { low: 'LOW', mid: 'MID', head: 'HEAD' };
const HEIGHT_COLORS = {
  low:  'badge-height-low',
  mid:  'badge-height-mid',
  head: 'badge-height-head',
};

interface ScoreBarProps { label: string; score: number; }
const ScoreBar: React.FC<ScoreBarProps> = ({ label, score }) => (
  <div className="fb-metric-row">
    <div className="fb-metric-header">
      <span className="fb-metric-label">{label}</span>
      <span className={`fb-metric-score ${scoreColor(score)}-text`}>{score}%</span>
    </div>
    <div className="fb-bar-track">
      <div
        className={`fb-bar-fill ${scoreColor(score)}`}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
    <span className={`fb-metric-sublabel ${scoreColor(score)}-text`}>{scoreLabel(score)}</span>
  </div>
);

export const FeedbackCard: React.FC<FeedbackCardProps> = ({ feedback, visible }) => {
  const isGood = feedback.kickQuality === 'good';

  const cardStyle = isGood
    ? {
        '--fb-glow':        'rgba(16, 185, 129, 0.18)',
        '--fb-border':      'rgba(16, 185, 129, 0.35)',
        '--fb-bg':          'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(10,14,28,0.92) 100%)',
        '--fb-header-bg':   'rgba(16,185,129,0.10)',
      } as React.CSSProperties
    : {
        '--fb-glow':        'rgba(239, 68, 68, 0.12)',
        '--fb-border':      'rgba(239, 68, 68, 0.25)',
        '--fb-bg':          'linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(10,14,28,0.92) 100%)',
        '--fb-header-bg':   'rgba(239,68,68,0.08)',
      } as React.CSSProperties;

  return (
    <div
      className={`feedback-card ${visible ? 'fb-enter' : 'fb-exit'} ${isGood ? 'fb-good' : 'fb-bad'}`}
      style={cardStyle}
      role="region"
      aria-label="Kick Feedback"
    >
      {/* Header */}
      <div className="fb-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {isGood && (
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              ✅ PERFECT!
            </span>
          )}
          <div className="fb-kick-type">{feedback.kickType}</div>
        </div>
        <span className={`fb-height-badge ${HEIGHT_COLORS[feedback.height]}`}>
          {HEIGHT_LABELS[feedback.height]}
        </span>
      </div>

      {/* Score bars */}
      <div className="fb-metrics">
        <ScoreBar label="Speed"     score={feedback.speed} />
        <ScoreBar label="Balance"   score={feedback.balance} />
        <ScoreBar label="Chamber"   score={feedback.chamber} />
        <ScoreBar label="Extension" score={feedback.extension} />
      </div>

      {/* Divider */}
      <div className="fb-divider" />

      {/* Tips or Praise */}
      <ul className="fb-tips">
        {feedback.tips.map((tip, i) => (
          <li key={i} className="fb-tip">
            <span className="fb-tip-bullet">{isGood ? '★' : '▸'}</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FeedbackCard;

