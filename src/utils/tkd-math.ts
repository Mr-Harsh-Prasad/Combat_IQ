/**
 * tkd-math.ts
 * Biomechanical calculation utilities for Taekwondo technical analysis.
 * All landmark indices refer to MediaPipe Pose's 33-landmark skeleton.
 *
 * Landmark Reference (key ones used here):
 *  11 = LEFT_SHOULDER  12 = RIGHT_SHOULDER
 *  23 = LEFT_HIP       24 = RIGHT_HIP
 *  25 = LEFT_KNEE      26 = RIGHT_KNEE
 *  27 = LEFT_ANKLE     28 = RIGHT_ANKLE
 *  29 = LEFT_HEEL      30 = RIGHT_HEEL
 *  31 = LEFT_FOOT_INDEX 32 = RIGHT_FOOT_INDEX
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface TKDMetrics {
  chamberHeight: number;      // Normalized ratio: how high knee is relative to hip
  pivotAngle: number;         // Degrees of standing foot rotation
  extensionSnap: number;      // Ankle velocity magnitude (units/frame)
  kickLeg: 'left' | 'right';  // Which leg is detected as the kicking leg
  confidence: number;         // Average visibility of key landmarks (0–1)
  kickDetected: boolean;      // true when a kick action is confidently detected
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Computes the Euclidean distance between two 2D landmark points.
 */
function dist2D(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Computes the angle (in degrees) at vertex B, formed by the ray A→B→C.
 * Exported for re-use by any component that needs joint angle calculation
 * (e.g., full knee-bend angle for back-kick analysis).
 */
export function calcJointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (mag === 0) return 0;
  return (Math.acos(Math.min(Math.max(dot / mag, -1), 1)) * 180) / Math.PI;
}

// ─── Exported analysis functions ──────────────────────────────────────────

/**
 * CHAMBER HEIGHT
 * In Taekwondo, a proper chamber (당기기, dangigi) requires the knee to be raised
 * well above the hip line before executing any kick. This creates both power and
 * disguises the kick's trajectory from the opponent.
 *
 * Returns a ratio where:
 *   ≥ 1.0  = knee above hip (excellent chamber)
 *   0.5–1.0 = knee near hip (acceptable)
 *   < 0.5  = knee below hip (needs improvement)
 *
 * Note: In image coordinates, Y increases downward, so we invert the comparison.
 *
 * @param landmarks - Full array of 33 MediaPipe Pose landmarks (normalized 0–1)
 * @param kickLeg   - Which leg is kicking ('left' | 'right')
 * @returns Normalized chamber height ratio (positive = knee above hip)
 */
export function calcChamberHeight(
  landmarks: Landmark[],
  kickLeg: 'left' | 'right'
): number {
  const kneeIdx  = kickLeg === 'left' ? 25 : 26;
  const hipIdx   = kickLeg === 'left' ? 23 : 24;

  const knee = landmarks[kneeIdx];
  const hip  = landmarks[hipIdx];
  if (!knee || !hip) return 0;

  // Y is inverted in image space: smaller Y = higher on screen
  // ratio > 1 means knee is well above hip
  const hipHeight = 1 - hip.y;
  const kneeHeight = 1 - knee.y;
  if (hipHeight === 0) return 0;
  return kneeHeight / hipHeight;
}

/**
 * PIVOT ANGLE
 * The standing foot's rotation angle is critical in all spinning and turning kicks
 * (e.g., Dollyo Chagi, Naeryo Chagi). A full 180° pivot on the ball of the foot
 * powers the hip rotation, which is the primary force generator in TKD kicks.
 *
 * This function measures the angle of the foot vector (heel → ball of foot)
 * relative to the horizontal axis. 0° = foot pointing right; 90° = foot pointing up.
 *
 * @param landmarks - Full array of 33 MediaPipe Pose landmarks
 * @param standingLeg - The support leg ('left' | 'right')
 * @returns Pivot angle in degrees (0–180)
 */
export function calcPivotAngle(
  landmarks: Landmark[],
  standingLeg: 'left' | 'right'
): number {
  const heelIdx     = standingLeg === 'left' ? 29 : 30;
  const footTipIdx  = standingLeg === 'left' ? 31 : 32;

  const heel    = landmarks[heelIdx];
  const footTip = landmarks[footTipIdx];
  if (!heel || !footTip) return 0;

  const dx = footTip.x - heel.x;
  const dy = footTip.y - heel.y;
  const angleRad = Math.atan2(Math.abs(dy), Math.abs(dx));
  return (angleRad * 180) / Math.PI;
}

