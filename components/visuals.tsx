"use client";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { DestinationId, RocketId } from "@/lib/game";

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

// ---------- Scrolling starfield (makes the rockets look like they're climbing) ----------

// Each star is its own repeating background tile, so a handful of gradients reads as a random field.
// Every tile height divides LOOP_PX, so the layers can wrap without a visible jump.
const LOOP_PX = 1080;
type Star = [w: number, h: number, x: number, y: number, rx: number, ry: number, alpha: number];

const FAR_STARS: Star[] = [
  [131, 108, 40, 20, 0.8, 0.8, 0.5], [173, 120, 90, 70, 0.7, 0.7, 0.45], [197, 135, 20, 100, 1, 1, 0.6],
  [229, 180, 150, 40, 0.9, 0.9, 0.55], [263, 216, 60, 160, 1.1, 1.1, 0.7], [307, 270, 200, 90, 0.8, 0.8, 0.5],
  [149, 135, 110, 30, 0.6, 0.6, 0.4], [211, 216, 30, 200, 0.7, 0.7, 0.45], [251, 360, 170, 300, 0.9, 0.9, 0.55],
];
const NEAR_STARS: Star[] = [
  [167, 180, 50, 60, 0.9, 7, 0.55], [239, 270, 180, 30, 1, 9, 0.6], [283, 360, 90, 250, 1.1, 10, 0.65],
  [193, 216, 140, 120, 0.8, 6, 0.5], [317, 540, 250, 400, 1.2, 12, 0.7], [223, 270, 20, 190, 0.9, 8, 0.5],
];

const starImage = (stars: Star[]) =>
  stars.map(([, , x, y, rx, ry, a]) => `radial-gradient(${rx}px ${ry}px at ${x}px ${y}px, rgba(255,255,255,${a}), transparent)`).join(", ");
const starSize = (stars: Star[]) => stars.map(([w, h]) => `${w}px ${h}px`).join(", ");
const starPosition = (stars: Star[], y: number) => stars.map(() => `0px ${y}px`).join(", ");

// Scroll speeds in px/s: a slow drift while cruising, a rush during a boost.
const CRUISE = { far: 12, near: 34 };
const RUSH = { far: 160, near: 460 };

/** Two layers of stars sliding down behind the rockets, faster while a boost is playing. */
export function SpeedField({ boosting }: { boosting: boolean }) {
  const reduce = useReducedMotion();
  const far = useMotionValue(0);
  const near = useMotionValue(0);
  const speed = useRef({ ...CRUISE });
  const boostingRef = useRef(boosting);
  boostingRef.current = boosting;

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const target = boostingRef.current ? RUSH : CRUISE;
    const ease = Math.min(1, delta / 450); // speed up and slow down smoothly
    speed.current.far += (target.far - speed.current.far) * ease;
    speed.current.near += (target.near - speed.current.near) * ease;
    far.set((far.get() + (speed.current.far * delta) / 1000) % LOOP_PX);
    near.set((near.get() + (speed.current.near * delta) / 1000) % LOOP_PX);
  });

  const farPos = useTransform(far, (y) => starPosition(FAR_STARS, y));
  const nearPos = useTransform(near, (y) => starPosition(NEAR_STARS, y));

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <motion.div
        className="absolute inset-0"
        style={{ backgroundImage: starImage(FAR_STARS), backgroundSize: starSize(FAR_STARS), backgroundPosition: farPos }}
      />
      <motion.div
        className="absolute inset-0"
        style={{ backgroundImage: starImage(NEAR_STARS), backgroundSize: starSize(NEAR_STARS), backgroundPosition: nearPos }}
        initial={false}
        animate={{ opacity: boosting ? 0.95 : 0.35 }}
        transition={{ duration: 0.6 }}
      />
    </div>
  );
}

// ---------- Rockets ----------
// Eight real launch vehicles drawn from simple shaded parts in a 120 x 260 box. Every engine
// nozzle ends on the line y = NOZZLE_Y so the exhaust lines up for all of them.

const NOZZLE_Y = 216;

const WHITE = "#ECEEF1";
const OFF_WHITE = "#DCDFE4";
const BLACK = "#1B1C20";
const DARK = "#2B2D33";
const STEEL = "#BCC1C8";
const GREY = "#7D828B";

interface Part {
  x: number; // centre line
  y: number; // top edge (base, for noses)
  w: number;
  h: number;
  fill: string;
  s: string; // the shading overlay
}

/** A cylinder section: flat colour plus the shared cylindrical shading. */
function Cyl({ x, y, w, h, fill, s }: Part) {
  return (
    <>
      <rect x={x - w / 2} y={y} width={w} height={h} fill={fill} />
      <rect x={x - w / 2} y={y} width={w} height={h} fill={s} />
    </>
  );
}

