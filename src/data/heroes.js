// Hero definitions: stats, kits (attack/special logic) and procedural drawing.
import { TAU, rand, clamp, rrect, star, shade } from '../util.js';
import { sfx } from '../audio.js';

export const OL = '#2b1630';
export const PLAYER_COLORS = ['#ff5a6e', '#4fa8ff', '#5ad67a', '#ffc53d'];
export const PLAYER_NAMES = ['P1', 'P2', 'P3', 'P4'];

// --------------------------------------------------------------- KITS
const knight = {
  update(p, w, dt) {
    const c = p.ctl;
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashDir * 330 * p.mods.speed;
      p.vy = Math.min(p.vy, 20);
      p.invuln = Math.max(p.invuln, 0.05);
      const r = { x: p.x + (p.dashDir > 0 ? p.w - 2 : -14), y: p.y - 4, w: 16, h: p.h + 6 };
      p.meleeTick(r, 4, { kbx: p.dashDir * 300, kby: -140, stun: 0.8, tag: 'dash', heavy: true });
      w.blockEnemyShots(r, p);
      if (Math.random() < 0.6) w.fx.add({ x: p.cx - p.dashDir * 6, y: p.cy + rand(-5, 5), vx: -p.dashDir * 60, vy: 0, life: 0.25, size: 3, color: '#fff3c4', shape: 'smoke' });
      if (p.dashT <= 0) { p.vx *= 0.4; p.hitboxes.length = 0; }
      return;
    }
    if (c.attackP && p.cd.attack <= 0) {
      const dir = p.meleeDir();
      p.comboIdx = p.comboT > 0 ? (p.comboIdx + 1) % 3 : 0;
      p.comboT = 0.55;
      const big = p.comboIdx === 2;
      const dmg = big ? 5 : 3;
      const s = p.mods.size;
      let r;
      if (dir === 'up') r = { x: p.cx - 13 * s, y: p.y - 18 * s, w: 26 * s, h: 22 * s };
      else if (dir === 'down') r = { x: p.cx - 10 * s, y: p.y + p.h - 4, w: 20 * s, h: 20 * s };
      else r = { x: p.facing > 0 ? p.x + p.w - 2 : p.x - 22 * s + 2, y: p.y - 6 * s, w: 22 * s, h: 22 * s };
      p.melee(r, dmg, {
        kbx: dir === 'fwd' ? p.facing * (big ? 260 : 150) : 0, kby: dir === 'up' ? -240 : dir === 'down' ? 120 : -90,
        life: 0.1, pogo: dir === 'down', heavy: big, tag: 'sword',
      });
      p.setSwing(dir, big ? 0.26 : 0.2, big);
      p.cd.attack = (big ? 0.36 : 0.22) / p.mods.atkSpeed;
      if (dir === 'fwd' && p.onGround) p.vx += p.facing * 70;
      sfx(big ? 'swingBig' : 'swing', { pitch: 1 + p.comboIdx * 0.12, pan: w.pan(p.cx) });
    }
    if (c.specialP && p.cd.special <= 0) {
      p.dashT = 0.3;
      p.dashDir = c.x !== 0 ? Math.sign(c.x) : p.facing;
      p.facing = p.dashDir;
      p.useSpecial();
      p.hitboxes.length = 0;
      p.hitSetDash = new Set();
      p.setSwing('dash', 0.3);
      w.fx.shake(0.15);
      sfx('dash', { pan: w.pan(p.cx) });
    }
  },
};

const mage = {
  update(p, w, dt) {
    const c = p.ctl;
    if (c.attackP && p.cd.attack <= 0) {
      const a = p.aimDir(true);
      w.spawnProj(p, { kind: 'bolt', x: p.cx + a.x * 8, y: p.cy - 2 + a.y * 8, vx: a.x * 330, vy: a.y * 330, r: 3.5, life: 0.65, dmg: 2, kb: 60, assist: true });
      p.cd.attack = 0.17 / p.mods.atkSpeed;
      p.setSwing('cast', 0.14);
      sfx('bolt', { pitch: rand(0.9, 1.1), pan: w.pan(p.cx) });
      p.charge = 0; p.charging = true;
    }
    if (p.charging) {
      if (c.attack) {
        const prev = p.charge;
        p.charge += dt / 0.8;
        if (p.charge > 0.25 && Math.floor(prev * 8) !== Math.floor(p.charge * 8) && p.charge < 1) sfx('charge', { pitch: p.charge });
        if (prev < 1 && p.charge >= 1) { sfx('chargeFull'); w.fx.sparkle(p.cx, p.cy - 14, 8, '#ff9b5c'); }
        if (p.charge > 0.3 && Math.random() < 0.5) {
          const ang = rand(TAU);
          w.fx.add({ x: p.cx + Math.cos(ang) * 14, y: p.cy - 10 + Math.sin(ang) * 14, vx: -Math.cos(ang) * 50, vy: -Math.sin(ang) * 50, life: 0.25, size: 1.6, color: p.charge >= 1 ? '#ffb347' : '#d9a6ff', add: true });
        }
      } else {
        if (p.charge >= 1) {
          const a = p.aimDir(true);
          w.spawnProj(p, { kind: 'fireball', x: p.cx + a.x * 10, y: p.cy - 2 + a.y * 10, vx: a.x * 250, vy: a.y * 250, r: 6, life: 1.4, dmg: 3, kb: 120, explode: { r: 34, dmg: 6, burn: 3 }, assist: true });
          p.setSwing('cast', 0.25);
          p.vx -= a.x * 60;
          sfx('fireball', { pan: w.pan(p.cx) });
          w.fx.shake(0.1);
        }
        p.charging = false; p.charge = 0;
      }
    }
    if (c.specialP && p.cd.special <= 0) {
      p.useSpecial();
      const R = 70 * p.mods.size;
      w.areaHit(p, p.cx, p.cy, R, 2, { freeze: 2.6, kby: -60, tag: 'nova' });
      w.blockEnemyShots({ x: p.cx - R, y: p.cy - R, w: R * 2, h: R * 2 }, p, true);
      w.fxEvent('nova', p.cx, p.cy, R);
      p.setSwing('cast', 0.3);
    }
  },
};

