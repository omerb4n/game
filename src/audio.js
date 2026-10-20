// Procedural audio: synthesized SFX + generative chiptune-ish music sequencer.
import { settings } from './save.js';
import { rng } from './util.js';

let ctx = null;
let master, musicBus, sfxBus, comp, noiseBuf;
const lastPlay = {};

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  master = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus.connect(master);
  sfxBus.connect(master);
  master.connect(comp);
  comp.connect(ctx.destination);
  // noise buffer
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
}

export function applyVolumes() {
  if (!ctx) return;
  const s = settings();
  master.gain.value = s.master;
  musicBus.gain.value = s.music * 0.65 * duck;
  sfxBus.gain.value = s.sfx * 0.9;
}

let duck = 1;
export function setDuck(v) {
  duck = v;
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(settings().music * 0.65 * duck, ctx.currentTime, 0.1);
}

function now() { return ctx.currentTime; }

function panNode(pan) {
  if (!ctx.createStereoPanner) return null;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan || 0));
  return p;
}

function tone({ type = 'square', f0 = 440, f1 = null, dur = 0.1, vol = 0.2, attack = 0.005, delay = 0, pan = 0, curve = 'exp', bus = sfxBus, lp = 0, detune = 0, vib = 0 }) {
  const t = now() + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (detune) o.detune.value = detune;
  if (f1 !== null) {
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    else o.frequency.linearRampToValueAtTime(f1, t + dur);
  }
  if (vib) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = vib;
    lg.gain.value = f0 * 0.03;
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lp;
    node.connect(f); node = f;
  }
  node.connect(g);
  const p = panNode(pan);
  if (p) { g.connect(p); p.connect(bus); } else g.connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.2, vol = 0.2, f0 = 2000, f1 = null, q = 1, type = 'bandpass', delay = 0, pan = 0, attack = 0.003, bus = sfxBus }) {
  const t = now() + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== null) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g);
  const p = panNode(pan);
  if (p) { g.connect(p); p.connect(bus); } else g.connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

