/**
 * Lightweight procedural sound synthesizer using browser Web Audio API.
 * Used strictly by the Web 3D presentation layer (zero impact on core simulation).
 */
export class ProceduralAudio {
  private pickupNote = 0;
  private ctx: AudioContext | null = null;
  private enabled = true;

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === "undefined") {
      return null;
    }
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private tone(freqStart: number, freqEnd: number, duration: number, type: OscillatorType, gainPeak = 0.08): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playPickup(): void {
    const notes = [523.25, 587.33, 659.25, 783.99, 880];
    const note = notes[this.pickupNote++ % notes.length];
    this.tone(note, note * 1.5, 0.18, "sine", 0.06);
  }

  playStory(cue: "memory" | "whale" | "farewell" | "reveal"): void {
    const base = { memory: 523.25, whale: 130.81, farewell: 261.63, reveal: 880 }[cue];
    this.tone(base, base * 1.5, cue === "whale" ? 2.8 : 1.4, "sine", 0.06);
    this.tone(base * 2, base * 2, 1.8, "triangle", 0.025);
  }

  playDeposit(): void {
    this.tone(440, 620, 0.18, "triangle", 0.08);
  }

  playLanternLit(): void {
    this.tone(523.25, 783.99, 0.35, "sine", 0.11);
    setTimeout(() => this.tone(659.25, 1046.5, 0.4, "triangle", 0.08), 90);
  }

  playPulse(): void {
    this.tone(540, 220, 0.28, "sine", 0.1);
  }

  playHit(): void {
    this.tone(190, 85, 0.25, "sawtooth", 0.09);
  }
}
