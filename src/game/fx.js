// Particles, floating text, shockwave rings, flashes. All in world units.
import { rand, TAU, pick, star } from '../util.js';
import { settings } from '../save.js';

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.flashes = [];
    this.trauma = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.max = 900;
  }
  get lowQ() { return settings().quality === 'low'; }
  add(p) {
    if (this.parts.length >= (this.lowQ ? 300 : this.max)) this.parts.shift();
    p.life = p.life ?? 0.5;
    p.max = p.life;
    p.vx = p.vx || 0; p.vy = p.vy || 0;
    p.g = p.g ?? 0;
    p.drag = p.drag ?? 0;
    p.size = p.size ?? 2;
    p.rot = p.rot ?? rand(TAU);
    p.vr = p.vr ?? 0;
    p.shape = p.shape || 'circle';
    this.parts.push(p);
    return p;
  }
  burst(x, y, n, opt = {}) {
    if (this.lowQ) n = Math.ceil(n * 0.5);
    const colors = opt.colors || [opt.color || '#fff'];
    for (let i = 0; i < n; i++) {
      const a = opt.angle !== undefined ? opt.angle + rand(-opt.spread, opt.spread) : rand(TAU);
      const sp = rand(opt.speed?.[0] ?? 40, opt.speed?.[1] ?? 140);
      this.add({
        x: x + rand(-(opt.jitter || 0), opt.jitter || 0), y: y + rand(-(opt.jitter || 0), opt.jitter || 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (opt.up || 0),
        life: rand(opt.life?.[0] ?? 0.3, opt.life?.[1] ?? 0.7),
        size: rand(opt.size?.[0] ?? 1.5, opt.size?.[1] ?? 3),
        color: pick(colors), g: opt.g ?? 300, drag: opt.drag ?? 1.5,
        shape: opt.shape || 'circle', vr: rand(-10, 10), add: opt.add, shrink: opt.shrink ?? true,
      });
    }
  }
  dust(x, y, n = 6, color = 'rgba(255,255,255,0.8)') {
    for (let i = 0; i < n; i++) {
      this.add({ x: x + rand(-5, 5), y: y - rand(0, 2), vx: rand(-50, 50), vy: rand(-30, -5), life: rand(0.25, 0.5), size: rand(2, 4), color, g: -20, drag: 4, shape: 'smoke' });
    }
  }
  sparkle(x, y, n = 6, color = '#fff6a0') {
    this.burst(x, y, n, { colors: [color, '#fff'], speed: [20, 90], life: [0.3, 0.7], size: [1.5, 3.2], g: 40, shape: 'star', add: true });
  }
  crumbs(x, y, n, colors) {
    this.burst(x, y, n, { colors, speed: [60, 200], life: [0.4, 0.9], size: [1.5, 3.5], g: 500, shape: 'square', up: -60 });
  }
  boom(x, y, r, color = '#ffb347') {
    this.ring(x, y, r, color, 0.35, 4);
    this.burst(x, y, Math.round(r * 0.8), { colors: [color, '#fff3b0', '#ff6b3d'], speed: [r * 1.5, r * 5], life: [0.25, 0.6], size: [2, 5], g: 80, drag: 3, add: true });
    for (let i = 0; i < r / 3; i++) this.add({ x: x + rand(-r / 2, r / 2), y: y + rand(-r / 2, r / 2), vx: rand(-30, 30), vy: rand(-60, -10), life: rand(0.5, 1), size: rand(4, 8), color: 'rgba(90,70,80,0.5)', g: -30, drag: 2, shape: 'smoke' });
    this.flash(x, y, r * 1.6, color, 0.15);
  }
  ring(x, y, r, color, life = 0.3, width = 3) {
    this.rings.push({ x, y, r, color, life, max: life, width });
  }
  flash(x, y, r, color, life = 0.12) {
    this.flashes.push({ x, y, r, color, life, max: life });
  }
  text(x, y, str, opt = {}) {
    this.texts.push({ x, y, str: String(str), vy: opt.vy ?? -50, life: opt.life ?? 0.8, max: opt.life ?? 0.8, color: opt.color || '#fff', size: opt.size || 9, outline: opt.outline || '#2a1630', pop: 0 });
  }
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.pop += dt;
      t.y += t.vy * dt; t.vy *= 1 - 3 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) this.flashes.splice(i, 1);
    }
    const sMul = settings().shake;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 9 * sMul;
    const t = performance.now() / 1000;
    this.shakeX = s * (Math.sin(t * 61.3) + Math.sin(t * 37.1) * 0.5) * 0.7;
    this.shakeY = s * (Math.sin(t * 53.7 + 1.3) + Math.sin(t * 29.3) * 0.5) * 0.7;
  }
  drawBack(ctx) {
    // flashes (glows) under entities
    if (this.flashes.length && !settings().reduceFlashes) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.flashes) {
        const a = f.life / f.max;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, f.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  draw(ctx) {
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.2 + 0.8 * Math.sqrt(t)), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    let additive = false;
    for (const p of this.parts) {
      const a = Math.min(1, p.life / p.max * 1.5);
      const s = p.shrink === false ? p.size : p.size * (0.3 + 0.7 * (p.life / p.max));
      if (!!p.add !== additive) { additive = !!p.add; ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over'; }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case 'square':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore();
          break;
        case 'star':
          star(ctx, p.x, p.y, s, s * 0.4, 4, p.rot); ctx.fill();
          break;
        case 'smoke':
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - 0.6 * p.life / p.max), 0, TAU); ctx.fill();
          break;
        case 'line': {
          ctx.strokeStyle = p.color; ctx.lineWidth = s * 0.6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
          break;
        }
        case 'snow':
          ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
          break;
        default:
          ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = Math.min(1, t.life / t.max * 2.5);
      const sc = t.pop < 0.12 ? 0.6 + (t.pop / 0.12) * 0.7 : t.pop < 0.2 ? 1.3 - ((t.pop - 0.12) / 0.08) * 0.3 : 1;
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(t.size * sc)}px Fredoka, "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = t.outline;
      ctx.lineJoin = 'round';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
