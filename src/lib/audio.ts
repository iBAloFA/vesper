import { CHANNEL_IDS, emptyLevels, type ChannelId, type Levels } from "./types";

const CHANNEL_SCALE: Record<ChannelId, number> = {
  wind: 0.35,
  rain: 0.3,
  fire: 0.5,
  drone: 0.4,
  bells: 0,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

type SourceNode = AudioScheduledSourceNode;

export class AmbienceEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private gains: Partial<Record<ChannelId, GainNode>> = {};
  private sources: SourceNode[] = [];
  private timers: number[] = [];
  private levels: Levels = emptyLevels();
  private volume = 0.7;
  private running = false;
  private whiteNoise: AudioBuffer | null = null;
  private brownNoise: AudioBuffer | null = null;

  isRunning(): boolean {
    return this.running;
  }

  async start(levels: Levels, volume: number): Promise<void> {
    if (this.running) {
      this.setLevels(levels);
      this.setVolume(volume);
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("This browser does not support the Web Audio API.");
    const context = new Ctor();
    await context.resume();

    this.context = context;
    this.volume = clamp01(volume);
    this.levels = { ...levels };

    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.volume), context.currentTime + 1.4);
    master.connect(context.destination);
    this.master = master;

    this.whiteNoise = this.makeNoise(context, 3, false);
    this.brownNoise = this.makeNoise(context, 4, true);

    this.buildWind(context, master);
    this.buildRain(context, master);
    this.buildFire(context, master);
    this.buildDrone(context, master);

    this.scheduleCrackle();
    this.scheduleBells();
    this.running = true;
    this.setLevels(levels);
  }

  setLevels(levels: Levels): void {
    this.levels = { ...levels };
    const context = this.context;
    if (!context) return;
    for (const channel of CHANNEL_IDS) {
      const gain = this.gains[channel];
      if (!gain) continue;
      const target = clamp01(levels[channel]) * CHANNEL_SCALE[channel];
      gain.gain.setTargetAtTime(Math.max(0.0001, target), context.currentTime, 0.4);
    }
  }

  setVolume(volume: number): void {
    this.volume = clamp01(volume);
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(
      Math.max(0.0001, this.volume),
      this.context.currentTime,
      0.25,
    );
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    const context = this.context;
    const master = this.master;
    const sources = this.sources;
    this.context = null;
    this.master = null;
    this.sources = [];
    this.gains = {};
    this.whiteNoise = null;
    this.brownNoise = null;
    if (!context) return;
    if (master) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0.0001, context.currentTime, 0.25);
    }
    window.setTimeout(() => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Source may already have ended.
        }
      }
      void context.close().catch(() => {});
    }, 700);
  }

  private channel(context: AudioContext, master: GainNode): GainNode {
    const gain = context.createGain();
    gain.gain.value = 0.0001;
    gain.connect(master);
    return gain;
  }

  private makeNoise(context: AudioContext, seconds: number, brown: boolean): AudioBuffer {
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[index] = last * 3.4;
      } else {
        data[index] = white * 0.62;
      }
    }
    return buffer;
  }

  private buildWind(context: AudioContext, master: GainNode): void {
    if (!this.whiteNoise) return;
    const source = context.createBufferSource();
    source.buffer = this.whiteNoise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.65;
    const gain = this.channel(context, master);
    source.connect(filter).connect(gain);
    source.start();
    const lfo = context.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 170;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.sources.push(source, lfo);
    this.gains.wind = gain;
  }

  private buildRain(context: AudioContext, master: GainNode): void {
    if (!this.whiteNoise) return;
    const source = context.createBufferSource();
    source.buffer = this.whiteNoise;
    source.loop = true;
    source.playbackRate.value = 1.4;
    const high = context.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 700;
    const low = context.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 6800;
    const gain = this.channel(context, master);
    source.connect(high).connect(low).connect(gain);
    source.start();
    this.sources.push(source);
    this.gains.rain = gain;
  }

  private buildFire(context: AudioContext, master: GainNode): void {
    if (!this.brownNoise) return;
    const source = context.createBufferSource();
    source.buffer = this.brownNoise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 760;
    const gain = this.channel(context, master);
    source.connect(filter).connect(gain);
    source.start();
    this.sources.push(source);
    this.gains.fire = gain;
  }

  private buildDrone(context: AudioContext, master: GainNode): void {
    const gain = this.channel(context, master);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.connect(gain);
    const frequencies = [55, 55.6, 82.4];
    for (const frequency of frequencies) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const voice = context.createGain();
      voice.gain.value = 0.09;
      oscillator.connect(voice).connect(filter);
      oscillator.start();
      this.sources.push(oscillator);
    }
    this.gains.drone = gain;
  }

  private scheduleCrackle(): void {
    const timer = window.setTimeout(() => {
      if (!this.running) return;
      const context = this.context;
      const fire = this.gains.fire;
      if (context && fire && this.brownNoise && this.levels.fire > 0.02) {
        const source = context.createBufferSource();
        source.buffer = this.brownNoise;
        source.playbackRate.value = 0.75 + Math.random() * 0.9;
        const filter = context.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1600 + Math.random() * 2200;
        filter.Q.value = 1.2;
        const burst = context.createGain();
        const now = context.currentTime;
        burst.gain.setValueAtTime(0.0001, now);
        burst.gain.exponentialRampToValueAtTime(0.16 + Math.random() * 0.18, now + 0.012);
        burst.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        source.connect(filter).connect(burst).connect(fire);
        source.start(now);
        source.stop(now + 0.14);
      }
      this.scheduleCrackle();
    }, 110 + Math.random() * 320);
    this.timers.push(timer);
  }

  private scheduleBells(): void {
    const timer = window.setTimeout(() => {
      if (!this.running) return;
      if (this.context && this.master && this.levels.bells > 0.02) {
        playBell(this.context, this.master, this.levels.bells * 0.5);
      }
      this.scheduleBells();
    }, 9000 + Math.random() * 14000);
    this.timers.push(timer);
  }
}

export function playBell(context: AudioContext, destination: AudioNode, level: number): void {
  const now = context.currentTime;
  const carrier = context.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = 220;
  const modulator = context.createOscillator();
  modulator.type = "sine";
  modulator.frequency.value = 220 * 2.76;
  const depth = context.createGain();
  depth.gain.setValueAtTime(240, now);
  depth.gain.exponentialRampToValueAtTime(0.1, now + 4.5);
  modulator.connect(depth).connect(carrier.frequency);
  const envelope = context.createGain();
  const peak = Math.max(0.0001, level);
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(peak, now + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + 5);
  carrier.connect(envelope).connect(destination);
  carrier.start(now);
  modulator.start(now);
  carrier.stop(now + 5.2);
  modulator.stop(now + 5.2);
}

export async function playChime(volume = 0.35): Promise<void> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const context = new Ctor();
  await context.resume();
  const master = context.createGain();
  master.gain.value = clamp01(volume);
  master.connect(context.destination);
  playBell(context, master, 0.5);
  window.setTimeout(() => {
    void context.close().catch(() => {});
  }, 5400);
}
