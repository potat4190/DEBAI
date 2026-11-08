"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "transcribing";

// Compressed formats only: Vercel caps request bodies, so never upload WAV.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

interface Job {
  promise: Promise<string>;
  claimed: boolean;
}

/**
 * Records the user's turn with MediaRecorder and gets the official transcript from
 * /api/stt (Fish Audio transcribe-1-pro). `onTranscript` receives each finished transcript
 * unless the caller claimed it through `finish()`.
 *
 * The microphone stream stays open for the whole race (one permission prompt, instant starts,
 * and the voice detector can listen while the AI talks). It closes when the race screen unmounts.
 */
export function useRecorder(onTranscript: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<Promise<MediaStream | null> | null>(null);
  const jobRef = useRef<Job | null>(null);
  const stopResolve = useRef<((blob: Blob) => void) | null>(null);
  const blobRef = useRef<(() => Blob) | null>(null); // the current recording so far
  const startingRef = useRef(false);
  const unmountedRef = useRef(false);
  const startRef = useRef<(retried?: boolean) => Promise<void>>(async () => {});
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && pickMimeType() !== undefined);
  }, []);

  /**
   * Opens the microphone once and reuses it. If the stream has been shut off (for example when
   * React remounts the screen in development), a fresh one is opened. Null when the user blocks it.
   */
  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!streamRef.current) {
        streamRef.current = navigator.mediaDevices
          .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
          .catch(() => {
            streamRef.current = null;
            setError("Microphone blocked. Type instead.");
            return null;
          });
      }
      const stream = await streamRef.current;
      if (!stream) return null;
      if (stream.getAudioTracks().some((t) => t.readyState === "live")) return stream;
      streamRef.current = null;
    }
    return null;
  }, []);

  const start = useCallback(async (retried = false) => {
    if (recRef.current || startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      const stream = await ensureStream();
      if (!stream || recRef.current || unmountedRef.current) return;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
      const chunks: Blob[] = [];
      const toBlob = () => new Blob(chunks, { type: rec.mimeType || mimeType });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        if (stopResolve.current) {
          stopResolve.current(toBlob());
          stopResolve.current = null;
        } else if (recRef.current === rec && !unmountedRef.current) {
          // The mic stream died under us (e.g. a development remount): start again on a fresh one.
          recRef.current = null;
          blobRef.current = null;
          setState("idle");
          void startRef.current();
        }
      };
      try {
        rec.start(1000);
      } catch {
        // The stream ended between opening and recording: try once more on a fresh one.
        streamRef.current = null;
        if (!retried) setTimeout(() => void startRef.current(true), 0);
        return;
      }
      recRef.current = rec;
      blobRef.current = toBlob;
      setState("recording");
    } finally {
      startingRef.current = false;
    }
  }, [ensureStream]);
  startRef.current = start;

  /** Stops recording and throws the audio away (no transcript). */
  const discard = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    if (!jobRef.current) setState("idle");
  }, []);

  /** Stops recording and transcribes. Returns the transcript ("" on failure). */
  const finish = useCallback((claim: boolean): Promise<string> => {
    const job = jobRef.current;
    if (job) {
      if (claim) job.claimed = true;
      return job.promise;
    }
    const rec = recRef.current;
    if (!rec) return Promise.resolve("");
    recRef.current = null;
    setState("transcribing");

    // If the recorder already stopped by itself, use what it captured instead of waiting forever.
    const blobReady =
      rec.state === "inactive"
        ? Promise.resolve(blobRef.current?.() ?? new Blob())
        : new Promise<Blob>((resolve) => (stopResolve.current = resolve));
    if (rec.state !== "inactive") rec.stop();
    blobRef.current = null;

    const next: Job = { claimed: claim, promise: Promise.resolve("") };
    next.promise = blobReady
      .then(async (blob) => {
        if (blob.size === 0) return "";
        const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        const form = new FormData();
        form.append("audio", blob, `turn.${ext}`);
        const res = await fetch("/api/stt", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? `Transcription failed (${res.status})`);
        return (data.text ?? "").trim();
      })
      .catch((e: Error) => {
        setError(`${e.message}. Type your argument instead.`);
        return "";
      })
      .then((text) => {
        jobRef.current = null;
        setState("idle");
        if (!next.claimed && text) onTranscriptRef.current(text);
        return text;
      });
    jobRef.current = next;
    return next.promise;
  }, []);

  /** Stop and let `onTranscript` receive the text. */
  const stop = useCallback(() => void finish(false), [finish]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      const rec = recRef.current;
      recRef.current = null;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      void streamRef.current?.then((stream) => stream?.getTracks().forEach((t) => t.stop()));
      streamRef.current = null; // React may remount in development; open a fresh stream then
    };
  }, []);

  return { supported, state, error, start, stop, finish, discard, ensureStream, clearError: () => setError(null) };
}
