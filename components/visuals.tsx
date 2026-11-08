"use client";
import type { CSSProperties } from "react";
import { motion } from "motion/react";
import type { DestinationId } from "@/lib/game";

// ---------- Planet surfaces (from the design) ----------

const SHADE =
  "radial-gradient(circle at 34% 30%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.82) 100%)";

export const PLANET_BG: Record<DestinationId, string> = {
  moon: `${SHADE}, radial-gradient(circle at 62% 56%, rgba(60,60,58,0.55) 0 9%, transparent 10%), radial-gradient(circle at 38% 70%, rgba(60,60,58,0.45) 0 7%, transparent 8%), radial-gradient(circle at 30% 38%, rgba(70,70,68,0.4) 0 11%, transparent 12%), #A9A9A4`,
  mars: `${SHADE}, radial-gradient(ellipse 30% 14% at 45% 55%, rgba(70,25,10,0.55), transparent 100%), radial-gradient(ellipse 22% 8% at 50% 6%, rgba(240,228,220,0.7), transparent 100%), #A8492A`,
  jupiter: `${SHADE}, radial-gradient(ellipse 14% 8% at 62% 64%, #8F4630 55%, transparent 100%), repeating-linear-gradient(172deg, #D9C4A2 0 9%, #A97F5A 9% 14%, #E2D3B6 14% 21%, #8E6343 21% 25%, #C8A984 25% 32%)`,
  saturn: `${SHADE}, repeating-linear-gradient(178deg, #DCCBA4 0 12%, #C4AA7C 12% 18%, #E4D6B6 18% 28%, #B49568 28% 32%)`,
};

export function PlanetOrb({ id, size, style }: { id: DestinationId; size: number; style?: CSSProperties }) {
  return (
    <span className="relative block flex-none" style={{ width: size, height: size, ...style }} aria-hidden="true">
      <span className="absolute inset-0 rounded-full shadow-[inset_-8px_-6px_14px_rgba(0,0,0,0.5)]" style={{ background: PLANET_BG[id] }} />
      {id === "saturn" && (
        <span
          className="absolute -rotate-[18deg] rounded-full border-solid border-[rgba(214,198,160,0.75)]"
          style={{ left: -size * 0.31, top: size * 0.36, width: size * 1.62, height: size * 0.31, borderWidth: Math.max(2, size / 21) }}
        />
      )}
    </span>
  );
}

/** Large banded planet peeking in from the top-right corner of the start screen. */
export const REF_PLANET_BG =
  "radial-gradient(circle at 22% 78%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.88) 85%), repeating-linear-gradient(158deg, #5b6e8c 0 7%, #7a8ba6 7% 11%, #43546e 11% 18%, #93a2b8 18% 21%, #4d5f7a 21% 27%)";

// ---------- Backdrop ----------

const STARS: [number, number, number, number][] = [
  [60, 80, 1.1, 0.8], [140, 210, 0.7, 0.55], [230, 40, 1.3, 0.9], [310, 150, 0.6, 0.5], [390, 300, 0.9, 0.7],
  [470, 90, 0.7, 0.6], [520, 220, 1.4, 0.9], [600, 40, 0.6, 0.5], [680, 170, 1, 0.75], [760, 60, 0.8, 0.6],
  [840, 250, 1.2, 0.85], [910, 120, 0.6, 0.5], [990, 30, 1.1, 0.8], [1060, 200, 0.7, 0.6], [1140, 90, 1.3, 0.9],
  [1220, 260, 0.8, 0.7], [40, 380, 0.8, 0.6], [170, 470, 1.1, 0.8], [280, 560, 0.6, 0.5], [350, 420, 0.9, 0.7],
  [450, 620, 0.7, 0.6], [560, 500, 1, 0.8], [720, 580, 1.2, 0.85], [880, 640, 0.9, 0.7], [960, 400, 1.1, 0.8],
  [1110, 470, 1, 0.8], [1200, 600, 0.7, 0.6], [95, 130, 0.8, 0.45], [410, 60, 0.6, 0.45], [705, 240, 0.9, 0.45],
  [1015, 95, 0.7, 0.45], [1185, 330, 0.8, 0.45], [250, 610, 0.6, 0.45], [890, 520, 0.6, 0.45], [145, 330, 0.7, 0.45],
  [660, 450, 0.8, 0.45], [180, 60, 0.7, 0.45], [820, 40, 0.8, 0.45], [1100, 240, 0.6, 0.45], [60, 520, 0.8, 0.45],
];

const GRID_BG =
  "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)";

export function GridOverlay() {
  return <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: GRID_BG, backgroundSize: "40px 40px" }} aria-hidden="true" />;
}

