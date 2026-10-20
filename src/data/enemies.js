// Enemy & boss definitions: AI (host only) + drawing (all peers).
import { TAU, rand, clamp, sign, pick, rrect, star, wrapDx, W, H, TILE, chance } from '../util.js';
import { OL } from './heroes.js';

// ---------------------------------------------------------------- helpers
function faceToward(e, p) { if (p) e.facing = wrapDx(e.x + e.w / 2, p.x + p.w / 2) > 0 ? 1 : -1; }
function setState(e, s) { e.state = s; e.st = 0; }
function spd(e) { return e.def.speed * (e.enraged ? 1.45 : 1) * (e.slow > 0 ? 0.5 : 1) * (e.w_speedMul || 1); }
function ballistic(sx, sy, tx, ty, T, g) {
  const dx = wrapDx(sx, tx);
  return { vx: dx / T, vy: (ty - sy) / T - 0.5 * g * T };
}
function walker(e, w, dt, { ledgeTurn = false, mul = 1 } = {}) {
  e.vx = e.facing * spd(e) * mul;
  if (e.hitWall) e.facing = -e.facing;
  if (ledgeTurn && e.onGround) {
    const fx = e.facing > 0 ? e.x + e.w + 2 : e.x - 2;
    if (!w.solidAt(fx, e.y + e.h + 4) && !w.platformAt(fx, e.y + e.h + 4)) e.facing = -e.facing;
  }
}

