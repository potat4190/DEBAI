// Shared HUD building blocks (buttons, fields, labels, panel corners) for the three screens.
import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const btnPrimary =
  "inline-flex items-center justify-center gap-3 rounded-[2px] bg-ink font-mono font-medium text-space transition hover:enabled:bg-white disabled:cursor-not-allowed disabled:opacity-40";
export const btnPrimaryLg = cx(btnPrimary, "h-[54px] w-full min-w-0 px-10 text-sm tracking-[5px] sm:w-auto sm:min-w-60");
export const btnPrimarySm = cx(btnPrimary, "h-11 min-w-[180px] px-6 text-xs tracking-[4px]");

export const btnGhost =
  "inline-flex h-12 items-center justify-center gap-2.5 rounded-[2px] border border-line-2 bg-white/[0.03] px-[18px] font-mono text-[13px] tracking-[2px] text-ink hover:enabled:border-ink disabled:cursor-not-allowed disabled:opacity-40";

export const chipBtn =
  "h-[26px] rounded-[2px] border border-line-2 bg-white/[0.03] px-2.5 font-mono text-[10px] tracking-[2px] text-ink hover:border-ink";

export const field =
  "h-12 w-full rounded-[2px] border border-line-2 bg-field px-3.5 font-mono text-[13px] tracking-[1px] text-ink outline-none focus:outline focus:outline-1 focus:outline-ai";

export const segBtn =
  "h-10 rounded-[2px] border border-line-2 bg-white/[0.03] font-mono text-xs tracking-[2px] text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-space";

/** Small mono uppercase label. */
export function Label({ children, className, color }: { children: ReactNode; className?: string; color?: string }) {
  return (
    <span className={cx("font-mono text-[11px] tracking-[3px] text-muted-foreground", className)} style={color ? { color } : undefined}>
      {children}
    </span>
  );
}

export function Dot({ color, pulse, size = 7 }: { color: string; pulse?: boolean; size?: number }) {
  return (
    <span
      className={cx("block flex-none rounded-full", pulse && "animate-blink")}
      style={{ background: color, width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function TopBar({ children, transparent }: { children: ReactNode; transparent?: boolean }) {
  return (
    <header
      className={cx(
        "relative z-[2] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line px-4 py-3 font-mono text-[11px] tracking-[2px] text-muted-foreground sm:px-6 sm:py-3.5",
        transparent ? "bg-transparent" : "bg-space/60",
      )}
    >
      {children}
    </header>
  );
}

/** Bracket-style corner marks on a panel (top-left, and bottom-right unless `both` is false). */
export function Corners({ color, both = true, size = 14 }: { color: string; both?: boolean; size?: number }) {
  const base = "pointer-events-none absolute border-0 border-solid";
  return (
    <>
      <span className={cx(base, "-left-px -top-px border-l border-t")} style={{ borderColor: color, width: size, height: size }} aria-hidden="true" />
      {both && (
        <span className={cx(base, "-bottom-px -right-px border-b border-r")} style={{ borderColor: color, width: size, height: size }} aria-hidden="true" />
      )}
    </>
  );
}

export function Spinner() {
  return <span className="block size-3 animate-spin rounded-full border border-muted-foreground border-t-ink" aria-hidden="true" />;
}

export function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
