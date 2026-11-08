# DEB“AI” — Debate Trajectory Control

A debate-prep game for HackRPI's "In the Clouds" theme. You debate an AI opponent (Gemini) while a separate AI judge scores every exchange. The better argument boosts that side's rocket toward the Moon, Mars, Jupiter or Saturn. First to arrive wins, then you get a coaching report.

**Play it live: https://debai-five.vercel.app**

## How to play

1. Pick or type a debate motion, choose your side, the opponent's difficulty and a destination.
   - **Easy**: a 7th–8th grader who hesitates a lot and sometimes gets facts wrong.
   - **Medium**: a college debater with accurate facts, still thinking out loud.
   - **Hard**: a professional debater.
2. Optionally turn **Interruptions** on: the AI cuts in if you stall, and you can talk over it to cut it off. Headphones recommended.
3. Press **START**, allow the microphone, and just talk. Your turn ends when you stop; the AI answers out loud.
4. Each exchange is scored on claim, evidence, rebuttal, relevance and confidence (0–4 each, 20 per turn). The better turn fires a boost burst, then its rocket climbs.

Each destination races two real rockets (yours first): Moon, Saturn V vs Atlas V; Mars, Starship vs Falcon Heavy; Jupiter, Titan IIIE vs Ariane 5; Saturn, SLS vs New Glenn.
5. When a rocket arrives (or the exchanges run out), read your coaching report.

