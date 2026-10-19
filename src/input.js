// Input: keyboard (3 schemes), gamepads, touch. Produces per-player Controllers.
import { settings } from './save.js';

const keys = new Set();
const keyLatch = new Set(); // codes pressed since last sample
const listeners = { nav: [], anyKey: [] };

export const SCHEMES = {
  kbFull: {
    label: 'Keyboard',
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'KeyZ', 'KeyC', 'KeyK'], attack: ['KeyX', 'KeyJ', 'KeyV'], special: ['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyB', 'Semicolon'],
    pause: ['Escape', 'KeyP'],
  },
  kbLeft: {
    label: 'Keyboard (left)',
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    jump: ['KeyC', 'Space'], attack: ['KeyV'], special: ['KeyB'], pause: ['Escape'],
  },
  kbRight: {
    label: 'Keyboard (right)',
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['KeyK', 'Numpad1'], attack: ['KeyL', 'Numpad2'], special: ['Semicolon', 'Numpad3'], pause: ['KeyP'],
  },
};

const BTN = ['jump', 'attack', 'special', 'pause'];

export class Controller {
  constructor(kind, padIndex = -1) {
    this.kind = kind; // kbFull | kbLeft | kbRight | pad | touch | ai
    this.padIndex = padIndex;
    this.x = 0; this.y = 0;
    this.jump = false; this.attack = false; this.special = false; this.pause = false;
    this.jumpP = false; this.attackP = false; this.specialP = false; this.pauseP = false;
    this.jumpR = false; this.attackR = false; this.specialR = false;
    this.prev = { jump: false, attack: false, special: false, pause: false };
    this.latch = { jump: false, attack: false, special: false, pause: false };
    this.upPrev = false;
  }
  get label() {
    if (this.kind === 'pad') return `Gamepad ${this.padIndex + 1}`;
    if (this.kind === 'touch') return 'Touch';
    return SCHEMES[this.kind]?.label || this.kind;
  }
  // Called once per fixed simulation step
  sample() {
    const raw = readRaw(this);
    this.x = raw.x; this.y = raw.y;
    let jumpRaw = raw.jump;
    // optional up-to-jump
    const upNow = raw.y < -0.6;
    let upEdge = false;
    if (settings().upToJump && this.kind !== 'ai') {
      upEdge = upNow && !this.upPrev;
      jumpRaw = jumpRaw || upNow;
    }
    this.upPrev = upNow;
    const cur = { jump: jumpRaw, attack: raw.attack, special: raw.special, pause: raw.pause };
    for (const b of BTN) {
      const latched = this.latch[b] || raw.latch?.[b];
      this[b + 'P'] = (cur[b] && !this.prev[b]) || !!latched || (b === 'jump' && upEdge);
      this[b + 'R'] = !cur[b] && (this.prev[b] || !!latched);
      this[b] = cur[b];
      this.prev[b] = cur[b];
      this.latch[b] = false;
    }
  }
  neutralize() {
    this.x = 0; this.y = 0;
    for (const b of BTN) { this[b] = false; this[b + 'P'] = false; this[b + 'R'] = false; }
  }
  clearEdges() {
    for (const b of BTN) { this[b + 'P'] = false; this[b + 'R'] = false; }
  }
}

function anyKey(list) {
  for (const k of list) if (keys.has(k)) return true;
  return false;
}
function anyLatch(list) {
  for (const k of list) if (keyLatch.has(k)) return true;
  return false;
}

const consumedLatch = new Set();
function readRaw(c) {
  if (c.kind === 'ai') return c.ai || { x: 0, y: 0 };
  if (c.kind === 'touch') return touch.read();
  if (c.kind === 'pad') return readPad(c.padIndex);
  const s = SCHEMES[c.kind];
  const latch = {};
  for (const b of BTN) {
    if (anyLatch(s[b])) { latch[b] = true; for (const k of s[b]) consumedLatch.add(k); }
  }
  return {
    x: (anyKey(s.right) ? 1 : 0) - (anyKey(s.left) ? 1 : 0),
    y: (anyKey(s.down) ? 1 : 0) - (anyKey(s.up) ? 1 : 0),
    jump: anyKey(s.jump), attack: anyKey(s.attack), special: anyKey(s.special), pause: anyKey(s.pause),
    latch,
  };
}

// Call after all controllers sampled in a step
export function endSample() {
  for (const k of consumedLatch) keyLatch.delete(k);
  consumedLatch.clear();
}

