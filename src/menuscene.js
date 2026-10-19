// Animated background scene for menus: parallax world + heroes playing around.
import { W, H, TILE, COLS, ROWS, rand, pick, TAU, drawMuffin } from './util.js';
import { WORLDS } from './data/levels.js';
import { HEROES, drawHero } from './data/heroes.js';
import { ENEMIES } from './data/enemies.js';
import { drawTileMap } from './game/render.js';
import { S } from './save.js';

function menuTiles() {
  const t = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++) { t[16 * COLS + c] = 1; t[17 * COLS + c] = 1; }
  for (let c = 3; c < 9; c++) t[12 * COLS + c] = 3;
  for (let c = 23; c < 29; c++) t[12 * COLS + c] = 3;
  for (let c = 13; c < 19; c++) t[9 * COLS + c] = 3;
  t[15 * COLS + 1] = 4; t[15 * COLS + 30] = 4;
  return t;
}

export class MenuScene {
  constructor(renderer) {
    this.r = renderer;
    this.themeIdx = 0;
    this.t = 0;
    this.tiles = menuTiles();
    this.tileCanvas = null; this.tileKey = '';
    this.bots = HEROES.map((h, i) => ({ id: h.id, x: 40 + i * 80, y: 256, vx: (i % 2 ? -1 : 1) * rand(40, 80), vy: 0, f: 1, t: rand(10), jumpT: rand(0.5, 2), sq: 0 }));
    this.critters = [{ type: 'gumdrop', x: 100, f: 1, id: 1 }, { type: 'gumdrop', x: 380, f: -1, id: 2 }];
    this.muffins = [];
    this.confetti = [];
    this.focusHero = null;
  }
  setTheme(i) { this.themeIdx = i; this.tileKey = ''; }
  celebrate(n = 140) {
    const cols = ['#ff5a9e', '#ffd34d', '#5ad1ff', '#7be08b', '#c9a6ff', '#ffffff'];
    for (let i = 0; i < n; i++) this.confetti.push({ x: rand(0, W), y: rand(-H * 0.6, -5), vx: rand(-20, 20), vy: rand(40, 110), r: rand(TAU), vr: rand(-8, 8), w: rand(2, 4), h: rand(3, 6), c: pick(cols), sway: rand(TAU) });
  }
  update(dt) {
    this.t += dt;
    const groundAt = (x, y) => {
      // platforms at rows 12 & 9 (one-way)
      const c = Math.floor(x / TILE);
      for (const r of [9, 12, 16]) {
        const ty = r * TILE;
        if (y <= ty + 1 && (this.tiles[r * COLS + ((c % COLS) + COLS) % COLS] === 3 || r === 16)) return ty;
      }
      return 256;
    };
    for (const b of this.bots) {
      b.t += dt;
      b.vy += 1300 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const gy = groundAt(b.x, b.y - b.vy * dt);
      if (b.y >= gy && b.vy > 0) {
        if (b.vy > 200) b.sq = 0.3;
        b.y = gy; b.vy = 0;
        b.jumpT -= dt;
        if (b.jumpT <= 0) { b.vy = -rand(300, 420); b.jumpT = rand(0.6, 2.4); b.sq = -0.3; }
        if (Math.random() < 0.004) b.vx = -b.vx;
      }
      if (b.x < -10) b.x += W + 20; if (b.x > W + 10) b.x -= W + 20;
      b.f = b.vx > 0 ? 1 : -1;
      b.sq += (0 - b.sq) * Math.min(1, dt * 8);
    }
    for (const c of this.critters) { c.x += c.f * 25 * dt; if (c.x < 10 || c.x > W - 10) c.f = -c.f; }
    if (Math.random() < dt * 1.2) this.muffins.push({ x: rand(20, W - 20), y: -10, vy: rand(30, 60), r: rand(TAU), vr: rand(-2, 2), g: Math.random() < 0.1 });
    for (const m of this.muffins) { m.y += m.vy * dt; m.r += m.vr * dt; }
    this.muffins = this.muffins.filter((m) => m.y < H + 20);
    for (const c of this.confetti) { c.sway += dt * 3; c.x += (c.vx + Math.sin(c.sway) * 30) * dt; c.y += c.vy * dt; c.r += c.vr * dt; }
    this.confetti = this.confetti.filter((c) => c.y < H + 10);
    // cycle worlds slowly, only through ones the player has reached
    const reached = Math.min(4, Math.max(1, (S().worldsCleared?.length || 0) + 1));
    const idx = Math.floor(this.t / 14) % reached;
    if (idx !== this.themeIdx) this.setTheme(idx);
  }
  draw() {
    const r = this.r;
    const ctx = r.ctx;
    const theme = WORLDS[this.themeIdx];
    r.buildBackground(theme);
    const { scale, ox, oy } = r.view;
    const key = `${this.themeIdx}:${scale}`;
    if (this.tileKey !== key) {
      const c = document.createElement('canvas');
      c.width = Math.ceil(W * scale); c.height = Math.ceil(H * scale);
      const g = c.getContext('2d'); g.scale(scale, scale);
      drawTileMap(g, this.tiles, theme, 'menu');
      this.tileCanvas = c; this.tileKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(r.bgCache, 0, 0);
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(scale, scale);
    // extend ground across letterbox
    ctx.drawImage(this.tileCanvas, 0, 0, W, H);
    if (ox > 0) {
      ctx.drawImage(this.tileCanvas, 0, 15 * TILE * scale, TILE * scale * 4, 3 * TILE * scale, -ox / scale - 2, 15 * TILE, ox / scale + 4, 3 * TILE);
      ctx.drawImage(this.tileCanvas, (W - 4 * TILE) * scale, 15 * TILE * scale, TILE * scale * 4, 3 * TILE * scale, W - 2, 15 * TILE, ox / scale + 4, 3 * TILE);
    }
    for (const m of this.muffins) {
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.r); ctx.globalAlpha = 0.85;
      drawMuffin(ctx, 0, 0, 9, m.g); ctx.restore();
    }
    for (const c of this.confetti) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.scale(Math.cos(c.sway * 2), 1);
      ctx.fillStyle = c.c; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
    }
    for (const c of this.critters) ENEMIES[c.type].draw(ctx, { x: c.x - 7, y: 244, w: 14, h: 12, vy: Math.sin(this.t * 6 + c.id) * 60, facing: c.f, id: c.id, enraged: false }, this.t);
    for (const b of this.bots) {
      drawHero(ctx, b.id, b.x, b.y, { facing: b.f, t: b.t, sx: 1 + b.sq * 0.6, sy: 1 - b.sq * 0.8, run: b.vy === 0 ? b.t : 0, hat: S().equipped?.[b.id] || 'none', blink: Math.sin(b.t * 2.3) > 0.97 });
    }
    ctx.restore();
  }
}
