"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  CRITERION_MAX,
  MAX_SCORE,
  RUBRIC_KEYS,
  formatClock,
  getDestination,
  rubricAverages,
  vehiclesFor,
  weakestCategory,
  type GameConfig,
  type Report,
} from "@/lib/game";
import { postJson } from "@/lib/client/api";
import { saveFlight } from "@/lib/client/history";
import type { RaceSummary } from "./DebAI";
import { Corners, Dot, Label, TopBar, btnGhost, btnPrimaryLg, cx } from "./ui";
import { EarthHorizon, PlanetOrb, Rocket, Starfield } from "./visuals";

const DECIDED_LABEL = {
  arrived: "ARRIVED FIRST",
  "max-round": "MAX-ROUND RULE",
  "score-tiebreak": "TOTAL SCORE TIEBREAK",
} as const;

const RESULTS_BG = "radial-gradient(ellipse 50% 45% at 85% 15%, rgba(80,70,140,0.18), transparent 70%), var(--color-space)";

export default function ResultsScreen({
  config,
  summary,
  onRestart,
  onRematch,
}: {
  config: GameConfig;
  summary: RaceSummary;
  onRestart: () => void;
  onRematch: () => void;
}) {
  const dest = getDestination(config.destination);
  const vehicles = vehiclesFor(dest.id);
  const { exchanges, outcome } = summary;
  const won = outcome.winner === "user";

  const stats = useMemo(() => {
    const userScores = exchanges.map((e) => e.judge.user);
    const avg = rubricAverages(userScores);
    const weakest = weakestCategory(avg);
    return {
      userTotal: userScores.reduce((a, s) => a + s.total, 0),
      aiTotal: exchanges.reduce((a, e) => a + e.judge.ai.total, 0),
      avg,
      weakest,
    };
  }, [exchanges]);

  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  // Ref guard so React Strict Mode's double effect in dev doesn't pay for two Gemini calls
  // or save the same debate twice.
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    saveFlight({
      motion: config.motion,
      side: config.side,
      difficulty: config.difficulty,
      destination: config.destination,
      won,
      userTotal: stats.userTotal,
      aiTotal: stats.aiTotal,
      exchanges: exchanges.length,
      weakest: stats.weakest,
    });
    postJson<Report>("/api/report", {
      config,
      weakest: stats.weakest,
      weakestAvg: stats.avg[stats.weakest],
      exchanges: exchanges.map((e) => ({
        index: e.index,
        userText: e.userText,
        aiText: e.aiText,
        userScore: e.judge.user.total,
        aiScore: e.judge.ai.total,
        userReason: e.judge.user.reason,
        userFallacy: e.judge.user.fallacy,
      })),
    })
      .then(setReport)
      .catch((e: Error) => setReportError(e.message));
  }, [config, exchanges, stats, won]);

  const pending = !report && !reportError;
  const placeholder = pending ? "Generating judge report…" : reportError ? "Report unavailable." : "";

  return (
    <main className="relative min-h-screen overflow-hidden pb-[180px]" style={{ background: RESULTS_BG }}>
      <Starfield />
      <EarthHorizon height={170} label={false} />

      <TopBar>
        <span>DEB“AI”-01 · MISSION DEBRIEF</span>
        <span className="flex items-center gap-2">
          <Dot color={won ? "var(--color-ok)" : "var(--color-bad)"} />
          {won ? "MISSION COMPLETE · TARGET REACHED" : `MISSION ENDED · ${vehicles.ai.tag} AHEAD`}
        </span>
        <span>MET T+ {formatClock(summary.elapsedMs)}</span>
      </TopBar>

      <div className="relative z-[1] mx-auto flex max-w-[1000px] flex-col gap-7 px-4 pt-11 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-7">
          <div className="flex flex-[1_1_380px] flex-col gap-3.5">
            <Label>OUTCOME</Label>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className={cx("m-0 font-display text-[56px] font-normal leading-none tracking-[6px] sm:text-[84px] sm:tracking-[10px]", won ? "text-ink" : "text-muted")}
            >
              {won ? "YOU WON" : "YOU LOST"}
            </motion.h1>
            <dl className="mt-2.5 grid grid-cols-2 gap-px border border-line bg-line font-mono">
              <Kpi label={`TOTAL SCORE · ${vehicles.user.tag}`} color="var(--color-you)">{stats.userTotal}</Kpi>
              <Kpi label={`TOTAL SCORE · ${vehicles.ai.tag}`} color="var(--color-ai)">{stats.aiTotal}</Kpi>
              <Kpi label="EXCHANGES">
                {exchanges.length} <span className="text-xs text-muted">/ {dest.maxExchanges} MAX</span>
              </Kpi>
              <Kpi label="DECIDED BY" small>{DECIDED_LABEL[outcome.decidedBy]}</Kpi>
            </dl>
          </div>
          <div className="relative h-[260px] min-w-[260px] flex-[0_1_380px]" aria-hidden="true">
            <PlanetOrb id={dest.id} size={170} style={{ position: "absolute", right: 20, top: 20 }} />
            <motion.div
              className="absolute left-10 rotate-[18deg]"
              initial={{ top: 200 }}
              animate={{ top: won ? 40 : 110 }}
              transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <Rocket model={vehicles.user.id} idp="res-b" accent="#E8833A" width={60} flame={won ? "blast" : "idle"} />
            </motion.div>
            <motion.div
              className="absolute left-[130px] rotate-[10deg]"
              initial={{ top: 200 }}
              animate={{ top: won ? 120 : 30 }}
              transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            >
              <Rocket model={vehicles.ai.id} idp="res-a" accent="#6FB6E8" width={52} flame={won ? "idle" : "blast"} />
            </motion.div>
          </div>
        </div>

        <section className="flex flex-col gap-2.5">
          <Label>RUBRIC AVERAGES · YOU</Label>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-px border border-line bg-line font-mono">
            {RUBRIC_KEYS.map((k) => (
              <div key={k} className={cx("flex flex-col gap-1 bg-space p-3.5", k === stats.weakest && "shadow-[inset_0_-2px_0_var(--color-coral)]")}>
                <span className="text-[10px] tracking-[2px] text-muted">{k.toUpperCase()}</span>
                <span className="text-[22px]">
                  {stats.avg[k].toFixed(1)} <span className="text-xs text-muted">/ {CRITERION_MAX}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="relative flex flex-col border border-white/12 bg-space/70">
          <Corners color="var(--color-ink)" />
          <h2 className="m-0 border-b border-line px-[22px] py-4 font-mono text-xs font-medium tracking-[3px] text-soft">
            FEEDBACK FROM THE AI · JUDGE REPORT
          </h2>

          <ReportRow n="01" title="STRONG POINTS" color="var(--color-good)">
            <ReportText>{report?.strongPoints ?? placeholder}</ReportText>
          </ReportRow>

          <ReportRow n="02" title={`WEAKEST CATEGORY · ${stats.weakest.toUpperCase()} · AVG ${stats.avg[stats.weakest].toFixed(1)} / ${CRITERION_MAX}`} color="var(--color-coral)">
            <ReportText>{report?.weakestExplanation ?? placeholder}</ReportText>
          </ReportRow>

          <ReportRow n="03" title="ARGUMENT REWRITE" color="var(--color-warn)">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
              <div className="flex flex-col gap-1.5 border border-line px-3.5 py-3">
                <span className="font-mono text-[10px] tracking-[2px] text-muted">YOU SAID</span>
                <p className="m-0 text-[15px] leading-[1.6] text-body">{report?.rewrite.original ?? placeholder}</p>
              </div>
              <div className="flex flex-col gap-1.5 border border-good/40 px-3.5 py-3">
                <span className="font-mono text-[10px] tracking-[2px] text-good">STRONGER VERSION</span>
                <p className="m-0 text-[15px] leading-[1.6] text-body">{report?.rewrite.improved ?? placeholder}</p>
              </div>
            </div>
          </ReportRow>

          <ReportRow n="04" title="FALLACIES SPOTTED" color="var(--color-coral)">
            {report ? (
              report.fallacies.length ? (
                <ul className="m-0 list-disc pl-[18px] text-base leading-[1.6] text-body">
                  {report.fallacies.map((f, i) => (
                    <li key={i}>
                      <strong>{f.name}</strong> · exchange {f.exchange} · “{f.quote}”
                    </li>
                  ))}
                </ul>
              ) : (
                <ReportText>None spotted. Clean reasoning.</ReportText>
              )
            ) : (
              <ReportText>{placeholder}</ReportText>
            )}
          </ReportRow>

          <ReportRow n="05" title="PRACTICE EXERCISE" color="var(--color-ai)">
            <ReportText>{report?.exercise ?? placeholder}</ReportText>
          </ReportRow>

          <div className="flex items-baseline justify-between gap-[18px] px-[22px] py-[18px]">
            <Label className="tracking-[2px]">06 · TOTAL SCORE</Label>
            <span className="font-mono text-[30px]">
              {stats.userTotal} <span className="text-xs text-muted">/ {exchanges.length * MAX_SCORE}</span>
            </span>
          </div>
        </section>

        <details className="border border-line bg-space/60 px-[18px]">
          <summary className="py-3.5 font-mono text-[11px] tracking-[3px] text-soft">FULL TRANSCRIPT · {exchanges.length} EXCHANGES</summary>
          {exchanges.map((e) => (
            <div key={e.index} className="border-t border-white/8 py-3">
              <p className="mb-2 mt-0 font-mono text-[10px] tracking-[2px] text-muted">
                EXCHANGE {String(e.index).padStart(2, "0")} · {vehicles.user.tag} {e.judge.user.total} · {vehicles.ai.tag} {e.judge.ai.total}
              </p>
              <p className="mb-1.5 mt-0 text-sm leading-[1.55] text-body">
                <span className="text-you">{config.callsign}:</span> {e.userText || "(no argument)"}
              </p>
              <p className="mb-1.5 mt-0 text-sm leading-[1.55] text-body">
                <span className="text-ai">{vehicles.ai.name} (AI):</span> {e.aiText}
              </p>
            </div>
          ))}
        </details>

        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" className={btnPrimaryLg} onClick={onRematch}>
            REMATCH <span aria-hidden="true">↻</span>
          </button>
          <button type="button" className={cx(btnGhost, "h-[54px] min-w-[200px] tracking-[4px]")} onClick={onRestart}>
            NEW MISSION
          </button>
        </div>
      </div>
    </main>
  );
}

function Kpi({ label, color, small, children }: { label: string; color?: string; small?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-space px-3.5 py-3">
      <dt className="text-[10px] tracking-[2px] text-muted">{label}</dt>
      <dd className={cx("m-0 mt-1", small ? "text-[15px] leading-[1.9]" : "text-[22px]")} style={color ? { color } : undefined}>
        {children}
      </dd>
    </div>
  );
}

function ReportText({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-base leading-[1.6] text-body">{children}</p>;
}

function ReportRow({ n, title, color, children }: { n: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-[18px] border-b border-white/8 px-[22px] py-[18px]">
      <span className="flex-none font-mono text-xs text-muted">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-mono text-[11px] tracking-[2px]" style={{ color }}>{title}</span>
        {children}
      </div>
    </div>
  );
}
