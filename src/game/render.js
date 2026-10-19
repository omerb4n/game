// Rendering: backgrounds, tiles, entities, lighting, HUD.
import { TILE, COLS, ROWS, W, H, TAU, rng, rrect, star, heart, drawMuffin, clamp, shade, rgba, fmtTime, ease } from '../util.js';
import { drawHero, OL, PLAYER_COLORS } from '../data/heroes.js';
import { T_GROUND, T_ALT, T_ONEWAY, T_SPIKE, T_SPRING, T_ICE, T_LAVA } from './world.js';
import { settings } from '../save.js';

const isSolid = (t) => t === T_GROUND || t === T_ALT || t === T_ICE;
const FONT = 'Fredoka, "Trebuchet MS", sans-serif';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = { scale: 1, ox: 0, oy: 0, cw: 1, ch: 1, dpr: 1 };
    this.bgCache = null; this.bgKey = '';
    this.tileCache = null; this.tileKey = '';
    this.lightCanvas = document.createElement('canvas');
    this.banners = [];
    this.introCard = null;
    this.supportsFilter = 'filter' in this.ctx;
  }
  resize() {
    const dprMax = settings().quality === 'low' ? 1 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    const cw = Math.floor(window.innerWidth * dpr), ch = Math.floor(window.innerHeight * dpr);
    this.canvas.width = cw; this.canvas.height = ch;
    const scale = Math.min(cw / W, ch / H);
    this.view = { scale, ox: (cw - W * scale) / 2, oy: (ch - H * scale) / 2, cw, ch, dpr };
    this.bgKey = ''; this.tileKey = '';
  }

  // ------------------------------------------------------------------ BACKGROUND
  buildBackground(theme) {
    const { cw, ch, scale, ox, oy } = this.view;
    const key = `${theme.id}:${cw}x${ch}`;
    if (this.bgKey === key) return;
    this.bgKey = key;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const r = rng(theme.id * 977);
    // sky
    const sky = g.createLinearGradient(0, 0, 0, ch);
    sky.addColorStop(0, theme.sky[0]); sky.addColorStop(0.6, theme.sky[1]); sky.addColorStop(1, theme.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, cw, ch);
    const U = scale; // world unit in px
    // sun / glow
    if (theme.sun) {
      const sx = cw * 0.78, sy = oy + 50 * U;
      const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 140 * U);
      sg.addColorStop(0, rgba(theme.sun, 0.9)); sg.addColorStop(0.15, rgba(theme.sun, 0.6)); sg.addColorStop(1, rgba(theme.sun, 0));
      g.fillStyle = sg; g.fillRect(0, 0, cw, ch);
      g.fillStyle = theme.sun; g.beginPath(); g.arc(sx, sy, 18 * U, 0, TAU); g.fill();
    }
    if (theme.id === 3) {
      // aurora
      for (let i = 0; i < 3; i++) {
        const ag = g.createLinearGradient(0, oy, 0, oy + 140 * U);
        const col = ['#7affc8', '#9a8aff', '#ff9ad5'][i];
        ag.addColorStop(0, rgba(col, 0)); ag.addColorStop(0.5, rgba(col, 0.28)); ag.addColorStop(1, rgba(col, 0));
        g.fillStyle = ag;
        g.beginPath();
        g.moveTo(0, oy + (30 + i * 20) * U);
        for (let x = 0; x <= cw; x += 20) g.lineTo(x, oy + (30 + i * 20 + Math.sin(x / (90 * U) + i * 2) * 18 + Math.sin(x / (37 * U)) * 6) * U);
        g.lineTo(cw, oy + (150 + i * 20) * U); g.lineTo(0, oy + (150 + i * 20) * U); g.closePath(); g.fill();
      }
      // stars
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 80; i++) g.fillRect(r() * cw, r() * ch * 0.4, 1.5 * U * 0.5, 1.5 * U * 0.5);
    }
    if (theme.id === 2) {
      // cave stalactites and glowing crystals
      g.fillStyle = shade(theme.far, -0.2);
      for (let x = -20; x < cw; x += (14 + r() * 26) * U) {
        const len = (20 + r() * 60) * U, wdt = (8 + r() * 14) * U;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + wdt / 2, len); g.lineTo(x + wdt, 0); g.closePath(); g.fill();
      }
    }
    if (theme.id === 4) {
      // castle silhouettes
      g.fillStyle = shade(theme.far, -0.25);
      for (let i = 0; i < 9; i++) {
        const x = r() * cw, w = (30 + r() * 40) * U, h = (80 + r() * 120) * U;
        g.fillRect(x, ch - h - 40 * U, w, h + 40 * U);
        for (let k = 0; k < w; k += 10 * U) g.fillRect(x + k, ch - h - 46 * U, 6 * U, 8 * U);
        g.fillStyle = 'rgba(255,160,60,0.35)';
        for (let k = 0; k < 4; k++) g.fillRect(x + r() * (w - 6 * U), ch - h + r() * h * 0.6, 4 * U, 7 * U);
        g.fillStyle = shade(theme.far, -0.25);
      }
    }
    // hill layers
    const layer = (y, amp, freq, col, seed) => {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, ch);
      for (let x = 0; x <= cw + 10; x += 8) {
        const yy = oy + y * U + Math.sin(x / (freq * U) + seed) * amp * U + Math.sin(x / (freq * 0.37 * U) + seed * 2) * amp * 0.35 * U;
        g.lineTo(x, yy);
      }
      g.lineTo(cw, ch); g.closePath(); g.fill();
    };
    if (theme.id === 3) {
      // mountains
      g.fillStyle = theme.far;
      g.beginPath(); g.moveTo(0, ch);
      let x = -50;
      while (x < cw + 100) {
        const w = (60 + r() * 90) * U, h = (90 + r() * 90) * U;
        g.lineTo(x + w / 2, oy + 220 * U - h); g.lineTo(x + w, oy + 220 * U);
        x += w * 0.7;
      }
      g.lineTo(cw, ch); g.closePath(); g.fill();
      // snow caps
      g.fillStyle = 'rgba(255,255,255,0.7)';
    } else layer(170, 14, 70, theme.far, 1);
    layer(205, 10, 45, theme.mid, 3);
    // deco
    const groundY = (x) => oy + 205 * U + Math.sin(x / (45 * U) + 3) * 10 * U + Math.sin(x / (45 * 0.37 * U) + 6) * 3.5 * U;
    for (let i = 0; i < 14; i++) {
      const x = r() * cw;
      const y = groundY(x) + 6 * U;
      const s = (0.7 + r() * 0.6) * U;
      g.save(); g.translate(x, y); g.scale(s, s);
      this.drawDeco(g, theme.deco, r);
      g.restore();
    }
    layer(240, 6, 30, theme.near, 5);
    // vignette
    const vg = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,0,30,0.45)');
    g.fillStyle = vg; g.fillRect(0, 0, cw, ch);
    this.bgCache = c;
    // cloud sprites
    this.clouds = [];
    const cr = rng(theme.id * 31);
    for (let i = 0; i < 7; i++) this.clouds.push({ x: cr() * W * 1.4 - W * 0.2, y: 10 + cr() * 90, s: 0.6 + cr() * 0.9, v: 3 + cr() * 6 });
  }
  drawDeco(g, kind, r) {
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(40,20,50,0.35)';
    if (kind === 'lollipop') {
      g.fillStyle = '#fff'; g.fillRect(-1.2, -30, 2.4, 30);
      const cols = ['#ff6ab0', '#6ad0ff', '#ffd36b', '#9dffb0'];
      g.fillStyle = cols[Math.floor(r() * 4)];
      g.beginPath(); g.arc(0, -34, 9, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
      g.beginPath(); for (let a = 0; a < 10; a += 0.3) g.lineTo(Math.cos(a) * a * 0.85, -34 + Math.sin(a) * a * 0.85); g.stroke();
    } else if (kind === 'crystal') {
      const col = ['#ffcf5c', '#ff9b5c', '#c9a6ff'][Math.floor(r() * 3)];
      const cg = g.createRadialGradient(0, -8, 0, 0, -8, 16);
      cg.addColorStop(0, rgba(col, 0.35)); cg.addColorStop(1, rgba(col, 0));
      g.fillStyle = cg;
      g.beginPath(); g.arc(0, -8, 16, 0, TAU); g.fill();
      g.fillStyle = col;
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(k * 6 - 4, 0); g.lineTo(k * 6, -14 - (1 - Math.abs(k)) * 8); g.lineTo(k * 6 + 4, 0); g.closePath(); g.fill(); }
    } else if (kind === 'pine') {
      g.fillStyle = '#6f95cc';
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-12 + k * 2.5, -k * 10); g.lineTo(0, -18 - k * 10); g.lineTo(12 - k * 2.5, -k * 10); g.closePath(); g.fill(); }
      g.fillStyle = '#ffffff';
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-5 + k, -10 - k * 10); g.lineTo(0, -18 - k * 10); g.lineTo(5 - k, -10 - k * 10); g.closePath(); g.fill(); }
    } else if (kind === 'chain') {
      g.fillStyle = '#3a1a1e';
      g.fillRect(-6, -60, 12, 60);
      g.fillStyle = '#ff7a3d';
      g.beginPath(); g.moveTo(-6, -60); g.lineTo(6, -60); g.lineTo(6, -40); g.lineTo(0, -46); g.lineTo(-6, -40); g.closePath(); g.fill();
      g.fillStyle = '#ffd34d'; star(g, 0, -52, 3, 1.4); g.fill();
    }
  }

  // ------------------------------------------------------------------ TILES
  buildTiles(world, scaleOverride) {
    const scale = scaleOverride || this.view.scale;
    const key = `${world.level.id}:${scale}`;
    if (!scaleOverride && this.tileKey === key) return this.tileCache;
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * scale); c.height = Math.ceil(H * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    drawTileMap(g, world.tiles, world.theme, world.level.id);
    if (!scaleOverride) { this.tileCache = c; this.tileKey = key; }
    return c;
  }

  // ------------------------------------------------------------------ FRAME
  render(world, dt, app) {
    const ctx = this.ctx;
    const { cw, ch, scale, ox, oy } = this.view;
    this.buildBackground(world.theme);
    this.buildTiles(world);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bgCache, 0, 0);
    const t = world.time;
    // clouds
    if (world.theme.id === 1 || world.theme.id === 3) {
      ctx.save();
      ctx.translate(ox, oy); ctx.scale(scale, scale);
      ctx.fillStyle = world.theme.id === 3 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.8)';
      for (const cl of this.clouds) {
        const x = ((cl.x + t * cl.v) % (W * 1.6)) - W * 0.3;
        ctx.beginPath();
        ctx.ellipse(x, cl.y, 22 * cl.s, 8 * cl.s, 0, 0, TAU);
        ctx.ellipse(x + 12 * cl.s, cl.y - 6 * cl.s, 13 * cl.s, 9 * cl.s, 0, 0, TAU);
        ctx.ellipse(x - 10 * cl.s, cl.y - 3 * cl.s, 10 * cl.s, 7 * cl.s, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    // arena
    const sx = world.fx.shakeX * scale, sy = world.fx.shakeY * scale;
    ctx.save();
    ctx.translate(ox + sx, oy + sy);
    ctx.scale(scale, scale);
    // arena backdrop panel (subtle) to separate playfield
    ctx.save();
    ctx.beginPath(); ctx.rect(-2, -40, W + 4, H + 60); ctx.clip();
    this.drawPortals(ctx, world, t);
    ctx.drawImage(this.tileCache, 0, 0, W, H);
    this.drawDynamicTiles(ctx, world, t);
    this.drawZones(ctx, world, t);
    world.fx.drawBack(ctx);
    this.drawTelegraphs(ctx, world, t);
    this.drawPickups(ctx, world, t);
    for (const e of world.enemies) this.wrapDraw(e.x, e.w, (dx) => this.drawEnemy(ctx, e, t, dx));
    for (const p of world.players) if (p.present) this.wrapDraw(p.x, p.w, (dx) => this.drawPlayer(ctx, p, world, dx));
    this.drawPlayerProj(ctx, world, t);
    this.drawEnemyProj(ctx, world, t);
    world.fx.draw(ctx);
    if (world.theme.dark && settings().quality !== 'low') this.drawLighting(ctx, world, t);
    world.fx.drawTexts(ctx);
    this.drawPlayerTags(ctx, world, t);
    ctx.restore();
    ctx.restore();
    this.drawFrame(ctx);
    this.drawHUD(ctx, world, dt, app);
  }

  drawFrame(ctx) {
    // darken letterbox areas so the arena reads as a framed stage
    const { cw, ch, scale, ox, oy } = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (ox > 2) {
      for (const side of [0, 1]) {
        const x0 = side ? ox + W * scale : 0;
        const g = ctx.createLinearGradient(side ? x0 : ox, 0, side ? x0 + ox : 0, 0);
        g.addColorStop(0, 'rgba(25,8,35,0.55)'); g.addColorStop(1, 'rgba(25,8,35,0.82)');
        ctx.fillStyle = g; ctx.fillRect(x0, 0, ox, ch);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, ch); ctx.moveTo(ox + W * scale, 0); ctx.lineTo(ox + W * scale, ch); ctx.stroke();
    }
    if (oy > 2) {
      ctx.fillStyle = 'rgba(25,8,35,0.7)';
      ctx.fillRect(0, 0, cw, oy); ctx.fillRect(0, oy + H * scale, cw, oy + 2);
    }
  }
  wrapDraw(x, w, fn) {
    fn(0);
    if (x < 24) fn(W);
    if (x + w > W - 24) fn(-W);
  }

  drawPortals(ctx, world, t) {
    for (const pt of world.portals) {
      const active = world.portalFx.find((p) => Math.abs(p.x - pt.x) < 2 && Math.abs(p.y - pt.y) < 2);
      let open = 0.35;
      if (active) open = active.t < active.dur ? 0.35 + ease.outBack(Math.min(1, active.t / 0.4)) * 0.65 : Math.max(0.35, 1 - (active.t - active.dur) / 0.4 * 0.65);
      const R = 11 * open;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.8);
      g.addColorStop(0, 'rgba(200,120,255,0.55)'); g.addColorStop(1, 'rgba(120,40,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.8, 0, TAU); ctx.fill();
      ctx.rotate(t * 3);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = ['#c94dff', '#ff7ad9', '#7a3dff'][i];
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, R * (1 - i * 0.25), i * 2, i * 2 + 4); ctx.stroke();
      }
      ctx.fillStyle = '#2b0a3a';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.45, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawDynamicTiles(ctx, world, t) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const tt = world.tiles[r * COLS + c];
      const x = c * TILE, y = r * TILE;
      if (tt === T_SPRING) {
        const comp = world.springAnim?.[c] || 0;
        const h = 6 - comp * 10 + Math.sin(t * 6 + c) * 0.3;
        ctx.fillStyle = '#ff6ab0'; ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
        // coil
        ctx.strokeStyle = '#c0c8d8'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k <= 4; k++) ctx.lineTo(x + 4 + (k % 2) * 8, y + 16 - k * (h / 4) - 1);
        ctx.stroke();
        ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
        rrect(ctx, x + 1, y + 16 - h - 5, 14, 5, 2.5); ctx.fillStyle = '#ff6ab0'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x + 3, y + 16 - h - 4, 6, 1.2);
      } else if (tt === T_LAVA) {
        const top = world.tileAt(c, r - 1) !== T_LAVA;
        const g = ctx.createLinearGradient(0, y, 0, y + 16);
        g.addColorStop(0, '#ffb347'); g.addColorStop(1, '#d9431f');
        ctx.fillStyle = g;
        if (top) {
          ctx.beginPath(); ctx.moveTo(x, y + 16);
          for (let k = 0; k <= 16; k += 2) ctx.lineTo(x + k, y + 3 + Math.sin(t * 3 + (x + k) * 0.25) * 1.6);
          ctx.lineTo(x + 16, y + 16); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k <= 16; k += 2) ctx.lineTo(x + k, y + 3 + Math.sin(t * 3 + (x + k) * 0.25) * 1.6);
          ctx.stroke();
          if (Math.random() < 0.01) world.fx.add({ x: x + Math.random() * 16, y: y + 3, vy: -60, vx: 0, g: 200, life: 0.6, size: 1.6, color: '#ffd23d', add: true });
        } else ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = 'rgba(255,240,180,0.4)';
        ctx.beginPath(); ctx.arc(x + 8 + Math.sin(t + c) * 4, y + 10, 1.4, 0, TAU); ctx.fill();
      }
    }
  }

  drawZones(ctx, world, t) {
    for (const z of world.zones) {
      const a = Math.min(1, z.life / 0.5) * Math.min(1, (z.max - z.life) / 0.2 + 0.2);
      ctx.save();
      ctx.globalAlpha = a * 0.55;
      const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
      g.addColorStop(0, 'rgba(157,255,176,0.6)'); g.addColorStop(0.7, 'rgba(157,255,176,0.25)'); g.addColorStop(1, 'rgba(157,255,176,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = '#9dffb0'; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 20; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('✚', z.x, z.y + 4 + Math.sin(t * 4) * 2);
      ctx.restore();
    }
  }

  drawTelegraphs(ctx, world, t) {
    for (const tg of world.telegraphs) {
      const k = tg.t / tg.dur;
      if (tg.kind === 'target') {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(t * 25) * 0.3;
        ctx.strokeStyle = '#ff3a5a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(tg.x, tg.y - 2, 26 * (1 - k * 0.3), 5, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,58,90,0.2)'; ctx.fill();
        ctx.restore();
      } else if (tg.kind === 'line') {
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.sin(t * 30) * 0.25;
        ctx.strokeStyle = '#ff3a5a'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
        const dx = tg.x2 - tg.x, dy = tg.y2 - tg.y, L = Math.hypot(dx, dy) || 1;
        ctx.beginPath(); ctx.moveTo(tg.x, tg.y); ctx.lineTo(tg.x + (dx / L) * 600, tg.y + (dy / L) * 600); ctx.stroke();
        ctx.restore();
      }
    }
    // falling-hazard warnings for delayed enemy projectiles
    for (const b of world.eproj) {
      if (!(b.delay > 0)) continue;
      ctx.save();
      const blink = Math.sin(t * 30) > 0;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ff3a5a';
      ctx.fillRect(b.x - b.r, 0, b.r * 2, world.groundBelow(b.x, 0));
      ctx.globalAlpha = blink ? 1 : 0.5;
      ctx.fillStyle = '#ff3a5a';
      ctx.beginPath(); ctx.moveTo(b.x - 5, 2); ctx.lineTo(b.x + 5, 2); ctx.lineTo(b.x, 10); ctx.closePath(); ctx.fill();
      ctx.font = `bold 7px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('!', b.x, 8);
      ctx.restore();
    }
  }

  drawPickups(ctx, world, t) {
    for (const k of world.pickups) {
      const blink = k.life !== undefined && k.life < 3 && Math.sin(t * 25) > 0;
      if (blink) continue;
      const cx = k.x + k.w / 2, cy = k.y + k.h / 2;
      const bob = Math.sin(t * 4 + k.id) * 1.5;
      ctx.save();
      if (k.kind === 'muffin') {
        if (k.bonus) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#fff6a0'; ctx.beginPath(); ctx.arc(cx, cy + bob, 10 + Math.sin(t * 6) * 1.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        drawMuffin(ctx, cx, cy + bob - 1, 10);
      } else if (k.kind === 'golden') {
        ctx.save(); ctx.translate(cx, cy + bob);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 8; i++) {
          ctx.rotate(TAU / 8);
          ctx.fillStyle = 'rgba(255,220,80,0.25)';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3, -30 - Math.sin(t * 4 + i) * 5); ctx.lineTo(3, -30 - Math.sin(t * 4 + i) * 5); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        drawMuffin(ctx, cx, cy + bob - 1, 15, true, t);
      } else if (k.kind === 'heart') {
        ctx.fillStyle = '#ff4d6a'; ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
        const s = 9 + Math.sin(t * 8) * 0.8;
        heart(ctx, cx, cy - s / 2 + bob, s); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(cx - 2, cy - 1 + bob, 1.2, 0, TAU); ctx.fill();
      } else if (k.kind === 'rush') {
        ctx.translate(cx, cy + bob);
        ctx.rotate(Math.sin(t * 3) * 0.3);
        ctx.fillStyle = `hsl(${(t * 300) % 360},100%,65%)`; ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
        star(ctx, 0, 0, 7, 3.2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-1.5, -1, 1, 0, TAU); ctx.arc(1.5, -1, 1, 0, TAU); ctx.fill();
      } else if (k.kind === 'coin') {
        const sx = Math.abs(Math.cos(t * 5 + k.id));
        ctx.translate(cx, cy + bob); ctx.scale(Math.max(0.15, sx), 1);
        ctx.fillStyle = '#5ad1ff'; ctx.strokeStyle = OL; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; star(ctx, 0, 0, 2.2, 1, 4); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawEnemy(ctx, e, t, dx) {
    ctx.save();
    ctx.translate(dx, 0);
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    // shadow-ish aura for enraged
    if (e.enraged && !e.def.boss) {
      ctx.globalAlpha = 0.35 + Math.sin(t * 10) * 0.1;
      ctx.fillStyle = '#ff3a2a';
      ctx.beginPath(); ctx.ellipse(cx, cy, e.w * 0.8, e.h * 0.8, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.spawning > 0) {
      const k = 1 - clamp(e.spawning / 0.35, 0, 1);
      ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    }
    const flashing = e.flash > 0;
    if (flashing && this.supportsFilter) ctx.filter = 'brightness(2.6) saturate(0.4)';
    e.def.draw(ctx, e, t);
    if (flashing && this.supportsFilter) ctx.filter = 'none';
    if (flashing && !this.supportsFilter) {
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(cx, cy, e.w / 2, e.h / 2, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (e.frozen > 0) {
      ctx.globalAlpha = 0.6;
      const g = ctx.createLinearGradient(e.x, e.y, e.x + e.w, e.y + e.h);
      g.addColorStop(0, '#e0f8ff'); g.addColorStop(1, '#7fc8ff');
      ctx.fillStyle = g; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      rrect(ctx, e.x - 3, e.y - 3, e.w + 6, e.h + 5, 3); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(e.x, e.y + 3); ctx.lineTo(e.x + 4, e.y - 1); ctx.moveTo(e.x + e.w - 6, e.y + e.h); ctx.lineTo(e.x + e.w, e.y + e.h - 6); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.burn > 0 && Math.random() < 0.3) {
      // simple flame licks
      ctx.fillStyle = Math.random() < 0.5 ? '#ffb347' : '#ff5a2a';
      ctx.beginPath(); ctx.arc(e.x + Math.random() * e.w, e.y + Math.random() * e.h * 0.5, 1.6, 0, TAU); ctx.fill();
    }
    if (e.mark > 0 && !e.def.boss) {
      ctx.strokeStyle = '#ff3a5a'; ctx.lineWidth = 1;
      const r = 4 + Math.sin(t * 8) * 0.6;
      ctx.beginPath(); ctx.arc(cx, e.y - 7, r, 0, TAU);
      ctx.moveTo(cx - r - 2, e.y - 7); ctx.lineTo(cx + r + 2, e.y - 7); ctx.moveTo(cx, e.y - 7 - r - 2); ctx.lineTo(cx, e.y - 7 + r + 2); ctx.stroke();
    }
    if (e.stun > 0 && !e.def.boss && e.frozen <= 0) {
      for (let i = 0; i < 3; i++) { const a = t * 7 + (i * TAU) / 3; ctx.fillStyle = '#fff36b'; star(ctx, cx + Math.cos(a) * 7, e.y - 4 + Math.sin(a) * 2, 1.8, 0.8); ctx.fill(); }
    }
    // small HP bar for damaged non-boss tough enemies
    if (!e.def.boss && e.hp < e.maxHp && e.maxHp >= 8) {
      const w = Math.max(14, e.w);
      ctx.fillStyle = 'rgba(30,10,40,0.7)'; ctx.fillRect(cx - w / 2, e.y - 5, w, 2.5);
      ctx.fillStyle = e.enraged ? '#ff5a3a' : '#7dff8a'; ctx.fillRect(cx - w / 2, e.y - 5, (w * Math.max(0, e.hp)) / e.maxHp, 2.5);
    }
    ctx.restore();
  }

  drawPlayer(ctx, p, world, dx) {
    const t = p.t;
    ctx.save();
    ctx.translate(dx, 0);
    const x = p.cx, y = p.y + p.h;
    if (p.down) {
      // bubble
      const by = p.cy - 2 + Math.sin(t * 3) * 2;
      ctx.globalAlpha = 0.9;
      const g = ctx.createRadialGradient(x - 4, by - 5, 2, x, by, 15);
      g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(0.7, rgba(p.color, 0.25)); g.addColorStop(1, rgba(p.color, 0.6));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, by, 14, 0, TAU); ctx.fill();
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.2; ctx.stroke();
      drawHero(ctx, p.hero.id, x, by + 8, { facing: p.facing, t, sx: 0.75, sy: 0.75, down: true, hat: p.hat, alpha: 0.75 });
      // revive progress ring
      const prog = p.reviveProg / 1.4;
      if (prog > 0) {
        ctx.strokeStyle = '#fff36b'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, by, 17, -Math.PI / 2, -Math.PI / 2 + prog * TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.font = `bold 6px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      const label = p.autoRevive > 0 ? 'Reviving…' : 'HELP!';
      ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.strokeText(label, x, by - 18); ctx.fillText(label, x, by - 18);
      ctx.restore();
      return;
    }
    const inv = p.local ? p.invuln > 0 : p.remoteInvuln;
    if (inv && Math.sin(t * 40) > 0.2) ctx.globalAlpha = 0.45;
    // shadow
    const gy = world.groundBelow(p.cx, p.y + p.h - 2);
    const hgt = gy - (p.y + p.h);
    if (hgt < 120) {
      ctx.save(); ctx.globalAlpha *= 0.25 * (1 - hgt / 120);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, gy, 7 * (1 - hgt / 200), 2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (p.rushT > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = `hsl(${(t * 500) % 360},100%,60%)`;
      ctx.beginPath(); ctx.arc(x, p.cy - 2, 14 + Math.sin(t * 20) * 1.5, 0, TAU); ctx.fill();
      ctx.restore();
    }
    const air = !p.onGround;
    let sx = 1 + p.sq * 0.6, sy = 1 - p.sq * 0.8;
    if (air && !p.wallDir) { const v = clamp(p.vy / 600, -0.25, 0.25); sx *= 1 - Math.abs(v) * 0.5; sy *= 1 + Math.abs(v) * 0.6; }
    drawHero(ctx, p.hero.id, x, y, {
      facing: p.facing, t, sx, sy, aimX: p.aimX, aimY: p.aimY, blink: p.blink, hurt: p.hurtT > 0, hat: p.hat,
      swing: p.swing, charge: p.charging || p.charge > 0 ? p.charge : 0, run: p.runT, flash: p.flash,
    });
    if (p.shield > 0) {
      ctx.strokeStyle = 'rgba(159,230,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, p.cy - 2, 14 + Math.sin(t * 6), 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(159,230,255,0.15)'; ctx.fill();
    }
    ctx.restore();
  }

  drawPlayerTags(ctx, world, t) {
    const multi = world.players.length > 1;
    for (const p of world.players) {
      if (!p.present) continue;
      const x = p.cx, y = p.y - (p.down ? 26 : 22);
      if (multi && !p.down) {
        ctx.fillStyle = p.color; ctx.strokeStyle = OL; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 3.5, y - 1); ctx.lineTo(x + 3.5, y - 1); ctx.lineTo(x, y + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.font = `800 6px ${FONT}`; ctx.textAlign = 'center';
        ctx.lineWidth = 2; ctx.strokeText(p.name, x, y - 3); ctx.fillText(p.name, x, y - 3);
      }
      // offscreen indicator
      if (p.y + p.h < 0) {
        ctx.fillStyle = p.color; ctx.strokeStyle = OL; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x - 5, 10); ctx.lineTo(x + 5, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // charge bar (ranger/mage) for local players
      if (p.local && p.charging && p.charge > 0.15 && !p.down) {
        const k = Math.min(1.3, p.charge);
        const w = 16;
        ctx.fillStyle = 'rgba(30,10,40,0.7)'; ctx.fillRect(x - w / 2, p.y + p.h + 3, w, 2.5);
        const perfect = p.hero.id === 'ranger' && k >= 1 && k <= 1.28;
        ctx.fillStyle = perfect ? '#fff36b' : k >= 1 ? '#ffb347' : '#ffffff';
        ctx.fillRect(x - w / 2, p.y + p.h + 3, w * Math.min(1, k), 2.5);
        if (p.hero.id === 'ranger') { ctx.fillStyle = '#fff36b'; ctx.fillRect(x + w / 2 - 0.5, p.y + p.h + 2, 1, 4.5); }
      }
    }
  }

  drawPlayerProj(ctx, world, t) {
    for (const b of world.pproj) {
      ctx.save();
      ctx.translate(b.x, b.y);
      const ang = Math.atan2(b.vy, b.vx);
      switch (b.kind) {
        case 'bolt':
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(200,140,255,0.5)'; ctx.beginPath(); ctx.arc(0, 0, b.r * 1.8, 0, TAU); ctx.fill();
          ctx.fillStyle = '#f0d8ff'; star(ctx, 0, 0, b.r * 1.2, b.r * 0.5, 4, t * 15); ctx.fill();
          break;
        case 'fireball':
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(255,120,40,0.45)'; ctx.beginPath(); ctx.arc(0, 0, b.r * 2, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(0, 0, b.r * 1.1, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(0, 0, b.r * 0.55, 0, TAU); ctx.fill();
          break;
        case 'arrow': case 'arrowBig': {
          ctx.rotate(ang);
          const big = b.kind === 'arrowBig';
          if (big) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,246,160,0.4)'; ctx.fillRect(-16, -2.5, 20, 5); ctx.globalCompositeOperation = 'source-over'; }
          ctx.strokeStyle = '#8a4a1f'; ctx.lineWidth = big ? 1.6 : 1.2;
          ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(5, 0); ctx.stroke();
          ctx.fillStyle = big ? '#fff36b' : '#dfe6f0';
          ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(4, -2.2); ctx.lineTo(4, 2.2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-11, -2); ctx.lineTo(-7, 0); ctx.lineTo(-11, 2); ctx.closePath(); ctx.fill();
          break;
        }
        case 'shuriken':
          ctx.rotate(t * 25);
          ctx.fillStyle = '#d9dee8'; ctx.strokeStyle = OL; ctx.lineWidth = 0.8;
          star(ctx, 0, 0, b.r * 1.3, b.r * 0.45, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = OL; ctx.beginPath(); ctx.arc(0, 0, 0.8, 0, TAU); ctx.fill();
          break;
        case 'potion': case 'brew': {
          ctx.rotate(t * 10);
          const col = b.kind === 'brew' ? '#9dffb0' : ['#c45cff', '#ff9ad5', '#9dffb0'][b.hue % 3];
          ctx.fillStyle = 'rgba(220,240,255,0.85)'; ctx.strokeStyle = OL; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 1, b.r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 1.5, b.r * 0.75, 0, Math.PI); ctx.fill();
          ctx.fillStyle = '#c8a070'; ctx.fillRect(-1.2, -b.r - 2, 2.4, 3);
          break;
        }
        case 'pellet':
          ctx.globalCompositeOperation = 'lighter';
          ctx.rotate(ang);
          ctx.fillStyle = '#ffd36b'; ctx.fillRect(-5, -1, 7, 2);
          ctx.fillStyle = '#fff'; ctx.fillRect(0, -0.8, 2.5, 1.6);
          break;
        case 'chili': {
          ctx.rotate(t * 8);
          ctx.fillStyle = '#ff3a2a'; ctx.strokeStyle = OL; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(0, 0, 5, 3, 0.4, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#3a8a3a'; ctx.fillRect(-6, -2, 2.5, 2.5);
          const blink = b.life < 0.3 && Math.sin(t * 50) > 0;
          if (blink) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); }
          break;
        }
      }
      ctx.restore();
    }
  }

  drawEnemyProj(ctx, world, t) {
    for (const b of world.eproj) {
      if (b.delay > 0) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.strokeStyle = OL; ctx.lineWidth = 1;
      switch (b.kind) {
        case 'candy':
          ctx.rotate(t * 8);
          ctx.fillStyle = '#ffd23d'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(3.5, 3); ctx.lineTo(-3.5, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ff8a2a'; ctx.fillRect(-2.5, 0, 5, 1.6);
          break;
        case 'orb':
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(200,80,255,0.4)'; ctx.beginPath(); ctx.arc(0, 0, b.r * 2, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e8a0ff'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, b.r * 0.4, 0, TAU); ctx.fill();
          break;
        case 'bomb':
          ctx.fillStyle = '#3a2a3a'; ctx.beginPath(); ctx.arc(0, 0, b.r + 0.5, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = Math.sin(t * 30) > 0 ? '#ff3a2a' : '#ffd23d';
          ctx.beginPath(); ctx.arc(1.5, -b.r - 1.5, 1.5, 0, TAU); ctx.fill();
          break;
        case 'shard':
          ctx.rotate(Math.atan2(b.vy, b.vx));
          ctx.fillStyle = '#d8f4ff'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(0, -2.5); ctx.lineTo(-5, 0); ctx.lineTo(0, 2.5); ctx.closePath(); ctx.fill(); ctx.stroke();
          break;
        case 'rock': case 'boulder': {
          ctx.rotate(t * 4);
          ctx.fillStyle = '#7a4a2a';
          ctx.beginPath();
          for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const rr = b.r * (0.8 + ((i * 37) % 10) / 30); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(-b.r * 0.3, -b.r * 0.3, b.r * 0.3, 0, TAU); ctx.fill();
          break;
        }
        case 'icicle':
          ctx.fillStyle = '#d8f4ff'; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(4, -8); ctx.lineTo(0, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
          break;
        case 'jelly':
          ctx.fillStyle = 'rgba(255,90,158,0.9)'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-1, -1.5, 1.2, 0, TAU); ctx.fill();
          break;
        case 'bullet': case 'bullet2': {
          const c1 = b.kind === 'bullet' ? '#ff7a3d' : '#ff4d9e';
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = rgba(c1 === '#ff7a3d' ? '#ff7a3d' : '#ff4d9e', 0.45); ctx.beginPath(); ctx.arc(0, 0, b.r * 2, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill(); ctx.lineWidth = 0.8; ctx.stroke();
          ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(0, 0, b.r * 0.45, 0, TAU); ctx.fill();
          break;
        }
        case 'wave': {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          const dir = Math.sign(b.vx);
          ctx.beginPath(); ctx.moveTo(-dir * 8, 7); ctx.quadraticCurveTo(0, -10, dir * 8, 7); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(160,120,200,0.8)'; ctx.stroke();
          break;
        }
        case 'fire': {
          const a = Math.min(1, b.life / 0.5);
          ctx.globalAlpha = a;
          for (let i = 0; i < 3; i++) {
            const fl = Math.sin(t * 20 + i * 2 + b.id) * 2;
            ctx.fillStyle = i === 1 ? '#ffd23d' : '#ff6a2a';
            ctx.beginPath(); ctx.moveTo(-6 + i * 4, 4); ctx.quadraticCurveTo(-5 + i * 4, -6 + fl, -2 + i * 4, 4); ctx.fill();
          }
          break;
        }
      }
      ctx.restore();
    }
  }

  drawLighting(ctx, world, t) {
    const dark = world.theme.dark;
    const lc = this.lightCanvas;
    const LW = 128, LH = 72;
    if (lc.width !== LW) { lc.width = LW; lc.height = LH; }
    const g = lc.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, LW, LH);
    g.fillStyle = `rgba(20,5,25,${dark})`;
    g.fillRect(0, 0, LW, LH);
    g.globalCompositeOperation = 'destination-out';
    const k = LW / W;
    const hole = (x, y, r, a = 1) => {
      const gr = g.createRadialGradient(x * k, y * k, 0, x * k, y * k, r * k);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x * k, y * k, r * k, 0, TAU); g.fill();
    };
    for (const p of world.players) if (p.present) hole(p.cx, p.cy, 95, 0.95);
    for (const b of world.pproj) if (b.kind === 'fireball' || b.kind === 'bolt') hole(b.x, b.y, 40, 0.7);
    for (const b of world.eproj) if (b.kind === 'bullet' || b.kind === 'orb' || b.kind === 'fire') hole(b.x, b.y, 26, 0.5);
    for (const f of world.fx.flashes) hole(f.x, f.y, f.r * 1.4, f.life / f.max);
    for (const pt of world.portals) hole(pt.x, pt.y, 36, 0.6);
    for (const z of world.zones) hole(z.x, z.y, z.r * 1.2, 0.6);
    if (world.hasLava) for (let c = 0; c < COLS; c += 2) for (let r = ROWS - 3; r < ROWS; r++) if (world.tiles[r * COLS + c] === T_LAVA) { hole(c * TILE + 8, r * TILE, 50, 0.8); break; }
    for (const k2 of world.pickups) if (k2.kind === 'golden') hole(k2.x, k2.y, 60, 1);
    for (const e of world.enemies) if (e.def.boss) hole(e.x + e.w / 2, e.y + e.h / 2, 70, 0.6);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lc, 0, -0.5, W, H + 1);
    ctx.restore();
  }

  // ------------------------------------------------------------------ HUD
  banner(title, sub) {
    this.banners.push({ title, sub, t: 0, dur: 2.4 });
  }
  drawHUD(ctx, world, dt, app) {
    const { cw, ch, scale, ox, oy, dpr } = this.view;
    const U = Math.min(scale, ch / 288) * 1; // HUD unit ~ world unit
    const hs = clamp(U, 1.4 * dpr, 4 * dpr);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pad = 6 * hs;
    // ---------------- player cards
    const n = world.players.length;
    const compact = n > 2;
    const cardW = (compact ? 54 : 66) * hs, cardH = 22 * hs;
    const cardsRight = pad + n * (cardW + 4 * hs);
    world.players.forEach((p, i) => {
      if (!p.present) return;
      const x = Math.max(pad, ox * 0.0 + pad) + i * (cardW + 4 * hs);
      const y = pad;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(30,12,40,0.55)';
      rrect(ctx, 0, 0, cardW, cardH, 8 * hs); ctx.fill();
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.5 * hs; ctx.stroke();
      // portrait
      ctx.save();
      ctx.beginPath(); ctx.arc(11 * hs, 11 * hs, 9 * hs, 0, TAU);
      ctx.fillStyle = shade(p.hero.color, 0.3); ctx.fill();
      ctx.clip();
      ctx.translate(11 * hs, 11 * hs); ctx.scale(hs * 0.62, hs * 0.62);
      drawHero(ctx, p.hero.id, 0, 12, { facing: 1, t: p.t, hat: p.hat, hurt: p.down || p.hurtT > 0 });
      ctx.restore();
      // special cooldown ring
      const frac = p.local ? (p.specialMax ? 1 - p.cd.special / p.specialMax : 1) : 1 - (p.specialFrac || 0);
      ctx.strokeStyle = frac >= 1 ? '#fff36b' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2 * hs;
      ctx.beginPath(); ctx.arc(11 * hs, 11 * hs, 10 * hs, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1)); ctx.stroke();
      // name
      ctx.font = `800 ${6.5 * hs}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = p.color;
      ctx.fillText(p.name, 23 * hs, 9 * hs);
      // hearts
      const hsz = (compact && p.maxHp > 4 ? 4.6 : 6) * hs;
      for (let k = 0; k < p.maxHp; k++) {
        const hx = 26 * hs + k * (hsz + 1 * hs), hy = 11 * hs;
        ctx.fillStyle = k < p.hp ? '#ff4d6a' : 'rgba(255,255,255,0.18)';
        heart(ctx, hx, hy, hsz); ctx.fill();
        if (k < p.hp) { ctx.strokeStyle = OL; ctx.lineWidth = 0.8 * hs; ctx.stroke(); }
      }
      if (p.lives > 0 && p.local) {
        ctx.font = `700 ${5 * hs}px ${FONT}`; ctx.fillStyle = '#fff6a0'; ctx.textAlign = 'right';
        ctx.fillText(`×${p.lives}`, cardW - 4 * hs, 9 * hs);
      }
      if (p.down) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; rrect(ctx, 0, 0, cardW, cardH, 8 * hs); ctx.fill();
        ctx.font = `800 ${7 * hs}px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.fillText('DOWN', cardW / 2 + 8 * hs, 14 * hs);
      }
      ctx.restore();
    });

    // ---------------- objective (top center)
    const o = world.obj;
    const objW = o.type === 'boss' ? Math.min(cw * 0.5, 220 * hs) : o.type === 'survive' ? 76 * hs : 110 * hs;
    // centre the objective, but slide it right / down so it never covers the player cards
    let cx = cw / 2;
    let opad = pad;
    if (cx - objW / 2 < cardsRight + 4 * hs) {
      const shifted = cardsRight + 4 * hs + objW / 2;
      if (shifted + objW / 2 < cw - 70 * hs) cx = shifted;
      else opad = pad + cardH + 4 * hs;
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const panel = (w, h) => { ctx.fillStyle = 'rgba(30,12,40,0.6)'; rrect(ctx, cx - w / 2, opad, w, h, 9 * hs); ctx.fill(); };
    if (o.type === 'collect') {
      const w = 110 * hs, h = 20 * hs;
      panel(w, h);
      if (!o.golden) {
        drawMuffin(ctx, cx - w / 2 + 12 * hs, opad + 10 * hs, 12 * hs);
        const k = clamp(o.count / Math.max(1, o.goal), 0, 1);
        const bx = cx - w / 2 + 24 * hs, bw = w - 56 * hs, by = opad + 7 * hs;
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; rrect(ctx, bx, by, bw, 6 * hs, 3 * hs); ctx.fill();
        const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        gr.addColorStop(0, '#ffb347'); gr.addColorStop(1, '#ffe14d');
        ctx.fillStyle = gr; rrect(ctx, bx, by, Math.max(6 * hs, bw * k), 6 * hs, 3 * hs); ctx.fill();
        ctx.font = `800 ${8 * hs}px ${FONT}`; ctx.fillStyle = '#fff';
        ctx.fillText(`${o.count}/${o.goal}`, cx + w / 2 - 16 * hs, opad + 10.5 * hs);
      } else {
        ctx.font = `800 ${8 * hs}px ${FONT}`;
        ctx.fillStyle = Math.sin(world.time * 8) > 0 ? '#ffe14d' : '#fff';
        ctx.fillText('★ GRAB THE GOLDEN MUFFIN! ★', cx, opad + 10.5 * hs);
      }
    } else if (o.type === 'survive') {
      const w = 76 * hs, h = 22 * hs;
      panel(w, h);
      ctx.font = `800 ${12 * hs}px ${FONT}`;
      ctx.fillStyle = o.timeLeft < 10 ? (Math.sin(world.time * 10) > 0 ? '#ff5a6e' : '#fff') : '#fff';
      ctx.fillText(`⏱ ${fmtTime(Math.ceil(o.timeLeft))}`, cx, opad + 11.5 * hs);
    } else if (o.type === 'waves') {
      const w = 110 * hs, h = 20 * hs;
      panel(w, h);
      ctx.font = `800 ${8 * hs}px ${FONT}`; ctx.fillStyle = '#fff';
      const left = Math.max(0, o.toKill - o.killed);
      ctx.fillText(`WAVE ${o.wave}/${o.waves} · ${left} left`, cx, opad + 10.5 * hs);
    } else if (o.type === 'boss') {
      const boss = world.obj.boss || world.enemies.find((e) => e.def.boss);
      if (boss) {
        const w = Math.min(cw * 0.5, 220 * hs), h = 22 * hs;
        panel(w, h);
        ctx.font = `800 ${7 * hs}px ${FONT}`; ctx.fillStyle = '#fff';
        ctx.fillText(boss.def.name.toUpperCase(), cx, opad + 7 * hs);
        const bx = cx - w / 2 + 8 * hs, bw = w - 16 * hs, by = opad + 12 * hs;
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; rrect(ctx, bx, by, bw, 6 * hs, 3 * hs); ctx.fill();
        const k = clamp(boss.hp / boss.maxHp, 0, 1);
        this.bossHpShown = this.bossHpShown === undefined ? k : this.bossHpShown + (k - this.bossHpShown) * Math.min(1, dt * 3);
        ctx.fillStyle = '#ffffff'; rrect(ctx, bx, by, Math.max(0, bw * this.bossHpShown), 6 * hs, 3 * hs); ctx.fill();
        const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        gr.addColorStop(0, '#ff3a5a'); gr.addColorStop(1, '#ff9a3d');
        ctx.fillStyle = gr; rrect(ctx, bx, by, Math.max(0, bw * k), 6 * hs, 3 * hs); ctx.fill();
        // phase ticks
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        for (const tk of [0.33, 0.66]) ctx.fillRect(bx + bw * tk, by, 1 * hs, 6 * hs);
      }
    }

    // ---------------- score + combo (top right)
    ctx.textAlign = 'right';
    const rx = cw - pad;
    ctx.font = `800 ${9 * hs}px ${FONT}`;
    ctx.lineWidth = 3 * hs; ctx.strokeStyle = OL; ctx.lineJoin = 'round';
    const sc = world.score.toLocaleString();
    ctx.strokeText(sc, rx, pad + 8 * hs); ctx.fillStyle = '#fff'; ctx.fillText(sc, rx, pad + 8 * hs);
    if (world.combo > 1) {
      const pulse = 1 + Math.max(0, 0.3 - ((world.time * 3) % 1)) * 0.6;
      const mult = world.comboMult();
      ctx.save();
      ctx.translate(rx, pad + 21 * hs); ctx.scale(pulse, pulse);
      ctx.font = `800 ${10 * hs}px ${FONT}`;
      const col = world.combo >= 30 ? '#ff5aff' : world.combo >= 15 ? '#ff9a3d' : '#ffe14d';
      ctx.strokeText(`${world.combo}x COMBO`, 0, 0); ctx.fillStyle = col; ctx.fillText(`${world.combo}x COMBO`, 0, 0);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(rx - 60 * hs, pad + 28 * hs, 60 * hs, 2 * hs);
      ctx.fillStyle = '#ffe14d'; ctx.fillRect(rx - 60 * hs, pad + 28 * hs, 60 * hs * clamp(world.comboT / 3.2, 0, 1), 2 * hs);
      if (mult > 1) { ctx.font = `700 ${6 * hs}px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(`score ×${mult.toFixed(2)}`, rx, pad + 34 * hs); }
    }
    // ping
    if (world.session.role === 'client' && settings().showFps) {
      ctx.font = `600 ${5 * hs}px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
      ctx.fillText(`ping ${Math.round(world.session.stats.rtt)}ms`, rx, ch - pad);
    }

    // ---------------- intro card
    if (world.state === 'intro' || (world.stateT < 0.6 && world.state === 'play' && this.introFading)) {
      const k = world.state === 'intro' ? Math.min(1, world.stateT / 0.3) : 1 - world.stateT / 0.6;
      this.introFading = true;
      ctx.save();
      ctx.globalAlpha = clamp(k, 0, 1);
      ctx.textAlign = 'center';
      const y0 = ch * 0.36;
      ctx.font = `800 ${10 * hs}px ${FONT}`; ctx.fillStyle = '#ffe14d';
      ctx.strokeStyle = OL; ctx.lineWidth = 4 * hs;
      const L = world.level;
      const top = L.endless ? 'ENDLESS' : L.bossRush ? 'BOSS RUSH' : `WORLD ${L.world}-${L.id.split('-')[1] || ''}`;
      ctx.strokeText(top, cw / 2, y0); ctx.fillText(top, cw / 2, y0);
      ctx.font = `800 ${22 * hs}px ${FONT}`; ctx.fillStyle = '#fff';
      ctx.strokeText(L.name, cw / 2, y0 + 22 * hs); ctx.fillText(L.name, cw / 2, y0 + 22 * hs);
      const goals = world.starGoals();
      ctx.font = `700 ${7 * hs}px ${FONT}`;
      goals.forEach((g, i) => {
        const yy = y0 + 40 * hs + i * 10 * hs;
        ctx.lineWidth = 3 * hs;
        ctx.strokeText(`★ ${g}`, cw / 2, yy); ctx.fillStyle = i === 0 ? '#fff' : '#ffe9a8'; ctx.fillText(`★ ${g}`, cw / 2, yy);
      });
      if (L.tip) {
        ctx.font = `600 ${6.5 * hs}px ${FONT}`; ctx.fillStyle = '#c8f0ff';
        ctx.strokeText(`Tip: ${L.tip}`, cw / 2, y0 + 78 * hs); ctx.fillText(`Tip: ${L.tip}`, cw / 2, y0 + 78 * hs);
      }
      ctx.restore();
    } else this.introFading = false;

    // ---------------- banners
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      b.t += dt;
      if (b.t > b.dur) { this.banners.splice(i, 1); continue; }
      const kin = ease.outBack(Math.min(1, b.t / 0.35));
      const kout = b.t > b.dur - 0.3 ? (b.dur - b.t) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = kout;
      ctx.translate(cw / 2, ch * 0.3);
      ctx.scale(kin, kin);
      ctx.textAlign = 'center';
      ctx.font = `800 ${20 * hs}px ${FONT}`;
      ctx.lineWidth = 5 * hs; ctx.strokeStyle = OL; ctx.lineJoin = 'round';
      ctx.strokeText(b.title, 0, 0);
      const gr = ctx.createLinearGradient(0, -10 * hs, 0, 10 * hs);
      gr.addColorStop(0, '#fff6c0'); gr.addColorStop(1, '#ffb347');
      ctx.fillStyle = gr; ctx.fillText(b.title, 0, 0);
      if (b.sub) {
        ctx.font = `700 ${8 * hs}px ${FONT}`; ctx.lineWidth = 3 * hs;
        ctx.strokeText(b.sub, 0, 16 * hs); ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, 16 * hs);
      }
      ctx.restore();
    }
    // paused online note
    ctx.restore();
  }
}

