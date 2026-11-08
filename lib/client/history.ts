"use client";
// Saved history (stretch goal): finished debates are kept in this browser's localStorage.
// No accounts or database until the core loop needs them.

import type { DestinationId, Difficulty, RubricKey, Side } from "@/lib/game";

export interface FlightRecord {
  id: string;
  at: number; // ms since epoch
  motion: string;
  side: Side;
  difficulty: Difficulty;
  destination: DestinationId;
  won: boolean;
  userTotal: number;
  aiTotal: number;
  exchanges: number;
  weakest: RubricKey;
}

const KEY = "debai:flight-log:v1";
const MAX_RECORDS = 20;

export function loadHistory(): FlightRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as FlightRecord[]) : [];
    return Array.isArray(list) ? list : [];
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
