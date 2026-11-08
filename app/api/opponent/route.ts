import { NextResponse } from "next/server";
import {
  allowedEmotions,
  contentWordCount,
  emotionToTags,
  SPEECH_CUES,
  stripCues,
  VOICE_PROFILES,
  type GameConfig,
  type Mood,
  type OpponentSentence,
  type OpponentStreamEvent,
} from "@/lib/game";
import { hasGemini, streamJsonItems } from "@/lib/server/gemini";
import { mockOpponentStream } from "@/lib/server/mock";
import {
  OPPONENT_WORD_CAP,
  opponentPrompt,
  opponentSchema,
  opponentSystem,
  type HistoryTurn,
  type TurnContext,
} from "@/lib/server/prompts";

interface Body {
  config: GameConfig;
  history: HistoryTurn[];
  userText: string;
  mood: Mood;
  turn?: TurnContext;
}

const ALLOWED_CUES = new Set(SPEECH_CUES);

/** Keeps the allowed inline sound cues ([pause], [breath]...) and drops any other bracketed text. */
function cleanCues(text: string): string {
  const kept: string[] = [];
  return text
    .replace(/\[([^\]]*)\]/g, (_, cue: string) => {
      const c = cue.trim().toLowerCase();
      if (!ALLOWED_CUES.has(c)) return " ";
      kept.push(c);
      return `\u0000${kept.length - 1}\u0000`; // placeholder, so the stray-bracket sweep below can't touch it
    })
    .replace(/[[\]]/g, "")
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => `[${kept[Number(i)]}]`)
    .replace(/\s+/g, " ")
    .trim();
}

type RawSentence = { text?: string; emotion?: string };

/**
 * Streams the opponent's reply as NDJSON, one sentence per line, so the client can show
 * and voice each sentence while Gemini is still writing the next (no dead air).
 */
export async function POST(req: Request) {
  const { config, history, userText, mood, turn } = (await req.json()) as Body;
  const simulated = !hasGemini();

  const source: AsyncGenerator<RawSentence> = simulated
    ? mockOpponentStream(config, mood, userText ?? "")
    : streamJsonItems<RawSentence>({
        system: opponentSystem(config, mood),
        prompt: opponentPrompt(history ?? [], userText ?? "", turn),
        schema: opponentSchema,
        temperature: 0.9,
        thinking: "minimal",
      });

  // Wait for the first sentence before answering, so an upstream failure (quota, overload)
  // still returns a clean 502 instead of a broken stream.
  let first: IteratorResult<RawSentence>;
  try {
    first = await source.next();
  } catch (err) {
    console.error("[opponent]", err);
    return NextResponse.json({ error: "Opponent failed to respond" }, { status: 502 });
  }

  // Enforce the spoken-length cap and the allowed emotion list, then add Fish Audio cues.
  const allowed = new Set(allowedEmotions(config.difficulty));
  const sentences: OpponentSentence[] = [];
  let words = 0;
  function accept(s: RawSentence): OpponentSentence | "skip" | "stop" {
    const spoken = cleanCues(s.text ?? ""); // with fillers and [pause]-style cues, for the voice
    const text = stripCues(spoken); // with fillers, without cues, for the screen and the judge
    if (!text) return "skip";
    // Fillers and cues don't count toward the cap, so a hesitant voice doesn't cut the point short.
    const n = contentWordCount(spoken);
    if (words + n > OPPONENT_WORD_CAP + 15 && sentences.length > 0) return "stop";
    words += n;
    const emotion = s.emotion && allowed.has(s.emotion) ? s.emotion : "neutral";
    const tags = emotionToTags(emotion);
    const sentence = { text, emotion, tagged: tags ? `${tags} ${spoken}` : spoken };
    sentences.push(sentence);
    return sentence;
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: OpponentStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false; // the listener went away (tab closed or reloaded)
        }
      };
      try {
        let next = first;
        while (!next.done) {
          const sentence = accept(next.value);
          if (sentence === "stop") break; // spoken-length cap reached
          if (sentence !== "skip") send({ type: "sentence", sentence });
          next = await source.next();
        }
        await source.return(undefined);
        if (sentences.length === 0) throw new Error("empty reply");
        send({
          type: "done",
          text: sentences.map((s) => s.text).join(" "),
          speed: VOICE_PROFILES[config.difficulty].speed,
          simulated,
        });
      } catch (err) {
        if (open) console.error("[opponent] stream", err);
        send({ type: "error", error: "Opponent stopped mid-reply" });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
