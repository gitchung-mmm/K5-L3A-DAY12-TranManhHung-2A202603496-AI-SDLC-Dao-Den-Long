/**
 * Lightweight procedural sound synthesizer using browser Web Audio API.
 * Used strictly by the Web 3D presentation layer (zero impact on core simulation).
 */
export class ProceduralAudio {
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
    this.tone(660, 990, 0.14, "sine", 0.07);
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
