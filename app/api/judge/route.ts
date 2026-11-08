import { NextResponse } from "next/server";
import {
  clampScore,
  confidenceScore,
  contentWordCount,
  CRITERION_MAX,
  countFillersAndStutters,
  deliveryFromVoicedText,
  otherSide,
  sideLabel,
  vehiclesFor,
  type Delivery,
  type DestinationId,
  type JudgeResult,
  type Side,
  type TurnScore,
} from "@/lib/game";
import { generateJson, hasGemini, JUDGE_MODEL } from "@/lib/server/gemini";
import { mockJudge } from "@/lib/server/mock";
import {
  DISTILL_SYSTEM,
  distillPrompt,
  distillSchema,
  JUDGE_SYSTEM,
  judgePrompt,
  judgeSchema,
  type Distilled,
  type JudgeEntry,
  type RawJudge,
  type RawTurnScore,
} from "@/lib/server/prompts";

interface Body {
  motion: string;
  userSide: Side;
  context: string | null; // the AI's previous turn, which the user should rebut
  userText: string;
  aiText: string;
  /** How the user's turn sounded (measured in the browser). Missing = typed turn. */
  userDelivery?: Delivery;
  /** The AI's reply as it was voiced, with fillers and [pause] cues. */
  aiVoiced?: string;
  /** Picks the rocket names used in the verdict. */
  destination?: DestinationId;
}

// On the opening exchange the user has nothing to rebut, so neither side is scored on rebuttal:
// both get this fixed (middle) value. Otherwise the AI, which always answers the user, gets a free edge.
const OPENING_REBUTTAL = 2;

/** One judge pass. Labels are anonymous; `userFirst` decides who is shown as Speaker 1. */
interface Pass {
  raw: RawJudge;
  userFirst: boolean;
}

const userScore = (p: Pass) => (p.userFirst ? p.raw.speaker1 : p.raw.speaker2);
const aiScore = (p: Pass) => (p.userFirst ? p.raw.speaker2 : p.raw.speaker1);
const sum = (r: RawTurnScore, opening: boolean) =>
  clampScore(r.claim) + clampScore(r.evidence) + (opening ? OPENING_REBUTTAL : clampScore(r.rebuttal)) + clampScore(r.relevance);

interface Names {
  user: string;
  ai: string;
}

/** Replaces the anonymous labels with the on-screen rocket names. */
function relabel(s: string, userFirst: boolean, { user, ai }: Names): string {
  return (s ?? "")
    .replace(/\bspeakers\s*(1\s*and\s*2|2\s*and\s*1)\b/gi, "Both rockets")
    .replace(/\bboth\s+speakers\b/gi, "both rockets")
    .replace(/\bspeaker\s*1\b/gi, userFirst ? user : ai)
    .replace(/\bspeaker\s*2\b/gi, userFirst ? ai : user)
    .trim();
}

const hasFallacy = (r: RawTurnScore) => {
  const f = (r.fallacy ?? "").trim();
  return f && !/^(none|n\/a|no)$/i.test(f) ? f : null;
};

/**
 * Averages one debater's scores across the passes, criterion by criterion, and adds the
 * measured confidence score (the AI judge never sees delivery, only the points made).
 */
function combine(scores: RawTurnScore[], opening: boolean, delivery: Delivery): TurnScore {
  const avg = (k: "claim" | "evidence" | "relevance" | "rebuttal") =>
    clampScore(scores.reduce((a, s) => a + clampScore(s[k]), 0) / scores.length);
  const rubric = {
    claim: avg("claim"),
    evidence: avg("evidence"),
    rebuttal: opening ? OPENING_REBUTTAL : avg("rebuttal"),
    relevance: avg("relevance"),
    confidence: 0,
  };
  const confidence = confidenceScore(delivery);
  rubric.confidence = confidence.score;
  // A fallacy stalls the rocket, so it only counts when every pass flagged one.
  const fallacies = scores.map(hasFallacy);
  return {
    rubric,
    total: rubric.claim + rubric.evidence + rubric.rebuttal + rubric.relevance + rubric.confidence,
    delivery: confidence.note,
    reason: (scores[0].reason ?? "").trim(),
    fallacy: fallacies.every(Boolean) ? fallacies[0] : null,
  };
}

