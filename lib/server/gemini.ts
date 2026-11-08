import "server-only";
import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type Schema } from "@google/genai";

let client: GoogleGenAI | null = null;

export function hasGemini(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const JUDGE_MODEL = process.env.GEMINI_JUDGE_MODEL || DEFAULT_MODEL;

/** How much the model may "think" before answering. Less thinking = faster replies. */
export type Thinking = "minimal" | "low";

interface JsonCall {
  system: string;
  prompt: string;
  schema: Schema;
  temperature: number;
  model?: string;
  thinking?: Thinking;
}

// Models that rejected the MINIMAL thinking level; they get LOW from then on.
const noMinimal = new Set<string>();

/** Gemini 2.5 takes a token budget; Gemini 3 and later take a thinking level. */
function thinkingConfig(model: string, thinking: Thinking | undefined): GenerateContentConfig["thinkingConfig"] {
  if (!thinking) return undefined;
  if (model.startsWith("gemini-2.5")) return thinking === "minimal" ? { thinkingBudget: 0 } : undefined;
  const minimal = thinking === "minimal" && !noMinimal.has(model);
  return { thinkingLevel: minimal ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW };
}

/** Runs a Gemini call; if the model rejects the MINIMAL thinking level, retries once with LOW. */
async function withThinkingFallback<R>(call: JsonCall, run: (req: ReturnType<typeof request>) => Promise<R>): Promise<R> {
  const req = request(call);
  try {
    return await withRetry(() => run(req));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Retry whenever this request asked for MINIMAL, even if a parallel call already learned the
    // model rejects it (several calls can start before the first rejection comes back).
    const askedMinimal = req.config.thinkingConfig?.thinkingLevel === ThinkingLevel.MINIMAL;
    if (askedMinimal && /thinking level/i.test(msg)) {
      noMinimal.add(req.model);
      return withRetry(() => run(request(call)));
    }
    throw err;
  }
}

// Gemini returns 503 ("model is experiencing high demand") and 429 (rate limit) for short
// spikes. These are retried with a short backoff; other errors fail straight away.
const RETRY_DELAYS_MS = [1000, 2500];

function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 503 || status === 429 || status === 500) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded)\b/i.test(msg);
}

async function withRetry<R>(run: () => Promise<R>): Promise<R> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isTransient(err)) throw err;
      console.warn(`[gemini] busy (attempt ${attempt + 1}), retrying in ${RETRY_DELAYS_MS[attempt]} ms`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

function request({ system, prompt, schema, temperature, model, thinking }: JsonCall) {
  const m = model ?? DEFAULT_MODEL;
  const tc = thinkingConfig(m, thinking);
  return {
    model: m,
    contents: prompt,
    config: {
      systemInstruction: system,
      temperature,
      responseMimeType: "application/json",
      responseSchema: schema,
      ...(tc ? { thinkingConfig: tc } : {}),
    },
  };
}

/** Calls Gemini with a JSON response schema and returns the parsed object. */
export async function generateJson<T>(call: JsonCall): Promise<T> {
  const res = await withThinkingFallback(call, (req) => getClient().models.generateContent(req));
  return parseJson<T>(res.text ?? "");
}

/**
 * Streams a JSON reply shaped like {"<key>": [ {...}, {...} ]} and yields each array item
 * as soon as it is complete, so the caller can show and voice it before the reply ends.
 */
export async function* streamJsonItems<T>(call: JsonCall): AsyncGenerator<T> {
  const stream = await withThinkingFallback(call, (req) => getClient().models.generateContentStream(req));
  const extractor = new ItemExtractor();
  let full = "";
  let yielded = 0;
  for await (const chunk of stream) {
    const text = chunk.text ?? "";
    full += text;
    for (const raw of extractor.push(text)) {
      try {
        yielded++;
        yield JSON.parse(raw) as T;
      } catch {
        // A malformed item is skipped; the rest of the reply still streams.
      }
    }
  }
  // Fallback: if nothing could be pulled out mid-stream, parse the whole reply.
  if (yielded === 0 && full.trim()) {
    const whole = parseJson<Record<string, T[]>>(full);
    const items = Object.values(whole).find(Array.isArray) ?? [];
    for (const item of items) yield item;
  }
}

/** Finds complete objects inside the top-level array of a streaming {"key":[{...},...]} reply. */
class ItemExtractor {
  private buf = "";
  private pos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private start = -1;

  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    for (; this.pos < this.buf.length; this.pos++) {
      const c = this.buf[this.pos];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (c === "\\") this.escaped = true;
        else if (c === '"') this.inString = false;
        continue;
      }
      if (c === '"') this.inString = true;
      else if (c === "{" || c === "[") {
        this.depth++;
        if (this.depth === 3 && c === "{") this.start = this.pos; // outer object > array > item
      } else if (c === "}" || c === "]") {
        if (this.depth === 3 && c === "}" && this.start >= 0) {
          out.push(this.buf.slice(this.start, this.pos + 1));
          this.start = -1;
        }
        this.depth--;
      }
    }
    return out;
  }
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Tolerate stray code fences or prose around the JSON object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
    throw new Error("Gemini returned invalid JSON");
  }
}
