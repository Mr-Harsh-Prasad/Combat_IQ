/**
 * storage.ts
 * LocalStorage helpers for persisting PlayerStats profiles.
 */

import type { PlayerStats } from '../types';

const STORAGE_KEY = 'tkd_ai_coach_players';

export function loadPlayers(): PlayerStats[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlayerStats[]) : [];
  } catch {
    return [];
  }
}

export function savePlayers(players: PlayerStats[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}

export function upsertPlayer(player: PlayerStats): PlayerStats[] {
  const players = loadPlayers();
  const idx = players.findIndex(p => p.id === player.id);
  if (idx >= 0) {
    players[idx] = { ...player, updatedAt: Date.now() };
  } else {
    players.push(player);
  }
  savePlayers(players);
  return loadPlayers();
}

export function deletePlayer(id: string): PlayerStats[] {
  const players = loadPlayers().filter(p => p.id !== id);
  savePlayers(players);
  return players;
}

export function createEmptyPlayer(name = 'New Athlete'): PlayerStats {
  return {
    id:        crypto.randomUUID(),
    name,
    rank:      'Unranked',
    chamber:   0,
    pivot:     0,
    snap:      0,
    accuracy:  0,
    sessions:  0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
