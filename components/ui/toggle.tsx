"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Toggle as TogglePrimitive } from "radix-ui"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-muted",
        // DebAI's flight-console segmented buttons: mono caps, inverted when selected.
        hud: "rounded-[2px] border border-line-2 bg-white/[0.03] font-mono text-[11px] font-normal tracking-[2px] text-ink hover:bg-white/[0.07] hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-space data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-space",
        // A selectable card (destination picker): outlined, brightens when chosen.
        panel: "rounded-[2px] border border-white/12 bg-space/55 text-left font-normal whitespace-normal text-ink hover:border-white/30 hover:bg-space/55 hover:text-ink data-[state=on]:border-ink data-[state=on]:bg-ink/[0.07]",
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        hud: "h-10 min-w-10 rounded-[2px] px-3",
        panel: "h-auto justify-start gap-5 py-[18px] pr-5 pl-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