const SFX = {
  jump: (o) => tone({ type: 'square', f0: 260 * o.pitch, f1: 520 * o.pitch, dur: 0.12, vol: 0.09, pan: o.pan, lp: 3000 }),
  djump: (o) => { tone({ type: 'square', f0: 380 * o.pitch, f1: 760 * o.pitch, dur: 0.1, vol: 0.08, pan: o.pan, lp: 3500 }); noise({ dur: 0.12, vol: 0.06, f0: 3000, f1: 6000, pan: o.pan }); },
  land: (o) => noise({ dur: 0.08, vol: 0.12 * o.vol, f0: 400, f1: 120, type: 'lowpass', pan: o.pan }),
  step: (o) => noise({ dur: 0.03, vol: 0.03, f0: 900, type: 'lowpass', pan: o.pan }),
  swing: (o) => noise({ dur: 0.12, vol: 0.12, f0: 800 * o.pitch, f1: 3500 * o.pitch, q: 2, pan: o.pan }),
  swingBig: (o) => { noise({ dur: 0.18, vol: 0.16, f0: 500, f1: 3000, q: 2, pan: o.pan }); tone({ type: 'sawtooth', f0: 180, f1: 90, dur: 0.15, vol: 0.06, lp: 900, pan: o.pan }); },
  hit: (o) => { noise({ dur: 0.07, vol: 0.18 * o.vol, f0: 1800 * o.pitch, f1: 500, q: 1.5, pan: o.pan }); tone({ type: 'sine', f0: 200 * o.pitch, f1: 70, dur: 0.09, vol: 0.18 * o.vol, pan: o.pan }); },
  crit: (o) => { noise({ dur: 0.1, vol: 0.2, f0: 3000, f1: 800, pan: o.pan }); tone({ type: 'square', f0: 1200, f1: 1800, dur: 0.08, vol: 0.06, pan: o.pan }); tone({ type: 'sine', f0: 160, f1: 50, dur: 0.15, vol: 0.25, pan: o.pan }); },
  stomp: (o) => { tone({ type: 'square', f0: 300 * o.pitch, f1: 900 * o.pitch, dur: 0.09, vol: 0.1, pan: o.pan }); noise({ dur: 0.06, vol: 0.12, f0: 600, type: 'lowpass', pan: o.pan }); },
  edie: (o) => {
    noise({ dur: 0.14, vol: 0.14, f0: 1200, f1: 300, pan: o.pan });
    const b = 520 * o.pitch;
    tone({ type: 'square', f0: b, dur: 0.05, vol: 0.06, pan: o.pan, lp: 4000 });
    tone({ type: 'square', f0: b * 1.5, dur: 0.06, vol: 0.06, delay: 0.04, pan: o.pan, lp: 4000 });
  },
  pickup: (o) => { tone({ type: 'square', f0: 880 * o.pitch, dur: 0.06, vol: 0.07, lp: 5000 }); tone({ type: 'square', f0: 1320 * o.pitch, dur: 0.09, vol: 0.07, delay: 0.05, lp: 5000 }); },
  coin: (o) => { tone({ type: 'triangle', f0: 1568 * o.pitch, dur: 0.05, vol: 0.12 }); tone({ type: 'triangle', f0: 2093 * o.pitch, dur: 0.12, vol: 0.12, delay: 0.05 }); },
  heal: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.2, vol: 0.12, delay: i * 0.05 })); },
  golden: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.13, delay: i * 0.06 })); },
  hurt: (o) => { tone({ type: 'square', f0: 420, f1: 110, dur: 0.25, vol: 0.13, pan: o.pan, lp: 2500 }); noise({ dur: 0.15, vol: 0.12, f0: 1000, f1: 200, pan: o.pan }); },
  down: () => { [392, 330, 262, 196].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.18, vol: 0.09, delay: i * 0.1, lp: 2000 })); },
  revive: () => { [262, 330, 392, 523, 659].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.14, vol: 0.08, delay: i * 0.06, lp: 3500 })); },
  boom: (o) => { noise({ dur: 0.5 * o.vol + 0.15, vol: 0.3, f0: 1200, f1: 60, type: 'lowpass', pan: o.pan }); tone({ type: 'sine', f0: 120, f1: 35, dur: 0.4, vol: 0.3, pan: o.pan }); },
  bolt: (o) => tone({ type: 'sawtooth', f0: 1400 * o.pitch, f1: 600, dur: 0.08, vol: 0.05, lp: 4000, pan: o.pan }),
  fireball: (o) => { noise({ dur: 0.3, vol: 0.14, f0: 600, f1: 2000, pan: o.pan }); tone({ type: 'sawtooth', f0: 200, f1: 400, dur: 0.2, vol: 0.06, lp: 1500, pan: o.pan }); },
  charge: (o) => tone({ type: 'sine', f0: 400 + o.pitch * 600, dur: 0.05, vol: 0.05 }),
  chargeFull: () => { tone({ type: 'triangle', f0: 1760, dur: 0.12, vol: 0.1 }); tone({ type: 'triangle', f0: 2637, dur: 0.15, vol: 0.08, delay: 0.04 }); },
  arrow: (o) => { noise({ dur: 0.1, vol: 0.1, f0: 2500, f1: 1200, q: 3, pan: o.pan }); tone({ type: 'triangle', f0: 600 * o.pitch, f1: 300, dur: 0.06, vol: 0.06, pan: o.pan }); },
  arrowBig: (o) => { noise({ dur: 0.2, vol: 0.16, f0: 3000, f1: 800, q: 2, pan: o.pan }); tone({ type: 'square', f0: 900, f1: 200, dur: 0.15, vol: 0.06, lp: 3000, pan: o.pan }); },
  shuriken: (o) => noise({ dur: 0.07, vol: 0.09, f0: 5000, f1: 2500, q: 4, pan: o.pan }),
  throw: (o) => noise({ dur: 0.12, vol: 0.08, f0: 700, f1: 1600, q: 2, pan: o.pan }),
  splash: (o) => { noise({ dur: 0.25, vol: 0.16, f0: 2500, f1: 400, q: 1, pan: o.pan }); tone({ type: 'sine', f0: 700, f1: 250, dur: 0.12, vol: 0.08, pan: o.pan }); },
  shotgun: (o) => { noise({ dur: 0.22, vol: 0.28, f0: 3000, f1: 200, type: 'lowpass', pan: o.pan }); tone({ type: 'square', f0: 150, f1: 50, dur: 0.12, vol: 0.12, pan: o.pan }); },
  dash: (o) => { noise({ dur: 0.2, vol: 0.14, f0: 400, f1: 4000, q: 1.5, pan: o.pan }); },
  teleport: (o) => { tone({ type: 'sine', f0: 1800, f1: 300, dur: 0.15, vol: 0.1, pan: o.pan }); noise({ dur: 0.15, vol: 0.08, f0: 6000, f1: 2000, q: 3, pan: o.pan }); },
  freeze: (o) => { [1760, 2349, 2637, 3520].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.18, vol: 0.06, delay: i * 0.03, pan: o.pan })); noise({ dur: 0.3, vol: 0.1, f0: 6000, f1: 3000, q: 2, pan: o.pan }); },
  shatter: (o) => { noise({ dur: 0.25, vol: 0.2, f0: 7000, f1: 1500, q: 1, pan: o.pan }); [2093, 2637, 3136].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.1, vol: 0.07, delay: i * 0.02, pan: o.pan })); },
  spring: (o) => tone({ type: 'sine', f0: 200, f1: 900, dur: 0.18, vol: 0.14, vib: 30, pan: o.pan }),
  portal: (o) => { tone({ type: 'sine', f0: 200, f1: 600, dur: 0.5, vol: 0.06, vib: 12, pan: o.pan }); },
  eshoot: (o) => tone({ type: 'square', f0: 600 * o.pitch, f1: 300 * o.pitch, dur: 0.08, vol: 0.05, lp: 2500, pan: o.pan }),
  telegraph: (o) => tone({ type: 'triangle', f0: 900, f1: 1200, dur: 0.15, vol: 0.06, pan: o.pan }),
  roar: () => { tone({ type: 'sawtooth', f0: 110, f1: 60, dur: 1.0, vol: 0.18, lp: 600, vib: 7 }); noise({ dur: 1.0, vol: 0.15, f0: 400, f1: 100, type: 'lowpass' }); },
  slam: (o) => { noise({ dur: 0.35, vol: 0.3, f0: 500, f1: 50, type: 'lowpass', pan: o.pan }); tone({ type: 'sine', f0: 80, f1: 30, dur: 0.35, vol: 0.35, pan: o.pan }); },
  combo: (o) => tone({ type: 'square', f0: 440 * Math.pow(2, Math.min(o.pitch, 24) / 12), dur: 0.08, vol: 0.05, lp: 4000 }),
  click: () => tone({ type: 'square', f0: 900, f1: 1200, dur: 0.04, vol: 0.05, lp: 4000 }),
  hover: () => tone({ type: 'sine', f0: 1400, dur: 0.03, vol: 0.03 }),
  back: () => tone({ type: 'square', f0: 700, f1: 400, dur: 0.06, vol: 0.05, lp: 3000 }),
  select: () => { tone({ type: 'square', f0: 660, dur: 0.06, vol: 0.06, lp: 4000 }); tone({ type: 'square', f0: 990, dur: 0.1, vol: 0.06, delay: 0.06, lp: 4000 }); },
  join: () => { [523, 784, 1047].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.1, vol: 0.07, delay: i * 0.06, lp: 4000 })); },
  victory: () => {
    const n = [523, 659, 784, 1047, 784, 1047, 1319];
    const d = [0, 0.1, 0.2, 0.3, 0.45, 0.55, 0.7];
    n.forEach((f, i) => { tone({ type: 'square', f0: f, dur: i === n.length - 1 ? 0.6 : 0.12, vol: 0.08, delay: d[i], lp: 4000 }); tone({ type: 'triangle', f0: f / 2, dur: 0.15, vol: 0.1, delay: d[i] }); });
  },
  defeat: () => { [392, 370, 349, 330].forEach((f, i) => tone({ type: 'square', f0: f, dur: i === 3 ? 0.7 : 0.25, vol: 0.08, delay: i * 0.28, lp: 2000, vib: i === 3 ? 6 : 0 })); },
  achievement: () => { [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.18, vol: 0.1, delay: i * 0.07 })); },
  banner: () => { tone({ type: 'triangle', f0: 523, dur: 0.15, vol: 0.1 }); tone({ type: 'triangle', f0: 784, dur: 0.25, vol: 0.1, delay: 0.12 }); },
  tick: () => tone({ type: 'square', f0: 1200, dur: 0.03, vol: 0.04, lp: 4000 }),
  shield: (o) => { tone({ type: 'triangle', f0: 1200, f1: 2000, dur: 0.08, vol: 0.08, pan: o.pan }); noise({ dur: 0.05, vol: 0.1, f0: 5000, pan: o.pan }); },
};

