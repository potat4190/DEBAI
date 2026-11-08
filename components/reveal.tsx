"use client";
// Scroll-in reveals: content fades up once as it enters the viewport. Motion skips the movement
// (keeps the fade) when the visitor prefers reduced motion, via <MotionConfig reducedMotion="user">.

import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  amount = 0.15,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /** How much of the element must be visible before it reveals. */
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A parent that reveals its <RevealItem> children one after another. */
export function RevealGroup({ children, className, stagger = 0.07, delay = 0 }: { children: ReactNode; className?: string; stagger?: number; delay?: number }) {
  const variants: Variants = { hidden: {}, shown: { transition: { staggerChildren: stagger, delayChildren: delay } } };
  return (
    <motion.div className={className} variants={variants} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.1 }}>
      {children}
    </motion.div>
  );
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
