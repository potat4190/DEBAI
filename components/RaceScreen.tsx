"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  BARGE_IN_MS,
  CRITERION_MAX,
  MAX_SCORE,
  STREAK_LENGTH,
  VOICE_PROFILES,
  formatClock,
  formatMiles,
  getDestination,
  otherSide,
  pickMood,
  sideLabel,
  stripCues,
  countFillersAndStutters,
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
import type { Integrations, RaceSummary } from "./DebAI";
import { Corners, Dot, Label, MicIcon, Spinner, TopBar, btnGhost, btnPrimarySm, chipBtn, cx } from "./ui";
import { EarthHorizon, GridOverlay, PlanetOrb, Rocket, SpeedField, type FlameState } from "./visuals";

const PHASE_LABEL: Record<Phase, string> = {
  user: "YOUR TURN · SPEAK OR TYPE YOUR ARGUMENT",
  opponent: "{AI} IS TALKING…",
  waiting: "FINAL EXCHANGE · JUDGE SCORING",
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

// Race track geometry (px): 0% sits near the horizon, 100% on the target line.
const TRACK_TARGET_Y = 150;
const TRACK_ZERO_Y = 430;
const CLOUD_LAYERS = [
  { at: 0.25, name: "CUMULUS" },
  { at: 0.5, name: "CIRRUS" },
  { at: 0.75, name: "NOCTILUCENT" },
];
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const BOOST_SECONDS = 1.8;
/** The rocket that gained more speed fires a burst for this long before it starts climbing. */
const BLAST_SECONDS = 0.7;
/** Track rockets are 48 px wide: name label (18 px) + nose to engine nozzles (86 px). */
const ROCKET_ENGINE_OFFSET = 104;

const TRACK_BG = "linear-gradient(to top, #0a1830 0%, #070e1f 26%, #04060e 62%, #030409 100%)";
const CLOUD_BG =
  "radial-gradient(ellipse 30% 50% at 20% 50%, rgba(255,255,255,0.07), transparent 70%), radial-gradient(ellipse 35% 50% at 70% 50%, rgba(255,255,255,0.06), transparent 70%)";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

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

  // Clocks: mission elapsed time and the user's turn timer.
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

  // Hands-free: open the mic when your turn starts.
  useEffect(() => {
    if (phase !== "user" || !voiceInput || !handsFree || finishedRef.current) return;
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
        if (bargeTimerRef.current) clearInterval(bargeTimerRef.current);
        stopAudio();
        captions.stop();
        recorder.discard();
      }
      await wait((BLAST_SECONDS + BOOST_SECONDS) * 1000 + 400);
      act({ type: "boostDone" });
      if (outcome.over) {
        const end = Date.now();
        act({ type: "finished", at: end });
        onFinish({
          exchanges: stateRef.current.exchanges,
          outcome: outcome as Required<Outcome>,
          user: exchange.userAfter,
          ai: exchange.aiAfter,
          elapsedMs: end - startedAt.current,
        });
      }
    });
  }

  async function submitTurn(opts: { cutoff?: CutoffReason } = {}) {
    if (submitting.current || finishedRef.current || stateRef.current.phase !== "user") return;
    submitting.current = true;
    const before = stateRef.current;
    const index = before.exchanges.length + before.pending.length + 1;
    const last = index >= dest.maxExchanges;
    const speed = profile.speed;
    const { cutoff } = opts;

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
        if (!vad || finishedRef.current) return;
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
          if (barged || finishedRef.current) return;
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
      if (finishedRef.current) return;

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
  const met = formatClock((stoppedAt ?? now) - startedAt.current);
  const busy = phase !== "user";
  const timerText = `${String(Math.floor(turnLeft / 60)).padStart(2, "0")}:${String(turnLeft % 60).padStart(2, "0")}`;
  const commsLabel =
    phase !== "user"
      ? withAi(PHASE_LABEL[phase])
      : transcribing
        ? "TRANSCRIBING YOUR TURN…"
        : recording
          ? endingIn !== null
            ? `PAUSED · SENDING IN ${endingIn.toFixed(1)}S`
            : talking
              ? "LISTENING · STOP TALKING TO SEND"
              : "LISTENING · TAKE A MOMENT TO THINK, THEN SPEAK"
          : PHASE_LABEL.user;

  return (
    <main className="relative min-h-screen overflow-hidden bg-space">
      <TopBar transparent>
        <span>DEB“AI”-01 · LIVE{integrations && !integrations.gemini ? " · SIMULATION" : ""}</span>
        <span className="flex items-center gap-2">
          <Dot color="var(--color-bad)" pulse />
          EXCHANGE {exchangeNo} / {dest.maxExchanges} MAX
        </span>
        <span>MET T+ {met}</span>
        <span className={phase === "user" && turnLeft <= 10 ? "text-bad" : "text-ink"}>
          TURN TIMER {phase === "user" ? timerText : "--:--"}
        </span>
        <span className="flex items-center gap-2">
          <button type="button" className={chipBtn} onClick={toggleMute} aria-pressed={muted}>
            {muted ? "VOICE OFF" : "VOICE ON"}
          </button>
          <button type="button" className={chipBtn} onClick={onAbort}>ABORT</button>
        </span>
      </TopBar>

      <div className="mx-auto flex max-w-[1280px] flex-col gap-3.5 px-4 pb-6 pt-[18px] sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1.5 border border-white/12 bg-white/[0.025] px-[18px] py-3">
          <Label>MOTION</Label>
          <span className="flex-[1_1_300px] text-[17px] font-medium">{config.motion}</span>
          <Label className="tracking-[2px]">
            {vehicles.user.tag} · {sideLabel(config.side)} · {vehicles.ai.tag} · {sideLabel(otherSide(config.side))} ·{" "}
            {config.difficulty.toUpperCase()}
          </Label>
        </div>

        <div className="flex flex-wrap items-stretch gap-3.5">
          <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-2.5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2.5 font-mono">
              <Telemetry label={`${vehicles.ai.tag} · AI`} color="var(--color-ai)" r={ai} dest={dest} corner="tl" boosting={boosting} />
              <Telemetry label={`${vehicles.user.tag} · ${config.callsign.toUpperCase()}`} color="var(--color-you)" r={user} dest={dest} corner="tr" boosting={boosting} />
            </div>

            <RaceTrack dest={dest} vehicles={vehicles} user={user} ai={ai} boosting={boosting} />

            <section className="relative flex flex-col gap-3 border border-line bg-white/[0.02] px-4 py-3.5">
              <Corners color="var(--color-ink)" both={false} size={12} />
              <div className="flex items-center justify-between gap-2 font-mono text-[11px] tracking-[3px] text-soft">
                <span>COMMS · {commsLabel}</span>
                {(busy || transcribing) && <Spinner />}
              </div>

              {notice && <p className="m-0 font-mono text-[11px] tracking-[2px] text-warn">{notice}</p>}

              {interruptions && phase === "user" && recording && <PatienceBar patience={patience} name={vehicles.ai.tag} />}

              {transmission.length > 0 && (
                <div className="flex flex-col gap-1.5 border-l-2 border-ai bg-ai/5 px-3 py-2.5">
                  <Label className="text-[11px] tracking-[2px]" color="var(--color-ai)">
                    {vehicles.ai.tag} · {phase === "opponent" ? "INCOMING TRANSMISSION" : "LAST TRANSMISSION"}
                  </Label>
                  <p className="m-0 text-[15px] leading-[1.55] text-body">
                    {transmission.map((s, i) => (
                      <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                        {s.text}{" "}
                      </motion.span>
                    ))}
                  </p>
                </div>
              )}

              <label htmlFor="argument" className="sr-only">Your argument</label>
              <textarea
                id="argument"
                className="min-h-24 w-full resize-y rounded-[2px] border border-line-2 bg-field px-3.5 py-3 text-[15px] leading-normal text-ink outline-none focus:outline focus:outline-1 focus:outline-ai disabled:opacity-60"
                placeholder={phase === "user" ? "Make your argument. Ctrl+Enter to transmit." : ""}
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
                <p className="m-0 text-sm italic text-muted">
                  <span className="mr-2 font-mono text-[9px] not-italic tracking-[2px]">LIVE CAPTIONS · NOT SCORED</span>
                  {captions.text ? `${captions.text}…` : captions.supported ? "Listening…" : "Recording…"}
                </p>
              )}
              {(error || recorder.error) && <p className="m-0 font-mono text-[11px] tracking-[1px] text-bad">{error ?? recorder.error}</p>}

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {voiceInput ? (
                  <button
                    type="button"
                    className={cx(btnGhost, recording && "animate-blink border-bad text-[#ffb3ab]")}
                    disabled={busy || transcribing}
                    onClick={() => {
                      // Stopping turns hands-free off (the transcript lands in the text box); SPEAK turns it back on.
                      setHandsFree(!recording);
                      if (recording) stopSpeaking();
                      else startSpeaking();
                    }}
                  >
                    <MicIcon /> {recording ? "LISTENING · TAP TO STOP" : transcribing ? "TRANSCRIBING…" : "SPEAK"}
                  </button>
                ) : (
                  <span className="font-mono text-[10px] tracking-[2px] text-muted">
                    {integrations?.voice === false ? "VOICE INPUT OFF · TYPE YOUR ARGUMENT" : "MIC RECORDING UNAVAILABLE IN THIS BROWSER · TYPE INSTEAD"}
                  </span>
                )}
                <button type="button" className={btnPrimarySm} disabled={busy} onClick={() => void submitTurn()}>
                  TRANSMIT <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>
          </div>

          <aside className="relative flex max-h-[1080px] flex-[1_1_300px] flex-col border border-line bg-white/[0.02] font-mono">
            <Corners color="var(--color-ink)" both={false} size={12} />
            <div className="flex justify-between gap-2 border-b border-line px-4 py-3.5 text-[11px] tracking-[3px]">
              <span className="text-soft">DEBATE TIMELINE</span>
              <span className="text-muted">LIVE</span>
            </div>
            <div className="flex-auto overflow-y-auto">
              {exchanges.length === 0 && pending.length === 0 && phase === "user" && (
                <p className="m-0 px-4 py-3.5 font-sans text-[13px] leading-normal text-muted">
                  No exchanges yet. Open the debate: state your position and your best reason.
                  {voiceInput && handsFree && " Just start talking; your turn ends when you stop."}
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
                    className="flex flex-col gap-1.5 border-b border-white/8 px-4 py-3.5 text-[11px]"
                  >
                    <div className="flex justify-between text-[10px] tracking-[2px] text-muted">
                      <span>EXCHANGE {String(p.index).padStart(2, "0")}</span>
                      <span>PENDING</span>
                    </div>
                    <span className="text-muted">{p.aiText ? "Judge scoring…" : `${vehicles.ai.name} replying…`}</span>
                  </motion.article>
                ))}
              </AnimatePresence>
              <div ref={timelineEnd} />
            </div>
            <div className="mt-auto border-t border-white/8 px-4 py-3 text-[10px] leading-[1.6] tracking-[1px] text-muted">
              V = V + S·K + max(0, S−Sₒₚₚ)·B
              <br />
              K {dest.K.toLocaleString("en-US")} · B {dest.B.toLocaleString("en-US")} · Δt 60 S
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

