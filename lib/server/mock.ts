import "server-only";
// Simulation mode: used when GEMINI_API_KEY is not set, so the whole loop is playable offline.
// The judge here is a crude keyword heuristic, not a real evaluation.

import {
  CRITERION_MAX,
  otherSide,
  sideLabel,
  VOICE_PROFILES,
  type GameConfig,
  type Mood,
  type RubricKey,
} from "@/lib/game";
import type { RawJudge, RawTurnScore, ReportExchange } from "./prompts";

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function mockOpponent(config: GameConfig, mood: Mood, userText: string): { text: string; emotion: string }[] {
  const profile = VOICE_PROFILES[config.difficulty];
  const aiSide = sideLabel(otherSide(config.side)).toLowerCase();
  const snippet = userText.split(/\s+/).slice(0, 8).join(" ");
  const openers = [
    snippet ? `You claim "${snippet}…", but that skips the hardest part of the question.` : "You haven't actually made an argument yet.",
    "That sounds persuasive until you look at who bears the cost.",
    "My opponent is answering a question nobody asked.",
  ];
  const bodies = [
    `I stand ${aiSide} the motion because the practical consequences outweigh the ideals.`,
    "Look at what happens at scale: small harms multiply into large ones.",
    "History shows that policies like this rarely deliver what their supporters promise.",
    "There is a simpler solution that avoids these trade-offs entirely.",
  ];
  const closers = ["Until you answer that, my case stands.", "So the burden is still on you.", "That is why this motion fails."];
  return [
    { text: pick(openers), emotion: profile.moods[mood] },
    { text: pick(bodies), emotion: "neutral" },
    { text: pick(bodies), emotion: "neutral" },
    { text: pick(closers), emotion: mood === "even" ? "neutral" : profile.moods[mood] },
  ];
}

/** Streams the canned reply one sentence at a time, like the real opponent. */
export async function* mockOpponentStream(config: GameConfig, mood: Mood, userText: string) {
  for (const s of mockOpponent(config, mood, userText)) {
    await new Promise((r) => setTimeout(r, 350));
    yield s;
  }
}

function heuristic(text: string, motion: string, hasContext: boolean): RawTurnScore {
  const t = text.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;
  const count = (re: RegExp) => (t.match(re) ?? []).length;
  const motionWords = motion.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const overlap = motionWords.filter((w) => t.includes(w)).length;

  const claim = Math.min(CRITERION_MAX, (words > 10 ? 2 : words > 0 ? 1 : 0) + (words > 35 ? 1 : 0) + Math.min(2, count(/\b(because|therefore|so|which means)\b/g)));
  const evidence = Math.min(CRITERION_MAX, count(/\b(for example|for instance|studies|study|research|data|evidence|percent|according)\b|%|\d/g));
  const rebuttal = hasContext
    ? Math.min(CRITERION_MAX, count(/\b(but|however|you said|my opponent|ignores|on the contrary|that assumes|doesn't)\b/g) * 2)
    : 2;
  const relevance = Math.min(CRITERION_MAX, words === 0 ? 0 : 1 + overlap);
  const reasons: Record<Exclude<RubricKey, "confidence">, string> = {
    claim: "Your main point was hard to pin down.",
    evidence: "You asserted without evidence.",
    rebuttal: "You didn't answer their last point.",
    relevance: "You drifted away from the motion.",
  };
  const scores: Record<Exclude<RubricKey, "confidence">, number> = { claim, evidence, rebuttal, relevance };
  const weakest = (Object.keys(scores) as (keyof typeof scores)[]).reduce((a, b) => (scores[b] < scores[a] ? b : a));
  return { ...scores, reason: words === 0 ? "You didn't make an argument this turn." : reasons[weakest], fallacy: "" };
}

export function mockJudge(motion: string, context: string | null, userText: string, aiText: string): RawJudge {
  const s1 = heuristic(userText, motion, Boolean(context));
  // Canned opponent: middling scores with a little noise.
  const n = () => Math.max(1, Math.min(CRITERION_MAX, 2 + Math.round(Math.random() * 2 - 1)));
  const s2: RawTurnScore = { claim: n(), evidence: n(), rebuttal: n(), relevance: n(), reason: "You stated a position but offered little support.", fallacy: "" };
  const t1 = s1.claim + s1.evidence + s1.rebuttal + s1.relevance;
  const t2 = s2.claim + s2.evidence + s2.rebuttal + s2.relevance;
  void aiText;
  return {
    speaker1: s1,
    speaker2: s2,
    winningSummary: t1 >= t2 ? (userText.slice(0, 140) || "No argument given.") : "The opponent argued that the practical costs outweigh the ideals.",
    verdict: `SIMULATION: Speaker 1 scored ${t1}, Speaker 2 scored ${t2} on keyword heuristics.`,
  };
}

export function mockReport(exchanges: ReportExchange[], weakest: RubricKey) {
  const weakestTurn = [...exchanges].sort((a, b) => a.userScore - b.userScore)[0];
  const drills: Record<RubricKey, string> = {
    claim: "State your position in one sentence, then restate it three different ways in 60 seconds.",
    evidence: "Back your strongest claim with two pieces of evidence in 60 seconds.",
    rebuttal: "Read one of the opponent's points aloud, then answer it directly in 60 seconds.",
    relevance: "Explain in 60 seconds how each of your points proves or disproves the motion.",
    confidence: "Argue one point for 60 seconds without saying \"um\" or stopping for more than a second. Slow down instead of filling silence.",
  };
  return {
    strongPoints: "SIMULATION MODE: add a GEMINI_API_KEY for a real coaching report. Your longest turns scored best.",
    weakestExplanation: `Your ${weakest} scores were lowest on average, which capped how fast your rocket could accelerate.`,
    rewrite: {
      original: weakestTurn?.userText.slice(0, 240) || "(no argument)",
      improved: "Lead with one clear claim, give a concrete example or statistic, and finish by answering the opponent's last point.",
    },
    fallacies: [],
    exercise: drills[weakest],
  };
}