/** A tapered section, `wt` wide at the top and `w` at the bottom. */
function Taper({ x, y, w, h, wt, fill, s }: Part & { wt: number }) {
  const d = `M${x - wt / 2} ${y}H${x + wt / 2}L${x + w / 2} ${y + h}H${x - w / 2}Z`;
  return (
    <>
      <path d={d} fill={fill} />
      <path d={d} fill={s} />
    </>
  );
}

/** A nose cone standing on `y`, pointed (ogive) or blunt (a big rounded fairing). */
function Nose({ x, y, w, h, fill, s, blunt = false }: Part & { blunt?: boolean }) {
  const l = x - w / 2;
  const r = x + w / 2;
  const top = y - h;
  const d = blunt
    ? `M${l} ${y}C${l} ${top + h * 0.2} ${x - w * 0.32} ${top} ${x} ${top}C${x + w * 0.32} ${top} ${r} ${top + h * 0.2} ${r} ${y}Z`
    : `M${l} ${y}C${l} ${y - h * 0.55} ${x - w * 0.12} ${top} ${x} ${top}C${x + w * 0.12} ${top} ${r} ${y - h * 0.55} ${r} ${y}Z`;
  return (
    <>
      <path d={d} fill={fill} />
      <path d={d} fill={s} />
    </>
  );
}

/** An engine bell ending on the nozzle line. */
function Bell({ x, w, s, h = 10 }: { x: number; w: number; s: string; h?: number }) {
  const y = NOZZLE_Y - h;
  const d = `M${x - w * 0.3} ${y}H${x + w * 0.3}L${x + w / 2} ${NOZZLE_Y}H${x - w / 2}Z`;
  return (
    <>
      <path d={d} fill={DARK} />
      <path d={d} fill={s} />
    </>
  );
}

/** A fin attached at `x`, sweeping out to the left (-1) or right (1). */
function Fin({ x, y, w, h, dir, fill }: { x: number; y: number; w: number; h: number; dir: 1 | -1; fill: string }) {
  return <path d={`M${x} ${y}L${x + dir * w} ${y + h * 0.7}V${y + h}H${x}Z`} fill={fill} stroke="#000" strokeOpacity={0.2} strokeWidth={0.4} />;
}

/** A launch escape tower on top of a crew capsule whose tip is at `y`. */
function Tower({ x, y, h }: { x: number; y: number; h: number }) {
  return (
    <g>
      <path d={`M${x - 2.5} ${y}L${x} ${y - h * 0.45}L${x + 2.5} ${y}`} stroke="#9CA1AB" strokeWidth={0.7} fill="none" />
      <rect x={x - 1.3} y={y - h * 0.9} width={2.6} height={h * 0.45} fill="#C9CCD2" />
      <path d={`M${x - 1.3} ${y - h * 0.9}L${x} ${y - h}L${x + 1.3} ${y - h * 0.9}Z`} fill="#C9CCD2" />
    </g>
  );
}

interface Design {
  /** Engine nozzles as [centre x, width]; the exhaust is drawn under each. */
  nozzles: [number, number][];
  body: (s: string, accent: string) => ReactNode;
}