async function judgeWithGemini(body: Body): Promise<Pass[]> {
  const { motion, userSide, context, userText, aiText } = body;
  // Safeguard 1: each turn is rewritten as short, neutral bullet points in its own call (run in
  // parallel), so grammar, polish, length and speaking order never reach the judge.
  const distill = (turn: string, opposing: string | null) =>
    generateJson<Distilled>({
      system: DISTILL_SYSTEM,
      prompt: distillPrompt(turn, opposing),
      schema: distillSchema,
      temperature: 0,
      thinking: "minimal",
    });
  const [ctx, turn1, turn2] = await Promise.all([
    context ? distill(context, null) : Promise.resolve(null),
    distill(userText, context),
    // On the opening exchange both turns are distilled as standalone statements, so they're treated identically.
    distill(aiText, context ? userText : null),
  ]);
  const d = { context: ctx, turn1, turn2 };

  // Safeguard 2: each debater is shown with the exact point they had to answer. On the opening
  // exchange both turns are shown as standalone statements (rebuttals folded into claims), so the
  // AI doesn't look more engaged just because it spoke second.
  const standalone = (t: Distilled): Distilled => ({ claims: [...t.rebuttals, ...t.claims], evidence: t.evidence, rebuttals: [] });
  const user: JudgeEntry = context
    ? { side: sideLabel(userSide), answering: d.context, turn: d.turn1 }
    : { side: sideLabel(userSide), answering: null, turn: standalone(d.turn1) };
  const ai: JudgeEntry = context
    ? { side: sideLabel(otherSide(userSide)), answering: d.turn1, turn: d.turn2 }
    : { side: sideLabel(otherSide(userSide)), answering: null, turn: standalone(d.turn2) };

  // Safeguard 3: two independent judge passes with the speaker order swapped, averaged,
  // so neither debater benefits from being listed first or second.
  const run = (userFirst: boolean) =>
    generateJson<RawJudge>({
      system: JUDGE_SYSTEM,
      prompt: userFirst ? judgePrompt(motion, user, ai) : judgePrompt(motion, ai, user),
      schema: judgeSchema,
      temperature: 0.1,
      model: JUDGE_MODEL,
      thinking: "low",
    }).then((raw): Pass => ({ raw, userFirst }));

  const settled = await Promise.allSettled([run(true), run(false)]);
  const passes = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (!passes.length) throw (settled[0] as PromiseRejectedResult).reason;
  return passes;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const opening = !body.context;

  let passes: Pass[];
  try {
    passes = hasGemini()
      ? await judgeWithGemini(body)
      : [{ raw: mockJudge(body.motion, body.context, body.userText, body.aiText), userFirst: true }];
  } catch (err) {
    console.error("[judge]", err);
    return NextResponse.json({ error: "Judge failed to score the exchange" }, { status: 502 });
  }

  // Confidence: the user's turn is measured in the browser (long pauses from the mic, fillers and
  // stutters from the transcript and captions); the AI's is read from its voiced text.
  const userDelivery: Delivery = body.userDelivery?.spoken
    ? { ...body.userDelivery, words: contentWordCount(body.userText) }
    : { spoken: false, words: contentWordCount(body.userText), ...countFillersAndStutters(body.userText), longPauses: 0 };
  const aiDelivery = deliveryFromVoicedText(body.aiVoiced || body.aiText);

  const user = combine(passes.map(userScore), opening, userDelivery);
  const ai = combine(passes.map(aiScore), opening, aiDelivery);
  const winner = user.total > ai.total ? "user" : ai.total > user.total ? "ai" : "tie";

  // Take the wording from a pass whose own winner matches the combined result.
  const passWinner = (p: Pass) => {
    const u = sum(userScore(p), opening);
    const a = sum(aiScore(p), opening);
    return u > a ? "user" : a > u ? "ai" : "tie";
  };
  const voice = passes.find((p) => passWinner(p) === winner) ?? passes[0];

  const vehicles = vehiclesFor(body.destination ?? "moon");
  const names: Names = { user: vehicles.user.name, ai: vehicles.ai.name };
  const result: JudgeResult = {
    user,
    ai,
    winner,
    winningSummary: relabel(voice.raw.winningSummary, voice.userFirst, names),
    verdict: `${relabel(voice.raw.verdict, voice.userFirst, names)} Confidence: ${names.user} ${user.rubric.confidence}/${CRITERION_MAX}, ${names.ai} ${ai.rubric.confidence}/${CRITERION_MAX}.`,
  };
  return NextResponse.json(result);
}
