import "server-only";

// Fish Audio is used for exactly two things: the AI opponent's voice (TTS) and the
// user's spoken turn (speech-to-text).

const FISH_API = "https://api.fish.audio/v1";

// ---------- Key rotation ----------
// The team shares up to four Fish Audio keys. When one runs out of credits (402) or is
// rejected (401), the next key takes over and stays active for later requests.

function fishKeys(): string[] {
  const env = process.env;
  const keys = [
    ...(env.FISH_AUDIO_API_KEYS ?? "").split(","),
    env.FISH_AUDIO_API_KEY,
    env.FISH_AUDIO_API_KEY_2,
    env.FISH_AUDIO_API_KEY_3,
    env.FISH_AUDIO_API_KEY_4,
  ]
    .map((k) => (k ?? "").trim())
    .filter(Boolean);
  return [...new Set(keys)];
}

let activeKey = 0;
const spentKeys = new Set<string>();

export function hasFish(): boolean {
  return fishKeys().length > 0;
}

// 429 = too many requests at once for that account (Starter allows 5). Fish Audio sends no
// Retry-After header, so wait a little longer each time.
const BUSY_RETRY_MS = [400, 900, 1800];

/**
 * Runs `call` with the active key, moving on to the next key when one is out of credits, invalid
 * or busy (429). Keys from other accounts have their own request limit, so a busy key is skipped
 * first; if every key is busy, it waits and tries again.
 */
async function withFishKey(call: (key: string) => Promise<Response>): Promise<Response> {
  const keys = fishKeys();
  if (keys.length === 0) throw new Error("No Fish Audio key configured");

  let last: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    // Try keys that still have credit first; if every key looks spent, try them all again
    // (credits may have been topped up since).
    const order = keys.map((_, i) => (activeKey + i) % keys.length);
    const fresh = order.filter((i) => !spentKeys.has(keys[i]));
    const tryOrder = fresh.length ? fresh : order;

    let busy = false;
    for (const i of tryOrder) {
      const res = await call(keys[i]);
      if (res.status === 401 || res.status === 402) {
        spentKeys.add(keys[i]);
        console.warn(`[fish] key #${i + 1} ${res.status === 402 ? "is out of credits" : "was rejected"}; trying the next key`);
        await res.body?.cancel().catch(() => {});
        last = res;
        continue;
      }
      if (res.status === 429) {
        busy = true;
        await res.body?.cancel().catch(() => {});
        last = res;
        continue;
      }
      spentKeys.delete(keys[i]);
      activeKey = i;
      return res;
    }
    if (!busy || attempt >= BUSY_RETRY_MS.length) break;
    console.warn(`[fish] busy (too many requests at once); retrying in ${BUSY_RETRY_MS[attempt]} ms`);
    await new Promise((r) => setTimeout(r, BUSY_RETRY_MS[attempt]));
  }
  return last ?? new Response(null, { status: 402 });
}

// ---------- Text-to-speech (the AI opponent's voice) ----------

function ttsModel(): string {
  return process.env.FISH_AUDIO_MODEL || "s2.1-pro";
}

// The S1 model's own sound effects, written in (parentheses).
const S1_EFFECTS: Record<string, string> = {
  pause: "(break)",
  "short pause": "(break)",
  "long pause": "(long-break)",
  breath: "(breath)",
  inhale: "(breath)",
  sigh: "(sigh)",
  laugh: "(laugh)",
  chuckle: "(laugh)",
};

/**
 * [bracket] cues only work on the S2 family (s2-pro, s2.1-pro) and Drama models. The legacy
 * S1 model reads them aloud as words ("Focused, the evidence…"), so for S1 the sound cues
 * become S1 effects ([pause] → (break)) and emotion cues are removed. Fillers like "um" work
 * on every model as plain text.
 */
function prepareText(text: string, model: string): string {
  if (!/^s1\b/i.test(model)) return text;
  return text
    .replace(/\[([^\]]*)\]/g, (_, cue: string) => ` ${S1_EFFECTS[cue.trim().toLowerCase()] ?? ""} `)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calls Fish Audio text-to-speech for the opponent and returns the upstream response (MP3).
 * Emotion cues like "[frustrated]" are expected to already be in `text`.
 */
export function fishTTS(text: string, speed: number): Promise<Response> {
  const model = ttsModel();
  const ref = process.env.FISH_AUDIO_OPPONENT_VOICE_ID || undefined;
  const body = JSON.stringify({
    text: prepareText(text, model),
    ...(ref ? { reference_id: ref } : {}),
    format: "mp3",
    latency: "balanced",
    prosody: { speed },
  });
  return withFishKey((key) =>
    fetch(`${FISH_API}/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        model,
      },
      body,
    }),
  );
}

// ---------- Speech-to-text ----------

export interface Transcript {
  text: string;
  duration: number;
}

/** Transcribes one recording with transcribe-1-pro (emotion and vocal-event cues off). */
export async function fishSTT(audio: Blob, filename: string): Promise<Transcript> {
  const res = await withFishKey((key) => {
    const form = new FormData();
    form.append("audio", audio, filename);
    form.append("language", "en");
    form.append("tag_audio_events", "false");
    form.append("diarize", "false");
    return fetch(`${FISH_API}/asr`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, model: process.env.FISH_AUDIO_STT_MODEL || "transcribe-1-pro" },
      body: form,
    });
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Fish Audio STT ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { text?: string; duration?: number };
  return { text: cleanTranscript(data.text ?? ""), duration: data.duration ?? 0 };
}

/** Removes speaker markers (<|speaker:0|>) and any leftover bracket cues from a transcript. */
function cleanTranscript(text: string): string {
  return text
    .replace(/<\|speaker:\d+\|>/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
