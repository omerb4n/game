// Player: local simulation (movement feel, attacks, damage) + remote puppet representation.
import { heroById, PLAYER_COLORS } from '../data/heroes.js';
import { computeMods } from '../data/perks.js';
import { clamp, approach, W, H, rand, TAU, round1 } from '../util.js';
import { sfx } from '../audio.js';
import { settings } from '../save.js';

// Jump arc: gentle rise while jump is held, stronger gravity after an early release (smooth short
// hops instead of an abrupt velocity cut), a soft apex, and a moderate fall.
const GRAV_UP = 950, GRAV_CUT = 2500, GRAV_DOWN = 1350, MAX_FALL = 410, FAST_FALL = 540;
const JUMP_V = 372, AIR_JUMP_V = 335;
const COYOTE = 0.12, BUFFER = 0.15;
const REVIVE_TIME = 1.0;

export class Player {
  constructor(info, world) {
    this.w_ = world;
    this.id = info.id;
    this.peer = info.peer;
    this.slot = info.slot;
    this.name = info.name || `P${info.id + 1}`;
    this.hero = heroById(info.hero);
    this.hat = info.hat || 'none';
    this.local = !!info.local;
    this.present = true;
    this.ctl = info.ctl || null;
    this.color = PLAYER_COLORS[info.id % 4];
    this.perks = info.perks || [];
    this.mods = computeMods(this.perks);
    this.x = 0; this.y = 0; this.w = 12; this.h = 14;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.aimX = 1; this.aimY = 0;
    this.onGround = false; this.groundTile = 0;
    this.coyote = 0; this.jumpBuf = 0; this.jumpCut = false;
    this.airJumpsMax = this.hero.airJumps + this.mods.airJumps;
    this.airJumps = this.airJumpsMax;
    this.dropT = 0;
    this.wallDir = 0;
    const diff = world.diffName;
    this.maxHp = Math.max(1, this.hero.hp + this.mods.maxHp + (diff === 'casual' ? 1 : 0));
    if (world.mut?.has('glass')) { this.maxHp = 1; this.mods.dmg *= 2; }
    this.hp = this.maxHp;
    this.invuln = 0; this.down = false; this.reviveProg = 0; this.autoRevive = 0;
    this.secondBakeUsed = 0;
    this.lives = 0;
    this.cd = { attack: 0, special: 0 };
    this.specialMax = this.hero.specialCd * this.mods.cdMul;
    this.charge = 0; this.charging = false;
    this.comboIdx = 0; this.comboT = 0;
    this.dashT = 0; this.dashDir = 1;
    this.holdFire = 0;
    this.hitboxes = [];
    this.hitSetDash = new Set();
    this.swing = { kind: '', t: 1, dur: 0, big: false };
    this.slowT = 0;
    this.killCount = 0;
    this.healTick = 0;
    this.shield = 0;
    this.rushT = 0;
    // anim
    this.sq = 0; this.runT = 0; this.blinkT = rand(2, 4); this.blink = false; this.hurtT = 0; this.t = rand(10);
    this.flash = 0;
    this.prevOnGround = true;
    // net
    this.interp = [];
    this.netState = null;
    this.remoteReviveMul = 1;
    this.remoteMagnet = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get alive() { return !this.down; }

  spawnAt(sp) {
    this.x = sp.x - this.w / 2; this.y = sp.y - this.h;
    this.vx = 0; this.vy = 0;
    this.interp.length = 0;
  }

  // --------------------------------------------------------------- helpers used by kits
  meleeDir() {
    const c = this.ctl;
    if (c.y < -0.5) return 'up';
    if (c.y > 0.5 && !this.onGround) return 'down';
    return 'fwd';
  }
  aimDir(allowDown) {
    const c = this.ctl;
    let x = c.x, y = c.y;
    if (y > 0.5 && this.onGround) y = 0;
    if (!allowDown && y > 0) y = 0;
    if (!x && !y) x = this.facing;
    if (y < -0.5 && !c.x) x = 0;
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }
  setSwing(kind, dur, big = false) {
    this.swing = { kind, t: 0, dur, big };
  }
  useSpecial() {
    this.specialMax = this.hero.specialCd * this.mods.cdMul;
    this.cd.special = this.specialMax;
    this.w_.stat(this, 'specials');
  }
  melee(rect, dmg, o) {
    this.hitboxes.push({ ox: rect.x - this.x, oy: rect.y - this.y, w: rect.w, h: rect.h, dmg, o, life: o.life ?? 0.1, hit: new Set() });
    this.w_.meleeVisualCheck?.(this, rect);
  }
  meleeTick(rect, dmg, o) {
    this.w_.meleeCheck(this, rect, dmg, o, this.hitSetDash);
  }

  // --------------------------------------------------------------- local update
  update(dt) {
    const w = this.w_;
    this.t += dt;
    this.updateAnim(dt);
    if (this.down) { this.updateDown(dt); return; }
    const c = this.ctl;
    this.invuln = Math.max(0, this.invuln - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.cd.attack -= dt;
    this.cd.special = Math.max(0, this.cd.special - dt);
    this.comboT -= dt;
    this.dropT -= dt;
    this.shield = Math.max(0, this.shield - dt);
    if (this.rushT > 0) {
      this.rushT -= dt;
      if (Math.random() < 0.7) w.fx.add({ x: this.cx + rand(-5, 5), y: this.cy + rand(-6, 6), life: 0.35, size: 2.2, color: `hsl(${(this.t * 600) % 360},100%,70%)`, add: true, shape: 'star' });
    }

    // facing / aim
    if (c.x && this.dashT <= 0) this.facing = c.x > 0 ? 1 : -1;
    const a = this.aimDir(true);
    this.aimX = a.x; this.aimY = a.y;

    // horizontal movement
    const ice = this.onGround && this.groundTile === 6;
    let maxSpd = this.hero.speed * this.mods.speed * (this.rushT > 0 ? 1.3 : 1) * (this.slowT > 0 ? 0.55 : 1) * (this.charging && this.hero.id === 'ranger' ? 0.6 : 1);
    if (this.dashT <= 0) {
      const target = c.x * maxSpd;
      let accel;
      if (this.onGround) accel = c.x ? (ice ? 420 : 1700) : (ice ? 140 : 2100);
      else accel = c.x ? 1250 : 380;
      // turn-around boost for snappy feel
      if (c.x && Math.sign(c.x) !== Math.sign(this.vx) && !ice) accel *= 1.6;
      if (Math.abs(this.vx) > maxSpd && Math.sign(this.vx) === Math.sign(c.x)) accel = this.onGround ? 600 : 200;
      this.vx = approach(this.vx, target, accel * dt);
    }

    // jumping
    if (c.jumpP) this.jumpBuf = BUFFER;
    else this.jumpBuf -= dt;
    this.coyote = this.onGround ? COYOTE : this.coyote - dt;
    if (this.onGround) { this.airJumps = this.airJumpsMax; this.jumpCut = false; this.launch = false; }

    // wall slide (ninja)
    this.wallDir = 0;
    if (this.hero.wallJump && !this.onGround) {
      if (w.rectSolid(this.x - 2, this.y + 2, 2, this.h - 4) && c.x < 0) this.wallDir = -1;
      else if (w.rectSolid(this.x + this.w, this.y + 2, 2, this.h - 4) && c.x > 0) this.wallDir = 1;
      if (this.wallDir && this.vy > 60) { this.vy = 60; if (Math.random() < 0.3) w.fx.dust(this.wallDir > 0 ? this.x + this.w : this.x, this.y + 4, 1); }
    }

    if (this.jumpBuf > 0 && this.dashT <= 0) {
      const onOneWay = this.onGround && this.groundTile === 3;
      if (onOneWay && c.y > 0.5) {
        this.dropT = 0.22; this.jumpBuf = 0; this.onGround = false; this.y += 1;
      } else if (this.onGround || this.coyote > 0) {
        this.doJump(JUMP_V, false);
      } else if (c.jumpP && this.wallDir) {
        this.vy = -350; this.vx = -this.wallDir * 210; this.facing = -this.wallDir;
        this.jumpBuf = 0; this.jumpCut = false;
        sfx('jump', { pitch: 1.2, pan: w.pan(this.cx) });
        w.fx.dust(this.wallDir > 0 ? this.x + this.w : this.x, this.cy, 4);
      } else if (c.jumpP && this.airJumps > 0) {
        this.airJumps--;
        this.doJump(AIR_JUMP_V, true);
      }
    }
    // variable jump height
    // variable jump height: letting go early switches to the stronger "cut" gravity (no velocity snap)
    if (!c.jump && this.vy < 0 && !this.launch) this.jumpCut = true;
    if (this.vy >= 0) this.launch = false;

    // gravity with apex hang + fast fall
    if (this.dashT <= 0) {
      let g;
      if (this.vy < 0) g = this.launch || !this.jumpCut ? GRAV_UP : GRAV_CUT;
      else g = GRAV_DOWN;
      if (Math.abs(this.vy) < 55 && (c.jump || this.launch)) g *= 0.5; // soft apex
      g *= w.gravMul;
      let maxFall = MAX_FALL;
      if (c.y > 0.5 && !this.onGround) { maxFall = FAST_FALL; g *= 1.15; }
      this.vy = Math.min(this.vy + g * dt, maxFall);
    }

    // kit
    this.hero.kit.update(this, w, dt);
    this.swing.t += dt;

    // physics
    this.prevOnGround = this.onGround;
    const prevVy = this.vy;
    w.moveEntity(this, dt, { drop: this.dropT > 0 });
    w.wrapEntity(this);
    if (this.y < -80) this.y = -80;
    if (this.onGround && !this.prevOnGround) {
      this.sq = clamp(prevVy / 900, 0.1, 0.4);
      if (prevVy > 200) { w.fx.dust(this.cx, this.y + this.h, prevVy > 380 ? 8 : 4); sfx('land', { vol: Math.min(1, prevVy / 400), pan: w.pan(this.cx) }); }
    }
    if (this.onGround && Math.abs(this.vx) > 30) {
      this.runT += dt;
      if (Math.random() < 0.08) w.fx.dust(this.cx - this.facing * 4, this.y + this.h, 1);
    } else this.runT = 0;

    // hitboxes
    for (let i = this.hitboxes.length - 1; i >= 0; i--) {
      const hb = this.hitboxes[i];
      hb.life -= dt;
      const r = { x: this.x + hb.ox, y: this.y + hb.oy, w: hb.w, h: hb.h };
      const hits = w.meleeCheck(this, r, hb.dmg, hb.o, hb.hit);
      if (hits > 0 && hb.o.pogo) {
        this.vy = -330; this.airJumps = this.airJumpsMax; this.launch = true; this.jumpCut = false;
        hb.o.pogo = false;
        w.stat(this, 'pogos');
      }
      if (hb.life <= 0) this.hitboxes.splice(i, 1);
    }
    // block projectiles with sword swings (deflect)
    if (this.hero.id === 'knight' && this.hitboxes.length) {
      for (const hb of this.hitboxes) w.blockEnemyShots({ x: this.x + hb.ox, y: this.y + hb.oy, w: hb.w, h: hb.h }, this);
    }

    // hazards
    w.playerHazards(this, dt);
    // fell out of the world
    if (this.y > H + 20) this.fellInPit();
  }

  doJump(v, air) {
    const w = this.w_;
    this.vy = -v;
    this.jumpBuf = 0; this.coyote = 0; this.jumpCut = false;
    this.onGround = false;
    this.sq = -0.3;
    if (air) {
      sfx('djump', { pan: w.pan(this.cx) });
      w.fx.ring(this.cx, this.y + this.h, 9, 'rgba(255,255,255,0.8)', 0.25, 2);
      w.fx.dust(this.cx, this.y + this.h, 4);
    } else {
      sfx('jump', { pan: w.pan(this.cx) });
      w.fx.dust(this.cx, this.y + this.h, 3);
    }
  }

  fellInPit() {
    const w = this.w_;
    this.hurt(1, this.cx, 'pit', true);
    const sp = w.respawnPoint();
    const d = w.dropPoint(sp.x, this.w, this.h);
    this.x = d.x - this.w / 2; this.y = d.y; this.vy = 80; this.vx = 0;
    if (!this.down) this.invuln = Math.max(this.invuln, 1.5);
    else this.y = Math.max(this.y, H / 2);
  }

  hurt(dmg, srcX, kind = 'hit', ignoreInvuln = false) {
    const w = this.w_;
    if (this.down) return false;
    if (!ignoreInvuln && (this.invuln > 0 || this.dashT > 0)) return false;
    if (this.shield > 0 && kind !== 'pit') {
      this.shield = 0; this.invuln = 0.6;
      sfx('shield', { pan: w.pan(this.cx) });
      w.fx.ring(this.cx, this.cy, 18, '#9fe6ff', 0.3, 3);
      return false;
    }
    this.hp -= dmg;
    this.invuln = 1.3 + this.mods.invulnBonus;
    this.hurtT = 0.35;
    this.flash = 1;
    const dir = Math.sign(this.cx - srcX) || -this.facing;
    if (kind !== 'pit') { this.vx = dir * 170; this.vy = -210; }
    this.charging = false; this.charge = 0; this.dashT = 0;
    w.hitstop = Math.max(w.hitstop, 0.07);
    w.fx.shake(0.35);
    w.fx.burst(this.cx, this.cy, 10, { colors: ['#fff', this.hero.color, '#ff5a6e'], speed: [60, 160], g: 300 });
    w.fx.text(this.cx, this.y - 8, `-${dmg}`, { color: '#ff5a6e', size: 9 });
    sfx('hurt', { pan: w.pan(this.cx) });
    if (settings().haptics && navigator.vibrate) navigator.vibrate(60);
    w.onPlayerHit(this);
    if (this.mods.revenge) {
      w.areaHit(this, this.cx, this.cy, 52, 4, { kby: -200, stun: 1, tag: 'revenge' });
      w.fxEvent('nova', this.cx, this.cy, 52, { color: '#ff9ad5' });
    }
    if (this.hp <= 0) this.goDown();
    return true;
  }

  goDown() {
    const w = this.w_;
    this.hp = 0;
    this.down = true;
    this.reviveProg = 0;
    this.vx = 0; this.vy = -60;
    this.hitboxes.length = 0;
    this.charging = false;
    sfx('down');
    w.fx.burst(this.cx, this.cy, 24, { colors: [this.hero.color, '#fff'], speed: [80, 220], shape: 'square' });
    w.fx.shake(0.5);
    w.stat(this, 'downs');
    if (this.mods.secondBake > this.secondBakeUsed) { this.secondBakeUsed++; this.autoRevive = 1.4; this.autoKind = 'second'; }
    else if (this.lives > 0) { this.lives--; this.autoRevive = 2.0; this.autoKind = 'life'; }
    // co-op safety net: a downed player comes back on their own if nobody can reach them in time
    else if (w.players.length > 1 && w.diffName !== 'hard') { this.autoRevive = w.diffName === 'casual' ? 10 : 20; this.autoKind = 'timer'; }
    else this.autoRevive = 0;
    w.onPlayerDown(this);
  }

  revive(byId = -1) {
    const w = this.w_;
    this.down = false;
    this.hp = Math.max(1, Math.ceil(this.maxHp / 2));
    this.invuln = 2.2;
    this.vy = -250;
    this.reviveProg = 0; this.autoRevive = 0;
    this.flash = 1;
    sfx('revive');
    w.fx.sparkle(this.cx, this.cy, 16, '#fff6a0');
    w.fx.ring(this.cx, this.cy, 30, '#fff6a0', 0.4, 3);
    if (byId >= 0) {
      const by = w.playerById(byId);
      if (by && (by.local ? by.mods.reviveMul > 1 : by.remoteReviveMul > 1)) this.shield = 6;
    }
    w.onPlayerRevived(this, byId);
  }

  updateDown(dt) {
    const w = this.w_;
    const c = this.ctl;
    // float as a bubble, steer slowly
    const s = 55;
    this.vx = approach(this.vx, c.x * s, 300 * dt);
    this.vy = approach(this.vy, c.y * s - 6, 300 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.y = clamp(this.y, 8, H - 30);
    w.wrapEntity(this);
    if (this.autoRevive > 0) {
      this.autoRevive -= dt;
      if (this.autoRevive <= 0) { this.revive(-1); return; }
    }
    // revive by allies
    let rate = 0, by = -1, best = 1e9;
    for (const o of w.players) {
      if (o === this || o.down || !o.present) continue;
      const d = Math.hypot(o.cx - this.cx, o.cy - this.cy);
      if (d < 26) {
        const m = o.local ? o.mods.reviveMul : o.remoteReviveMul;
        rate = Math.max(rate, m);
        if (d < best) { best = d; by = o.id; }
      }
    }
    if (w.inZone(this.cx, this.cy, 'heal')) rate = Math.max(rate, 0.5) * 3;
    if (rate > 0) {
      const prev = this.reviveProg;
      this.reviveProg += dt * rate;
      if (Math.floor(prev * 5) !== Math.floor(this.reviveProg * 5)) sfx('tick');
      if (this.reviveProg >= REVIVE_TIME) this.revive(by);
    } else this.reviveProg = Math.max(0, this.reviveProg - dt * 0.4);
  }

  updateAnim(dt) {
    this.sq = approach(this.sq, 0, dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = !this.blink; this.blinkT = this.blink ? 0.12 : rand(2, 5); }
  }

  // --------------------------------------------------------------- net
  serialize() {
    return {
      i: this.id, x: round1(this.x), y: round1(this.y), vx: Math.round(this.vx), vy: Math.round(this.vy), f: this.facing,
      hp: this.hp, mh: this.maxHp, d: this.down ? 1 : 0, iv: this.invuln > 0 ? 1 : 0, ax: round1(this.aimX), ay: round1(this.aimY),
      sw: this.swing.kind, st: round1(this.swing.t), sd: this.swing.dur, sb: this.swing.big ? 1 : 0, ch: round1(this.charge),
      og: this.onGround ? 1 : 0, rv: this.mods.reviveMul, rp: round1(this.reviveProg), ar: this.autoRevive > 0 && this.autoKind !== 'timer' ? 1 : 0, at: this.autoKind === 'timer' ? Math.ceil(this.autoRevive) : 0,
      mg: this.mods.magnet, sh: this.shield > 0 ? 1 : 0, ru: this.rushT > 0 ? 1 : 0, rt: round1(this.runT), hu: this.hurtT > 0 ? 1 : 0,
      cd: round1(this.specialMax ? this.cd.special / this.specialMax : 0),
    };
  }
  applyNet(s, now) {
    // remote puppet update
    this.netState = s;
    this.interp.push({ t: now, x: s.x, y: s.y });
    if (this.interp.length > 10) this.interp.shift();
    this.facing = s.f; this.hp = s.hp; this.maxHp = s.mh;
    const wasDown = this.down;
    this.down = !!s.d;
    if (wasDown && !this.down) { this.w_.fx.sparkle(this.cx, this.cy, 12); }
    this.aimX = s.ax; this.aimY = s.ay;
    if (s.sw !== this.swing.kind || s.st < this.swing.t - 0.05) this.swing = { kind: s.sw, t: s.st, dur: s.sd, big: !!s.sb };
    this.charge = s.ch;
    this.onGround = !!s.og;
    this.remoteReviveMul = s.rv || 1;
    this.remoteMagnet = s.mg || 0;
    this.reviveProg = s.rp;
    this.autoRevive = s.ar ? 1 : 0;
    this.reviveIn = s.at || 0;
    this.remoteInvuln = !!s.iv;
    this.shield = s.sh ? 1 : 0;
    this.rushT = s.ru ? 1 : 0;
    this.vx = s.vx; this.vy = s.vy;
    this.runT = s.rt;
    this.hurtT = s.hu ? 0.2 : 0;
    this.specialFrac = s.cd;
  }
  updateRemote(dt, renderT) {
    this.t += dt;
    this.updateAnim(dt);
    this.swing.t += dt;
    const b = this.interp;
    if (!b.length) return;
    let x, y;
    if (renderT <= b[0].t) { x = b[0].x; y = b[0].y; }
    else if (renderT >= b[b.length - 1].t) {
      const l = b[b.length - 1];
      const ex = Math.min(0.1, (renderT - l.t) / 1000);
      x = l.x + this.vx * ex; y = l.y + this.vy * ex;
    } else {
      for (let i = 0; i < b.length - 1; i++) {
        if (renderT >= b[i].t && renderT <= b[i + 1].t) {
          const k = (renderT - b[i].t) / (b[i + 1].t - b[i].t || 1);
          if (Math.abs(b[i + 1].x - b[i].x) > W / 2) x = k < 0.5 ? b[i].x : b[i + 1].x;
          else x = b[i].x + (b[i + 1].x - b[i].x) * k;
          y = b[i].y + (b[i + 1].y - b[i].y) * k;
          break;
        }
      }
    }
    if (x !== undefined) {
      const wasGround = this.prevOnGround;
      this.x = x; this.y = y;
      if (this.onGround && !wasGround && this.vy >= 0) this.sq = 0.2;
      this.prevOnGround = this.onGround;
    }
  }
}
