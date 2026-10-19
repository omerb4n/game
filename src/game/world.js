// World: tiles, physics, entities, rules, objectives, and network sync.
import { TILE, COLS, ROWS, W, H, clamp, rand, randi, pick, chance, overlap, wrapDx, circleRect, dist2, round1, weightedPick, TAU } from '../util.js';
import { WORLDS, expandMap } from '../data/levels.js';
import { enemyDef, ENEMY_TYPES } from '../data/enemies.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { sfx } from '../audio.js';
import { settings } from '../save.js';

export const T_EMPTY = 0, T_GROUND = 1, T_ALT = 2, T_ONEWAY = 3, T_SPIKE = 4, T_SPRING = 5, T_ICE = 6, T_LAVA = 7;
const CHARMAP = { '#': T_GROUND, '=': T_ALT, '-': T_ONEWAY, '^': T_SPIKE, o: T_SPRING, i: T_ICE, L: T_LAVA };
const isSolidT = (t) => t === T_GROUND || t === T_ALT || t === T_ICE;

const DIFF = {
  casual: { hp: 0.7, speed: 0.85, interval: 1.25, cap: -1 },
  normal: { hp: 1, speed: 1, interval: 1, cap: 0 },
  hard: { hp: 1.35, speed: 1.15, interval: 0.8, cap: 1 },
};
const SNAP_EVERY = 3; // steps (20Hz)
const INTERP_DELAY = 110; // ms

export class World {
  constructor(cfg) {
    this.cfg = cfg;
    this.level = cfg.level;
    this.theme = WORLDS[(this.level.world || 1) - 1];
    this.session = cfg.session;
    this.isHost = this.session.isHost;
    this.hooks = cfg.hooks || {};
    this.diffName = cfg.difficulty || settings().difficulty;
    this.diff = DIFF[this.diffName] || DIFF.normal;
    this.fx = new FX();
    this.time = 0;
    this.step = 0;
    this.hitstop = 0;
    this.slowmo = 0;
    this.paused = false;
    this.state = 'intro';
    this.stateT = 0;
    this.nextId = 1;
    this.localProjId = 1;
    this.enemies = [];
    this.pproj = [];
    this.eproj = [];
    this.pickups = [];
    this.zones = [];
    this.portalQueue = [];
    this.portalFx = [];
    this.telegraphs = [];
    this.score = 0;
    this.combo = 0; this.comboT = 0; this.bestCombo = 0; this.lastComboBanner = 0;
    this.spawnT = 2;
    this.bonusT = 6;
    this.failT = 0;
    this.teamHits = 0;
    this.anyDowned = false;
    this.snaps = [];
    this.statsById = {};
    this.local = { kills: 0, stomps: 0, muffins: 0, revives: 0, shatters: 0, perfectShots: 0, hits: 0, coins: 0, pogos: 0, specials: 0, downs: 0 };
    this.parseMap();
    // players
    this.players = cfg.roster.map((r) => {
      const local = r.peer === this.session.myId;
      const p = new Player({ ...r, local, ctl: local ? cfg.localCtl[r.slot] : null }, this);
      return p;
    });
    const n = this.players.length;
    this.nPlayers = n;
    const solo = n === 1;
    for (const p of this.players) {
      if (solo) p.lives = this.diffName === 'casual' ? 3 : this.diffName === 'hard' ? 1 : 2;
      this.statsById[p.id] = { kills: 0, muffins: 0, dmg: 0, revives: 0, hits: 0, stomps: 0, downs: 0, name: p.name, hero: p.hero.id };
    }
    this.players.forEach((p, i) => p.spawnAt(this.spawns[i % this.spawns.length], i));
    // offset players sharing spawn points
    this.players.forEach((p, i) => { if (i >= this.spawns.length) p.x += (i % 2 ? 18 : -18); });
    // objective
    const L = this.level;
    this.obj = { type: L.type, goal: 0, count: 0, timeLeft: 0, golden: false, wave: 0, waves: L.waves || 0, toKill: 0, killed: 0, spawned: 0, waveBreak: 0, boss: null, bossId: 0 };
    if (L.type === 'collect') this.obj.goal = Math.round(L.goal * (1 + 0.2 * (n - 1)));
    if (L.type === 'survive') this.obj.timeLeft = L.time;
    if (L.type === 'waves') this.startWave(1);
    this.hpScale = (1 + 0.4 * (n - 1)) * this.diff.hp * (L.hpScale || 1);
    this.bossHpScale = (1 + 0.65 * (n - 1)) * this.diff.hp * (L.hpScale || 1);
    this.cap = Math.max(1, Math.round((L.maxAlive || 4) * (1 + 0.3 * (n - 1))) + this.diff.cap);
    this.setupNet();
  }