export function sfx(name, opts = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const fn = SFX[name];
  if (!fn) return;
  const t = performance.now();
  const gap = opts.gap ?? 28;
  if (lastPlay[name] && t - lastPlay[name] < gap) return;
  lastPlay[name] = t;
  try {
    fn({ pitch: opts.pitch ?? 1, vol: opts.vol ?? 1, pan: opts.pan ?? 0 });
  } catch (e) { /* ignore audio errors */ }
}

// ---------------------------------------------------------------- MUSIC
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixo: [0, 2, 4, 5, 7, 9, 10],
};

const TRACKS = {
  menu: { bpm: 96, root: 60, scale: 'major', prog: [0, 5, 3, 4], seed: 11, drums: 'soft', arp: 'up', lead: 0.7, swing: 0.08 },
  w1: { bpm: 126, root: 65, scale: 'major', prog: [0, 4, 5, 3], seed: 7, drums: 'pop', arp: 'updown', lead: 1, swing: 0 },
  w2: { bpm: 112, root: 62, scale: 'dorian', prog: [0, 6, 5, 6], seed: 23, drums: 'groove', arp: 'down', lead: 0.8, swing: 0.1 },
  w3: { bpm: 118, root: 64, scale: 'lydian', prog: [0, 1, 5, 4], seed: 42, drums: 'pop', arp: 'sparkle', lead: 0.9, swing: 0 },
  w4: { bpm: 138, root: 57, scale: 'harmonic', prog: [0, 3, 4, 0, 5, 3, 4, 4], seed: 99, drums: 'drive', arp: 'updown', lead: 1, swing: 0 },
  boss: { bpm: 150, root: 60, scale: 'harmonic', prog: [0, 5, 6, 4], seed: 5, drums: 'drive', arp: 'up', lead: 1, swing: 0 },
  final: { bpm: 158, root: 58, scale: 'harmonic', prog: [0, 5, 3, 4, 0, 5, 6, 4], seed: 666, drums: 'drive', arp: 'updown', lead: 1, swing: 0 },
  results: { bpm: 104, root: 67, scale: 'major', prog: [0, 3, 4, 0], seed: 3, drums: 'soft', arp: 'up', lead: 0.6, swing: 0.1 },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

let music = null; // {name, track, step, nextTime, melody, timer}

function buildMelody(tr) {
  const r = rng(tr.seed);
  const sc = SCALES[tr.scale];
  const bars = tr.prog.length;
  // motif: per bar, 8 eighth-note slots, value = scale index offset or null (rest)
  const makeBar = (chordDeg, variant) => {
    const out = [];
    let cur = chordDeg + (r() < 0.5 ? 2 : 4);
    for (let i = 0; i < 8; i++) {
      const strong = i % 2 === 0;
      if (!strong && r() < 0.35) { out.push(null); continue; }
      if (i === 7 && r() < 0.5) { out.push(null); continue; }
      if (strong) {
        const ct = [chordDeg, chordDeg + 2, chordDeg + 4, chordDeg + 7];
        // move to nearest chord tone
        let best = ct[0];
        for (const c of ct) if (Math.abs(c - cur) < Math.abs(best - cur) || (Math.abs(c - cur) === Math.abs(best - cur) && r() < 0.5)) best = c;
        cur = best + (variant && r() < 0.3 ? 2 : 0);
      } else {
        cur += r() < 0.5 ? 1 : -1;
      }
      out.push(cur);
    }
    return out;
  };
  const A = tr.prog.map((d) => makeBar(d, false));
  const B = tr.prog.map((d) => makeBar(d, true));
  // structure A A B A
  return { A, B, sc, bars };
}

const DRUMS = {
  soft: { k: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], h: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
  pop: { k: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], s: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], h: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1] },
  groove: { k: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1], h: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0] },
  drive: { k: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0], s: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], h: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
};