// ---------- Pieces ----------

/** How long the AI will wait before cutting in: drains as you hesitate or run long. */
function PatienceBar({ patience, name }: { patience: number; name: string }) {
  const left = 1 - patience;
  const color = left < 0.35 ? "var(--color-bad)" : left < 0.65 ? "var(--color-warn)" : "var(--color-ai)";
  return (
    <div className="flex items-center gap-3 font-mono text-[10px] tracking-[2px] text-muted">
      <span>{name} PATIENCE</span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={`${name} patience`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)}>
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200" style={{ width: `${left * 100}%`, background: color }} />
      </span>
    </div>
  );
}

function RaceTrack({
  dest,
  vehicles,
  user,
  ai,
  boosting,
}: {
  dest: Destination;
  vehicles: { user: Vehicle; ai: Vehicle };
  user: RocketState;
  ai: RocketState;
  boosting: boolean;
}) {
  // Whoever gained more speed this exchange gets the boost burst (both, on a tie).
  const boosted = (me: RocketState, them: RocketState) => boosting && (me.lastDv ?? 0) >= (them.lastDv ?? 0);
  return (
    <div className="relative h-[540px] overflow-hidden border border-white/12" style={{ background: TRACK_BG }}>
      <SpeedField boosting={boosting} />
      <GridOverlay />
      <PlanetOrb id={dest.id} size={300} style={{ position: "absolute", left: "50%", top: -170, marginLeft: -150 }} />

      <div className="absolute left-11 right-0 z-[1] flex -translate-y-1/2 items-center gap-3 pr-4" style={{ top: TRACK_TARGET_Y }}>
        <div className="flex-1 border-t border-white/35" />
        <span className="whitespace-nowrap font-mono text-[10px] tracking-[2px] text-soft">
          TARGET · {dest.name.toUpperCase()} · {formatMiles(dest.distance)} MI
        </span>
        <div className="flex-1 border-t border-white/35" />
      </div>

      <div
        className="absolute left-3 flex -translate-y-1.5 flex-col justify-between font-mono text-[9px] tracking-[1px] text-muted"
        style={{ top: TRACK_TARGET_Y, height: TRACK_ZERO_Y - TRACK_TARGET_Y }}
        aria-hidden="true"
      >
        <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
      </div>

      {CLOUD_LAYERS.map((c) => (
        <div
          key={c.name}
          className="pointer-events-none absolute left-11 right-0 h-[26px] -translate-y-1/2 border-t border-dashed border-white/7"
          style={{ top: TRACK_ZERO_Y - c.at * (TRACK_ZERO_Y - TRACK_TARGET_Y), background: CLOUD_BG }}
          aria-hidden="true"
        >
          <span className="absolute right-4 top-1 font-mono text-[8px] tracking-[2px] text-muted/70">{c.name}</span>
        </div>
      ))}

      <EarthHorizon height={130} label={false} />

      <TrackRocket side="left" pct={Math.min(1, ai.d / dest.distance)} color="#6FB6E8" vehicle={vehicles.ai} idp="race-a" blast={boosted(ai, user)} stalled={ai.stalled} />
      <TrackRocket side="right" pct={Math.min(1, user.d / dest.distance)} color="#E8833A" vehicle={vehicles.user} idp="race-b" blast={boosted(user, ai)} stalled={user.stalled} />

      <span className="absolute bottom-3 right-3.5 z-[1] font-mono text-[9px] tracking-[2px] text-muted">TRAJECTORY VIEW · NOT TO SCALE</span>
    </div>
  );
}

