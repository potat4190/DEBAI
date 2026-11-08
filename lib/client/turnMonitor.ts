// Decides, many times a second, whether the user's spoken turn is over and whether the AI should
// cut in. Pure functions only (no browser APIs), so the rules are easy to test and tune.

import {
  countFillersAndStutters,
  FILLER_WORDS,
  LONG_PAUSE_MS,
  MIN_TALK_BEFORE_CUTOFF_MS,
  PATIENT_END_SILENCE_MS,
  PAUSE_MS,
  type CutoffReason,
  type TurnTiming,
} from "@/lib/game";

export interface MonitorOptions {
  timing: TurnTiming;
  interruptions: boolean;
}

export interface MonitorState {
  startedAt: number;
  lastAt: number;
  speechMs: number; // total time spent talking this turn
  heardSpeech: boolean; // talked for at least MIN_SPEECH_MS (a cough or click doesn't count)
  firstSpeechAt: number | null;
  silenceSince: number | null; // start of the current silence, once speech has begun
  pauses: number; // silences of PAUSE_MS or more that didn't end the turn
  longPauses: number; // silences of LONG_PAUSE_MS or more that didn't end the turn (for confidence)
}

export interface MonitorInput {
  now: number;
  speaking: boolean;
  captions: string; // live captions so far (for fillers and stutters)
  typing: boolean; // the user has typed into the text box this turn
}

export type MonitorEvent = { type: "end" } | { type: "cutoff"; reason: CutoffReason } | null;

export interface MonitorStep {
  state: MonitorState;
  event: MonitorEvent;
  /** 0–1: how close the AI is to cutting in (shown as a patience bar). */
  patience: number;
  /** Hesitations counted so far: pauses + fillers + stutters. */
  hesitations: number;
  /** True while a silence is running that will end the turn. */
  endingIn: number | null;
}

// Words that mean the speaker is mid-thought: after these, wait longer before ending the turn.
const TRAILING_WORDS = new Set([...FILLER_WORDS, "and", "but", "so", "because", "like", "the", "a", "an", "to", "of", "or", "if", "that"]);
const TRAILING_EXTRA_MS = 1500;
const MIN_SPEECH_MS = 400;

export function startMonitor(now: number): MonitorState {
  return { startedAt: now, lastAt: now, speechMs: 0, heardSpeech: false, firstSpeechAt: null, silenceSince: null, pauses: 0, longPauses: 0 };
}

function words(captions: string): string[] {
  return captions
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z'-]/g, ""))
    .filter(Boolean);
}

/** Filler words plus stutters (a word repeated straight away, or a cut-off word like "th-"). */
export function countDisfluencies(captions: string): number {
  const { fillers, stutters } = countFillersAndStutters(captions);
  return fillers + stutters;
}

export function stepMonitor(s: MonitorState, input: MonitorInput, opts: MonitorOptions): MonitorStep {
  const { now, speaking, captions, typing } = input;
  const { timing, interruptions } = opts;
  const next: MonitorState = { ...s, lastAt: now };
  const elapsed = now - s.startedAt;

  if (speaking) {
    next.speechMs += Math.min(250, now - s.lastAt);
    if (!next.heardSpeech && next.speechMs >= MIN_SPEECH_MS) {
      next.heardSpeech = true;
      next.firstSpeechAt = now;
    }
    // A silence that ended without ending the turn was a hesitation.
    if (next.silenceSince !== null && now - next.silenceSince >= PAUSE_MS) next.pauses++;
    if (next.silenceSince !== null && now - next.silenceSince >= LONG_PAUSE_MS) next.longPauses++;
    next.silenceSince = null;
  } else if (next.heardSpeech && next.silenceSince === null) {
    next.silenceSince = now;
  }

  const hesitations = next.pauses + countDisfluencies(captions);
  const step = (event: MonitorEvent, patience: number, endingIn: number | null = null): MonitorStep => ({
    state: next,
    event,
    patience: Math.min(1, Math.max(0, patience)),
    hesitations,
    endingIn,
  });

  // Not started yet.
  if (!next.heardSpeech) {
    if (!interruptions || typing) return step(null, 0);
    const p = elapsed / timing.startGraceMs;
    return p >= 1 ? step({ type: "cutoff", reason: "silent" }, 1) : step(null, p);
  }

  const talked = now - (next.firstSpeechAt ?? now);

  // Interruptions: the AI cuts in when you ramble or keep stalling.
  if (interruptions) {
    if (elapsed >= timing.maxTurnMs) return step({ type: "cutoff", reason: "ramble" }, 1);
    if (hesitations >= timing.maxHesitations && talked >= MIN_TALK_BEFORE_CUTOFF_MS) {
      return step({ type: "cutoff", reason: "stall" }, 1);
    }
  }
  const patience = interruptions ? Math.max(hesitations / timing.maxHesitations, elapsed / timing.maxTurnMs) : 0;

  // End of turn: enough silence after you've said something. Wait longer if you trailed off mid-thought.
  if (next.silenceSince !== null && !typing) {
    const ws = words(captions);
    const trailing = ws.length > 0 && TRAILING_WORDS.has(ws[ws.length - 1]);
    const base = interruptions ? timing.endSilenceMs : PATIENT_END_SILENCE_MS;
    const needed = base + (trailing ? TRAILING_EXTRA_MS : 0);
    const silent = now - next.silenceSince;
    if (silent >= needed) return step({ type: "end" }, patience);
    return step(null, patience, needed - silent);
  }
  return step(null, patience);
}
