import "server-only";
import { Type, type Schema } from "@google/genai";
import {
  allowedEmotions,
  CRITERION_MAX,
  MAX_SCORE,
  otherSide,
  sideLabel,
  SPEECH_CUES,
  VOICE_PROFILES,
  type CutoffReason,
  type GameConfig,
  type Mood,
  type RubricKey,
} from "@/lib/game";

// Spoken words per reply (fillers and cues don't count): about 30 seconds of talking, so the
// debate feels like a back-and-forth conversation and the AI can't win on volume.
export const OPPONENT_WORD_CAP = 75;

export interface HistoryTurn {
  user: string;
  ai: string;
  /** The human talked over the AI and cut this turn short. */
  aiCutOff?: boolean;
}

/** What happened at the end of the human's latest turn. */
export interface TurnContext {
  /** The AI cut the human off, and why. */
  cutoff?: CutoffReason;
  /** The line the AI already said when it cut in. */
  interjection?: string;
}

// ---------- Opponent ----------

const MOOD_HINTS: Record<Mood, string> = {
  winning: "You are ahead. Sound assured and press your advantage.",
  even: "The debate is close. Stay composed and sharp.",
  losing: "You are falling behind. Let some frustration show and push back harder on substance.",
  heated: "You are badly behind and fired up. This is a rare heated moment: be forceful and emphatic.",
};

export function opponentSystem(config: GameConfig, mood: Mood): string {
  const profile = VOICE_PROFILES[config.difficulty];
  const aiSide = sideLabel(otherSide(config.side));
  const userSide = sideLabel(config.side);
  const moodEmotion = profile.moods[mood];
  return [
    `You are the AI opponent in DebAI, a live spoken debate practice game. It should feel like a real back-and-forth conversation, not alternating speeches.`,
    `Motion: "${config.motion}"`,
    `You argue ${aiSide} the motion. Your human opponent argues ${userSide}.`,
    profile.style,
    `Current mood: ${mood}. ${MOOD_HINTS[mood]}`,
    `How to talk:`,
    `- Respond to the substance of their latest point, then make one point of your own. You remember the whole debate, so build on it naturally instead of recapping.`,
    `- Do NOT quote or repeat their words back to them. Never open with "You said", "Wait, you said", "So you're saying" or similar. If you need to refer to their point, paraphrase it in a few words at most, and only now and then.`,
    `- Vary how you start: don't begin two replies the same way. Look at your earlier replies and avoid their openings.`,
    `- Keep it short: 2 to 4 sentences, at most ${OPPONENT_WORD_CAP} words not counting fillers. One idea per reply, like a real conversation.`,
    `- Sometimes concede a small point before pushing back, or end on a pointed question for them. Use contractions.`,
    `- ${profile.disfluency}`,
    `- Write the fillers and stutters into the text itself, exactly as they should be spoken ("I- I think", "it's, um, not that simple").`,
    `- The only bracket cues allowed inside a sentence are: ${SPEECH_CUES.map((c) => `[${c}]`).join(", ")}. No other brackets, lists, markdown or stage directions.`,
    `- Attack arguments, never the person. No insults, even when angry.`,
    `Output:`,
    `- Return JSON: {"sentences":[{"text":"...","emotion":"..."}]}, one entry per sentence.`,
    `- "emotion" must be one of: ${allowedEmotions(config.difficulty).map((e) => `"${e}"`).join(", ")}.`,
    `- Give the sentences that carry the mood "${moodEmotion}"; use "neutral" for the rest. One emotion per sentence.`,
  ].join("\n");
}

const CUTOFF_NOTES: Record<CutoffReason, string> = {
  silent: "The human didn't start talking, so you jumped in",
  stall: "The human kept hesitating, so you cut them off mid-turn",
  ramble: "The human was going on too long, so you cut them off mid-turn",
};