/** SVG starfield; every fourth star twinkles. */
export function Starfield() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <GridOverlay />
      <svg viewBox="0 0 1280 980" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" fill="#FFFFFF">
        {STARS.map(([cx, cy, r, o], i) =>
          i % 4 === 0 ? (
            <motion.circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              initial={{ opacity: o }}
              animate={{ opacity: [o, o * 0.3, o] }}
              transition={{ duration: 2.4 + (i % 7) * 0.5, repeat: Infinity, ease: "easeInOut", delay: (i % 5) * 0.4 }}
            />
          ) : (
            <circle key={i} cx={cx} cy={cy} r={r} opacity={o} />
          ),
        )}
      </svg>
    </div>
  );
}

const LIMB_BG = "radial-gradient(circle at 50% 0%, #4a7db8 0%, #2a5385 0.5%, #12294a 1.2%, #070f1e 2.2%)";
const LIMB_GLOW =
  "0 -1px 0 1px rgba(170,210,255,0.55), 0 -8px 36px 8px rgba(90,150,240,0.3), 0 -30px 90px 30px rgba(60,110,220,0.12)";

export function EarthHorizon({ height = 200, label = true }: { height?: number; label?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden" style={{ height }} aria-hidden="true">
      <span
        className="absolute left-1/2 -ml-[3000px] size-[6000px] rounded-full"
        style={{ top: height * 0.4, background: LIMB_BG, boxShadow: LIMB_GLOW }}
      />
      <svg viewBox="0 0 1280 200" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <defs>
          <filter id="cl-blur" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g filter="url(#cl-blur)" fill="#FFFFFF" opacity=".2">
          <ellipse cx="320" cy="112" rx="180" ry="7" />
          <ellipse cx="640" cy="96" rx="230" ry="6" />
          <ellipse cx="960" cy="112" rx="170" ry="7" />
          <ellipse cx="470" cy="140" rx="200" ry="10" />
          <ellipse cx="830" cy="150" rx="230" ry="10" />
        </g>
      </svg>
      {label && <span className="absolute bottom-5 left-6 font-mono text-[10px] tracking-[2px] text-muted">EARTH · LOW ORBIT VIEW</span>}
    </div>
  );
}

// ---------- Rocket (from the design), with an optional exhaust flame ----------

