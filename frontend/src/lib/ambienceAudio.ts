import type { MeditationAmbience } from "@/lib/types";

/** Real-time noise synthesis via the Web Audio API — no external audio
 * files or licensed recordings anywhere in this module. Each ambience
 * is a genuinely different signal chain (filtered noise + optional LFO
 * modulation or randomized tone bursts), not four labels on the same
 * sound. This is honestly a synthesized approximation of the named
 * environment, not a claim of recorded rain/ocean/forest audio. */

function createNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const frameCount = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class AmbiencePlayer {
  private ctx: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private chirpTimeout: ReturnType<typeof setTimeout> | null = null;
  private masterGain: GainNode | null = null;

  /** Must be called from a real user gesture (a click handler) — browsers
   * block AudioContext creation/resume otherwise. */
  play(ambience: MeditationAmbience) {
    this.stop();
    const ctx = new AudioContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 1.5);
    master.connect(ctx.destination);
    this.masterGain = master;

    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx);
    noise.loop = true;
    this.nodes.push(noise);

    if (ambience === "noise") {
      noise.connect(master);
    } else if (ambience === "rain") {
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 1200;
      const patter = ctx.createGain();
      patter.gain.value = 1;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.15;
      lfo.connect(lfoDepth);
      lfoDepth.connect(patter.gain);
      lfo.start();
      noise.connect(highpass);
      highpass.connect(patter);
      patter.connect(master);
      this.nodes.push(highpass, patter, lfo, lfoDepth);
    } else if (ambience === "ocean") {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 500;
      const swell = ctx.createGain();
      swell.gain.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.4;
      lfo.connect(lfoDepth);
      lfoDepth.connect(swell.gain);
      lfo.start();
      noise.connect(lowpass);
      lowpass.connect(swell);
      swell.connect(master);
      this.nodes.push(lowpass, swell, lfo, lfoDepth);
    } else if (ambience === "forest") {
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 1000;
      bandpass.Q.value = 0.6;
      const bed = ctx.createGain();
      bed.gain.value = 0.5;
      noise.connect(bandpass);
      bandpass.connect(bed);
      bed.connect(master);
      this.nodes.push(bandpass, bed);
      this.scheduleChirps(ctx, master);
    }

    noise.start();
  }

  private scheduleChirps(ctx: AudioContext, destination: AudioNode) {
    const chirp = () => {
      if (!this.ctx) return;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const freq = 1800 + Math.random() * 1200;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.4, ctx.currentTime + 0.08);
      const chirpGain = ctx.createGain();
      chirpGain.gain.value = 0;
      chirpGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      chirpGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      osc.connect(chirpGain);
      chirpGain.connect(destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);

      this.chirpTimeout = setTimeout(chirp, 2000 + Math.random() * 5000);
    };
    this.chirpTimeout = setTimeout(chirp, 1000 + Math.random() * 3000);
  }

  stop() {
    if (this.chirpTimeout) {
      clearTimeout(this.chirpTimeout);
      this.chirpTimeout = null;
    }
    if (this.masterGain && this.ctx) {
      const ctx = this.ctx;
      const gain = this.masterGain;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    }
    const ctx = this.ctx;
    const nodes = this.nodes;
    this.nodes = [];
    this.ctx = null;
    this.masterGain = null;
    setTimeout(() => {
      for (const node of nodes) {
        try {
          if ("stop" in node && typeof (node as OscillatorNode).stop === "function") {
            (node as OscillatorNode).stop();
          }
          node.disconnect();
        } catch {
          // Node may already be stopped/disconnected — safe to ignore.
        }
      }
      void ctx?.close();
    }, 350);
  }
}