export function opponentPrompt(history: HistoryTurn[], userText: string, turn: TurnContext = {}): string {
  const lines: string[] = [];
  history.forEach((t, i) => {
    lines.push(`[Exchange ${i + 1}] Human: ${t.user || "(said nothing)"}`);
    lines.push(`[Exchange ${i + 1}] You: ${t.ai}${t.aiCutOff ? " — (the human talked over you and cut you off here)" : ""}`);
  });
  lines.push(`[Exchange ${history.length + 1}] Human: ${userText || "(The human said nothing this turn.)"}`);
  if (turn.cutoff) {
    lines.push(
      `(${CUTOFF_NOTES[turn.cutoff]}. You already said: "${turn.interjection ?? ""}". Carry on straight from there without repeating it.)`,
    );
  }
  const last = history[history.length - 1];
  if (last?.aiCutOff) lines.push(`(They cut you off last time. You may briefly pick up where you were, if it still matters.)`);
  lines.push(`Write your reply for exchange ${history.length + 1}.`);
  return lines.join("\n");
}

export const opponentSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    sentences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING }, emotion: { type: Type.STRING } },
        required: ["text", "emotion"],
      },
    },
  },
  required: ["sentences"],
};

// ---------- Distiller (bias safeguard) ----------

export interface Distilled {
  claims: string[];
  evidence: string[];
  rebuttals: string[];
  /** Reasoning problems (non sequiturs, false facts, dodges), never style. */
  problems: string[];
}

/** Most bullets kept per category, so a long turn can't win by repeating itself. */
export const DISTILL_MAX_BULLETS = 3;

export const DISTILL_SYSTEM = [
  "You rewrite ONE debate turn as short bullet points so a judge scores the ideas, not the delivery.",
  "List its claims, its evidence (facts, statistics, examples, causal reasoning) and its rebuttals of the OPPOSING POINT, if one is given.",
  "Write every bullet in the same plain, neutral register, at most 15 words, whatever the original sounded like: a messy spoken turn and a polished one must come out looking alike if they make the same points.",
  "Fix spelling, grammar and speech-to-text errors, and drop filler, tone, rhetoric and repetition. Merge points that say the same thing.",
  "Never repair the reasoning. Keep every point exactly as strong or as weak as it was: if it is vague, confused, unsupported or doesn't follow, the bullet stays that way. Don't add, strengthen or complete anything.",
  "Only list a rebuttal when the turn gives a reason against the opposing point. A bare denial ('that's not true', 'no way') becomes 'Denies <the point>, gives no reason'.",
  "A vague appeal (tradition, values, 'everyone knows', 'I heard') is a claim, not evidence. A single personal story is weak evidence: start that bullet with 'Anecdote:'.",
  `Keep at most ${DISTILL_MAX_BULLETS} bullets per category; if there are more, keep the strongest ones.`,
  "In 'problems', name up to 3 real reasoning problems, about 12 words each: a conclusion that doesn't follow, a contradiction, circular reasoning, a clearly false fact or a made-up number, answering a different point than the one raised, or drifting off the motion. Never list grammar, wording, fillers or style. Use an empty array when the reasoning is sound.",
  "Use empty arrays when the turn has none of something.",
].join("\n");

/** Each turn is distilled in its own call, so no turn is processed as "the reply" to another. */
export function distillPrompt(turn: string, opposingPoint: string | null): string {
  return [
    `OPPOSING POINT (what this turn may answer): ${opposingPoint ?? "(none: this is an opening statement)"}`,
    `TURN: ${turn.trim() || "(no argument given)"}`,
  ].join("\n\n");
}

export const distillSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    claims: { type: Type.ARRAY, items: { type: Type.STRING } },
    evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
    rebuttals: { type: Type.ARRAY, items: { type: Type.STRING } },
    problems: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["claims", "evidence", "rebuttals", "problems"],
};

// ---------- Judge ----------