const ranger = {
  update(p, w, dt) {
    const c = p.ctl;
    if (c.attackP && p.cd.attack <= 0 && !p.charging) {
      p.charging = true; p.charge = 0; p.perfectFired = false;
    }
    if (p.charging) {
      if (c.attack) {
        const prev = p.charge;
        p.charge += dt / 0.7 * p.mods.atkSpeed;
        if (prev < 1 && p.charge >= 1) { sfx('chargeFull'); w.fx.sparkle(p.cx + p.facing * 8, p.cy - 6, 6, '#fff'); }
        else if (p.charge < 1 && Math.floor(prev * 6) !== Math.floor(p.charge * 6)) sfx('charge', { pitch: p.charge });
      } else {
        const ch = p.charge;
        const a = p.aimDir(true);
        const perfect = ch >= 1 && ch <= 1.28;
        const full = ch >= 1;
        const pw = Math.min(1, ch);
        let dmg = 2 + 5 * pw;
        if (perfect) dmg *= 1.5;
        const sp = 300 + 220 * pw;
        w.spawnProj(p, {
          kind: full ? 'arrowBig' : 'arrow', x: p.cx + a.x * 8, y: p.cy - 3 + a.y * 8, vx: a.x * sp, vy: a.y * sp, g: full ? 60 : 260,
          r: full ? 4 : 3, life: 1.2, dmg, kb: 80 + 140 * pw, pierce: full ? 3 : 0, mark: 4, perfect, assist: true,
        });
        if (perfect) {
          w.fx.text(p.cx, p.y - 14, 'PERFECT!', { color: '#fff36b', size: 9 });
          w.fx.sparkle(p.cx, p.cy, 10, '#fff36b');
          sfx('crit');
          w.stat(p, 'perfectShots');
        }
        sfx(full ? 'arrowBig' : 'arrow', { pan: w.pan(p.cx) });
        p.setSwing('shoot', 0.18);
        p.cd.attack = 0.2 / p.mods.atkSpeed;
        p.charging = false; p.charge = 0;
      }
    }
    if (c.specialP && p.cd.special <= 0) {
      p.useSpecial();
      p.rain = { t: 0, n: 0, cx: p.cx + p.facing * 70, dir: p.facing };
      p.setSwing('shoot', 0.3);
      w.spawnProj(p, { kind: 'arrow', x: p.cx, y: p.cy - 6, vx: p.facing * 40, vy: -460, g: 0, r: 2, life: 0.4, dmg: 0, harmless: true });
      sfx('arrowBig', { pan: w.pan(p.cx) });
    }
    if (p.rain) {
      p.rain.t += dt;
      const total = 14;
      while (p.rain.n < total && p.rain.t > 0.25 + p.rain.n * 0.06) {
        const x = p.rain.cx + rand(-56, 56) * p.mods.size;
        w.spawnProj(p, { kind: 'arrow', x, y: -12, vx: p.rain.dir * 30, vy: 440, g: 200, r: 3, life: 1.2, dmg: 3, kb: 40, mark: 4, rain: true });
        p.rain.n++;
      }
      if (p.rain.n >= total) p.rain = null;
    }
  },
};

const ninja = {
  update(p, w, dt) {
    const c = p.ctl;
    if ((c.attackP || (c.attack && p.holdFire > 0.18)) && p.cd.attack <= 0) {
      const a = p.aimDir(true);
      w.spawnProj(p, { kind: 'shuriken', x: p.cx + a.x * 6, y: p.cy - 3 + a.y * 6, vx: a.x * 400, vy: a.y * 400, r: 3.5, life: 0.55, dmg: 1.6, kb: 50, assist: true });
      p.cd.attack = 0.13 / p.mods.atkSpeed;
      p.setSwing('throw', 0.1);
      sfx('shuriken', { pitch: rand(0.9, 1.2), pan: w.pan(p.cx) });
    }
    p.holdFire = c.attack ? p.holdFire + dt : 0;
    if (c.specialP && p.cd.special <= 0) {
      let dx = c.x, dy = c.y;
      if (!dx && !dy) dx = p.facing;
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      const D = 100 * p.mods.size;
      const sx = p.x, sy = p.y;
      let travelled = 0;
      for (let s = 4; s <= D; s += 4) {
        if (w.rectSolid(p.x + dx * 4, p.y + dy * 4, p.w, p.h)) break;
        p.x += dx * 4; p.y += dy * 4; travelled = s;
      }
      w.wrapEntity(p);
      // damage along the path
      const kills = w.lineHit(p, sx + p.w / 2, sy + p.h / 2, sx + p.w / 2 + dx * travelled, sy + p.h / 2 + dy * travelled, 14, 5, { kbx: dx * 120, kby: -100, tag: 'step' });
      p.useSpecial();
      if (kills > 0) { p.cd.special = 0.05; w.fx.text(p.cx, p.y - 14, 'RESET!', { color: '#c9a6ff', size: 8 }); }
      p.invuln = Math.max(p.invuln, 0.3);
      p.vx = dx * 120; p.vy = dy < -0.3 ? -200 : Math.min(p.vy, 0);
      p.airJumps = Math.max(p.airJumps, 1);
      w.fxEvent('step', sx + p.w / 2, sy + p.h / 2, 0, { x2: p.cx, y2: p.cy });
      p.setSwing('dash', 0.2);
    }
  },
};

