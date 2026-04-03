/**
 * PoseTracker.tsx
 * Webcam via native getUserMedia + MediaPipe Pose (WASM served locally).
 *
 * KEY FIX: onResults is stored in a ref so the camera/model useEffect only
 * restarts when isActive changes — not when the parent re-renders with a new
 * onMetricsUpdate callback reference. Without this the camera tears down and
 * reinitialises on every metrics update, causing the rapid open/close/reload loop.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import type { Results } from '@mediapipe/pose';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import type { Landmark, TKDMetrics } from '../utils/tkd-math';
import { analyzePose } from '../utils/tkd-math';

interface PoseTrackerProps {
  onMetricsUpdate: (metrics: TKDMetrics) => void;
  isActive: boolean;
  verdict?: string;
}

type Status = 'idle' | 'camera' | 'model' | 'running' | 'error';

const SKELETON_CONFIG = {
  connectorColor: 'rgba(58, 134, 255, 0.85)',
  landmarkColor:  'rgba(230, 57, 70, 0.9)',
  fillColor:      'rgba(230, 57, 70, 0.3)',
  lineWidth: 3,
  radius:    5,
};

export const PoseTracker: React.FC<PoseTrackerProps> = ({ onMetricsUpdate, isActive, verdict }) => {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const poseRef    = useRef<Pose | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number | null>(null);
  const prevLmsRef = useRef<Landmark[] | null>(null);
  const frameCount = useRef(0);
  const runningRef = useRef(false);

  const [status, setStatus]     = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Stable ref for the latest onMetricsUpdate ──────────────────────────
  // This prevents the camera/model effect from restarting every time the
  // parent component re-renders with a new callback reference.
  const onMetricsUpdateRef = useRef(onMetricsUpdate);
  useEffect(() => {
    onMetricsUpdateRef.current = onMetricsUpdate;
  });

  // onResults is now STABLE — it reads the callback via ref, not closure
  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = video.videoWidth  || 640;
    const h = video.videoHeight || 480;
    if (canvas.width !== w)  canvas.width  = w;
    if (canvas.height !== h) canvas.height = h;

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, 0, 0, w, h);

    if (results.poseLandmarks?.length) {
      const landmarks = results.poseLandmarks as Landmark[];

      drawConnectors(ctx, landmarks, POSE_CONNECTIONS, {
        color: SKELETON_CONFIG.connectorColor,
        lineWidth: SKELETON_CONFIG.lineWidth,
      });
      drawLandmarks(ctx, landmarks, {
        color:     SKELETON_CONFIG.landmarkColor,
        fillColor: SKELETON_CONFIG.fillColor,
        lineWidth: 1,
        radius:    SKELETON_CONFIG.radius,
      });

      ctx.restore();

      const metrics = analyzePose(landmarks, prevLmsRef.current);
      prevLmsRef.current = landmarks;

      frameCount.current++;
      if (frameCount.current % 30 === 0) {
        console.log('[PoseTracker] Landmarks:', {
          leftKnee:  { x: landmarks[25]?.x?.toFixed(3), y: landmarks[25]?.y?.toFixed(3) },
          rightKnee: { x: landmarks[26]?.x?.toFixed(3), y: landmarks[26]?.y?.toFixed(3) },
          metrics,
        });
      }
      // Call via ref — stable, no re-render side-effects on parent
      onMetricsUpdateRef.current(metrics);
    } else {
      ctx.restore();
    }
  }, []); // ← deliberately empty: callback is stable for the lifetime of the component

  // ── Main camera + model lifecycle — only restarts when isActive changes ──
  useEffect(() => {
    if (!isActive) {
      setStatus('idle');
      setErrorMsg('');
      return;
    }

    let cancelled = false;

    const start = async () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      // ── Step 1: Camera ──────────────────────────────────────────────────
      setStatus('camera');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[PoseTracker] Camera error:', err);
        setStatus('error');
        setErrorMsg(`Camera: ${msg}`);
        return;
      }

      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      video.srcObject = stream;

      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('Video element error'));
          setTimeout(() => reject(new Error('Camera timed out after 10s')), 10000);
        });
        await video.play();
        console.log('[PoseTracker] Camera ready:', video.videoWidth, 'x', video.videoHeight);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus('error');
        setErrorMsg(`Video play: ${msg}`);
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      // ── Step 2: MediaPipe Pose ──────────────────────────────────────────
      setStatus('model');
      try {
        const pose = new Pose({
          locateFile: (file) => `/mediapipe/pose/${file}`,
        });
        pose.setOptions({
          modelComplexity:        1,
          smoothLandmarks:        true,
          enableSegmentation:     false,
          smoothSegmentation:     false,
          minDetectionConfidence: 0.55,
          minTrackingConfidence:  0.55,
        });
        pose.onResults(onResults);
        poseRef.current = pose;

        // Warm up the model with one frame
        await pose.send({ image: video });
        console.log('[PoseTracker] MediaPipe Pose model ready');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[PoseTracker] Model load error:', err);
        setStatus('error');
        setErrorMsg(`Model: ${msg}`);
        return;
      }

      if (cancelled) return;

      // ── Step 3: rAF loop ────────────────────────────────────────────────
      setStatus('running');
      runningRef.current = true;

      const loop = async () => {
        if (!runningRef.current || cancelled) return;
        try {
          if (video.readyState >= 2 && !video.paused) {
            await poseRef.current?.send({ image: video });
          }
        } catch (err) {
          console.warn('[PoseTracker] Frame error:', err);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    };

    start();

    return () => {
      cancelled = true;
      runningRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      poseRef.current?.close();
      poseRef.current = null;
      prevLmsRef.current = null;
    };
  }, [isActive, onResults]); // onResults is now stable (empty deps), so this only fires on isActive changes

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden" style={{ minHeight: 320 }}>
      {/* Hidden video feed */}
      <video
        ref={videoRef}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
        playsInline
        muted
      />

      {/* Canvas — visible output */}
      <canvas
        ref={canvasRef}
        style={{ display: status === 'running' ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Status overlay — shown while loading or on error */}
      {status !== 'running' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-4"
          style={{ background: 'rgba(10,11,15,0.95)' }}
        >
          {status === 'camera' && (
            <>
              <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-blue-400 text-sm font-medium">Accessing camera…</p>
              <p className="text-gray-500 text-xs">Allow camera permission when prompted</p>
            </>
          )}
          {status === 'model' && (
            <>
              <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-yellow-400 text-sm font-medium">Loading AI Pose model…</p>
              <p className="text-gray-500 text-xs">Downloading ~7 MB (one-time)</p>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="text-3xl">⚠️</div>
              <p className="text-red-400 text-sm font-semibold">Error</p>
              <p className="text-gray-400 text-xs max-w-xs break-words">{errorMsg}</p>
              <p className="text-gray-600 text-xs mt-2">Check browser console for details</p>
            </>
          )}
        </div>
      )}

      {/* HUD corners — only when running */}
      {status === 'running' && (
        <>
          <div className="absolute inset-2 pointer-events-none">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-blue-400 opacity-70 rounded-tl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-blue-400 opacity-70 rounded-tr" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-blue-400 opacity-70 rounded-bl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-blue-400 opacity-70 rounded-br" />
          </div>

          {/* AI Coach caption overlay — verdict from side panel */}
          {verdict && (
            <div
              className="absolute bottom-0 left-0 right-0 px-4 py-3 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)',
              }}
            >
              <div className="flex items-start gap-2">
                <span className="text-yellow-400 text-xs font-bold uppercase tracking-widest flex-shrink-0 mt-0.5">AI</span>
                <p
                  className="text-white text-sm leading-snug"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)', fontStyle: 'italic' }}
                >
                  {verdict}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PoseTracker;
