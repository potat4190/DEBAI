"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  CRITERION_MAX,
  MAX_SCORE,
  RUBRIC_KEYS,
  formatClock,
  getDestination,
  vehiclesFor,
  type DecidedBy,
  type GameConfig,
  type Report,
  type Rubric,
  type RubricKey,
  type TurnScore,
  type Winner,
} from "@/lib/game";
import { postJson } from "@/lib/client/api";
import { loadHistory, saveFlight, type FlightRecord } from "@/lib/client/history";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { RaceSummary } from "./DebAI";
import { Corners, Dot, TopBar, btnGhost, btnPrimaryLg } from "./hud";
import { EASE_OUT, Reveal } from "./reveal";
import { EarthHorizon, PlanetOrb, Rocket, Starfield, type FlameState } from "./visuals";

// Recharts only loads here, after the race, so it stays out of the first page load.
const SkillTracker = dynamic(() => import("./SkillTracker"), {
  ssr: false,
  loading: () => <Skeleton className="h-[330px] w-full" />,
});

const HEADLINE: Record<Winner, string> = { user: "YOU WON", ai: "YOU LOST", draw: "DRAW" };

function decidedLine(winner: Winner, by: DecidedBy, aiName: string): string {
  const timeUp = by === "time" ? "TIME RAN OUT · " : "";
  if (winner === "draw") return `${timeUp}LEVEL ON DISTANCE AND SCORE`;
  const you = winner === "user";
  const who = you ? "YOU" : aiName;
  const was = you ? "WERE" : "WAS";
  switch (by) {
    case "arrived":
      return `${who} ARRIVED FIRST`;
    case "max-round":
      return `${who} ${was} FARTHER AFTER THE LAST EXCHANGE`;
    case "time":
      return `${timeUp}${who} ${was} CLOSER`;
    case "score-tiebreak":
      return `LEVEL ON DISTANCE · ${who} SCORED HIGHER`;
  }
}

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
  const winner = outcome.winner;
  const reduce = useReducedMotion();

  const stats = useMemo(() => {
    const userScores = exchanges.map((e) => e.judge.user);
    const aiScores = exchanges.map((e) => e.judge.ai);
    const avg = measuredAverages(userScores);
    // Weakest among the categories that were actually measured, so a placeholder score (opening
    // rebuttal, typed-turn confidence) never becomes the coaching target.
    const measured = RUBRIC_KEYS.filter((k) => avg[k] !== undefined);
    return {
      userTotal: userScores.reduce((a, s) => a + s.total, 0),
      aiTotal: aiScores.reduce((a, s) => a + s.total, 0),
      avg,
      aiAvg: measuredAverages(aiScores),
      weakest: measured.length ? measured.reduce((w, k) => ((avg[k] ?? 0) < (avg[w] ?? 0) ? k : w)) : RUBRIC_KEYS[0],
    };
  }, [exchanges]);

  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [history, setHistory] = useState<FlightRecord[]>([]);

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
      result: winner === "user" ? "won" : winner === "ai" ? "lost" : "draw",
      userTotal: stats.userTotal,
      aiTotal: stats.aiTotal,
      exchanges: exchanges.length,
      weakest: stats.weakest,
      avg: exchanges.length ? stats.avg : undefined,
    });
    setHistory(loadHistory());
    if (!exchanges.length) {
      setReportError("Time ran out before any exchange was scored, so there's nothing to coach yet.");
      return;
    }
    postJson<Report>("/api/report", {
      config,
      weakest: stats.weakest,
      weakestAvg: stats.avg[stats.weakest] ?? 0,
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
      .catch((e: Error) => setReportError(`Couldn't write the report${e.message ? `: ${e.message}` : "."}`));
  }, [config, exchanges, stats, winner]);

  // The hero art drifts slower than the page as you scroll.
  const { scrollY } = useScroll();
  const artY = useTransform(scrollY, [0, 500], [0, 90]);
  const flames: Record<"user" | "ai", FlameState> =
    winner === "draw" ? { user: "burn", ai: "burn" } : winner === "user" ? { user: "blast", ai: "idle" } : { user: "idle", ai: "blast" };
  const headline = HEADLINE[winner];

  return (
    <main className="relative min-h-screen overflow-hidden pb-[180px]" style={{ background: RESULTS_BG }}>
      <Starfield />
      <EarthHorizon height={170} label={false} />

      <TopBar>
        <span>DEB“AI” · DEBRIEF</span>
        <span className="flex items-center gap-2">
          <Dot color={winner === "user" ? "var(--color-ok)" : winner === "draw" ? "var(--color-warn)" : "var(--color-bad)"} />
          {dest.name.toUpperCase()} · {exchanges.length} EXCHANGE{exchanges.length === 1 ? "" : "S"}
        </span>
        <span>T+ {formatClock(summary.elapsedMs)}</span>
      </TopBar>

      <div className="relative z-[1] mx-auto flex max-w-[1040px] flex-col gap-12 px-4 pt-11 sm:px-6">
        {/* Outcome */}
        <section className="flex flex-wrap items-center justify-between gap-7">
          <div className="flex flex-[1_1_380px] flex-col gap-5">
            <h1
              className={cn(
                "m-0 font-display text-[56px] font-normal leading-none tracking-[6px] sm:text-[84px] sm:tracking-[10px]",
                winner === "ai" ? "text-muted-foreground" : "text-ink",
              )}
            >
              <span className="sr-only">{headline}</span>
              {headline.split("").map((ch, i) => (
                <motion.span
                  key={i}
                  aria-hidden="true"
                  className="inline-block"
                  initial={{ opacity: 0, y: "0.45em" }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.15 + i * 0.05 }}
                >
                  {ch === " " ? " " : ch}
                </motion.span>
              ))}
            </h1>
            <motion.p
              className="m-0 font-mono text-[11px] tracking-[3px] text-soft"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              {decidedLine(winner, outcome.decidedBy, vehicles.ai.tag)}
            </motion.p>
            <motion.dl
              className="m-0 grid grid-cols-2 gap-px border border-line bg-line font-mono"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.75 }}
            >
              <Kpi label={`YOU · ${vehicles.user.tag}`} color="var(--color-you)" value={stats.userTotal} />
              <Kpi label={`AI · ${vehicles.ai.tag}`} color="var(--color-ai)" value={stats.aiTotal} />
            </motion.dl>
          </div>
          <motion.div className="relative h-[260px] min-w-[260px] flex-[0_1_380px]" style={{ y: reduce ? 0 : artY }} aria-hidden="true">
            <PlanetOrb id={dest.id} size={170} style={{ position: "absolute", right: 20, top: 20 }} />
            <motion.div
              className="absolute left-10 top-0 rotate-[18deg]"
              initial={{ y: 200 }}
              animate={{ y: winner === "user" ? 40 : winner === "draw" ? 80 : 110 }}
              transition={{ type: "spring", duration: 1.8, bounce: 0.2 }}
            >
              <Rocket model={vehicles.user.id} idp="res-b" accent="#E8833A" width={60} flame={flames.user} />
            </motion.div>
            <motion.div
              className="absolute left-[130px] top-0 rotate-[10deg]"
              initial={{ y: 200 }}
              animate={{ y: winner === "ai" ? 30 : winner === "draw" ? 80 : 120 }}
              transition={{ type: "spring", duration: 1.8, bounce: 0.2, delay: 0.1 }}
            >
              <Rocket model={vehicles.ai.id} idp="res-a" accent="#6FB6E8" width={52} flame={flames.ai} />
            </motion.div>
          </motion.div>
        </section>

        {/* Skill tracker */}
        <Reveal>
          <Panel title="SKILL TRACKER">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
              <SkillTracker exchanges={exchanges} history={history} names={{ user: vehicles.user.name, ai: vehicles.ai.name }} />
              {exchanges.length > 0 && <SkillBars you={stats.avg} ai={stats.aiAvg} weakest={stats.weakest} />}
            </div>
          </Panel>
        </Reveal>

        {/* Coaching report */}
        <Reveal>
          <Panel title="COACH'S REPORT">
            {reportError ? (
              <Empty className="border">
                <EmptyDescription>{reportError}</EmptyDescription>
              </Empty>
            ) : (
              <div className="flex flex-col">
                <ReportRow title="STRONG POINTS" color="var(--color-good)">
                  <ReportText value={report?.strongPoints} />
                </ReportRow>
                <ReportRow title={`WORK ON · ${stats.weakest.toUpperCase()} · ${(stats.avg[stats.weakest] ?? 0).toFixed(1)}/${CRITERION_MAX}`} color="var(--color-coral)">
                  <ReportText value={report?.weakestExplanation} />
                </ReportRow>
                <ReportRow title="REWRITE" color="var(--color-warn)">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
                    <div className="flex flex-col gap-1.5 border border-line px-3.5 py-3">
                      <span className="font-mono text-[10px] tracking-[2px] text-muted-foreground">YOU SAID</span>
                      <ReportText value={report?.rewrite.original} />
                    </div>
                    <div className="flex flex-col gap-1.5 border border-good/40 px-3.5 py-3">
                      <span className="font-mono text-[10px] tracking-[2px] text-good">STRONGER</span>
                      <ReportText value={report?.rewrite.improved} />
                    </div>
                  </div>
                </ReportRow>
                <ReportRow title="FALLACIES" color="var(--color-coral)">
                  {report ? (
                    report.fallacies.length ? (
                      <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-base leading-[1.6] text-body">
                        {report.fallacies.map((f, i) => (
                          <li key={i}>
                            <strong className="font-medium">{f.name}</strong> · exchange {f.exchange} · “{f.quote}”
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="m-0 text-base leading-[1.6] text-body">None spotted.</p>
                    )
                  ) : (
                    <ReportText value={undefined} />
                  )}
                </ReportRow>
                <ReportRow title="60-SECOND DRILL" color="var(--color-ai)" last>
                  <ReportText value={report?.exercise} />
                </ReportRow>
              </div>
            )}
          </Panel>
        </Reveal>

        {/* How the judge scored each exchange */}
        {exchanges.length > 0 && (
          <Reveal>
            <Panel title="JUDGE'S BREAKDOWN" aside={`0–${CRITERION_MAX} PER CATEGORY`}>
              <Accordion type="multiple" defaultValue={["e1"]}>
                {exchanges.map((e) => (
                  <AccordionItem key={e.index} value={`e${e.index}`}>
                    <AccordionTrigger className="items-center py-3.5 hover:no-underline">
                      <span className="flex flex-1 flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-[11px] font-normal tracking-[2px]">
                        <span className="text-muted-foreground">EXCHANGE {String(e.index).padStart(2, "0")}</span>
                        <span className="tabular-nums">
                          <span className="text-you">YOU</span>{" "}
                          <span className={e.judge.winner === "ai" ? "text-muted-foreground" : "text-ink"}>{e.judge.user.total}</span>
                          <span className="px-2 text-muted-foreground">–</span>
                          <span className={e.judge.winner === "user" ? "text-muted-foreground" : "text-ink"}>{e.judge.ai.total}</span>{" "}
                          <span className="text-ai">AI</span>
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-3 pb-5">
                      <div className="grid gap-3 md:grid-cols-2">
                        <SideBreakdown name={`YOU · ${vehicles.user.tag}`} color="var(--color-you)" text={e.userText} score={e.judge.user} />
                        <SideBreakdown name={`AI · ${vehicles.ai.tag}`} color="var(--color-ai)" text={e.aiText} score={e.judge.ai} />
                      </div>
                      {e.judge.verdict && <p className="m-0 text-sm leading-relaxed text-muted-foreground">{e.judge.verdict}</p>}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Panel>
          </Reveal>
        )}

        <Reveal className="flex flex-wrap justify-center gap-3">
          <button type="button" className={btnPrimaryLg} onClick={onRematch}>
            REMATCH <span aria-hidden="true">↻</span>
          </button>
          <button type="button" className={cn(btnGhost, "h-[54px] min-w-[200px] tracking-[4px]")} onClick={onRestart}>
            NEW MISSION
          </button>
        </Reveal>
      </div>
    </main>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="relative flex flex-col border border-white/12 bg-space/70">
      <Corners color="var(--color-ink)" />
      <h2 className="m-0 flex items-baseline justify-between gap-4 border-b border-line px-[22px] py-4 font-mono text-xs font-medium tracking-[3px] text-soft">
        {title}
        {aside && <span className="text-[10px] font-normal tracking-[2px] text-muted-foreground">{aside}</span>}
      </h2>
      <div className="px-[22px] py-5">{children}</div>
    </section>
  );
}

function Kpi({ label, color, value }: { label: string; color: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5 bg-space px-4 py-3.5">
      <dt className="text-[10px] tracking-[2px]" style={{ color }}>
        {label}
      </dt>
      <dd className="m-0 text-[34px] leading-none">
        {value} <span className="text-xs text-muted-foreground">PTS</span>
      </dd>
    </div>
  );
}

/** Average per category over measured scores only; a category with none is left out. */
function measuredAverages(scores: TurnScore[]): Partial<Rubric> {
  const out: Partial<Rubric> = {};
  for (const k of RUBRIC_KEYS) {
    const values = scores.filter((s) => !s.fixed?.includes(k)).map((s) => s.rubric[k]);
    if (values.length) out[k] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  return out;
}

/** Average per category, you against the AI: two thin bars per row, values at the bar tips. */
function SkillBars({ you, ai, weakest }: { you: Partial<Rubric>; ai: Partial<Rubric>; weakest: RubricKey }) {
  const gaps = RUBRIC_KEYS.some((k) => you[k] === undefined || ai[k] === undefined);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 font-mono text-[10px] tracking-[2px] text-muted-foreground">AVERAGE · OUT OF {CRITERION_MAX}</p>
        <div className="flex gap-3 font-mono text-[10px] tracking-[1px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-chart-1" />
            YOU
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-chart-2" />
            AI
          </span>
        </div>
      </div>
      {RUBRIC_KEYS.map((k, i) => (
        <div key={k} className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between font-mono text-[10px] tracking-[2px]">
            <span className="text-soft">{k.toUpperCase()}</span>
            {k === weakest && <span className="text-coral">WEAKEST</span>}
          </span>
          {(
            [
              ["You", you[k], "bg-chart-1"],
              ["AI", ai[k], "bg-chart-2"],
            ] as const
          ).map(([who, v, bg], j) => (
            <span key={who} className="flex items-center gap-2" title={v === undefined ? `${who}: not measured` : `${who}: ${v.toFixed(1)} of ${CRITERION_MAX}`}>
              <span className="relative h-2 flex-1 rounded-r-[4px] bg-white/[0.04]">
                {v !== undefined && (
                  <motion.span
                    className={cn("absolute inset-y-0 left-0 rounded-r-[4px]", bg)}
                    style={{ width: `${(v / CRITERION_MAX) * 100}%` }}
                    initial={{ clipPath: "inset(0 100% 0 0)" }}
                    whileInView={{ clipPath: "inset(0 0% 0 0)" }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.15 + i * 0.06 + j * 0.04 }}
                  />
                )}
              </span>
              <span className="w-7 text-right font-mono text-[11px] tabular-nums text-body">{v === undefined ? "—" : v.toFixed(1)}</span>
            </span>
          ))}
        </div>
      ))}
      {gaps && <p className="m-0 text-xs leading-snug text-muted-foreground">— not measured: nothing to rebut in the opening exchange, or a typed turn.</p>}
    </div>
  );
}

/** One side of an exchange: what they said, then each category's score and the judge's reason. */
function SideBreakdown({ name, color, text, score }: { name: string; color: string; text: string; score: TurnScore }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  return (
    <div className="flex flex-col gap-3.5 border border-line bg-white/[0.015] p-4">
      <div className="flex items-baseline justify-between gap-3 font-mono">
        <span className="text-[10px] tracking-[2px]" style={{ color }}>
          {name}
        </span>
        <span className="text-sm tabular-nums">
          {score.total}
          <span className="text-[10px] text-muted-foreground">/{MAX_SCORE}</span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <blockquote className={cn("m-0 border-l-2 pl-3 text-sm leading-relaxed text-body", long && !open && "line-clamp-3")} style={{ borderColor: color }}>
          {text || "(no argument)"}
        </blockquote>
        {long && (
          <button
            type="button"
            className="self-start pl-3 font-mono text-[10px] tracking-[2px] text-muted-foreground hover:text-ink"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "SHOW LESS" : "SHOW ALL"}
          </button>
        )}
      </div>
      <dl className="m-0 grid grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5">
        {RUBRIC_KEYS.map((k) => (
          <Fragment key={k}>
            <dt className="font-mono text-[10px] tracking-[2px] text-muted-foreground">{k.toUpperCase()}</dt>
            <dd className="m-0">
              <Pips value={score.rubric[k]} color={color} label={`${k} ${score.rubric[k]} of ${CRITERION_MAX}`} />
            </dd>
            <dd className="m-0 text-[13px] leading-snug text-body">{score.notes?.[k] || (k === "confidence" && score.delivery) || "—"}</dd>
          </Fragment>
        ))}
      </dl>
      {score.fallacy && <div className="font-mono text-[10px] tracking-[2px] text-bad">FALLACY · {score.fallacy.toUpperCase()}</div>}
    </div>
  );
}

/** A 0-4 score as four small blocks. */
function Pips({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <span className="flex items-center gap-[3px]" role="img" aria-label={label}>
      {Array.from({ length: CRITERION_MAX }, (_, i) => (
        <span
          key={i}
          className="block h-2.5 w-[7px] rounded-[1px]"
          style={i < value ? { background: color } : { boxShadow: "inset 0 0 0 1px var(--color-line-2)" }}
        />
      ))}
      <span className="ml-1.5 font-mono text-[11px] tabular-nums text-ink">{value}</span>
    </span>
  );
}

function ReportText({ value }: { value: string | undefined }) {
  if (value) return <p className="m-0 text-base leading-[1.6] text-body">{value}</p>;
  return (
    <span className="flex flex-col gap-2" role="status" aria-label="Writing the report">
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-4/5" />
    </span>
  );
}

function ReportRow({ title, color, last, children }: { title: string; color: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-2 py-[18px] first:pt-0", last ? "pb-0" : "border-b border-white/8")}>
      <span className="font-mono text-[11px] tracking-[2px]" style={{ color }}>
        {title}
      </span>
      {children}
    </div>
  );
}