// ---------------------------------------------------------- Gamepads
const padPrev = {};
function readPad(i) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads[i];
  if (!p) return { x: 0, y: 0 };
  const b = (n) => !!(p.buttons[n] && p.buttons[n].pressed);
  let x = p.axes[0] || 0, y = p.axes[1] || 0;
  if (Math.abs(x) < 0.3) x = 0; else x = Math.sign(x);
  if (Math.abs(y) < 0.45) y = 0; else y = Math.sign(y) * Math.min(1, Math.abs(y) * 1.2);
  if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
  return { x, y, jump: b(0), attack: b(2) || b(7), special: b(1) || b(3) || b(5) || b(6), pause: b(9) };
}

// Gamepad menu navigation & join detection, polled every frame
const padNavState = {};
export function pollPadsForMenu() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const events = [];
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (!p) continue;
    const st = padNavState[i] || (padNavState[i] = { held: {}, repeat: 0 });
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const b = (n) => !!(p.buttons[n] && p.buttons[n].pressed);
    const dirs = {
      up: ay < -0.6 || b(12), down: ay > 0.6 || b(13), left: ax < -0.6 || b(14), right: ax > 0.6 || b(15),
      ok: b(0), back: b(1), start: b(9), x: b(2), y: b(3),
    };
    for (const k in dirs) {
      if (dirs[k] && !st.held[k]) events.push({ dir: k, device: 'pad', padIndex: i });
      st.held[k] = dirs[k];
    }
  }
  return events;
}

export function connectedPads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const out = [];
  for (let i = 0; i < pads.length; i++) if (pads[i]) out.push(i);
  return out;
}

// ---------------------------------------------------------- Keyboard events
let lastKeyDevice = null;
export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!keys.has(e.code)) keyLatch.add(e.code);
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      lastKeyDevice = 'keyboard';
      const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'ok', Space: 'ok', KeyZ: 'ok', KeyJ: 'ok', Escape: 'back', Backspace: 'back', KeyX: 'x' };
      const dir = map[e.code];
      for (const fn of listeners.anyKey) fn(e.code);
      if (dir) for (const fn of listeners.nav) fn({ dir, device: 'keyboard', code: e.code });
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
}

export function onNav(fn) { listeners.nav.push(fn); }
export function onAnyKey(fn) { listeners.anyKey.push(fn); return () => listeners.anyKey.splice(listeners.anyKey.indexOf(fn), 1); }
export function emitNav(ev) { for (const fn of listeners.nav) fn(ev); }
export function keyDown(code) { return keys.has(code); }

