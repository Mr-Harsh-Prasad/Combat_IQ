/**
 * IdlePrompt.tsx
 * Subtle idle reminder text that appears when no kick has been detected.
 * Escalates through 3 levels.
 */
import React from 'react';
import type { IdleLevel } from '../hooks/useCoachStateMachine';

interface IdlePromptProps {
  level: IdleLevel;
}

const MESSAGES: Record<Exclude<IdleLevel, 0>, string> = {
  1: 'Ready when you are 🥋',
  2: 'Come on… throw your next kick 🥋',
  3: 'Stay active. Try a faster kick ⚡',
};

export const IdlePrompt: React.FC<IdlePromptProps> = ({ level }) => {
  if (level === 0) return null;
  return (
    <div className="idle-prompt" aria-live="polite">
      {MESSAGES[level]}
    </div>
  );
};

export default IdlePrompt;
