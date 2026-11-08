import { NextResponse } from "next/server";
import { fishTTS, hasFish } from "@/lib/server/fish";

interface Body {
  text: string;
  speed?: number;
}

/** Proxies Fish Audio TTS for the AI opponent so the API keys stay on the server. 204 = voice disabled. */
export async function POST(req: Request) {
  if (!hasFish()) return new Response(null, { status: 204 });

  const { text, speed } = (await req.json()) as Body;
  if (!text?.trim()) return new Response(null, { status: 204 });

  const upstream = await fishTTS(text.slice(0, 1000), speed ?? 1);
  if (!upstream.ok || !upstream.body) {
    console.error("[tts]", upstream.status, await upstream.text().catch(() => ""));
    return NextResponse.json({ error: "TTS failed" }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