export const JUDGE_SYSTEM = [
  "You are an impartial debate judge. Two anonymous debaters, Speaker 1 and Speaker 2, each made one turn.",
  "Their turns were rewritten as neutral bullet points, with any reasoning problems listed under 'Problems'. Judge ONLY the substance: what each debater argued, whether it makes sense, how well it is supported and how well it answers the other side.",
  "",
  "Completely ignore, and never reward or penalize:",
  "- grammar, spelling, punctuation and word choice",
  "- sentence structure, fluency and how polished, formal, confident or rhetorical it sounds",
  "- which speaker is listed first and which number they have",
  "",
  "How to weigh the points:",
  "- A point must make sense to earn credit. A conclusion that doesn't follow, a contradiction, circular reasoning, a clearly false fact or a made-up number earns little or nothing, however confidently it was stated. Take the 'Problems' list seriously.",
  "- A bare denial is not a rebuttal. A rebuttal earns credit only for the reason it gives against the point it answers.",
  "- Count every sound, distinct point: two or three sound, relevant points beat one point of the same quality, and one sound point beats several confused ones. Repetition and padding add nothing.",
  "- A short, plain point backed by a real fact or a clear reason scores as high as a long, polished one.",
  "",
  "Score each debater on four criteria, 0 to 4 each (0 = missing or nonsensical, 1 = weak, 2 = adequate, 3 = strong, 4 = excellent):",
  "- claim: Are the points clear, coherent and on topic?",
  "- evidence: Are they backed by real facts, examples or sound reasoning? Unsupported assertions, a lone anecdote and vague appeals score low.",
  "- rebuttal: Does it directly answer the point listed under 'Answering', with a reason? Judge how well it defeats that point.",
  "- relevance: Does it bear on the motion rather than a side issue?",
  "If a debater's 'Answering' is 'nothing', give them rebuttal 2.",
  "Use the same standard for both debaters. Before you answer, check: would the scores flip if the two debaters swapped places? If not, fix them.",
  "",
  "'notes' explains each of that debater's four scores in a short phrase (at most 14 words) about the points themselves, with no names or pronouns, e.g. evidence: \"Cites a real study, but the number is vague.\" If their 'Answering' is 'nothing', the rebuttal note is \"Opening statement: nothing to answer yet.\"",
  "Flag an obvious logical fallacy (straw man, ad hominem, false dilemma, slippery slope, etc.) by name in 'fallacy'; use an empty string if none. Clumsy wording is never a fallacy.",
  "'reason' is ONE short line about that debater's points, addressed to them in the second person, e.g. \"You asserted harm without evidence.\" Never comment on their grammar or style.",
  "'winningSummary' is one sentence summarizing the stronger argument, without naming the speaker.",
  "'verdict' is one line explaining the scores in terms of the points made; refer to the debaters as Speaker 1 and Speaker 2.",
].join("\n");

function bullets(d: Distilled): string {
  const part = (label: string, xs: string[] | undefined) =>
    `${label}: ${xs?.length ? xs.slice(0, DISTILL_MAX_BULLETS).map((x) => `\n  - ${x}`).join("") : "(none)"}`;
  return [part("Claims", d.claims), part("Evidence", d.evidence), part("Rebuttals", d.rebuttals), part("Problems", d.problems)].join("\n");
}

/** One debater as the judge sees them: their side, the opposing point they had to answer, and their own points. */
export interface JudgeEntry {
  side: string;
  answering: Distilled | null; // null = nothing to answer (opening statement)
  turn: Distilled;
}

function answeringBlock(d: Distilled | null): string {
  if (!d) return "nothing (opening statement)";
  const points = [...d.claims, ...d.evidence].slice(0, DISTILL_MAX_BULLETS * 2);
  return points.length ? points.map((x) => `\n  - ${x}`).join("") : "nothing (the other side made no argument)";
}

export function judgePrompt(motion: string, speaker1: JudgeEntry, speaker2: JudgeEntry): string {
  const block = (label: string, e: JudgeEntry) =>
    `${label} (argues ${e.side}):\nAnswering: ${answeringBlock(e.answering)}\n${bullets(e.turn)}`;
  return [`MOTION: "${motion}"`, block("SPEAKER 1", speaker1), block("SPEAKER 2", speaker2)].join("\n\n");
}

const turnScoreSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    claim: { type: Type.INTEGER, minimum: 0, maximum: CRITERION_MAX },
    evidence: { type: Type.INTEGER, minimum: 0, maximum: CRITERION_MAX },
    rebuttal: { type: Type.INTEGER, minimum: 0, maximum: CRITERION_MAX },
    relevance: { type: Type.INTEGER, minimum: 0, maximum: CRITERION_MAX },
    notes: {
      type: Type.OBJECT,
      properties: {
        claim: { type: Type.STRING },
        evidence: { type: Type.STRING },
        rebuttal: { type: Type.STRING },
        relevance: { type: Type.STRING },
      },
      required: ["claim", "evidence", "rebuttal", "relevance"],
    },
    reason: { type: Type.STRING },
    fallacy: { type: Type.STRING },
  },
  required: ["claim", "evidence", "rebuttal", "relevance", "notes", "reason", "fallacy"],
};