const DESIGNS: Record<RocketId, Design> = {
  // White three-stage stack with the black roll pattern, four fins and an escape tower.
  "saturn-v": {
    nozzles: [[50, 8], [60, 8], [70, 8]],
    body: (s, a) => (
      <>
        <Bell x={50} w={8} s={s} />
        <Bell x={60} w={8} s={s} />
        <Bell x={70} w={8} s={s} />
        <Cyl x={60} y={118} w={30} h={88} fill={WHITE} s={s} />
        <Cyl x={60} y={118} w={30} h={9} fill={BLACK} s={s} />
        <Cyl x={60} y={190} w={30} h={8} fill={BLACK} s={s} />
        <rect x={45} y={146} width={7.5} height={34} fill={BLACK} opacity={0.9} />
        <rect x={67.5} y={146} width={7.5} height={34} fill={BLACK} opacity={0.9} />
        <Fin x={45} y={180} w={8} h={26} dir={-1} fill={OFF_WHITE} />
        <Fin x={75} y={180} w={8} h={26} dir={1} fill={OFF_WHITE} />
        <Cyl x={60} y={64} w={30} h={54} fill={WHITE} s={s} />
        <Cyl x={60} y={64} w={30} h={5} fill={BLACK} s={s} />
        <Cyl x={60} y={96} w={30} h={3} fill={a} s={s} />
        <Taper x={60} y={56} wt={22} w={30} h={8} fill={WHITE} s={s} />
        <Cyl x={60} y={34} w={22} h={22} fill={WHITE} s={s} />
        <Cyl x={60} y={40} w={22} h={4} fill={BLACK} s={s} />
        <Taper x={60} y={27} wt={14} w={22} h={7} fill={OFF_WHITE} s={s} />
        <Taper x={60} y={19} wt={4} w={14} h={8} fill="#C9CCD2" s={s} />
        <Tower x={60} y={19} h={16} />
      </>
    ),
  },
  // Copper core with a wide white payload fairing and two slim solid boosters.
  "atlas-v": {
    nozzles: [[44, 7], [56, 7], [64, 7], [76, 7]],
    body: (s, a) => (
      <>
        <Bell x={44} w={7} s={s} />
        <Bell x={76} w={7} s={s} />
        <Bell x={56} w={7} s={s} />
        <Bell x={64} w={7} s={s} />
        <Cyl x={44} y={150} w={8} h={56} fill={WHITE} s={s} />
        <Nose x={44} y={150} w={8} h={14} fill={WHITE} s={s} />
        <Cyl x={76} y={150} w={8} h={56} fill={WHITE} s={s} />
        <Nose x={76} y={150} w={8} h={14} fill={WHITE} s={s} />
        <Cyl x={60} y={104} w={24} h={102} fill="#C8743A" s={s} />
        <Cyl x={60} y={104} w={24} h={4} fill={DARK} s={s} />
        <Cyl x={60} y={198} w={24} h={8} fill={DARK} s={s} />
        <Cyl x={60} y={130} w={24} h={3} fill={a} s={s} />
        <Taper x={60} y={96} wt={30} w={24} h={8} fill={WHITE} s={s} />
        <Cyl x={60} y={46} w={30} h={50} fill={WHITE} s={s} />
        <Nose x={60} y={46} w={30} h={34} fill={WHITE} s={s} />
      </>
    ),
  },
  // Stainless-steel booster and ship, with a dark heat shield and flaps.
  starship: {
    nozzles: [[52, 7], [60, 7], [68, 7]],
    body: (s, a) => (
      <>
        <Bell x={52} w={7} s={s} />
        <Bell x={60} w={7} s={s} />
        <Bell x={68} w={7} s={s} />
        <Cyl x={60} y={112} w={26} h={94} fill={STEEL} s={s} />
        <Cyl x={60} y={150} w={26} h={3} fill={a} s={s} />
        <rect x={43} y={116} width={4} height={7} fill={DARK} />
        <rect x={73} y={116} width={4} height={7} fill={DARK} />
        <Cyl x={60} y={104} w={26} h={8} fill={DARK} s={s} />
        <Cyl x={60} y={40} w={26} h={64} fill="#C9CED5" s={s} />
        <Nose x={60} y={40} w={26} h={30} fill="#C9CED5" s={s} />
        <rect x={60} y={40} width={13} height={64} fill="#1F2227" opacity={0.92} />
        <path d="M60 40V10C63.1 10 73 23.5 73 40Z" fill="#1F2227" opacity={0.92} />
        <rect x={47} y={40} width={26} height={64} fill={s} />
        <Fin x={47} y={40} w={6} h={12} dir={-1} fill={DARK} />
        <Fin x={73} y={40} w={6} h={12} dir={1} fill={DARK} />
        <Fin x={47} y={84} w={8} h={20} dir={-1} fill={DARK} />
        <Fin x={73} y={84} w={8} h={20} dir={1} fill={DARK} />
      </>
    ),
  },
  // Three white cores side by side, carbon nose cones on the side boosters.
  "falcon-heavy": {
    nozzles: [[43, 9], [60, 9], [77, 9]],
    body: (s, a) => (
      <>
        {[43, 77].map((x) => (
          <g key={x}>
            <Bell x={x} w={9} s={s} />
            <Cyl x={x} y={96} w={16} h={110} fill={WHITE} s={s} />
            <Nose x={x} y={96} w={16} h={20} fill="#3A3D44" s={s} />
            <Cyl x={x} y={194} w={16} h={12} fill={BLACK} s={s} />
            <rect x={x - 9.5} y={100} width={3} height={5} fill={DARK} />
            <rect x={x + 6.5} y={100} width={3} height={5} fill={DARK} />
          </g>
        ))}
        <Bell x={60} w={9} s={s} />
        <Cyl x={60} y={66} w={16} h={140} fill={WHITE} s={s} />
        <Cyl x={60} y={194} w={16} h={12} fill={BLACK} s={s} />
        <Cyl x={60} y={120} w={16} h={3} fill={a} s={s} />
        <Cyl x={60} y={58} w={16} h={8} fill={BLACK} s={s} />
        <Cyl x={60} y={34} w={16} h={24} fill={WHITE} s={s} />
        <Taper x={60} y={30} wt={20} w={16} h={4} fill={WHITE} s={s} />
        <Cyl x={60} y={18} w={20} h={12} fill={WHITE} s={s} />
        <Nose x={60} y={18} w={20} h={16} fill={WHITE} s={s} />
      </>
    ),
  },
  // Grey core with two black-and-white striped solid boosters and a long Centaur shroud.
  "titan-iiie": {
    nozzles: [[41, 11], [60, 8], [79, 11]],
    body: (s, a) => (
      <>
        <Bell x={41} w={11} s={s} />
        <Bell x={60} w={8} s={s} />
        <Bell x={79} w={11} s={s} />
        {[41, 79].map((x) => (
          <g key={x}>
            <Cyl x={x} y={96} w={14} h={110} fill={WHITE} s={s} />
            <Nose x={x} y={96} w={14} h={16} fill={WHITE} s={s} />
            {[112, 132, 152, 172, 192].map((y) => (
              <Cyl key={y} x={x} y={y} w={14} h={7} fill={BLACK} s={s} />
            ))}
          </g>
        ))}
        <Cyl x={60} y={78} w={20} h={128} fill="#9AA0A8" s={s} />
        <Cyl x={60} y={120} w={20} h={3} fill={a} s={s} />
        <Cyl x={60} y={72} w={22} h={6} fill={DARK} s={s} />
        <Cyl x={60} y={30} w={22} h={42} fill={WHITE} s={s} />
        <Nose x={60} y={30} w={22} h={24} fill={WHITE} s={s} />
      </>
    ),
  },
  // White core flanked by two tall pointed boosters, under a big rounded fairing.
  "ariane-5": {
    nozzles: [[40, 10], [60, 10], [80, 10]],
    body: (s, a) => (
      <>
        <Bell x={40} w={10} s={s} />
        <Bell x={60} w={10} s={s} />
        <Bell x={80} w={10} s={s} />
        {[40, 80].map((x) => (
          <g key={x}>
            <Cyl x={x} y={84} w={14} h={122} fill="#E6E7EA" s={s} />
            <Nose x={x} y={84} w={14} h={22} fill="#E6E7EA" s={s} />
            <Cyl x={x} y={130} w={14} h={2} fill={GREY} s={s} />
            <Cyl x={x} y={196} w={14} h={10} fill={GREY} s={s} />
          </g>
        ))}
        <Cyl x={60} y={64} w={24} h={142} fill={WHITE} s={s} />
        <Cyl x={60} y={104} w={24} h={3} fill={a} s={s} />
        <Taper x={60} y={58} wt={28} w={24} h={6} fill={GREY} s={s} />
        <Cyl x={60} y={36} w={28} h={22} fill={WHITE} s={s} />
        <Nose x={60} y={36} w={28} h={26} fill={WHITE} s={s} blunt />
      </>
    ),
  },
  // Orange foam core, two white boosters with black bands, Orion capsule and escape tower.
  sls: {
    nozzles: [[39, 10], [54, 8], [66, 8], [81, 10]],
    body: (s, a) => (
      <>
        <Bell x={39} w={10} s={s} />
        <Bell x={54} w={8} s={s} />
        <Bell x={66} w={8} s={s} />
        <Bell x={81} w={10} s={s} />
        {[39, 81].map((x) => (
          <g key={x}>
            <Cyl x={x} y={74} w={12} h={132} fill={WHITE} s={s} />
            <Nose x={x} y={74} w={12} h={16} fill={WHITE} s={s} />
            <Cyl x={x} y={92} w={12} h={4} fill={BLACK} s={s} />
            <Cyl x={x} y={194} w={13} h={12} fill={BLACK} s={s} />
          </g>
        ))}
        <Cyl x={60} y={82} w={26} h={124} fill="#D9772F" s={s} />
        <Cyl x={60} y={140} w={26} h={3} fill={a} s={s} />
        <Taper x={60} y={64} wt={18} w={26} h={18} fill={WHITE} s={s} />
        <Cyl x={60} y={50} w={18} h={14} fill={WHITE} s={s} />
        <Taper x={60} y={34} wt={6} w={18} h={16} fill={OFF_WHITE} s={s} />
        <Tower x={60} y={34} h={22} />
      </>
    ),
  },
  // Tall white single stick with a wide 7 m fairing, strakes and landing legs.
  "new-glenn": {
    nozzles: [[52, 7], [60, 7], [68, 7]],
    body: (s, a) => (
      <>
        <Bell x={52} w={7} s={s} />
        <Bell x={60} w={7} s={s} />
        <Bell x={68} w={7} s={s} />
        <Cyl x={60} y={118} w={24} h={88} fill={WHITE} s={s} />
        <Cyl x={60} y={198} w={24} h={8} fill={DARK} s={s} />
        <Fin x={48} y={168} w={7} h={30} dir={-1} fill={OFF_WHITE} />
        <Fin x={72} y={168} w={7} h={30} dir={1} fill={OFF_WHITE} />
        <Fin x={48} y={120} w={5} h={10} dir={-1} fill={DARK} />
        <Fin x={72} y={120} w={5} h={10} dir={1} fill={DARK} />
        <Cyl x={60} y={150} w={24} h={3} fill={a} s={s} />
        <Cyl x={60} y={112} w={24} h={6} fill={DARK} s={s} />
        <Cyl x={60} y={86} w={24} h={26} fill={WHITE} s={s} />
        <Taper x={60} y={80} wt={30} w={24} h={6} fill={WHITE} s={s} />
        <Cyl x={60} y={30} w={30} h={50} fill={WHITE} s={s} />
        <Nose x={60} y={30} w={30} h={22} fill={WHITE} s={s} blunt />
      </>
    ),
  },
};

