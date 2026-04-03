/**
 * FightEngine.ts
 * Spatial reasoning for 2-player Taekwondo sparring.
 * Detects impacts, falling penalties, and passive play based on distance.
 */

export interface TrackedPlayer {
  id: 'red' | 'blue';
  landmarks: { x: number; y: number; z: number; visibility: number }[];
}

export interface FightState {
  impact:  boolean;      // True if a foot is critically close to opponent's torso/head
  falling: 'red' | 'blue' | null; // True if hips fall below knee level
  passive: boolean;      // True if distance > threshold for 5 seconds
}

export interface FightMetrics {
  distance: number;
  redScore: number;
  blueScore: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

// Approximate threshold for "contact" in normalized coordinates (0-1)
// Adjust this based on camera distance.
const IMPACT_THRESHOLD = 0.08;

// Threshold for passive play (players staying too far apart)
const PASSIVE_DISTANCE_THRESHOLD = 0.5;
const PASSIVE_TIME_THRESHOLD_MS  = 5000;

// ─── State tracking ───────────────────────────────────────────────────────

let lastEngagedTime = Date.now();
let redPoints  = 0;
let bluePoints = 0;
let lastImpactTime = 0;

export function resetFightEngine() {
  lastEngagedTime = Date.now();
  redPoints = 0;
  bluePoints = 0;
  lastImpactTime = 0;
}

// ─── Math Helpers ─────────────────────────────────────────────────────────

function dist(p1: {x:number, y:number}, p2: {x:number, y:number}): number {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function getCenterOfGravity(lms: any[]): {x:number, y:number} {
  // Average of left and right hips (23, 24)
  if (!lms[23] || !lms[24]) return { x: 0, y: 0 };
  return {
    x: (lms[23].x + lms[24].x) / 2,
    y: (lms[23].y + lms[24].y) / 2
  };
}

function checkImpact(attacker: any[], defender: any[]): boolean {
  // Attacker feet: 31 (L.foot), 32 (R.foot)
  // Defender targets: 0 (nose), 11/12 (shoulders), 23/24 (hips) - approximate torso
  const toes = [attacker[31], attacker[32]].filter(Boolean);
  const targets = [defender[0], defender[11], defender[12], defender[23], defender[24]].filter(Boolean);

  for (const toe of toes) {
    if (toe.visibility && toe.visibility < 0.5) continue;
    for (const target of targets) {
      if (target.visibility && target.visibility < 0.5) continue;
      if (dist(toe, target) < IMPACT_THRESHOLD) return true;
    }
  }
  return false;
}

function checkFalling(lms: any[]): boolean {
  // Hips: 23, 24. Knees: 25, 26.
  // In screen coords, Y=0 is top. So falling means Y gets larger.
  // If hip Y is > knee Y, they are on the ground.
  const hipY  = (lms[23]?.y + lms[24]?.y) / 2;
  const kneeY = (lms[25]?.y + lms[26]?.y) / 2;
  return hipY > kneeY;
}

// ─── Main Engine ──────────────────────────────────────────────────────────

/**
 * Assigns 'red' or 'blue' based on X coordinate (left = Red, right = Blue)
 * to maintain consistent tracking if the models swap positions in the array.
 */
export function assignColors(poses: any[][]): TrackedPlayer[] {
  if (poses.length < 2) return [];
  
  const c1 = getCenterOfGravity(poses[0]).x;
  const c2 = getCenterOfGravity(poses[1]).x;

  // Assuming mirrored canvas: closer to 0 is physically on the right, but on screen it's left.
  // Actually, standard coordinate system: X=0 is left.
  // We'll just define: smaller X = Red, larger X = Blue.
  if (c1 < c2) {
    return [
      { id: 'red',  landmarks: poses[0] },
      { id: 'blue', landmarks: poses[1] }
    ];
  } else {
    return [
      { id: 'blue', landmarks: poses[0] },
      { id: 'red',  landmarks: poses[1] }
    ];
  }
}

export function analyzeFightFrame(players: TrackedPlayer[]): { state: FightState, metrics: FightMetrics } {
  if (players.length !== 2) {
    return {
      state: { impact: false, falling: null, passive: false },
      metrics: { distance: 0, redScore: redPoints, blueScore: bluePoints }
    };
  }

  const red  = players.find(p => p.id === 'red')!.landmarks;
  const blue = players.find(p => p.id === 'blue')!.landmarks;

  // 1. Distance
  const distance = dist(getCenterOfGravity(red), getCenterOfGravity(blue));

  // 2. Passive Play
  let passive = false;
  if (distance > PASSIVE_DISTANCE_THRESHOLD) {
    if (Date.now() - lastEngagedTime > PASSIVE_TIME_THRESHOLD_MS) {
      passive = true;
    }
  } else {
    lastEngagedTime = Date.now();
  }

  // 3. Falling Penalty
  let falling: 'red' | 'blue' | null = null;
  if (checkFalling(red)) falling = 'red';
  else if (checkFalling(blue)) falling = 'blue';

  // 4. Impact Detection
  let impact = false;
  const now = Date.now();
  if (now - lastImpactTime > 1500) { // 1.5s cooldown between points
    if (checkImpact(red, blue)) {
      impact = true;
      redPoints++;
      lastImpactTime = now;
      lastEngagedTime = now;
    } else if (checkImpact(blue, red)) {
      impact = true;
      bluePoints++;
      lastImpactTime = now;
      lastEngagedTime = now;
    }
  }

  return {
    state: { impact, falling, passive },
    metrics: { distance, redScore: redPoints, blueScore: bluePoints }
  };
}