function TrackRocket({
  side,
  pct,
  color,
  vehicle,
  idp,
  blast,
  stalled,
}: {
  side: "left" | "right";
  pct: number;
  color: string;
  vehicle: Vehicle;
  idp: string;
  blast: boolean;
  stalled: boolean;
}) {
  // The rocket's engines sit on its progress line, so the flame stays in view from the start.
  const top = TRACK_ZERO_Y - pct * (TRACK_ZERO_Y - TRACK_TARGET_Y) - ROCKET_ENGINE_OFFSET;
  // The engines always burn a little; a boost flares them up, a fallacy makes them sputter.
  const flame: FlameState = blast ? "blast" : stalled ? "stall" : "idle";
  return (
    <motion.div
      className="absolute z-[2] flex -translate-x-1/2 flex-col items-center gap-1"
      style={{ left: side === "left" ? "33%" : "67%" }}
      initial={false}
      animate={{ top }}
      // The boosted rocket fires its burst first, then climbs.
      transition={{ duration: BOOST_SECONDS, ease: EASE_OUT, delay: blast ? BLAST_SECONDS : 0 }}
    >
      <span className="whitespace-nowrap font-mono text-[10px] tracking-[2px]" style={{ color }}>{vehicle.tag}</span>
      <motion.div
        initial={false}
        animate={blast ? { x: [0, -1.5, 1.5, -1.2, 1.2, -0.6, 0] } : { x: 0 }}
        transition={{ duration: BLAST_SECONDS, ease: "linear" }}
      >
        <Rocket model={vehicle.id} idp={idp} accent={color} width={48} flame={flame} />
      </motion.div>
    </motion.div>
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
        className={cx(
          "pointer-events-none absolute size-3 border-0 border-solid",
          corner === "tl" ? "-left-px -top-px border-l border-t" : "-right-px -top-px border-r border-t",
        )}
        style={{ borderColor: color }}
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-2 text-[11px] tracking-[2px]">
        <span style={{ color }}>{label}</span>
        <span className="flex items-center gap-1.5">
          <Dot color={statusColor} size={6} />
          {status}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="VELOCITY" unit="MI/S">
          <AnimatedNumber value={r.v} format={fmtSpeed} />
        </Stat>
        <Stat label="LAST ΔV" unit="MI/S">{r.lastDv === null ? "—" : `+${fmtSpeed(r.lastDv)}`}</Stat>
        <Stat label="LAST SCORE" unit={`/ ${MAX_SCORE}`}>{r.lastScore === null ? "—" : String(r.lastScore)}</Stat>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="flex justify-between text-[9px] tracking-[2px] text-muted">
          <span>
            DISTANCE · <AnimatedNumber value={r.d} format={formatMiles} /> MI
          </span>
          <span>{pct.toFixed(0)}%</span>
        </span>
        <span className="block h-[3px] bg-line">
          <motion.span
            className="block h-[3px]"
            style={{ background: color }}
            initial={false}
            animate={{ width: `${Math.max(pct, 1)}%` }}
            transition={{ duration: BOOST_SECONDS, ease: EASE_OUT }}
          />
        </span>
      </div>
    </div>
  );
}