function scheduleStep(m, t) {
  const tr = m.track;
  const sc = SCALES[tr.scale];
  const stepInBar = m.step % 16;
  const barIdx = Math.floor(m.step / 16);
  const progLen = tr.prog.length;
  const deg = tr.prog[barIdx % progLen];
  const section = Math.floor(barIdx / progLen) % 4; // A A B A
  const intensity = m.intensity;
  const noteOf = (d, oct = 0) => {
    const o = Math.floor(d / 7);
    const i = ((d % 7) + 7) % 7;
    return tr.root + sc[i] + 12 * (o + oct);
  };
  const sixteenth = 60 / tr.bpm / 4;
  const swingOff = stepInBar % 2 === 1 ? sixteenth * tr.swing : 0;
  const tt = t + swingOff;

  // drums
  const dp = DRUMS[tr.drums];
  if (dp.k[stepInBar]) drumKick(tt);
  if (dp.s[stepInBar] && intensity > 0.3) drumSnare(tt);
  if (dp.h[stepInBar] && intensity > 0.15) drumHat(tt, stepInBar % 4 === 0 ? 0.05 : 0.03);

  // bass: root on 1, fifth/octave pattern
  if (stepInBar % 4 === 0 || (tr.drums === 'drive' && stepInBar % 2 === 0)) {
    const pat = [0, 0, 4, 7];
    const n = noteOf(deg + (stepInBar === 8 ? (pat[(barIdx) % 4] === 7 ? 0 : 4) : 0), -2);
    mnote(tt, mtof(n), sixteenth * (tr.drums === 'drive' ? 1.8 : 3.5), 'triangle', 0.22, 700);
  }
  // pad at bar start
  if (stepInBar === 0) {
    const dur = sixteenth * 16;
    [0, 2, 4].forEach((o) => {
      mnote(tt, mtof(noteOf(deg + o, -1)), dur, 'sawtooth', 0.025, 900, 0.3, 7);
      mnote(tt, mtof(noteOf(deg + o, -1)), dur, 'sawtooth', 0.025, 900, 0.3, -7);
    });
  }
  // arp
  if (intensity > 0.2) {
    const pats = { up: [0, 2, 4, 7], down: [7, 4, 2, 0], updown: [0, 2, 4, 7, 4, 2], sparkle: [7, 4, 9, 2, 11, 4] };
    const p = pats[tr.arp];
    const k = p[m.step % p.length];
    if (stepInBar % 2 === 0 || tr.arp === 'sparkle') {
      mnote(tt, mtof(noteOf(deg + k, tr.arp === 'sparkle' ? 1 : 0)), sixteenth * 0.9, 'square', 0.028, 2600);
    }
  }
  // lead melody on eighths
  if (stepInBar % 2 === 0 && intensity > 0.45) {
    const mel = m.melody;
    const bars = section === 2 ? mel.B : mel.A;
    const bar = bars[barIdx % progLen];
    const v = bar[stepInBar / 2];
    if (v !== null && v !== undefined) {
      const len = bar[stepInBar / 2 + 1] === null ? sixteenth * 3.6 : sixteenth * 1.8;
      mnote(tt, mtof(noteOf(v, 1)), len, 'square', 0.05 * tr.lead, 3200, 0.01, 0, 5);
      mnote(tt, mtof(noteOf(v, 1)), len, 'triangle', 0.04 * tr.lead, 6000, 0.01, 0, 5);
    }
  }
}