const alchemist = {
  update(p, w, dt) {
    const c = p.ctl;
    if (c.attackP && p.cd.attack <= 0) {
      const up = c.y < -0.5;
      const vx = up ? p.facing * 90 + p.vx * 0.3 : p.facing * 175 + p.vx * 0.4;
      const vy = up ? -330 : -190;
      w.spawnProj(p, { kind: 'potion', x: p.cx + p.facing * 6, y: p.cy - 8, vx, vy, g: 650, r: 4, life: 2, dmg: 2, kb: 60, explode: { r: 26, dmg: 3, slow: 2.5 }, hue: Math.floor(rand(3)) });
      p.cd.attack = 0.4 / p.mods.atkSpeed;
      p.setSwing('throw', 0.18);
      sfx('throw', { pan: w.pan(p.cx) });
    }
    if (c.specialP && p.cd.special <= 0) {
      p.useSpecial();
      const down = c.y > 0.5;
      w.spawnProj(p, { kind: 'brew', x: p.cx, y: p.cy - 8, vx: down ? 0 : p.facing * 120, vy: down ? 100 : -220, g: 650, r: 5, life: 3, dmg: 0, zone: { kind: 'heal', r: 44, life: 5 } });
      p.setSwing('throw', 0.25);
      sfx('throw', { pitch: 0.8, pan: w.pan(p.cx) });
    }
  },
};

const gunner = {
  update(p, w, dt) {
    const c = p.ctl;
    if (c.attackP && p.cd.attack <= 0) {
      const a = p.aimDir(true);
      const base = Math.atan2(a.y, a.x);
      for (let i = 0; i < 6; i++) {
        const ang = base + rand(-0.26, 0.26);
        const sp = rand(380, 460);
        w.spawnProj(p, { kind: 'pellet', x: p.cx + a.x * 10, y: p.cy - 3 + a.y * 10, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 2.5, life: rand(0.17, 0.23), dmg: 1.3, kb: 70, multiHitGroup: true });
      }
      // recoil = mobility (rocket-jump skill)
      if (!p.onGround && a.y > 0.5) { p.vy = Math.min(p.vy, -310); p.launch = true; p.jumpCut = false; }
      else if (!p.onGround && a.y < -0.5) p.vy += 160;
      else p.vx -= a.x * (p.onGround ? 110 : 190);
      p.cd.attack = 0.48 / p.mods.atkSpeed;
      p.setSwing('shoot', 0.16);
      w.fx.flash(p.cx + a.x * 16, p.cy - 3 + a.y * 16, 18, '#ffcf70', 0.08);
      w.fx.burst(p.cx + a.x * 14, p.cy - 3 + a.y * 14, 6, { colors: ['#ffe08a', '#ff8a3d'], speed: [60, 160], angle: base, spread: 0.5, life: [0.1, 0.25], g: 0, add: true });
      w.fx.shake(0.12);
      sfx('shotgun', { pan: w.pan(p.cx) });
    }
    if (c.specialP && p.cd.special <= 0) {
      p.useSpecial();
      w.spawnProj(p, { kind: 'chili', x: p.cx + p.facing * 6, y: p.cy - 8, vx: p.facing * 160 + p.vx * 0.4, vy: -230, g: 600, r: 4, life: 0.85, dmg: 0, bounce: 2, fuse: true, explode: { r: 50, dmg: 8, burn: 2, launch: true } });
      p.setSwing('throw', 0.2);
      sfx('throw', { pan: w.pan(p.cx) });
    }
  },
};

// --------------------------------------------------------------- DEFINITIONS
export const HEROES = [
  {
    id: 'knight', name: 'Sir Brioche', role: 'Knight', color: '#f2b45a', hp: 5, speed: 112, airJumps: 1,
    special: 'Shield Charge', specialCd: 5, kit: knight, difficulty: 1,
    desc: 'A sturdy bun with a big sword. 3-hit combos, downward pogo strikes in the air, and a shield charge that blocks projectiles.',
    attackDesc: 'Sword combo (aim up / down in air to pogo)', specialDesc: 'Charge forward, invulnerable, blocking shots',
  },
  {
    id: 'mage', name: 'Mira Macaron', role: 'Mage', color: '#ff9ad5', hp: 3, speed: 116, airJumps: 1,
    special: 'Frost Nova', specialCd: 7, kit: mage, difficulty: 2,
    desc: 'Rapid magic bolts, or hold to charge an explosive fireball. Frost Nova freezes nearby foes — frozen enemies shatter for bonus damage!',
    attackDesc: 'Tap: bolt · Hold: fireball', specialDesc: 'Freeze all nearby enemies',
  },
  {
    id: 'ranger', name: 'Cinna Swirl', role: 'Ranger', color: '#e8b47a', hp: 3, speed: 120, airJumps: 1,
    special: 'Arrow Rain', specialCd: 8, kit: ranger, difficulty: 3,
    desc: 'Hold to draw the bow, release for a piercing shot. Release right as it flashes for a PERFECT crit. Arrows mark enemies so the team deals more damage.',
    attackDesc: 'Hold & release (perfect timing = crit)', specialDesc: 'A volley of arrows rains ahead',
  },
  {
    id: 'alchemist', name: 'Dr. Fizz', role: 'Alchemist', color: '#6fe07a', hp: 4, speed: 110, airJumps: 1,
    special: 'Healing Brew', specialCd: 13, kit: alchemist, difficulty: 2,
    desc: 'Lobs sticky potions that splash and slow. The Healing Brew creates a cloud that heals allies and triples revive speed. The team\'s best friend.',
    attackDesc: 'Lob a slowing potion (hold up to lob high)', specialDesc: 'Heal cloud for the whole team',
  },
  {
    id: 'gunner', name: 'Pepper Jack', role: 'Gunslinger', color: '#ff4d3d', hp: 3, speed: 118, airJumps: 1,
    special: 'Chili Bomb', specialCd: 6, kit: gunner, difficulty: 3, unlock: { world: 1 },
    desc: 'A hot-headed chili with a blunderbuss. Massive close-range damage, and the recoil launches you — shoot down mid-air to fly!',
    attackDesc: 'Shotgun blast (recoil moves you)', specialDesc: 'Bouncing chili bomb, launches you up',
  },
  {
    id: 'ninja', name: 'Mochi', role: 'Ninja', color: '#fff0f5', hp: 3, speed: 140, airJumps: 2, wallJump: true,
    special: 'Shadow Step', specialCd: 2.6, kit: ninja, difficulty: 3, unlock: { world: 2 },
    desc: 'Lightning fast, triple jump and wall jump. Shadow Step teleports through enemies — kill something with it and it recharges instantly.',
    attackDesc: 'Rapid shuriken (hold to auto-fire)', specialDesc: 'Teleport-dash; resets on kill',
  },
];