// ------------------------------------------------------------------ TILE ART
export function drawTileMap(g, tiles, theme, seedKey = 'x') {
  const at = (c, r) => (r < 0 || r >= ROWS ? 0 : tiles[r * COLS + (((c % COLS) + COLS) % COLS)]);
  const R = rng([...String(seedKey)].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0);
  const gt = theme.ground;
  // 1) outline pass (expanded shapes)
  g.fillStyle = OL;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = at(c, r);
    if (!isSolid(t)) continue;
    tileShape(g, c, r, at, 1.4); g.fill();
  }
  // 2) fills
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, shade(gt.base, 0.12)); grad.addColorStop(1, gt.dark);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = at(c, r);
    const x = c * TILE, y = r * TILE;
    if (t === T_GROUND) {
      g.fillStyle = grad; tileShape(g, c, r, at, 0); g.fill();
      // cake layer stripes
      if (r % 3 === 1) { g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x + (isSolid(at(c - 1, r)) ? 0 : 2), y + 6, TILE - (isSolid(at(c - 1, r)) ? 0 : 2) - (isSolid(at(c + 1, r)) ? 0 : 2), 3); }
      // specks
      for (let k = 0; k < 2; k++) {
        if (R() < 0.6) {
          g.fillStyle = gt.speck[Math.floor(R() * gt.speck.length)];
          g.save(); g.translate(x + 3 + R() * 10, y + 4 + R() * 9); g.rotate(R() * 3);
          g.fillRect(-1.5, -0.5, 3, 1.1);
          g.restore();
        }
      }
    } else if (t === T_ALT) {
      const a = theme.alt;
      g.fillStyle = a.base; tileShape(g, c, r, at, 0); g.fill();
      g.strokeStyle = a.dark; g.lineWidth = 1;
      g.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x + 2.5, y + 2.5, TILE - 6, 2);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x + 2.5, y + TILE - 4.5, TILE - 5, 2);
    } else if (t === T_ICE) {
      const ig = g.createLinearGradient(x, y, x + TILE, y + TILE);
      ig.addColorStop(0, '#e8f8ff'); ig.addColorStop(1, '#8fc8f0');
      g.fillStyle = ig; tileShape(g, c, r, at, 0); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x + 3, y + 11); g.lineTo(x + 9, y + 4); g.moveTo(x + 7, y + 13); g.lineTo(x + 11, y + 8); g.stroke();
    }
  }
  // 3) top frosting with drips on exposed ground tops
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = at(c, r);
    if (t !== T_GROUND || isSolid(at(c, r - 1))) continue;
    const x = c * TILE, y = r * TILE;
    const lExp = !isSolid(at(c - 1, r)) || isSolid(at(c - 1, r - 1));
    const rExp = !isSolid(at(c + 1, r)) || isSolid(at(c + 1, r - 1));
    g.fillStyle = gt.top;
    g.beginPath();
    const x0 = x - (lExp ? 0.8 : 0), x1 = x + TILE + (rExp ? 0.8 : 0);
    g.moveTo(x0, y + (lExp ? 3 : 0));
    if (lExp) g.quadraticCurveTo(x0, y - 0.8, x + 3, y - 0.8); else g.lineTo(x0, y - 0.8);
    g.lineTo(x + TILE - (rExp ? 3 : 0), y - 0.8);
    if (rExp) g.quadraticCurveTo(x1, y - 0.8, x1, y + 3); else g.lineTo(x1, y - 0.8);
    // wavy bottom edge with drips
    const drips = [];
    for (let k = 0; k < 2; k++) if (R() < 0.55) drips.push({ x: x + 3 + R() * 10, len: 2 + R() * 5 });
    for (let k = 16; k >= 0; k -= 2) {
      let yy = y + 4 + Math.sin((x + k) * 0.7) * 0.8;
      for (const d of drips) if (Math.abs(x + k - d.x) < 2) yy += d.len * (1 - Math.abs(x + k - d.x) / 2);
      g.lineTo(x + k, yy);
    }
    g.closePath(); g.fill();
    g.strokeStyle = OL; g.lineWidth = 0.9; g.stroke();
    g.fillStyle = gt.topHi;
    g.globalAlpha = 0.7;
    g.fillRect(x + 1, y + 0.4, TILE - 2, 1.1);
    g.globalAlpha = 1;
    // sprinkles on frosting (candy world)
    if (theme.id === 1 && R() < 0.8) {
      for (let k = 0; k < 2; k++) {
        g.fillStyle = gt.speck[Math.floor(R() * gt.speck.length)];
        g.save(); g.translate(x + 2 + R() * 12, y + 1.6 + R() * 1.4); g.rotate(R() * 3);
        g.fillRect(-1.2, -0.45, 2.4, 0.9); g.restore();
      }
    }
    if (theme.id === 3) { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x + 8, y + 0.5, 8.5, 2.2, 0, 0, TAU); g.fill(); }
  }
  // 4) one-way wafer platforms
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (at(c, r) !== T_ONEWAY) continue;
    const x = c * TILE, y = r * TILE;
    const left = at(c - 1, r) !== T_ONEWAY, right = at(c + 1, r) !== T_ONEWAY;
    const p = theme.plat;
    g.fillStyle = OL;
    rrectSides(g, x - (left ? 1.2 : 0), y - 1.2, TILE + (left ? 1.2 : 0) + (right ? 1.2 : 0), 8.4, left ? 3 : 0, right ? 3 : 0); g.fill();
    g.fillStyle = p.base;
    rrectSides(g, x, y, TILE, 6, left ? 2.5 : 0, right ? 2.5 : 0); g.fill();
    g.fillStyle = p.stripe;
    for (let k = 2; k < 16; k += 4) g.fillRect(x + k, y + 1, 1.2, 4);
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + (left ? 2 : 0), y + 0.6, TILE - (left ? 2 : 0) - (right ? 2 : 0), 1);
    g.fillStyle = p.dark; g.fillRect(x + (left ? 1 : 0), y + 5, TILE - (left ? 1 : 0) - (right ? 1 : 0), 1);
    if (left || right) {
      g.fillStyle = p.dark;
      const sx = left ? x + 3 : x + TILE - 5;
      g.fillRect(sx, y + 6, 2, 3);
    }
  }
  // 5) spikes
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (at(c, r) !== T_SPIKE) continue;
    const x = c * TILE, y = r * TILE;
    for (let k = 0; k < 3; k++) {
      const sx = x + 1 + k * 5;
      g.fillStyle = '#ffffff'; g.strokeStyle = OL; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, y + 16); g.lineTo(sx + 2.5, y + 6); g.lineTo(sx + 5, y + 16); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = '#ff3a5a'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(sx + 1, y + 14); g.lineTo(sx + 3.5, y + 12); g.moveTo(sx + 1.8, y + 11); g.lineTo(sx + 3.2, y + 9.5); g.stroke();
    }
  }
}