function eyes(ctx, x, y, f, sep = 3, r = 2.2, angry = false, color = '#fff', pupil = OL) {
  for (const s of [-1, 1]) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x + s * sep + f, y, r, r * 1.15, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 0.8; ctx.strokeStyle = OL; ctx.stroke();
    ctx.fillStyle = pupil;
    ctx.beginPath(); ctx.arc(x + s * sep + f * 1.8, y + 0.3, r * 0.55, 0, TAU); ctx.fill();
  }
  if (angry) {
    ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - sep - 2 + f, y - r - 1.5); ctx.lineTo(x - sep + 2 + f, y - r - 0.2);
    ctx.moveTo(x + sep + 2 + f, y - r - 1.5); ctx.lineTo(x + sep - 2 + f, y - r - 0.2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- ENEMIES
export const ENEMIES = {
  gumdrop: {
    name: 'Gumdrop', w: 14, h: 12, hp: 4, speed: 38, score: 10, stomp: 'yes', crumbs: ['#ff5a7a', '#ffd0dc'],
    ai(e, w, dt) {
      walker(e, w, dt);
      e.data.hop = (e.data.hop ?? rand(1, 3)) - dt;
      if (e.onGround && e.data.hop <= 0) {
        e.vy = e.enraged ? -260 : -200;
        e.data.hop = rand(1.2, 3) * (e.enraged ? 0.6 : 1);
      }
    },
    draw(ctx, e, t) {
      const colors = ['#ff4d6d', '#5ad67a', '#b26bff', '#ffa53d', '#4fb8ff'];
      const c = e.enraged ? '#ff2a2a' : colors[e.id % colors.length];
      const sq = clamp(-e.vy / 600, -0.25, 0.3);
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h); ctx.scale(1 - sq * 0.6, 1 + sq);
      ctx.fillStyle = c; ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.bezierCurveTo(-8, -10, -5, -14, 0, -14); ctx.bezierCurveTo(5, -14, 8, -10, 8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 6; i++) ctx.fillRect(-6 + ((i * 37) % 12), -12 + ((i * 23) % 10), 1.2, 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(-3, -10, 2, 3, -0.3, 0, TAU); ctx.fill();
      eyes(ctx, 0, -6, e.facing, 2.8, 1.9, e.enraged);
      ctx.restore();
    },
  },
  bat: {
    name: 'Choco Bat', w: 14, h: 10, hp: 3, speed: 52, score: 15, stomp: 'yes', flying: true, crumbs: ['#5a3220', '#8a5a3a'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      e.data.ph = (e.data.ph || rand(TAU)) + dt * 4;
      if (e.state === 'swoop') {
        if (e.st > 0.55) setState(e, 'fly');
      } else if (e.state === 'prep') {
        e.vx *= 0.85; e.vy *= 0.85;
        if (e.st > 0.35 && p) {
          const dx = wrapDx(e.x, p.x), dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
          const s = spd(e) * 2.8;
          e.vx = (dx / d) * s; e.vy = (dy / d) * s;
          setState(e, 'swoop');
        }
      } else if (p) {
        const dx = wrapDx(e.x, p.x), dy = p.y - 6 - e.y, d = Math.hypot(dx, dy) || 1;
        const s = spd(e);
        e.vx += ((dx / d) * s - e.vx) * dt * 2;
        e.vy += ((dy / d) * s + Math.sin(e.data.ph) * 40 - e.vy) * dt * 2;
        faceToward(e, p);
        e.data.cd = (e.data.cd ?? rand(1.5, 3)) - dt;
        if (d < 90 && e.data.cd <= 0) { setState(e, 'prep'); e.data.cd = rand(2.5, 4); }
      }
      if (e.hitWall) e.vx = -e.vx * 0.6;
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
      const flap = Math.sin(t * (e.state === 'swoop' ? 30 : 16) + e.id) * 0.7;
      ctx.fillStyle = e.enraged ? '#7a1a1a' : '#4a2a1a'; ctx.strokeStyle = OL; ctx.lineWidth = 1;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.scale(s, 1); ctx.rotate(flap * 0.6);
        ctx.beginPath(); ctx.moveTo(4, -1); ctx.quadraticCurveTo(10, -9, 14, -3); ctx.quadraticCurveTo(11, -2, 12, 1); ctx.quadraticCurveTo(9, 0, 8, 3); ctx.quadraticCurveTo(6, 1, 4, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 7);
      g.addColorStop(0, e.enraged ? '#c43a3a' : '#8a5a3a'); g.addColorStop(1, e.enraged ? '#6a1010' : '#4a2a1a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a2a1a';
      ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(-3, -9); ctx.lineTo(-1, -5.5); ctx.moveTo(4, -5); ctx.lineTo(3, -9); ctx.lineTo(1, -5.5); ctx.fill();
      const glow = e.state === 'prep';
      eyes(ctx, 0, -1, e.facing, 2.4, 1.6, true, glow ? '#ff4d6a' : '#ffb3d0');
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(-1.5, 3); ctx.lineTo(-0.8, 4.8); ctx.lineTo(0, 3); ctx.moveTo(0, 3); ctx.lineTo(0.8, 4.8); ctx.lineTo(1.5, 3); ctx.fill();
      ctx.restore();
    },
  },
  candycorn: {
    name: 'Candy Corn Archer', w: 12, h: 16, hp: 5, speed: 24, score: 20, stomp: 'yes', crumbs: ['#ffd23d', '#ff8a2a', '#fff'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      if (e.state === 'aim') {
        e.vx = 0;
        faceToward(e, p);
        if (e.st > 0.65) {
          if (p) {
            const sx = e.x + e.w / 2, sy = e.y + 2;
            const tx = p.x + p.w / 2 + p.vx * 0.3, ty = p.y + p.h / 2;
            const T = clamp(Math.abs(wrapDx(sx, tx)) / 170, 0.55, 1.2);
            const v = ballistic(sx, sy, tx, ty, T, 380);
            w.enemyShoot(e, { kind: 'candy', x: sx, y: sy, vx: v.vx, vy: v.vy, g: 380, r: 3.5, life: 3 });
            if (e.enraged) {
              w.enemyShoot(e, { kind: 'candy', x: sx, y: sy, vx: v.vx * 0.8, vy: v.vy * 1.1, g: 380, r: 3.5, life: 3 });
            }
          }
          setState(e, 'walk'); e.data.cd = rand(2, 3.2) * (e.enraged ? 0.6 : 1);
        }
        return;
      }
      walker(e, w, dt, { ledgeTurn: true });
      e.data.cd = (e.data.cd ?? rand(1, 2.5)) - dt;
      if (e.data.cd <= 0 && p && Math.abs(wrapDx(e.x, p.x)) < 230 && e.onGround) { setState(e, 'aim'); w.esfx('telegraph', e.x); }
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      const lean = e.state === 'aim' ? -e.facing * 0.15 : Math.sin(t * 8 + e.id) * 0.05;
      ctx.rotate(lean);
      ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-7, -4, 0, -19); ctx.quadraticCurveTo(7, -4, 7, 0); ctx.quadraticCurveTo(0, 2, -7, 0); ctx.closePath();
      ctx.clip();
      ctx.fillStyle = '#fff6e0'; ctx.fillRect(-8, -20, 16, 22);
      ctx.fillStyle = e.enraged ? '#ff3a2a' : '#ff8a2a'; ctx.fillRect(-8, -12, 16, 7);
      ctx.fillStyle = '#ffd23d'; ctx.fillRect(-8, -5, 16, 7);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-7, -4, 0, -19); ctx.quadraticCurveTo(7, -4, 7, 0); ctx.quadraticCurveTo(0, 2, -7, 0); ctx.closePath(); ctx.stroke();
      eyes(ctx, 0, -8, e.facing, 2.2, 1.6, true);
      if (e.state === 'aim') {
        const k = Math.min(1, e.st / 0.65);
        ctx.fillStyle = `rgba(255,80,80,${0.3 + k * 0.6})`;
        ctx.beginPath(); ctx.arc(e.facing * 7, -10, 2 + k * 2, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
  },
  jawbreaker: {
    name: 'Jawbreaker', w: 14, h: 14, hp: 9, speed: 22, score: 25, stomp: 'yes', crumbs: ['#ff6ad5', '#6ad5ff', '#fff36b'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      e.armored = e.state === 'roll' || e.state === 'windup';
      if (e.state === 'windup') {
        e.vx = 0;
        if (e.st > 0.55) setState(e, 'roll');
        return;
      }
      if (e.state === 'roll') {
        e.vx = e.facing * spd(e) * 7.5;
        if (e.hitWall || e.st > 3) { setState(e, 'dizzy'); e.vx = -e.facing * 60; e.vy = -150; w.esfx('slam', e.x); w.fxEvent('shake', e.x, e.y, 0.15); }
        return;
      }
      if (e.state === 'dizzy') {
        e.vx *= 0.9;
        if (e.st > 1.7) setState(e, 'walk');
        return;
      }
      walker(e, w, dt, { ledgeTurn: true });
      e.data.cd = (e.data.cd ?? 1) - dt;
      if (p && e.onGround && e.data.cd <= 0 && Math.abs(p.y + p.h - (e.y + e.h)) < 20 && Math.abs(wrapDx(e.x, p.x)) < 260) {
        faceToward(e, p); setState(e, 'windup'); e.data.cd = 2.5; w.esfx('telegraph', e.x);
      }
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
      const rot = (e.x / 7) * (e.state === 'windup' ? 1 : 1) + (e.state === 'windup' ? t * 30 : 0);
      ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
      ctx.save(); ctx.rotate(rot);
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, TAU); ctx.clip();
      const bands = e.enraged ? ['#ff2a2a', '#ffb3b3', '#ff2a2a', '#fff'] : ['#ff6ad5', '#fff', '#6ad5ff', '#fff36b'];
      for (let i = 0; i < 8; i++) { ctx.fillStyle = bands[i % 4]; ctx.fillRect(-8 + i * 2.2, -8, 2.3, 16); }
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-3, -3.5, 2.5, 1.4, -0.6, 0, TAU); ctx.fill();
      if (e.armored) {
        ctx.strokeStyle = 'rgba(200,230,255,0.9)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, TAU); ctx.stroke();
      }
      if (e.state !== 'roll') eyes(ctx, 0, -1, e.facing, 2.5, 1.7, e.state === 'windup');
      if (e.state === 'dizzy') {
        for (let i = 0; i < 3; i++) {
          const a = t * 6 + (i * TAU) / 3;
          ctx.fillStyle = '#fff36b'; star(ctx, Math.cos(a) * 7, -10 + Math.sin(a) * 2, 2, 0.9); ctx.fill();
        }
      }
      ctx.restore();
    },
  },
  urchin: {
    name: 'Spiky Chestnut', w: 14, h: 12, hp: 6, speed: 26, score: 15, stomp: 'spiky', crumbs: ['#7a4a2a', '#c48a5a'],
    ai(e, w, dt) { walker(e, w, dt, { ledgeTurn: true }); },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      const wob = Math.sin(t * 10 + e.id) * 0.5;
      ctx.strokeStyle = OL; ctx.lineWidth = 1;
      ctx.fillStyle = e.enraged ? '#ff5a3a' : '#c8b46a';
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.2) * 7, -6 + Math.sin(a - 0.2) * 6); ctx.lineTo(Math.cos(a) * 12, -6 + Math.sin(a) * 11 + wob); ctx.lineTo(Math.cos(a + 0.2) * 7, -6 + Math.sin(a + 0.2) * 6); ctx.fill(); ctx.stroke();
      }
      const g = ctx.createLinearGradient(0, -13, 0, 0);
      g.addColorStop(0, '#a0643a'); g.addColorStop(1, '#6a3a1f');
      ctx.fillStyle = g; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, -6, 8, 6.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f2dcb0';
      ctx.beginPath(); ctx.ellipse(0, -1.5, 6, 2, 0, 0, TAU); ctx.fill();
      eyes(ctx, 0, -6, e.facing, 2.6, 1.7, true);
      ctx.restore();
    },
  },
  brute: {
    name: 'Marshmallow Brute', w: 22, h: 22, hp: 22, speed: 28, score: 50, stomp: 'yes', heavy: true, muffins: 2, crumbs: ['#fff', '#f2d8c0', '#c48a5a'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      if (e.state === 'windup') {
        e.vx = 0;
        if (e.st > 0.75) { setState(e, 'charge'); w.esfx('dash', e.x); }
        return;
      }
      if (e.state === 'charge') {
        e.vx = e.facing * spd(e) * 7;
        if (e.hitWall) { setState(e, 'stunned'); e.vx = -e.facing * 80; e.vy = -160; w.esfx('slam', e.x); w.fxEvent('shake', e.x, e.y, 0.3); }
        else if (e.st > 1.3) setState(e, 'walk');
        return;
      }
      if (e.state === 'stunned') {
        e.vx *= 0.9; e.vuln = true;
        if (e.st > 1.7) { setState(e, 'walk'); e.vuln = false; }
        return;
      }
      walker(e, w, dt, { ledgeTurn: true });
      e.data.cd = (e.data.cd ?? 1.5) - dt;
      if (p && e.onGround && e.data.cd <= 0 && Math.abs(p.y + p.h - (e.y + e.h)) < 30 && Math.abs(wrapDx(e.x, p.x)) < 170) {
        faceToward(e, p); setState(e, 'windup'); e.data.cd = rand(2.5, 3.5) * (e.enraged ? 0.6 : 1); w.esfx('telegraph', e.x);
      }
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      let sx = 1, sy = 1;
      if (e.state === 'windup') { const s = Math.sin(t * 60) * 0.8; ctx.translate(s, 0); sx = 1.08; sy = 0.92; }
      if (e.state === 'charge') { ctx.rotate(e.facing * 0.12); }
      ctx.scale(sx, sy);
      ctx.strokeStyle = OL; ctx.lineWidth = 1.4;
      const g = ctx.createLinearGradient(-12, 0, 12, 0);
      g.addColorStop(0, '#f0e6dc'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#e0d0c4');
      ctx.fillStyle = g;
      rrect(ctx, -12, -24, 24, 24, 7); ctx.fill(); ctx.stroke();
      // toasted top
      ctx.fillStyle = e.enraged ? '#c43a2a' : '#d9a066';
      ctx.beginPath(); ctx.ellipse(0, -21, 10, 3.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(120,60,20,0.4)';
      ctx.beginPath(); ctx.ellipse(-3, -21.5, 4, 1.4, 0, 0, TAU); ctx.fill();
      eyes(ctx, 0, -13, e.facing * 1.5, 4, 2.3, true, e.state === 'windup' ? '#ff8a8a' : '#fff');
      ctx.fillStyle = OL;
      ctx.fillRect(-4 + e.facing * 1.5, -6, 8, 1.5);
      // arms
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(-13, -9, 3.5, 4.5, 0.3, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(13, -9, 3.5, 4.5, -0.3, 0, TAU); ctx.fill(); ctx.stroke();
      if (e.state === 'stunned') {
        for (let i = 0; i < 3; i++) { const a = t * 5 + (i * TAU) / 3; ctx.fillStyle = '#fff36b'; star(ctx, Math.cos(a) * 9, -28 + Math.sin(a) * 2, 2.4, 1); ctx.fill(); }
      }
      ctx.restore();
    },
  },
  bomber: {
    name: 'Cupcake Bomber', w: 16, h: 14, hp: 6, speed: 60, score: 30, stomp: 'yes', flying: true, crumbs: ['#ff9ad5', '#fff', '#8a5a3a'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      if (!p) return;
      const tx = p.x + p.w / 2 + Math.sin(w.time * 0.7 + e.id) * 30;
      const ty = Math.max(24, p.y - 90);
      const dx = wrapDx(e.x + e.w / 2, tx), dy = ty - e.y;
      const s = spd(e);
      if (e.state === 'drop') {
        e.vx *= 0.9; e.vy *= 0.9;
        if (e.st > 0.45) {
          w.enemyShoot(e, { kind: 'bomb', x: e.x + e.w / 2, y: e.y + e.h, vx: e.vx * 0.3, vy: 40, g: 420, r: 4, life: 4, explode: 24 });
          setState(e, 'fly'); e.data.cd = rand(2.2, 3.2) * (e.enraged ? 0.55 : 1);
        }
        return;
      }
      e.vx += (clamp(dx * 2, -s, s) - e.vx) * dt * 2.5;
      e.vy += (clamp(dy * 2, -s, s) - e.vy) * dt * 2.5;
      if (e.hitWall) e.vx = -e.vx;
      faceToward(e, p);
      e.data.cd = (e.data.cd ?? rand(1.5, 2.5)) - dt;
      if (e.data.cd <= 0 && Math.abs(dx) < 40) { setState(e, 'drop'); w.esfx('telegraph', e.x); }
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      ctx.rotate(clamp(e.vx / 300, -0.25, 0.25));
      ctx.strokeStyle = OL; ctx.lineWidth = 1.1;
      // wings
      const fl = Math.sin(t * 22 + e.id) * 3;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.ellipse(-10, -10 + fl * 0.3, 5, 2.5 + fl * 0.2, -0.4, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(10, -10 + fl * 0.3, 5, 2.5 + fl * 0.2, 0.4, 0, TAU); ctx.fill(); ctx.stroke();
      // wrapper
      ctx.fillStyle = e.enraged ? '#c42a2a' : '#5ab8ff';
      ctx.beginPath(); ctx.moveTo(-6.5, -6); ctx.lineTo(6.5, -6); ctx.lineTo(5, 0); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      // frosting
      ctx.fillStyle = '#ff9ad5';
      ctx.beginPath(); ctx.arc(-4, -7, 4, Math.PI, 0); ctx.arc(4, -7, 4, Math.PI, 0); ctx.arc(0, -10, 4.5, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      // fuse candle
      ctx.fillStyle = '#fff'; ctx.fillRect(-1, -18, 2, 4); ctx.strokeRect(-1, -18, 2, 4);
      ctx.fillStyle = e.state === 'drop' ? '#ff3a3a' : '#ffb347';
      ctx.beginPath(); ctx.ellipse(0, -19.5 + Math.sin(t * 20) * 0.3, 1.4, 2.2, 0, 0, TAU); ctx.fill();
      eyes(ctx, 0, -3, e.facing, 2.4, 1.5, true);
      ctx.restore();
    },
  },
  wizard: {
    name: 'Licorice Wizard', w: 12, h: 20, hp: 11, speed: 0, score: 40, stomp: 'yes', crumbs: ['#2b2440', '#c43a5a'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      faceToward(e, p);
      e.vx = 0;
      if (e.state === 'walk') setState(e, 'idle');
      if (e.state === 'idle') {
        if (e.st > (e.enraged ? 0.7 : 1.2)) {
          e.data.casts = (e.data.casts || 0) + 1;
          if (e.data.casts > 2) { e.data.casts = 0; setState(e, 'tele'); e.data.dest = w.randomStandSpot(e.w, e.h); w.fxEvent('teleTel', e.data.dest.x + e.w / 2, e.data.dest.y + e.h / 2, 0.6); w.esfx('teleport', e.x); }
          else { setState(e, 'cast'); w.esfx('telegraph', e.x); }
        }
      } else if (e.state === 'cast') {
        if (e.st > 0.7) {
          if (p) {
            const sx = e.x + e.w / 2, sy = e.y + 2;
            const a0 = Math.atan2(p.y + p.h / 2 - sy, wrapDx(sx, p.x + p.w / 2));
            const n = e.enraged ? 5 : 3;
            for (let i = 0; i < n; i++) {
              const a = a0 + (i - (n - 1) / 2) * 0.35;
              w.enemyShoot(e, { kind: 'orb', x: sx, y: sy, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, r: 4, life: 4, homing: 1.1, target: p.id });
            }
          }
          setState(e, 'idle');
        }
      } else if (e.state === 'tele') {
        e.armored = false;
        if (e.st > 0.6) { e.x = e.data.dest.x; e.y = e.data.dest.y; e.vy = 0; setState(e, 'idle'); w.fxEvent('poof', e.x + e.w / 2, e.y + e.h / 2, 12); }
      }
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      if (e.state === 'tele') ctx.globalAlpha *= Math.max(0, 1 - e.st / 0.6);
      ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
      // twisted licorice body
      const c1 = e.enraged ? '#8a1010' : '#c42a4a', c2 = e.enraged ? '#4a0808' : '#7a1a30';
      ctx.fillStyle = c1;
      rrect(ctx, -5.5, -20, 11, 20, 4); ctx.fill(); ctx.stroke();
      ctx.save(); rrect(ctx, -5.5, -20, 11, 20, 4); ctx.clip();
      ctx.strokeStyle = c2; ctx.lineWidth = 2;
      for (let i = -20; i < 4; i += 4) { ctx.beginPath(); ctx.moveTo(-6, i + ((t * 8) % 4)); ctx.lineTo(6, i + 4 + ((t * 8) % 4)); ctx.stroke(); }
      ctx.restore();
      // hat
      ctx.fillStyle = '#2b2440'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-8, -19); ctx.lineTo(8, -19); ctx.lineTo(-e.facing * 3, -32); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd34d'; star(ctx, -e.facing, -24, 1.8, 0.8); ctx.fill();
      eyes(ctx, 0, -13, e.facing, 2.3, 1.6, true, '#fff36b');
      // staff + orb
      const casting = e.state === 'cast';
      ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(e.facing * 8, 0); ctx.lineTo(e.facing * 8, -18); ctx.stroke();
      const r = casting ? 2.5 + (e.st / 0.7) * 3 : 2.5;
      ctx.fillStyle = '#c94dff';
      ctx.globalAlpha *= 0.4; ctx.beginPath(); ctx.arc(e.facing * 8, -20, r + 2, 0, TAU); ctx.fill();
      ctx.globalAlpha /= 0.4; ctx.beginPath(); ctx.arc(e.facing * 8, -20, r, 0, TAU); ctx.fill();
      ctx.restore();
    },
  },
  ghost: {
    name: 'Toast Ghost', w: 14, h: 14, hp: 7, speed: 34, score: 30, stomp: 'yes', flying: true, noclip: true, crumbs: ['#e8b070', '#fff'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      e.data.cyc = (e.data.cyc ?? rand(3)) + dt;
      const period = 3.8;
      const ph = e.data.cyc % period;
      e.phased = ph > 2.2;
      if (p) {
        const dx = wrapDx(e.x, p.x), dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        const s = spd(e) * (e.phased ? 1.6 : 1);
        e.vx += ((dx / d) * s - e.vx) * dt * 1.5;
        e.vy += ((dy / d) * s - e.vy) * dt * 1.5;
        faceToward(e, p);
      }
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2 + Math.sin(t * 3 + e.id) * 1.5);
      ctx.globalAlpha *= e.phased ? 0.28 : 1;
      ctx.strokeStyle = OL; ctx.lineWidth = 1.1;
      // tail
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.moveTo(-6, 2);
      for (let i = 0; i <= 6; i++) ctx.lineTo(-6 + i * 2, 8 + Math.sin(t * 8 + i) * 1.5 + (i % 2) * 2);
      ctx.lineTo(6, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      // toast
      ctx.fillStyle = e.enraged ? '#5a2a1a' : '#a0602a';
      ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(-8, -3); ctx.arc(-4, -4, 4, Math.PI, -0.3); ctx.arc(4, -4, 4, Math.PI + 0.3, 0); ctx.lineTo(8, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = e.enraged ? '#8a4a2a' : '#f2c88a';
      ctx.beginPath(); ctx.moveTo(-6.5, 4); ctx.lineTo(-6.5, -3); ctx.arc(-3.5, -3.6, 3, Math.PI, -0.3); ctx.arc(3.5, -3.6, 3, Math.PI + 0.3, 0); ctx.lineTo(6.5, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = OL;
      ctx.beginPath(); ctx.ellipse(-2.5 + e.facing, -1, 1.4, 2, 0, 0, TAU); ctx.ellipse(2.5 + e.facing, -1, 1.4, 2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(e.facing, 2.5, 1.5, 1.2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
  },
  icegolem: {
    name: 'Popsicle Golem', w: 14, h: 20, hp: 12, speed: 20, score: 35, stomp: 'yes', crumbs: ['#8fd6ff', '#fff', '#c8a070'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      if (e.state === 'aim') {
        e.vx = 0; faceToward(e, p);
        if (e.st > 0.55) {
          const sx = e.x + e.w / 2, sy = e.y + 8;
          const n = e.enraged ? 3 : 2;
          for (let i = 0; i < n; i++) w.enemyShoot(e, { kind: 'shard', x: sx, y: sy, vx: e.facing * 190, vy: (i - (n - 1) / 2) * 30, r: 3.5, life: 2.5, slow: 1.5 });
          setState(e, 'walk'); e.data.cd = rand(2, 3) * (e.enraged ? 0.6 : 1);
        }
        return;
      }
      walker(e, w, dt, { ledgeTurn: true });
      e.data.cd = (e.data.cd ?? 1.5) - dt;
      if (p && e.data.cd <= 0 && Math.abs(p.y - e.y) < 34 && Math.abs(wrapDx(e.x, p.x)) < 240) { setState(e, 'aim'); w.esfx('telegraph', e.x); }
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
      const step = e.vx ? Math.sin(t * 10) * 1 : 0;
      ctx.fillStyle = '#d9b07a'; ctx.fillRect(-1.5, -3 + step * 0.3, 3, 4); ctx.strokeRect(-1.5, -3, 3, 4);
      const g = ctx.createLinearGradient(-7, 0, 7, 0);
      g.addColorStop(0, e.enraged ? '#ff6a6a' : '#5ab8ff'); g.addColorStop(0.5, e.enraged ? '#ffb0b0' : '#a8e0ff'); g.addColorStop(1, e.enraged ? '#c43a3a' : '#3a8ad6');
      ctx.fillStyle = g;
      rrect(ctx, -7, -21, 14, 18, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(-4.5, -18, 1.5, 10);
      // drips
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(-7, -17); ctx.quadraticCurveTo(-3, -13, 0, -17); ctx.quadraticCurveTo(3, -12, 7, -17); ctx.lineTo(7, -20); ctx.lineTo(-7, -20); ctx.closePath(); ctx.fill();
      eyes(ctx, 0, -11, e.facing, 2.4, 1.6, true);
      if (e.state === 'aim') { ctx.fillStyle = `rgba(200,240,255,${0.5 + Math.sin(t * 30) * 0.4})`; star(ctx, e.facing * 9, -12, 3.5, 1.4, 6, t * 5); ctx.fill(); }
      ctx.restore();
    },
  },
  imp: {
    name: 'Ember Imp', w: 12, h: 12, hp: 5, speed: 110, score: 20, stomp: 'yes', crumbs: ['#ff8a2a', '#ffd23d', '#ff3a2a'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      if (e.onGround) {
        e.vx *= 0.8;
        if (!e.data.landed) {
          e.data.landed = true;
          if (e.data.wasAir) w.enemyShoot(e, { kind: 'fire', x: e.x + e.w / 2, y: e.y + e.h - 4, vx: 0, vy: 0, g: 0, r: 6, life: 2.4, static: true });
        }
        e.data.wait = (e.data.wait ?? rand(0.4, 1)) - dt;
        if (e.data.wait <= 0 && p) {
          faceToward(e, p);
          e.vx = e.facing * spd(e) * rand(0.6, 1.2);
          e.vy = -rand(220, 330);
          e.data.wait = rand(0.5, 1.1) * (e.enraged ? 0.5 : 1);
          e.data.landed = false; e.data.wasAir = true;
        }
      } else e.data.landed = false;
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      const fl = Math.sin(t * 25 + e.id) * 1.5;
      ctx.strokeStyle = OL; ctx.lineWidth = 1.1;
      ctx.fillStyle = e.enraged ? '#ff2a6a' : '#ff6a2a';
      ctx.beginPath(); ctx.moveTo(-7, -3); ctx.quadraticCurveTo(-8, -10, -4, -13 + fl); ctx.quadraticCurveTo(-2, -9, 0, -16 - fl); ctx.quadraticCurveTo(2, -9, 4, -13 + fl); ctx.quadraticCurveTo(8, -10, 7, -3); ctx.quadraticCurveTo(0, 2, -7, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath(); ctx.ellipse(0, -4, 4.5, 3.5, 0, 0, TAU); ctx.fill();
      eyes(ctx, 0, -7, e.facing, 2.2, 1.5, true, '#fff6c0');
      ctx.restore();
    },
  },
};

// ---------------------------------------------------------------- BOSSES
function bossPhase(e) { return e.hp / e.maxHp; }

export const BOSSES = {
  jellyking: {
    name: 'King Gelatino', title: 'The Wobbling Monarch', w: 44, h: 36, hp: 240, speed: 80, score: 1000, stomp: 'bounce', heavy: true, boss: true, crumbs: ['#ff5a9e', '#ffb3d6', '#ffd34d'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      const hpF = bossPhase(e);
      const rage = hpF < 0.34;
      e.data.sum1 = e.data.sum1 || false;
      if (!e.data.sum1 && hpF < 0.66) { e.data.sum1 = true; setState(e, 'summon'); }
      if (!e.data.sum2 && hpF < 0.33) { e.data.sum2 = true; setState(e, 'summon'); }
      switch (e.state) {
        case 'intro': case 'walk':
          if (e.st > 1.6) setState(e, 'idle');
          break;
        case 'idle':
          e.vx *= 0.85;
          if (e.st > (rage ? 0.45 : 0.8) && e.onGround) {
            setState(e, chance(0.6) ? 'hop' : 'bigslam');
            e.data.hops = rage ? 4 : 3;
          }
          break;
        case 'hop':
          if (e.onGround && e.st > 0.1) {
            if (e.data.air) {
              e.data.air = false;
              w.shockwave(e, e.x + e.w / 2, e.y + e.h, rage ? 170 : 140);
              e.data.hops--;
              if (e.data.hops <= 0) { setState(e, 'idle'); break; }
            }
            if (e.st > 0.25) {
              faceToward(e, p);
              e.vy = -330; e.vx = e.facing * (rage ? 120 : 90);
              e.data.air = true; e.st = 0;
            }
          }
          break;
        case 'bigslam':
          if (e.st < 0.05 && e.onGround) { e.vy = -560; e.vx = 0; e.data.air = true; w.esfx('jump', e.x); }
          if (e.data.air && e.vy > -60 && !e.data.hang) {
            e.data.hang = true; e.data.tx = p ? p.x + p.w / 2 - e.w / 2 : e.x;
            w.fxEvent('target', e.data.tx + e.w / 2, w.groundBelow(e.data.tx + e.w / 2, e.y + e.h), 0.6);
          }
          if (e.data.hang && !e.onGround) {
            if (e.st < 1.2) { e.vy = Math.min(e.vy, 0) - 0; e.vy = 0; e.x += (e.data.tx - e.x) * dt * 6; }
            else e.vy = 620;
          }
          if (e.onGround && e.data.hang) {
            e.data.hang = false; e.data.air = false;
            w.shockwave(e, e.x + e.w / 2, e.y + e.h, 210, true);
            for (let i = 0; i < (rage ? 6 : 4); i++) w.enemyShoot(e, { kind: 'jelly', x: e.x + e.w / 2, y: e.y + 6, vx: rand(-160, 160), vy: rand(-380, -240), g: 500, r: 4, life: 3 });
            setState(e, 'idle');
          }
          break;
        case 'summon':
          e.vx = 0;
          if (e.st > 0.1 && !e.data.summoned) {
            e.data.summoned = true;
            w.esfx('roar', e.x);
            for (let i = 0; i < 3; i++) w.spawnEnemyAt('gumdrop', e.x + e.w / 2 + (i - 1) * 30, e.y, { vx: (i - 1) * 140, vy: -300, enraged: hpF < 0.34 });
          }
          if (e.st > 1.2) { e.data.summoned = false; setState(e, 'idle'); }
          break;
        default: setState(e, 'idle');
      }
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      const sq = clamp(-e.vy / 900, -0.2, 0.25) + Math.sin(t * 5) * 0.03;
      ctx.scale(1 - sq * 0.7, 1 + sq);
      ctx.strokeStyle = OL; ctx.lineWidth = 2;
      const g = ctx.createRadialGradient(-8, -28, 4, 0, -16, 34);
      g.addColorStop(0, 'rgba(255,190,220,0.95)'); g.addColorStop(0.6, 'rgba(255,80,150,0.92)'); g.addColorStop(1, 'rgba(200,30,100,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-25, 0); ctx.bezierCurveTo(-26, -26, -16, -38, 0, -38); ctx.bezierCurveTo(16, -38, 26, -26, 25, 0); ctx.quadraticCurveTo(0, 4, -25, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      // inner bubbles
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-14 + i * 6, -8 - ((i * 13 + t * 10) % 22), 1.5 + (i % 3), 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.ellipse(-12, -28, 5, 3, -0.5, 0, TAU); ctx.fill();
      // face
      const angry = e.hp / e.maxHp < 0.34;
      eyes(ctx, 0, -18, e.facing * 2, 7, 4, true, angry ? '#ffd0d0' : '#fff');
      ctx.fillStyle = OL;
      ctx.beginPath(); ctx.ellipse(e.facing * 2, -8, 6, e.state === 'summon' ? 4 : 2.2, 0, 0, TAU); ctx.fill();
      // crown
      ctx.translate(0, -37);
      ctx.fillStyle = '#ffd34d'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(-11, -9); ctx.lineTo(-5, -4); ctx.lineTo(0, -12); ctx.lineTo(5, -4); ctx.lineTo(11, -9); ctx.lineTo(10, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4da6ff'; ctx.beginPath(); ctx.arc(0, -2, 2, 0, TAU); ctx.fill();
      ctx.restore();
    },
  },
  golem: {
    name: 'Cocoa Colossus', title: 'Heart of the Mine', w: 48, h: 50, hp: 320, speed: 22, score: 1500, stomp: 'bounce', heavy: true, boss: true, crumbs: ['#6b3f2a', '#a8683f', '#ffb347'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      const hpF = bossPhase(e);
      const p2 = hpF < 0.5;
      e.vuln = e.state === 'vent';
      switch (e.state) {
        case 'intro': case 'walk':
          if (e.st > 1.6) setState(e, 'idle');
          break;
        case 'idle':
          faceToward(e, p);
          e.vx = e.facing * spd(e);
          if (e.hitWall) e.vx = 0;
          if (e.st > (p2 ? 1.0 : 1.5)) {
            const r = Math.random();
            if (r < 0.45) { setState(e, 'raise'); w.esfx('telegraph', e.x); }
            else if (r < 0.75) setState(e, 'throw');
            else setState(e, p2 ? 'rain' : 'raise');
          }
          break;
        case 'raise':
          e.vx = 0;
          if (e.st > 0.9) {
            w.esfx('slam', e.x); w.fxEvent('shake', e.x, e.y, 0.6);
            w.shockwave(e, e.x + e.w / 2, e.y + e.h, p2 ? 210 : 170, true);
            const n = p2 ? 5 : 3;
            for (let i = 0; i < n; i++) {
              const x = rand(30, W - 30);
              w.enemyShoot(e, { kind: 'rock', x, y: 4, vx: 0, vy: 0, g: 600, r: 6, life: 3, delay: 0.7 + i * 0.12 });
            }
            setState(e, 'vent');
          }
          break;
        case 'vent':
          e.vx = 0;
          if (e.st > 1.8) setState(e, 'idle');
          break;
        case 'throw':
          e.vx = 0;
          if (e.st > 0.5 && !e.data.thrown) {
            e.data.thrown = true;
            const targets = w.alivePlayers();
            const n = p2 ? 4 : 3;
            for (let i = 0; i < n; i++) {
              const tp = targets[i % Math.max(1, targets.length)] || p;
              if (!tp) break;
              const sx = e.x + e.w / 2, sy = e.y + 4;
              const T = 1 + i * 0.15;
              const v = ballistic(sx, sy, tp.x + tp.w / 2 + rand(-20, 20), tp.y + tp.h, T, 500);
              w.enemyShoot(e, { kind: 'boulder', x: sx, y: sy, vx: v.vx, vy: v.vy, g: 500, r: 7, life: 4 });
            }
            w.esfx('throw', e.x);
          }
          if (e.st > 1.2) { e.data.thrown = false; setState(e, 'idle'); }
          break;
        case 'rain':
          e.vx = 0;
          if (e.st < 0.05) w.esfx('roar', e.x);
          if (e.st > 0.4 && !e.data.rained) {
            e.data.rained = true;
            for (const tp of w.alivePlayers()) {
              for (let k = -1; k <= 1; k++) w.enemyShoot(e, { kind: 'rock', x: tp.x + tp.w / 2 + k * 28, y: 4, vx: 0, vy: 0, g: 600, r: 6, life: 3, delay: 0.8 + Math.abs(k) * 0.25 });
            }
          }
          if (e.st > 1.6) { e.data.rained = false; setState(e, 'idle'); }
          break;
        default: setState(e, 'idle');
      }
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      ctx.strokeStyle = OL; ctx.lineWidth = 2;
      const raise = e.state === 'raise' ? Math.min(1, e.st / 0.9) : 0;
      const walk = e.vx ? Math.sin(t * 6) * 1.5 : 0;
      // legs
      ctx.fillStyle = '#4a2a1a';
      rrect(ctx, -18, -12 + walk, 12, 12, 3); ctx.fill(); ctx.stroke();
      rrect(ctx, 6, -12 - walk, 12, 12, 3); ctx.fill(); ctx.stroke();
      // body
      const g = ctx.createLinearGradient(0, -52, 0, -8);
      g.addColorStop(0, '#8a5236'); g.addColorStop(1, '#5a3220');
      ctx.fillStyle = g;
      rrect(ctx, -22, -50, 44, 40, 8); ctx.fill(); ctx.stroke();
      // chocolate grid
      ctx.strokeStyle = 'rgba(40,20,10,0.5)'; ctx.lineWidth = 1.2;
      for (let i = -11; i <= 11; i += 11) { ctx.beginPath(); ctx.moveTo(i, -48); ctx.lineTo(i, -12); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-20, -30); ctx.lineTo(20, -30); ctx.stroke();
      ctx.strokeStyle = OL;
      // core
      const vent = e.state === 'vent';
      const cg = ctx.createRadialGradient(0, -24, 1, 0, -24, vent ? 12 : 7);
      cg.addColorStop(0, '#fff6c0'); cg.addColorStop(0.5, vent ? '#ffb347' : '#c97a2a'); cg.addColorStop(1, 'rgba(200,100,30,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(0, -24, vent ? 12 + Math.sin(t * 20) : 7, 0, TAU); ctx.fill();
      // eyes
      ctx.fillStyle = vent ? '#666' : '#ffd34d';
      ctx.fillRect(-12 + e.facing * 2, -42, 7, 4); ctx.fillRect(5 + e.facing * 2, -42, 7, 4);
      // arms
      ctx.fillStyle = '#6b3f2a'; ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(s * 24, -40);
        ctx.rotate(raise ? -s * raise * 2.6 : s * 0.2);
        rrect(ctx, -6, 0, 12, 26, 5); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      if (vent) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = 'bold 8px Fredoka, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('WEAK!', 0, -56 - Math.sin(t * 10) * 2);
      }
      ctx.restore();
    },
  },
  wyrm: {
    name: 'Sorbet Wyrm', title: 'Terror of the Peaks', w: 26, h: 22, hp: 300, speed: 90, score: 2000, stomp: 'no', flying: true, noclip: true, heavy: true, boss: true, segments: 9, crumbs: ['#ff9ad5', '#8fd6ff', '#fff36b', '#9dffb0'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      const hpF = bossPhase(e);
      const p2 = hpF < 0.5;
      const cx = W / 2 - e.w / 2, cy = 70;
      e.data.ph = (e.data.ph || 0) + dt;
      switch (e.state) {
        case 'intro': case 'walk':
          e.vx = (cx - e.x) * 1.5; e.vy = (cy - e.y) * 1.5;
          if (e.st > 2) setState(e, 'circle');
          break;
        case 'circle': {
          const tx = cx + Math.sin(e.data.ph * 0.9) * 190, ty = cy + Math.sin(e.data.ph * 1.8) * 40;
          e.vx += ((tx - e.x) * 2.5 - e.vx) * dt * 3; e.vy += ((ty - e.y) * 2.5 - e.vy) * dt * 3;
          e.data.sh = (e.data.sh ?? 1) - dt;
          if (e.data.sh <= 0 && p) {
            e.data.sh = p2 ? 0.7 : 1.1;
            const a = Math.atan2(p.y - e.y, wrapDx(e.x, p.x));
            w.enemyShoot(e, { kind: 'shard', x: e.x + e.w / 2, y: e.y + e.h / 2, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 3.5, life: 3, slow: 1.2, noclip: true });
          }
          if (e.st > (p2 ? 2.4 : 3.2)) {
            const r = Math.random();
            setState(e, r < 0.4 ? 'aimSwoop' : r < 0.7 ? 'breath' : 'icicles');
          }
          break;
        }
        case 'aimSwoop':
          e.vx *= 0.9; e.vy *= 0.9;
          if (e.st < 0.05 && p) { e.data.tx = p.x + p.w / 2; e.data.ty = p.y + p.h / 2; w.fxEvent('line', e.x + e.w / 2, e.y + e.h / 2, 0.8, { x2: e.data.tx, y2: e.data.ty }); w.esfx('telegraph', e.x); }
          if (e.st > 0.8) {
            const dx = e.data.tx - (e.x + e.w / 2), dy = e.data.ty - (e.y + e.h / 2), d = Math.hypot(dx, dy) || 1;
            e.vx = (dx / d) * 330; e.vy = (dy / d) * 330;
            setState(e, 'swoop'); w.esfx('roar', e.x);
          }
          break;
        case 'swoop':
          if (e.y > H - 50) e.vy = -Math.abs(e.vy) * 0.8;
          if (e.st > 1.1) { setState(e, 'circle'); e.data.swoops = (e.data.swoops || 0) + 1; if (p2 && e.data.swoops % 2) setState(e, 'aimSwoop'); }
          break;
        case 'breath': {
          const side = (e.data.side = e.data.side ?? 1);
          const tx = side > 0 ? W - 70 : 40, ty = 50;
          e.vx += ((tx - e.x) * 3 - e.vx) * dt * 4; e.vy += ((ty - e.y) * 3 - e.vy) * dt * 4;
          if (p) faceToward(e, p);
          if (e.st > 0.9 && e.st < 2.6) {
            e.data.bt = (e.data.bt ?? 0) - dt;
            if (e.data.bt <= 0 && p) {
              e.data.bt = 0.55;
              const a0 = Math.atan2(p.y - e.y, wrapDx(e.x, p.x));
              const n = p2 ? 9 : 7;
              for (let i = 0; i < n; i++) {
                const a = a0 + (i - (n - 1) / 2) * 0.16;
                w.enemyShoot(e, { kind: 'shard', x: e.x + e.w / 2, y: e.y + e.h / 2, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 3.5, life: 4, slow: 1.2, noclip: true });
              }
              w.esfx('freeze', e.x);
            }
          }
          if (e.st > 2.8) { e.data.side = -side; setState(e, 'circle'); }
          break;
        }
        case 'icicles':
          e.vx *= 0.92; e.vy += ((40 - e.y) * 2 - e.vy) * dt * 3;
          if (e.st < 0.05) w.esfx('roar', e.x);
          if (e.st > 0.5 && !e.data.ic) {
            e.data.ic = true;
            const n = p2 ? 12 : 9;
            const gap = Math.floor(rand(1, n - 2));
            for (let i = 0; i < n; i++) {
              if (i === gap) continue;
              const x = 16 + (i + 0.5) * ((W - 32) / n);
              w.enemyShoot(e, { kind: 'icicle', x, y: 2, vx: 0, vy: 0, g: 700, r: 5, life: 3, delay: 0.9 + (i % 2) * 0.25 });
            }
          }
          if (e.st > 2) { e.data.ic = false; setState(e, 'circle'); }
          break;
        default: setState(e, 'circle');
      }
      // keep inside arena
      if (e.x < -10) e.vx = Math.abs(e.vx); if (e.x > W - e.w + 10) e.vx = -Math.abs(e.vx);
      if (e.y < -10) e.vy = Math.abs(e.vy);
      if (e.vx) e.facing = e.vx > 0 ? 1 : -1;
    },
    draw(ctx, e, t) {
      // body segments (from trail)
      const trail = e.trail || [];
      const cols = ['#ff9ad5', '#8fd6ff', '#fff36b', '#9dffb0', '#c9a6ff'];
      ctx.strokeStyle = OL; ctx.lineWidth = 1.6;
      for (let i = (e.def.segments || 9) - 1; i >= 0; i--) {
        const s = trail[Math.min(trail.length - 1, (i + 1) * 6)];
        if (!s) continue;
        const r = 10 - i * 0.6;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(s.x - r * 0.3, s.y - r * 0.4, r * 0.3, 0, TAU); ctx.fill();
        if (i === (e.def.segments || 9) - 1) {
          ctx.fillStyle = '#c8a070';
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 6, s.y + 12); ctx.lineTo(s.x + 6, s.y + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
      const f = e.facing;
      // horns
      ctx.fillStyle = '#e8f6ff';
      ctx.beginPath(); ctx.moveTo(-f * 4, -8); ctx.lineTo(-f * 14, -18); ctx.lineTo(-f * 2, -11); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f * 2, -10); ctx.lineTo(-f * 6, -22); ctx.lineTo(f * 6, -11); ctx.closePath(); ctx.fill(); ctx.stroke();
      const g = ctx.createRadialGradient(-3, -5, 2, 0, 0, 16);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#bfe6ff'); g.addColorStop(1, '#6ab0e6');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 12, 0, 0, TAU); ctx.fill(); ctx.stroke();
      // snout
      ctx.beginPath(); ctx.ellipse(f * 11, 3, 8, 6, 0, 0, TAU); ctx.fill(); ctx.stroke();
      const open = e.state === 'breath' || e.state === 'swoop' ? 3 + Math.sin(t * 20) : 0;
      if (open) { ctx.fillStyle = '#3a1a4a'; ctx.beginPath(); ctx.ellipse(f * 14, 6, 4, open, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = OL; ctx.beginPath(); ctx.arc(f * 15, 1, 0.9, 0, TAU); ctx.fill();
      eyes(ctx, f * 2, -3, f, 4, 2.6, true, '#fff', '#2a6ad6');
      ctx.restore();
    },
  },
  baron: {
    name: 'The Burnt Baron', title: 'Lord of the Oven', w: 22, h: 32, hp: 420, speed: 60, score: 3000, stomp: 'spiky', flying: true, noclip: true, heavy: true, boss: true, crumbs: ['#3a2020', '#ff7a3d', '#ffd34d'],
    ai(e, w, dt) {
      const p = w.nearestPlayer(e.x, e.y);
      const hpF = bossPhase(e);
      const phase = hpF > 0.6 ? 1 : hpF > 0.3 ? 2 : 3;
      if (phase !== e.data.phase) {
        if (e.data.phase) { setState(e, 'phase'); w.esfx('roar', e.x); w.fxEvent('shake', e.x, e.y, 0.6); }
        e.data.phase = phase;
      }
      e.data.home = e.data.home || { x: W / 2 - e.w / 2, y: 50 };
      const hover = () => {
        const hx = e.data.home.x + Math.sin(w.time * 0.8) * 30, hy = e.data.home.y + Math.sin(w.time * 1.7) * 8;
        e.vx += ((hx - e.x) * 3 - e.vx) * dt * 3; e.vy += ((hy - e.y) * 3 - e.vy) * dt * 3;
      };
      const sx = e.x + e.w / 2, sy = e.y + e.h / 2;
      const shoot = (a, s, kind = 'bullet') => w.enemyShoot(e, { kind, x: sx, y: sy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 3.5, life: 6, noclip: true });
      if (p) faceToward(e, p);
      switch (e.state) {
        case 'intro': case 'walk':
          hover();
          if (e.st > 2) setState(e, 'idle');
          break;
        case 'phase':
          e.vx *= 0.9; e.vy *= 0.9; e.armored = true;
          if (e.st > 1.2) {
            e.armored = false;
            for (let i = 0; i < 24; i++) shoot((i / 24) * TAU, 90);
            setState(e, 'idle');
          }
          break;
        case 'idle': {
          hover();
          if (e.st > (phase === 1 ? 1.1 : phase === 2 ? 0.8 : 0.55)) {
            const opts = ['aimed', 'ring', 'spiral', 'teleport'];
            if (phase >= 2) opts.push('rain', 'summon');
            if (phase >= 3) opts.push('spiral', 'ring');
            let pickS = pick(opts);
            if (pickS === e.data.last) pickS = pick(opts);
            e.data.last = pickS;
            setState(e, pickS);
            e.data.n = 0; e.data.k = 0;
          }
          break;
        }
        case 'aimed':
          hover();
          if (e.st > 0.35 + e.data.n * 0.4 && e.data.n < 3 + (phase > 1 ? 1 : 0)) {
            e.data.n++;
            const tp = pick(w.alivePlayers()) || p;
            if (tp) {
              const a = Math.atan2(tp.y + tp.h / 2 - sy, wrapDx(sx, tp.x + tp.w / 2));
              const spread = phase === 3 ? 5 : 3;
              for (let i = 0; i < spread; i++) shoot(a + (i - (spread - 1) / 2) * 0.18, 125);
              w.esfx('eshoot', e.x);
            }
          }
          if (e.st > 2.2) setState(e, 'idle');
          break;
        case 'ring':
          e.vx *= 0.9; e.vy *= 0.9;
          if (e.st > 0.5 + e.data.n * 0.55 && e.data.n < (phase === 1 ? 2 : 3)) {
            const n = phase === 1 ? 14 : 18;
            const off = e.data.n * 0.5;
            for (let i = 0; i < n; i++) shoot((i / n) * TAU + off, phase === 3 ? 105 : 90);
            e.data.n++;
            w.esfx('eshoot', e.x, 0.7);
          }
          if (e.st > 2.4) setState(e, 'idle');
          break;
        case 'spiral':
          e.vx *= 0.9; e.vy *= 0.9;
          e.data.k = (e.data.k || 0) - dt;
          if (e.st > 0.4 && e.st < 3 && e.data.k <= 0) {
            e.data.k = phase === 3 ? 0.07 : 0.09;
            const a = e.st * 3.2;
            shoot(a, 95);
            if (phase >= 2) shoot(a + Math.PI, 95);
            if (phase === 3) { shoot(-a + Math.PI / 2, 80, 'bullet2'); }
          }
          if (e.st > 3.3) setState(e, 'idle');
          break;
        case 'rain':
          hover();
          if (e.st > 0.3 && !e.data.rained) {
            e.data.rained = true;
            const gap = Math.floor(rand(2, 13));
            for (let i = 0; i < 16; i++) {
              if (Math.abs(i - gap) <= 1) continue;
              w.enemyShoot(e, { kind: 'bullet2', x: 16 + i * 30, y: -6, vx: 0, vy: 70 + (i % 2) * 15, r: 3.5, life: 6, noclip: true, delay: 0.5 });
            }
          }
          if (e.st > 2.5) { e.data.rained = false; setState(e, 'idle'); }
          break;
        case 'summon':
          hover();
          if (e.st > 0.4 && !e.data.sum) {
            e.data.sum = true;
            w.esfx('roar', e.x);
            for (let i = 0; i < 2; i++) w.spawnEnemyAt('imp', sx + (i ? 40 : -40), sy, { vx: (i ? 1 : -1) * 120, vy: -200 });
          }
          if (e.st > 1.5) { e.data.sum = false; setState(e, 'idle'); }
          break;
        case 'teleport':
          e.vx *= 0.8; e.vy *= 0.8;
          if (e.st < 0.05) {
            e.data.dest = { x: rand(60, W - 80), y: rand(30, 110) };
            w.fxEvent('teleTel', e.data.dest.x + e.w / 2, e.data.dest.y + e.h / 2, 0.7);
            w.esfx('teleport', e.x);
          }
          e.armored = e.st > 0.3 && e.st < 0.75;
          if (e.st > 0.7 && !e.data.tp) {
            e.data.tp = true;
            e.x = e.data.dest.x; e.y = e.data.dest.y; e.data.home = { ...e.data.dest };
            w.fxEvent('poof', sx, sy, 20);
            for (let i = 0; i < 10; i++) shoot((i / 10) * TAU, 80);
          }
          if (e.st > 1.1) { e.data.tp = false; e.armored = false; setState(e, 'idle'); }
          break;
        default: setState(e, 'idle');
      }
      e.x = clamp(e.x, 10, W - e.w - 10);
      e.y = clamp(e.y, 10, H - 100);
    },
    draw(ctx, e, t) {
      ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h);
      if (e.state === 'teleport') ctx.globalAlpha *= e.st < 0.7 ? Math.max(0.1, 1 - e.st / 0.5) : Math.min(1, (e.st - 0.7) / 0.3);
      const f = e.facing;
      ctx.strokeStyle = OL; ctx.lineWidth = 1.6;
      // flames under
      for (let i = 0; i < 5; i++) {
        const fx = (i - 2) * 4, fl = Math.sin(t * 20 + i * 2) * 3;
        ctx.fillStyle = i % 2 ? '#ffb347' : '#ff5a2a';
        ctx.beginPath(); ctx.moveTo(fx - 3, -2); ctx.quadraticCurveTo(fx, 10 + fl, fx + 3, -2); ctx.fill();
      }
      // cape
      ctx.fillStyle = '#5a0f1a';
      ctx.beginPath(); ctx.moveTo(-10, -26); ctx.quadraticCurveTo(-f * 18, -10, -f * 14 + Math.sin(t * 4) * 2, 2); ctx.lineTo(f * 6, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
      // body: burnt croissant-ish
      const g = ctx.createLinearGradient(0, -30, 0, 0);
      g.addColorStop(0, '#5a3a30'); g.addColorStop(1, '#2a1a18');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -13, 11, 13, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,120,50,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-6, -20); ctx.lineTo(-2, -14); ctx.lineTo(-5, -8); ctx.moveTo(5, -18); ctx.lineTo(2, -12); ctx.stroke();
      ctx.strokeStyle = OL; ctx.lineWidth = 1.6;
      // eyes glowing
      const ph = e.data?.phase || (e.hp / e.maxHp > 0.6 ? 1 : e.hp / e.maxHp > 0.3 ? 2 : 3);
      ctx.fillStyle = ph === 3 ? '#ff2a2a' : '#ffb347';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.ellipse(f * 2 - 4, -17, 2.4, 1.6, -0.3, 0, TAU); ctx.ellipse(f * 2 + 4, -17, 2.4, 1.6, 0.3, 0, TAU); ctx.fill();
      // mustache
      ctx.fillStyle = '#1a0a0a';
      ctx.beginPath(); ctx.moveTo(f * 2, -12); ctx.quadraticCurveTo(f * 2 - 6, -14, f * 2 - 9, -10); ctx.quadraticCurveTo(f * 2 - 4, -11, f * 2, -11); ctx.quadraticCurveTo(f * 2 + 4, -11, f * 2 + 9, -10); ctx.quadraticCurveTo(f * 2 + 6, -14, f * 2, -12); ctx.fill();
      // charred chef hat
      ctx.fillStyle = '#3a3030';
      ctx.fillRect(-7, -32, 14, 6); ctx.strokeRect(-7, -32, 14, 6);
      ctx.beginPath(); ctx.arc(-5, -34, 4.5, 0, TAU); ctx.arc(0, -38, 5.5, 0, TAU); ctx.arc(5, -34, 4.5, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillRect(-6.5, -35, 13, 5);
      // smoke wisps
      ctx.fillStyle = 'rgba(80,70,70,0.4)';
      for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; ctx.beginPath(); ctx.arc(Math.sin(k * 6 + i) * 4, -42 - k * 16, 2 + k * 4, 0, TAU); ctx.fill(); }
      if (e.armored) { ctx.strokeStyle = 'rgba(255,180,80,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -15, 19, 0, TAU); ctx.stroke(); }
      ctx.restore();
    },
  },
};

export const ALL_ENEMIES = { ...ENEMIES, ...BOSSES };
export const ENEMY_TYPES = Object.keys(ALL_ENEMIES);
export const enemyDef = (t) => ALL_ENEMIES[t];
