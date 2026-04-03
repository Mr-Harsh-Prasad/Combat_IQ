/**
 * VideoAnalyzer.tsx
 * Clean, simple video analysis component.
 * Upload → Preview → Analyze → Results
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import type { Results } from '@mediapipe/pose';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import type { Landmark, TKDMetrics } from '../utils/tkd-math';
import { analyzePose } from '../utils/tkd-math';
import { Play, Pause, Loader2, Zap } from 'lucide-react';

interface VideoAnalyzerProps {
  videoFile: File;
  onMetricsUpdate: (metrics: TKDMetrics) => void;
  onAnalysisComplete: (allMetrics: TKDMetrics[]) => void;
}

type AnalyzeStatus = 'idle' | 'loadingModel' | 'analyzing' | 'done' | 'error';

export const VideoAnalyzer: React.FC<VideoAnalyzerProps> = ({
  videoFile,
  onMetricsUpdate,
  onAnalysisComplete,
}) => {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const poseRef      = useRef<Pose | null>(null);
  const prevLmsRef   = useRef<Landmark[] | null>(null);
  const allMetricsRef = useRef<TKDMetrics[]>([]);
  const cancelledRef = useRef(false);
  const rafRef       = useRef<number | null>(null);

  const [status, setStatus]         = useState<AnalyzeStatus>('idle');
  const [progress, setProgress]     = useState(0);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [duration, setDuration]     = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [liveMetrics, setLiveMetrics] = useState<TKDMetrics | null>(null);

  // Object URL for the video file
  const videoUrl = useRef('');
  useEffect(() => {
    const url = URL.createObjectURL(videoFile);
    videoUrl.current = url;
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  // Stable ref for callback
  const onMetricsUpdateRef = useRef(onMetricsUpdate);
  useEffect(() => { onMetricsUpdateRef.current = onMetricsUpdate; });

  // MediaPipe results handler
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
      const lm = results.poseLandmarks as Landmark[];
      drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: 'rgba(58,134,255,0.9)', lineWidth: 3 });
      drawLandmarks(ctx, lm, { color: 'rgba(230,57,70,0.9)', fillColor: 'rgba(230,57,70,0.3)', lineWidth: 1, radius: 5 });
      ctx.restore();
      const metrics = analyzePose(lm, prevLmsRef.current);
      prevLmsRef.current = lm;
      allMetricsRef.current.push(metrics);
      onMetricsUpdateRef.current(metrics);
      setLiveMetrics(metrics);
    } else {
      ctx.restore();
    }
  }, []);

  // Load pose model when video metadata is ready
  const initModel = useCallback(async () => {
    if (poseRef.current) return;
    setStatus('loadingModel');
    const pose = new Pose({ locateFile: (file) => `/mediapipe/pose/${file}` });
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, smoothSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    pose.onResults(onResults);
    poseRef.current = pose;
    const video = videoRef.current;
    if (video && video.readyState >= 2) await pose.send({ image: video });
    setStatus('idle');
  }, [onResults]);

  const handleMetadata = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    await initModel();
  }, [initModel]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (status !== 'analyzing') {
      setProgress(video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0);
    }
  }, [status]);

  // Frame-by-frame analysis
  const runAnalysis = useCallback(async () => {
    const video = videoRef.current;
    const pose  = poseRef.current;
    if (!video || !pose) return;

    cancelledRef.current  = false;
    allMetricsRef.current = [];
    prevLmsRef.current    = null;

    video.pause();
    video.currentTime = 0;
    setStatus('analyzing');
    setProgress(0);
    setIsPlaying(false);

    const SAMPLE_INTERVAL = 1 / 10;

    const processFrame = async (): Promise<void> => {
      if (cancelledRef.current) return;
      if (video.ended || video.currentTime >= video.duration - 0.05) {
        setStatus('done');
        setProgress(100);
        onAnalysisComplete(allMetricsRef.current);
        return;
      }
      if (video.readyState >= 2) {
        try { await pose.send({ image: video }); } catch { /* frame error */ }
      }
      setProgress((video.currentTime / video.duration) * 100);
      video.currentTime = Math.min(video.currentTime + SAMPLE_INTERVAL, video.duration);
      await new Promise<void>((resolve) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked, { once: true });
        setTimeout(resolve, 200);
      });
      if (!cancelledRef.current) rafRef.current = requestAnimationFrame(() => void processFrame());
    };

    await processFrame();
  }, [onAnalysisComplete]);

  const stopAnalysis = useCallback(() => {
    cancelledRef.current = true;
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setStatus('idle');
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      poseRef.current?.close();
      poseRef.current = null;
    };
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || status === 'analyzing') return;
    if (video.paused) { video.play(); setIsPlaying(true); }
    else              { video.pause(); setIsPlaying(false); }
  };

  const handleVideoEnded = () => setIsPlaying(false);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  const isDone      = status === 'done';
  const isAnalyzing = status === 'analyzing';
  const isLoading   = status === 'loadingModel';
  const isBusy      = isAnalyzing || isLoading;

  return (
    <div className="relative w-full h-full flex flex-col p-4 gap-4" style={{ minHeight: 340 }}>

      {/* ── Video viewport ── */}
      <div className="relative flex-1 rounded-xl overflow-hidden bg-black/60" style={{ minHeight: 240, border: '1px solid rgba(139,92,246,0.2)' }}>
        <video
          ref={videoRef}
          src={videoUrl.current}
          onLoadedMetadata={handleMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleVideoEnded}
          style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', opacity: isAnalyzing ? 0 : 1, transition: 'opacity 0.2s' }}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: (isAnalyzing || isDone) ? 'block' : 'none' }}
        />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 z-10">
            <Loader2 size={24} className="text-purple-400 animate-spin" />
            <p className="text-purple-300 text-sm font-semibold">Loading AI model…</p>
            <p className="text-gray-500 text-xs">First time only (~7 MB)</p>
          </div>
        )}

        {/* Analysis progress overlay */}
        {isAnalyzing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/40 backdrop-blur-sm z-10 pointer-events-none">
            <div className="text-center">
              <p className="text-white text-base font-bold">Analyzing your technique…</p>
              <p className="text-gray-400 text-xs mt-1">Reading every frame of the video</p>
            </div>
            <div className="flex flex-col items-center gap-2 w-56">
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%`, background: 'linear-gradient(to right, #7c3aed, #c084fc)' }}
                />
              </div>
              <span className="text-purple-300 text-xs font-mono font-semibold">{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {/* Done badge */}
        {isDone && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full z-10 pointer-events-none" style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 text-xs font-bold">Analysis complete</span>
          </div>
        )}

        {/* Corner brackets */}
        <div className="absolute inset-2 pointer-events-none">
          <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-purple-400/50 rounded-tl" />
          <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-purple-400/50 rounded-tr" />
          <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-purple-400/50 rounded-bl" />
          <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-purple-400/50 rounded-br" />
        </div>

        {/* ── Live Stats Overlay ── */}
        {liveMetrics && (isAnalyzing || isDone) && (
          <>
            {/* TOP-LEFT: Chamber Height */}
            <div
              style={{
                position: 'absolute', top: 12, left: 12, zIndex: 20,
                background: 'rgba(15,10,35,0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(139,92,246,0.35)',
                borderRadius: 12,
                padding: '8px 14px',
                minWidth: 110,
                boxShadow: '0 4px 24px rgba(124,58,237,0.18), inset 0 1px 0 rgba(255,255,255,0.07)',
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(167,139,250,0.8)', marginBottom: 3, textTransform: 'uppercase' }}>Chamber</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: liveMetrics.chamberHeight >= 1.0 ? '#34d399' : liveMetrics.chamberHeight >= 0.5 ? '#fbbf24' : '#f87171', fontFamily: 'monospace', lineHeight: 1 }}>
                  {liveMetrics.chamberHeight.toFixed(2)}
                </span>
                <span style={{ fontSize: 9, color: 'rgba(167,139,250,0.6)' }}>ratio</span>
              </div>
              <div style={{ marginTop: 5, height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(liveMetrics.chamberHeight * 100, 100)}%`, background: liveMetrics.chamberHeight >= 1.0 ? 'linear-gradient(to right,#059669,#34d399)' : liveMetrics.chamberHeight >= 0.5 ? 'linear-gradient(to right,#d97706,#fbbf24)' : 'linear-gradient(to right,#dc2626,#f87171)', transition: 'width 0.2s ease' }} />
              </div>
            </div>

            {/* TOP-RIGHT: Confidence */}
            <div
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 20,
                background: 'rgba(15,10,35,0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(56,189,248,0.35)',
                borderRadius: 12,
                padding: '8px 14px',
                minWidth: 110,
                textAlign: 'right',
                boxShadow: '0 4px 24px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.07)',
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(125,211,252,0.8)', marginBottom: 3, textTransform: 'uppercase' }}>Confidence</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: liveMetrics.confidence >= 0.75 ? '#34d399' : liveMetrics.confidence >= 0.5 ? '#fbbf24' : '#f87171', fontFamily: 'monospace', lineHeight: 1 }}>
                  {Math.round(liveMetrics.confidence * 100)}
                </span>
                <span style={{ fontSize: 9, color: 'rgba(125,211,252,0.6)' }}>%</span>
              </div>
              <div style={{ marginTop: 5, height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${liveMetrics.confidence * 100}%`, background: 'linear-gradient(to right,#0284c7,#38bdf8)', transition: 'width 0.2s ease', float: 'right' }} />
              </div>
            </div>

            {/* BOTTOM-LEFT: Pivot Angle */}
            <div
              style={{
                position: 'absolute', bottom: 12, left: 12, zIndex: 20,
                background: 'rgba(15,10,35,0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(251,191,36,0.35)',
                borderRadius: 12,
                padding: '8px 14px',
                minWidth: 110,
                boxShadow: '0 4px 24px rgba(234,179,8,0.12), inset 0 1px 0 rgba(255,255,255,0.07)',
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(252,211,77,0.8)', marginBottom: 3, textTransform: 'uppercase' }}>Pivot Angle</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: liveMetrics.pivotAngle >= 80 ? '#34d399' : liveMetrics.pivotAngle >= 45 ? '#fbbf24' : '#f87171', fontFamily: 'monospace', lineHeight: 1 }}>
                  {liveMetrics.pivotAngle.toFixed(1)}
                </span>
                <span style={{ fontSize: 9, color: 'rgba(252,211,77,0.6)' }}>°</span>
              </div>
              <div style={{ marginTop: 5, height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.min((liveMetrics.pivotAngle / 90) * 100, 100)}%`, background: 'linear-gradient(to right,#b45309,#fbbf24)', transition: 'width 0.2s ease' }} />
              </div>
            </div>

            {/* BOTTOM-RIGHT: Extension Snap */}
            <div
              style={{
                position: 'absolute', bottom: 12, right: 12, zIndex: 20,
                background: 'rgba(15,10,35,0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(248,113,113,0.35)',
                borderRadius: 12,
                padding: '8px 14px',
                minWidth: 110,
                textAlign: 'right',
                boxShadow: '0 4px 24px rgba(239,68,68,0.12), inset 0 1px 0 rgba(255,255,255,0.07)',
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(252,165,165,0.8)', marginBottom: 3, textTransform: 'uppercase' }}>Snap Speed</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#f9a8d4', fontFamily: 'monospace', lineHeight: 1 }}>
                  {(liveMetrics.extensionSnap * 1000).toFixed(1)}
                </span>
                <span style={{ fontSize: 9, color: 'rgba(252,165,165,0.6)' }}>u/f</span>
              </div>
              {/* pulse dot when kick detected */}
              <div style={{ marginTop: 5, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 8, color: liveMetrics.kickDetected ? '#34d399' : 'rgba(255,255,255,0.3)' }}>{liveMetrics.kickDetected ? 'KICK ✓' : 'standby'}</span>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: liveMetrics.kickDetected ? '#34d399' : 'rgba(255,255,255,0.15)', boxShadow: liveMetrics.kickDetected ? '0 0 8px #34d399' : 'none', transition: 'all 0.15s ease' }} />
              </div>
            </div>

            {/* KICK LEG badge - centre top */}
            <div
              style={{
                position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
                background: 'rgba(15,10,35,0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(139,92,246,0.25)',
                borderRadius: 20,
                padding: '4px 14px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 12px rgba(124,58,237,0.15)',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: liveMetrics.kickLeg === 'left' ? '#818cf8' : '#f472b6', boxShadow: `0 0 6px ${liveMetrics.kickLeg === 'left' ? '#818cf8' : '#f472b6'}` }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(220,220,255,0.85)', letterSpacing: '0.06em' }}>
                {liveMetrics.kickLeg.toUpperCase()} LEG
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Controls row ── */}
      <div className="flex flex-col gap-2">

        {/* Seek bar */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 font-mono w-7 flex-shrink-0">{formatTime(currentTime)}</span>
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.07)' }}
            onClick={(e) => {
              const video = videoRef.current;
              if (!video || isBusy) return;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              video.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
            }}
          >
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{ width: `${progress}%`, background: isAnalyzing ? 'linear-gradient(to right, #7c3aed, #c084fc)' : 'rgba(139,92,246,0.7)' }}
            />
          </div>
          <span className="text-[10px] text-gray-500 font-mono w-7 flex-shrink-0 text-right">{formatTime(duration)}</span>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {/* Play / Pause */}
          <button
            onClick={togglePlayback}
            disabled={isBusy}
            title={isPlaying ? 'Pause' : 'Play'}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>

          <div className="flex-1" />

          {/* Main CTA: Analyze / Cancel / Re-analyze */}
          {isAnalyzing ? (
            <button
              onClick={stopAnalysis}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-red-300 border border-red-500/30 hover:bg-red-500/10 transition-colors"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => void runAnalysis()}
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
              style={{
                background: isDone
                  ? 'rgba(139,92,246,0.2)'
                  : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                border: isDone ? '1px solid rgba(139,92,246,0.4)' : 'none',
                boxShadow: isDone ? 'none' : '0 0 20px rgba(124,58,237,0.4)',
              }}
            >
              {isLoading ? (
                <><Loader2 size={14} className="animate-spin" /> Loading…</>
              ) : isDone ? (
                <><Zap size={14} /> Re-analyze</>
              ) : (
                <><Zap size={14} /> Analyze Video</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoAnalyzer;
