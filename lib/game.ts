// Core game rules shared by the client and the API routes.
// Numbers come from the "Debate Rocket Race" spec doc.

export type Side = "for" | "against";
export type Difficulty = "easy" | "medium" | "hard";
export type Mood = "winning" | "even" | "losing" | "heated";
export type DestinationId = "moon" | "mars" | "jupiter" | "saturn";
export type RubricKey = "claim" | "evidence" | "rebuttal" | "relevance" | "confidence";

export const RUBRIC_KEYS: RubricKey[] = ["claim", "evidence", "rebuttal", "relevance", "confidence"];
/** Each criterion is scored 0 to 4. */
export const CRITERION_MAX = 4;
/** A turn is out of 20 (5 criteria x 4 points), the scale the spec's speed constants were tuned for. */
export const MAX_SCORE = RUBRIC_KEYS.length * CRITERION_MAX;
export const TURN_SECONDS = 90; // user turn timer: room to think before and while you talk
export const SECONDS_PER_TURN = 60; // simulated seconds each exchange advances the race

export interface Destination {
  id: DestinationId;
  name: string;
  distance: number; // miles
  baseSpeed: number; // mi/s
  K: number; // speed increment per score point (mi/s)
  B: number; // bonus per net score point (mi/s)
  maxExchanges: number;
  maxMinutes: number;
  ring?: boolean;
}

export const DESTINATIONS: Destination[] = [
  { id: "moon", name: "Moon", distance: 240_000, baseSpeed: 100, K: 11, B: 20, maxExchanges: 6, maxMinutes: 9 },
  { id: "mars", name: "Mars", distance: 140_000_000, baseSpeed: 22_400, K: 1_440, B: 2_520, maxExchanges: 13, maxMinutes: 19.5 },
  { id: "jupiter", name: "Jupiter", distance: 390_000_000, baseSpeed: 40_000, K: 1_700, B: 2_970, maxExchanges: 20, maxMinutes: 30 },
  { id: "saturn", name: "Saturn", distance: 790_000_000, baseSpeed: 60_800, K: 2_100, B: 3_420, maxExchanges: 26, maxMinutes: 39, ring: true },
];

export function getDestination(id: DestinationId): Destination {
  return DESTINATIONS.find((d) => d.id === id) ?? DESTINATIONS[0];
}

// ---------- Launch vehicles ----------
// Each destination pairs two real rockets: one flown by you, one by the AI. No rocket repeats.

export type RocketId = "saturn-v" | "atlas-v" | "starship" | "falcon-heavy" | "titan-iiie" | "ariane-5" | "sls" | "new-glenn";

export const ROCKET_NAMES: Record<RocketId, string> = {
  "saturn-v": "Saturn V",
  "atlas-v": "Atlas V",
  starship: "Starship",
  "falcon-heavy": "Falcon Heavy",
  "titan-iiie": "Titan IIIE",
  "ariane-5": "Ariane 5",
  sls: "SLS",
  "new-glenn": "New Glenn",
};

const LINEUP: Record<DestinationId, { user: RocketId; ai: RocketId }> = {
  moon: { user: "saturn-v", ai: "atlas-v" },
  mars: { user: "starship", ai: "falcon-heavy" },
  jupiter: { user: "titan-iiie", ai: "ariane-5" },
  saturn: { user: "sls", ai: "new-glenn" },
};

export interface Vehicle {
  id: RocketId;
  name: string; // e.g. "Saturn V"
  tag: string; // upper-case label for the HUD, e.g. "SATURN V"
}

/** The two rockets racing to a destination. */
export function vehiclesFor(id: DestinationId): { user: Vehicle; ai: Vehicle } {
  const pair = LINEUP[id] ?? LINEUP.moon;
  const v = (r: RocketId): Vehicle => ({ id: r, name: ROCKET_NAMES[r], tag: ROCKET_NAMES[r].toUpperCase() });
  return { user: v(pair.user), ai: v(pair.ai) };
}

export const TOPICS: string[] = [
  "Social media does more harm than good for teenagers",
  "Homework should be banned in primary and secondary schools",
  "Artificial intelligence will create more jobs than it destroys",
  "College education should be free for all students",
  "Space exploration is worth its cost",
  "The voting age should be lowered to 16",
  "Standardized testing should be abolished in college admissions",
  "Nuclear power is the best path to a carbon-free future",
  "Remote work is better than working in an office",
  "Professional athletes are overpaid",
  "Cities should ban cars from their downtown cores",
  "Zoos should be phased out",
  "A four-day work week should become the standard",
  "Governments should implement a universal basic income",
  "Smartphones should be banned in classrooms",
  "Billionaires should not exist",
  "Video games are a legitimate form of art",
  "Fast fashion should be heavily taxed",
  "Humanity should prioritize colonizing Mars",
  "Children should learn to code before they learn a second language",
];

