/**
 * App.tsx
 * TKD AI Coach Dashboard
 * 3-Tab interface: Live Coach, Player Analytics, Fight Analyzer
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Brain, Camera, CameraOff,
  Loader2, AlertCircle, ShieldCheck, Mic, MicOff, UserPlus, Users,
  BarChart2, Swords, AlertOctagon, Timer, MessageSquare, Flame,
  Upload, Film, Trash2, X
} from 'lucide-react';

import { PoseTracker } from './components/PoseTracker';
import { PlayerProfileCard } from './components/PlayerProfileCard';
import { ComparisonDashboard } from './components/ComparisonDashboard';
import { FightTracker } from './components/FightTracker';
import type { FighterSnapshot } from './components/FightTracker';
import { CoachOverlay } from './components/CoachOverlay';
import { VideoAnalyzer } from './components/VideoAnalyzer';
import { KickCounter } from './components/KickCounter';

import type { TKDMetrics } from './utils/tkd-math';
import { getGrandmastersVerdict, getComparativeAnalysis, getCornerAdvice } from './utils/CoachBrain';
import { createVoiceController } from './utils/voice';
import type { VoiceController } from './utils/voice';
import type { PlayerStats } from './types';
import { loadPlayers, savePlayers, createEmptyPlayer, deletePlayer } from './utils/storage';
import type { FightState, FightMetrics } from './utils/FightEngine';
import { useCoachStateMachine } from './hooks/useCoachStateMachine';
import { useKickCounter } from './hooks/useKickCounter';

type AIStatus = 'idle' | 'thinking' | 'ready' | 'error';
type Tab = 'live' | 'analytics' | 'fight';
type LiveMode = 'camera' | 'video';



// ─── Main App ─────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('live');

  // 1. Live State
  const [isTracking, setIsTracking]   = useState(false);
  const [metrics, setMetrics]         = useState<TKDMetrics | null>(null);
  const [verdict, setVerdict]         = useState<string>('');
  const [aiStatus, setAiStatus]       = useState<AIStatus>('idle');
  const [, setAnalysis]               = useState(0);

  // Video upload mode
  const [liveMode, setLiveMode]               = useState<LiveMode>('camera');
  const [uploadedVideo, setUploadedVideo]     = useState<File | null>(null);
  const [videoMetrics, setVideoMetrics]       = useState<TKDMetrics | null>(null);
  const [videoAllMetrics, setVideoAllMetrics] = useState<TKDMetrics[]>([]);
  const [videoVerdict, setVideoVerdict]       = useState<string>('');
  const [videoAiStatus, setVideoAiStatus]     = useState<AIStatus>('idle');
  const fileInputRef                          = useRef<HTMLInputElement>(null);

  // Delete confirmation dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    reason: 'exit' | 'replace';
    pendingFile?: File;
  }>({ open: false, reason: 'exit' });

  // Voice
  const [isMicOn, setIsMicOn]         = useState(false);
  const [transcript, setTranscript]   = useState('');
  const voiceRef                      = useRef<VoiceController | null>(null);
  const verdictTimerRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptTimerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestVerdictRef              = useRef<string>('');
  const metricsRef                    = useRef<TKDMetrics | null>(null);

  // 2. Analytics State
  const [players, setPlayers]         = useState<PlayerStats[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [compareP1Id, setCompareP1Id] = useState<string | null>(null);
  const [compareP2Id, setCompareP2Id] = useState<string | null>(null);

  // 3. Fight Analyzer State
  const [isFighting, setIsFighting]     = useState(false);
  const [fightState, setFightState]     = useState<FightState | null>(null);
  const [fightMetrics, setFightMetrics] = useState<FightMetrics | null>(null);
  const [cornerAdvice, setCornerAdvice] = useState<string>('');
  const [cornerStatus, setCornerStatus] = useState<AIStatus>('idle');
  const [impactFlash, setImpactFlash]   = useState(false);
  const [myCorner, setMyCorner]         = useState<'red' | 'blue'>('blue');
  const [fighterSnapshot, setFighterSnapshot] = useState<FighterSnapshot>({ red: null, blue: null });
  // Accumulated averages per fighter (for post-match compare)
  type FighterAcc = { chamberHeight: number; pivotAngle: number; extensionSnap: number; confidence: number; n: number };
  const redAccRef  = useRef<FighterAcc | null>(null);
  const blueAccRef = useRef<FighterAcc | null>(null);

  useEffect(() => {
    const loaded = loadPlayers();
    setPlayers(loaded);
    if (loaded.length > 0) setActivePlayerId(loaded[0].id);
  }, []);
  const activePlayer = useMemo(() => players.find(p => p.id === activePlayerId), [players, activePlayerId]);

  // ── Kick Counter ───────────────────────────────────────────────────────
  const { session: kickSession, recordKick, resetSession: resetKickSession } = useKickCounter();

  // ── Coach State Machine ────────────────────────────────────────────────────
  const { coachState, guessText, feedback, idleLevel, onMetrics: onCoachMetrics } = useCoachStateMachine(
    isTracking,
    (text, interrupt) => voiceRef.current?.speak(text, interrupt),
    recordKick,
  );

  // Stable ref for onCoachMetrics — prevents handleMetricsUpdate from getting a new
  // identity on every coach-state-machine update (which would otherwise cause the
  // PoseTracker effect to restart on every metrics event).
  const onCoachMetricsRef = useRef(onCoachMetrics);
  useEffect(() => { onCoachMetricsRef.current = onCoachMetrics; });

  // Derived metric scores (live) — still used for the compact metric strip
  const chamberScore    = metrics ? Math.min(Math.round(metrics.chamberHeight * 100), 100) : 0;
  const pivotScore      = metrics ? Math.min(Math.round((metrics.pivotAngle / 90) * 100), 100) : 0;
  const snapScore       = metrics ? Math.min(Math.round(metrics.extensionSnap * 8000), 100) : 0;
  const confidenceScore = metrics ? Math.round(metrics.confidence * 100) : 0;

  // Voice Controller
  useEffect(() => {
    const vc = createVoiceController(
      (cmd) => {
        if (cmd === 'start') {
          setActiveTab('live'); setIsTracking(true); setIsFighting(false);
        } else if (cmd === 'stop') {
          setIsTracking(false); setIsFighting(false);
        } else if (cmd === 'analyze' && metricsRef.current) {
          setAiStatus('thinking');
          getGrandmastersVerdict(metricsRef.current).then(r => { setVerdict(r); latestVerdictRef.current = r; setAiStatus('ready'); vc.speak(r); }).catch(() => setAiStatus('error'));
        } else if (cmd === 'repeat' && latestVerdictRef.current) vc.speak(latestVerdictRef.current);
      },
      (raw) => {
        setTranscript(raw);
        if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
        transcriptTimerRef.current = setTimeout(() => setTranscript(''), 3000);
      },
    );
    voiceRef.current = vc;
    return () => { vc.stopListening(); };
  }, []);

  const toggleMic = () => {
    if (!voiceRef.current) return;
    if (isMicOn) { voiceRef.current.stopListening(); setIsMicOn(false); }
    else         { voiceRef.current.startListening(); setIsMicOn(true); }
  };

  // ── Metrics Update (Live Coach) — feeds BOTH old analytics AND new state machine ──
  const handleMetricsUpdate = useCallback((m: TKDMetrics) => {
    setMetrics(m);
    metricsRef.current = m;

    // Feed the new coach state machine via stable ref (no re-render cascade)
    onCoachMetricsRef.current(m);

    // Still update player analytics in background (unchanged)
    if (verdictTimerRef.current) return;
    verdictTimerRef.current = setTimeout(async () => {
      verdictTimerRef.current = null;
      if (m.confidence < 0.25) { setVerdict('Position yourself so your full body is visible to the camera...'); return; }
      if (activePlayerId && isTracking) {
        setPlayers(prev => {
          const updated = [...prev];
          const i = updated.findIndex(p => p.id === activePlayerId);
          if (i >= 0) {
            const p = updated[i];
            updated[i] = {
              ...p,
              chamber: Math.round(p.chamber * 0.9 + Math.min(Math.round(m.chamberHeight * 100), 100) * 0.1),
              pivot:   Math.round(p.pivot * 0.9 + Math.min(Math.round((m.pivotAngle / 90) * 100), 100) * 0.1),
              snap:    Math.round(p.snap * 0.9 + Math.min(Math.round(m.extensionSnap * 8000), 100) * 0.1),
              accuracy:Math.round(p.accuracy * 0.9 + Math.round(m.confidence * 100) * 0.1),
              updatedAt: Date.now(),
            };
            savePlayers(updated);
          }
          return updated;
        });
      }
      setAiStatus('thinking');
      try {
        const result = await getGrandmastersVerdict(m);
        setVerdict(result);
        latestVerdictRef.current = result;
        setAiStatus('ready');
        setAnalysis(prev => prev + 1);
      } catch { setAiStatus('error'); }
    }, 4000);
  }, [activePlayerId, isTracking]); // onCoachMetricsRef is stable — not needed in deps


  const toggleTracking = () => {
    setIsTracking(prev => {
      if (!prev && activePlayerId) {
        setPlayers(current => {
          const arr = [...current]; const i = arr.findIndex(p => p.id === activePlayerId);
          if (i >= 0) { arr[i] = { ...arr[i], sessions: arr[i].sessions + 1 }; savePlayers(arr); }
          return arr;
        });
      }
      if (prev) {
        setMetrics(null);
        setVerdict('');
        setAiStatus('idle');
        if (verdictTimerRef.current) clearTimeout(verdictTimerRef.current);
        resetKickSession();
      }
      return !prev;
    });
  };

  // ── Fight Analyzer Handlers ──
  const handleFightMetrics = useCallback((state: FightState, metrics: FightMetrics) => {
    setFightState(state);
    setFightMetrics(metrics);
    if (state.impact) {
      setImpactFlash(true);
      setTimeout(() => setImpactFlash(false), 500);
    }
  }, []);

  const handleFightFrames = useCallback(async (frames: string[]) => {
    setCornerStatus('thinking');
    try {
      const advice = await getCornerAdvice(frames, myCorner);
      setCornerAdvice(advice);
      setCornerStatus('ready');
      voiceRef.current?.speak(advice);
    } catch {
      setCornerStatus('error');
    }
  }, [myCorner]);

  const handleFighterMetrics = useCallback((snap: FighterSnapshot) => {
    setFighterSnapshot(snap);
    if (snap.red) {
      const r = redAccRef.current;
      if (!r) {
        redAccRef.current = { chamberHeight: snap.red.chamberHeight, pivotAngle: snap.red.pivotAngle, extensionSnap: snap.red.extensionSnap, confidence: snap.red.confidence, n: 1 };
      } else {
        r.chamberHeight  += snap.red.chamberHeight;
        r.pivotAngle     += snap.red.pivotAngle;
        r.extensionSnap  += snap.red.extensionSnap;
        r.confidence     += snap.red.confidence;
        r.n++;
      }
    }
    if (snap.blue) {
      const b = blueAccRef.current;
      if (!b) {
        blueAccRef.current = { chamberHeight: snap.blue.chamberHeight, pivotAngle: snap.blue.pivotAngle, extensionSnap: snap.blue.extensionSnap, confidence: snap.blue.confidence, n: 1 };
      } else {
        b.chamberHeight  += snap.blue.chamberHeight;
        b.pivotAngle     += snap.blue.pivotAngle;
        b.extensionSnap  += snap.blue.extensionSnap;
        b.confidence     += snap.blue.confidence;
        b.n++;
      }
    }
  }, []);

  // Reset accumulators when a new match starts
  const startFight = useCallback(() => {
    redAccRef.current  = null;
    blueAccRef.current = null;
    setFighterSnapshot({ red: null, blue: null });
    setCornerAdvice('');
    setCornerStatus('idle');
    setFightState(null);
    setFightMetrics(null);
    setIsFighting(true);
  }, []);

  const stopFight = useCallback(() => {
    setIsFighting(false);
  }, []);

  // ── Video Upload Handlers ────────────────────────────────────────────────
  const handleVideoFileChosen = useCallback((file: File) => {
    if (uploadedVideo) {
      setDeleteDialog({ open: true, reason: 'replace', pendingFile: file });
    } else {
      setUploadedVideo(file);
      setVideoMetrics(null);
      setVideoAllMetrics([]);
      setVideoVerdict('');
      setVideoAiStatus('idle');
    }
  }, [uploadedVideo]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleVideoFileChosen(file);
    e.target.value = '';
  }, [handleVideoFileChosen]);

  const handleVideoDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) handleVideoFileChosen(file);
  }, [handleVideoFileChosen]);

  const requestDeleteVideo = useCallback((reason: 'exit' | 'replace', pendingFile?: File) => {
    setDeleteDialog({ open: true, reason, pendingFile });
  }, []);

  const confirmDeleteVideo = useCallback(() => {
    const pending = deleteDialog.pendingFile;
    setUploadedVideo(null);
    setVideoMetrics(null);
    setVideoAllMetrics([]);
    setVideoVerdict('');
    setVideoAiStatus('idle');
    setDeleteDialog({ open: false, reason: 'exit' });
    if (pending) {
      setTimeout(() => { setUploadedVideo(pending); }, 50);
    }
  }, [deleteDialog.pendingFile]);

  const cancelDeleteVideo = useCallback(() => {
    setDeleteDialog({ open: false, reason: 'exit' });
  }, []);

  const switchLiveMode = useCallback((mode: LiveMode) => {
    if (mode === 'camera' && uploadedVideo) {
      setDeleteDialog({ open: true, reason: 'exit' });
    }
    setLiveMode(mode);
    if (mode === 'camera') setIsTracking(false);
  }, [uploadedVideo]);

  const handleVideoAnalysisComplete = useCallback(async (allMetrics: TKDMetrics[]) => {
    setVideoAllMetrics(allMetrics);
    if (allMetrics.length === 0) return;
    const avg = allMetrics.reduce<TKDMetrics>((acc, m) => ({
      chamberHeight:  acc.chamberHeight  + m.chamberHeight  / allMetrics.length,
      pivotAngle:     acc.pivotAngle     + m.pivotAngle     / allMetrics.length,
      extensionSnap:  acc.extensionSnap  + m.extensionSnap  / allMetrics.length,
      confidence:     acc.confidence     + m.confidence     / allMetrics.length,
      kickLeg:        m.kickLeg,
      kickDetected:   m.kickDetected,
    }), { chamberHeight: 0, pivotAngle: 0, extensionSnap: 0, confidence: 0, kickLeg: 'right', kickDetected: false });
    setVideoMetrics(avg);
    setVideoAiStatus('thinking');
    try {
      const result = await getGrandmastersVerdict(avg);
      setVideoVerdict(result);
      setVideoAiStatus('ready');
      voiceRef.current?.speak(result);
    } catch {
      setVideoAiStatus('error');
    }
  }, []);

  // ── Player Management ──
  const handleAddPlayer = () => {
    const newPlayer = createEmptyPlayer(`Athlete ${players.length + 1}`);
    const updated = [...players, newPlayer]; setPlayers(updated); savePlayers(updated); setActivePlayerId(newPlayer.id);
  };
  const handleUpdatePlayer = (updated: PlayerStats) => {
    const arr = [...players]; const i = arr.findIndex(p => p.id === updated.id);
    if (i >= 0) arr[i] = updated; setPlayers(arr); savePlayers(arr);
  };
  const handleDeletePlayer = (id: string) => {
    const arr = deletePlayer(id); setPlayers(arr);
    if (activePlayerId === id) setActivePlayerId(arr[0]?.id || null);
    if (compareP1Id === id) setCompareP1Id(null);
    if (compareP2Id === id) setCompareP2Id(null);
  };

  return (
    <div className="min-h-screen flex flex-col relative text-white overflow-x-hidden antialiased">
      {/* Dynamic Animated Background */}
      <div className="fixed inset-0 bg-slate-950 -z-20" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 -z-10 animate-pulse-slow" />

      {/* ── DELETE CONFIRMATION DIALOG ── */}
      {deleteDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4" style={{ background: 'linear-gradient(135deg, rgba(30,27,50,0.98), rgba(15,18,35,0.98))', border: '1px solid rgba(239,68,68,0.25)', boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 40px rgba(239,68,68,0.08)' }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <Trash2 size={16} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-display font-bold text-white text-base">
                  {deleteDialog.reason === 'replace' ? 'Replace Video?' : 'Delete Video?'}
                </h3>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                  {deleteDialog.reason === 'replace'
                    ? `"${uploadedVideo?.name}" will be removed and replaced with the new file.`
                    : `"${uploadedVideo?.name}" will be removed from the session.`}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={cancelDeleteVideo} className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-300 border border-white/10 hover:border-white/20 hover:text-white transition-colors" style={{ background: 'rgba(255,255,255,0.04)' }}>
                Cancel
              </button>
              <button onClick={confirmDeleteVideo} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all" style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', boxShadow: '0 0 16px rgba(239,68,68,0.3)' }}>
                {deleteDialog.reason === 'replace' ? 'Replace' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}


      <header className="px-8 py-4 flex items-center justify-between border-b border-white/10 bg-slate-900/50 backdrop-blur-2xl relative z-20 shadow-lg">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-base font-display shadow-lg border border-white/20" style={{ background: 'linear-gradient(135deg, #e63946, #3a86ff)', boxShadow: '0 0 30px rgba(58, 134, 255, 0.4)' }}>TKD</div>
            <div>
              <h1 className="font-display font-extrabold text-2xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 drop-shadow-sm">TKD AI Coach</h1>
              <p className="text-[10px] text-blue-400 uppercase tracking-[0.2em] font-bold mt-0.5">Biomechanical Analyzer</p>
            </div>
          </div>

          <div className="h-8 w-px bg-white/10 hidden lg:block" />

          {/* Tabs */}
          <div className="hidden lg:flex p-1.5 rounded-2xl bg-slate-800/50 backdrop-blur-md border border-white/10 shadow-inner">
            <button onClick={() => {setActiveTab('live'); setIsFighting(false);}} className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${activeTab === 'live' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)] border border-blue-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'}`}>
              <Camera size={16} /> Live Coach
            </button>
            <button onClick={() => {setActiveTab('analytics'); setIsTracking(false); setIsFighting(false);}} className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${activeTab === 'analytics' ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)] border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'}`}>
              <BarChart2 size={16} /> Player Analytics
            </button>
            <button onClick={() => {setActiveTab('fight'); setIsTracking(false);}} className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${activeTab === 'fight' ? 'bg-red-500/20 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)] border border-red-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'}`}>
              <Swords size={16} /> Fight Analyzer
            </button>
          </div>

          {/* Camera / Video sub-mode toggle — only visible on Live tab */}
          {activeTab === 'live' && (
            <div className="hidden lg:flex p-1 rounded-xl bg-slate-800/40 backdrop-blur-md border border-white/10">
              <button
                onClick={() => switchLiveMode('camera')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                  liveMode === 'camera'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                <Camera size={13} /> Camera
              </button>
              <button
                onClick={() => switchLiveMode('video')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                  liveMode === 'video'
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                <Film size={13} /> Video
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'live' && isTracking && <span className="badge-live">LIVE</span>}
          {activeTab === 'fight' && isFighting && <span className="badge-live" style={{ background: 'rgba(230, 57, 70, 0.2)', color: '#e63946', borderColor: 'rgba(230, 57, 70, 0.3)' }}>SPARRING</span>}
          {transcript && <span className="text-xs text-blue-300 italic max-w-[120px] truncate">"{transcript}"</span>}

          <button onClick={toggleMic} className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200 ${isMicOn ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'}`}>
            {isMicOn ? <Mic size={15} /> : <MicOff size={15} />}
          </button>

          {activeTab === 'live' && (
            <button
              onClick={toggleTracking}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${isTracking ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-white border border-blue-500/40'}`}
              style={isTracking ? {} : { background: 'linear-gradient(135deg, #3a86ff, #e63946)', boxShadow: '0 0 18px rgba(58, 134, 255, 0.35)' }}
            >
              {isTracking ? <><CameraOff size={15} /> Stop Session</> : <><Camera size={15} /> Start Training</>}
            </button>
          )}

          {activeTab === 'fight' && (
            <button
              onClick={() => isFighting ? stopFight() : startFight()}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${isFighting ? 'bg-gray-800 text-gray-400 border border-gray-700' : 'text-white border border-red-500/40'}`}
              style={isFighting ? {} : { background: 'linear-gradient(135deg, #e63946, #f97316)', boxShadow: '0 0 18px rgba(230, 57, 70, 0.35)' }}
            >
              {isFighting ? <><CameraOff size={15} /> Stop Match</> : <><Swords size={15} /> Start Match</>}
            </button>
          )}
        </div>
      </header>

      {/* ── MAIN LAYOUT ── */}
      {activeTab === 'live' && liveMode === 'camera' && (
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* ── Full-Screen Training Zone ── */}
          <div className="flex-1 flex flex-col lg:flex-row gap-0">

            {/* Camera + Coach Overlay — takes up majority of the screen */}
            <div className="flex-1 p-4 flex flex-col gap-3 relative" style={{ borderRight: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-display text-xs uppercase tracking-widest text-gray-400">Training Zone</h2>
                <div className="flex items-center gap-3">
                  {activePlayer && (
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-300">
                      <UserPlus size={12} className="inline mr-1 text-blue-400" /> {activePlayer.name}
                    </span>
                  )}
                  {metrics && (
                    <span className="text-xs px-2 py-1 rounded-full font-mono" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                      {metrics.kickLeg.toUpperCase()} · {confidenceScore}%
                    </span>
                  )}
                </div>
              </div>

              {/* Camera feed container — fills available space */}
              <div className="flex-1 rounded-2xl overflow-hidden relative" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', minHeight: 400 }}>
                {isTracking ? (
                  <>
                    <PoseTracker onMetricsUpdate={handleMetricsUpdate} isActive={isTracking} />
                    {/* Coach Overlay sits on top of camera canvas */}
                    <CoachOverlay
                      coachState={coachState}
                      guessText={guessText}
                      feedback={feedback}
                      idleLevel={idleLevel}
                      isActive={isTracking}
                      athleteName={activePlayer?.name}
                    />
                    {/* Kick Counter Overlay — top right corner */}
                    <KickCounter session={kickSession} isActive={isTracking} />
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-gray-600 min-h-[400px]">
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(58,134,255,0.07)', border: '1px dashed rgba(58,134,255,0.2)' }}><Camera size={32} className="text-blue-500/40" /></div>
                    <div className="text-center"><p className="text-sm font-medium text-gray-500">Camera feed inactive</p><p className="text-xs text-gray-600 mt-1">Press "Start Training" to enter immersive coaching mode</p></div>
                  </div>
                )}
              </div>

              {/* Compact metric strip — only shows when tracking */}
              {isTracking && (
                <div className="flex items-center gap-3 flex-wrap">
                  {[
                    { label: 'Chamber', score: chamberScore, color: '#e63946' },
                    { label: 'Pivot',   score: pivotScore,   color: '#3a86ff' },
                    { label: 'Snap',    score: snapScore,    color: '#ffd700' },
                  ].map(({ label, score, color }) => (
                    <div key={label} className="flex-1 min-w-[80px] rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                        <span className="text-xs font-bold font-display" style={{ color }}>{score}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(score, 100)}%`, background: color }} />
                      </div>
                    </div>
                  ))}
                  {/* Confidence chip */}
                  <div className="rounded-xl px-3 py-2 text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: confidenceScore > 50 ? '#10b981' : '#f97316' }}>
                    CONF<br /><span className="text-lg font-display">{confidenceScore}%</span>
                  </div>
                </div>
              )}

              <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(58,134,255,0.05)', border: '1px solid rgba(58,134,255,0.1)' }}>
                <ShieldCheck size={16} className="text-blue-400 flex-shrink-0" />
                <p className="text-xs text-gray-400">Stand 2–3 metres from camera · Full body must be visible · Perform your kick slowly first</p>
              </div>
            </div>

            {/* Side panel: AI Grandmaster verdict (kept for backward compat / text output) */}
            <div className="lg:w-72 xl:w-80 flex flex-col">
              <div className="flex-1 p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2"><Brain size={14} className="text-yellow-400" /><h2 className="font-display text-xs uppercase tracking-widest text-gray-400">Grandmaster's Verdict</h2></div>
                <div className="flex-1 rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.04) 0%, rgba(20,23,42,0.8) 100%)', border: '1px solid rgba(255,215,0,0.12)', minHeight: 180 }}>
                  <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10 blur-2xl pointer-events-none" style={{ background: 'radial-gradient(circle, #ffd700, transparent)' }} />
                  {aiStatus === 'thinking' ? <div className="flex items-center gap-3 text-yellow-400/70"><Loader2 size={16} className="animate-spin" /><span className="text-xs font-medium">Analyzing form...</span></div> :
                   aiStatus === 'error' ? <div className="flex items-start gap-3 text-red-400/80"><AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-xs">Coach temporarily unavailable.</span></div> :
                   verdict ? <p className="text-sm leading-relaxed slide-in" style={{ color: 'rgba(240,244,255,0.88)', fontStyle: 'italic' }}>"{verdict}"</p> :
                   <div className="flex flex-col items-center justify-center flex-1 text-center gap-2"><Brain size={28} className="text-yellow-400/20" /><p className="text-xs text-gray-600">{isTracking ? 'Coach overlay active — watch the camera feed' : 'Start the session to receive AI coaching'}</p></div>}
                  {verdict && aiStatus === 'ready' && <div className="flex items-center gap-2 mt-auto"><div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /><span className="text-xs text-gray-600 font-mono">Gemini · On-device</span></div>}
                </div>
              </div>
            </div>

          </div>
        </main>
      )}

      {/* ── VIDEO UPLOAD MODE ── */}
      {activeTab === 'live' && liveMode === 'video' && (
        <main className="flex-1 flex flex-col overflow-hidden">
          <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleFileInputChange} />

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

            {/* ── Left: Video area ── */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--color-border)' }}>

              {/* Step header bar */}
              <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-4">
                  {[
                    { n: '1', label: 'Upload', active: !uploadedVideo, done: !!uploadedVideo },
                    { n: '2', label: 'Analyze', active: !!uploadedVideo && videoAllMetrics.length === 0, done: videoAllMetrics.length > 0 },
                    { n: '3', label: 'Results', active: videoAllMetrics.length > 0, done: false },
                  ].map((step, i, arr) => (
                    <React.Fragment key={step.n}>
                      <div className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${step.done ? 'text-emerald-400' : step.active ? 'text-purple-300' : 'text-gray-600'}`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-colors ${step.done ? 'bg-emerald-500/20 text-emerald-400' : step.active ? 'bg-purple-500/25 text-purple-300' : 'bg-white/5 text-gray-600'}`}>
                          {step.done ? '✓' : step.n}
                        </span>
                        {step.label}
                      </div>
                      {i < arr.length - 1 && <span className="text-gray-700 text-xs">›</span>}
                    </React.Fragment>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {uploadedVideo && (
                    <span className="text-xs text-gray-600 hidden sm:block truncate max-w-[130px]">
                      {uploadedVideo.name.length > 18 ? uploadedVideo.name.slice(0, 15) + '…' : uploadedVideo.name}
                    </span>
                  )}
                  {uploadedVideo ? (
                    <>
                      <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-300 border border-purple-500/25 hover:bg-purple-500/10 transition-colors">
                        <Upload size={11} /> Replace
                      </button>
                      <button onClick={() => requestDeleteVideo('exit')} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 transition-colors" title="Remove video">
                        <Trash2 size={13} />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', boxShadow: '0 0 14px rgba(124,58,237,0.3)' }}>
                      <Upload size={12} /> Upload Video
                    </button>
                  )}
                </div>
              </div>

              {/* Video / Drop zone */}
              <div className="flex-1 relative overflow-hidden" style={{ minHeight: 280 }} onDragOver={(e) => e.preventDefault()} onDrop={handleVideoDrop}>
                {uploadedVideo ? (
                  <VideoAnalyzer
                    key={uploadedVideo.name + uploadedVideo.size}
                    videoFile={uploadedVideo}
                    onMetricsUpdate={(m) => setVideoMetrics(m)}
                    onAnalysisComplete={handleVideoAnalysisComplete}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-5 cursor-pointer group" style={{ minHeight: 280 }} onClick={() => fileInputRef.current?.click()}>
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-300 group-hover:scale-105" style={{ background: 'rgba(139,92,246,0.07)', border: '2px dashed rgba(139,92,246,0.22)' }}>
                      <Upload size={30} className="text-purple-500/40 group-hover:text-purple-400 transition-colors" />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-semibold text-gray-300 group-hover:text-white transition-colors">Drop your training video here</p>
                      <p className="text-xs text-gray-600 mt-1">or click to choose · MP4, MOV, WebM</p>
                    </div>
                    <div className="px-5 py-2 rounded-xl text-sm font-bold text-white pointer-events-none" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', boxShadow: '0 0 18px rgba(124,58,237,0.35)' }}>
                      Choose File
                    </div>
                  </div>
                )}
              </div>

              {/* Metric bar — only after analysis */}
              {videoMetrics && videoAllMetrics.length > 0 && (() => {
                const scores = [
                  { label: 'Chamber',    value: Math.min(Math.round(videoMetrics.chamberHeight * 100), 100),              color: '#e63946', tip: 'How high the knee is raised' },
                  { label: 'Pivot',      value: Math.min(Math.round((videoMetrics.pivotAngle / 90) * 100), 100),           color: '#3a86ff', tip: 'Standing foot rotation' },
                  { label: 'Snap',       value: Math.min(Math.round(videoMetrics.extensionSnap * 8000), 100),              color: '#ffd700', tip: 'Kick extension speed' },
                  { label: 'Clarity',    value: Math.round(videoMetrics.confidence * 100),                                  color: videoMetrics.confidence > 0.5 ? '#10b981' : '#f97316', tip: 'How clearly the AI saw your pose' },
                ];
                return (
                  <div className="flex items-center gap-3 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {scores.map(({ label, value, color, tip }) => (
                      <div key={label} className="flex-1 flex flex-col gap-1.5" title={tip}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
                          <span className="text-xs font-bold" style={{ color }}>{value}%</span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
                        </div>
                      </div>
                    ))}
                    <div className="flex-shrink-0 text-right pl-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Frames</p>
                      <p className="text-sm font-bold" style={{ color: '#a78bfa' }}>{videoAllMetrics.length}</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── Right: AI Verdict panel ── */}
            <div className="lg:w-72 xl:w-80 flex flex-col">
              <div className="px-5 pt-4 pb-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Brain size={14} className="text-yellow-400" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">AI Verdict</h2>
              </div>

              <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
                {/* Verdict card */}
                <div className="flex-1 rounded-2xl p-4 flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(15,18,35,0.8))', border: '1px solid rgba(139,92,246,0.12)', minHeight: 160 }}>
                  <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl pointer-events-none opacity-15" style={{ background: '#a78bfa' }} />
                  {videoAiStatus === 'thinking' && (
                    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
                      <Loader2 size={20} className="text-purple-400 animate-spin" />
                      <p className="text-purple-300 text-sm font-medium">Reading your form…</p>
                    </div>
                  )}
                  {videoAiStatus === 'error' && (
                    <div className="flex items-start gap-3 text-red-400">
                      <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                      <p className="text-xs">Coach is unavailable right now. Try again.</p>
                    </div>
                  )}
                  {videoVerdict && videoAiStatus === 'ready' && (
                    <>
                      <p className="text-sm leading-relaxed" style={{ color: 'rgba(240,244,255,0.9)', fontStyle: 'italic' }}>"{videoVerdict}"</p>
                      <div className="flex items-center gap-2 mt-auto pt-3 border-t border-white/5">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                        <span className="text-[10px] text-gray-600 font-mono">Gemini · Video analysis</span>
                      </div>
                    </>
                  )}
                  {videoAiStatus === 'idle' && (
                    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
                      <Brain size={24} className="text-purple-400/20" />
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {uploadedVideo ? 'Hit "Analyze Video" to get AI coaching on your technique' : 'Upload a video to get started'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Kick leg chip */}
                {videoMetrics && (
                  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Kicking Leg</p>
                      <p className="text-xs font-semibold text-white capitalize mt-0.5">{videoMetrics.kickLeg} leg detected</p>
                    </div>
                  </div>
                )}

                {/* How it works — only when no video loaded */}
                {!uploadedVideo && (
                  <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1">How it works</p>
                    {[
                      { n: '①', text: 'Upload a kick or technique video' },
                      { n: '②', text: 'AI scans every frame with pose detection' },
                      { n: '③', text: 'Get scored on Chamber, Pivot & Snap' },
                      { n: '④', text: 'Read your AI Grandmaster feedback' },
                    ].map(({ n, text }) => (
                      <div key={n} className="flex items-start gap-2">
                        <span className="text-purple-500/60 text-xs flex-shrink-0">{n}</span>
                        <p className="text-xs text-gray-600 leading-relaxed">{text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </main>
      )}




      {activeTab === 'analytics' && (
        <main className="flex-1 overflow-y-auto p-6 flex flex-col xl:flex-row gap-6">
          <div className="xl:w-1/3 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Users size={16} className="text-emerald-400" /><h2 className="font-display font-bold text-lg text-white">Roster</h2></div>
              <button onClick={handleAddPlayer} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-semibold transition-colors"><UserPlus size={14} /> Add Athlete</button>
            </div>
            {players.length === 0 ? (
              <div className="card-glow rounded-xl p-8 text-center flex flex-col items-center gap-3"><div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center"><Users size={20} className="text-gray-500" /></div><p className="text-gray-400 text-sm">No athletes added yet.</p><button onClick={handleAddPlayer} className="text-blue-400 text-sm font-semibold hover:underline">Create first profile</button></div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4 max-h-[calc(100vh-160px)] overflow-y-auto pr-2 custom-scrollbar">
                {players.map(p => (
                  <PlayerProfileCard key={p.id} player={p} onUpdate={handleUpdatePlayer} onDelete={handleDeletePlayer} onSelect={(player) => { setActivePlayerId(player.id); if (compareP1Id === player.id) setCompareP1Id(null); else if (compareP2Id === player.id) setCompareP2Id(null); else if (!compareP1Id) setCompareP1Id(player.id); else if (!compareP2Id) setCompareP2Id(player.id); }} isSelected={compareP1Id === p.id || compareP2Id === p.id} selectionLabel={compareP1Id === p.id ? 'P1' : compareP2Id === p.id ? 'P2' : undefined} />
                ))}
              </div>
            )}
          </div>
          <div className="xl:w-2/3 flex flex-col">
            {compareP1Id && compareP2Id ? (
              <ComparisonDashboard player1={players.find(p => p.id === compareP1Id)!} player2={players.find(p => p.id === compareP2Id)!} onRequestAnalysis={getComparativeAnalysis} />
            ) : (
              <div className="flex-1 rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center min-h-[400px] text-center p-8 gap-4" style={{ background: 'rgba(255,255,255,0.01)' }}><div className="flex items-center justify-center gap-4 text-gray-600 mb-2"><div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center"><UserPlus size={24} /></div><span className="font-display italic text-lg opacity-50">vs</span><div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center"><UserPlus size={24} /></div></div><h3 className="text-xl font-display font-bold text-gray-400">Head-to-Head Comparison</h3><p className="text-gray-500 text-sm max-w-sm">Select <strong className="text-blue-400">two athletes</strong> from the roster to generate a biomechanical scout report and side-by-side radar analysis.</p></div>
            )}
          </div>
        </main>
      )}

      {activeTab === 'fight' && (
        <main className="flex-1 flex flex-col">
          {/* Disclaimer */}
          <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2 flex items-center justify-center gap-3">
            <AlertOctagon size={14} className="text-yellow-500" />
            <span className="text-xs font-semibold text-yellow-500 tracking-wide">EXPERIMENTAL: Vision-Based Sparring Analysis (Sensors Not Required)</span>
          </div>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-0">
            {/* Split Screen Video */}
            <div className={`col-span-3 p-4 flex flex-col relative transition-colors duration-200 ${impactFlash ? 'bg-red-500/10' : ''}`} style={{ borderRight: '1px solid var(--color-border)' }}>
              
              {/* Corner Selection Header */}
              {isFighting && (
                <div className="flex items-center justify-between mb-4 bg-black/40 p-3 rounded-2xl border border-white/5">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider flex items-center gap-2">My Corner Focus</span>
                  <div className="flex bg-black/60 rounded-lg p-1 border border-white/5">
                    <button onClick={() => setMyCorner('red')} className={`px-6 py-1.5 rounded-md text-xs font-bold transition-all ${myCorner === 'red' ? 'bg-red-500/20 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}>RED</button>
                    <button onClick={() => setMyCorner('blue')} className={`px-6 py-1.5 rounded-md text-xs font-bold transition-all ${myCorner === 'blue' ? 'bg-blue-500/20 text-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}>BLUE</button>
                  </div>
                </div>
              )}

              <div className="flex-1 rounded-2xl overflow-hidden relative" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                {isFighting ? (
                  <FightTracker isActive={isFighting} myCorner={myCorner} onAnalysisUpdate={handleFightMetrics} onFramesCaptured={handleFightFrames} onFighterMetrics={handleFighterMetrics} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-gray-600 min-h-[400px]">
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(230,57,70,0.07)', border: '1px dashed rgba(230,57,70,0.2)' }}><Swords size={32} className="text-red-500/40" /></div>
                    <div className="text-center"><p className="text-sm font-medium text-gray-500">Fight Engine Inactive</p><p className="text-xs text-gray-600 mt-1">Ensure both athletes are visible before starting the match.</p></div>
                  </div>
                )}
                {/* Score HUD */}
                {isFighting && fightMetrics && (
                  <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
                    <div className="bg-black/80 backdrop-blur-md rounded-2xl border border-white/10 flex overflow-hidden shadow-2xl">
                      
                      <div className={`px-6 py-3 flex flex-col items-center min-w-[120px] ${myCorner === 'red' ? 'bg-red-600/20' : 'bg-blue-600/20'}`}>
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-bold uppercase ${myCorner === 'red' ? 'text-red-500' : 'text-blue-400'}`}>MY SCORE</span>
                          <span className={`text-[10px] px-1.5 rounded ${myCorner === 'red' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-400'}`}>YOU</span>
                        </div>
                        <span className="text-4xl font-display font-bold text-white">
                          {myCorner === 'red' ? fightMetrics.redScore : fightMetrics.blueScore}
                        </span>
                      </div>
                      
                      <div className="w-px bg-white/10" />
                      
                      <div className={`px-6 py-3 flex flex-col items-center min-w-[120px] ${myCorner === 'red' ? 'bg-blue-600/20' : 'bg-red-600/20'}`}>
                        <span className={`text-xs font-bold uppercase ${myCorner === 'red' ? 'text-blue-400' : 'text-red-500'}`}>OPPONENT</span>
                        <span className="text-4xl font-display font-bold text-white">
                          {myCorner === 'red' ? fightMetrics.blueScore : fightMetrics.redScore}
                        </span>
                      </div>
                      
                    </div>
                  </div>
                )}
              </div>
            </div>


            {/* ── Fight Sidebar: Live Compare + Corner Advice ── */}
            <div className="col-span-1 flex flex-col bg-slate-900/40 backdrop-blur-md border-l border-white/10 shadow-2xl relative z-10 overflow-y-auto custom-scrollbar">

              {/* Fighter Compare Header */}
              <div className="p-4 border-b border-white/10 bg-black/20 flex items-center gap-2">
                <Swords size={14} className="text-red-400" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Fighter Compare</h3>
              </div>

              <div className="flex-1 p-4 flex flex-col gap-4">

                {/* Score scoreboard */}
                {fightMetrics && (
                  <div className="flex rounded-2xl overflow-hidden border border-white/10">
                    <div className="flex-1 flex flex-col items-center py-3 bg-red-500/10">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Red</span>
                      <span className="text-3xl font-display font-bold text-white mt-1">{fightMetrics.redScore}</span>
                      {myCorner === 'red' && <span className="text-[9px] text-red-400 mt-0.5">YOU</span>}
                    </div>
                    <div className="flex flex-col items-center justify-center px-3 border-x border-white/10">
                      <span className="text-gray-600 text-xs font-bold">vs</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center py-3 bg-blue-500/10">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Blue</span>
                      <span className="text-3xl font-display font-bold text-white mt-1">{fightMetrics.blueScore}</span>
                      {myCorner === 'blue' && <span className="text-[9px] text-blue-400 mt-0.5">YOU</span>}
                    </div>
                  </div>
                )}

                {/* Not fighting yet */}
                {!isFighting && !fightMetrics && (
                  <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(230,57,70,0.07)', border: '1px dashed rgba(230,57,70,0.2)' }}>
                      <Swords size={24} className="text-red-500/40" />
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">Start a match to see live fighter comparison and biomechanical stats.</p>
                  </div>
                )}

                {/* Post-match results */}
                {!isFighting && fightMetrics && (() => {
                  const winner = fightMetrics.redScore > fightMetrics.blueScore ? 'red'
                               : fightMetrics.blueScore > fightMetrics.redScore ? 'blue'
                               : 'draw';
                  return (
                    <div className="rounded-2xl p-3 flex flex-col items-center gap-1 text-center" style={{
                      background: winner === 'draw' ? 'rgba(255,255,255,0.03)' : winner === 'red' ? 'rgba(230,57,70,0.1)' : 'rgba(58,134,255,0.1)',
                      border: `1px solid ${winner === 'draw' ? 'rgba(255,255,255,0.08)' : winner === 'red' ? 'rgba(230,57,70,0.3)' : 'rgba(58,134,255,0.3)'}`,
                    }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: winner === 'draw' ? '#9ca3af' : winner === 'red' ? '#e63946' : '#3a86ff' }}>Match Over</span>
                      <span className="text-lg font-display font-bold text-white capitalize">
                        {winner === 'draw' ? 'Draw!' : `${winner} Wins!`}
                      </span>
                      <span className="text-xs text-gray-500">{fightMetrics.redScore} – {fightMetrics.blueScore}</span>
                    </div>
                  );
                })()}

                {/* Live biomechanics comparison */}
                {(isFighting || fightMetrics) && (() => {
                  const snap  = fighterSnapshot;
                  const rAcc  = redAccRef.current;
                  const bAcc  = blueAccRef.current;

                  // Use live snapshot during fight, averages after
                  const redM  = isFighting ? snap.red  : (rAcc ? { chamberHeight: rAcc.chamberHeight / rAcc.n, pivotAngle: rAcc.pivotAngle / rAcc.n, extensionSnap: rAcc.extensionSnap / rAcc.n, confidence: rAcc.confidence / rAcc.n } : null);
                  const blueM = isFighting ? snap.blue : (bAcc ? { chamberHeight: bAcc.chamberHeight / bAcc.n, pivotAngle: bAcc.pivotAngle / bAcc.n, extensionSnap: bAcc.extensionSnap / bAcc.n, confidence: bAcc.confidence / bAcc.n } : null);

                  const stats = [
                    { key: 'chamber', label: 'Chamber',    red: redM ? Math.min(Math.round(redM.chamberHeight * 100), 100)               : null, blue: blueM ? Math.min(Math.round(blueM.chamberHeight * 100), 100)               : null },
                    { key: 'pivot',   label: 'Pivot',      red: redM ? Math.min(Math.round((redM.pivotAngle / 90) * 100), 100)            : null, blue: blueM ? Math.min(Math.round((blueM.pivotAngle / 90) * 100), 100)            : null },
                    { key: 'snap',    label: 'Snap',       red: redM ? Math.min(Math.round(redM.extensionSnap * 8000), 100)              : null, blue: blueM ? Math.min(Math.round(blueM.extensionSnap * 8000), 100)              : null },
                    { key: 'conf',    label: 'Pose Clarity', red: redM ? Math.round(redM.confidence * 100)                               : null, blue: blueM ? Math.round(blueM.confidence * 100)                               : null },
                  ];

                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">{isFighting ? 'Live Biomechanics' : 'Match Averages'}</span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-[9px] text-gray-500">Red</span></div>
                          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-[9px] text-gray-500">Blue</span></div>
                        </div>
                      </div>
                      {stats.map(s => {
                        const rv = s.red  ?? 0;
                        const bv = s.blue ?? 0;
                        const winner = rv > bv ? 'red' : bv > rv ? 'blue' : 'tie';
                        return (
                          <div key={s.key} className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold" style={{ color: winner === 'red' ? '#e63946' : 'rgba(255,255,255,0.3)' }}>{s.red !== null ? `${rv}%` : '—'}</span>
                                <span className="text-[10px] text-gray-700">|</span>
                                <span className="text-[10px] font-bold" style={{ color: winner === 'blue' ? '#3a86ff' : 'rgba(255,255,255,0.3)' }}>{s.blue !== null ? `${bv}%` : '—'}</span>
                              </div>
                            </div>
                            {/* Dual bar */}
                            <div className="flex items-center gap-1 h-1.5">
                              <div className="flex-1 h-full rounded-full overflow-hidden flex justify-end" style={{ background: 'rgba(230,57,70,0.1)' }}>
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rv}%`, background: '#e63946' }} />
                              </div>
                              <div className="w-px h-full bg-white/10 flex-shrink-0" />
                              <div className="flex-1 h-full rounded-full overflow-hidden" style={{ background: 'rgba(58,134,255,0.1)' }}>
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${bv}%`, background: '#3a86ff' }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Event log */}
                <div className="flex flex-col gap-2">
                  {fightState?.impact && (
                    <div className="slide-in rounded-xl p-3 flex gap-2" style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)' }}>
                      <Flame size={14} className="text-red-500 mt-0.5 flex-shrink-0 animate-pulse" />
                      <div><p className="text-xs font-bold text-red-400">IMPACT</p><p className="text-[10px] text-red-300/60 mt-0.5">Kick landed</p></div>
                    </div>
                  )}
                  {fightState?.falling && (
                    <div className="slide-in rounded-xl p-3 flex gap-2" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
                      <AlertOctagon size={14} className="text-yellow-500 mt-0.5 flex-shrink-0 animate-pulse" />
                      <div><p className="text-xs font-bold text-yellow-400 capitalize">{fightState.falling} Penalty</p><p className="text-[10px] text-yellow-300/60 mt-0.5">Gam-jeom</p></div>
                    </div>
                  )}
                  {fightState?.passive && (
                    <div className="rounded-xl p-3 flex gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <Timer size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                      <div><p className="text-xs font-bold text-gray-400">Passive Play</p><p className="text-[10px] text-gray-600 mt-0.5">&gt; 5s apart</p></div>
                    </div>
                  )}
                </div>

                {/* Corner Advice */}
                <div className="flex-1">
                  <h4 className={`text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${myCorner === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
                    <MessageSquare size={12} /> {myCorner} Corner Advice
                  </h4>
                  <div className={`rounded-xl p-3 relative overflow-hidden ${myCorner === 'red' ? 'bg-red-900/10 border border-red-500/20' : 'bg-blue-900/10 border border-blue-500/20'}`} style={{ minHeight: 80 }}>
                    {cornerStatus === 'thinking' && <div className="flex items-center gap-2"><Loader2 size={13} className={`animate-spin ${myCorner === 'red' ? 'text-red-400' : 'text-blue-400'}`} /><p className="text-xs text-gray-500">Analyzing...</p></div>}
                    {cornerStatus === 'error'    && <p className="text-xs text-red-400">Failed to fetch advice.</p>}
                    {cornerStatus === 'ready' && cornerAdvice && <p className={`text-xs leading-relaxed italic ${myCorner === 'red' ? 'text-red-100' : 'text-blue-100'}`}>"{cornerAdvice}"</p>}
                    {cornerStatus === 'idle'     && <p className="text-[10px] text-gray-600 text-center mt-2">Appears every 10s during match.</p>}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </main>
      )}

    </div>
  );
};

export default App;