function mnote(t, f, dur, type, vol, lp, attack = 0.005, detune = 0, vib = 0) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const fl = ctx.createBiquadFilter();
  o.type = type;
  o.frequency.value = f;
  if (detune) o.detune.value = detune;
  if (vib) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = vib; lg.gain.value = f * 0.006;
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t + 0.1); lfo.stop(t + dur + 0.05);
  }
  fl.type = 'lowpass'; fl.frequency.value = lp;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(musicBus);
  o.start(t); o.stop(t + dur + 0.05);
}

function drumKick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  o.connect(g); g.connect(musicBus);
  o.start(t); o.stop(t + 0.16);
}
function drumSnare(t) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  s.connect(f); f.connect(g); g.connect(musicBus);
  s.start(t, Math.random()); s.stop(t + 0.14);
  const o = ctx.createOscillator(); const og = ctx.createGain();
  o.frequency.value = 190; og.gain.setValueAtTime(0.1, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(og); og.connect(musicBus); o.start(t); o.stop(t + 0.08);
}
function drumHat(t, v) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  s.connect(f); f.connect(g); g.connect(musicBus);
  s.start(t, Math.random()); s.stop(t + 0.05);
}

export function playMusic(name, intensity = 1) {
  if (!ctx) { pendingMusic = name; return; }
  if (music && music.name === name) { music.intensity = intensity; return; }
  stopMusic();
  const track = TRACKS[name];
  if (!track) return;
  music = { name, track, step: 0, nextTime: ctx.currentTime + 0.1, melody: buildMelody(track), intensity };
  music.timer = setInterval(() => {
    if (!music || ctx.state !== 'running') return;
    const sixteenth = 60 / music.track.bpm / 4;
    while (music.nextTime < ctx.currentTime + 0.15) {
      scheduleStep(music, music.nextTime);
      music.nextTime += sixteenth;
      music.step++;
    }
  }, 30);
}
let pendingMusic = null;
export function resumePendingMusic() {
  if (pendingMusic) { const p = pendingMusic; pendingMusic = null; playMusic(p); }
}

