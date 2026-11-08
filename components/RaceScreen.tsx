"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  BARGE_IN_MS,
  MAX_SCORE,
  STREAK_LENGTH,
  VOICE_PROFILES,
  formatMiles,
  getDestination,
  otherSide,
  pickMood,
  raceLimitMs,
  sideLabel,
  stripCues,
  countFillersAndStutters,
  timeUpOutcome,
  vehiclesFor,
  type CutoffReason,
  type Delivery,
  type Destination,
  type Exchange,
  type GameConfig,
  type JudgeResult,
  type OpponentSentence,
  type Outcome,
  type RocketState,
  type TurnScore,
  type Vehicle,
} from "@/lib/game";
import { postJson, streamOpponent } from "@/lib/client/api";
import { createSpeechQueue, fetchClip, isMuted, setMuted, stopAudio } from "@/lib/client/audio";
import { initialRaceState, raceReducer, scoreExchange, type Phase, type RaceAction } from "@/lib/client/raceReducer";
import { startMonitor, stepMonitor, type MonitorState } from "@/lib/client/turnMonitor";
import { useLiveCaptions } from "@/lib/client/useLiveCaptions";
import { useRecorder } from "@/lib/client/useRecorder";
import { VoiceActivity } from "@/lib/client/voiceActivity";
import { cn } from "@/lib/utils";
import type { Integrations, RaceSummary } from "./DebAI";
import { Corners, Dot, MicIcon, Spinner, TopBar, btnGhost, btnPrimarySm, chipBtn } from "./hud";
import { BLAST_SECONDS, BOOST_SECONDS, RaceTrack } from "./RaceTrack";
import { EASE_OUT, RevealGroup, RevealItem } from "./reveal";

const PHASE_LABEL: Record<Phase, string> = {
  user: "YOUR TURN",
  opponent: "{AI} IS TALKING…",
  waiting: "JUDGE SCORING THE FINAL EXCHANGE…",
  finishing: "COMPUTING FINAL TRAJECTORY…",
};

const CUTOFF_NOTICE: Record<CutoffReason, string> = {
  silent: "{AI} JUMPED IN · YOU DIDN'T START",
  stall: "{AI} CUT YOU OFF · TOO MUCH HESITATION",
  ramble: "{AI} CUT YOU OFF · YOUR TURN RAN LONG",
};

/** One previous exchange, as the opponent sees it. */
interface HistoryTurn {
  user: string;
  ai: string;
  aiCutOff?: boolean;
}

/** A pre-voiced line, fetched once when the race starts. */
interface Clip {
  text: string;
  url: Promise<string | null>;
}
type ClipKind = CutoffReason | "thinking";

// Pre-voiced lines are cached for the whole session, so remounts and rematches don't ask Fish Audio
// for them again (its account-wide limit on requests at once is low).
const clipCache = new Map<string, Clip>();
function cachedClip(text: string, speed: number): Clip {
  const key = `${speed}|${text}`;
  let clip = clipCache.get(key);
  if (!clip) {
    const url = fetchClip({ text, speed }, true).then((u) => {
      if (!u) clipCache.delete(key); // failed: try again next race
      return u;
    });
    clip = { text, url };
    clipCache.set(key, clip);
  }
  return clip;
}

// The transcript normally takes 1-2 s; never let a stuck recording hold up the AI's turn.
const TRANSCRIPT_TIMEOUT_MS = 12_000;
/** How long "TIME'S UP" stays on screen before the results. */
const TIME_UP_HOLD_MS = 1600;

