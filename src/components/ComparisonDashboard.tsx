/**
 * ComparisonDashboard.tsx
 * Head-to-Head athlete comparison with Radar Chart overlay,
 * metric delta table, and AI Scout analysis.
 */

import React, { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from 'recharts';
import {
  Swords, Brain, Loader2, ChevronUp, RotateCcw, Zap, Target,
  TrendingUp, TrendingDown, Minus, BarChart2,
} from 'lucide-react';
import type { PlayerStats } from '../types';
import { calcTechnicalRating, getRatingTier } from '../types';

interface ComparisonDashboardProps {
  player1: PlayerStats;
  player2: PlayerStats;
  onRequestAnalysis: (p1: PlayerStats, p2: PlayerStats) => Promise<string>;
}

type AIState = 'idle' | 'thinking' | 'done' | 'error';

const METRICS = [
  { key: 'chamber'  as const, label: 'Chamber Height', icon: <ChevronUp size={13} />, color: '#e63946' },
  { key: 'pivot'    as const, label: 'Pivot Angle',    icon: <RotateCcw size={13} />, color: '#3a86ff' },
  { key: 'snap'     as const, label: 'Extension Snap', icon: <Zap size={13} />,       color: '#ffd700' },
  { key: 'accuracy' as const, label: 'Accuracy',       icon: <Target size={13} />,    color: '#10b981' },
];

const P1_COLOR = '#3a86ff';
const P2_COLOR = '#e63946';

export const ComparisonDashboard: React.FC<ComparisonDashboardProps> = ({
  player1, player2, onRequestAnalysis,
}) => {
  const [aiState, setAiState]   = useState<AIState>('idle');
  const [analysis, setAnalysis] = useState('');

  const rating1 = calcTechnicalRating(player1);
  const rating2 = calcTechnicalRating(player2);
  const tier1   = getRatingTier(rating1);
  const tier2   = getRatingTier(rating2);

  const radarData = METRICS.map(m => ({
    metric: m.label.split(' ')[0], // short label
    [player1.name]: player1[m.key],
    [player2.name]: player2[m.key],
  }));

  const handleAnalyze = async () => {
    setAiState('thinking');
    try {
      const result = await onRequestAnalysis(player1, player2);
      setAnalysis(result);
      setAiState('done');
    } catch {
      setAiState('error');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Title bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20 shadow-inner">
            <Swords size={20} className="text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
          </div>
          <h2 className="font-display font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 drop-shadow-sm">
            Head-to-Head Analysis
          </h2>
        </div>

        {/* Rating chips */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: P1_COLOR }} />
            <span className="text-xs text-gray-400">{player1.name}</span>
            <span className="text-xs font-bold font-display" style={{ color: tier1.color }}>{rating1}</span>
          </div>
          <span className="text-gray-600 text-sm">vs</span>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: P2_COLOR }} />
            <span className="text-xs text-gray-400">{player2.name}</span>
            <span className="text-xs font-bold font-display" style={{ color: tier2.color }}>{rating2}</span>
          </div>
        </div>
      </div>

      {/* ── Radar chart ── */}
      <div
        className="glass-panel p-5 rounded-2xl shadow-xl transition-all duration-300 hover:shadow-[0_8px_30px_rgba(255,255,255,0.05)] hover:-translate-y-1"
        style={{ height: 320 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: '#8892b0', fontSize: 11, fontWeight: 500 }}
            />
            <PolarRadiusAxis
              angle={90} domain={[0, 100]}
              tick={{ fill: '#4a5568', fontSize: 9 }}
              axisLine={false}
            />
            <Radar
              name={player1.name}
              dataKey={player1.name}
              stroke={P1_COLOR}
              fill={P1_COLOR}
              fillOpacity={0.18}
              strokeWidth={2}
            />
            <Radar
              name={player2.name}
              dataKey={player2.name}
              stroke={P2_COLOR}
              fill={P2_COLOR}
              fillOpacity={0.18}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{
                background: '#14172a',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#8892b0' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: '#8892b0', paddingTop: 8 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Delta table ── */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-xl transition-all duration-300 hover:shadow-[0_8px_30px_rgba(255,255,255,0.05)] hover:-translate-y-1">
        <div className="px-6 py-4 border-b border-white/10 bg-black/20">
          <h3 className="text-xs uppercase tracking-widest text-slate-400 font-bold flex items-center gap-2"><BarChart2 size={14} className="text-emerald-400" /> Metric Breakdown</h3>
        </div>
        <div className="divide-y divide-white/5">
          {METRICS.map(m => {
            const v1    = player1[m.key];
            const v2    = player2[m.key];
            const delta = v1 - v2;
            const winner = delta > 0 ? 'p1' : delta < 0 ? 'p2' : 'tie';

            return (
              <div key={m.key} className="px-5 py-3 flex items-center gap-3">
                {/* Metric label */}
                <div className="flex items-center gap-2 w-32 flex-shrink-0">
                  <span style={{ color: m.color }}>{m.icon}</span>
                  <span className="text-xs text-gray-400">{m.label}</span>
                </div>

                {/* P1 score */}
                <span
                  className="text-sm font-mono font-bold w-10 text-right flex-shrink-0"
                  style={{ color: winner === 'p1' ? P1_COLOR : 'rgba(255,255,255,0.5)' }}
                >
                  {v1}
                </span>

                {/* Bar comparison */}
                <div className="flex-1 flex items-center gap-1 h-5">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden flex justify-end">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${v1}%`, background: P1_COLOR, opacity: 0.8 }}
                    />
                  </div>
                  <div className="w-px h-4 bg-white/10 flex-shrink-0" />
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${v2}%`, background: P2_COLOR, opacity: 0.8 }}
                    />
                  </div>
                </div>

                {/* P2 score */}
                <span
                  className="text-sm font-mono font-bold w-10 flex-shrink-0"
                  style={{ color: winner === 'p2' ? P2_COLOR : 'rgba(255,255,255,0.5)' }}
                >
                  {v2}
                </span>

                {/* Delta chip */}
                <div className="w-14 flex justify-end flex-shrink-0">
                  {winner === 'tie' ? (
                    <Minus size={12} className="text-gray-600" />
                  ) : (
                    <span
                      className="flex items-center gap-0.5 text-xs font-semibold"
                      style={{ color: winner === 'p1' ? P1_COLOR : P2_COLOR }}
                    >
                      {winner === 'p1' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {Math.abs(delta)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── AI Scout ── */}
      <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5 shadow-xl transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden text-white" style={{ border: '1px solid rgba(250, 204, 21, 0.2)' }}>
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-yellow-500/10 rounded-full blur-[80px] pointer-events-none transition-transform duration-1000 group-hover:scale-150" />
        <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
          <div className="flex items-center gap-3 bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20">
            <Brain size={16} className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
            <h3 className="font-display font-bold text-xs uppercase tracking-widest text-yellow-500/90">AI Scout Report</h3>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={aiState === 'thinking'}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all duration-300 disabled:opacity-50 hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3), inset 0 1px 1px rgba(255,255,255,0.2)',
            }}
          >
            {aiState === 'thinking'
              ? <><Loader2 size={14} className="animate-spin" /> Analyzing Biomechanics...</>
              : <><Swords size={14} /> Generate Scout Report</>
            }
          </button>
        </div>

        <div
          className="rounded-xl p-5 relative overflow-hidden backdrop-blur-sm shadow-inner"
          style={{
            background: 'linear-gradient(135deg, rgba(250,204,21,0.05), rgba(15,23,42,0.8))',
            border: '1px solid rgba(255,255,255,0.05)',
            minHeight: 120,
          }}
        >
          {aiState === 'idle' && (
            <p className="text-xs text-gray-600 text-center mt-4">
              Click "Compare Athletes" to generate a biomechanical scout report
            </p>
          )}
          {aiState === 'thinking' && (
            <div className="flex items-center gap-3 text-yellow-400/70">
              <Loader2 size={16} className="animate-spin flex-shrink-0" />
              <span className="text-xs">AI Scout is analyzing biomechanical gaps...</span>
            </div>
          )}
          {aiState === 'error' && (
            <p className="text-xs text-red-400">Scout analysis failed. Check console.</p>
          )}
          {aiState === 'done' && analysis && (
            <p
              className="text-sm leading-relaxed slide-in"
              style={{ color: 'rgba(240,244,255,0.88)', fontStyle: 'italic' }}
            >
              "{analysis}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
