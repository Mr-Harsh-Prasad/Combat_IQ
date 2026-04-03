/**
 * PlayerProfileCard.tsx
 * High-tech athlete profile card with performance radar mini-chart,
 * rank badge, and Technical Rating display.
 */

import React, { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import {
  User, Trophy, Edit2, Trash2, Save, X, ChevronUp, RotateCcw, Zap, Target,
} from 'lucide-react';
import type { PlayerStats } from '../types';
import { calcTechnicalRating, getRatingTier } from '../types';

interface PlayerProfileCardProps {
  player: PlayerStats;
  onUpdate: (updated: PlayerStats) => void;
  onDelete: (id: string) => void;
  onSelect?: (player: PlayerStats) => void;
  isSelected?: boolean;
  selectionLabel?: string; // e.g. "Player 1" or "Player 2"
}

const RANK_OPTIONS = [
  'Unranked', '10th Geup (White)', '9th Geup', '8th Geup', '7th Geup',
  '6th Geup', '5th Geup', '4th Geup', '3rd Geup', '2nd Geup', '1st Geup (Red/Black)',
  '1st Dan Black Belt', '2nd Dan', '3rd Dan', '4th Dan', '5th Dan',
  '6th Dan', '7th Dan', '8th Dan', '9th Dan (Grandmaster)',
];

export const PlayerProfileCard: React.FC<PlayerProfileCardProps> = ({
  player, onUpdate, onDelete, onSelect, isSelected, selectionLabel,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<PlayerStats>(player);

  const rating = calcTechnicalRating(player);
  const tier   = getRatingTier(rating);

  const radarData = [
    { metric: 'Chamber', value: player.chamber },
    { metric: 'Pivot',   value: player.pivot   },
    { metric: 'Snap',    value: player.snap     },
    { metric: 'Accuracy',value: player.accuracy },
  ];

  const handleSave = () => {
    onUpdate({ ...draft, updatedAt: Date.now() });
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(player);
    setEditing(false);
  };

  const setMetric = (key: keyof PlayerStats, val: number) => {
    setDraft(d => ({ ...d, [key]: Math.min(100, Math.max(0, val)) }));
  };

  return (
    <div
      className={`glass-panel p-6 rounded-2xl transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(59,130,246,0.15)] ${
        isSelected ? 'ring-2 ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] bg-blue-900/10' : ''
      }`}
      onClick={() => !editing && onSelect?.(player)}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${tier.color}22, ${tier.color}44)`,
              border: `1px solid ${tier.color}44`,
            }}
          >
            <User size={20} style={{ color: tier.color }} />
          </div>

          <div>
            {editing ? (
              <input
                className="bg-black/40 border border-white/20 text-white text-sm font-bold rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all shadow-inner"
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <p className="font-display font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 drop-shadow-sm">
                {player.name}
              </p>
            )}
            {editing ? (
              <select
                className="bg-black/40 border border-white/20 text-slate-300 text-xs font-semibold rounded-lg px-2 py-1.5 mt-1.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                value={draft.rank}
                onChange={e => setDraft(d => ({ ...d, rank: e.target.value }))}
                onClick={e => e.stopPropagation()}
              >
                {RANK_OPTIONS.map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
              </select>
            ) : (
              <p className="text-xs mt-0.5 font-semibold text-slate-400 uppercase tracking-wider">
                {player.rank}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {isSelected && selectionLabel && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(58,134,255,0.2)', color: '#3a86ff', border: '1px solid rgba(58,134,255,0.3)' }}>
              {selectionLabel}
            </span>
          )}
          {editing ? (
            <>
              <button onClick={handleSave}   className="text-emerald-400 hover:text-emerald-300 p-1.5 rounded-lg hover:bg-white/5"><Save size={14} /></button>
              <button onClick={handleCancel} className="text-gray-500 hover:text-gray-300 p-1.5 rounded-lg hover:bg-white/5"><X size={14} /></button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-gray-500 hover:text-blue-400 p-1.5 rounded-lg hover:bg-white/5"><Edit2 size={14} /></button>
              <button onClick={() => onDelete(player.id)} className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5"><Trash2 size={14} /></button>
            </>
          )}
        </div>
      </div>

      {/* ── Technical Rating ── */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex-1 bg-black/20 rounded-xl p-3 border border-white/5 shadow-inner">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">Technical Rating</p>
          <div className="flex items-end gap-2">
            <span className="font-display font-black text-3xl leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]" style={{ color: tier.color }}>{rating}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: tier.color }}>{tier.label}</span>
          </div>
        </div>
        <div className="flex-1 bg-black/20 rounded-xl p-3 border border-white/5 shadow-inner">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">Sessions</p>
          <div className="flex items-end gap-2">
            <span className="font-display font-black text-3xl leading-none text-white drop-shadow-md">{player.sessions}</span>
            <Trophy size={16} className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)] mb-1" />
          </div>
        </div>
      </div>

      {/* ── Radar mini-chart ── */}
      <div className="h-36 my-2 relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 10, right: 16, bottom: 10, left: 16 }}>
            <PolarGrid stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 600 }} />
            <Radar
              name={player.name}
              dataKey="value"
              stroke={tier.color}
              strokeWidth={3}
              fill={tier.color}
              fillOpacity={0.25}
              dot={{ r: 3, fill: tier.color, strokeDasharray: '0' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Metric sliders (editing mode) or bars ── */}
      <div className="flex flex-col gap-3">
        {(
          [
            { key: 'chamber',  label: 'Chamber',  icon: <ChevronUp size={12} />,  color: '#e63946' },
            { key: 'pivot',    label: 'Pivot',    icon: <RotateCcw size={12} />,  color: '#3a86ff' },
            { key: 'snap',     label: 'Snap',     icon: <Zap size={12} />,        color: '#f59e0b' },
            { key: 'accuracy', label: 'Accuracy', icon: <Target size={12} />,     color: '#10b981' },
          ] as const
        ).map(({ key, label, icon, color }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                <span className="p-1 rounded bg-black/30" style={{ color }}>{icon}</span>{label}
              </span>
              {editing ? (
                <input
                  type="number"
                  min={0} max={100}
                  className="w-16 text-right text-sm font-bold bg-black/40 border border-white/20 rounded-md px-2 py-0.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-inner"
                  value={draft[key]}
                  onChange={e => setMetric(key, Number(e.target.value))}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="text-sm font-display font-bold" style={{ color }}>{player[key]}</span>
              )}
            </div>
            {editing ? (
              <input
                type="range" min={0} max={100}
                className="w-full h-1.5 accent-blue-500 rounded-full"
                value={draft[key]}
                onChange={e => setMetric(key, Number(e.target.value))}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <div className="w-full h-1.5 rounded-full bg-slate-800/80 shadow-inner overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out relative"
                  style={{ width: `${player[key]}%`, background: color }}
                ><div className="absolute inset-0 bg-white/20 w-full animate-pulse" /></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
