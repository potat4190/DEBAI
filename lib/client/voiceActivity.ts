"use client";
// Tells whether the user is talking, from the microphone's volume. The noise floor adapts to the
// room, so the same thresholds work in a quiet bedroom and a noisy hackathon hall.

const SPEECH_MARGIN_DB = 10; // above the noise floor = talking
const BARGE_MARGIN_DB = 18; // talking over the AI must be clearly louder (the AI's voice can leak into the mic)
const MIN_SPEECH_DB = -55;
const MIN_BARGE_DB = -42;
const HANGOVER_MS = 250; // short dips between syllables still count as talking

export interface VoiceSample {
  speaking: boolean; // normal talking threshold
  loud: boolean; // the stricter threshold used to cut the AI off
  db: number;
}

export class VoiceActivity {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private source: MediaStreamAudioSourceNode;
  private buf: Float32Array<ArrayBuffer>;
  private floorDb = -60;
  private lastSpeechAt = -Infinity;

  constructor(stream: MediaStream) {
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser);
    void this.ctx.resume().catch(() => {});
  }

  /** Reads the current mic level. Call it every 50–100 ms. */
  sample(now: number): VoiceSample {
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const db = 20 * Math.log10(Math.sqrt(sum / this.buf.length) + 1e-9);

    // Noise floor: falls quickly to quiet levels, rises slowly so speech doesn't drag it up.
    this.floorDb = db < this.floorDb ? this.floorDb * 0.7 + db * 0.3 : this.floorDb + (db - this.floorDb) * 0.01;
    this.floorDb = Math.min(-35, Math.max(-85, this.floorDb));

    const above = db > Math.max(this.floorDb + SPEECH_MARGIN_DB, MIN_SPEECH_DB);
    if (above) this.lastSpeechAt = now;
    return {
      speaking: now - this.lastSpeechAt <= HANGOVER_MS,
      loud: db > Math.max(this.floorDb + BARGE_MARGIN_DB, MIN_BARGE_DB),
      db,
    };
  }

  close() {
    this.source.disconnect();
    void this.ctx.close().catch(() => {});
  }
}