function Stat({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9px] tracking-[2px] text-muted">{label}</span>
      <span className="truncate text-lg">
        {children} <span className="text-[10px] text-muted">{unit}</span>
      </span>
    </div>
  );
}

function TimelineEntry({ e, vehicles }: { e: Exchange; vehicles: { user: Vehicle; ai: Vehicle } }) {
  const { judge } = e;
  const winnerTag = judge.winner === "user" ? vehicles.user.tag : judge.winner === "ai" ? vehicles.ai.tag : "TIE";
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="flex flex-col gap-2.5 border-b border-white/8 px-4 py-3.5"
    >
      <div className="flex justify-between text-[10px] tracking-[2px] text-muted">
        <span>EXCHANGE {String(e.index).padStart(2, "0")}</span>
        <span>T+{formatClock(e.at)}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line">
        <ScoreCell label={`${vehicles.ai.tag} · SCORE`} color="var(--color-ai)" score={judge.ai.total} dv={e.aiDv} reason={judge.ai.reason} fallacy={judge.ai.fallacy} confidence={judge.ai.rubric.confidence} delivery={judge.ai.delivery} />
        <ScoreCell label={`${vehicles.user.tag} · SCORE`} color="var(--color-you)" score={judge.user.total} dv={e.userDv} reason={judge.user.reason} fallacy={judge.user.fallacy} confidence={judge.user.rubric.confidence} delivery={judge.user.delivery} />
      </div>
      {judge.winningSummary && <TimelineBlock label={`WINNING ARGUMENT · ${winnerTag}`} text={judge.winningSummary} />}
      <TimelineBlock label="JUDGE" text={judge.verdict} />
      <TimelineBlock label="FEEDBACK · YOU" text={judge.user.reason} />
    </motion.article>
  );
}

function TimelineBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] tracking-[2px] text-muted">{label}</span>
      <p className="m-0 font-sans text-[13px] leading-normal text-body">{text}</p>
    </div>
  );
}

function ScoreCell({
  label,
  color,
  score,
  dv,
  reason,
  fallacy,
  confidence,
  delivery,
}: {
  label: string;
  color: string;
  score: number;
  dv: number;
  reason: string;
  fallacy: string | null;
  confidence?: number;
  delivery?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-space px-2.5 py-2" title={delivery ? `${reason}\nConfidence: ${delivery}` : reason}>
      <span className="text-[9px] tracking-[2px]" style={{ color }}>{label}</span>
      <span className="text-base">{score}/{MAX_SCORE}</span>
      <span className="text-[10px] text-muted">ΔV +{Math.round(dv).toLocaleString("en-US")} MI/S</span>
      {confidence !== undefined && (
        <span className="text-[9px] tracking-[1px] text-muted">
          CONFIDENCE {confidence}/{CRITERION_MAX}{delivery ? ` · ${delivery.toUpperCase()}` : ""}
        </span>
      )}
      {fallacy && <span className="text-[9px] tracking-[1px] text-bad">STALL · {fallacy.toUpperCase()}</span>}
    </div>
  );
}