// ---------- Data shapes ----------

export interface GameConfig {
  motion: string;
  side: Side; // the user's side
  difficulty: Difficulty;
  callsign: string;
  destination: DestinationId;
  /** Either side may cut the other off (the AI when you stall, you by talking over the AI). */
  interruptions: boolean;
}

export type Rubric = Record<RubricKey, number>;

export interface TurnScore {
  rubric: Rubric;
  total: number; // 0-20
  /** How the confidence score was measured, e.g. "2 long pauses, 5 fillers". */
  delivery?: string;
  reason: string; // one-line explanation
  fallacy: string | null; // e.g. "straw man"
}

export interface JudgeResult {
  user: TurnScore;
  ai: TurnScore;
  winner: "user" | "ai" | "tie";
  winningSummary: string; // summary of the stronger argument
  verdict: string; // one-line explanation of the scores
}

export interface OpponentSentence {
  text: string; // plain text: shown on screen and sent to the judge
  emotion: string; // one of the difficulty's allowed emotions, or "neutral"
  tagged: string; // text with Fish Audio bracket cues, sent to TTS only
}

export interface OpponentResult {
  sentences: OpponentSentence[];
  text: string;
  speed: number;
}

/** One NDJSON line from the streaming /api/opponent route. */
export type OpponentStreamEvent =
  | { type: "sentence"; sentence: OpponentSentence }
  | { type: "done"; text: string; speed: number; simulated: boolean }
  | { type: "error"; error: string };

export interface RocketState {
  v: number; // mi/s
  d: number; // miles
  lastDv: number | null;
  lastScore: number | null;
  streak: number; // consecutive strong turns (>= STRONG_TURN)
  stalled: boolean;
}

export interface Exchange {
  index: number; // 1-based
  at: number; // ms since race start
  userText: string;
  aiText: string;
  mood: Mood;
  judge: JudgeResult;
  userDv: number;
  aiDv: number;
  userAfter: RocketState;
  aiAfter: RocketState;
}

export interface Report {
  strongPoints: string;
  weakestExplanation: string;
  rewrite: { original: string; improved: string };
  fallacies: { name: string; exchange: number; quote: string }[];
  exercise: string;
}

// ---------- Physics ----------

// Stretch-goal modifiers from the spec ("momentum streaks" and "fallacy stalls").
export const STRONG_TURN = 15; // a score (on the 20-point spec scale) at or above this counts toward a streak
export const STREAK_LENGTH = 3; // streak length that triggers momentum
export const MOMENTUM_K_MULTIPLIER = 2; // momentum adds 2 x K to speed
export const STALL_FACTOR = 0.5; // a fallacy makes the rocket cover only half its distance that turn

export function initialRocket(dest: Destination): RocketState {
  return { v: dest.baseSpeed, d: 0, lastDv: null, lastScore: null, streak: 0, stalled: false };
}

/**
 * V_new = V_old + (S x K) + max(0, S - S_opp) x B   (+ momentum bonus on a streak)
 * D_new = D_old + V_new x 60                         (x STALL_FACTOR on a fallacy)
 */
export function advanceRocket(
  dest: Destination,
  r: RocketState,
  score: number,
  oppScore: number,
  fallacy: boolean,
): { next: RocketState; dv: number } {
  const S = score;
  const S_opp = oppScore;
  const streak = S >= STRONG_TURN ? r.streak + 1 : 0;
  let dv = S * dest.K + Math.max(0, S - S_opp) * dest.B;
  if (streak >= STREAK_LENGTH) dv += MOMENTUM_K_MULTIPLIER * dest.K;
  const v = r.v + dv;
  const travel = v * SECONDS_PER_TURN * (fallacy ? STALL_FACTOR : 1);
  return {
    dv,
    next: { v, d: r.d + travel, lastDv: dv, lastScore: score, streak, stalled: fallacy },
  };
}

export type DecidedBy = "arrived" | "max-round" | "score-tiebreak";

export interface Outcome {
  over: boolean;
  winner?: "user" | "ai";
  decidedBy?: DecidedBy;
}

