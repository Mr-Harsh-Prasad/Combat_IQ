/**
 * types.ts
 * Shared TypeScript interfaces for the TKD AI Coach application.
 */

// ─── Player Stats ─────────────────────────────────────────────────────────

/**
 * Performance profile for a single athlete.
 * All metric fields are normalized 0–100 scores for display/comparison.
 */
export interface PlayerStats {
  id:        string;   // UUID
  name:      string;   // Athlete name
  rank:      string;   // e.g. "1st Dan Black Belt"
  chamber:   number;   // Chamber height score 0–100
  pivot:     number;   // Pivot angle score 0–100
  snap:      number;   // Extension snap score 0–100
  accuracy:  number;   // Overall detection confidence 0–100
  sessions:  number;   // Total recorded sessions
  createdAt: number;   // Unix timestamp
  updatedAt: number;   // Unix timestamp
}

// ─── Technical Rating ─────────────────────────────────────────────────────

/**
 * Computes a weighted Technical Rating (0–100) from a player's metrics.
 * Weights: chamber 30%, pivot 25%, snap 30%, accuracy 15%.
 */
export function calcTechnicalRating(p: PlayerStats): number {
  return Math.round(
    p.chamber  * 0.30 +
    p.pivot    * 0.25 +
    p.snap     * 0.30 +
    p.accuracy * 0.15
  );
}

/**
 * Returns the rating tier label for a Technical Rating score.
 */
export function getRatingTier(rating: number): {
  label: string;
  color: string;
} {
  if (rating >= 85) return { label: 'Elite',       color: '#ffd700' };
  if (rating >= 70) return { label: 'Advanced',    color: '#3a86ff' };
  if (rating >= 55) return { label: 'Intermediate',color: '#10b981' };
  if (rating >= 40) return { label: 'Developing',  color: '#f97316' };
  return              { label: 'Beginner',    color: '#e63946' };
}
