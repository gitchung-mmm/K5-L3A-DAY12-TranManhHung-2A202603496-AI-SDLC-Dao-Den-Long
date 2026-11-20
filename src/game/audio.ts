/**
 * Procedural Web Audio synthesizer: ambient night music + all 10 Ticket-02 SFX + story cues.
 * Strictly presentation-layer only (zero impact on core simulation).
 */
export class ProceduralAudio {
  private pickupNote = 0;
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.7;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  isEnabled(): boolean {
    return this.enabled;
  }

  getVolume(): number {
    return this.volume;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopMusic();
    }
    return this.enabled;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || this.volume <= 0.001 || typeof window === "undefined") {
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

  private tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainPeak = 0.08
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const scaledGain = Math.max(0.0002, gainPeak * this.volume);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(scaledGain, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  startMusic(): void {
    if (typeof window === "undefined" || this.bgmTimer !== null) return;
    // Gentle pentatonic night lullaby pad every 1.6s
    const notes = [220.0, 261.63, 293.66, 329.63, 392.0, 329.63, 293.66, 246.94];
    this.bgmTimer = window.setInterval(() => {
      if (!this.enabled || this.volume <= 0.001) return;
      const n = notes[this.bgmStep++ % notes.length];
      this.tone(n, n * 1.003, 1.35, "sine", 0.025);
    }, 1600);
  }

  stopMusic(): void {
    if (this.bgmTimer !== null && typeof window !== "undefined") {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  playPickup(): void {
    const notes = [523.25, 587.33, 659.25, 783.99, 880];
    const note = notes[this.pickupNote++ % notes.length];
    this.tone(note, note * 1.5, 0.16, "sine", 0.07);
  }

  playDeposit(): void {
    this.tone(440, 620, 0.18, "triangle", 0.08);
  }

  playLanternLit(): void {
    this.tone(523.25, 783.99, 0.35, "sine", 0.11);
    setTimeout(() => this.tone(659.25, 1046.5, 0.4, "triangle", 0.08), 90);
  }

  playPulse(): void {
    this.tone(540, 220, 0.28, "sine", 0.11);
  }

  playHit(): void {
    this.tone(190, 85, 0.25, "sawtooth", 0.1);
  }

  playJump(): void {
    this.tone(280, 520, 0.14, "sine", 0.07);
  }

  playDash(): void {
    this.tone(620, 240, 0.16, "triangle", 0.09);
  }

  playShadeSpawn(): void {
    this.tone(130, 95, 0.42, "sawtooth", 0.06);
  }

  playCountdownTick(): void {
    this.tone(880, 880, 0.08, "square", 0.05);
  }

  playWindWarn(): void {
    this.tone(240, 380, 0.55, "sine", 0.06);
  }

  playWin(): void {
    this.tone(523.25, 659.25, 0.28, "sine", 0.1);
    setTimeout(() => this.tone(659.25, 783.99, 0.3, "sine", 0.1), 120);
    setTimeout(() => this.tone(783.99, 1046.5, 0.5, "triangle", 0.11), 250);
  }

  playLose(): void {
    this.tone(330, 246.94, 0.35, "triangle", 0.09);
    setTimeout(() => this.tone(246.94, 164.81, 0.5, "sawtooth", 0.08), 180);
  }

  playStory(cue: "memory" | "whale" | "farewell" | "reveal"): void {
    const base = { memory: 523.25, whale: 130.81, farewell: 261.63, reveal: 880 }[cue];
    this.tone(base, base * 1.5, cue === "whale" ? 2.4 : 1.2, "sine", 0.06);
    this.tone(base * 2, base * 2, 1.5, "triangle", 0.025);
  }
}
