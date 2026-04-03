/**
 * KickGuessDisplay.tsx
 * Human-like guess text: "Hmm... looks like a Roundhouse Kick 🦵"
 * Slides in from bottom with fade, auto-visible while coachState === 'analyzing'
 */
import React from 'react';

interface KickGuessDisplayProps {
  guessText: string;
}

export const KickGuessDisplay: React.FC<KickGuessDisplayProps> = ({ guessText }) => {
  if (!guessText) return null;
  return (
    <div className="kick-guess-display" aria-live="polite">
      <span className="guess-eyebrow">Hmm… looks like a</span>
      <span className="guess-kick-name">{guessText}</span>
    </div>
  );
};

export default KickGuessDisplay;
