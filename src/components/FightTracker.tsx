/**
 * FightTracker.tsx
 * Multi-person pose tracking using @mediapipe/tasks-vision.
 * Renders Red & Blue skeletons, detects impacts, falling, and passive play.
 * Also tracks per-fighter TKD biomechanics for live comparison.
 */

import React, { useRef, useEffect, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { POSE_CONNECTIONS } from '@mediapipe/pose';
import { assignColors, analyzeFightFrame, resetFightEngine } from '../utils/FightEngine';
import type { FightState, FightMetrics } from '../utils/FightEngine';
import { analyzePose } from '../utils/tkd-math';
import type { TKDMetrics } from '../utils/tkd-math';
import { AlertTriangle } from 'lucide-react';

export interface FighterSnapshot {
  red:  TKDMetrics | null;
  blue: TKDMetrics | null;
}

interface FightTrackerProps {
  isActive: boolean;
  myCorner: 'red' | 'blue';
  onAnalysisUpdate: (state: FightState, metrics: FightMetrics) => void;
  onFramesCaptured: (frames: string[]) => void;
  onFighterMetrics?: (snapshot: FighterSnapshot) => void;
}

export const FightTracker: React.FC<FightTrackerProps> = ({
  isActive,
  myCorner,
  onAnalysisUpdate,
  onFramesCaptured,
  onFighterMetrics,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  // Frame capture logic for Corner AI
  const framesBuffer    = useRef<string[]>([]);
  const lastCaptureTime = useRef<number>(0);

  // Per-fighter prev landmarks for extension snap
  const prevRedRef  = useRef<any[] | null>(null);
  const prevBlueRef = useRef<any[] | null>(null);

  // Load MediaPipe Tasks Vision
  useEffect(() => {
    let canceled = false;
    const initVision = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        if (canceled) return;

        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numPoses: 2,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (canceled) { landmarker.close(); return; }
        landmarkerRef.current = landmarker;
      } catch (err: unknown) {
        console.error("Failed to load PoseLandmarker:", err);
        if (!canceled) {
          setStatus('error');
          setErrorMsg(err instanceof Error ? err.message : String(err));
        }
      }
    };
    initVision();

    return () => {
      canceled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  // Camera & Tracking Loop
  useEffect(() => {
    if (!isActive || !landmarkerRef.current) {
      if (!isActive) {
        resetFightEngine();
        prevRedRef.current  = null;
        prevBlueRef.current = null;
      }
      return;
    }

    let stream: MediaStream | null = null;
    let canceled = false;

    const startCamera = async () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        if (canceled) return;
        video.srcObject = stream;
        await video.play();
        setStatus('running');

        const loop = () => {
          if (canceled || !landmarkerRef.current) return;

          if (video.readyState >= 2 && !video.paused) {
            const startTimeMs = performance.now();
            const results = landmarkerRef.current.detectForVideo(video, startTimeMs);

            const ctx = canvas.getContext('2d');
            if (ctx) {
              const w = video.videoWidth  || 640;
              const h = video.videoHeight || 480;
              if (canvas.width  !== w) canvas.width  = w;
              if (canvas.height !== h) canvas.height = h;

              ctx.save();
              ctx.translate(w, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(video, 0, 0, w, h);

              if (results.landmarks && results.landmarks.length > 0) {
                const players = assignColors(results.landmarks);

                players.forEach(p => {
                  const color  = p.id === 'red' ? '#e63946' : '#3a86ff';
                  const isUser = p.id === myCorner;

                  drawConnectors(ctx, p.landmarks, POSE_CONNECTIONS, {
                    color: `${color}AA`, lineWidth: isUser ? 5 : 3
                  });
                  drawLandmarks(ctx, p.landmarks, {
                    color, fillColor: isUser ? '#fff' : color, lineWidth: 1, radius: isUser ? 5 : 4
                  });

                  if (isUser && p.landmarks[0]) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 16px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('YOU', p.landmarks[0].x * w, p.landmarks[0].y * h - 30);
                  }
                });

                // Fight engine analysis
                const analysis = analyzeFightFrame(players);
                onAnalysisUpdate(analysis.state, analysis.metrics);

                // Per-fighter TKD biomechanics
                if (onFighterMetrics) {
                  const redPlayer  = players.find(p => p.id === 'red');
                  const bluePlayer = players.find(p => p.id === 'blue');
                  const snapshot: FighterSnapshot = {
                    red:  redPlayer  ? analyzePose(redPlayer.landmarks  as any, prevRedRef.current)  : null,
                    blue: bluePlayer ? analyzePose(bluePlayer.landmarks as any, prevBlueRef.current) : null,
                  };
                  prevRedRef.current  = redPlayer?.landmarks  as any ?? null;
                  prevBlueRef.current = bluePlayer?.landmarks as any ?? null;
                  onFighterMetrics(snapshot);
                }

                // Frame capture every 3.3 seconds for Corner AI
                const now = Date.now();
                if (now - lastCaptureTime.current > 3333) {
                  const frameData = canvas.toDataURL('image/jpeg', 0.6);
                  framesBuffer.current.push(frameData);
                  lastCaptureTime.current = now;
                  if (framesBuffer.current.length >= 3) {
                    onFramesCaptured([...framesBuffer.current]);
                    framesBuffer.current = [];
                  }
                }
              }
              ctx.restore();
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);

      } catch (err: unknown) {
        if (!canceled) {
          setStatus('error');
          setErrorMsg(err instanceof Error ? err.message : String(err));
        }
      }
    };

    startCamera();

    return () => {
      canceled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [isActive, landmarkerRef.current, onAnalysisUpdate, onFramesCaptured, onFighterMetrics]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden" style={{ minHeight: 380, background: '#0a0b0f' }}>
      <video ref={videoRef} playsInline muted style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-sm">Loading multi-person AI model...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-400">
          <AlertTriangle size={32} />
          <p className="text-sm">Camera or AI Error</p>
          <p className="text-xs text-center max-w-sm">{errorMsg}</p>
        </div>
      )}
    </div>
  );
};
