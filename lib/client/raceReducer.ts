// All race state in one reducer: distances, speeds, scores, mood inputs and the timeline.
// Pure functions only, so the speed formula and turn flow are easy to test.

import {
  TURN_SECONDS,
  advanceRocket,
  checkOutcome,
  initialRocket,
  type Destination,
  type Exchange,
  type JudgeResult,
  type Mood,
  type OpponentSentence,
  type Outcome,
  type RocketState,
} from "@/lib/game";

/**
 * user: your turn · opponent: the AI is talking · waiting: the last exchange is being scored ·
 * finishing: the race is over (a rocket arrived, the exchanges ran out, or the clock did). Scoring runs in the background, so the next turn starts as soon
 * as the AI stops talking and the rockets boost whenever the judge's scores arrive.
 */
export type Phase = "user" | "opponent" | "waiting" | "finishing";

/** An exchange that has been spoken but not scored yet. */
export interface PendingExchange {
  index: number;
  userText: string;
  aiText: string;
}

export interface RaceState {
  user: RocketState;
  ai: RocketState;
  exchanges: Exchange[];
  pending: PendingExchange[];
  phase: Phase;
  draft: string;
  /** The opponent's current or last reply, filled sentence by sentence while it streams. */
  transmission: OpponentSentence[];
  turnLeft: number;
  error: string | null;
  /** A short status line, e.g. who cut whom off. */
  notice: string | null;
  boosting: boolean;
  outcome: Outcome;
  stoppedAt: number | null;
}

export type RaceAction =
  | { type: "tick" }
  | { type: "draft"; text: string }
  | { type: "appendDraft"; text: string }
  | { type: "submit"; index: number; userText: string }
  | { type: "sentence"; sentence: OpponentSentence }
  | { type: "opponentDone"; index: number; aiText: string; last: boolean; spoken?: OpponentSentence[] }
  | { type: "scored"; exchange: Exchange; outcome: Outcome }
  | { type: "boostDone" }
  | { type: "notice"; text: string | null }
  | { type: "finished"; at: number }
  | { type: "failed"; index: number; error: string }
  /** The race clock ran out: no new turns; exchanges already spoken still get scored. */
  | { type: "timeUp" }
  /** The race was decided without a new exchange (the clock ran out). */
  | { type: "ended"; outcome: Outcome };

export function initialRaceState(dest: Destination): RaceState {
  return {
    user: initialRocket(dest),
    ai: initialRocket(dest),
    exchanges: [],
    pending: [],
    phase: "user",
    draft: "",
    transmission: [],
    turnLeft: TURN_SECONDS,
    error: null,
    notice: null,
    boosting: false,
    outcome: { over: false },
    stoppedAt: null,
  };
}

export function raceReducer(s: RaceState, a: RaceAction): RaceState {
  switch (a.type) {
    case "tick":
      return s.phase === "user" ? { ...s, turnLeft: Math.max(0, s.turnLeft - 1) } : s;
    case "draft":
      return s.phase === "user" ? { ...s, draft: a.text } : s;
    case "appendDraft":
      return s.phase === "user" ? { ...s, draft: s.draft ? `${s.draft} ${a.text}` : a.text } : s;
    case "submit":
      if (s.phase === "finishing") return s;
      return {
        ...s,
        phase: "opponent",
        error: null,
        transmission: [],
        pending: [...s.pending, { index: a.index, userText: a.userText, aiText: "" }],
      };
    case "sentence":
      return s.phase === "finishing" ? s : { ...s, transmission: [...s.transmission, a.sentence] };
    case "opponentDone":
      if (s.phase === "finishing") return s;
      return {
        ...s,
        pending: s.pending.map((p) => (p.index === a.index ? { ...p, aiText: a.aiText } : p)),
        phase: a.last ? "waiting" : "user",
        transmission: a.spoken ?? s.transmission, // when cut off, show only what the AI actually said
        notice: null,
        draft: "",
        turnLeft: TURN_SECONDS,
      };
    case "scored":
      return {
        ...s,
        user: a.exchange.userAfter,
        ai: a.exchange.aiAfter,
        exchanges: [...s.exchanges, a.exchange],
        pending: s.pending.filter((p) => p.index !== a.exchange.index),
        outcome: a.outcome,
        phase: a.outcome.over ? "finishing" : s.phase,
        boosting: true,
      };
    case "boostDone":
      return { ...s, boosting: false };
    case "notice":
      return { ...s, notice: a.text };
    case "finished":
      return { ...s, stoppedAt: a.at };
    case "failed":
      if (s.phase === "finishing") return s;
      return {
        ...s,
        phase: "user",
        error: a.error,
        turnLeft: TURN_SECONDS,
        pending: s.pending.filter((p) => p.index !== a.index),
      };
    case "timeUp":
      return {
        ...s,
        phase: "finishing",
        draft: "",
        notice: null,
        // An exchange the AI hadn't finished answering is dropped; finished ones are still scored.
        pending: s.pending.filter((p) => p.aiText),
      };
    case "ended":
      return { ...s, phase: "finishing", outcome: a.outcome };
  }
}

/** Applies the judge's scores to both rockets and builds the timeline entry. */
export function scoreExchange(
  s: RaceState,
  dest: Destination,
  input: { userText: string; aiText: string; mood: Mood; judge: JudgeResult; at: number },
): { exchange: Exchange; outcome: Outcome } {
  const { judge } = input;
  const u = advanceRocket(dest, s.user, judge.user.total, judge.ai.total, Boolean(judge.user.fallacy));
  const a = advanceRocket(dest, s.ai, judge.ai.total, judge.user.total, Boolean(judge.ai.fallacy));
  const exchange: Exchange = {
    index: s.exchanges.length + 1,
    at: input.at,
    userText: input.userText,
    aiText: input.aiText,
    mood: input.mood,
    judge,
    userDv: u.dv,
    aiDv: a.dv,
    userAfter: u.next,
    aiAfter: a.next,
  };
  const all = [...s.exchanges, exchange];
  const total = (k: "user" | "ai") => all.reduce((sum, e) => sum + e.judge[k].total, 0);
  const outcome = checkOutcome(dest, u.next, a.next, all.length, total("user"), total("ai"));
  return { exchange, outcome };
}
