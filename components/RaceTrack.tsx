"use client";
// The race track: two rockets climbing toward the destination, and the boost each exchange fires.
// Every effect animates transform and opacity only, so the track stays at 60 fps.

import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { formatMiles, type Destination, type RocketState, type Vehicle } from "@/lib/game";
import { cn } from "@/lib/utils";
import { EarthHorizon, GridOverlay, PlanetOrb, Rocket, SpeedField, type FlameState } from "./visuals";

/** How long the rockets climb after an exchange is scored. */
export const BOOST_SECONDS = 1.8;
/** The rocket that gained more speed fires a burst for this long before it climbs. */
export const BLAST_SECONDS = 0.7;

// Track geometry (px): 0% sits near the horizon, 100% on the target line.
const TRACK_TARGET_Y = 150;
const TRACK_ZERO_Y = 430;
const ROCKET_W = 48;
/** The name label above each rocket, including its gap. */
const LABEL_H = 18;
/** Engine nozzles, measured from the top of a 48 px rocket (nozzle line y = 216 of 260). */
const NOZZLE_Y = (216 / 120) * ROCKET_W;

const TRACK_BG = "linear-gradient(to top, #0a1830 0%, #070e1f 26%, #04060e 62%, #030409 100%)";
const CLOUD_BG =
  "radial-gradient(ellipse 30% 50% at 20% 50%, rgba(255,255,255,0.07), transparent 70%), radial-gradient(ellipse 35% 50% at 70% 50%, rgba(255,255,255,0.06), transparent 70%)";
const CLOUD_LAYERS = [0.25, 0.5, 0.75];

/** idle: cruising · burn: climbing after the smaller gain · blast: won this exchange's boost · stall: fallacy. */
export type RocketMode = "idle" | "burn" | "blast" | "stall";

const FLAME: Record<RocketMode, FlameState> = { idle: "idle", burn: "burn", blast: "blast", stall: "stall" };

export function RaceTrack({
  dest,
  vehicles,
  user,
  ai,
  boosting,
  boostKey,
}: {
  dest: Destination;
  vehicles: { user: Vehicle; ai: Vehicle };
  user: RocketState;
  ai: RocketState;
  boosting: boolean;
  /** Changes once per scored exchange, so each boost replays its effects. */
  boostKey: number;
}) {
  const reduce = useReducedMotion();
  // Whoever gained more speed this exchange gets the burst (both, on a tie).
  const mode = (me: RocketState, them: RocketState): RocketMode => {
    if (me.stalled) return "stall";
    if (!boosting) return "idle";
    return (me.lastDv ?? 0) >= (them.lastDv ?? 0) ? "blast" : "burn";
  };
  const aiMode = mode(ai, user);
  const userMode = mode(user, ai);
  const shake = boosting && !reduce && (aiMode === "blast" || userMode === "blast");

  return (
    <div className="relative h-[540px] overflow-hidden border border-white/12" style={{ background: TRACK_BG }}>
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={shake ? { x: [0, -2, 2, -1.5, 1, 0], y: [0, 1, -1, 0.5, 0, 0] } : { x: 0, y: 0 }}
        transition={{ duration: 0.5, ease: "linear" }}
      >
        <SpeedField boosting={boosting} />
        <GridOverlay />
        <PlanetOrb id={dest.id} size={300} style={{ position: "absolute", left: "50%", top: -170, marginLeft: -150 }} />

        <div className="absolute inset-x-0 z-[1] flex -translate-y-1/2 items-center gap-3 px-4" style={{ top: TRACK_TARGET_Y }}>
          <div className="flex-1 border-t border-white/30" />
          <span className="whitespace-nowrap font-mono text-[10px] tracking-[2px] text-soft">
            {dest.name.toUpperCase()} · {formatMiles(dest.distance)} MI
          </span>
          <div className="flex-1 border-t border-white/30" />
        </div>

        {CLOUD_LAYERS.map((at) => (
          <div
            key={at}
            className="pointer-events-none absolute inset-x-0 h-[26px] -translate-y-1/2"
            style={{ top: TRACK_ZERO_Y - at * (TRACK_ZERO_Y - TRACK_TARGET_Y), background: CLOUD_BG }}
            aria-hidden="true"
          />
        ))}

        <EarthHorizon height={130} label={false} />

        <TrackRocket side="left" pct={Math.min(1, ai.d / dest.distance)} color="#6FB6E8" vehicle={vehicles.ai} idp="race-a" mode={aiMode} dv={ai.lastDv} boosting={boosting} boostKey={boostKey} />
        <TrackRocket side="right" pct={Math.min(1, user.d / dest.distance)} color="#E8833A" vehicle={vehicles.user} idp="race-b" mode={userMode} dv={user.lastDv} boosting={boosting} boostKey={boostKey} />
      </motion.div>
    </div>
  );
}

