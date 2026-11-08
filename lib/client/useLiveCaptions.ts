"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the browser Web Speech API (Chrome/Edge expose it as webkitSpeechRecognition).
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Live captions while the user speaks (browser Web Speech API). Display only: the text
 * sent to the opponent and judge always comes from the Fish Audio transcript.
 */
export function useLiveCaptions() {
  const [supported, setSupported] = useState(false);
  const [text, setText] = useState("");
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");

  useEffect(() => setSupported(getRecognitionCtor() !== null), []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onend = null;
      rec.stop();
    }
    finalRef.current = "";
    setText("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    finalRef.current = "";
    rec.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current = `${finalRef.current} ${r[0].transcript.trim()}`.trim();
        else pending += r[0].transcript;
      }
      setText(`${finalRef.current} ${pending}`.trim());
    };
    rec.onerror = () => {}; // captions are optional; failures are silent
    rec.onend = () => {
      // Chrome ends recognition after a pause; keep captions running until stop().
      if (recRef.current === rec) {
        try {
          rec.start();
        } catch {
          recRef.current = null;
        }
      }
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
  }, []);

  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, text, start, stop };
}