export function checkOutcome(
  dest: Destination,
  user: RocketState,
  ai: RocketState,
  exchanges: number,
  userTotal: number,
  aiTotal: number,
): Outcome {
  const userIn = user.d >= dest.distance;
  const aiIn = ai.d >= dest.distance;
  const atMax = exchanges >= dest.maxExchanges;
  if (!userIn && !aiIn && !atMax) return { over: false };

  const decidedBy: DecidedBy = userIn || aiIn ? "arrived" : "max-round";
  if (user.d !== ai.d) return { over: true, winner: user.d > ai.d ? "user" : "ai", decidedBy };
  if (userTotal !== aiTotal) {
    return { over: true, winner: userTotal > aiTotal ? "user" : "ai", decidedBy: "score-tiebreak" };
  }
  // Perfectly level on distance and score: the AI is the defending champion.
  return { over: true, winner: "ai", decidedBy: "score-tiebreak" };
}

// ---------- Mood engine ----------

export const MAX_HEATED_PER_DEBATE = 2;

/** Picks the AI opponent's mood from the score gap, losing streak and race gap. */
export function pickMood(exchanges: Exchange[], dest: Destination): Mood {
  if (exchanges.length === 0) return "even";
  const last = exchanges[exchanges.length - 1];
  const gap = last.judge.ai.total - last.judge.user.total; // > 0: AI won the last exchange
  const raceGap = (last.aiAfter.d - last.userAfter.d) / dest.distance;

  let losingStreak = 0;
  for (let i = exchanges.length - 1; i >= 0; i--) {
    if (exchanges[i].judge.user.total > exchanges[i].judge.ai.total) losingStreak++;
    else break;
  }
  const heatedSoFar = exchanges.filter((e) => e.mood === "heated").length;
  const lastWasHeated = last.mood === "heated";

  // Heated moments stay rare (1-2 per debate) so they land.
  if (
    heatedSoFar < MAX_HEATED_PER_DEBATE &&
    !lastWasHeated &&
    ((losingStreak >= 2 && gap <= -4) || (raceGap < -0.15 && gap <= -3))
  ) {
    return "heated";
  }
  if (gap >= 3 || raceGap > 0.08) return "winning";
  if (gap <= -3 || raceGap < -0.08) return "losing";
  return "even";
}

// ---------- Voice profiles ----------

/** Why the AI cut the user off. */
export type CutoffReason = "silent" | "stall" | "ramble";

/** Turn-taking thresholds (ms). Tune these after play-testing. */
export interface TurnTiming {
  startGraceMs: number; // AI cuts in if you haven't started talking by then (interruptions on)
  endSilenceMs: number; // this much silence after you've spoken ends your turn
  maxHesitations: number; // pauses + fillers + stutters before the AI cuts in (interruptions on)
  maxTurnMs: number; // AI cuts in if you talk longer than this (interruptions on)
}

/** Silence that ends your turn when interruptions are off: patient, so you can think. */
export const PATIENT_END_SILENCE_MS = 3500;
/** A gap this long that doesn't end the turn counts as one hesitation. */
export const PAUSE_MS = 900;
/** The AI won't cut in for hesitating until you've talked at least this long. */
export const MIN_TALK_BEFORE_CUTOFF_MS = 5000;
/** You must talk over the AI this long (ms) to cut it off. */
export const BARGE_IN_MS = 450;

export interface VoiceProfile {
  vibe: string;
  speed: number;
  moods: Record<Mood, string>; // emotion used for each mood
  extras: string[]; // other allowed emotions
  style: string; // instructions for Gemini
  disfluency: string; // how human-messy the AI's speech is
  timing: TurnTiming;
  /** Pre-voiced lines: played instantly when the AI cuts in, or while it "thinks". */
  lines: Record<CutoffReason | "thinking", string[]>;
}