export function setMusicIntensity(v) { if (music) music.intensity = v; }

export function stopMusic() {
  if (music) { clearInterval(music.timer); music = null; }
}

export function currentMusic() { return music ? music.name : null; }

// Dev/test helper: render a few seconds of a music track offline and return level statistics.
export async function analyzeTrack(name, seconds = 8) {
  const sr = 22050;
  const off = new OfflineAudioContext(1, sr * seconds, sr);
  const saved = { ctx, musicBus, noiseBuf };
  ctx = off;
  musicBus = off.createGain();
  musicBus.gain.value = 0.5 * 0.6;
  musicBus.connect(off.destination);
  noiseBuf = off.createBuffer(1, sr, sr);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const track = TRACKS[name];
  const m = { name, track, step: 0, nextTime: 0.05, melody: buildMelody(track), intensity: 1 };
  const sixteenth = 60 / track.bpm / 4;
  while (m.nextTime < seconds - 0.5) { scheduleStep(m, m.nextTime); m.nextTime += sixteenth; m.step++; }
  ctx = saved.ctx; musicBus = saved.musicBus; noiseBuf = saved.noiseBuf;
  const buf = await off.startRendering();
  const data = buf.getChannelData(0);
  let peak = 0, sum = 0;
  for (const v of data) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; }
  return { name, rms: Math.sqrt(sum / data.length), peak, samples: Array.from(data) };
}