export const judgeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    speaker1: turnScoreSchema,
    speaker2: turnScoreSchema,
    winningSummary: { type: Type.STRING },
    verdict: { type: Type.STRING },
  },
  required: ["speaker1", "speaker2", "winningSummary", "verdict"],
};

/** The four criteria the judge scores (confidence is measured, not judged). */
export type JudgedKey = Exclude<RubricKey, "confidence">;
export const JUDGED_KEYS: JudgedKey[] = ["claim", "evidence", "rebuttal", "relevance"];

export interface RawTurnScore {
  claim: number;
  evidence: number;
  rebuttal: number;
  relevance: number;
  notes?: Partial<Record<JudgedKey, string>>;
  reason: string;
  fallacy: string;
}

export interface RawJudge {
  speaker1: RawTurnScore;
  speaker2: RawTurnScore;
  winningSummary: string;
  verdict: string;
}

// ---------- Post-debate report ----------

export interface ReportExchange {
  index: number;
  userText: string;
  aiText: string;
  userScore: number;
  aiScore: number;
  userReason: string;
  userFallacy: string | null;
}

export const REPORT_SYSTEM = [
  "You are a supportive but honest debate coach writing a post-debate report for a student.",
  "Address the student as 'you'. Be specific and quote their words where useful.",
  "Return JSON with:",
  "- strongPoints: 1-3 sentences on their strongest arguments.",
  "- weakestExplanation: 1-3 sentences on why their weakest rubric category held them back.",
  "- rewrite: pick one of their weaker arguments; 'original' quotes it (trim to about 40 words), 'improved' rebuilds it to be stronger in the weakest category.",
  "- fallacies: logical fallacies the student committed, each with name, exchange number and a short quote. Empty array if none.",
  "- exercise: one 60-second practice drill targeting the weakest category, e.g. \"Back this claim with two pieces of evidence in 60 seconds: ...\".",
  "Categories: claim, evidence, rebuttal and relevance judge the points made. confidence is measured from the student's voice: long pauses, filler words and stutters (typed turns get a neutral 2). Each category is scored 0 to 4. If confidence is weakest, coach delivery: slowing down, pausing silently instead of saying 'um', and preparing a first sentence.",
].join("\n");

export function reportPrompt(
  config: GameConfig,
  exchanges: ReportExchange[],
  weakest: RubricKey,
  weakestAvg: number,
): string {
  const lines = [
    `MOTION: "${config.motion}"`,
    `STUDENT SIDE: ${sideLabel(config.side)}`,
    `WEAKEST CATEGORY: ${weakest} (average ${weakestAvg.toFixed(1)} / ${CRITERION_MAX})`,
    "",
    "TRANSCRIPT:",
  ];
  for (const e of exchanges) {
    lines.push(
      `Exchange ${e.index}: STUDENT (${e.userScore}/${MAX_SCORE}, judge: "${e.userReason}"${e.userFallacy ? `, fallacy: ${e.userFallacy}` : ""}): ${e.userText}`,
    );
    lines.push(`Exchange ${e.index}: OPPONENT (${e.aiScore}/${MAX_SCORE}): ${e.aiText}`);
  }
  return lines.join("\n");
}

export const reportSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    strongPoints: { type: Type.STRING },
    weakestExplanation: { type: Type.STRING },
    rewrite: {
      type: Type.OBJECT,
      properties: { original: { type: Type.STRING }, improved: { type: Type.STRING } },
      required: ["original", "improved"],
    },
    fallacies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, exchange: { type: Type.INTEGER }, quote: { type: Type.STRING } },
        required: ["name", "exchange", "quote"],
      },
    },
    exercise: { type: Type.STRING },
  },
  required: ["strongPoints", "weakestExplanation", "rewrite", "fallacies", "exercise"],
};
