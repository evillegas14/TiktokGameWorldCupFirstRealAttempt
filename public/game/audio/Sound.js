// Procedural sound effects + ambience using the Web Audio API — no asset files.
// Browsers suspend audio until a user gesture; call sfx.unlock() on first
// pointer/key event. OBS Browser Source can be set to control audio via OBS.

class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicOn = true;
    this._musicNodes = [];
    this._crowd = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    // Music requested before the first user gesture couldn't start (no context
    // yet) — honor that request now.
    if (this._musicWanted) this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  #env(node, { attack = 0.005, decay = 0.2, peak = 0.6, start = this.t }) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  #tone(freq, { type = 'sine', attack = 0.005, decay = 0.25, peak = 0.5, start = this.t, glideTo = null, dur = null }) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + (dur || attack + decay));
    this.#env(o, { attack, decay, peak, start });
    o.start(start);
    o.stop(start + (dur || attack + decay) + 0.05);
  }

  #noise(durSec) {
    const len = Math.floor(this.ctx.sampleRate * durSec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  // --- Effects ---
  pop() {
    if (!this.ctx) return;
    this.#tone(440, { type: 'triangle', attack: 0.002, decay: 0.12, peak: 0.35, glideTo: 880, dur: 0.12 });
  }

  click() {
    if (!this.ctx) return;
    this.#tone(700, { type: 'square', attack: 0.001, decay: 0.05, peak: 0.2 });
  }

  // Soft ball-bounce thud; strength 0..1 scales pitch/volume.
  thud(strength = 0.5) {
    if (!this.ctx) return;
    const s = this.t;
    const f = 120 + strength * 90;
    this.#tone(f, { type: 'sine', attack: 0.003, decay: 0.1, peak: 0.15 + strength * 0.25, glideTo: f * 0.5, dur: 0.1, start: s });
  }

  whistle() {
    if (!this.ctx) return;
    const s = this.t;
    this.#tone(2100, { type: 'triangle', attack: 0.01, decay: 0.18, peak: 0.4, start: s });
    this.#tone(2100, { type: 'triangle', attack: 0.01, decay: 0.18, peak: 0.4, start: s + 0.22 });
    this.#tone(2300, { type: 'triangle', attack: 0.01, decay: 0.35, peak: 0.45, start: s + 0.44 });
  }

  cannon() {
    if (!this.ctx) return;
    const s = this.t;
    // low thump
    this.#tone(90, { type: 'sine', attack: 0.005, decay: 0.35, peak: 0.9, glideTo: 40, dur: 0.35, start: s });
    // noise burst through a falling lowpass
    const src = this.#noise(0.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, s);
    lp.frequency.exponentialRampToValueAtTime(200, s + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.7, s);
    g.gain.exponentialRampToValueAtTime(0.001, s + 0.3);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(s); src.stop(s + 0.32);
  }

  // Deep volcano rumble — a long sub-bass swell + filtered noise roar.
  rumble(durSec = 0.9) {
    if (!this.ctx) return;
    const s = this.t;
    // Sub-bass that sags downward.
    this.#tone(48, { type: 'sine', attack: 0.04, decay: durSec, peak: 0.9, glideTo: 24, dur: durSec, start: s });
    // Noise roar through a falling lowpass for the "boom" body.
    const src = this.#noise(durSec);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, s);
    lp.frequency.exponentialRampToValueAtTime(80, s + durSec);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.85, s + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, s + durSec);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(s); src.stop(s + durSec + 0.05);
  }

  cheer(durSec = 1.2) {
    if (!this.ctx) return;
    const s = this.t;
    const src = this.#noise(durSec);
    src.loop = false;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1000;
    bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.linearRampToValueAtTime(0.5, s + 0.25);
    g.gain.linearRampToValueAtTime(0.35, s + durSec * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, s + durSec);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(s); src.stop(s + durSec + 0.05);
  }

  goal() {
    if (!this.ctx) return;
    const s = this.t;
    // air-horn: two stacked saws sliding up
    [220, 277].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, s);
      o.frequency.linearRampToValueAtTime(f * 1.5, s + 0.15);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.4, s + 0.05);
      g.gain.setValueAtTime(0.4, s + 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.95);
      o.connect(g); g.connect(this.master);
      o.start(s); o.stop(s + 1.0);
    });
    this.cheer(1.6);
  }

  giftFanfare(tier = 1) {
    if (!this.ctx) return;
    const s = this.t;
    const scale = [523, 587, 659, 784, 880, 1047]; // C D E G A C
    const notes = Math.min(scale.length, 2 + tier);
    for (let i = 0; i < notes; i++) {
      this.#tone(scale[i], {
        type: 'square', attack: 0.01, decay: 0.18, peak: 0.3,
        start: s + i * 0.09,
      });
    }
    if (tier >= 4) this.cheer(0.8);
  }

  whoosh() {
    if (!this.ctx) return;
    const s = this.t;
    const src = this.#noise(0.4);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, s);
    bp.frequency.exponentialRampToValueAtTime(3000, s + 0.35);
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.linearRampToValueAtTime(0.4, s + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, s + 0.4);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(s); src.stop(s + 0.42);
  }

  // --- Ambience / music ---
  startMusic() {
    this._musicWanted = true;
    if (!this.ctx || !this.musicOn || this._musicNodes.length) return;
    // Soft pad: two detuned triangles through a slow lowpass.
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    g.connect(this.master);
    lp.connect(g);
    [110, 110 * 1.005, 165].forEach((f) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      this._musicNodes.push(o);
    });
    // Crowd bed: looping filtered noise at low level.
    const bed = this.#noise(2);
    bed.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.4;
    const bg = this.ctx.createGain();
    bg.gain.value = 0.04;
    bed.connect(bp); bp.connect(bg); bg.connect(this.master);
    bed.start();
    this._crowd = bed;
    this._musicNodes.push(bed);
  }

  stopMusic() {
    this._musicWanted = false;
    for (const n of this._musicNodes) { try { n.stop(); } catch (e) {} }
    this._musicNodes = [];
    this._crowd = null;
  }

  setMusicEnabled(on) {
    this.musicOn = on;
    if (on) this.startMusic(); else this.stopMusic();
  }
}

export const sfx = new SoundManager();
