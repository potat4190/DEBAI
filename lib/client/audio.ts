"use client";
// Sentence-by-sentence playback of the AI opponent's voice. Each clip is requested as soon as its sentence is
// known, so the next one is usually ready by the time the previous one finishes (no dead air).

export interface SpeakLine {
  text: string; // opponent sentence, with Fish Audio cues
  speed: number;
}

let muted = false;
let current: HTMLAudioElement | null = null;
let generation = 0; // bumps on stop() so in-flight queues abort

export function setMuted(value: boolean) {
  muted = value;
  if (value) stopAudio();
}

export function isMuted() {
  return muted;
}

/** Stops whatever is playing and cancels every queue that is still running. */
export function stopAudio() {
  generation++;
  current?.pause();
  current = null;
}

// Fish Audio allows only a few requests at once per account (5 on the Starter tier, shared with
// speech-to-text), so voice requests wait in line here. The AI's live reply jumps the queue;
// pre-voiced lines fill in the gaps.
const MAX_TTS_IN_FLIGHT = 3;
let inFlight = 0;
const waiting: { run: () => void; urgent: boolean }[] = [];

function nextInLine() {
  while (inFlight < MAX_TTS_IN_FLIGHT && waiting.length) {
    const i = waiting.findIndex((w) => w.urgent);
    const [job] = waiting.splice(i >= 0 ? i : 0, 1);
    inFlight++;
    job.run();
  }
}

function limited<T>(task: () => Promise<T>, urgent: boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push({
      urgent,
      run: () =>
        task()
          .then(resolve, reject)
          .finally(() => {
            inFlight--;
            nextInLine();
          }),
    });
    nextInLine();
  });
}

/**
 * Fetches one voiced line and returns an object URL for it (null when voice is off or it failed).
 * `background` lines (pre-voiced clips) wait behind the AI's live reply.
 */
export function fetchClip(line: SpeakLine, background = false): Promise<string | null> {
  return limited(() => requestClip(line), !background);
}

async function requestClip(line: SpeakLine): Promise<string | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(line),
    });
    if (res.status !== 200) return null; // 204 = voice not configured
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

function play(url: string, revoke: boolean): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    current = audio;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      if (revoke) URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.onpause = done;
    audio.play().catch(done);
  });
}

interface QueueItem {
  url: Promise<string | null>;
  keep: boolean; // a reusable pre-voiced clip: don't revoke its URL after playing
}

export interface SpeechQueue {
  /** Adds a line; its audio starts downloading right away. */
  push(line: SpeakLine): void;
  /** Adds a pre-voiced clip (kept for reuse after it plays). It may still be downloading. */
  pushClip(url: Promise<string | null>): void;
  /** No more lines are coming. */
  close(): void;
  /** Resolves when every queued item has played (or playback was stopped). */
  done: Promise<void>;
}

/**
 * A queue that plays items in order while more are still being added.
 * `onPlay(i)` fires when item i starts playing (items count from 0 in the order they were added).
 */
export function createSpeechQueue(onPlay?: (index: number) => void): SpeechQueue {
  const gen = generation;
  const items: QueueItem[] = [];
  let closed = false;
  let wake: (() => void) | null = null;
  const nudge = () => {
    wake?.();
    wake = null;
  };

  const done = (async () => {
    let i = 0;
    for (;;) {
      if (i < items.length) {
        const index = i++;
        const item = items[index];
        const url = await item.url;
        if (gen !== generation || muted) {
          if (url && !item.keep) URL.revokeObjectURL(url);
          if (gen !== generation) return; // stopped: abandon the rest
          continue;
        }
        if (url) {
          onPlay?.(index);
          await play(url, !item.keep);
        }
        continue;
      }
      if (closed) return;
      await new Promise<void>((r) => (wake = r));
    }
  })();

  return {
    push(line) {
      if (closed) return;
      // Muted or empty lines still take a slot, so item indexes match the order they were added.
      const skip = muted || !line.text.trim();
      items.push({ url: skip ? Promise.resolve(null) : fetchClip(line), keep: false });
      nudge();
    },
    pushClip(url) {
      if (closed) return;
      items.push({ url: muted ? Promise.resolve(null) : url, keep: true });
      nudge();
    },
    close() {
      closed = true;
      nudge();
    },
    done,
  };
}
