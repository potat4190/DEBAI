import { NextResponse } from "next/server";
import { fishSTT, hasFish } from "@/lib/server/fish";

// Vercel caps request bodies at 4.5 MB; a 60 s compressed webm turn is well under 1 MB.
const MAX_BYTES = 4 * 1024 * 1024;

/** Official transcript of the user's spoken turn (Fish Audio transcribe-1-pro). */
export async function POST(req: Request) {
  if (!hasFish()) return NextResponse.json({ error: "Voice input is not configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "No audio received" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording is too large" }, { status: 413 });
  }

  try {
    const name = audio instanceof File && audio.name ? audio.name : "turn.webm";
    const transcript = await fishSTT(audio, name);
    return NextResponse.json(transcript);
  } catch (err) {
    console.error("[stt]", err);
    return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  }
}