/** Used if the judge fails twice in a row, so the race can carry on. */
function fallbackJudge(): JudgeResult {
  const score: TurnScore = {
    rubric: { claim: 2, evidence: 2, rebuttal: 2, relevance: 2, confidence: 2 },
    total: 10,
    reason: "The judge was unavailable, so this exchange was scored as a tie.",
    fallacy: null,
  };
  return { user: score, ai: { ...score }, winner: "tie", winningSummary: "", verdict: "Judge unavailable: scored as a tie." };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function RaceScreen({
  config,
  integrations,
  onAbort,
  onFinish,
}: {
  config: GameConfig;
  integrations: Integrations | null;
  onAbort: () => void;
  onFinish: (summary: RaceSummary) => void;
}) {
  const dest = getDestination(config.destination);
  const vehicles = vehiclesFor(dest.id);
  const withAi = (text: string) => text.replace("{AI}", vehicles.ai.tag);
  const profile = VOICE_PROFILES[config.difficulty];
  const [state, dispatch] = useReducer(raceReducer, dest, initialRaceState);
  const { user, ai, exchanges, pending, phase, draft, transmission, turnLeft, error, notice, boosting, stoppedAt } = state;
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Dispatches and updates stateRef straight away, so async code never reads a stale state. */
  const act = (action: RaceAction) => {
    stateRef.current = raceReducer(stateRef.current, action);
    dispatch(action);
  };

  const [muted, setMutedState] = useState(isMuted());
  const startedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const timelineEnd = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const finishedRef = useRef(false);
  /** The race clock ran out: no new turns, only the scoring of exchanges already spoken. */
  const timeUpRef = useRef(false);
  const [timeUp, setTimeUp] = useState(false);

  const captions = useLiveCaptions();
  const captionsRef = useRef("");
  captionsRef.current = captions.text;
  const recorder = useRecorder((text) => dispatch({ type: "appendDraft", text }));
  const voiceInput = Boolean(integrations?.voice) && recorder.supported;
  const interruptions = config.interruptions && voiceInput;
  const recording = recorder.state === "recording";
  const transcribing = recorder.state === "transcribing";

  // Hands-free: the mic opens by itself at the start of each of your turns (until you switch it off).
  const [handsFree, setHandsFree] = useState(true);
  const [patience, setPatience] = useState(0);
  const [endingIn, setEndingIn] = useState<number | null>(null);
  const [talking, setTalking] = useState(false); // you've started speaking this turn
  const typedRef = useRef(false);
  const monitorRef = useRef<MonitorState | null>(null); // this turn's pauses, for the confidence score

  const historyRef = useRef<HistoryTurn[]>([]); // every finished exchange, scored or not
  const lastAiTextRef = useRef<string | null>(null); // the AI's last spoken argument (the judge's context)
  const scoringRef = useRef<Promise<void>>(Promise.resolve());
  const vadRef = useRef<VoiceActivity | null>(null);
  const bargeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipsRef = useRef<Partial<Record<ClipKind, Clip[]>>>({});

  // Clocks: the race clock (counts down from the destination's time limit) and your turn timer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (phase !== "user") return;
    const t = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const submitRef = useRef<(opts?: { cutoff?: CutoffReason }) => void>(() => {});
  useEffect(() => {
    if (phase === "user" && turnLeft === 0) submitRef.current();
  }, [turnLeft, phase]);

  useEffect(() => {
    timelineEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [exchanges.length, pending.length, phase]);

  useEffect(() => {
    // React remounts components once in development; the race must come back to life after that.
    finishedRef.current = false;
    return () => {
      finishedRef.current = true;
      if (bargeTimerRef.current) clearInterval(bargeTimerRef.current);
      stopAudio();
    };
  }, []);

  // Pre-voice the short lines the AI says when it cuts in or "thinks", so they play with no delay.
  // They queue behind the AI's live reply, so they never compete with it.
  useEffect(() => {
    if (!integrations?.voice) return;
    const kinds: ClipKind[] = config.interruptions ? ["thinking", "silent", "stall", "ramble"] : ["thinking"];
    const clips: Partial<Record<ClipKind, Clip[]>> = {};
    for (const kind of kinds) clips[kind] = profile.lines[kind].map((text) => cachedClip(text, profile.speed));
    clipsRef.current = clips;
  }, [integrations?.voice, config.interruptions, profile]);

  // Voice detector on the race-long mic stream.
  useEffect(() => {
    if (!voiceInput) return;
    let cancelled = false;
    let vad: VoiceActivity | null = null;
    void recorder.ensureStream().then((stream) => {
      if (!stream || cancelled) return;
      vad = new VoiceActivity(stream);
      vadRef.current = vad;
    });
    return () => {
      cancelled = true;
      vad?.close();
      vadRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceInput]);

  function startSpeaking() {
    recorder.clearError();
    void recorder.start();
    captions.start();
  }

  function stopSpeaking() {
    captions.stop();
    recorder.stop();
  }

  /** Stops listening, talking and the barge-in detector. */
  function silenceEverything() {
    if (bargeTimerRef.current) clearInterval(bargeTimerRef.current);
    bargeTimerRef.current = null;
    stopAudio();
    captions.stop();
    recorder.discard();
  }

  // Hands-free: open the mic when your turn starts.
  useEffect(() => {
    if (phase !== "user" || !voiceInput || !handsFree || finishedRef.current || timeUpRef.current) return;
    typedRef.current = Boolean(stateRef.current.draft.trim());
    startSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voiceInput, handsFree]);

  // While you talk: end the turn when you stop, or let the AI cut in (interruptions on).
  useEffect(() => {
    if (phase !== "user" || !recording) {
      setPatience(0);
      setEndingIn(null);
      setTalking(false);
      return;
    }
    let mon = startMonitor(Date.now());
    monitorRef.current = mon;
    const opts = { timing: profile.timing, interruptions };
    const t = setInterval(() => {
      const vad = vadRef.current;
      if (!vad) return;
      const at = Date.now();
      const r = stepMonitor(mon, { now: at, speaking: vad.sample(at).speaking, captions: captionsRef.current, typing: typedRef.current }, opts);
      mon = r.state;
      monitorRef.current = mon;
      setTalking(mon.heardSpeech);
      setPatience((p) => (Math.abs(p - r.patience) >= 0.02 ? r.patience : p));
      // Only show the countdown once the silence is clearly a pause, not a breath.
      const showEnding = r.endingIn !== null && mon.silenceSince !== null && at - mon.silenceSince > 600;
      setEndingIn(showEnding ? Math.ceil((r.endingIn ?? 0) / 100) / 10 : null);
      if (r.event) {
        clearInterval(t);
        submitRef.current(r.event.type === "cutoff" ? { cutoff: r.event.reason } : {});
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase, recording, interruptions, profile.timing]);

  function finish(outcome: Required<Outcome>, rockets: { user: RocketState; ai: RocketState }) {
    const end = Date.now();
    act({ type: "finished", at: end });
    onFinish({ exchanges: stateRef.current.exchanges, outcome, user: rockets.user, ai: rockets.ai, elapsedMs: end - startedAt.current });
  }

  /** Scores an exchange in the background; exchanges are applied strictly in order. */
  function scoreInBackground(input: {
    index: number;
    userText: string;
    aiText: string;
    context: string | null;
    mood: ReturnType<typeof pickMood>;
    userDelivery?: Delivery;
    aiVoiced: string;
  }) {
    const body = {
      motion: config.motion,
      userSide: config.side,
      context: input.context,
      userText: input.userText,
      aiText: input.aiText,
      userDelivery: input.userDelivery,
      aiVoiced: input.aiVoiced,
      destination: config.destination,
    };
    const judged = postJson<JudgeResult>("/api/judge", body)
      .catch(() => wait(1500).then(() => postJson<JudgeResult>("/api/judge", body)))
      .catch(() => {
        act({ type: "notice", text: `JUDGE UNAVAILABLE · EXCHANGE ${input.index} SCORED AS A TIE` });
        return fallbackJudge();
      });

    scoringRef.current = scoringRef.current.then(async () => {
      const judge = await judged;
      if (finishedRef.current) return;
      const { exchange, outcome } = scoreExchange(stateRef.current, dest, {
        userText: input.userText,
        aiText: input.aiText,
        mood: input.mood,
        judge,
        at: Date.now() - startedAt.current,
      });
      act({ type: "scored", exchange, outcome });
      if (outcome.over) {
        // Race over: stop listening and talking, let the rockets finish climbing, then show results.
        finishedRef.current = true;
        silenceEverything();
      }
      await wait((BLAST_SECONDS + BOOST_SECONDS) * 1000 + 400);
      act({ type: "boostDone" });
      if (outcome.over) finish(outcome as Required<Outcome>, { user: exchange.userAfter, ai: exchange.aiAfter });
    });
  }

  /**
   * The race clock ran out before either rocket arrived. A turn in progress is dropped, exchanges
   * already spoken are still scored, then the rocket closer to the destination wins.
   */
  async function endOnTime() {
    if (finishedRef.current || timeUpRef.current) return;
    const p = stateRef.current.phase;
    if (p === "waiting" || p === "finishing") return; // the final exchange is already in: it decides the race
    timeUpRef.current = true;
    setTimeUp(true);
    silenceEverything();
    act({ type: "timeUp" });
    await scoringRef.current;
    if (finishedRef.current) return; // one of those exchanges ended the race (a rocket arrived)
    finishedRef.current = true;
    const s = stateRef.current;
    const total = (k: "user" | "ai") => s.exchanges.reduce((sum, e) => sum + e.judge[k].total, 0);
    const outcome = timeUpOutcome(s.user, s.ai, total("user"), total("ai"));
    act({ type: "ended", outcome });
    await wait(TIME_UP_HOLD_MS);
    finish(outcome, { user: s.user, ai: s.ai });
  }

  const limitMs = raceLimitMs(dest);
  const timeLeftMs = Math.max(0, startedAt.current + limitMs - (stoppedAt ?? now));
  const outOfTime = timeLeftMs <= 0;
  useEffect(() => {
    if (outOfTime) void endOnTime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfTime]);

  async function submitTurn(opts: { cutoff?: CutoffReason } = {}) {
    if (submitting.current || finishedRef.current || timeUpRef.current || stateRef.current.phase !== "user") return;
    submitting.current = true;
    const before = stateRef.current;
    const index = before.exchanges.length + before.pending.length + 1;
    const last = index >= dest.maxExchanges;
    const speed = profile.speed;
    const { cutoff } = opts;
    const stopped = () => finishedRef.current || timeUpRef.current;

    // The AI speaks first thing: a cut-in line, or sometimes a quick "Hmm" while it thinks.
    const lead = cutoff ? clipsRef.current[cutoff] : Math.random() < 0.6 ? clipsRef.current.thinking : undefined;
    const leadClip = lead?.length ? pick(lead) : null;
    const interjection = cutoff ? (leadClip?.text ?? pick(profile.lines[cutoff])) : null;
    const interjectionLine: OpponentSentence | null = interjection
      ? { text: stripCues(interjection), emotion: "neutral", tagged: interjection }
      : null;
    const leadItems = leadClip ? 1 : 0;

    // Talking over the AI (interruptions on) arms once its actual reply starts playing.
    let played = -1;
    let barged = false;
    let onBarge: () => void = () => {};
    const bargeIn = new Promise<void>((r) => (onBarge = r));
    const armBargeIn = () => {
      if (!interruptions || bargeTimerRef.current) return;
      const armedAt = Date.now();
      let loudMs = 0;
      bargeTimerRef.current = setInterval(() => {
        const vad = vadRef.current;
        if (!vad || stopped()) return;
        const at = Date.now();
        const { loud } = vad.sample(at);
        if (at - armedAt < 300) return; // ignore the AI's first syllable leaking into the mic
        loudMs = loud ? loudMs + 50 : Math.max(0, loudMs - 25);
        if (loudMs >= BARGE_IN_MS) {
          barged = true;
          if (bargeTimerRef.current) clearInterval(bargeTimerRef.current);
          bargeTimerRef.current = null;
          stopAudio();
          onBarge();
        }
      }, 50);
    };
    const voice = createSpeechQueue((i) => {
      played = i;
      if (i >= leadItems) armBargeIn();
    });
    if (leadClip) voice.pushClip(leadClip.url);

    try {
      // Your recording becomes this turn's text (official Fish Audio transcript).
      const captionText = captionsRef.current;
      const mon = monitorRef.current;
      monitorRef.current = null;
      captions.stop();
      const spoken = await Promise.race([recorder.finish(true), wait(TRANSCRIPT_TIMEOUT_MS).then(() => "")]);
      if (stopped()) return;
      const userText = [before.draft.trim(), spoken].filter(Boolean).join(" ");

      // Confidence: long pauses come from the mic; fillers and stutters from whichever text caught
      // more of them (the transcript may tidy some away, live captions may miss others).
      let userDelivery: Delivery | undefined;
      if (spoken) {
        const fromTranscript = countFillersAndStutters(spoken);
        const fromCaptions = countFillersAndStutters(captionText);
        userDelivery = {
          spoken: true,
          words: 0, // counted by the judge from the final text
          fillers: Math.max(fromTranscript.fillers, fromCaptions.fillers),
          stutters: Math.max(fromTranscript.stutters, fromCaptions.stutters),
          longPauses: mon?.longPauses ?? 0,
        };
      }
      const mood = pickMood(before.exchanges, dest);
      act({ type: "draft", text: userText });
      act({ type: "submit", index, userText });
      act({ type: "notice", text: cutoff ? withAi(CUTOFF_NOTICE[cutoff]) : null });
      if (interjectionLine) act({ type: "sentence", sentence: interjectionLine });

      // The opponent's reply streams in; each sentence is shown and voiced as it arrives.
      const sentences: OpponentSentence[] = [];
      const stream = streamOpponent(
        {
          config,
          history: historyRef.current,
          userText,
          mood,
          turn: interjectionLine ? { cutoff, interjection: interjectionLine.text } : {},
        },
        (sentence) => {
          if (barged || stopped()) return;
          sentences.push(sentence);
          act({ type: "sentence", sentence });
          voice.push({ text: sentence.tagged, speed });
        },
      );
      stream.then(
        () => voice.close(),
        () => voice.close(),
      );

      // The AI's turn ends when it has finished talking, or when you talk over it.
      const result = await Promise.race([
        Promise.all([stream, voice.done]).then(([opp]) => opp),
        bargeIn.then(() => null),
      ]);
      if (bargeTimerRef.current) clearInterval(bargeTimerRef.current);
      bargeTimerRef.current = null;
      if (stopped()) return;

      // When cut off, only the sentences you actually heard count.
      const heard = barged ? sentences.slice(0, Math.max(1, played - leadItems + 1)) : sentences;
      const aiText = barged ? heard.map((s) => s.text).join(" ") : (result?.text ?? heard.map((s) => s.text).join(" "));

      if (barged && !last) startSpeaking(); // you're already talking: record straight away
      const context = lastAiTextRef.current;
      historyRef.current = [
        ...historyRef.current,
        { user: userText, ai: [interjectionLine?.text ?? "", aiText].filter(Boolean).join(" "), aiCutOff: barged },
      ];
      lastAiTextRef.current = aiText;
      act({
        type: "opponentDone",
        index,
        aiText,
        last,
        spoken: barged ? (interjectionLine ? [interjectionLine, ...heard] : heard) : undefined,
      });
      if (barged) act({ type: "notice", text: `YOU CUT ${vehicles.ai.tag} OFF` });

      // The judge scores this exchange in the background while the conversation carries on.
      scoreInBackground({ index, userText, aiText, context, mood, userDelivery, aiVoiced: heard.map((s) => s.tagged).join(" ") });
    } catch (err) {
      console.error(err);
      stopAudio();
      act({ type: "failed", index, error: err instanceof Error ? err.message : "Something went wrong. Try transmitting again." });
    } finally {
      if (bargeTimerRef.current) clearInterval(bargeTimerRef.current);
      bargeTimerRef.current = null;
      submitting.current = false;
    }
  }
  submitRef.current = (opts) => void submitTurn(opts);

  function toggleMute() {
    setMuted(!muted);
    setMutedState(!muted);
  }

  const exchangeNo = Math.min(exchanges.length + pending.length + (phase === "user" ? 1 : 0), dest.maxExchanges);
  const busy = phase !== "user";
  const timerText = mmss(turnLeft * 1000);
  const clockClass = timeLeftMs <= 15_000 ? "text-bad" : timeLeftMs <= 60_000 ? "text-warn" : "text-ink";
  const commsLabel = timeUp
    ? "TIME'S UP · THE CLOSER ROCKET WINS"
    : phase !== "user"
      ? withAi(PHASE_LABEL[phase])
      : transcribing
        ? "TRANSCRIBING YOUR TURN…"
        : recording
          ? endingIn !== null
            ? `SENDING IN ${endingIn.toFixed(1)}S`
            : talking
              ? "LISTENING · STOP TALKING TO SEND"
              : "LISTENING · SPEAK WHEN READY"
          : PHASE_LABEL.user;

  return (
    <main className="relative min-h-screen overflow-hidden bg-space">
      <TopBar transparent>
        <span className="flex items-center gap-3">
          DEB“AI”
          {integrations && !integrations.gemini && <span className="text-warn">SIMULATION</span>}
        </span>
        <span className="flex items-center gap-2">
          <Dot color="var(--color-bad)" pulse />
          EXCHANGE {exchangeNo}/{dest.maxExchanges}
        </span>
        <span className={cn("tabular-nums", clockClass)} aria-label="Race time left">
          T– {mmss(timeLeftMs)}
        </span>
        <span className="flex items-center gap-2">
          <button type="button" className={chipBtn} onClick={toggleMute} aria-pressed={muted}>
            {muted ? "VOICE OFF" : "VOICE ON"}
          </button>
          <button type="button" className={chipBtn} onClick={onAbort}>ABORT</button>
        </span>
      </TopBar>

      <RevealGroup className="mx-auto flex max-w-[1280px] flex-col gap-3.5 px-4 pb-6 pt-[18px] sm:px-6" stagger={0.06}>
        <RevealItem className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1.5 border border-white/12 bg-white/[0.025] px-[18px] py-3">
          <span className="flex-[1_1_300px] text-[17px] font-medium">{config.motion}</span>
          <span className="font-mono text-[11px] tracking-[2px] text-muted-foreground">
            YOU {sideLabel(config.side)} · AI {sideLabel(otherSide(config.side))}
          </span>
        </RevealItem>

        <div className="flex flex-wrap items-stretch gap-3.5">
          <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-2.5">
            <RevealItem className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5 font-mono">
              <Telemetry label={vehicles.ai.tag} color="var(--color-ai)" r={ai} dest={dest} corner="tl" boosting={boosting} />
              <Telemetry label={`${vehicles.user.tag} · ${config.callsign.toUpperCase()}`} color="var(--color-you)" r={user} dest={dest} corner="tr" boosting={boosting} />
            </RevealItem>

            <RevealItem>
              <RaceTrack dest={dest} vehicles={vehicles} user={user} ai={ai} boosting={boosting} boostKey={exchanges.length} />
            </RevealItem>

            <RevealItem className="relative flex flex-col gap-3 border border-line bg-white/[0.02] px-4 py-3.5">
              <Corners color="var(--color-ink)" both={false} size={12} />
              <div className="flex items-center justify-between gap-2 font-mono text-[11px] tracking-[3px] text-soft">
                <span className={timeUp ? "text-warn" : undefined}>{commsLabel}</span>
                <span className="flex items-center gap-3">
                  {(busy || transcribing) && <Spinner />}
                  {phase === "user" && !timeUp && (
                    <span className={cn("tabular-nums", turnLeft <= 10 ? "text-bad" : "text-ink")} aria-label="Turn time left">
                      {timerText}
                    </span>
                  )}
                </span>
              </div>

              <AnimatePresence>
                {notice && (
                  <motion.p
                    key={notice}
                    className="m-0 font-mono text-[11px] tracking-[2px] text-warn"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    {notice}
                  </motion.p>
                )}
              </AnimatePresence>

              {interruptions && phase === "user" && recording && <PatienceBar patience={patience} name={vehicles.ai.tag} />}

              <AnimatePresence initial={false}>
                {transmission.length > 0 && (
                  <motion.div
                    className="flex flex-col gap-1.5 border-l-2 border-ai bg-ai/5 px-3 py-2.5"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                  >
                    <span className="font-mono text-[10px] tracking-[2px] text-ai">{vehicles.ai.tag}</span>
                    <p className="m-0 text-[15px] leading-[1.55] text-body">
                      {transmission.map((s, i) => (
                        <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}>
                          {s.text}{" "}
                        </motion.span>
                      ))}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <label htmlFor="argument" className="sr-only">Your argument</label>
              <textarea
                id="argument"
                className="min-h-24 w-full resize-y rounded-[2px] border border-line-2 bg-field px-3.5 py-3 text-[15px] leading-normal text-ink outline-none focus:outline focus:outline-1 focus:outline-ai disabled:opacity-60"
                placeholder={phase === "user" && !timeUp ? "Make your argument. Ctrl+Enter to send." : ""}
                value={draft}
                disabled={busy}
                onChange={(e) => {
                  typedRef.current = true; // typing: don't end the turn on silence or cut in
                  dispatch({ type: "draft", text: e.target.value });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitTurn();
                }}
                rows={4}
              />
              {recording && (
                <p className="m-0 text-sm italic text-muted-foreground">
                  {captions.text ? `${captions.text}…` : captions.supported ? "Listening…" : "Recording…"}
                </p>
              )}
              {(error || recorder.error) && <p className="m-0 font-mono text-[11px] tracking-[1px] text-bad">{error ?? recorder.error}</p>}

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {voiceInput ? (
                  <button
                    type="button"
                    className={cn(btnGhost, recording && "animate-blink border-bad text-[#ffb3ab]")}
                    disabled={busy || transcribing}
                    onClick={() => {
                      // Stopping turns hands-free off (the transcript lands in the text box); SPEAK turns it back on.
                      setHandsFree(!recording);
                      if (recording) stopSpeaking();
                      else startSpeaking();
                    }}
                  >
                    <MicIcon /> {recording ? "TAP TO STOP" : transcribing ? "TRANSCRIBING…" : "SPEAK"}
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" className={btnPrimarySm} disabled={busy} onClick={() => void submitTurn()}>
                  TRANSMIT <span aria-hidden="true">→</span>
                </button>
              </div>
            </RevealItem>
          </div>

          <RevealItem className="relative flex max-h-[1040px] flex-[1_1_300px] flex-col border border-line bg-white/[0.02] font-mono">
            <Corners color="var(--color-ink)" both={false} size={12} />
            <div className="border-b border-line px-4 py-3.5 text-[11px] tracking-[3px] text-soft">TIMELINE</div>
            <div className="flex-auto overflow-y-auto">
              {exchanges.length === 0 && pending.length === 0 && phase === "user" && (
                <p className="m-0 px-4 py-3.5 font-sans text-[13px] leading-normal text-muted-foreground">
                  Open with your position and your best reason.
                </p>
              )}
              <AnimatePresence initial={false}>
                {exchanges.map((e) => (
                  <TimelineEntry key={e.index} e={e} vehicles={vehicles} />
                ))}
                {pending.map((p) => (
                  <motion.article
                    key={`pending-${p.index}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-between gap-2 border-b border-white/8 px-4 py-3.5 text-[10px] tracking-[2px] text-muted-foreground"
                  >
                    <span>EXCHANGE {String(p.index).padStart(2, "0")}</span>
                    <span>{p.aiText ? "SCORING…" : "REPLYING…"}</span>
                  </motion.article>
                ))}
              </AnimatePresence>
              <div ref={timelineEnd} />
            </div>
          </RevealItem>
        </div>
      </RevealGroup>
    </main>
  );
}

// ---------- Pieces ----------

/** How long the AI will wait before cutting in: drains as you hesitate or run long. */
function PatienceBar({ patience, name }: { patience: number; name: string }) {
  const left = 1 - patience;
  const color = left < 0.35 ? "var(--color-bad)" : left < 0.65 ? "var(--color-warn)" : "var(--color-ai)";
  return (
    <div className="flex items-center gap-3 font-mono text-[10px] tracking-[2px] text-muted-foreground">
      <span>{name} PATIENCE</span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={`${name} patience`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)}>
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200" style={{ width: `${left * 100}%`, background: color }} />
      </span>
    </div>
  );
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, format);
  useEffect(() => {
    const controls = animate(mv, value, { duration: BOOST_SECONDS, ease: EASE_OUT });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

const fmtSpeed = (n: number) => Math.round(n).toLocaleString("en-US");

function Telemetry({
  label,
  color,
  r,
  dest,
  corner,
  boosting,
}: {
  label: string;
  color: string;
  r: RocketState;
  dest: Destination;
  corner: "tl" | "tr";
  boosting: boolean;
}) {
  const pct = Math.min(100, (r.d / dest.distance) * 100);
  const status = r.stalled ? "STALLED" : r.streak >= STREAK_LENGTH ? "MOMENTUM" : boosting && r.lastDv ? "BOOSTING" : "NOMINAL";
  const statusColor = r.stalled ? "var(--color-bad)" : status === "NOMINAL" ? "var(--color-ok)" : "var(--color-warn)";
  return (
    <div className="relative flex flex-col gap-2.5 border border-line bg-white/[0.02] px-4 py-3.5">
      <span
        className={cn(
          "pointer-events-none absolute size-3 border-0 border-solid",
          corner === "tl" ? "-left-px -top-px border-l border-t" : "-right-px -top-px border-r border-t",
        )}
        style={{ borderColor: color }}
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-2 text-[11px] tracking-[2px]">
        <span style={{ color }}>{label}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Dot color={statusColor} size={6} pulse={status !== "NOMINAL"} />
          {status}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xl tabular-nums">
          <AnimatedNumber value={r.v} format={fmtSpeed} /> <span className="text-[10px] text-muted-foreground">MI/S</span>
        </span>
        <span className="text-[10px] tracking-[1px] text-muted-foreground">
          <AnimatedNumber value={r.d} format={formatMiles} /> MI · {pct.toFixed(0)}%
        </span>
      </div>
      <span className="block h-[3px] bg-line">
        <motion.span
          className="block h-[3px] origin-left"
          style={{ background: color }}
          initial={false}
          animate={{ scaleX: Math.max(pct, 1) / 100 }}
          transition={{ duration: BOOST_SECONDS, ease: EASE_OUT }}
        />
      </span>
    </div>
  );
}

function TimelineEntry({ e, vehicles }: { e: Exchange; vehicles: { user: Vehicle; ai: Vehicle } }) {
  const { judge } = e;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="flex flex-col gap-2.5 border-b border-white/8 px-4 py-3.5"
    >
      <div className="flex justify-between text-[10px] tracking-[2px] text-muted-foreground">
        <span>EXCHANGE {String(e.index).padStart(2, "0")}</span>
        <span>{judge.winner === "tie" ? "EVEN" : `${judge.winner === "user" ? vehicles.user.tag : vehicles.ai.tag} AHEAD`}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line">
        <ScoreCell label={vehicles.ai.tag} color="var(--color-ai)" score={judge.ai.total} fallacy={judge.ai.fallacy} />
        <ScoreCell label={vehicles.user.tag} color="var(--color-you)" score={judge.user.total} fallacy={judge.user.fallacy} />
      </div>
      <p className="m-0 font-sans text-[13px] leading-normal text-body">{judge.verdict}</p>
      {judge.user.reason && (
        <p className="m-0 font-sans text-[13px] leading-normal text-muted-foreground">
          <span className="font-mono text-[9px] tracking-[2px]">YOU · </span>
          {judge.user.reason}
        </p>
      )}
    </motion.article>
  );
}

function ScoreCell({ label, color, score, fallacy }: { label: string; color: string; score: number; fallacy: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 bg-space px-2.5 py-2">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] tracking-[2px]" style={{ color }}>{label}</span>
        <span className="text-base tabular-nums">
          {score}
          <span className="text-[10px] text-muted-foreground">/{MAX_SCORE}</span>
        </span>
      </span>
      <span className="block h-[2px] bg-line">
        <motion.span
          className="block h-[2px] origin-left"
          style={{ background: color }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: score / MAX_SCORE }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.15 }}
        />
      </span>
      {fallacy && <span className="text-[9px] tracking-[1px] text-bad">STALL · {fallacy.toUpperCase()}</span>}
    </div>
  );
}
