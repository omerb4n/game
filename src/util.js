// Shared math / helpers
export const TILE = 16;
export const COLS = 32;
export const ROWS = 18;
export const W = COLS * TILE; // 512
export const H = ROWS * TILE; // 288
export const DT = 1 / 60;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const approach = (v, target, amt) => (v < target ? Math.min(v + amt, target) : Math.max(v - amt, target));
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const TAU = Math.PI * 2;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const round1 = (v) => Math.round(v * 10) / 10;

export const ease = {
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inQuad: (t) => t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Overlap test that also accounts for horizontal screen wrap
export function overlapWrap(a, b) {
  if (overlap(a, b)) return true;
  const ax = a.x;
  a.x = ax + W;
  let r = overlap(a, b);
  if (!r) { a.x = ax - W; r = overlap(a, b); }
  a.x = ax;
  return r;
}

// shortest wrapped dx from a to b
export function wrapDx(ax, bx) {
  let d = bx - ax;
  if (d > W / 2) d -= W;
  else if (d < -W / 2) d += W;
  return d;
}

export function circleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return dist2(cx, cy, nx, ny) <= r * r;
}

// Seeded RNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weightedPick(weights, r = Math.random) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let v = r() * total;
  for (const k in weights) {
    v -= weights[k];
    if (v <= 0) return k;
  }
  return Object.keys(weights)[0];
}

export function shuffle(arr, r = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Color helpers
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function shade(hex, amt) {
  // amt -1..1 : darken / lighten
  let [r, g, b] = hexToRgb(hex);
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0})`;
}

export function fmtTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// iPhone browsers (Safari, Chrome, … all WebKit) only allow fullscreen for <video>; the home-screen app is the way there
export const canFullscreen = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
export const isIPhone = () => /iPhone|iPod/.test(navigator.userAgent);
export const isStandalone = () => navigator.standalone === true || !!window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches;

// Draw a rounded rect path
export function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function star(ctx, x, y, r1, r2, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = rot + (i * Math.PI) / n;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35);
  ctx.closePath();
}

// Muffin icon (used for pickups and UI)
export function drawMuffin(ctx, x, y, s, golden = false, t = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 10, s / 10);
  const wrap = golden ? '#e0a500' : '#d9534f';
  const top = golden ? '#ffd84a' : '#a0602a';
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#3a2030';
  // wrapper
  ctx.fillStyle = wrap;
  ctx.beginPath();
  ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(3, 5); ctx.lineTo(-3, 5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  for (let i = -2; i <= 2; i += 2) { ctx.moveTo(i, 0.5); ctx.lineTo(i * 0.8, 4.5); }
  ctx.stroke();
  // top
  ctx.strokeStyle = '#3a2030';
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.arc(0, 0, 5, Math.PI, 0);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // highlight
  ctx.fillStyle = golden ? '#fff6c0' : '#c98a4b';
  ctx.beginPath(); ctx.ellipse(-1.6, -2.6, 1.6, 0.9, -0.4, 0, TAU); ctx.fill();
  // berries / sparkles
  ctx.fillStyle = golden ? '#fff' : '#5a2a6a';
  ctx.beginPath(); ctx.arc(1.8, -1.6, 0.8, 0, TAU); ctx.arc(-0.4, -3.6, 0.7, 0, TAU); ctx.fill();
  ctx.restore();
}
