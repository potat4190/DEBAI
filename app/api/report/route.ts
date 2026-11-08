import { NextResponse } from "next/server";
import type { GameConfig, Report, RubricKey } from "@/lib/game";
import { generateJson, hasGemini } from "@/lib/server/gemini";
import { mockReport } from "@/lib/server/mock";
import { REPORT_SYSTEM, reportPrompt, reportSchema, type ReportExchange } from "@/lib/server/prompts";

interface Body {
  config: GameConfig;
  exchanges: ReportExchange[];
  weakest: RubricKey;
  weakestAvg: number;
}

export async function POST(req: Request) {
  const { config, exchanges, weakest, weakestAvg } = (await req.json()) as Body;
  try {
    const report: Report = hasGemini()
      ? await generateJson<Report>({
          system: REPORT_SYSTEM,
          prompt: reportPrompt(config, exchanges, weakest, weakestAvg),
          schema: reportSchema,
          temperature: 0.5,
          thinking: "low",
        })
      : mockReport(exchanges, weakest);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[report]", err);
    return NextResponse.json({ error: "Report generation failed" }, { status: 502 });
  }
}
