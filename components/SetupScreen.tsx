"use client";
import { useEffect, useState } from "react";
import {
  DESTINATIONS,
  TOPICS,
  VOICE_PROFILES,
  getDestination,
  formatMiles,
  type Difficulty,
  type DestinationId,
  type GameConfig,
  type Side,
} from "@/lib/game";
import { clearHistory, loadHistory, type FlightRecord } from "@/lib/client/history";
import type { Integrations } from "./DebAI";
import { Corners, Dot, Label, TopBar, btnGhost, btnPrimaryLg, cx, field, segBtn } from "./ui";
import { EarthHorizon, PlanetOrb, REF_PLANET_BG, Rocket, Starfield } from "./visuals";

const SIDES: { id: Side; label: string }[] = [
  { id: "for", label: "FOR" },
  { id: "against", label: "AGAINST" },
];
const LEVELS: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "EASY" },
  { id: "medium", label: "MEDIUM" },
  { id: "hard", label: "HARD" },
];

const START_BG =
  "radial-gradient(ellipse 50% 45% at 85% 20%, rgba(80,70,140,0.18), transparent 70%), radial-gradient(ellipse 55% 50% at 20% 45%, rgba(50,70,150,0.16), transparent 70%), var(--color-space)";

export default function SetupScreen({
  initial,
  integrations,
  onStart,
}: {
  initial: GameConfig | null;
  integrations: Integrations | null;
  onStart: (config: GameConfig) => void;
}) {
  const [motion, setMotion] = useState(initial?.motion ?? "");
  const [side, setSide] = useState<Side>(initial?.side ?? "for");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? "medium");
  const [callsign, setCallsign] = useState(initial?.callsign ?? "");
  const [destination, setDestination] = useState<DestinationId>(initial?.destination ?? "moon");
  const [interruptions, setInterruptions] = useState(initial?.interruptions ?? false);
  const voiceOff = integrations?.voice === false;
  const [history, setHistory] = useState<FlightRecord[]>([]);

  useEffect(() => setHistory(loadHistory()), []);

  const dest = getDestination(destination);
  const listed = TOPICS.includes(motion) ? motion : "";
  const canStart = motion.trim().length > 0;

  function randomTopic() {
    const pool = TOPICS.filter((t) => t !== motion);
    setMotion(pool[Math.floor(Math.random() * pool.length)]);
  }

  function start() {
    if (!canStart) return;
    onStart({
      motion: motion.trim(),
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
      <span className="pointer-events-none absolute right-[90px] top-[250px] hidden font-mono text-[10px] tracking-[2px] text-[#6e7489] sm:block" aria-hidden="true">
        NEPTUNE-CLASS · REF
      </span>
      <EarthHorizon />

      <TopBar>
        <span>DEB“AI”-01 · DEBATE TRAJECTORY CONTROL</span>
        <span className="flex items-center gap-2">
          <Dot color="var(--color-ok)" />
          STATUS · STANDBY
        </span>
        <span className="flex items-center gap-4">
          <LinkBadge label="GEMINI" on={integrations?.gemini} offLabel="SIMULATION" />
          <LinkBadge label="VOICE" on={integrations?.voice} offLabel="OFF" />
        </span>
        <span>MET T– 00:00:00</span>
      </TopBar>

      <div className="relative z-[1] mx-auto flex max-w-[1180px] flex-wrap items-stretch justify-between gap-8 px-4 pt-12 sm:px-6">
        {/* Vehicle A: the AI */}
        <VehicleCard eyebrow="VEHICLE A" name="AI" color="var(--color-ai)">
          <Rocket idp="start-a" accent="#6FB6E8" />
          <dl className="m-0 grid w-full grid-cols-2 gap-x-3 gap-y-2 font-mono text-[11px] tracking-[1px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
            <dt>ROLE</dt><dd>OPPONENT</dd>
            <dt>MODEL</dt><dd>GEMINI</dd>
            <dt>VOICE</dt><dd>FISH AUDIO</dd>
            <dt>VIBE</dt><dd>{VOICE_PROFILES[difficulty].vibe.split(":")[0].toUpperCase()}</dd>
            <dt>V₀</dt><dd>{dest.baseSpeed.toLocaleString("en-US")} MI/S</dd>
          </dl>
        </VehicleCard>

        {/* Center column: title, start, motion and options */}
        <section className="flex flex-[1_1_340px] flex-col items-center justify-center gap-[26px]">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <h1 className="m-0 font-display text-[56px] font-medium leading-none tracking-[4px] sm:text-[76px]">DEB“AI”</h1>
            <Label>DEBATE PREPARATION · FLIGHT SIMULATOR</Label>
          </div>

          <button type="button" className={btnPrimaryLg} onClick={start} disabled={!canStart}>
            START <span aria-hidden="true">→</span>
          </button>
          {!canStart && <p className="m-0 text-center font-mono text-[10px] tracking-[2px] text-muted">SET A DEBATE MOTION TO LAUNCH</p>}

          <div className="flex w-full max-w-[340px] flex-col gap-2.5">
            <Label className="text-center">DEBATE MOTION</Label>
            <label htmlFor="motion" className="sr-only">Type a topic</label>
            <input
              id="motion"
              className={field}
              type="text"
              placeholder="Type a topic or motion"
              value={motion}
              onChange={(e) => setMotion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
            />
            <Or />
            <button type="button" className={cx(btnGhost, "w-full")} onClick={randomTopic}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 3h5v5" /><path d="M4 20L21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" />
              </svg>
              RANDOM TOPIC
            </button>
            <Or />
            <label htmlFor="topic" className="sr-only">Choose a topic</label>
            <select id="topic" className={field} value={listed} onChange={(e) => e.target.value && setMotion(e.target.value)}>
              <option value="">SELECT A TOPIC</option>
              {TOPICS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex w-full max-w-[340px] flex-col gap-2.5">
            <Label>YOUR SIDE</Label>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Your side">
              {SIDES.map((o) => (
                <button key={o.id} type="button" className={segBtn} aria-pressed={side === o.id} onClick={() => setSide(o.id)}>
                  {o.label}
                </button>
              ))}
            </div>
            <Label className="mt-2">OPPONENT DIFFICULTY</Label>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Opponent difficulty">
              {LEVELS.map((o) => (
                <button key={o.id} type="button" className={segBtn} aria-pressed={difficulty === o.id} onClick={() => setDifficulty(o.id)}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="m-0 text-center font-mono text-[10px] tracking-[2px] text-muted">{VOICE_PROFILES[difficulty].vibe.toUpperCase()}</p>

            <Label className="mt-2">INTERRUPTIONS</Label>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Interruptions">
              {[false, true].map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  className={cx(segBtn, "disabled:cursor-not-allowed disabled:opacity-40")}
                  aria-pressed={(interruptions && !voiceOff) === on}
                  disabled={on && voiceOff}
                  onClick={() => setInterruptions(on)}
                >
                  {on ? "ON" : "OFF"}
                </button>
              ))}
            </div>
            <p className="m-0 text-center font-mono text-[10px] leading-[1.6] tracking-[2px] text-muted">
              {voiceOff
                ? "NEEDS VOICE · ADD A FISH AUDIO KEY"
                : interruptions
                  ? "THE AI CUTS IN WHEN YOU STALL · TALK OVER IT TO CUT IT OFF"
                  : "EACH SIDE FINISHES ITS TURN"}
            </p>
            {interruptions && !voiceOff && (
              <p role="alert" className="m-0 border border-warn/40 bg-warn/8 px-3 py-2.5 text-[13px] leading-normal text-warn">
                Heads up: with speakers, the AI&apos;s own voice can reach your mic and count as you cutting it off. Use headphones for the best
                results.
              </p>
            )}
          </div>
        </section>

        {/* Vehicle B: the user */}
        <VehicleCard eyebrow="VEHICLE B" name="YOU" color="var(--color-you)">
          <Rocket idp="start-b" accent="#E8833A" />
          <div className="flex w-full flex-col gap-2.5">
            <label htmlFor="name" className="font-mono text-[11px] tracking-[3px] text-muted">CALLSIGN</label>
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

        {/* Destination picker */}
        <section className="mt-2 flex flex-[1_1_100%] flex-col gap-4">
          <RuleHeading left="SELECT DESTINATION" right={`TARGET · ${dest.name.toUpperCase()}`} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
            {DESTINATIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex items-center gap-[22px] rounded-[2px] border border-white/12 bg-space/55 py-[18px] pl-[26px] pr-5 text-left text-ink aria-pressed:border-ink aria-pressed:bg-ink/7"
                aria-pressed={p.id === destination}
                onClick={() => setDestination(p.id)}
              >
                <PlanetOrb id={p.id} size={64} />
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[17px] font-medium tracking-[1px]">{p.name}</span>
                  <span className="grid grid-cols-[auto_auto] gap-x-3 gap-y-[3px] font-mono text-[10px] tracking-[1px]">
                    <span className="text-muted">DISTANCE</span><span>{formatMiles(p.distance)} MI</span>
                    <span className="text-muted">BASE SPEED</span><span>{p.baseSpeed.toLocaleString("en-US")} MI/S</span>
                    <span className="text-muted">MAX EXCH.</span><span>{p.maxExchanges}</span>
                    <span className="text-muted">MAX TIME</span><span>{p.maxMinutes} MIN</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {history.length > 0 && (
          <FlightLog
            history={history}
            onClear={() => {
              clearHistory();
              setHistory([]);
            }}
          />
        )}
      </div>
    </main>
  );
}

function VehicleCard({ eyebrow, name, color, children }: { eyebrow: string; name: string; color: string; children: React.ReactNode }) {
  return (
    <section className="relative flex flex-[1_1_260px] flex-col items-center gap-[18px] border border-line bg-space/50 px-5 py-7">
      <Corners color={color} />
      <Label className="self-start tracking-[2px]" color={color}>{eyebrow}</Label>
      <h2 className="m-0 font-display text-[64px] font-normal leading-none tracking-[8px] sm:text-[92px]">{name}</h2>
      {children}
    </section>
  );
}

function Or() {
  return <p className="m-0 text-center font-mono text-[11px] text-muted">— OR —</p>;
}

function RuleHeading({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center gap-3.5 font-mono text-[11px] tracking-[3px] text-muted">
      <span>{left}</span>
      <span className="flex-1 border-t border-line" />
      <span className="text-soft">{right}</span>
    </div>
  );
}

function FlightLog({ history, onClear }: { history: FlightRecord[]; onClear: () => void }) {
  const wins = history.filter((h) => h.won).length;
  return (
    <section className="flex flex-[1_1_100%] flex-col gap-4">
      <RuleHeading left="FLIGHT LOG" right={`${wins} WON · ${history.length - wins} LOST`} />
      <ul className="m-0 flex list-none flex-col border border-line bg-space/55 p-0">
        {history.slice(0, 5).map((h) => (
          <li key={h.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-white/8 px-4 py-3 last:border-b-0">
            <span className={cx("w-12 font-mono text-[11px] tracking-[2px]", h.won ? "text-ok" : "text-bad")}>{h.won ? "WON" : "LOST"}</span>
            <span className="min-w-0 flex-[1_1_240px] truncate text-sm text-body" title={h.motion}>{h.motion}</span>
            <span className="font-mono text-[10px] tracking-[1px] text-muted">
              {getDestination(h.destination).name.toUpperCase()} · {h.difficulty.toUpperCase()} · {h.userTotal}–{h.aiTotal} · WEAKEST {h.weakest.toUpperCase()}
            </span>
            <span className="font-mono text-[10px] tracking-[1px] text-muted">{new Date(h.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="self-end font-mono text-[10px] tracking-[2px] text-muted underline-offset-4 hover:underline" onClick={onClear}>
        CLEAR LOG
      </button>
    </section>
  );
}

function LinkBadge({ label, on, offLabel }: { label: string; on: boolean | undefined; offLabel: string }) {
  const color = on === undefined ? "var(--color-muted)" : on ? "var(--color-ok)" : "var(--color-warn)";
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px]" title={on ? `${label} connected` : `${label} not configured`}>
      <Dot color={color} />
      {label} · {on === undefined ? "…" : on ? "LINKED" : offLabel}
    </span>
  );
}
