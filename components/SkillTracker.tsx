"use client";
// Debate skill tracker: your scores against the AI's, exchange by exchange, and your average
// across saved debates. One metric filter scopes both charts.

import { useMemo, useRef, useState } from "react";
import { useInView } from "motion/react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CRITERION_MAX, MAX_SCORE, RUBRIC_KEYS, type Exchange, type RubricKey, type TurnScore } from "@/lib/game";
import type { FlightRecord } from "@/lib/client/history";

type Metric = "total" | RubricKey;
const METRICS: Metric[] = ["total", ...RUBRIC_KEYS];

const round1 = (n: number) => Math.round(n * 10) / 10;
const ticksFor = (max: number) => (max === MAX_SCORE ? [0, 5, 10, 15, 20] : [0, 1, 2, 3, 4]);

// Series dots wear a 2 px ring in the surface colour so they stay legible where lines cross.
const dot = (key: string) => ({ r: 4, fill: `var(--color-${key})`, stroke: "var(--background)", strokeWidth: 2 });

export default function SkillTracker({
  exchanges,
  history,
  names,
}: {
  exchanges: Exchange[];
  /** Saved debates, newest first (this one included). */
  history: FlightRecord[];
  names: { user: string; ai: string };
}) {
  const [metric, setMetric] = useState<Metric>("total");
  const max = metric === "total" ? MAX_SCORE : CRITERION_MAX;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  const config = useMemo(
    () =>
      ({
        player: { label: `You · ${names.user}`, color: "var(--chart-1)" },
        opponent: { label: `AI · ${names.ai}`, color: "var(--chart-2)" },
      }) satisfies ChartConfig,
    [names.user, names.ai],
  );

  // A category with a fixed placeholder score (opening rebuttal, typed-turn confidence) is left as a gap.
  const debate = useMemo(() => {
    const value = (s: TurnScore) => (metric === "total" ? s.total : s.fixed?.includes(metric) ? null : s.rubric[metric]);
    return exchanges.map((e) => ({ label: `E${e.index}`, player: value(e.judge.user), opponent: value(e.judge.ai) }));
  }, [exchanges, metric]);

  // Your average per exchange in each saved debate, oldest first.
  const progress = useMemo(
    () =>
      [...history]
        .reverse()
        .filter((h) => h.exchanges > 0)
        .map((h, i) => ({
          label: `#${i + 1}`,
          motion: h.motion,
          player: metric === "total" ? round1(h.userTotal / Math.max(1, h.exchanges)) : h.avg?.[metric] != null ? round1(h.avg[metric]) : null,
        }))
        .filter((p) => p.player !== null),
    [history, metric],
  );

  const yAxis = <YAxis domain={[0, max]} ticks={ticksFor(max)} tickLine={false} axisLine={false} width={24} tickMargin={6} />;
  const xAxis = <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />;

  return (
    <div ref={ref} className="flex flex-col gap-4">
      <Tabs defaultValue="debate" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList variant="line">
            <TabsTrigger value="debate">
              <span className="font-mono text-[11px] tracking-[2px]">THIS DEBATE</span>
            </TabsTrigger>
            <TabsTrigger value="progress">
              <span className="font-mono text-[11px] tracking-[2px]">YOUR PROGRESS</span>
            </TabsTrigger>
          </TabsList>
          <ToggleGroup
            type="single"
            variant="hud"
            size="hud"
            spacing={1}
            value={metric}
            onValueChange={(v) => v && setMetric(v as Metric)}
            aria-label="Skill to chart"
            className="flex-wrap"
          >
            {METRICS.map((m) => (
              <ToggleGroupItem key={m} value={m} className="h-8 px-2.5 text-[10px]">
                {m.toUpperCase()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <TabsContent value="debate">
          <p className="mb-2 mt-0 font-mono text-[10px] tracking-[2px] text-muted-foreground">
            {metric === "total" ? `SCORE PER EXCHANGE · OUT OF ${MAX_SCORE}` : `${metric.toUpperCase()} PER EXCHANGE · OUT OF ${CRITERION_MAX}`}
          </p>
          {debate.length === 0 ? (
            <NoData>No exchanges were scored.</NoData>
          ) : debate.every((d) => d.player === null && d.opponent === null) ? (
            <NoData>
              {metric === "rebuttal"
                ? "Rebuttal isn't scored on the opening exchange: there's nothing to answer yet."
                : "Not measured in this debate: confidence comes from your voice, and every turn was typed."}
            </NoData>
          ) : (
            inView && (
              <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
                <LineChart data={debate} margin={{ left: 0, right: 16, top: 10, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  {xAxis}
                  {yAxis}
                  <ChartTooltip cursor content={<ChartTooltipContent indicator="line" />} />
                  <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
                  <Line dataKey="player" type="linear" stroke="var(--color-player)" strokeWidth={2} strokeLinecap="round" dot={dot("player")} activeDot={{ r: 5 }} animationDuration={900} />
                  <Line dataKey="opponent" type="linear" stroke="var(--color-opponent)" strokeWidth={2} strokeLinecap="round" dot={dot("opponent")} activeDot={{ r: 5 }} animationDuration={900} animationBegin={150} />
                </LineChart>
              </ChartContainer>
            )
          )}
        </TabsContent>

        <TabsContent value="progress">
          <p className="mb-2 mt-0 font-mono text-[10px] tracking-[2px] text-muted-foreground">
            {metric === "total" ? `YOUR AVERAGE PER EXCHANGE · OUT OF ${MAX_SCORE}` : `YOUR AVERAGE ${metric.toUpperCase()} · OUT OF ${CRITERION_MAX}`}
          </p>
          {progress.length < 2 ? (
            <NoData>Finish another debate to see your progress.</NoData>
          ) : (
            <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
              <LineChart data={progress} margin={{ left: 0, right: 16, top: 10, bottom: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} />
                {xAxis}
                {yAxis}
                <ChartTooltip
                  cursor
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={(_, payload) => {
                        const m = String(payload?.[0]?.payload?.motion ?? "");
                        return m.length > 48 ? `${m.slice(0, 47)}…` : m;
                      }}
                    />
                  }
                />
                <Line dataKey="player" type="linear" stroke="var(--color-player)" strokeWidth={2} strokeLinecap="round" dot={dot("player")} activeDot={{ r: 5 }} animationDuration={900} />
              </LineChart>
            </ChartContainer>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NoData({ children }: { children: React.ReactNode }) {
  return (
    <Empty className="h-[160px] border">
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  );
}