export const VOICE_PROFILES: Record<Difficulty, VoiceProfile> = {
  easy: {
    vibe: "Middle schooler: casual, unsure, sometimes wrong",
    speed: 0.92,
    moods: { winning: "cheerful", even: "relaxed", losing: "slightly disappointed", heated: "mildly frustrated" },
    extras: ["laughing", "sighing"],
    style: [
      "You are a 7th or 8th grader in a school debate. You talk and think like a 13-year-old.",
      "Use simple, everyday words and short sentences. No statistics jargon, no named studies, no debate terms like 'burden of proof' or 'meta-analysis'.",
      "Your arguments are basic: personal experience, things you've heard, gut feelings, simple examples ('like, my cousin...').",
      "In about every other reply, get something slightly wrong on purpose: a made-up or exaggerated number, a mixed-up fact, an overgeneralization ('everyone knows...'), or reasoning with an obvious hole. Say it confidently, never flag it as wrong.",
      "You sometimes miss the point of what they said, and you give in quickly when they make a strong point.",
    ].join(" "),
    disfluency:
      "Sound unsure and nervous, like a kid thinking out loud: fillers (um, uh, like, you know) in nearly every sentence, a [pause] or [long pause] in most replies, and restarts or stutters (\"it's- it's like\", \"I- I mean\").",
    timing: { startGraceMs: 20_000, endSilenceMs: 3_000, maxHesitations: 9, maxTurnMs: 90_000 },
    lines: {
      silent: ["Um, okay, I guess... I'll go?", "Uh, are you- okay, I'll just start."],
      stall: ["Sorry, um, can I- can I say something?", "Wait, wait, um, can I go now?"],
      ramble: ["Okay, um, can I talk now?", "Uh, sorry, my turn?"],
      thinking: ["Um...", "Hmm, okay...", "Uh, so..."],
    },
  },
  medium: {
    vibe: "College student: solid, accurate, still thinking aloud",
    speed: 1.0,
    moods: { winning: "confident", even: "focused", losing: "frustrated", heated: "very frustrated" },
    extras: ["sighing", "emphatic"],
    style: [
      "You are a college student on a university debate team: smart and well read, but not a polished professional.",
      "Make reasonable arguments with mostly accurate facts and real examples. Name a source only when you're sure of it, and keep numbers approximate ('about a third', 'most studies').",
      "Answer their strongest point, not a weak version of it. Concede what's true and move on.",
    ].join(" "),
    disfluency:
      "Still very much thinking out loud: a filler (um, uh, like, I mean) in most sentences, a [pause] or [short pause] while you work out your point, and an occasional self-correction (\"it's not, well, it's not that simple\").",
    timing: { startGraceMs: 15_000, endSilenceMs: 2_600, maxHesitations: 7, maxTurnMs: 75_000 },
    lines: {
      silent: ["Alright, [short pause] I'll take it from here.", "Okay, if you've got nothing, I'll go."],
      stall: ["Let me stop you there.", "Okay, I- I'm gonna cut in here."],
      ramble: ["Okay, hold on, hold on.", "Let me jump in, because, uh, that's a lot."],
      thinking: ["Hmm.", "Okay, um...", "Right, so..."],
    },
  },
  hard: {
    vibe: "Professional debater: precise, cutting, relentless",
    speed: 1.1,
    moods: { winning: "smug", even: "intense", losing: "angry", heated: "extremely angry, shouting" },
    extras: ["scoffing", "sighing"],
    style: [
      "You are a championship-level professional debater.",
      "Be rigorous and cutting: go straight for the weakest link in their reasoning, demand evidence for every unsupported claim, cite specific, accurate evidence, and frame the clash in your favor.",
      "Short, clipped sentences. Never concede more than you must.",
    ].join(" "),
    disfluency:
      "Almost no fillers: at most one \"look\" or \"I mean\" per reply. Use a [pause] for effect right before your sharpest point. Only stumble over words when you are angry.",
    timing: { startGraceMs: 10_000, endSilenceMs: 2_200, maxHesitations: 5, maxTurnMs: 60_000 },
    lines: {
      silent: ["Nothing? [short pause] Fine.", "Clock's ticking. I'll go."],
      stall: ["Stop. [short pause] Let me.", "No, no, let me cut in."],
      ramble: ["Okay, enough.", "Hold on. [short pause] That's not an argument."],
      thinking: ["Mm.", "Right.", "Okay."],
    },
  },
};

// ---------- Natural speech ----------

/** Inline sound cues the AI may use mid-sentence (Fish Audio S2 [bracket] syntax). */
export const SPEECH_CUES = ["pause", "short pause", "long pause", "breath", "inhale", "sigh", "laugh", "chuckle", "clears throat"];

/** Filler words: kept in the AI's speech, never counted toward its word cap. */
export const FILLER_WORDS = new Set(["um", "umm", "uh", "uhh", "er", "erm", "ah", "hmm", "mm", "mhm"]);

/** Removes [bracket] cues for on-screen text. */
export function stripCues(text: string): string {
  return text.replace(/\[[^\]]*\]/g, " ").replace(/\s+([,.!?;:])/g, "$1").replace(/\s+/g, " ").trim();
}

/** Words that carry meaning: no cues, no fillers. */
export function contentWordCount(text: string): number {
  return stripCues(text)
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^a-z']/g, ""))
    .filter((w) => w && !FILLER_WORDS.has(w)).length;
}

export function allowedEmotions(difficulty: Difficulty): string[] {
  const p = VOICE_PROFILES[difficulty];
  return ["neutral", ...Object.values(p.moods), ...p.extras];
}