const fmtSpeed = (n: number) => Math.round(n).toLocaleString("en-US");

function TrackRocket({
  side,
  pct,
  color,
  vehicle,
  idp,
  mode,
  dv,
  boosting,
  boostKey,
}: {
  side: "left" | "right";
  pct: number;
  color: string;
  vehicle: Vehicle;
  idp: string;
  mode: RocketMode;
  dv: number | null;
  boosting: boolean;
  boostKey: number;
}) {
  const reduce = useReducedMotion();
  // The engines sit on the rocket's progress line, so the flame stays in view from the start.
  const target = TRACK_ZERO_Y - pct * (TRACK_ZERO_Y - TRACK_TARGET_Y) - LABEL_H - NOZZLE_Y;
  const y = useMotionValue(target);
  const trailScale = useMotionValue(0);
  const trailOpacity = useMotionValue(0);
  const [trailLength, setTrailLength] = useState(0);
  const blast = mode === "blast";

  // Climb: the boosted rocket waits out its burst, then surges on a spring; a contrail stretches
  // from its nozzle back to where it started and fades once it settles.
  useEffect(() => {
    const from = y.get();
    if (reduce) {
      y.set(target);
      return;
    }
    const delay = blast ? BLAST_SECONDS : 0;
    const spring = { type: "spring" as const, duration: BOOST_SECONDS, bounce: blast ? 0.24 : 0.12, delay };
    const climb = animate(y, target, spring);
    const dist = from - target;
    if (dist < 4) return () => climb.stop();

    setTrailLength(dist);
    trailScale.set(0);
    const total = delay + BOOST_SECONDS + 1;
    const peak = blast ? 0.9 : 0.5;
    const grow = animate(trailScale, 1, spring);
    const fade = animate(trailOpacity, [0, 0, peak, peak * 0.75, 0], {
      duration: total,
      times: [0, delay / total, (delay + 0.2) / total, (delay + BOOST_SECONDS * 0.85) / total, 1],
      ease: "linear",
    });
    return () => {
      climb.stop();
      grow.stop();
      fade.stop();
    };
    // Only a new position starts a climb; the mode at that moment picks the style.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const body =
    reduce || mode === "stall"
      ? { scaleX: 1, scaleY: 1, y: 0 }
      : blast
        ? // Squat on ignition, stretch as it surges, settle.
          { scaleX: [1, 1.04, 0.95, 1], scaleY: [1, 0.94, 1.08, 1], y: [0, 4, -2, 0] }
        : mode === "burn"
          ? { scaleX: [1, 0.98, 1], scaleY: [1, 1.04, 1], y: 0 }
          : { scaleX: 1, scaleY: 1, y: [0, -2, 0] }; // cruising: a slow bob
  const bodyTransition =
    blast
      ? { duration: BLAST_SECONDS + BOOST_SECONDS, times: [0, 0.26, 0.42, 1], ease: "easeInOut" as const }
      : mode === "burn"
        ? { duration: BOOST_SECONDS, ease: "easeInOut" as const }
        : { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const, delay: side === "left" ? 0 : 1.1 };

  return (
    <motion.div
      className="absolute top-0 z-[2] flex -translate-x-1/2 flex-col items-center gap-1"
      style={{ left: side === "left" ? "33%" : "67%", y }}
    >
      <span className="h-[14px] whitespace-nowrap font-mono text-[10px] leading-[14px] tracking-[2px]" style={{ color }}>
        {vehicle.tag}
      </span>
      <div className="relative" style={{ width: ROCKET_W }}>
        {/* Contrail */}
        <motion.div
          className="pointer-events-none absolute left-1/2 w-3 -translate-x-1/2 origin-top rounded-full"
          style={{
            top: NOZZLE_Y + 4,
            height: trailLength,
            scaleY: trailScale,
            opacity: trailOpacity,
            background: `linear-gradient(to bottom, rgba(255,222,176,0.95), ${color}66 30%, rgba(255,255,255,0.1) 70%, transparent)`,
            filter: "blur(2.5px)",
          }}
          aria-hidden="true"
        />

        <motion.div
          initial={false}
          animate={blast && !reduce ? { x: [0, -1.5, 1.5, -1.2, 1.2, -0.6, 0] } : { x: 0 }}
          transition={{ duration: BLAST_SECONDS, ease: "linear" }}
        >
          <motion.div style={{ originY: NOZZLE_Y / ((260 / 120) * ROCKET_W) }} initial={false} animate={body} transition={bodyTransition}>
            <Rocket model={vehicle.id} idp={idp} accent={color} width={ROCKET_W} flame={FLAME[mode]} />
          </motion.div>
        </motion.div>

        <AnimatePresence>{blast && !reduce && <IgnitionBurst key={boostKey} />}</AnimatePresence>

        <AnimatePresence>
          {boosting && dv !== null && dv > 0 && (
            <motion.div
              key={boostKey}
              className={cn(
                "pointer-events-none absolute top-6 flex items-baseline gap-1 whitespace-nowrap font-mono tracking-[1px] text-ink",
                side === "left" ? "right-full mr-3" : "left-full ml-3",
                blast ? "text-[13px]" : "text-[11px] text-soft",
              )}
              initial={{ opacity: 0, y: 10, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, transition: { duration: 0.35 } }}
              transition={{ type: "spring", stiffness: 320, damping: 22, delay: blast ? BLAST_SECONDS * 0.6 : 0.1 }}
            >
              <span aria-hidden="true" style={{ color: mode === "stall" ? "var(--color-warn)" : color }}>▲</span>+{fmtSpeed(dv)}
              <span className="text-[9px] text-muted-foreground">MI/S</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Sparks sprayed from the nozzle on ignition: [dx, dy, size, seconds, delay], fanned around straight down.
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const rand = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const angle = ((rand(1) * 150 - 75) * Math.PI) / 180;
  const dist = 34 + rand(2) * 62;
  return [Math.sin(angle) * dist, Math.cos(angle) * dist, 2 + rand(3) * 1.8, 0.5 + rand(4) * 0.4, rand(5) * 0.3] as const;
});

/** Ignition: a white-hot flash, two shockwave rings and a spray of sparks at the nozzle. */
function IgnitionBurst() {
  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 size-0"
      style={{ top: NOZZLE_Y }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      aria-hidden="true"
    >
      <motion.span
        className="absolute size-24 -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
        style={{ background: "radial-gradient(circle, #FFFBEF 0%, rgba(255,196,120,0.85) 22%, rgba(242,116,43,0.35) 48%, transparent 70%)" }}
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1.4, 1.9], opacity: [0, 1, 0] }}
        transition={{ duration: 0.6, times: [0, 0.25, 1], ease: "easeOut" }}
      />
      {[0, 0.14].map((delay) => (
        <motion.span
          key={delay}
          className="absolute top-3.5 h-[22px] w-16 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-[rgba(255,226,190,0.85)]"
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: 2.8, opacity: [0, 0.9, 0] }}
          transition={{ duration: 0.75, delay, ease: [0.2, 0.7, 0.3, 1] }}
        />
      ))}
      {SPARKS.map(([dx, dy, size, duration, delay], i) => (
        <motion.span
          key={i}
          className="absolute rounded-full shadow-[0_0_6px_rgba(255,180,90,0.9)]"
          style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: i % 3 ? "#FFC56B" : "#FFF4D6" }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
          animate={{ x: dx, y: dy, opacity: [0, 1, 1, 0], scale: [1, 1, 0.4] }}
          transition={{ duration, delay, ease: [0.15, 0.7, 0.35, 1], opacity: { duration, delay, times: [0, 0.1, 0.6, 1] } }}
        />
      ))}
    </motion.div>
  );
}
