"use client";
import type { CutoffReason, GameConfig, Mood, OpponentResult, OpponentSentence, OpponentStreamEvent } from "@/lib/game";

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Reads the opponent's streamed reply, calling `onSentence` as each sentence arrives. */
export async function streamOpponent(
  body: {
    config: GameConfig;
    history: { user: string; ai: string; aiCutOff?: boolean }[];
    userText: string;
    mood: Mood;
    turn?: { cutoff?: CutoffReason; interjection?: string };
  },
  onSentence: (s: OpponentSentence) => void,
): Promise<OpponentResult> {
  const res = await fetch("/api/opponent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }

  const sentences: OpponentSentence[] = [];
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as OpponentStreamEvent;
      if (event.type === "sentence") {
        sentences.push(event.sentence);
        onSentence(event.sentence);
      } else if (event.type === "error") {
        throw new Error(event.error);
      } else {
        return { sentences, text: event.text, speed: event.speed };
      }
    }
    if (done) break;
  }
  throw new Error("Opponent reply ended early");
}