// ---------------------------------------------------------- Touch controls
class TouchControls {
  constructor() {
    this.el = null;
    this.enabled = false;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.buttons = {}; // name -> {el, pressed, id, latch}
    this.specialCd = 0; // 0..1 for ring display
    this.charge = 0;
  }
  build(root) {
    const el = document.createElement('div');
    el.id = 'touch';
    el.innerHTML = `
      <div class="t-zone t-left"></div>
      <div class="t-stick hidden"><div class="t-knob"></div></div>
      <div class="t-hint">◀ drag to move ▶</div>
      <div class="t-btn t-jump" data-b="jump"><span>⤒</span></div>
      <div class="t-btn t-attack" data-b="attack"><span>✦</span><div class="t-charge"></div></div>
      <div class="t-btn t-special" data-b="special"><svg viewBox="0 0 100 100"><circle class="cd" cx="50" cy="50" r="46"/></svg><span>★</span></div>
      <div class="t-pause" data-b="pause">❚❚</div>`;
    root.appendChild(el);
    this.el = el;
    this.stickEl = el.querySelector('.t-stick');
    this.knobEl = el.querySelector('.t-knob');
    this.hintEl = el.querySelector('.t-hint');
    for (const b of ['jump', 'attack', 'special', 'pause']) {
      this.buttons[b] = { el: el.querySelector(`[data-b="${b}"]`), pressed: false, ids: new Set(), latch: false };
    }
    this.cdCircle = el.querySelector('.cd');
    this.chargeEl = el.querySelector('.t-charge');
    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => this.onStart(e), opts);
    el.addEventListener('touchmove', (e) => this.onMove(e), opts);
    el.addEventListener('touchend', (e) => this.onEnd(e), opts);
    el.addEventListener('touchcancel', (e) => this.onEnd(e), opts);
    this.applyLayout();
  }
  applyLayout() {
    if (!this.el) return;
    const s = settings();
    this.el.style.setProperty('--tsize', s.touchSize);
    this.el.style.setProperty('--topa', s.touchOpacity);
    this.el.classList.toggle('lefty', !!s.leftHanded);
  }
  show(v) {
    this.enabled = v;
    if (this.el) this.el.classList.toggle('on', v);
    if (!v) this.reset();
  }
  reset() {
    this.stick.id = null; this.stick.x = 0; this.stick.y = 0;
    this.stickEl?.classList.add('hidden');
    for (const b in this.buttons) { this.buttons[b].pressed = false; this.buttons[b].ids.clear(); this.buttons[b].el.classList.remove('down'); }
  }
  btnAt(x, y) {
    let best = null, bd = 1e9;
    for (const name in this.buttons) {
      const r = this.buttons[name].el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const rad = r.width / 2 * 1.25;
      const d = Math.hypot(x - cx, y - cy);
      if (d < rad && d < bd) { bd = d; best = name; }
    }
    return best;
  }
  isStickSide(x) {
    const lefty = settings().leftHanded;
    return lefty ? x > window.innerWidth * 0.55 : x < window.innerWidth * 0.45;
  }
  onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const b = this.btnAt(t.clientX, t.clientY);
      if (b) {
        const B = this.buttons[b];
        B.ids.add(t.identifier);
        if (!B.pressed) B.latch = true;
        B.pressed = true;
        B.el.classList.add('down');
        if (settings().haptics && navigator.vibrate) navigator.vibrate(6);
      } else if (this.stick.id === null && this.isStickSide(t.clientX)) {
        this.stick.id = t.identifier;
        this.stick.ox = t.clientX; this.stick.oy = t.clientY;
        this.stick.x = 0; this.stick.y = 0;
        this.stickEl.style.left = t.clientX + 'px';
        this.stickEl.style.top = t.clientY + 'px';
        this.stickEl.classList.remove('hidden');
        this.knobEl.style.transform = 'translate(-50%,-50%)';
        this.hintEl.classList.add('gone');
      }
    }
  }
  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.stick.id) {
        const R = 46 * settings().touchSize;
        let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          // drag the base along (floating stick)
          const ex = (d - R) / d;
          this.stick.ox += dx * ex; this.stick.oy += dy * ex;
          dx -= dx * ex; dy -= dy * ex;
          this.stickEl.style.left = this.stick.ox + 'px';
          this.stickEl.style.top = this.stick.oy + 'px';
        }
        this.stick.x = dx / R; this.stick.y = dy / R;
        this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else {
        // allow sliding between buttons (jump <-> attack)
        for (const name of ['jump', 'attack']) {
          const B = this.buttons[name];
          if (B.ids.has(t.identifier)) {
            const nb = this.btnAt(t.clientX, t.clientY);
            if (nb && nb !== name && (nb === 'jump' || nb === 'attack')) {
              B.ids.delete(t.identifier);
              if (B.ids.size === 0) { B.pressed = false; B.el.classList.remove('down'); }
              const N = this.buttons[nb];
              if (!N.pressed) N.latch = true;
              N.ids.add(t.identifier); N.pressed = true; N.el.classList.add('down');
            }
          }
        }
      }
    }
  }
  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.stick.id) {
        this.stick.id = null; this.stick.x = 0; this.stick.y = 0;
        this.stickEl.classList.add('hidden');
      }
      for (const name in this.buttons) {
        const B = this.buttons[name];
        if (B.ids.delete(t.identifier) && B.ids.size === 0) {
          B.pressed = false;
          B.el.classList.remove('down');
        }
      }
    }
  }
  read() {
    const sx = this.stick.x, sy = this.stick.y;
    const x = Math.abs(sx) > 0.28 ? Math.sign(sx) : 0;
    const y = Math.abs(sy) > 0.55 ? Math.sign(sy) : 0;
    const latch = {};
    for (const b of BTN) { latch[b] = this.buttons[b].latch; this.buttons[b].latch = false; }
    return { x, y, jump: this.buttons.jump.pressed, attack: this.buttons.attack.pressed, special: this.buttons.special.pressed, pause: this.buttons.pause.pressed, latch };
  }
  setCooldown(frac, ready) {
    if (!this.cdCircle) return;
    const c = 2 * Math.PI * 46;
    this.cdCircle.style.strokeDasharray = `${c}`;
    this.cdCircle.style.strokeDashoffset = `${c * (1 - frac)}`;
    this.buttons.special.el.classList.toggle('ready', ready);
  }
  setCharge(v) {
    if (!this.chargeEl) return;
    this.chargeEl.style.transform = `scale(${v})`;
    this.chargeEl.style.opacity = v > 0 ? 1 : 0;
  }
}

export const touch = new TouchControls();

export function clearLatches() { keyLatch.clear(); }