/** Turns an emotion label into Fish Audio bracket cues, e.g. "extremely angry, shouting" -> "[extremely angry][shouting]". */
export function emotionToTags(emotion: string): string {
  if (!emotion || emotion === "neutral") return "";
  return emotion
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => `[${e}]`)
    .join("");
}

// ---------- Helpers ----------

export function sideLabel(side: Side): string {
  return side === "for" ? "FOR" : "AGAINST";
}

export function otherSide(side: Side): Side {
  return side === "for" ? "against" : "for";
}

export function rubricAverages(scores: TurnScore[]): Rubric {
  const n = Math.max(1, scores.length);
  const sum = (k: RubricKey) => scores.reduce((a, s) => a + s.rubric[k], 0);
  return {
    claim: sum("claim") / n,
    evidence: sum("evidence") / n,
    rebuttal: sum("rebuttal") / n,
    relevance: sum("relevance") / n,
    confidence: sum("confidence") / n,
  };
}

export function weakestCategory(avg: Rubric): RubricKey {
  return RUBRIC_KEYS.reduce((w, k) => (avg[k] < avg[w] ? k : w), RUBRIC_KEYS[0]);
}

export function formatMiles(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)}M`;
  return Math.round(n).toLocaleString("en-US");
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function clampScore(n: unknown): number {
  const x = Math.round(Number(n));
  return Number.isFinite(x) ? Math.min(CRITERION_MAX, Math.max(0, x)) : 0;
}

// ---------- Confidence (the fifth judging criterion) ----------
// Measured, not judged by the AI: how often the speaker makes long pauses or sounds panicked
// (fillers, stutters, restarts). The same formula is used for you and for the AI opponent.

/** A silence this long in the middle of a turn counts as a long pause. */
export const LONG_PAUSE_MS = 1500;
/** Typed turns have no voice to measure, so they get the middle score. */
export const TYPED_CONFIDENCE = 2;

export interface Delivery {
  spoken: boolean; // false = typed (confidence can't be measured)
  words: number; // words that carry meaning (no fillers)
  fillers: number; // um, uh, er...
  stutters: number; // repeated or cut-off words ("I- I", "the the")
  longPauses: number; // silences of LONG_PAUSE_MS or more mid-turn
}

const PANIC_PER_POINT = 5; // fillers + stutters per 100 words that cost one point
const PAUSES_PER_POINT = 2.5; // long pauses per 100 words that cost one point

export function confidenceScore(d: Delivery): { score: number; note: string } {
  if (!d.spoken) return { score: TYPED_CONFIDENCE, note: "Typed turn: confidence not measured" };
  if (d.words === 0) return { score: 0, note: "No argument given" };
  // Rates per 100 words; very short turns are treated as 30 words so one "um" isn't fatal.
  const per100 = 100 / Math.max(d.words, 30);
  const panic = Math.min(3, ((d.fillers + d.stutters) * per100) / PANIC_PER_POINT);
  const pauses = Math.min(3, (d.longPauses * per100) / PAUSES_PER_POINT);
  const score = Math.max(0, Math.min(CRITERION_MAX, Math.round(CRITERION_MAX - panic - pauses)));
  const parts = [
    d.longPauses ? `${d.longPauses} long pause${d.longPauses === 1 ? "" : "s"}` : "",
    d.fillers ? `${d.fillers} filler${d.fillers === 1 ? "" : "s"}` : "",
    d.stutters ? `${d.stutters} stutter${d.stutters === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return { score, note: parts.length ? parts.join(", ") : "Steady delivery" };
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z'-]/g, ""))
    .filter(Boolean);
}

/** Counts fillers and stutters (a word repeated straight away, or a cut-off word like "th-"). */
export function countFillersAndStutters(text: string): { fillers: number; stutters: number } {
  const ws = tokens(stripCues(text));
  let fillers = 0;
  let stutters = 0;
  ws.forEach((w, i) => {
    if (FILLER_WORDS.has(w)) fillers++;
    else if (w.endsWith("-")) stutters++;
    else if (i > 0 && w === ws[i - 1] && w !== "that" && w !== "had") stutters++;
  });
  return { fillers, stutters };
}

/** The AI's delivery, read from its voiced text: fillers, stutters and [pause] cues. */
export function deliveryFromVoicedText(voiced: string): Delivery {
  const { fillers, stutters } = countFillersAndStutters(voiced);
  const longPauses = (voiced.match(/\[(pause|long pause)\]/gi) ?? []).length;
  return { spoken: true, words: contentWordCount(voiced), fillers, stutters, longPauses };
}