  // ================================================================= MAP
  parseMap() {
    const rows = expandMap(this.level);
    this.tiles = new Uint8Array(COLS * ROWS);
    this.spawns = []; this.portals = []; this.bonusSpots = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = rows[r][c];
        this.tiles[r * COLS + c] = CHARMAP[ch] || 0;
        if (ch === 'P') this.spawns.push({ x: c * TILE + TILE / 2, y: (r + 1) * TILE });
        if (ch === 'E') this.portals.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
        if (ch === 'M') this.bonusSpots.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
      }
    }
    // sort spawns center-out so players start together
    this.spawns.sort((a, b) => Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2));
    if (!this.spawns.length) this.spawns.push({ x: W / 2, y: H - 32 });
    if (!this.portals.length) this.portals.push({ x: W / 2, y: 24 });
    // stand spots (for teleports / spawns)
    this.standSpots = [];
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
      const t = this.tiles[r * COLS + c], above = this.tiles[(r - 1) * COLS + c], below = this.tiles[(r + 1) * COLS + c];
      if (t === T_EMPTY && above === T_EMPTY && (isSolidT(below) || below === T_ONEWAY)) this.standSpots.push({ x: c * TILE + TILE / 2, y: (r + 1) * TILE });
    }
    this.hasLava = this.tiles.includes(T_LAVA);
  }
  tileAt(c, r) {
    if (r < 0 || r >= ROWS) return T_EMPTY;
    c = ((c % COLS) + COLS) % COLS;
    return this.tiles[r * COLS + c];
  }
  solidAt(px, py) { return isSolidT(this.tileAt(Math.floor(px / TILE), Math.floor(py / TILE))); }
  platformAt(px, py) { return this.tileAt(Math.floor(px / TILE), Math.floor(py / TILE)) === T_ONEWAY; }
  rectSolid(x, y, w, h) {
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 0.01) / TILE);
    const r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 0.01) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isSolidT(this.tileAt(c, r))) return true;
    return false;
  }
  groundBelow(x, y) {
    for (let r = Math.max(0, Math.floor(y / TILE)); r < ROWS; r++) {
      const t = this.tileAt(Math.floor(x / TILE), r);
      if (isSolidT(t) || t === T_ONEWAY) return r * TILE;
    }
    return H;
  }
  randomStandSpot(w, h) {
    const s = pick(this.standSpots) || { x: W / 2, y: H - 32 };
    return { x: s.x - w / 2, y: s.y - h };
  }
  respawnPoint() {
    const alive = this.alivePlayers();
    if (alive.length) {
      // drop near a teammate
      const p = pick(alive);
      return { x: clamp(p.cx, 20, W - 20), y: 0 };
    }
    return this.spawns[0];
  }

  // ================================================================= PHYSICS
  moveEntity(e, dt, opts = {}) {
    e.onGround = false; e.hitWall = 0; e.hitCeil = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(e.vx), Math.abs(e.vy)) * dt / 5));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      // X
      e.x += e.vx * sdt;
      if (e.vx > 0) {
        const c = Math.floor((e.x + e.w - 0.01) / TILE);
        for (let r = Math.floor(e.y / TILE); r <= Math.floor((e.y + e.h - 0.01) / TILE); r++) {
          if (isSolidT(this.tileAt(c, r))) { e.x = c * TILE - e.w; e.vx = 0; e.hitWall = 1; break; }
        }
      } else if (e.vx < 0) {
        const c = Math.floor(e.x / TILE);
        for (let r = Math.floor(e.y / TILE); r <= Math.floor((e.y + e.h - 0.01) / TILE); r++) {
          if (isSolidT(this.tileAt(c, r))) { e.x = (c + 1) * TILE; e.vx = 0; e.hitWall = -1; break; }
        }
      }
      // Y
      const prevBottom = e.y + e.h;
      e.y += e.vy * sdt;
      if (e.vy > 0) {
        const r = Math.floor((e.y + e.h - 0.01) / TILE);
        for (let c = Math.floor(e.x / TILE); c <= Math.floor((e.x + e.w - 0.01) / TILE); c++) {
          const t = this.tileAt(c, r);
          if (isSolidT(t) || (t === T_ONEWAY && !opts.drop && prevBottom <= r * TILE + 0.5)) {
            e.y = r * TILE - e.h; e.vy = 0; e.onGround = true; e.groundTile = t; break;
          }
        }
      } else if (e.vy < 0) {
        const r = Math.floor(e.y / TILE);
        for (let c = Math.floor(e.x / TILE); c <= Math.floor((e.x + e.w - 0.01) / TILE); c++) {
          if (isSolidT(this.tileAt(c, r))) { e.y = (r + 1) * TILE; e.vy = 0; e.hitCeil = true; break; }
        }
      }
    }
    // grounded check when resting exactly on a surface
    if (!e.onGround && e.vy >= 0) {
      const r = Math.floor((e.y + e.h + 0.5) / TILE);
      if (Math.abs(r * TILE - (e.y + e.h)) < 0.6) {
        for (let c = Math.floor(e.x / TILE); c <= Math.floor((e.x + e.w - 0.01) / TILE); c++) {
          const t = this.tileAt(c, r);
          if (isSolidT(t) || (t === T_ONEWAY && !opts.drop)) { e.onGround = true; e.groundTile = t; break; }
        }
      }
    }
  }
  wrapEntity(e) {
    const cx = e.x + e.w / 2;
    if (cx < 0) e.x += W; else if (cx >= W) e.x -= W;
  }
  tilesUnder(e, type) {
    const c0 = Math.floor(e.x / TILE), c1 = Math.floor((e.x + e.w - 0.01) / TILE);
    const r0 = Math.floor(e.y / TILE), r1 = Math.floor((e.y + e.h - 0.01) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.tileAt(c, r) === type) return { c, r };
    return null;
  }

  // ================================================================= QUERIES
  pan(x) { return clamp((x - W / 2) / (W / 2), -1, 1) * 0.6; }
  playerById(id) { return this.players.find((p) => p.id === id); }
  alivePlayers() { return this.players.filter((p) => !p.down && p.present); }
  localPlayers() { return this.players.filter((p) => p.local); }
  nearestPlayer(x, y) {
    let best = null, bd = 1e12;
    for (const p of this.players) {
      if (p.down || !p.present) continue;
      const dx = wrapDx(x, p.x), dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  inZone(x, y, kind) {
    for (const z of this.zones) if (z.kind === kind && dist2(x, y, z.x, z.y) < z.r * z.r) return z;
    return null;
  }
  enemyById(id) { return this.enemies.find((e) => e.id === id); }

  // ================================================================= MAIN UPDATE
  update(dt) {
    if (this.paused) return;
    this.realDt = dt;
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.35; }
    this.stateT += dt;
    // sample controllers
    for (const p of this.players) if (p.local && p.ctl) { p.ctl.sample(); if (this.inputBlocked) p.ctl.neutralize(); }
    this.cfg.endSample?.();

    if (this.hitstop > 0) {
      this.hitstop -= this.realDt;
      this.fx.update(dt * 0.15);
      this.netTick();
      return;
    }
    this.time += dt;
    this.step++;

    if (this.isHost) this.hostUpdate(dt);
    else this.clientInterp(dt);

    // players
    const now = performance.now();
    for (const p of this.players) {
      if (!p.present) continue;
      if (p.local) p.update(dt);
      else p.updateRemote(dt, now - INTERP_DELAY);
    }
    this.updatePlayerProjectiles(dt);
    this.updateEnemyProjectiles(dt);
    this.contactChecks(dt);
    this.updateZones(dt);
    if (this.isHost) this.pickupChecks(dt);
    this.updateTelegraphs(dt);
    this.fx.update(dt);
    this.ambient(dt);
    this.netTick();
  }

  // ================================================================= HOST LOGIC
  hostUpdate(dt) {
    const o = this.obj;
    if (this.state === 'intro') {
      if (this.stateT > 2.2) {
        this.state = 'play'; this.stateT = 0;
        if (this.level.type === 'boss') this.spawnBoss();
      }
    }
    if (this.state === 'play') {
      // director
      if (o.type !== 'boss') this.director(dt);
      else if (this.level.boss && o.boss) this.bossMinions(dt);
      // objectives
      if (o.type === 'survive') {
        const prev = o.timeLeft;
        o.timeLeft -= dt;
        if (Math.ceil(prev) !== Math.ceil(o.timeLeft) && o.timeLeft <= 5 && o.timeLeft > 0) this.broadcastEv({ type: 'sfx', n: 'tick' }, true);
        if (o.timeLeft <= 0) this.levelClear();
      }
      if (o.type === 'collect') {
        if (!o.golden && o.count >= o.goal) {
          o.golden = true;
          // float the golden muffin above a reachable platform (prefer raised ones, away from the team)
          const raised = this.standSpots.filter((sp) => sp.y <= 13 * TILE);
          const pool = raised.length ? raised : this.standSpots;
          let best = pool[0] || { x: W / 2, y: H / 2 }, bd = -1;
          for (const sp of pool) {
            let d = 1e9;
            for (const pl of this.players) if (pl.present && !pl.down) d = Math.min(d, Math.hypot(pl.cx - sp.x, pl.cy - sp.y));
            d = Math.min(d, 220) * rand(0.6, 1);
            if (d > bd) { bd = d; best = sp; }
          }
          const gk = this.spawnPickup('golden', best.x, best.y - 12, 0, 0);
          gk.float = true;
          this.banner('GOLDEN MUFFIN!', 'Grab it to clear the level!');
          this.broadcastEv({ type: 'sfx', n: 'golden' }, true);
        }
        this.bonusT -= dt;
        if (this.bonusT <= 0 && this.bonusSpots.length) {
          this.bonusT = rand(8, 12);
          if (!this.pickups.some((p) => p.bonus)) {
            const s = pick(this.bonusSpots);
            const pk = this.spawnPickup('muffin', s.x, s.y, 0, 0);
            pk.bonus = true; pk.float = true;
          }
        }
      }
      if (o.type === 'waves') this.wavesUpdate(dt);
      // combo decay
      if (this.combo > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) { this.combo = 0; }
      }
      // fail check
      const present = this.players.filter((p) => p.present);
      if (present.length && present.every((p) => p.down && !p.autoRevive)) {
        this.failT += dt;
        if (this.failT > 1.2) this.levelFail();
      } else this.failT = 0;
    }
    // portal queue
    for (let i = this.portalQueue.length - 1; i >= 0; i--) {
      const q = this.portalQueue[i];
      q.t -= dt;
      if (q.t <= 0) {
        this.portalQueue.splice(i, 1);
        if (this.state === 'play') this.spawnEnemyAt(q.type, q.x, q.y, { spawning: 0.35, enraged: q.enraged });
      }
    }
    this.updateEnemies(dt);
    this.updatePickups(dt);
  }

  director(dt) {
    const o = this.obj;
    if (o.type === 'waves' && (o.waveBreak > 0 || o.spawned >= o.toKill)) return;
    const intensity = Math.max(0.6, 1 - this.time / 240);
    this.spawnT -= dt;
    const alive = this.enemies.filter((e) => !e.def.boss).length + this.portalQueue.length;
    if (this.spawnT <= 0 && alive < this.cap) {
      this.spawnT = (this.level.interval || 2) * rand(0.8, 1.2) * intensity * this.diff.interval;
      const type = weightedPick(this.level.enemies || { gumdrop: 1 });
      this.openPortal(type);
      if (o.type === 'waves') o.spawned++;
    }
  }

  openPortal(type, enraged = false) {
    // prefer portals far from players
    let best = this.portals[0], bd = -1;
    for (const pt of this.portals) {
      let d = 1e9;
      for (const p of this.players) d = Math.min(d, dist2(p.cx, p.cy, pt.x, pt.y));
      d *= rand(0.5, 1.5);
      if (d > bd) { bd = d; best = pt; }
    }
    this.portalQueue.push({ type, x: best.x, y: best.y, t: 0.9, enraged });
    this.fxEvent('portal', best.x, best.y, 0.9);
  }

  startWave(n) {
    const o = this.obj;
    o.wave = n; o.killed = 0; o.spawned = 0;
    o.toKill = Math.round((6 + (this.level.tier || 1) + n * 2) * (1 + 0.3 * ((this.nPlayers || 1) - 1)));
    o.waveBreak = n === 1 ? 0 : 2.5;
    if (n > 1) this.banner(`WAVE ${n}/${o.waves}`, '');
  }
  wavesUpdate(dt) {
    const o = this.obj;
    if (o.waveBreak > 0) { o.waveBreak -= dt; return; }
    if (o.killed >= o.toKill && !this.enemies.some((e) => !e.def.boss)) {
      if (o.wave >= o.waves) this.levelClear();
      else this.startWave(o.wave + 1);
    }
  }

  spawnBoss() {
    const type = this.level.boss;
    const def = enemyDef(type);
    const e = this.spawnEnemyAt(type, W / 2, def.flying ? -30 : 20, {});
    e.state = 'intro'; e.st = 0;
    if (type === 'wyrm') { e.x = -40; e.y = 60; }
    this.obj.boss = e; this.obj.bossId = e.id;
    this.banner(def.name, def.title);
    this.broadcastEv({ type: 'sfx', n: 'roar' }, true);
    this.fxEvent('shake', W / 2, 0, 0.5);
  }
  bossMinions(dt) {
    // light minion pressure in multi-player boss fights
    if (!this.level.enemies || this.nPlayers < 2) return;
    this.spawnT -= dt;
    const alive = this.enemies.filter((e) => !e.def.boss).length + this.portalQueue.length;
    if (this.spawnT <= 0 && alive < this.nPlayers - 1) {
      this.spawnT = 7;
      this.openPortal(weightedPick(this.level.enemies));
    }
  }

  spawnEnemyAt(type, x, y, o = {}) {
    const def = enemyDef(type);
    const hpMul = (def.boss ? this.bossHpScale : this.hpScale) * (o.enraged ? 1.3 : 1);
    const hp = Math.round(def.hp * hpMul);
    const e = {
      id: this.nextId++, type, def, x: x - def.w / 2, y: y - def.h / 2, w: def.w, h: def.h, vx: o.vx || 0, vy: o.vy || 0,
      hp, maxHp: hp, facing: chance(0.5) ? 1 : -1, state: 'walk', st: 0, data: {}, frozen: 0, burn: 0, burnTick: 0, burnBy: -1,
      mark: 0, slow: 0, stun: 0, flash: 0, kbT: 0, enraged: !!o.enraged, spawning: o.spawning || 0, armored: false, phased: false,
      vuln: false, onGround: false, lastHitBy: -1, trail: [], w_speedMul: this.diff.speed,
    };
    this.enemies.push(e);
    return e;
  }

  updateEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const def = e.def;
      e.st += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.kbT -= dt;
      if (e.spawning > 0) { e.spawning -= dt; e.vx = 0; e.vy = 0; continue; }
      // statuses
      if (e.frozen > 0) e.frozen -= dt;
      if (e.stun > 0) e.stun -= dt;
      if (e.mark > 0) e.mark -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (this.inZone(e.x + e.w / 2, e.y + e.h / 2, 'heal')) e.slow = Math.max(e.slow, 0.2);
      if (e.burn > 0) {
        e.burn -= dt; e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          this.applyHit(e, 1, { burnTick: true }, e.burnBy);
          if (e.dead) { this.enemies.splice(i, 1); continue; }
        }
      }
      const disabled = e.frozen > 0 || e.stun > 0 || e.kbT > 0;
      if (!disabled) def.ai(e, this, dt);
      else { e.vx *= def.flying ? 0.9 : 0.94; if (def.flying && e.frozen <= 0) e.vy *= 0.9; }
      if (!def.flying || e.frozen > 0) e.vy = Math.min(e.vy + 900 * dt, 420);
      if (def.noclip && e.frozen <= 0) { e.x += e.vx * dt; e.y += e.vy * dt; e.onGround = false; e.hitWall = 0; }
      else this.moveEntity(e, dt);
      if (!def.boss || def.noclip) this.wrapEntity(e);
      if (def.boss && !def.noclip) e.x = clamp(e.x, 0, W - e.w);
      if (def.segments) { e.trail.unshift({ x: e.x + e.w / 2, y: e.y + e.h / 2 }); if (e.trail.length > 70) e.trail.pop(); }
      // pit / lava
      const inLava = !def.flying && this.hasLava && this.tilesUnder(e, T_LAVA);
      if (e.y > H + 10 || inLava) {
        if (def.boss) { e.y = -40; e.vy = 0; e.x = W / 2 - e.w / 2; continue; }
        if (inLava) this.fxEvent('lava', e.x + e.w / 2, e.y + e.h, 0);
        // respawn enraged
        const pt = pick(this.portals);
        e.x = pt.x - e.w / 2; e.y = pt.y - e.h / 2; e.vx = 0; e.vy = 0;
        if (!e.enraged) { e.enraged = true; e.maxHp = Math.round(e.maxHp * 1.3); }
        e.hp = e.maxHp; e.spawning = 0.4; e.frozen = 0; e.burn = 0;
        this.fxEvent('enrage', pt.x, pt.y, 0);
      }
      if (e.y < -60 && !def.flying) e.y = -60;
    }
  }

  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      if (!k.float) {
        k.vy = Math.min(k.vy + 600 * dt, 350);
        this.moveEntity(k, dt);
        if (k.onGround) k.vx *= 0.85;
        this.wrapEntity(k);
      }
      // magnet
      for (const p of this.players) {
        if (p.down || !p.present) continue;
        const mg = (p.local ? p.mods.magnet : p.remoteMagnet) || 0;
        if (!mg || k.kind === 'golden') continue;
        const dx = p.cx - (k.x + k.w / 2), dy = p.cy - (k.y + k.h / 2);
        const d = Math.hypot(dx, dy);
        if (d < mg && d > 1) { k.x += (dx / d) * 160 * dt; k.y += (dy / d) * 160 * dt; }
      }
      const inLava = this.hasLava && this.tilesUnder(k, T_LAVA);
      if (k.y > H + 10 || inLava) {
        if (k.kind === 'golden') { k.x = W / 2 - k.w / 2; k.y = 10; k.vy = 0; continue; }
        this.pickups.splice(i, 1); continue;
      }
      if (k.life !== undefined) {
        k.life -= dt;
        if (k.life <= 0) { this.pickups.splice(i, 1); continue; }
      }
    }
  }

  spawnPickup(kind, x, y, vx, vy) {
    const k = { id: this.nextId++, kind, x: x - 5, y: y - 5, w: 10, h: 10, vx, vy, t: 0, onGround: false };
    if (kind === 'muffin') k.life = 14;
    if (kind === 'coin') k.life = 10;
    if (kind === 'heart') k.life = 12;
    if (kind === 'golden') { k.w = 14; k.h = 14; k.x = x - 7; }
    this.pickups.push(k);
    return k;
  }

  pickupChecks() {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      if (k.t < 0.25) continue;
      for (const p of this.players) {
        if (p.down || !p.present) continue;
        const pr = { x: p.x - 3, y: p.y - 3, w: p.w + 6, h: p.h + 6 };
        if (!overlap(pr, k)) continue;
        if (k.kind === 'heart' && p.hp >= p.maxHp && this.players.some((q) => !q.down && q.hp < q.maxHp && q !== p)) continue;
        this.pickups.splice(i, 1);
        this.collect(k, p);
        break;
      }
    }
  }

  collect(k, p) {
    const msg = { type: 'pick', id: k.id, by: p.id, k: k.kind, x: round1(k.x + k.w / 2), y: round1(k.y + k.h / 2) };
    const st = this.statsById[p.id];
    if (k.kind === 'muffin') {
      if (this.obj.type === 'collect') this.obj.count++;
      this.addScore(25);
      if (st) st.muffins++;
    } else if (k.kind === 'golden') {
      this.addScore(500);
      this.levelClear();
    } else if (k.kind === 'coin') this.addScore(5);
    this.broadcastEv(msg);
    this.onPick(msg);
  }

  // applies on every peer
  onPick(m) {
    const p = this.playerById(m.by);
    const idx = this.pickups.findIndex((k) => k.id === m.id);
    if (idx >= 0 && !this.isHost) this.pickups.splice(idx, 1);
    const x = m.x, y = m.y;
    if (m.k === 'muffin') {
      sfx('pickup', { pitch: 1 + Math.min(0.6, (this.obj.count % 10) * 0.05) });
      this.fx.sparkle(x, y, 6, '#ffd36b');
      this.fx.text(x, y - 6, '+1', { color: '#ffd36b', size: 8 });
      if (p?.local) this.local.muffins++;
    } else if (m.k === 'golden') {
      sfx('golden');
      this.fx.sparkle(x, y, 30, '#ffe14d');
      this.fx.ring(x, y, 40, '#ffe14d', 0.5, 4);
    } else if (m.k === 'coin') {
      sfx('coin');
      this.fx.sparkle(x, y, 4, '#7fe0ff');
      if (p?.local) { const n = Math.max(1, Math.round(1 * p.mods.coinMul)); this.local.coins += n; this.fx.text(x, y - 6, `+${n}`, { color: '#7fe0ff', size: 7 }); }
    } else if (m.k === 'heart') {
      sfx('heal');
      this.fx.sparkle(x, y, 8, '#ff7a9a');
      if (p?.local && !p.down) { p.hp = Math.min(p.maxHp, p.hp + 1); this.fx.text(p.cx, p.y - 8, '+♥', { color: '#ff7a9a', size: 9 }); }
    } else if (m.k === 'rush') {
      sfx('golden');
      this.fx.sparkle(x, y, 20, '#ffe14d');
      if (p) this.fx.text(x, y - 10, 'SUGAR RUSH!', { color: '#ff7ad9', size: 10, life: 1.2 });
      if (p?.local && !p.down) p.rushT = 8;
    }
  }

  addScore(n) { this.score += Math.round(n * this.comboMult()); }
  comboMult() { return 1 + Math.min(3, Math.floor(this.combo / 5) * 0.25); }

  // ================================================================= DAMAGE: players -> enemies
  // Called on the attacker's peer. Returns true if predicted kill.
  hitEnemy(p, e, dmg, o = {}) {
    if (!e || e.dead || e.spawning > 0 || e.phased) return false;
    if (e.armored) {
      this.fx.burst(e.x + e.w / 2, e.y + e.h / 2, 5, { colors: ['#fff', '#cfe8ff'], speed: [80, 160], g: 0, life: [0.1, 0.2], add: true });
      sfx('shield', { pan: this.pan(e.x) });
      return false;
    }
    let mult = p.mods.dmg * (p.rushT > 0 ? 1.5 : 1);
    const crit = Math.random() < p.mods.crit;
    const frozen = e.frozen > 0;
    if (frozen) mult *= 1.5;
    if (e.mark > 0) mult *= 1.25;
    if (e.vuln) mult *= 2;
    if (crit) mult *= 2;
    const final = Math.max(0.5, Math.round(dmg * mult * 10) / 10);
    const m = { type: 'hit', e: e.id, d: final, by: p.id, kx: o.kbx || 0, ky: o.kby || 0 };
    if (o.freeze || Math.random() < p.mods.freezeChance) m.fz = o.freeze || 2;
    if (o.burn || Math.random() < p.mods.burnChance) m.bn = o.burn || 3;
    if (o.mark) m.mk = o.mark;
    if (o.slow) m.sl = o.slow;
    if (o.stun) m.sn = o.stun;
    if (o.tag === 'stomp') m.stomp = 1;
    // local feedback
    e.flash = 0.12;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    this.fx.burst(cx, cy, crit ? 10 : 5, { colors: e.def.crumbs || ['#fff'], speed: [50, 150], g: 300, shape: 'square', size: [1.2, 2.5] });
    this.fx.burst(cx, cy, 3, { colors: ['#fff'], speed: [40, 100], g: 0, life: [0.08, 0.16], add: true });
    if (settings().damageNumbers) this.fx.text(cx + rand(-4, 4), e.y - 4, crit ? `${Math.max(1, Math.round(final))}!` : `${Math.max(1, Math.round(final))}`, { color: crit ? '#ffe14d' : frozen ? '#9fe6ff' : '#fff', size: crit ? 10 : 7.5 });
    sfx(crit ? 'crit' : 'hit', { pitch: rand(0.9, 1.15), pan: this.pan(cx) });
    if (crit || o.heavy || final >= 6) { this.hitstop = Math.max(this.hitstop, 0.06); this.fx.shake(0.12); }
    else this.hitstop = Math.max(this.hitstop, 0.025);
    if (m.fz) this.fx.burst(cx, cy, 8, { colors: ['#bfefff', '#fff'], speed: [20, 70], g: 0, shape: 'star', add: true });
    this.statsById[p.id] && (this.statsById[p.id].dmg += final);
    e.predHp = (e.predHp ?? e.hp) - final;
    const predictedKill = e.predHp <= 0;
    if (this.isHost) this.applyHit(e, final, m, p.id);
    else this.session.send(m);
    return predictedKill;
  }

  // host-side authoritative damage
  applyHit(e, dmg, m, byId) {
    if (e.dead) return;
    if (e.phased && !m.burnTick) return;
    e.hp -= dmg;
    e.lastHitBy = byId;
    e.flash = 0.12;
    if (!m.burnTick && !e.def.heavy) {
      if (m.kx || m.ky) { e.vx = m.kx * 0.9; e.vy = Math.min(e.vy, 0) + m.ky * 0.9; e.kbT = 0.14; }
    }
    if (m.fz) { e.frozen = Math.max(e.frozen, e.def.boss ? m.fz * 0.25 : m.fz); }
    if (m.bn) { e.burn = Math.max(e.burn, m.bn); e.burnBy = byId; }
    if (m.mk) e.mark = Math.max(e.mark, m.mk);
    if (m.sl) e.slow = Math.max(e.slow, m.sl);
    if (m.sn && !e.def.boss) e.stun = Math.max(e.stun, m.sn);
    if (e.state === 'tele' && e.type === 'wizard') { /* interrupt teleports */ }
    if (e.hp <= 0) this.killEnemy(e, byId, !!m.stomp);
  }

  killEnemy(e, byId, byStomp) {
    if (e.dead) return;
    e.dead = true;
    const shatter = e.frozen > 0;
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
    const def = e.def;
    this.combo++;
    this.comboT = 3.2;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.addScore(def.score * (e.enraged ? 1.5 : 1));
    const st = this.statsById[byId];
    if (st) st.kills++;
    const msg = { type: 'edie', id: e.id, t: e.type, x: round1(e.x + e.w / 2), y: round1(e.y + e.h / 2), by: byId, sh: shatter ? 1 : 0, en: e.enraged ? 1 : 0, cb: this.combo };
    if (this.obj.type === 'waves') this.obj.killed++;
    // combo banners
    if (this.combo >= 10 && this.combo % 10 === 0 && this.combo !== this.lastComboBanner) {
      this.lastComboBanner = this.combo;
      msg.cbb = this.combo;
    }
    this.broadcastEv(msg);
    this.onEnemyDie(msg);
    // drops
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    if (def.boss) {
      for (let i = 0; i < 24; i++) this.spawnPickup('coin', cx, cy, rand(-160, 160), rand(-380, -150));
      for (let i = 0; i < this.nPlayers; i++) this.spawnPickup('heart', cx, cy, rand(-100, 100), rand(-300, -200));
      this.slowmo = 1.2;
      this.levelClear(1.6);
      return;
    }
    if (this.obj.type === 'collect' && !this.obj.golden) {
      const n = (def.muffins || 1) + (e.enraged ? 1 : 0);
      for (let i = 0; i < n; i++) this.spawnPickup('muffin', cx, cy, rand(-70, 70), rand(-240, -140));
    } else if (chance(0.35)) this.spawnPickup('muffin', cx, cy, rand(-60, 60), rand(-220, -140));
    const lowHp = this.players.some((p) => !p.down && p.hp <= 1);
    if (chance(lowHp ? 0.12 : 0.045)) this.spawnPickup('heart', cx, cy, rand(-50, 50), -220);
    if (chance(0.025) || (this.combo > 0 && this.combo % 25 === 0)) { const rk = this.spawnPickup('rush', cx, cy, rand(-40, 40), -260); rk.life = 9; }
    const coins = chance(0.4) ? (e.enraged ? randi(2, 3) : 1) : 0;
    for (let i = 0; i < coins; i++) this.spawnPickup('coin', cx, cy, rand(-90, 90), rand(-260, -160));
  }

  // all peers: visual + local stats
  onEnemyDie(m) {
    const i = this.enemies.findIndex((e) => e.id === m.id);
    if (i >= 0 && !this.isHost) this.enemies.splice(i, 1);
    const def = enemyDef(m.t);
    if (!def) return;
    if (m.sh) {
      this.fx.burst(m.x, m.y, 18, { colors: ['#bfefff', '#ffffff', '#7fd0ff'], speed: [80, 220], g: 400, shape: 'square', size: [2, 4] });
      sfx('shatter', { pan: this.pan(m.x) });
    }
    this.fx.crumbs(m.x, m.y, def.boss ? 60 : 14, def.crumbs || ['#fff']);
    this.fx.ring(m.x, m.y, def.boss ? 60 : 16, '#ffffff', 0.25, 3);
    this.fx.burst(m.x, m.y, 6, { colors: ['#fff6c0'], speed: [30, 90], g: 0, shape: 'star', add: true });
    sfx('edie', { pitch: 0.9 + Math.min(1, (m.cb || 1) * 0.03), pan: this.pan(m.x) });
    if (m.cb > 1) sfx('combo', { pitch: Math.min(24, m.cb) });
    if (def.boss) {
      this.fx.shake(1);
      for (let k = 0; k < 6; k++) setTimeout(() => this.fx.boom(m.x + rand(-30, 30), m.y + rand(-30, 30), 30, pick(['#ffb347', '#ff5a9e', '#fff36b'])), k * 150);
      sfx('boom', { vol: 2 });
    }
    if (m.cbb) this.hooks.comboBanner?.(m.cbb);
    const p = this.playerById(m.by);
    if (p?.local) {
      this.local.kills++;
      if (m.sh) this.local.shatters++;
      p.killCount++;
      if (p.mods.lifesteal && p.killCount % p.mods.lifesteal === 0 && p.hp < p.maxHp && !p.down) {
        p.hp++; sfx('heal'); this.fx.text(p.cx, p.y - 8, '+♥', { color: '#ff7a9a', size: 9 });
      }
    }
    if (def.boss) this.local.bossKill = m.t;
  }

  meleeCheck(p, r, dmg, o, hitSet) {
    let hits = 0;
    for (const e of this.enemies) {
      if (hitSet.has(e.id) || e.dead || e.spawning > 0 || e.phased) continue;
      const er = { x: e.x, y: e.y, w: e.w, h: e.h };
      if (!this.overlapW(r, er)) continue;
      hitSet.add(e.id);
      const kill = this.hitEnemy(p, e, dmg, o);
      hits++;
      if (o.tag === 'sword' && !e.armored) this.fx.burst(e.x + e.w / 2, e.y + e.h / 2, 4, { colors: ['#ffffff'], speed: [100, 200], g: 0, shape: 'line', life: [0.1, 0.18], add: true });
      if (kill && o.tag === 'step') hits += 100;
    }
    return hits;
  }
  overlapW(a, b) {
    if (overlap(a, b)) return true;
    const ax = a.x;
    a.x = ax + W; let r = overlap(a, b);
    if (!r) { a.x = ax - W; r = overlap(a, b); }
    a.x = ax;
    return r;
  }
  areaHit(p, x, y, r, dmg, o = {}) {
    let kills = 0;
    for (const e of [...this.enemies]) {
      if (e.dead || e.spawning > 0) continue;
      const er = { x: e.x, y: e.y, w: e.w, h: e.h };
      if (!circleRect(x, y, r, er) && !circleRect(x + W, y, r, er) && !circleRect(x - W, y, r, er)) continue;
      const ko = { ...o };
      if (o.kbx === undefined) ko.kbx = Math.sign(wrapDx(x, e.x + e.w / 2) || 1) * 120;
      if (this.hitEnemy(p, e, dmg, ko)) kills++;
    }
    return kills;
  }
  lineHit(p, x1, y1, x2, y2, th, dmg, o) {
    let kills = 0;
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
    for (const e of [...this.enemies]) {
      if (e.dead || e.spawning > 0) continue;
      const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
      const t = clamp(((ex - x1) * dx + (ey - y1) * dy) / L2, 0, 1);
      const px = x1 + dx * t, py = y1 + dy * t;
      const rr = th + Math.max(e.w, e.h) / 2;
      if (dist2(ex, ey, px, py) <= rr * rr) if (this.hitEnemy(p, e, dmg, o)) kills++;
    }
    return kills;
  }
  stat(p, key) {
    if (!p.local) return;
    if (key in this.local) this.local[key]++;
    else this.local[key] = 1;
  }

  // ================================================================= PLAYER PROJECTILES
  spawnProj(p, s) {
    const size = p.mods.size;
    const b = {
      id: `${p.id}:${this.localProjId++}`, owner: p.id, kind: s.kind, x: s.x, y: s.y, vx: s.vx, vy: s.vy, g: s.g || 0,
      r: (s.r || 3) * size, life: s.life || 1, dmg: s.dmg || 0, kb: s.kb || 0, pierce: s.pierce || 0, hit: new Set(), local: true,
      explode: s.explode ? { ...s.explode, r: s.explode.r * size } : null, mark: s.mark, perfect: s.perfect, bounce: s.bounce || 0,
      fuse: s.fuse, zone: s.zone, harmless: s.harmless, rain: s.rain, hue: s.hue || 0, t: 0, multiHitGroup: s.multiHitGroup,
    };
    if (s.assist && settings().assistAim) this.assistAim(b);
    this.pproj.push(b);
    this.session.emit({ type: 'shot', o: p.id, k: b.kind, x: round1(b.x), y: round1(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), g: b.g, r: b.r, l: b.life, bo: b.bounce, h: b.hue });
    return b;
  }
  assistAim(b) {
    // gently bend shots toward the closest enemy within a cone
    const sp = Math.hypot(b.vx, b.vy);
    const a0 = Math.atan2(b.vy, b.vx);
    let best = null, bestScore = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.phased) continue;
      const dx = wrapDx(b.x, e.x + e.w / 2), dy = e.y + e.h / 2 - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 260) continue;
      let da = Math.atan2(dy, dx) - a0;
      while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      if (Math.abs(da) > 0.32) continue;
      const sc = Math.abs(da) * 200 + d * 0.2;
      if (sc < bestScore) { bestScore = sc; best = da; }
    }
    if (best !== null && !b.g) {
      const a = a0 + best * 0.85;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    }
  }
  onRemoteShot(m) {
    this.pproj.push({ id: 'r' + this.localProjId++, owner: m.o, kind: m.k, x: m.x, y: m.y, vx: m.vx, vy: m.vy, g: m.g, r: m.r, life: m.l, local: false, bounce: m.bo || 0, hue: m.h || 0, t: 0, hit: new Set() });
    const sounds = { bolt: 'bolt', fireball: 'fireball', arrow: 'arrow', arrowBig: 'arrowBig', shuriken: 'shuriken', potion: 'throw', brew: 'throw', chili: 'throw', pellet: 'shotgun' };
    if (sounds[m.k]) sfx(sounds[m.k], { vol: 0.6, pan: this.pan(m.x), gap: 60 });
  }

  updatePlayerProjectiles(dt) {
    for (let i = this.pproj.length - 1; i >= 0; i--) {
      const b = this.pproj[i];
      b.t += dt;
      b.vy += b.g * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0) b.x += W; else if (b.x >= W) b.x -= W;
      b.life -= dt;
      let dead = b.life <= 0 || b.y > H + 20 || b.y < -80;
      if (b.life <= 0 && b.fuse) { this.projExplode(b); dead = true; }
      // trails
      if (b.kind === 'fireball' && Math.random() < 0.8) this.fx.add({ x: b.x, y: b.y, vx: rand(-20, 20), vy: rand(-30, 0), life: 0.3, size: rand(2, 4), color: pick(['#ffb347', '#ff6a2a', '#fff36b']), add: true });
      else if (b.kind === 'bolt' && Math.random() < 0.5) this.fx.add({ x: b.x, y: b.y, life: 0.2, size: 1.8, color: '#e0b0ff', add: true });
      else if (b.kind === 'arrowBig' && Math.random() < 0.7) this.fx.add({ x: b.x, y: b.y, life: 0.25, size: 1.6, color: '#fff6a0', add: true });
      else if (b.kind === 'chili' && Math.random() < 0.5) this.fx.add({ x: b.x, y: b.y - 4, vy: -20, life: 0.3, size: 1.5, color: '#ffd23d', add: true });
      // tiles
      if (!dead && this.solidAt(b.x, b.y)) {
        if (b.bounce > 0) {
          b.bounce--;
          // figure out which axis
          if (this.solidAt(b.x - b.vx * dt, b.y)) { b.vy = -b.vy * 0.55; b.y -= b.vy * dt * 2; b.vx *= 0.8; }
          else { b.vx = -b.vx * 0.6; b.x -= b.vx * dt * 2; }
        } else {
          if (b.local) this.projExplode(b);
          else if (b.kind === 'fireball' || b.kind === 'potion' || b.kind === 'chili') this.projVisualPop(b);
          else this.fx.burst(b.x, b.y, 3, { colors: ['#fff'], speed: [30, 80], g: 200, life: [0.1, 0.2] });
          dead = true;
        }
      }
      if (!dead && !b.harmless) {
        for (const e of this.enemies) {
          if (e.dead || e.spawning > 0 || e.phased || b.hit.has(e.id)) continue;
          const er = { x: e.x, y: e.y, w: e.w, h: e.h };
          if (!circleRect(b.x, b.y, b.r, er) && !circleRect(b.x + W, b.y, b.r, er) && !circleRect(b.x - W, b.y, b.r, er)) continue;
          b.hit.add(e.id);
          if (!b.local) { if (b.kind !== 'arrowBig') { dead = true; if (b.kind === 'fireball' || b.kind === 'potion' || b.kind === 'chili') this.projVisualPop(b); } break; }
          const p = this.playerById(b.owner);
          if (b.explode && !b.pierce) { this.projExplode(b, e); dead = true; break; }
          if (b.dmg > 0 && p) this.hitEnemy(p, e, b.dmg, { kbx: Math.sign(b.vx) * b.kb, kby: -b.kb * 0.4, mark: b.mark, heavy: b.perfect });
          if (b.pierce > 0) { b.pierce--; continue; }
          dead = true; break;
        }
      }
      if (dead) this.pproj.splice(i, 1);
    }
  }
  projVisualPop(b) {
    const col = b.kind === 'potion' ? ['#c45cff', '#ff9ad5', '#9dffb0'][b.hue % 3] : '#ffb347';
    this.fx.boom(b.x, b.y, b.kind === 'chili' ? 40 : 22, col);
  }
  projExplode(b, direct) {
    const p = this.playerById(b.owner);
    if (b.zone && p) {
      const z = { kind: b.zone.kind, x: b.x, y: Math.min(b.y, this.groundBelow(b.x, b.y - 4) - 8), r: b.zone.r * p.mods.size, life: b.zone.life, max: b.zone.life, owner: b.owner };
      this.zones.push(z);
      this.session.emit({ type: 'zone', z });
      sfx('splash', { pan: this.pan(b.x) });
      this.fx.burst(b.x, b.y, 16, { colors: ['#9dffb0', '#ffffff', '#ff9ad5'], speed: [40, 120], g: 100, shape: 'star', add: true });
      return;
    }
    if (!b.explode || !p) {
      this.fx.burst(b.x, b.y, 4, { colors: ['#fff'], speed: [30, 80], g: 200, life: [0.1, 0.2] });
      return;
    }
    const ex = b.explode;
    const col = b.kind === 'potion' ? ['#c45cff', '#ff9ad5', '#9dffb0'][b.hue % 3] : '#ffb347';
    this.fx.boom(b.x, b.y, ex.r * 0.8, col);
    this.fx.shake(ex.r > 40 ? 0.35 : 0.15);
    sfx(b.kind === 'potion' ? 'splash' : 'boom', { vol: ex.r / 50, pan: this.pan(b.x) });
    if (direct && b.dmg) this.hitEnemy(p, direct, b.dmg, { kbx: Math.sign(b.vx) * b.kb });
    this.areaHit(p, b.x, b.y, ex.r, ex.dmg, { burn: ex.burn, slow: ex.slow, kby: -160, heavy: ex.r > 40 });
    if (ex.launch && p.local && !p.down) {
      const d = Math.hypot(p.cx - b.x, p.cy - b.y);
      if (d < ex.r * 0.9) { p.vy = -440; p.vx += Math.sign(p.cx - b.x) * 120; p.airJumps = p.airJumpsMax; p.jumpCut = true; }
    }
  }

  // ================================================================= ENEMY PROJECTILES
  enemyShoot(e, s) {
    const b = { id: this.nextId++, kind: s.kind, x: s.x, y: s.y, vx: s.vx || 0, vy: s.vy || 0, g: s.g || 0, r: s.r || 3, life: s.life || 3, delay: s.delay || 0, homing: s.homing || 0, target: s.target ?? -1, slow: s.slow || 0, noclip: !!s.noclip, explode: s.explode || 0, static: !!s.static, t: 0 };
    this.eproj.push(b);
    this.broadcastEv({ type: 'ep', b: this.packEP(b) });
    if (!s.delay && !s.static) sfx('eshoot', { pitch: s.kind === 'bullet' ? 1.3 : 1, pan: this.pan(s.x), gap: 50 });
    return b;
  }
  packEP(b) {
    return { i: b.id, k: b.kind, x: round1(b.x), y: round1(b.y), vx: round1(b.vx), vy: round1(b.vy), g: b.g, r: b.r, l: b.life, d: b.delay, hm: b.homing, tg: b.target, sl: b.slow, nc: b.noclip ? 1 : 0, ex: b.explode, st: b.static ? 1 : 0 };
  }
  onRemoteEP(p) {
    this.eproj.push({ id: p.i, kind: p.k, x: p.x, y: p.y, vx: p.vx, vy: p.vy, g: p.g, r: p.r, life: p.l, delay: p.d, homing: p.hm, target: p.tg, slow: p.sl, noclip: !!p.nc, explode: p.ex, static: !!p.st, t: 0 });
    if (!p.d && !p.st) sfx('eshoot', { pan: this.pan(p.x), gap: 50 });
  }
  shockwave(e, x, y, speed, big) {
    for (const dir of [-1, 1]) this.enemyShoot(e, { kind: 'wave', x: x + dir * (e.w / 2 - 4), y: y - 6, vx: dir * speed, vy: 0, r: 6, life: 3 });
    this.fxEvent('slam', x, y, big ? 1 : 0.6);
  }
  updateEnemyProjectiles(dt) {
    for (let i = this.eproj.length - 1; i >= 0; i--) {
      const b = this.eproj[i];
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.t += dt;
      b.life -= dt;
      if (b.homing) {
        const tp = this.playerById(b.target);
        if (tp && !tp.down) {
          const want = Math.atan2(tp.cy - b.y, wrapDx(b.x, tp.cx));
          const cur = Math.atan2(b.vy, b.vx);
          let da = want - cur;
          while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
          const na = cur + clamp(da, -b.homing * dt, b.homing * dt);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.vy += b.g * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0) b.x += W; else if (b.x >= W) b.x -= W;
      let dead = b.life <= 0 || b.y > H + 30;
      if (b.kind === 'wave') {
        if (!this.solidAt(b.x, b.y + 8) && !this.platformAt(b.x, b.y + 8)) dead = true;
        if (this.solidAt(b.x, b.y)) dead = true;
        if (Math.random() < 0.5) this.fx.add({ x: b.x, y: b.y + 5, vx: rand(-20, 20), vy: rand(-60, -20), life: 0.3, size: 2, color: '#fff', g: 200 });
      } else if (!b.noclip && !b.static && this.solidAt(b.x, b.y)) {
        dead = true;
        if (b.explode) this.enemyExplode(b);
        else this.fx.burst(b.x, b.y, 4, { colors: this.epColors(b), speed: [30, 90], g: 200, life: [0.15, 0.3] });
      }
      if (b.kind === 'orb' && Math.random() < 0.4) this.fx.add({ x: b.x, y: b.y, life: 0.3, size: 1.8, color: '#d98aff', add: true });
      if (b.kind === 'bullet' && Math.random() < 0.2) this.fx.add({ x: b.x, y: b.y, life: 0.2, size: 1.5, color: '#ff7a3d', add: true });
      // collisions with local players
      if (!dead) {
        for (const p of this.players) {
          if (!p.local || p.down) continue;
          const hb = { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 3 };
          if (!circleRect(b.x, b.y, b.r * 0.85, hb)) continue;
          if (b.explode) { this.enemyExplode(b); dead = true; break; }
          if (p.invuln > 0 || p.dashT > 0) { if (!b.static && b.kind !== 'wave' && p.dashT > 0) dead = true; continue; }
          if (p.hurt(1, b.x, b.kind)) {
            if (b.slow) p.slowT = Math.max(p.slowT, b.slow);
            if (!b.static && b.kind !== 'wave') dead = true;
          }
          break;
        }
      }
      if (dead) this.eproj.splice(i, 1);
    }
  }
  enemyExplode(b) {
    this.fx.boom(b.x, b.y, b.explode, '#ff8a3d');
    sfx('boom', { vol: 0.6, pan: this.pan(b.x) });
    this.fx.shake(0.2);
    for (const p of this.players) {
      if (!p.local || p.down) continue;
      if (circleRect(b.x, b.y, b.explode, p)) p.hurt(1, b.x, 'boom');
    }
  }
  epColors(b) {
    return { candy: ['#ffd23d', '#ff8a2a'], shard: ['#bfefff', '#fff'], rock: ['#6b3f2a', '#a8683f'], boulder: ['#6b3f2a', '#a8683f'], icicle: ['#bfefff', '#fff'], jelly: ['#ff5a9e', '#ffb3d6'] }[b.kind] || ['#fff'];
  }
  blockEnemyShots(rect, p, freezeAll) {
    let n = 0;
    const ids = [];
    for (let i = this.eproj.length - 1; i >= 0; i--) {
      const b = this.eproj[i];
      if (b.delay > 0 || b.kind === 'wave' || b.kind === 'fire') continue;
      if (b.x > rect.x - b.r && b.x < rect.x + rect.w + b.r && b.y > rect.y - b.r && b.y < rect.y + rect.h + b.r) {
        this.eproj.splice(i, 1); n++; ids.push(b.id);
        this.fx.burst(b.x, b.y, 6, { colors: freezeAll ? ['#bfefff', '#fff'] : ['#fff6a0', '#fff'], speed: [60, 140], g: 0, life: [0.1, 0.25], add: true });
      }
    }
    if (n) {
      sfx('shield', { pan: this.pan(rect.x) });
      this.session.emit({ type: 'epx', ids });
      if (!this.isHost) { /* host will relay */ }
    }
    return n;
  }

  // ================================================================= CONTACT / HAZARDS (local players)
  contactChecks(dt) {
    for (const p of this.players) {
      if (!p.local || p.down) continue;
      for (const e of this.enemies) {
        if (e.dead || e.spawning > 0 || e.phased) continue;
        const shapes = [{ x: e.x + 1, y: e.y + 1, w: e.w - 2, h: e.h - 1 }];
        const pr = { x: p.x + 1, y: p.y, w: p.w - 2, h: p.h };
        let touching = this.overlapW(pr, shapes[0]);
        let segHit = false;
        if (!touching && e.def.segments && e.trail) {
          for (let k = 0; k < e.def.segments; k++) {
            const s = e.trail[Math.min(e.trail.length - 1, (k + 1) * 6)];
            if (s && circleRect(s.x, s.y, 8 - k * 0.5, pr)) { segHit = true; break; }
          }
        }
        if (!touching && !segHit) continue;
        if (p.rushT > 0 && !e.def.boss) {
          // Sugar Rush: plough through enemies
          const now = performance.now();
          if (!(e._rushHit > now)) { e._rushHit = now + 300; this.hitEnemy(p, e, 4, { kbx: Math.sign(e.x - p.x || 1) * 220, kby: -160, heavy: true }); }
          continue;
        }
        const stompDef = e.def.stomp;
        const feet = p.y + p.h;
        const canStomp = touching && p.vy > 30 && feet - e.y < Math.max(9, p.vy * dt * 2 + 5);
        if (e.frozen > 0) {
          if (canStomp) this.stomp(p, e, true);
          continue; // frozen enemies are harmless
        }
        if (canStomp && (stompDef === 'yes' || stompDef === 'bounce')) {
          this.stomp(p, e, false);
        } else if (p.invuln <= 0 && p.dashT <= 0) {
          p.hurt(1, e.x + e.w / 2, 'contact');
          if (canStomp && stompDef === 'spiky') { p.vy = -250; this.fx.text(p.cx, p.y - 10, 'OUCH!', { color: '#ff9a5a', size: 8 }); }
        }
      }
    }
  }
  stomp(p, e, shatter) {
    const c = p.ctl;
    const boost = p.mods.stompMul > 1;
    p.vy = c.jump ? (boost ? -440 : -370) : (boost ? -330 : -250);
    p.jumpCut = !c.jump;
    p.y = e.y - p.h;
    p.airJumps = p.airJumpsMax;
    p.sq = -0.35;
    const dmg = shatter ? 10 : (e.def.boss ? 3 : 3) * p.mods.stompMul;
    if (!e.armored) this.hitEnemy(p, e, dmg, { stun: 0.6, kby: 60, tag: 'stomp', heavy: shatter });
    else { sfx('shield'); }
    this.fx.ring(p.cx, p.y + p.h, 12, '#ffffff', 0.25, 2);
    this.fx.dust(p.cx, p.y + p.h, 5);
    sfx('stomp', { pitch: 1 + Math.min(0.5, this.combo * 0.02), pan: this.pan(p.cx) });
    this.local.stomps++;
    const st = this.statsById[p.id]; if (st) st.stomps++;
  }
  playerHazards(p, dt) {
    // spikes
    const spike = this.tilesUnder(p, T_SPIKE);
    if (spike && p.y + p.h > spike.r * TILE + 8) {
      if (p.hurt(1, spike.c * TILE + 8, 'spike')) p.vy = -330;
    }
    // springs
    const spr = this.tilesUnder(p, T_SPRING);
    if (spr && p.vy >= 0 && p.y + p.h > spr.r * TILE + 6) {
      p.vy = p.ctl.jump ? -560 : -480; p.jumpCut = true; p.airJumps = p.airJumpsMax; p.sq = -0.4;
      this.fxEvent('spring', spr.c * TILE + 8, (spr.r + 1) * TILE, 0);
    }
    // lava
    if (this.hasLava) {
      const lv = this.tilesUnder(p, T_LAVA);
      if (lv && p.y + p.h > lv.r * TILE + 4) {
        p.hurt(1, p.cx, 'lava', p.invuln < 0.6);
        p.vy = -470; p.jumpCut = true;
        this.fx.burst(p.cx, p.y + p.h, 12, { colors: ['#ff8a2a', '#ffd23d'], speed: [60, 160], g: 300, up: -80 });
      }
    }
  }

  // ================================================================= ZONES
  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      if (z.life <= 0) { this.zones.splice(i, 1); continue; }
      if (Math.random() < 0.5) this.fx.add({ x: z.x + rand(-z.r, z.r) * 0.8, y: z.y + rand(-z.r, z.r) * 0.4, vy: -30, life: 0.6, size: rand(1.5, 3), color: pick(['#9dffb0', '#ffffff', '#ff9ad5']), g: -10, add: true, shape: 'star' });
      if (z.kind === 'heal') {
        for (const p of this.players) {
          if (!p.local || p.down) continue;
          if (dist2(p.cx, p.cy, z.x, z.y) > z.r * z.r) continue;
          p.healTick += dt;
          if (p.healTick >= 1.2) {
            p.healTick = 0;
            if (p.hp < p.maxHp) { p.hp++; sfx('heal'); this.fx.text(p.cx, p.y - 8, '+♥', { color: '#9dffb0', size: 9 }); }
          }
        }
      }
    }
  }

  // ================================================================= TELEGRAPH / FX EVENTS
  fxEvent(k, x, y, r, ex) {
    this.applyFx({ k, x, y, r, ex });
    this.session.emit({ type: 'fx', k, x: round1(x), y: round1(y), r, ex });
  }
  applyFx(m) {
    const { k, x, y, r, ex } = m;
    switch (k) {
      case 'portal':
        this.portalFx.push({ x, y, t: 0, dur: r });
        sfx('portal', { pan: this.pan(x) });
        break;
      case 'nova': {
        const col = ex?.color || '#9fe6ff';
        this.fx.ring(x, y, r, col, 0.4, 5);
        this.fx.ring(x, y, r * 0.6, '#ffffff', 0.3, 3);
        this.fx.burst(x, y, 28, { colors: [col, '#ffffff'], speed: [r * 1.5, r * 3.5], g: 0, drag: 4, shape: 'star', add: true });
        this.fx.flash(x, y, r * 1.3, col, 0.2);
        sfx(ex?.color ? 'boom' : 'freeze', { pan: this.pan(x) });
        this.fx.shake(0.2);
        break;
      }
      case 'step': {
        const x2 = ex?.x2 ?? x, y2 = ex?.y2 ?? y;
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          this.fx.add({ x: x + (x2 - x) * t, y: y + (y2 - y) * t, life: 0.3 + t * 0.15, size: 5, color: 'rgba(120,90,200,0.6)', shape: 'smoke' });
        }
        this.fx.burst(x2, y2, 10, { colors: ['#c9a6ff', '#ffffff'], speed: [40, 120], g: 0, add: true, shape: 'star' });
        sfx('teleport', { pan: this.pan(x) });
        break;
      }
      case 'shake': this.fx.shake(r); break;
      case 'slam':
        this.fx.shake(0.3 + r * 0.4);
        this.fx.dust(x, y, 14);
        sfx('slam', { pan: this.pan(x) });
        break;
      case 'spring':
        sfx('spring', { pan: this.pan(x) });
        this.springAnim = this.springAnim || {};
        this.springAnim[`${Math.floor(x / TILE)}`] = 0.3;
        this.fx.burst(x, y - 4, 6, { colors: ['#ffffff', '#ff9ad5'], speed: [40, 100], g: 200, up: -60 });
        break;
      case 'enrage':
        this.fx.burst(x, y, 16, { colors: ['#ff3a2a', '#ffb347'], speed: [40, 140], g: 0, add: true });
        this.fx.text(x, y - 12, 'ENRAGED!', { color: '#ff5a3a', size: 7 });
        break;
      case 'lava':
        this.fx.burst(x, y, 14, { colors: ['#ff8a2a', '#ffd23d', '#ff3a2a'], speed: [60, 160], g: 300, up: -100 });
        sfx('splash', { pan: this.pan(x) });
        break;
      case 'teleTel':
        this.telegraphs.push({ kind: 'sparkle', x, y, t: 0, dur: r });
        break;
      case 'poof':
        this.fx.burst(x, y, 16, { colors: ['#c94dff', '#ffffff'], speed: [40, 120], g: 0, shape: 'star', add: true });
        break;
      case 'target':
        this.telegraphs.push({ kind: 'target', x, y, t: 0, dur: r + 0.6 });
        break;
      case 'line':
        this.telegraphs.push({ kind: 'line', x, y, x2: ex.x2, y2: ex.y2, t: 0, dur: r });
        break;
      case 'rush':
        this.fx.sparkle(x, y, 20, '#ffe14d');
        break;
    }
  }
  updateTelegraphs(dt) {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.t += dt;
      if (t.kind === 'sparkle' && Math.random() < 0.6) this.fx.add({ x: t.x + rand(-8, 8), y: t.y + rand(-10, 10), life: 0.4, size: 2, color: '#d98aff', shape: 'star', add: true });
      if (t.t > t.dur) this.telegraphs.splice(i, 1);
    }
    for (let i = this.portalFx.length - 1; i >= 0; i--) {
      const p = this.portalFx[i];
      p.t += dt;
      if (p.t > p.dur + 0.4) this.portalFx.splice(i, 1);
    }
    if (this.springAnim) for (const k in this.springAnim) this.springAnim[k] = Math.max(0, this.springAnim[k] - dt);
  }
  esfx(name, x, vol = 1) {
    sfx(name, { pan: this.pan(x), vol });
    if (this.session.role === 'host') this.session.broadcast({ type: 'sfx', n: name, x: Math.round(x) });
  }
  banner(title, sub) {
    this.hooks.banner?.(title, sub);
    if (this.session.role === 'host') this.session.broadcast({ type: 'banner', t: title, s: sub });
  }

  ambient(dt) {
    const a = this.theme.ambient;
    if (settings().quality === 'low') return;
    if (a === 'snow' && Math.random() < 0.5) this.fx.add({ x: rand(-20, W), y: -4, vx: rand(5, 25), vy: rand(15, 35), life: 12, size: rand(0.8, 1.8), color: 'rgba(255,255,255,0.85)', shape: 'snow', shrink: false, drag: 0 });
    if (a === 'embers' && Math.random() < 0.25) this.fx.add({ x: rand(0, W), y: H + 2, vx: rand(-10, 10), vy: rand(-40, -20), life: 7, size: rand(0.8, 1.6), color: pick(['#ff8a3d', '#ffd23d']), add: true, shrink: false, drag: 0 });
    if (a === 'petals' && Math.random() < 0.06) this.fx.add({ x: rand(-20, W), y: -4, vx: rand(10, 30), vy: rand(12, 24), life: 14, size: rand(1.2, 2), color: pick(['#ffc2e0', '#ffffff', '#ffe08a']), shape: 'square', vr: rand(-2, 2), shrink: false, drag: 0 });
    if (a === 'motes' && Math.random() < 0.08) this.fx.add({ x: rand(0, W), y: rand(0, H), vx: rand(-5, 5), vy: rand(-8, -2), life: 4, size: rand(0.8, 1.5), color: pick(['#ffcf5c', '#c9f']), add: true, drag: 0 });
  }

  // ================================================================= PLAYER EVENTS
  onPlayerHit(p) {
    this.teamHits++;
    if (this.isHost) this.comboPenalty(p.id);
    else this.session.send({ type: 'phit', i: p.id });
    this.local.hits++;
  }
  comboPenalty(pid) {
    this.combo = Math.floor(this.combo / 2);
    const st = this.statsById[pid]; if (st) st.hits++;
  }
  onPlayerDown(p) {
    this.anyDowned = true;
    const st = this.statsById[p.id]; if (st) st.downs++;
    this.session.emit({ type: 'pdown', i: p.id });
  }
  onPlayerRevived(p, byId) {
    this.session.emit({ type: 'prev', i: p.id, by: byId });
    this.handleRevived(p.id, byId);
  }
  handleRevived(pid, byId) {
    if (byId >= 0) {
      const st = this.statsById[byId]; if (st) st.revives++;
      const by = this.playerById(byId);
      if (by?.local) this.local.revives++;
      const p = this.playerById(pid);
      if (p && by) this.fx.text(p.cx, p.y - 14, `${by.name} saved ${p.name}!`, { color: '#fff6a0', size: 7, life: 1.4 });
    }
  }

  // ================================================================= LEVEL END
  levelClear(delay = 0.8) {
    if (this.state !== 'play' && this.state !== 'intro') return;
    this.state = 'clear'; this.stateT = 0;
    // clear remaining enemies with poofs
    for (const e of this.enemies) this.fxEvent('poof', e.x + e.w / 2, e.y + e.h / 2, 12);
    this.enemies.length = 0;
    this.eproj.length = 0;
    this.portalQueue.length = 0;
    const result = this.buildResult('clear');
    setTimeout(() => this.endLevel(result), delay * 1000);
  }
  levelFail() {
    if (this.state !== 'play') return;
    this.state = 'fail'; this.stateT = 0;
    const result = this.buildResult('fail');
    setTimeout(() => this.endLevel(result), 600);
  }
  buildResult(kind) {
    const L = this.level, n = this.nPlayers;
    const time = Math.round(this.time);
    const stars = [kind === 'clear', false, false];
    if (kind === 'clear') {
      if (L.type === 'survive') { stars[1] = !this.anyDowned; stars[2] = this.bestCombo >= 15; }
      else if (L.type === 'waves') { stars[1] = !this.anyDowned; stars[2] = this.teamHits <= n + 1; }
      else { stars[1] = time <= L.par * (1 + 0.1 * (n - 1)); stars[2] = this.teamHits <= n + (L.type === 'boss' ? 2 : 1); }
    }
    return { type: 'lvlend', kind, levelId: L.id, score: this.score, time, stars, bestCombo: this.bestCombo, teamHits: this.teamHits, stats: this.statsById, nPlayers: n, muffins: this.obj.count };
  }
  endLevel(result) {
    if (this.ended) return;
    this.ended = true;
    if (this.session.role === 'host') this.session.broadcast(result);
    this.hooks.end?.(result);
  }
  starGoals() {
    const L = this.level, n = this.nPlayers;
    if (L.type === 'survive') return ['Survive', 'Nobody gets knocked out', 'Reach a 15x combo'];
    if (L.type === 'waves') return ['Clear all waves', 'Nobody gets knocked out', `Team takes ≤ ${n + 1} hits`];
    return [L.type === 'boss' ? 'Defeat the boss' : 'Grab the Golden Muffin', `Clear in ${Math.round(L.par * (1 + 0.1 * (n - 1)))}s`, `Team takes ≤ ${n + (L.type === 'boss' ? 2 : 1)} hits`];
  }

  // ================================================================= NETWORK
  setupNet() {
    const s = this.session;
    if (!s.online) return;
    const now = () => performance.now();
    if (this.isHost) {
      s.on('ps', (m, from) => {
        for (const st of m.p) {
          const p = this.playerById(st.i);
          if (p && !p.local && p.peer === from) {
            const wasDown = p.down;
            p.applyNet(st, now());
            if (!wasDown && p.down) this.anyDowned = true;
          }
        }
      });
      s.on('hit', (m) => {
        const e = this.enemyById(m.e);
        if (e) this.applyHit(e, m.d, m, m.by);
        const st = this.statsById[m.by]; if (st) st.dmg += m.d;
      });
      s.on('phit', (m) => { this.teamHits++; this.comboPenalty(m.i); });
      s.on('shot', (m, from) => { s.broadcast(m, from); this.onRemoteShot(m); });
      s.on('zone', (m, from) => { s.broadcast(m, from); this.zones.push(m.z); sfx('splash', { pan: this.pan(m.z.x) }); });
      s.on('fx', (m, from) => { s.broadcast(m, from); this.applyFx(m); });
      s.on('epx', (m, from) => { s.broadcast(m, from); this.removeEP(m.ids); });
      s.on('pdown', (m, from) => { s.broadcast(m, from); this.anyDowned = true; const st = this.statsById[m.i]; if (st) st.downs++; });
      s.on('prev', (m, from) => { s.broadcast(m, from); this.handleRevived(m.i, m.by); });
    } else {
      s.on('snap', (m) => this.onSnap(m));
      s.on('ep', (m) => this.onRemoteEP(m.b));
      s.on('epx', (m) => this.removeEP(m.ids));
      s.on('edie', (m) => this.onEnemyDie(m));
      s.on('pick', (m) => this.onPick(m));
      s.on('shot', (m) => this.onRemoteShot(m));
      s.on('zone', (m) => { this.zones.push(m.z); sfx('splash', { pan: this.pan(m.z.x) }); });
      s.on('fx', (m) => this.applyFx(m));
      s.on('sfx', (m) => sfx(m.n, { pan: m.x !== undefined ? this.pan(m.x) : 0 }));
      s.on('banner', (m) => this.hooks.banner?.(m.t, m.s));
      s.on('pdown', () => { this.anyDowned = true; });
      s.on('prev', (m) => this.handleRevived(m.i, m.by));
      s.on('lvlend', (m) => { this.state = m.kind; this.endLevel(m); });
    }
  }
  removeEP(ids) {
    const set = new Set(ids);
    this.eproj = this.eproj.filter((b) => !set.has(b.id));
  }
  broadcastEv(m, playLocal) {
    if (this.session.role === 'host') this.session.broadcast(m);
    if (playLocal && m.type === 'sfx') sfx(m.n);
  }
  netTick() {
    const s = this.session;
    if (!s.online || this.step % SNAP_EVERY !== 0 || this.lastNetStep === this.step) return;
    this.lastNetStep = this.step;
    if (this.isHost) {
      const snap = {
        type: 'snap', t: round1(this.time),
        e: this.enemies.map((e) => ({
          i: e.id, t: e.type, x: round1(e.x), y: round1(e.y), vx: Math.round(e.vx), vy: Math.round(e.vy), f: e.facing, s: e.state,
          h: Math.ceil(e.hp), m: e.maxHp,
          b: (e.frozen > 0 ? 1 : 0) | (e.burn > 0 ? 2 : 0) | (e.mark > 0 ? 4 : 0) | (e.enraged ? 8 : 0) | (e.armored ? 16 : 0) | (e.stun > 0 ? 32 : 0) | (e.slow > 0 ? 64 : 0) | (e.phased ? 128 : 0) | (e.vuln ? 256 : 0) | (e.spawning > 0 ? 512 : 0),
          ph: e.data?.phase,
        })),
        k: this.pickups.map((k) => ({ i: k.id, k: k.kind, x: round1(k.x), y: round1(k.y), b: k.bonus ? 1 : 0, l: k.life !== undefined ? round1(k.life) : -1 })),
        pl: this.players.filter((p) => p.present).map((p) => (p.local ? p.serialize() : p.netState)).filter(Boolean),
        m: { sc: this.score, cb: this.combo, ct: round1(this.comboT), c: this.obj.count, g: this.obj.goal, tl: round1(this.obj.timeLeft), gd: this.obj.golden ? 1 : 0, wv: this.obj.wave, wk: this.obj.killed, wt: this.obj.toKill, st: this.state, bi: this.obj.bossId, th: this.teamHits },
      };
      s.broadcast(snap);
    } else {
      s.send({ type: 'ps', p: this.localPlayers().map((p) => p.serialize()) });
    }
  }
  onSnap(m) {
    const now = performance.now();
    this.snaps.push({ rt: now, m });
    if (this.snaps.length > 12) this.snaps.shift();
    // meta
    this.score = m.m.sc; this.combo = m.m.cb; this.comboT = m.m.ct;
    this.obj.count = m.m.c; this.obj.goal = m.m.g; this.obj.timeLeft = m.m.tl; this.obj.golden = !!m.m.gd;
    this.obj.wave = m.m.wv; this.obj.killed = m.m.wk; this.obj.toKill = m.m.wt; this.obj.bossId = m.m.bi; this.teamHits = m.m.th;
    if (m.m.st !== this.state && (m.m.st === 'play' || m.m.st === 'intro')) { this.state = m.m.st; }
    if (this.bestCombo < this.combo) this.bestCombo = this.combo;
    // players
    for (const st of m.pl) {
      const p = this.playerById(st.i);
      if (p && !p.local) p.applyNet(st, now);
    }
    // enemies: create / update puppets
    const seen = new Set();
    for (const d of m.e) {
      seen.add(d.i);
      let e = this.enemyById(d.i);
      if (!e) {
        const def = enemyDef(d.t);
        if (!def) continue;
        e = { id: d.i, type: d.t, def, x: d.x, y: d.y, w: def.w, h: def.h, vx: 0, vy: 0, hp: d.h, maxHp: d.m, facing: d.f, state: d.s, st: 0, data: {}, buf: [], trail: [], flash: 0 };
        this.enemies.push(e);
      }
      if (d.h < e.hp) e.flash = Math.max(e.flash, 0.1);
      e.hp = d.h; e.maxHp = d.m; e.predHp = d.h;
      if (e.state !== d.s) { e.state = d.s; e.st = 0; }
      e.facing = d.f; e.vx = d.vx; e.vy = d.vy;
      e.frozen = d.b & 1 ? 1 : 0; e.burn = d.b & 2 ? 1 : 0; e.mark = d.b & 4 ? 1 : 0; e.enraged = !!(d.b & 8);
      e.armored = !!(d.b & 16); e.stun = d.b & 32 ? 1 : 0; e.slow = d.b & 64 ? 1 : 0; e.phased = !!(d.b & 128); e.vuln = !!(d.b & 256); e.spawning = d.b & 512 ? 0.2 : 0;
      if (d.ph) e.data.phase = d.ph;
      e.buf.push({ t: now, x: d.x, y: d.y });
      if (e.buf.length > 10) e.buf.shift();
    }
    this.enemies = this.enemies.filter((e) => seen.has(e.id));
    if (this.obj.bossId) this.obj.boss = this.enemyById(this.obj.bossId) || null;
    // pickups
    const kseen = new Set();
    for (const d of m.k) {
      kseen.add(d.i);
      let k = this.pickups.find((q) => q.id === d.i);
      if (!k) { k = { id: d.i, kind: d.k, x: d.x, y: d.y, w: d.k === 'golden' ? 14 : 10, h: d.k === 'golden' ? 14 : 10, t: 0, buf: [] }; this.pickups.push(k); }
      k.bonus = !!d.b; k.life = d.l >= 0 ? d.l : undefined;
      k.buf.push({ t: now, x: d.x, y: d.y });
      if (k.buf.length > 6) k.buf.shift();
    }
    this.pickups = this.pickups.filter((k) => kseen.has(k.id));
  }
  clientInterp(dt) {
    const rt = performance.now() - INTERP_DELAY;
    const sample = (buf) => {
      if (!buf.length) return null;
      if (rt <= buf[0].t) return buf[0];
      for (let i = 0; i < buf.length - 1; i++) {
        const a = buf[i], b = buf[i + 1];
        if (rt >= a.t && rt <= b.t) {
          const k = (rt - a.t) / (b.t - a.t || 1);
          if (Math.abs(b.x - a.x) > W / 2) return k < 0.5 ? a : b;
          return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        }
      }
      return buf[buf.length - 1];
    };
    for (const e of this.enemies) {
      e.st += dt;
      e.flash = Math.max(0, e.flash - dt);
      const s = sample(e.buf);
      if (s) { e.x = s.x; e.y = s.y; }
      if (e.def.segments) { e.trail.unshift({ x: e.x + e.w / 2, y: e.y + e.h / 2 }); if (e.trail.length > 70) e.trail.pop(); }
    }
    for (const k of this.pickups) {
      k.t += dt;
      const s = sample(k.buf);
      if (s) { k.x = s.x; k.y = s.y; }
    }
  }
  removePeer(peerId) {
    for (const p of this.players) if (p.peer === peerId) { p.present = false; p.down = true; }
  }
}