export function Rocket({
  idp,
  accent,
  width = 96,
  flame = false,
  stalled = false,
}: {
  idp: string; // unique prefix for SVG ids
  accent: string;
  width?: number;
  flame?: boolean;
  stalled?: boolean;
}) {
  const id = (s: string) => `${idp}-${s}`;
  const url = (s: string) => `url(#${id(s)})`;
  return (
    <svg width={width} height={(width * 260) / 120} viewBox="0 0 120 260" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id("t")} x1="0" x2="1">
          <stop offset="0" stopColor="#5A2A0C" /><stop offset=".2" stopColor="#B35A22" /><stop offset=".36" stopColor="#D47C3C" />
          <stop offset=".55" stopColor="#BF6629" /><stop offset=".8" stopColor="#874014" /><stop offset="1" stopColor="#4E240A" />
        </linearGradient>
        <linearGradient id={id("s")} x1="0" x2="1">
          <stop offset="0" stopColor="#6F747D" /><stop offset=".22" stopColor="#DADDE2" /><stop offset=".36" stopColor="#F7F8FA" />
          <stop offset=".6" stopColor="#D0D3D9" /><stop offset=".85" stopColor="#979CA6" /><stop offset="1" stopColor="#666B74" />
        </linearGradient>
        <linearGradient id={id("o")} x1="0" x2="1">
          <stop offset="0" stopColor="#7F848E" /><stop offset=".26" stopColor="#E6E8EC" /><stop offset=".4" stopColor="#FAFBFC" />
          <stop offset=".66" stopColor="#D3D6DC" /><stop offset="1" stopColor="#777C86" />
        </linearGradient>
        <linearGradient id={id("w")} x1="0" x2="1">
          <stop offset="0" stopColor="#8E939D" /><stop offset=".3" stopColor="#E4E6EA" /><stop offset=".5" stopColor="#F2F3F5" />
          <stop offset=".72" stopColor="#DADDE2" /><stop offset="1" stopColor="#858A94" />
        </linearGradient>
        <linearGradient id={id("e")} x1="0" x2="1">
          <stop offset="0" stopColor="#24262B" /><stop offset=".4" stopColor="#5C6068" /><stop offset="1" stopColor="#1E2024" />
        </linearGradient>
        <linearGradient id={id("f")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF4D6" /><stop offset=".25" stopColor="#FFC56B" />
          <stop offset=".6" stopColor="#F2742B" stopOpacity=".8" /><stop offset="1" stopColor="#F2742B" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id("c")}>
          <path d="M44 198V50C44 30 52 16 60 8C68 16 76 30 76 50V198Q60 206 44 198Z" />
        </clipPath>
        <filter id={id("n")} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06 1.1" numOctaves={2} seed={7} />
          <feColorMatrix values="0 0 0 0 0.15  0 0 0 0 0.06  0 0 0 0 0.02  0 0 0 1.2 -0.45" />
        </filter>
        <filter id={id("b")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {flame && (
        <g className={stalled ? "origin-[60px_216px] animate-sputter opacity-40" : "origin-[60px_216px] animate-flicker"}>
          <path d="M50 216Q60 262 70 216Z" fill={url("f")} />
          <path d="M20 216Q29 248 38 216Z" fill={url("f")} opacity=".85" />
          <path d="M82 216Q91 248 100 216Z" fill={url("f")} opacity=".85" />
        </g>
      )}

      <path d="M44 198V50C44 30 52 16 60 8C68 16 76 30 76 50V198Q60 206 44 198Z" fill={url("t")} />
      <rect x="40" y="0" width="40" height="210" clipPath={url("c")} filter={url("n")} opacity=".6" />
      <rect x="44" y="74" width="32" height="12" fill="#000" opacity=".14" />
      <path d="M48 74V86M52 74V86M56 74V86M60 74V86M64 74V86M68 74V86M72 74V86" stroke="#000" strokeOpacity=".18" strokeWidth=".5" />
      <path d="M44 74H76M44 86H76" stroke="#3E1C08" strokeOpacity=".5" strokeWidth=".6" />
      <path d="M60 8V2" stroke="#9CA1AB" strokeWidth="1" />
      <ellipse cx="60" cy="140" rx="20" ry="74" fill="#000" opacity=".35" filter={url("b")} clipPath={url("c")} />
      <path d="M36 66H44M36 188H44M76 66H84M76 188H84" stroke="#3E424A" strokeWidth="2" />
      <path d="M29 38C32 42 35 50 35.5 58L36 64V196L38 208H20L22 196V64L22.5 58C23 50 26 42 29 38Z" fill={url("s")} />
      <path d="M91 38C94 42 97 50 97.5 58L98 64V196L100 208H82L84 196V64L84.5 58C85 50 88 42 91 38Z" fill={url("s")} />
      <path
        d="M22 64H36M22 92H36M22 120H36M22 148H36M22 176H36M22 196H36M84 64H98M84 92H98M84 120H98M84 148H98M84 176H98M84 196H98"
        stroke="#000" strokeOpacity=".2" strokeWidth=".7"
      />
      <path d="M23 208H35L36.5 216H21.5ZM85 208H97L98.5 216H83.5Z" fill={url("e")} />
      <path d="M51 138L17 198L18 206H102L103 198L69 138Z" fill={url("w")} />
      <path d="M22 199H98M60 199V206" stroke="#000" strokeOpacity=".18" strokeWidth=".6" />
      <path d="M51 138L17 198M69 138L103 198" stroke="#1A1B1F" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M50 208V98C50 82 54 71 60 64C66 71 70 82 70 98V208Z" fill={url("o")} stroke="#000" strokeOpacity=".25" strokeWidth=".5" />
      <path d="M60 100V180M53 100V180M67 100V180" stroke="#000" strokeOpacity=".14" strokeWidth=".5" />
      <path d="M53 100H67M53 140H67M53 180H67" stroke="#000" strokeOpacity=".1" strokeWidth=".5" />
      <path d="M54.5 76C56 70 58 66.5 60 64C62 66.5 64 70 65.5 76C62 74.6 58 74.6 54.5 76Z" fill="#1A1B1F" />
      <path d="M54.5 86L57.5 83.5H62.5L65.5 86L64.8 89.5H55.2Z" fill="#14161A" />
      <path d="M57.5 83.5L58.5 89.5M60 83.5V89.5M62.5 83.5L61.5 89.5" stroke="#5C6068" strokeWidth=".4" />
      <rect x="50.3" y="112" width="19.4" height="2" fill={accent} />
      <path
        d="M50.5 186C50.5 182 52 180 54 180C56 180 57 182 57 186V206H50.5ZM63 186C63 182 64 180 66 180C68 180 69.5 182 69.5 186V206H63Z"
        fill={url("o")} stroke="#000" strokeOpacity=".2" strokeWidth=".4"
      />
      <path d="M60 176V208" stroke="#8A8F99" strokeWidth="2.2" />
      <path d="M59.4 176V208" stroke="#FFFFFF" strokeOpacity=".6" strokeWidth=".6" />
      <rect x="53" y="208" width="14" height="3" fill="#2A2C31" />
      <path d="M51 208H57L58 216H50ZM57 208H63L64 216H56ZM63 208H69L70 216H62Z" fill={url("e")} />
    </svg>
  );
}
