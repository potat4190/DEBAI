"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import {
  DESTINATIONS,
  TOPICS,
  VOICE_PROFILES,
  formatMiles,
  getDestination,
  vehiclesFor,
  type Difficulty,
  type DestinationId,
  type GameConfig,
  type Side,
  type Vehicle,
} from "@/lib/game";
import { clearHistory, loadHistory, type FlightRecord, type FlightResult } from "@/lib/client/history";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Integrations } from "./DebAI";
import { Corners, Dot, Label, TopBar, btnGhost, btnPrimaryLg, field } from "./hud";
import { EASE_OUT, Reveal, RevealGroup, RevealItem } from "./reveal";
import { EarthHorizon, PlanetOrb, REF_PLANET_BG, Rocket, Starfield } from "./visuals";

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];
const RESULT_COLOR: Record<FlightResult, string> = { won: "text-ok", lost: "text-bad", draw: "text-warn" };

const START_BG =
  "radial-gradient(ellipse 50% 45% at 85% 20%, rgba(80,70,140,0.18), transparent 70%), radial-gradient(ellipse 55% 50% at 20% 45%, rgba(50,70,150,0.16), transparent 70%), var(--color-space)";

/** Quick fade for small text that changes with a selection. */
const swap = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18 },
};

export default function SetupScreen({
  initial,
  integrations,
  onStart,
}: {
  initial: GameConfig | null;
  integrations: Integrations | null;
  onStart: (config: GameConfig) => void;
}) {
  const [motionText, setMotionText] = useState(initial?.motion ?? "");
  const [side, setSide] = useState<Side>(initial?.side ?? "for");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? "medium");
  const [callsign, setCallsign] = useState(initial?.callsign ?? "");
  const [destination, setDestination] = useState<DestinationId>(initial?.destination ?? "moon");
  const [interruptions, setInterruptions] = useState(initial?.interruptions ?? false);
  const voiceOff = integrations?.voice === false;
  const [history, setHistory] = useState<FlightRecord[]>([]);
  const topicRef = useRef<HTMLInputElement>(null);
  const [topicScope, animateTopic] = useAnimate<HTMLDivElement>();
  const reduce = useReducedMotion();

  useEffect(() => setHistory(loadHistory()), []);

  const vehicles = vehiclesFor(destination);
  const listed = TOPICS.includes(motionText) ? motionText : "";
  const canStart = motionText.trim().length > 0;
  const profile = VOICE_PROFILES[difficulty];

  function randomTopic() {
    const pool = TOPICS.filter((t) => t !== motionText);
    setMotionText(pool[Math.floor(Math.random() * pool.length)]);
  }

  function start() {
    if (!canStart) {
      // No topic yet: point at the field instead of explaining in text.
      topicRef.current?.focus();
      if (!reduce) animateTopic(topicScope.current, { x: [0, -7, 7, -4, 4, 0] }, { duration: 0.36 });
      return;
    }
    onStart({
      motion: motionText.trim(),
      side,
      difficulty,
      callsign: callsign.trim() || "YOU",
      destination,
      interruptions: interruptions && !voiceOff,
    });
  }

  return (
    <main className="relative min-h-screen overflow-hidden pb-[220px]" style={{ background: START_BG }}>
      <Starfield />
      <span
        className="pointer-events-none absolute -right-[200px] -top-[150px] hidden size-[420px] rounded-full opacity-85 sm:block"
        style={{ background: REF_PLANET_BG }}
        aria-hidden="true"
      />
      <EarthHorizon />

      <TopBar>
        <span>MISSION SETUP</span>
        <span className="flex items-center gap-4">
          <LinkBadge label="GEMINI" on={integrations?.gemini} offLabel="SIMULATION" />
          <LinkBadge label="VOICE" on={integrations?.voice} offLabel="OFF" />
        </span>
      </TopBar>

      <div className="relative z-[1] mx-auto flex max-w-[1180px] flex-col gap-10 px-4 pt-12 sm:px-6">
        <RevealGroup className="flex flex-wrap items-stretch justify-between gap-8" stagger={0.09}>
          {/* The AI's rocket for this destination */}
          <RevealItem className="flex flex-[1_1_260px]">
            <VehicleCard vehicle={vehicles.ai} name="AI" color="var(--color-ai)" accent="#6FB6E8" idp="start-a" />
          </RevealItem>

          {/* Center column: title, topic, start and options */}
          <RevealItem className="order-first flex flex-[1_1_340px] flex-col items-center gap-7 lg:order-none">
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="m-0 font-display text-[56px] font-medium leading-none tracking-[4px] sm:text-[76px]">DEB“AI”</h1>
              <Label>WIN THE ARGUMENT · WIN THE RACE</Label>
            </div>

            <div ref={topicScope} className="flex w-full max-w-[340px] flex-col gap-2">
              <label htmlFor="motion" className="sr-only">
                Debate topic
              </label>
              <input
                id="motion"
                ref={topicRef}
                className={field}
                type="text"
                placeholder="Type a debate topic"
                value={motionText}
                onChange={(e) => setMotionText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && start()}
              />
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-1.5">
                <button type="button" className={cn(btnGhost, "px-4")} onClick={randomTopic}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M16 3h5v5" />
                    <path d="M4 20L21 3" />
                    <path d="M21 16v5h-5" />
                    <path d="M15 15l6 6" />
                    <path d="M4 4l5 5" />
                  </svg>
                  RANDOM
                </button>
                <label htmlFor="topic" className="sr-only">
                  Browse topics
                </label>
                <select id="topic" className={cn(field, "truncate")} value={listed} onChange={(e) => e.target.value && setMotionText(e.target.value)}>
                  <option value="">BROWSE TOPICS</option>
                  {TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button type="button" className={cn(btnPrimaryLg, !canStart && "opacity-40")} aria-disabled={!canStart} onClick={start}>
              START <span aria-hidden="true">→</span>
            </button>

            <div className="flex w-full max-w-[340px] flex-col gap-5">
              <Option label="YOUR SIDE">
                <ToggleGroup
                  type="single"
                  variant="hud"
                  size="hud"
                  spacing={1.5}
                  value={side}
                  onValueChange={(v) => v && setSide(v as Side)}
                  aria-label="Your side"
                  className="grid w-full grid-cols-2"
                >
                  <ToggleGroupItem value="for">FOR</ToggleGroupItem>
                  <ToggleGroupItem value="against">AGAINST</ToggleGroupItem>
                </ToggleGroup>
              </Option>

              <Option label="OPPONENT">
                <ToggleGroup
                  type="single"
                  variant="hud"
                  size="hud"
                  spacing={1.5}
                  value={difficulty}
                  onValueChange={(v) => v && setDifficulty(v as Difficulty)}
                  aria-label="Opponent difficulty"
                  className="grid w-full grid-cols-3"
                >
                  {LEVELS.map((d) => (
                    <ToggleGroupItem key={d} value={d}>
                      {d.toUpperCase()}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="min-h-10">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p key={difficulty} {...swap} className="m-0 text-center text-[13px] leading-snug text-muted-foreground">
                      {profile.vibe}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </Option>

              <Option label="INTERRUPTIONS">
                <ToggleGroup
                  type="single"
                  variant="hud"
                  size="hud"
                  spacing={1.5}
                  value={interruptions && !voiceOff ? "on" : "off"}
                  onValueChange={(v) => v && setInterruptions(v === "on")}
                  aria-label="Interruptions"
                  className="grid w-full grid-cols-2"
                >
                  <ToggleGroupItem value="off">OFF</ToggleGroupItem>
                  <ToggleGroupItem value="on" disabled={voiceOff}>
                    ON
                  </ToggleGroupItem>
                </ToggleGroup>
                {voiceOff ? (
                  <p className="m-0 text-center font-mono text-[10px] tracking-[2px] text-muted-foreground">NEEDS VOICE · ADD A FISH AUDIO KEY</p>
                ) : (
                  <AnimatePresence initial={false}>
                    {interruptions && (
                      <motion.p
                        role="status"
                        className="m-0 border border-warn/40 bg-warn/8 px-3 py-2.5 text-[13px] leading-normal text-warn"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2, ease: EASE_OUT }}
                      >
                        The AI cuts in when you stall, and you can talk over it. Wear headphones so your mic doesn&apos;t pick up its voice.
                      </motion.p>
                    )}
                  </AnimatePresence>
                )}
              </Option>
            </div>
          </RevealItem>

          {/* Your rocket for this destination */}
          <RevealItem className="flex flex-[1_1_260px]">
            <VehicleCard vehicle={vehicles.user} name="YOU" color="var(--color-you)" accent="#E8833A" idp="start-b" floatDelay={1.3}>
              <div className="flex w-full flex-col gap-2">
                <label htmlFor="name" className="font-mono text-[11px] tracking-[3px] text-muted-foreground">
                  CALLSIGN
                </label>
                <input
                  id="name"
                  className={field}
                  type="text"
                  placeholder="Type a name"
                  maxLength={24}
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                />
              </div>
            </VehicleCard>
          </RevealItem>
        </RevealGroup>

        {/* Destination picker */}
        <Reveal className="flex flex-col gap-4">
          <RuleHeading left="DESTINATION" />
          <ToggleGroup
            type="single"
            variant="panel"
            size="panel"
            spacing={3.5}
            value={destination}
            onValueChange={(v) => v && setDestination(v as DestinationId)}
            aria-label="Destination"
            className="grid w-full grid-cols-[repeat(auto-fit,minmax(240px,1fr))]"
          >
            {DESTINATIONS.map((p) => (
              <ToggleGroupItem key={p.id} value={p.id}>
                <PlanetOrb id={p.id} size={60} />
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[17px] font-medium tracking-[1px]">{p.name}</span>
                  <span className="grid grid-cols-[auto_auto] gap-x-3 gap-y-[3px] whitespace-nowrap font-mono text-[10px] tracking-[1px]">
                    <span className="text-muted-foreground">DISTANCE</span>
                    <span>{formatMiles(p.distance)} MI</span>
                    <span className="text-muted-foreground">EXCHANGES</span>
                    <span>{p.maxExchanges}</span>
                    <span className="text-muted-foreground">TIME LIMIT</span>
                    <span>{p.maxMinutes} MIN</span>
                  </span>
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Reveal>

        {history.length > 0 && (
          <Reveal>
            <FlightLog
              history={history}
              onClear={() => {
                clearHistory();
                setHistory([]);
              }}
            />
          </Reveal>
        )}
      </div>
    </main>
  );
}

function VehicleCard({
  vehicle,
  name,
  color,
  accent,
  idp,
  floatDelay = 0,
  children,
}: {
  vehicle: Vehicle;
  name: string;
  color: string;
  accent: string;
  idp: string;
  floatDelay?: number;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative flex w-full flex-col items-center justify-center gap-[18px] border border-line bg-space/50 px-5 pb-7 pt-14">
      <Corners color={color} />
      <span className="absolute left-5 top-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={vehicle.id} {...swap} className="block font-mono text-[11px] tracking-[2px]" style={{ color }}>
            {vehicle.tag}
          </motion.span>
        </AnimatePresence>
      </span>
      <h2 className="m-0 font-display text-[64px] font-normal leading-none tracking-[8px] sm:text-[92px]">{name}</h2>
      {/* The rocket idles on the pad with a gentle hover; switching destination launches it away
          and brings the next one up. */}
      <div className="relative mb-6 flex justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={vehicle.id}
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -80, transition: { duration: 0.45, ease: [0.55, 0, 0.75, 0.2] } }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: floatDelay }}>
              <Rocket model={vehicle.id} idp={idp} accent={accent} flame="idle" />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
      {children}
    </section>
  );
}

function Option({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function RuleHeading({ left, right }: { left: string; right?: string }) {
  return (
    <div className="flex items-center gap-3.5 font-mono text-[11px] tracking-[3px] text-muted-foreground">
      <span>{left}</span>
      <span className="flex-1 border-t border-line" />
      {right && <span className="text-soft">{right}</span>}
    </div>
  );
}

function FlightLog({ history, onClear }: { history: FlightRecord[]; onClear: () => void }) {
  const count = (r: FlightResult) => history.filter((h) => h.result === r).length;
  const draws = count("draw");
  return (
    <section className="flex flex-col gap-4">
      <RuleHeading left="FLIGHT LOG" right={`${count("won")} WON · ${count("lost")} LOST${draws ? ` · ${draws} DRAWN` : ""}`} />
      <ul className="m-0 flex list-none flex-col border border-line bg-space/55 p-0">
        {history.slice(0, 5).map((h) => (
          <li key={h.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-white/8 px-4 py-3 last:border-b-0">
            <span className={cn("w-12 font-mono text-[11px] tracking-[2px]", RESULT_COLOR[h.result])}>{h.result.toUpperCase()}</span>
            <span className="min-w-0 flex-[1_1_240px] truncate text-sm text-body" title={h.motion}>
              {h.motion}
            </span>
            <span className="font-mono text-[10px] tracking-[1px] text-muted-foreground">
              {getDestination(h.destination).name.toUpperCase()} · {h.difficulty.toUpperCase()} · {h.userTotal}–{h.aiTotal}
            </span>
            <span className="font-mono text-[10px] tracking-[1px] text-muted-foreground">
              {new Date(h.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="self-end font-mono text-[10px] tracking-[2px] text-muted-foreground underline-offset-4 hover:underline" onClick={onClear}>
        CLEAR LOG
      </button>
    </section>
  );
}

function LinkBadge({ label, on, offLabel }: { label: string; on: boolean | undefined; offLabel: string }) {
  const color = on === undefined ? "var(--color-muted-foreground)" : on ? "var(--color-ok)" : "var(--color-warn)";
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px]" title={on ? `${label} connected` : `${label} not configured`}>
      <Dot color={color} />
      {label} · {on === undefined ? "…" : on ? "LINKED" : offLabel}
    </span>
  );
}
