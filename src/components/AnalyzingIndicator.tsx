/**
 * AnalyzingIndicator.tsx
 * Shows "Analyzing..." with animated pulsing dots during the thinking phase.
 */

import React from 'react';

export const AnalyzingIndicator: React.FC = () => (
  <div className="coach-analyzing-indicator" aria-live="polite">
    <div className="analyzing-dots">
      <span /><span /><span />
    </div>
    <span className="analyzing-text">Analyzing</span>
  </div>
);

export default AnalyzingIndicator;