function tileShape(g, c, r, at, grow) {
  const x = c * TILE - grow, y = r * TILE - grow, s = TILE + grow * 2;
  const solid = (cc, rr) => isSolid(at(cc, rr));
  const up = solid(c, r - 1), dn = solid(c, r + 1), lf = solid(c - 1, r), rt = solid(c + 1, r);
  const rad = 4;
  const tl = !up && !lf ? rad : 0, tr = !up && !rt ? rad : 0, br = !dn && !rt ? rad : 0, bl = !dn && !lf ? rad : 0;
  g.beginPath();
  g.moveTo(x + tl, y);
  g.lineTo(x + s - tr, y); if (tr) g.quadraticCurveTo(x + s, y, x + s, y + tr);
  g.lineTo(x + s, y + s - br); if (br) g.quadraticCurveTo(x + s, y + s, x + s - br, y + s);
  g.lineTo(x + bl, y + s); if (bl) g.quadraticCurveTo(x, y + s, x, y + s - bl);
  g.lineTo(x, y + tl); if (tl) g.quadraticCurveTo(x, y, x + tl, y);
  g.closePath();
}

function rrectSides(g, x, y, w, h, rl, rr) {
  g.beginPath();
  g.moveTo(x + rl, y);
  g.lineTo(x + w - rr, y); if (rr) g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr); if (rr) g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rl, y + h); if (rl) g.quadraticCurveTo(x, y + h, x, y + h - rl);
  g.lineTo(x, y + rl); if (rl) g.quadraticCurveTo(x, y, x + rl, y);
  g.closePath();
}

// Small preview canvas of a level (for menus)
export function levelThumb(level, theme, tilesFromLevel, w = 160) {
  const c = document.createElement('canvas');
  const s = w / W;
  c.width = w; c.height = Math.round(H * s);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, theme.sky[0]); sky.addColorStop(1, theme.sky[2]);
  g.fillStyle = sky; g.fillRect(0, 0, c.width, c.height);
  g.scale(s, s);
  drawTileMap(g, tilesFromLevel, theme, level.id);
  return c;
}
