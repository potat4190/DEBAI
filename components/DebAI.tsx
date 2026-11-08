"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type { Exchange, GameConfig, Outcome, RocketState } from "@/lib/game";
import { stopAudio } from "@/lib/client/audio";
import SetupScreen from "./SetupScreen";
import RaceScreen from "./RaceScreen";
import ResultsScreen from "./ResultsScreen";

export interface Integrations {
  gemini: boolean;
  voice: boolean;
}

export interface RaceSummary {
  exchanges: Exchange[];
  outcome: Required<Outcome>;
  user: RocketState;
  ai: RocketState;
  elapsedMs: number;
}

type Screen = { name: "setup" } | { name: "race"; config: GameConfig; run: number } | { name: "results"; config: GameConfig; summary: RaceSummary };

/** Top-level flow: Start -> Race -> Results. */
export default function DebAI() {
  const [screen, setScreen] = useState<Screen>({ name: "setup" });
  const [lastConfig, setLastConfig] = useState<GameConfig | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setIntegrations)
      .catch(() => setIntegrations({ gemini: false, voice: false }));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen.name]);

  const toSetup = () => {
    stopAudio();
    setScreen({ name: "setup" });
  };

  let content: React.ReactNode;
  let key: string;
  if (screen.name === "race") {
    key = `race-${screen.run}`;
    content = (
      <RaceScreen
        config={screen.config}
        integrations={integrations}
        onAbort={toSetup}
        onFinish={(summary) => setScreen({ name: "results", config: screen.config, summary })}
      />
    );
  } else if (screen.name === "results") {
    key = "results";
    content = (
      <ResultsScreen
        config={screen.config}
        summary={screen.summary}
        onRestart={toSetup}
        onRematch={() => setScreen({ name: "race", config: screen.config, run: Date.now() })}
      />
    );
  } else {
    key = "setup";
    content = (
      <SetupScreen
        initial={lastConfig}
        integrations={integrations}
        onStart={(config) => {
          setLastConfig(config);
          setScreen({ name: "race", config, run: Date.now() });
        }}
      />
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {content}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