export const heroById = (id) => HEROES.find((h) => h.id === id) || HEROES[0];

// --------------------------------------------------------------- DRAWING
// o: {facing, t, sx, sy, aimX, aimY, blink, hurt, hat, swing:{kind,t,dur,big}, charge, run, down, flash, onGround, vy}
export function drawHero(ctx, id, x, y, o = {}) {
  const f = o.facing || 1;
  const t = o.t || 0;
  ctx.save();
  ctx.translate(x, y);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  const sx = o.sx || 1, sy = o.sy || 1;
  ctx.scale(sx, sy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = OL;
  const bob = o.run ? Math.abs(Math.sin(o.run * 12)) * -1.2 : Math.sin(t * 3) * 0.4;
  const feetPhase = o.run ? Math.sin(o.run * 12) : 0;
  const def = DRAW[id] || DRAW.knight;
  // back items
  def.back?.(ctx, f, t, o);
  // feet
  if (!o.down) {
    ctx.fillStyle = def.feet || '#4a2a3a';
    const fy = -1.5;
    ctx.beginPath(); ctx.ellipse(-3.5 + feetPhase * 2.5 * f, fy + (feetPhase > 0 ? -1 : 0), 3, 2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(3.5 - feetPhase * 2.5 * f, fy + (feetPhase < 0 ? -1 : 0), 3, 2, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.translate(0, bob);
  def.body(ctx, f, t, o);
  drawFace(ctx, f, t, o, def.eyeY ?? -8, def.eyeColor);
  if (o.hat && o.hat !== 'none') drawHat(ctx, o.hat, 0, def.headTop ?? -16, f, t);
  else def.head?.(ctx, f, t, o);
  def.weapon?.(ctx, f, t, o);
  if (o.flash > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${o.flash})`;
    ctx.fillRect(-20, -34, 40, 40);
  }
  ctx.restore();
}

function drawFace(ctx, f, t, o, ey, eyeColor = '#fff') {
  const ex = f * 1.6;
  const ax = (o.aimX ?? f) * 0.9, ay = (o.aimY ?? 0) * 0.9;
  const blink = o.blink;
  ctx.save();
  if (o.hurt || o.down) {
    ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
    for (const s of [-1, 1]) {
      const cx = ex + s * 3.2;
      ctx.beginPath(); ctx.moveTo(cx - 1.4, ey - 1.4); ctx.lineTo(cx + 1.4, ey + 1.4); ctx.moveTo(cx + 1.4, ey - 1.4); ctx.lineTo(cx - 1.4, ey + 1.4); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(ex, ey + 4, 1.5, 1.2, 0, 0, TAU); ctx.fillStyle = OL; ctx.fill();
  } else {
    for (const s of [-1, 1]) {
      const cx = ex + s * 3.2;
      ctx.fillStyle = eyeColor;
      ctx.beginPath(); ctx.ellipse(cx, ey, 2.3, blink ? 0.4 : 2.7, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = 0.9; ctx.stroke();
      if (!blink) {
        ctx.fillStyle = OL;
        ctx.beginPath(); ctx.ellipse(cx + ax, ey + ay + 0.2, 1.25, 1.6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx + ax - 0.5, ey + ay - 0.6, 0.5, 0, TAU); ctx.fill();
      }
    }
    // mouth
    ctx.strokeStyle = OL; ctx.lineWidth = 0.9;
    ctx.beginPath();
    if (o.swing && o.swing.t < o.swing.dur) { ctx.ellipse(ex, ey + 4.2, 1.4, 1.1, 0, 0, TAU); ctx.fillStyle = '#7a2a3a'; ctx.fill(); ctx.stroke(); }
    else { ctx.arc(ex, ey + 3, 1.6, 0.2, Math.PI - 0.2); ctx.stroke(); }
    // cheeks
    ctx.fillStyle = 'rgba(255,110,140,0.35)';
    ctx.beginPath(); ctx.ellipse(ex - 5.5, ey + 2.6, 1.6, 1, 0, 0, TAU); ctx.ellipse(ex + 5.5, ey + 2.6, 1.6, 1, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function swingAngle(o, f) {
  // returns weapon angle in radians for melee swings
  const s = o.swing;
  if (!s || s.t >= s.dur) return null;
  const k = clamp(s.t / s.dur, 0, 1);
  const e = 1 - Math.pow(1 - k, 3);
  if (s.kind === 'up') return -Math.PI / 2 + (f > 0 ? 1 : -1) * (1.6 - e * 3.2);
  if (s.kind === 'down') return Math.PI / 2 + (f > 0 ? -1 : 1) * (1.4 - e * 2.8);
  if (s.kind === 'fwd') return f > 0 ? -1.9 + e * 2.9 : Math.PI + 1.9 - e * 2.9;
  return null;
}

function drawSwingArc(ctx, o, f, cx, cy, R, color) {
  const s = o.swing;
  if (!s || s.t >= s.dur || !['up', 'down', 'fwd'].includes(s.kind)) return;
  const k = s.t / s.dur;
  const a = swingAngle(o, f);
  const span = 1.6;
  const dirSign = s.kind === 'fwd' ? (f > 0 ? 1 : -1) : s.kind === 'up' ? (f > 0 ? -1 : 1) : (f > 0 ? 1 : -1);
  ctx.save();
  ctx.globalAlpha = (1 - k) * 0.85;
  ctx.fillStyle = color;
  ctx.beginPath();
  const a0 = a - dirSign * span, a1 = a;
  ctx.arc(cx, cy, R * (s.big ? 1.25 : 1), a0, a1, dirSign < 0);
  ctx.arc(cx, cy, R * 0.45, a1, a0, dirSign > 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const DRAW = {
  knight: {
    headTop: -16,
    back(ctx, f) {
      // shield on back
      ctx.save();
      ctx.translate(-f * 7, -8);
      ctx.fillStyle = '#5a8fd6';
      ctx.beginPath(); ctx.ellipse(0, 0, 4, 5.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.ellipse(0, 0, 1.5, 2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
    body(ctx, f, t, o) {
      const g = ctx.createLinearGradient(0, -16, 0, 0);
      g.addColorStop(0, '#f6c46a'); g.addColorStop(1, '#c97a32');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -7.5, 8.5, 7.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,200,0.6)';
      ctx.beginPath(); ctx.ellipse(-3, -12, 3, 1.5, -0.4, 0, TAU); ctx.fill();
      // little chestplate
      ctx.fillStyle = '#cfd8e6';
      ctx.beginPath(); ctx.moveTo(-5, -3.5); ctx.lineTo(5, -3.5); ctx.lineTo(4, 0); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill(); ctx.lineWidth = 0.9; ctx.stroke();
    },
    head(ctx, f, t) {
      ctx.lineWidth = 1.2;
      ctx.fillStyle = '#d5dde9';
      ctx.beginPath(); ctx.arc(0, -11, 7.4, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a9b6c9';
      ctx.fillRect(-6.5, -12.5, 13, 1.6);
      // plume
      ctx.fillStyle = '#ff4d6a';
      const w = Math.sin(t * 6) * 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.quadraticCurveTo(-f * 6, -24 + w, -f * 11, -19 + w);
      ctx.quadraticCurveTo(-f * 6, -20, 0, -16.5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    },
    weapon(ctx, f, t, o) {
      drawSwingArc(ctx, o, f, 0, -7, 20, 'rgba(255,255,255,0.9)');
      if (o.swing?.kind === 'dash' && o.swing.t < o.swing.dur) {
        // shield forward
        ctx.save(); ctx.translate(f * 9, -8);
        ctx.fillStyle = '#5a8fd6'; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd34d'; ctx.beginPath(); star(ctx, 0, 0, 3, 1.4); ctx.fill();
        ctx.restore();
        return;
      }
      let a = swingAngle(o, f);
      if (a === null) a = f > 0 ? -1.1 : Math.PI + 1.1;
      ctx.save();
      ctx.translate(f * 6, -6);
      ctx.rotate(a);
      ctx.fillStyle = '#eef3fa';
      ctx.beginPath(); ctx.moveTo(2, -1.6); ctx.lineTo(15, -1.2); ctx.lineTo(17.5, 0); ctx.lineTo(15, 1.2); ctx.lineTo(2, 1.6); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(0.5, -3.2, 2, 6.4); ctx.strokeRect(0.5, -3.2, 2, 6.4);
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(-3, -1, 3.5, 2);
      ctx.restore();
      // hand
      ctx.fillStyle = '#e8a55a';
      ctx.beginPath(); ctx.arc(f * 6, -6, 2, 0, TAU); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
    },
  },
  mage: {
    headTop: -17, eyeY: -12.5,
    body(ctx, f, t, o) {
      ctx.lineWidth = 1.2;
      // bottom shell
      ctx.fillStyle = '#ff8cc9';
      rrect(ctx, -8.5, -7, 17, 7, 3.5); ctx.fill(); ctx.stroke();
      // filling
      ctx.fillStyle = '#fff4e0';
      rrect(ctx, -8, -9.5, 16, 3.5, 1.5); ctx.fill(); ctx.stroke();
      // top shell
      const g = ctx.createLinearGradient(0, -18, 0, -9);
      g.addColorStop(0, '#ffb6dd'); g.addColorStop(1, '#ff86c4');
      ctx.fillStyle = g;
      rrect(ctx, -9, -18, 18, 9, 4.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(-4, -16, 3, 1.2, -0.2, 0, TAU); ctx.fill();
      // ruffle feet
      ctx.strokeStyle = 'rgba(160,40,100,0.5)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); for (let i = -7; i <= 7; i += 2) { ctx.moveTo(i, -9); ctx.lineTo(i + 1, -8); } ctx.stroke();
      ctx.strokeStyle = OL;
    },
    head(ctx, f, t) {
      ctx.lineWidth = 1.2;
      ctx.fillStyle = '#6b4bd6';
      const tipX = -f * 6 + Math.sin(t * 2) * 1;
      ctx.beginPath();
      ctx.moveTo(-9, -17);
      ctx.quadraticCurveTo(-2, -22, tipX, -31);
      ctx.quadraticCurveTo(3, -22, 9, -17);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(-7.5, -19.5, 15, 2.4);
      star(ctx, f * 1, -24, 2.4, 1); ctx.fill();
      // brim
      ctx.fillStyle = '#5a3cc0';
      ctx.beginPath(); ctx.ellipse(0, -17, 11, 2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    },
    weapon(ctx, f, t, o) {
      const cast = o.swing && o.swing.t < o.swing.dur;
      const lean = cast ? f * 3 : 0;
      ctx.save();
      ctx.translate(f * 9, -2);
      ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(lean, -18); ctx.stroke();
      const ch = o.charge || 0;
      const orbR = 2.8 + Math.min(1, ch) * 2.5;
      const col = ch >= 1 ? '#ff8a3d' : ch > 0.25 ? '#ffb0f0' : '#b98aff';
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(lean, -20, orbR + 2.5 + Math.sin(t * 10) * 0.6, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(lean, -20, orbR, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(lean - 0.8, -21, 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    },
  },
  ranger: {
    headTop: -16,
    body(ctx, f, t, o) {
      const g = ctx.createRadialGradient(-2, -10, 1, 0, -8, 10);
      g.addColorStop(0, '#f6cf9a'); g.addColorStop(1, '#d99a5c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -8, 8.5, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      // cinnamon swirl
      ctx.strokeStyle = '#9a5a2a'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let a = 0; a < TAU * 2.2; a += 0.2) {
        const r = 0.6 + a * 0.5;
        const px = Math.cos(a * f + 1) * r, py = -8 + Math.sin(a * f + 1) * r * 0.9;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = OL;
      // icing drizzle
      ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-6, -3); ctx.quadraticCurveTo(-2, -6, 1, -2); ctx.quadraticCurveTo(4, 1, 6, -3); ctx.stroke();
      ctx.strokeStyle = OL;
    },
    head(ctx, f, t) {
      ctx.lineWidth = 1.2;
      ctx.fillStyle = '#3fa45a';
      ctx.beginPath();
      ctx.moveTo(-8.4, -9);
      ctx.quadraticCurveTo(-8, -18, 0, -17.5);
      ctx.quadraticCurveTo(7, -17.5, 8.4, -9);
      ctx.quadraticCurveTo(4, -14, 0, -13.5);
      ctx.quadraticCurveTo(-4, -14, -8.4, -9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // hood tip
      ctx.beginPath();
      ctx.moveTo(-f * 4, -17); ctx.quadraticCurveTo(-f * 10, -19, -f * 13, -13 + Math.sin(t * 4) * 0.8); ctx.quadraticCurveTo(-f * 9, -15, -f * 6, -14);
      ctx.fill(); ctx.stroke();
      // feather
      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath(); ctx.ellipse(f * 4, -19, 1.4, 4, f * 0.6, 0, TAU); ctx.fill(); ctx.lineWidth = 0.8; ctx.stroke();
    },
    weapon(ctx, f, t, o) {
      const ch = Math.min(1.3, o.charge || 0);
      const aimx = o.aimX ?? f, aimy = o.aimY ?? 0;
      const ang = Math.atan2(aimy, aimx);
      ctx.save();
      ctx.translate(f * 3, -7);
      ctx.rotate(ang);
      ctx.translate(7, 0);
      // bow
      ctx.strokeStyle = '#8a4a1f'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(-3, 0, 9, -1.1, 1.1); ctx.stroke();
      const pull = ch * 5;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(-3 + Math.cos(-1.1) * 9, Math.sin(-1.1) * 9); ctx.lineTo(-pull, 0); ctx.lineTo(-3 + Math.cos(1.1) * 9, Math.sin(1.1) * 9); ctx.stroke();
      if (ch > 0) {
        const perfect = ch >= 1 && ch <= 1.28;
        ctx.strokeStyle = perfect ? '#fff36b' : '#e8d8c0'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-pull, 0); ctx.lineTo(10 - pull, 0); ctx.stroke();
        ctx.fillStyle = perfect ? '#fff36b' : '#cfd8e6';
        ctx.beginPath(); ctx.moveTo(12 - pull, 0); ctx.lineTo(9 - pull, -1.8); ctx.lineTo(9 - pull, 1.8); ctx.closePath(); ctx.fill();
        if (perfect) {
          ctx.globalAlpha = 0.5 + Math.sin(t * 40) * 0.3;
          ctx.fillStyle = '#fff36b';
          ctx.beginPath(); ctx.arc(10 - pull, 0, 4, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
  },
  ninja: {
    headTop: -15, eyeY: -8,
    back(ctx, f, t) {
      // headband tails
      ctx.strokeStyle = '#ff3d5a'; ctx.lineWidth = 2;
      const w1 = Math.sin(t * 10) * 2, w2 = Math.sin(t * 10 + 1) * 2;
      ctx.beginPath(); ctx.moveTo(-f * 6, -12); ctx.quadraticCurveTo(-f * 12, -14 + w1, -f * 17, -11 + w2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-f * 6, -12); ctx.quadraticCurveTo(-f * 11, -10 + w2, -f * 15, -6 + w1); ctx.stroke();
      ctx.strokeStyle = OL; ctx.lineWidth = 1.3;
    },
    body(ctx, f, t, o) {
      const g = ctx.createLinearGradient(0, -16, 0, 0);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffd6e6');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-9, -2);
      ctx.bezierCurveTo(-10, -12, -6, -15.5, 0, -15.5);
      ctx.bezierCurveTo(6, -15.5, 10, -12, 9, -2);
      ctx.quadraticCurveTo(0, 1, -9, -2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // mask band
      ctx.fillStyle = '#2b2440';
      ctx.beginPath(); ctx.moveTo(-9.3, -11); ctx.lineTo(9.3, -11); ctx.lineTo(9.6, -5.5); ctx.lineTo(-9.6, -5.5); ctx.closePath(); ctx.fill();
      // scarf
      ctx.fillStyle = '#3a3358';
      ctx.beginPath(); ctx.ellipse(0, -2.5, 8, 2, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 0.9; ctx.stroke();
    },
    head(ctx, f) {
      ctx.fillStyle = '#ff3d5a';
      ctx.fillRect(-8, -14, 16, 2.6);
      ctx.fillStyle = '#d9d9e6';
      ctx.fillRect(-2, -13.8, 4, 2.2);
    },
    weapon(ctx, f, t, o) {
      if (o.swing && o.swing.t < o.swing.dur && o.swing.kind === 'throw') {
        ctx.save(); ctx.translate(f * 10, -8); ctx.rotate(t * 30);
        ctx.fillStyle = '#c8d0dc'; star(ctx, 0, 0, 3.5, 1.2, 4); ctx.fill(); ctx.lineWidth = 0.7; ctx.stroke();
        ctx.restore();
      }
    },
    eyeColor: '#ffffff',
  },
  alchemist: {
    headTop: -18,
    body(ctx, f, t, o) {
      ctx.lineWidth = 1.2;
      const g = ctx.createLinearGradient(0, -18, 0, 0);
      g.addColorStop(0, 'rgba(140,240,140,0.95)'); g.addColorStop(1, 'rgba(60,190,90,0.95)');
      ctx.fillStyle = g;
      // ears
      ctx.beginPath(); ctx.arc(-6, -15, 3, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(6, -15, 3, 0, TAU); ctx.fill(); ctx.stroke();
      rrect(ctx, -8.5, -16, 17, 16, 6.5); ctx.fill(); ctx.stroke();
      // belly
      ctx.fillStyle = 'rgba(220,255,210,0.55)';
      ctx.beginPath(); ctx.ellipse(0, -4, 5, 3.6, 0, 0, TAU); ctx.fill();
      // gloss
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.ellipse(-4.5, -12, 1.5, 3, 0.3, 0, TAU); ctx.fill();
      // lab coat collar
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-3, -1); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill(); ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(3, -1); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    },
    head(ctx, f) {
      // goggles on forehead
      ctx.fillStyle = '#5a3a2a';
      ctx.fillRect(-8.5, -15, 17, 2);
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#ffb347';
        ctx.beginPath(); ctx.arc(f * 1 + s * 3.4, -14, 2.8, 0, TAU); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(f * 1 + s * 3.4 - 0.8, -14.8, 0.9, 0, TAU); ctx.fill();
      }
    },
    weapon(ctx, f, t, o) {
      ctx.save();
      const throwing = o.swing && o.swing.t < o.swing.dur;
      ctx.translate(f * (throwing ? 9 : 8), throwing ? -14 : -5);
      ctx.fillStyle = 'rgba(220,240,255,0.8)';
      ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#c45cff';
      ctx.beginPath(); ctx.arc(0, 0.6, 2.4, 0, Math.PI); ctx.fill();
      ctx.fillStyle = 'rgba(220,240,255,0.8)';
      ctx.fillRect(-1, -5.5, 2, 3); ctx.strokeRect(-1, -5.5, 2, 3);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(Math.sin(t * 5) * 1, -6.5 - ((t * 8) % 4), 0.8, 0, TAU); ctx.fill();
      ctx.restore();
    },
  },
  gunner: {
    headTop: -19, eyeY: -9,
    body(ctx, f, t, o) {
      ctx.lineWidth = 1.2;
      const g = ctx.createLinearGradient(-6, -18, 6, 0);
      g.addColorStop(0, '#ff7a5a'); g.addColorStop(1, '#d42a1f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.bezierCurveTo(9, -18, 9, -8, 7, -4);
      ctx.bezierCurveTo(5, 0, 2, 0.5, f * 3, 0.5);
      ctx.bezierCurveTo(-4, 0.5, -8, -2, -8, -8);
      ctx.bezierCurveTo(-8.5, -15, -5, -18, 0, -18);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,200,0.6)';
      ctx.beginPath(); ctx.ellipse(-4, -13, 1.5, 3.5, 0.3, 0, TAU); ctx.fill();
      // bandana
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.moveTo(-7, -3.5); ctx.lineTo(7, -3.5); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill(); ctx.lineWidth = 0.8; ctx.stroke();
    },
    head(ctx, f, t) {
      ctx.lineWidth = 1.2;
      // stem
      ctx.strokeStyle = '#3a8a3a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(-f * 2, -23, f * 2, -25); ctx.stroke();
      ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
      // cowboy hat
      ctx.fillStyle = '#9a6a3a';
      ctx.beginPath(); ctx.ellipse(0, -18, 11, 2.4, -f * 0.08, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, -18.5); ctx.quadraticCurveTo(-6, -25, -2, -25); ctx.quadraticCurveTo(0, -23.5, 2, -25); ctx.quadraticCurveTo(6, -25, 6, -18.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-6, -20.5, 12, 1.8);
    },
    weapon(ctx, f, t, o) {
      const aimx = o.aimX ?? f, aimy = o.aimY ?? 0;
      const ang = Math.atan2(aimy, aimx);
      const kick = o.swing && o.swing.kind === 'shoot' && o.swing.t < o.swing.dur ? (1 - o.swing.t / o.swing.dur) * 4 : 0;
      ctx.save();
      ctx.translate(f * 4, -6);
      ctx.rotate(ang);
      ctx.translate(-kick, 0);
      if (Math.abs(ang) > Math.PI / 2) ctx.scale(1, -1);
      ctx.fillStyle = '#7a4a2a';
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(2, -1.5); ctx.lineTo(2, 2); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#5a5f6e';
      ctx.beginPath(); ctx.moveTo(1, -2); ctx.lineTo(13, -2.5); ctx.lineTo(15, -4); ctx.lineTo(15, 3); ctx.lineTo(13, 1.5); ctx.lineTo(1, 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd34d'; ctx.fillRect(4, -2.2, 1.5, 3.8);
      ctx.restore();
    },
  },
};

// --------------------------------------------------------------- HATS
export const HATS = [
  { id: 'none', name: 'Classic', cost: 0 },
  { id: 'party', name: 'Party Hat', cost: 40 },
  { id: 'flower', name: 'Daisy', cost: 40 },
  { id: 'cherry', name: 'Cherry On Top', cost: 60 },
  { id: 'chef', name: 'Chef\'s Toque', cost: 80 },
  { id: 'beret', name: 'Beret', cost: 80 },
  { id: 'bunny', name: 'Bunny Ears', cost: 100 },
  { id: 'tophat', name: 'Top Hat', cost: 120 },
  { id: 'propeller', name: 'Propeller Cap', cost: 140 },
  { id: 'horns', name: 'Viking Horns', cost: 160 },
  { id: 'pirate', name: 'Pirate Hat', cost: 180 },
  { id: 'halo', name: 'Halo', cost: 220, stars: 20 },
  { id: 'crown', name: 'Golden Crown', cost: 300, stars: 45 },
];

export function drawHat(ctx, id, x, y, f, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = OL;
  switch (id) {
    case 'party': {
      ctx.fillStyle = '#5ad1ff';
      ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(0, -12); ctx.lineTo(6, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5a9e';
      ctx.beginPath(); ctx.moveTo(-4.3, -2); ctx.lineTo(4.3, -2); ctx.lineTo(3.4, 0); ctx.lineTo(-3.4, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(0, -12.5, 2, 0, TAU); ctx.fill(); ctx.stroke();
      break;
    }
    case 'crown': {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(-7, -6); ctx.lineTo(-3.5, -2); ctx.lineTo(0, -8); ctx.lineTo(3.5, -2); ctx.lineTo(7, -6); ctx.lineTo(7, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4d6a'; ctx.beginPath(); ctx.arc(0, -1, 1.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4da6ff'; ctx.beginPath(); ctx.arc(-4, 0, 1, 0, TAU); ctx.arc(4, 0, 1, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-6, -4, 1, 4);
      break;
    }
    case 'chef': {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-5.5, -4, 11, 6); ctx.strokeRect(-5.5, -4, 11, 6);
      ctx.beginPath(); ctx.arc(-4, -6, 3.5, 0, TAU); ctx.arc(0, -8, 4, 0, TAU); ctx.arc(4, -6, 3.5, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillRect(-5, -6, 10, 4);
      break;
    }
    case 'tophat': {
      ctx.fillStyle = '#2b2440';
      ctx.beginPath(); ctx.ellipse(0, 1.5, 9, 2, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillRect(-5.5, -11, 11, 12.5); ctx.strokeRect(-5.5, -11, 11, 12.5);
      ctx.fillStyle = '#ff4d6a'; ctx.fillRect(-5.5, -3, 11, 2.5);
      break;
    }
    case 'flower': {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + t;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(f * 3 + Math.cos(a) * 3, -3 + Math.sin(a) * 3, 2.2, 1.4, a, 0, TAU); ctx.fill(); ctx.lineWidth = 0.6; ctx.stroke();
      }
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(f * 3, -3, 1.8, 0, TAU); ctx.fill(); ctx.stroke();
      break;
    }
    case 'halo': {
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.8 + Math.sin(t * 4) * 0.2;
      ctx.beginPath(); ctx.ellipse(0, -5 + Math.sin(t * 3) * 0.8, 7, 2, 0, 0, TAU); ctx.stroke();
      break;
    }
    case 'horns': {
      ctx.fillStyle = '#9aa6b8';
      ctx.beginPath(); ctx.arc(0, 1, 7, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff6e0';
      ctx.beginPath(); ctx.moveTo(-6, -1); ctx.quadraticCurveTo(-12, -3, -11, -10); ctx.quadraticCurveTo(-8, -5, -4, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, -1); ctx.quadraticCurveTo(12, -3, 11, -10); ctx.quadraticCurveTo(8, -5, 4, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'propeller': {
      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath(); ctx.arc(0, 1, 6.5, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4da6ff';
      ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.arc(0, 1, 6.5, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
      ctx.fillRect(-0.6, -9, 1.2, 4);
      const s = Math.cos(t * 25) * 7;
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.ellipse(0, -9, Math.abs(s), 1.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
      break;
    }
    case 'bunny': {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(-3.5, -7, 2.4, 7, -0.2, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(3.5, -7 + Math.sin(t * 3) * 0.5, 2.4, 7, 0.25, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3d0';
      ctx.beginPath(); ctx.ellipse(-3.5, -7, 1, 4.5, -0.2, 0, TAU); ctx.ellipse(3.5, -7, 1, 4.5, 0.25, 0, TAU); ctx.fill();
      break;
    }
    case 'cherry': {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#3a8a3a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(2, -9, f * 4, -10); ctx.stroke();
      ctx.strokeStyle = OL;
      ctx.fillStyle = '#e8203a'; ctx.beginPath(); ctx.arc(0, -3.5, 3, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-1, -4.5, 0.9, 0, TAU); ctx.fill();
      break;
    }
    case 'beret': {
      ctx.fillStyle = '#d63a5a';
      ctx.beginPath(); ctx.ellipse(-f * 1.5, -1.5, 8.5, 3.5, -f * 0.2, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillRect(-0.6, -6.5, 1.2, 2.5);
      break;
    }
    case 'pirate': {
      ctx.fillStyle = '#2b2440';
      ctx.beginPath(); ctx.moveTo(-10, 1); ctx.quadraticCurveTo(0, -12, 10, 1); ctx.quadraticCurveTo(0, -2, -10, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -3.5, 1.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-8, -0.5); ctx.quadraticCurveTo(0, -3, 8, -0.5); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// Draw a hero portrait into a 2D canvas (for UI)
export function heroPortrait(canvas, id, hat = 'none', opts = {}) {
  const c = canvas.getContext('2d');
  const s = canvas.width / 40;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.save();
  c.scale(s, s);
  if (opts.bg !== false) {
    const g = c.createRadialGradient(20, 22, 2, 20, 22, 22);
    g.addColorStop(0, shade(heroById(id).color, 0.5));
    g.addColorStop(1, shade(heroById(id).color, -0.1));
    c.fillStyle = g;
    c.beginPath(); c.arc(20, 20, 19, 0, TAU); c.fill();
  }
  drawHero(c, id, 20, 33, { facing: 1, t: opts.t || 0, hat, aimX: 0.4, aimY: 0.2 });
  c.restore();
}