/** off = on the pad, idle = cruising burn, blast = speed boost, stall = sputtering after a fallacy. */
export type FlameState = "off" | "idle" | "blast" | "stall";

const FLAME_SHAPE: Record<Exclude<FlameState, "off">, { scaleX: number; scaleY: number; opacity: number }> = {
  idle: { scaleX: 0.9, scaleY: 0.6, opacity: 0.9 },
  blast: { scaleX: 1.45, scaleY: 3, opacity: 1 },
  stall: { scaleX: 0.8, scaleY: 0.45, opacity: 0.5 },
};

export function Rocket({
  model,
  idp,
  accent,
  width = 96,
  flame = "off",
}: {
  model: RocketId;
  idp: string; // unique prefix for SVG ids
  accent: string; // team colour, shown as a band on the rocket
  width?: number;
  flame?: FlameState;
}) {
  const id = (s: string) => `${idp}-${s}`;
  const url = (s: string) => `url(#${id(s)})`;
  const design = DESIGNS[model];
  return (
    <svg width={width} height={(width * 260) / 120} viewBox="0 0 120 260" fill="none" overflow="visible" aria-hidden="true">
      <defs>
        <linearGradient id={id("sh")} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".5" />
          <stop offset=".18" stopColor="#000" stopOpacity=".12" />
          <stop offset=".34" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".06" />
          <stop offset=".78" stopColor="#000" stopOpacity=".22" />
          <stop offset="1" stopColor="#000" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id={id("f")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF4D6" />
          <stop offset=".25" stopColor="#FFC56B" />
          <stop offset=".6" stopColor="#F2742B" stopOpacity=".8" />
          <stop offset="1" stopColor="#F2742B" stopOpacity="0" />
        </linearGradient>
        <filter id={id("b")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {flame !== "off" && (
        <>
          <motion.ellipse
            cx={60}
            cy={NOZZLE_Y + 16}
            rx={34}
            ry={18}
            fill="#FFB45A"
            filter={url("b")}
            initial={false}
            animate={{ opacity: flame === "blast" ? 0.75 : flame === "idle" ? 0.14 : 0 }}
            transition={{ duration: 0.3 }}
          />
          <motion.g
            style={{ originX: 0.5, originY: 0 }}
            initial={false}
            animate={FLAME_SHAPE[flame]}
            transition={flame === "blast" ? { type: "spring", stiffness: 260, damping: 13 } : { duration: 0.6, ease: "easeOut" }}
          >
            <g className={`origin-top [transform-box:fill-box] ${flame === "stall" ? "animate-sputter" : "animate-flicker"}`}>
              {design.nozzles.map(([x, w]) => (
                <g key={x}>
                  <path d={`M${x - w / 2} ${NOZZLE_Y}Q${x} ${NOZZLE_Y + w * 4.5} ${x + w / 2} ${NOZZLE_Y}Z`} fill={url("f")} />
                  <path d={`M${x - w / 4} ${NOZZLE_Y}Q${x} ${NOZZLE_Y + w * 2.2} ${x + w / 4} ${NOZZLE_Y}Z`} fill="#FFF6DD" opacity={0.9} />
                </g>
              ))}
            </g>
          </motion.g>
        </>
      )}

      {design.body(url("sh"), accent)}
    </svg>
  );
}