Use Chrome or Edge for live captions. Voice works in any browser that supports `MediaRecorder`; you can always type instead.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (React + TypeScript), API routes keep every key on the server |
| Styling | Tailwind CSS v4 (tokens in `app/globals.css`) |
| Race and timeline | Motion (`motion/react`) + SVG starfield |
| Game state | React `useReducer` (`lib/client/raceReducer.ts`) |
| AI | Gemini via `@google/genai`: opponent, distiller, judge and report as separate routes returning JSON |
| Voice output | Fish Audio TTS via `fetch` for the AI opponent only (`s2.1-pro`, or `s2.1-pro-free` while building) |
| Voice input | Browser `MediaRecorder` → Fish Audio speech-to-text (`transcribe-1-pro`, audio-event tags off) |
| Live captions | Browser Web Speech API, display only, never scored |
| API keys | Rotation across up to four Fish Audio keys |
| Hosting | Vercel |
| Saved history | `localStorage` (flight log on the start screen) |

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev                  # http://localhost:3000
```

It runs without any keys:

- **No `GEMINI_API_KEY`** → simulation mode: a canned opponent and a keyword-based judge, so you can click through the whole loop.
- **No Fish Audio key** → text only: no voice and no spoken input.

The Start screen's top bar shows which integrations are linked.

## Deploy on Vercel

The live site deploys from this repo: every push to `main` builds a new production deployment.

To set up your own: import the GitHub repo at https://vercel.com/new (the project name must be lowercase, e.g. `debai`) and paste your `.env.local` into the Environment Variables field; Vercel splits it into separate variables. Without them the site still runs, in simulation mode. Keep in mind:

- Functions have time limits, so Gemini calls use low thinking levels and the opponent's reply is streamed.
- Request bodies are capped at 4.5 MB, so spoken turns are uploaded as compressed `webm`/`ogg` (32 kbps), never WAV.
- The microphone only works over HTTPS, which Vercel provides (and `localhost` during development).
- Fish Audio limits how many requests an account can run at once (5 on the Starter tier, shared by TTS and speech-to-text). The browser sends at most 3 voice requests at a time, and the server retries a busy (429) request on your other keys, then with a short backoff.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Opponent, argument distiller, judge and post-debate report |
| `GEMINI_MODEL` | Model for the opponent, distiller and report (default `gemini-3.8-flash`) |
| `GEMINI_JUDGE_MODEL` | Model for the judge (defaults to `GEMINI_MODEL`) |
| `FISH_AUDIO_API_KEYS` | Comma-separated Fish Audio keys, tried in order |
| `FISH_AUDIO_API_KEY`, `_2`, `_3`, `_4` | The same keys as separate variables (either form works) |
| `FISH_AUDIO_OPPONENT_VOICE_ID` | The custom voice shared by all three difficulties |
| `FISH_AUDIO_MODEL` | TTS model header (default `s2.1-pro`). Must support `[bracket]` emotion cues: the S2 family or a Drama model, not `s1` |
| `FISH_AUDIO_STT_MODEL` | Speech-to-text model header (default `transcribe-1-pro`) |

## Voice

Fish Audio is called for exactly two things: the AI opponent's spoken reply (`/api/tts`) and the transcript of the user's spoken turn (`/api/stt`). There is no announcer.

## How a round works

1. **Your turn** (90 s timer): take a moment to think, then start talking. The mic opens by itself each turn (hands-free) and your turn ends when you stop talking: about 3.5 s of silence (2.2–3 s with interruptions on, depending on difficulty), or longer if you trail off on "and…" or "um…". The browser records with `MediaRecorder` while live captions show your words; the recording then goes to `POST /api/stt` and the Fish Audio transcript becomes your official argument. Tap the mic button to switch hands-free off, or type in the text box and press **TRANSMIT**.
2. **Opponent** — `POST /api/opponent`: Gemini answers like a person in conversation: 2–4 sentences that react to what you just said, with fillers ("um", "I mean"), restarts ("it's- it's not") and sound cues (`[short pause]`, `[breath]`) tuned per difficulty. Sentences stream as NDJSON and each is voiced by Fish Audio as soon as it arrives. A short pre-voiced "Hmm" or "Right, so…" often plays the moment you stop talking, to cover the wait. The reply is capped at about 75 words, not counting fillers.
3. **Judge** — `POST /api/judge`, run in the background once the AI has spoken, so your next turn starts straight away and the rockets boost when the scores land. It scores the points made, never the delivery:
   - Each turn is rewritten in its own Gemini call as at most 3 short, neutral bullets per category (claims / evidence / rebuttals). Grammar, spelling, polish, length and filler are stripped, so a messy spoken turn and a polished one look the same.
   - The judge is told to ignore grammar, structure, fluency, length and the number of points, and to score claim, evidence, rebuttal and relevance (0–4 each) on substance alone. It flags fallacies and gives a one-line reason per speaker.
   - **Confidence** (the fifth criterion, 0–4) is measured, not judged: long pauses (1.5 s or more mid-turn, from the mic), filler words and stutters (from the transcript and live captions), counted per 100 words. The AI opponent is measured the same way from its voiced text, so the hesitant Easy bot scores lower. Typed turns get a neutral 2. A turn is out of 20 (5 criteria × 4 points).
   - Each debater is shown with the exact point they had to answer. On the opening exchange neither side has anything to rebut, so both get rebuttal 2 and both turns are treated as standalone statements.
   - The judge runs twice in parallel, with the speakers listed in opposite orders under anonymous labels. The scores are averaged, and a fallacy only counts if both runs flag it.
4. **Interruptions** (optional, chosen on the start screen): either side can cut the other off. Use headphones: with speakers, the AI's own voice can reach the mic and count as you talking over it.
   - **The AI cuts you off** if you don't start talking, hesitate too much (pauses of about 1 s or more, plus fillers and stutters seen in the live captions) or run long. It plays a pre-voiced line ("Let me stop you there."), and its reply carries on from it. A patience bar shows how close it is to cutting in. Being cut off has no extra penalty: you're scored on what you said.
   - **You cut the AI off** by talking over it for about half a second. It stops mid-sentence, only the sentences you heard are judged, and your turn starts recording straight away.
5. **Boost**: `V += S·K + max(0, S−S_opp)·B`, then `D += V·60`, using the 20-point turn score directly, so the destination constants work as designed. A streak of 3 strong turns (≥15 of 20) adds a momentum bonus of 2K. A fallacy stalls the rocket, so it covers half its distance that turn.
6. The race ends when a rocket arrives or the destination's max exchanges run out (farther rocket wins, then higher total score).
7. **Results** — `POST /api/report`: strong points, weakest rubric category, an argument rewrite, fallacies and a 60-second practice drill. The debate is saved to the flight log.

## Code map

| Path | What it holds |
| --- | --- |
| `lib/game.ts` | Destinations (distance, base speed, K, B), physics, win rules, mood engine, voice profiles, the 20 topics |
| `lib/server/prompts.ts` | Every Gemini prompt and JSON schema |
| `lib/server/gemini.ts` | Gemini client with JSON output, streaming, per-model thinking settings and retries on 503/429 |
| `lib/server/fish.ts` | Fish Audio TTS (opponent voice), speech-to-text (user's turn) and key rotation |
| `lib/server/mock.ts` | Simulation mode used when there's no Gemini key |
| `app/api/*` | `opponent` (streaming), `judge`, `report`, `tts` (audio proxy), `stt` (transcription), `status` |
| `components/SetupScreen.tsx` | Screen 1: motion, side, difficulty, callsign, destination, flight log |
| `components/RaceScreen.tsx` | Screen 2: telemetry, race track, comms panel, live timeline |
| `components/ResultsScreen.tsx` | Screen 3: outcome, rubric averages, judge report, transcript |
| `components/visuals.tsx` | The eight rocket designs and their exhaust, planets, scrolling starfield and Earth horizon |
| `components/ui.tsx` | Shared Tailwind buttons, fields, labels and panel corners |
| `lib/client/raceReducer.ts` | Race state and transitions (`useReducer`) |
| `lib/client/api.ts` | JSON calls and the opponent stream reader |
| `lib/client/audio.ts` | Speech queue: plays sentences in order while more arrive |
| `lib/client/useRecorder.ts` | `MediaRecorder` capture and upload to `/api/stt` |
| `lib/client/useLiveCaptions.ts` | Web Speech API live captions |
| `lib/client/voiceActivity.ts` | Mic-level voice detection (are you talking? talking over the AI?) |
| `lib/client/turnMonitor.ts` | End-of-turn and cut-in rules (pure functions) |
| `lib/client/history.ts` | Flight log in `localStorage` |

## Tuning

- **Difficulty**: `VOICE_PROFILES` in `lib/game.ts`. Easy is a 7th–8th grader (simple words, lots of fillers and pauses, deliberately gets facts wrong about every other reply), Medium a college debater (accurate, still thinking out loud), Hard a professional debater
- **Confidence formula**: `confidenceScore`, `LONG_PAUSE_MS` and `TYPED_CONFIDENCE` in `lib/game.ts`
- **When the AI gets heated** (at most 2 times per debate): `pickMood` in `lib/game.ts`
- **Momentum and stall strength**: `STRONG_TURN`, `STREAK_LENGTH`, `MOMENTUM_K_MULTIPLIER`, `STALL_FACTOR`
- **Turn timer**: `TURN_SECONDS`
- **How human the AI sounds**: `disfluency` in each `VOICE_PROFILES` entry; its cut-in and "thinking" lines are in `lines`
- **Turn-taking and interruptions**: `timing` in each `VOICE_PROFILES` entry (start grace, end-of-turn silence, hesitations allowed, longest turn), plus `PATIENT_END_SILENCE_MS`, `PAUSE_MS`, `MIN_TALK_BEFORE_CUTOFF_MS` and `BARGE_IN_MS` in `lib/game.ts`. Mic sensitivity is in `lib/client/voiceActivity.ts`
- **Gemini speed vs depth**: the `thinking` option on each call (`minimal` for the opponent and distiller, `low` for the judge and report)
