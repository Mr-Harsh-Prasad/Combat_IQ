/**
 * CoachOverlay.tsx
 * Full-screen overlay rendered on top of the camera feed.
 * Renders the appropriate sub-component based on the current coach state.
 */
import React from 'react';
import type { CoachState, IdleLevel } from '../hooks/useCoachStateMachine';
import type { StructuredFeedback } from '../utils/CoachBrain';
import { AnalyzingIndicator } from './AnalyzingIndicator';
import { KickGuessDisplay } from './KickGuessDisplay';
import { FeedbackCard } from './FeedbackCard';
import { IdlePrompt } from './IdlePrompt';

interface CoachOverlayProps {
  coachState: CoachState;
  guessText: string;
  feedback: StructuredFeedback | null;
  idleLevel: IdleLevel;
  isActive: boolean;
  athleteName?: string;
}

export const CoachOverlay: React.FC<CoachOverlayProps> = ({
  coachState,
  guessText,
  feedback,
  idleLevel,
  isActive,
  athleteName,
}) => {
  return (
    <div className="coach-overlay-root">

      {/* ── Corner HUD — always visible when active ── */}
      {isActive && (
        <div className="coach-hud-corner">
          <div className="hud-live-dot" />
          <span className="hud-label">LIVE</span>
          {athleteName && <span className="hud-athlete">{athleteName}</span>}
          <span className={`hud-state-badge hud-state-${coachState}`}>
            {coachState === 'idle'      && '● IDLE'}
            {coachState === 'detecting' && '◉ KICK'}
            {coachState === 'analyzing' && '◎ ANALYZING'}
            {coachState === 'feedback'  && '● FEEDBACK'}
            {coachState === 'waiting'   && '○ WAIT'}
          </span>
        </div>
      )}

      {/* ── Center content area ── */}
      <div className="coach-overlay-center">

        {/* ANALYZING: show spinner + guess */}
        {(coachState === 'detecting' || coachState === 'analyzing') && (
          <div className="coach-center-stack">
            <AnalyzingIndicator />
            {coachState === 'analyzing' && guessText && (
              <KickGuessDisplay guessText={guessText} />
            )}
          </div>
        )}

        {/* FEEDBACK: show card, fade out on 'waiting' */}
        {(coachState === 'feedback' || coachState === 'waiting') && feedback && (
          <FeedbackCard feedback={feedback} visible={coachState === 'feedback'} />
        )}

      </div>

      {/* ── Idle prompt — bottom center ── */}
      {coachState === 'idle' && isActive && (
        <IdlePrompt level={idleLevel} />
      )}

      {/* ── Corner brackets (targeting reticle) ── */}
      {isActive && (
        <div className="coach-reticle">
          <div className="reticle-tl" />
          <div className="reticle-tr" />
          <div className="reticle-bl" />
          <div className="reticle-br" />
          {/* Subtle scan line */}
          <div className="scan-line" />
        </div>
      )}

    </div>
  );
};

export default CoachOverlay;