/**
 * EXTENSION SNAP (Ankle Velocity)
 * The "snap" or 채기 (chaegi) refers to the rapid extension and retraction of the
 * kicking leg at the moment of impact. In World Taekwondo competition, speed at
 * impact is a key differentiator at black belt level and above.
 *
 * This function tracks the ankle landmark's displacement between consecutive frames
 * to estimate peak velocity. Higher values indicate faster snap.
 *
 * @param prev - Previous frame's landmarks
 * @param curr - Current frame's landmarks
 * @param kickLeg - The kicking leg ('left' | 'right')
 * @returns Speed magnitude (landmark units per frame, normalized 0–1 space)
 */
export function calcExtensionSnap(
  prev: Landmark[],
  curr: Landmark[],
  kickLeg: 'left' | 'right'
): number {
  const ankleIdx = kickLeg === 'left' ? 27 : 28;
  const prevAnkle = prev[ankleIdx];
  const currAnkle = curr[ankleIdx];
  if (!prevAnkle || !currAnkle) return 0;
  return dist2D(prevAnkle, currAnkle);
}

/**
 * Determines which leg is the kicking leg based on which knee is higher.
 * Returns 'left' or 'right'.
 */
export function detectKickLeg(landmarks: Landmark[]): 'left' | 'right' {
  const leftKnee  = landmarks[25];
  const rightKnee = landmarks[26];
  if (!leftKnee || !rightKnee) return 'right';
  // Lower Y value = higher on screen = raised knee
  return leftKnee.y < rightKnee.y ? 'left' : 'right';
}

/**
 * Computes the average visibility of critical TKD landmarks.
 * Returns a confidence score from 0 to 1.
 */
export function calcConfidence(landmarks: Landmark[]): number {
  const criticalIndices = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
  const visible = criticalIndices.map(i => landmarks[i]?.visibility ?? 0);
  return visible.reduce((a, b) => a + b, 0) / visible.length;
}

/**
 * MASTER ANALYSIS FUNCTION
 * Runs all biomechanical calculations in one pass and returns a unified TKDMetrics
 * object for display and AI coach consumption.
 *
 * @param curr - Current frame landmarks (33 MediaPipe landmarks)
 * @param prev - Previous frame landmarks (for velocity calculations)
 * @returns Complete TKDMetrics snapshot
 */
export function analyzePose(curr: Landmark[], prev: Landmark[] | null): TKDMetrics {
  const kickLeg     = detectKickLeg(curr);
  const standingLeg = kickLeg === 'left' ? 'right' : 'left';

  const chamberHeight  = calcChamberHeight(curr, kickLeg);
  const pivotAngle     = calcPivotAngle(curr, standingLeg);
  const extensionSnap  = prev ? calcExtensionSnap(prev, curr, kickLeg) : 0;
  const confidence     = calcConfidence(curr);

  // A kick is "detected" when the knee is clearly raised above the hip and pose is confident
  const kickDetected = chamberHeight > 0.85 && confidence > 0.5;

  return {
    chamberHeight: Math.round(chamberHeight * 100) / 100,
    pivotAngle:    Math.round(pivotAngle * 10) / 10,
    extensionSnap: Math.round(extensionSnap * 1000) / 1000,
    kickLeg,
    confidence:    Math.round(confidence * 100) / 100,
    kickDetected,
  };
}

/**
 * Formats metrics into a compact string for AI prompt injection.
 */
export function metricsToPromptString(m: TKDMetrics): string {
  return [
    `Kick Leg: ${m.kickLeg}`,
    `Chamber Height Ratio: ${m.chamberHeight.toFixed(2)} (1.0 = knee level with hip, >1 = above hip)`,
    `Pivot Angle: ${m.pivotAngle.toFixed(1)}° (target ≥ 80° for spinning kicks)`,
    `Extension Snap Speed: ${(m.extensionSnap * 1000).toFixed(1)} (higher = faster snap)`,
    `Detection Confidence: ${(m.confidence * 100).toFixed(0)}%`,
  ].join('\n');
}
