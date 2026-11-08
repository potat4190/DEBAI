import { NextResponse } from "next/server";
import { hasFish } from "@/lib/server/fish";
import { hasGemini } from "@/lib/server/gemini";

/** Tells the client which integrations are configured (never exposes the keys). */
export async function GET() {
  return NextResponse.json({ gemini: hasGemini(), voice: hasFish() });
}
