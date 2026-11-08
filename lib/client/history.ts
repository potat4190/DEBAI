"use client";
// Saved history (stretch goal): finished debates are kept in this browser's localStorage.
// No accounts or database until the core loop needs them.

import type { DestinationId, Difficulty, Rubric, RubricKey, Side } from "@/lib/game";

export type FlightResult = "won" | "lost" | "draw";

export interface FlightRecord {
  id: string;
  at: number; // ms since epoch
  motion: string;
  side: Side;
  difficulty: Difficulty;
  destination: DestinationId;
  result: FlightResult;
  userTotal: number;
  aiTotal: number;
  exchanges: number;
  weakest: RubricKey;
  /** Your average per category (0-4), over measured scores only (a category with none is left
   * out); missing on debates saved before the skill tracker. */
  avg?: Partial<Rubric>;
}

const KEY = "debai:flight-log:v1";
const MAX_RECORDS = 20;

/** Older records stored `won: boolean` instead of `result`. */
function normalize(r: FlightRecord & { won?: boolean }): FlightRecord {
  return { ...r, result: r.result ?? (r.won ? "won" : "lost") };
}

export function loadHistory(): FlightRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as FlightRecord[]) : [];
    return Array.isArray(list) ? list.map(normalize) : [];
  } catch {
    return [];
  }
}

export function saveFlight(record: Omit<FlightRecord, "id" | "at">): void {
  try {
    const entry: FlightRecord = { ...record, id: Math.random().toString(36).slice(2, 10), at: Date.now() };
    const list = [entry, ...loadHistory()].slice(0, MAX_RECORDS);
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private mode or blocked storage: history is optional.
  }
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
