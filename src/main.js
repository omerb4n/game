// Pastry Paladins — app shell: screens, run flow, lobby & online orchestration, main loop.
import { DT, W, H, roomCode, isTouchDevice, clamp, fmtTime, rrect } from './util.js';
import { load, save, S, settings, recordLevel, totalStars, addCoins, levelRecord, resetSave } from './save.js';
import { initAudio, sfx, playMusic, stopMusic, applyVolumes, setDuck, resumePendingMusic } from './audio.js';
import { Controller, initKeyboard, onNav, pollPadsForMenu, touch, endSample, clearLatches, emitNav, connectedPads } from './input.js';
import { HEROES, heroById, heroPortrait, HATS, drawHero, PLAYER_COLORS } from './data/heroes.js';
import { WORLDS, LEVELS, levelById, worldLevels, expandMap, endlessStage, bossRushStage } from './data/levels.js';
import { PERKS, perkById, rollPerks, ACHIEVEMENTS } from './data/perks.js';
import { World } from './game/world.js';
import { Renderer, levelThumb } from './game/render.js';
import { MenuScene } from './menuscene.js';
import { localSession, hostSession, joinSession } from './net.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const USE_BC = params.get('net') === 'bc';

const MODES = {
  campaign: { name: 'Campaign', icon: '🗺', desc: '4 worlds, 20 levels, 4 bosses. Earn stars & unlock heroes.' },
  endless: { name: 'Endless', icon: '∞', desc: 'Survive escalating waves across all arenas. Bosses every 4th stage.' },
  bossrush: { name: 'Boss Rush', icon: '☠', desc: 'All four bosses back to back with perks in between.' },
};
const DIFFS = { casual: 'Casual', normal: 'Normal', hard: 'Hard' };
const MUTATORS = {
  enraged: { name: 'All Enraged', icon: '😡', desc: 'Every enemy spawns enraged. Score ×1.5' },
  glass: { name: 'Glass Cannon', icon: '◆', desc: '1 heart each, double damage. Score ×1.5' },
  lowgrav: { name: 'Low Gravity', icon: '🌙', desc: 'Floaty jumps for everyone' },
  rush: { name: 'Sugar Party', icon: '🌈', desc: 'Sugar Rush power-ups drop constantly' },
  bighead: { name: 'Big Bakers', icon: '🎈', desc: 'Everyone is 40% bigger. Just for fun' },
};

function tilesForLevel(level) {
  const rows = expandMap(level);
  const map = { '#': 1, '=': 2, '-': 3, '^': 4, o: 5, i: 6, L: 7 };
  const t = new Uint8Array(32 * 18);
  for (let r = 0; r < 18; r++) for (let c = 0; c < 32; c++) t[r * 32 + c] = map[rows[r][c]] || 0;
  return t;
}

function heroUnlocked(h) {
  if (!h.unlock || settings().unlockAll) return true;
  return S().worldsCleared.includes(h.unlock.world);
}
function worldUnlocked(id) {
  return id === 1 || settings().unlockAll || S().worldsCleared.includes(id - 1);
}
function levelUnlocked(level) {
  if (settings().unlockAll) return true;
  if (!worldUnlocked(level.world)) return false;
  const lv = worldLevels(level.world);
  const i = lv.indexOf(level);
  if (i === 0) return true;
  const prev = levelRecord(lv[i - 1].id);
  return !!(prev && prev.stars[0]);
}
function nextLevelInWorld(id) {
  const l = levelById(id);
  const lv = worldLevels(l.world);
  return lv[lv.indexOf(l) + 1] || null;
}

class App {
  constructor() {
    this.canvas = $('#game');
    this.ui = $('#ui');
    this.renderer = new Renderer(this.canvas);
    this.menu = new MenuScene(this.renderer);
    this.screen = '';
    this.world = null;
    this.session = localSession();
    this.localSlots = []; // [{ctl, hero, hat}]
    this.roster = []; // [{id, peer, slot, hero, hat, name, perks}]
    this.lobby = { mode: 'campaign', diff: settings().difficulty, mutators: [] };
    this.run = null;
    this.acc = 0;
    this.last = performance.now();
    this.fpsT = 0; this.fpsN = 0; this.fps = 60;
    this.perkDone = new Set();
    this.portraitTimers = [];
  }

  // =============================================================== BOOT
  init() {
    load();
    initKeyboard();
    touch.build($('#touch-root'));
    window.addEventListener('resize', () => { this.renderer.resize(); });
    this.renderer.resize();
    const unlockAudio = () => { initAudio(); resumePendingMusic(); };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    onNav((ev) => this.onNav(ev));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.screen === 'game' && !this.session.online) this.pause(); });
    this.ui.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      sfx(el.dataset.sfx || 'click');
      this.action(el.dataset.act, el.dataset, el);
    });
    this.ui.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-nav]'); if (el && !el.disabled && el !== this.lastHover) { this.lastHover = el; sfx('hover'); } });
    window.addEventListener('keydown', () => { if (this.screen === 'lobby') this.kbTouched = true; });
    window.addEventListener('contextmenu', (e) => { if (!e.target.closest?.('input')) e.preventDefault(); });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', () => { if (this.screen === 'lobby') this.toast('🎮 Gamepad connected — press A to join!'); });
    const join = params.get('join');
    if (join) this.goJoin(join.toUpperCase());
    else this.goTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  // =============================================================== LOOP
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.fpsT += dt; this.fpsN++;
    if (this.fpsT > 0.5) { this.fps = Math.round(this.fpsN / this.fpsT); this.fpsT = 0; this.fpsN = 0; }
    // menu gamepad nav
    for (const ev of pollPadsForMenu()) this.onPadEvent(ev);
    if (this.world && (this.screen === 'game' || this.screen === 'pause' || this.overlayOverGame)) {
      const w = this.world;
      w.inputBlocked = this.screen !== 'game';
      if (this.screen === 'game' || this.session.online) {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= DT && steps < 4) {
          w.update(DT);
          this.acc -= DT; steps++;
          this.checkPauseInput();
        }
        if (steps >= 4) this.acc = 0;
      }
      this.renderer.render(w, dt, this);
      this.updateTouchHud();
    } else {
      this.menu.update(dt);
      this.menu.draw();
    }
    if (settings().showFps) {
      const ctx = this.renderer.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = '600 12px Fredoka, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      ctx.fillText(`${this.fps} fps`, 8, this.renderer.view.ch - 8);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
  checkPauseInput() {
    if (this.screen !== 'game') return;
    for (const p of this.world.localPlayers()) if (p.ctl && p.ctl.pauseP) { p.ctl.clearEdges(); this.pause(); return; }
  }
  updateTouchHud() {
    if (!touch.enabled || !this.world) return;
    const p = this.world.localPlayers().find((q) => q.ctl?.kind === 'touch');
    if (!p) return;
    const frac = p.specialMax ? 1 - p.cd.special / p.specialMax : 1;
    touch.setCooldown(clamp(frac, 0, 1), frac >= 1);
    touch.setCharge(p.charging ? Math.min(1, p.charge) : 0);
  }

  // =============================================================== NAV
  onPadEvent(ev) {
    if (this.screen === 'lobby' && this.lobbyPadEvent(ev)) return;
    if (this.screen === 'game') return;
    const map = { up: 'up', down: 'down', left: 'left', right: 'right', ok: 'ok', back: 'back', start: 'ok' };
    if (map[ev.dir]) this.onNav({ dir: map[ev.dir], device: 'pad', padIndex: ev.padIndex });
  }
  onNav(ev) {
    if (this.screen === 'game') return;
    if (ev.device === 'keyboard' && document.activeElement?.tagName === 'INPUT' && ev.dir !== 'back') return;
    const items = $$('[data-nav]', this.ui).filter((e) => e.offsetParent !== null && !e.disabled);
    if (!items.length) return;
    let cur = document.activeElement;
    if (!items.includes(cur)) cur = null;
    if (ev.dir === 'ok') {
      if (performance.now() < (this.navLockUntil || 0)) return;
      if (cur) cur.click(); else items[0].focus();
      return;
    }
    if (ev.dir === 'back') { this.back(); return; }
    if (!cur) { items[0].focus(); return; }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bd = 1e9;
    for (const el of items) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      const dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      let ok = false, d = 0;
      if (ev.dir === 'up') { ok = dy < -4; d = -dy + Math.abs(dx) * 2.2; }
      if (ev.dir === 'down') { ok = dy > 4; d = dy + Math.abs(dx) * 2.2; }
      if (ev.dir === 'left') { ok = dx < -4; d = -dx + Math.abs(dy) * 2.2; }
      if (ev.dir === 'right') { ok = dx > 4; d = dx + Math.abs(dy) * 2.2; }
      if (ok && d < bd) { bd = d; best = el; }
    }
    if (best) { best.focus(); sfx('hover'); if (best.type === 'range') { /* noop */ } }
    else if (cur.type === 'range' && (ev.dir === 'left' || ev.dir === 'right')) {
      cur.value = Number(cur.value) + (ev.dir === 'left' ? -1 : 1) * Number(cur.step || 0.1);
      cur.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  back() {
    sfx('back');
    const b = { online: 'title', heroes: 'title', achievements: 'title', settings: this.settingsReturn || 'title', howto: 'title', worldmap: 'lobby', lobby: 'title' }[this.screen];
    if (this.screen === 'pause') return this.resume();
    if (this.screen === 'lobby') return this.leaveLobby();
    if (this.screen === 'worldmap' && this.session.role === 'client') return;
    if (b === 'title') this.goTitle();
    else if (b === 'lobby') this.goLobby();
    else if (b === 'pause') this.pause();
  }

  // =============================================================== RENDER HELPERS
  show(name, html, cls = '') {
    this.clearPortraits();
    if (name === 'results' || name === 'perks') this.navLockUntil = performance.now() + 900;
    this.screen = name;
    this.ui.className = `ui-${name}`;
    this.ui.innerHTML = `<div class="screen ${name} ${cls}">${html}</div>`;
    const first = $('[data-autofocus]:not(:disabled)', this.ui) || $('[data-nav]:not([data-act="back"]):not(:disabled)', this.ui);
    if (first && !isTouchDevice()) setTimeout(() => first.focus({ preventScroll: true }), 30);
    touch.show(name === 'game' && this.hasTouchPlayer());
    $('#pausebtn').classList.toggle('on', name === 'game' && !isTouchDevice());
    this.livePortraits();
  }
  hasTouchPlayer() { return this.world?.localPlayers().some((p) => p.ctl?.kind === 'touch'); }
  clearPortraits() { for (const t of this.portraitTimers) clearInterval(t); this.portraitTimers = []; }
  livePortraits() {
    const cans = $$('canvas[data-hero]', this.ui);
    if (!cans.length) return;
    let t = 0;
    const draw = () => {
      t += 0.05;
      for (const c of cans) heroPortrait(c, c.dataset.hero, c.dataset.hat || 'none', { t, bg: c.dataset.bg !== '0' });
    };
    draw();
    this.portraitTimers.push(setInterval(draw, 50));
  }
  toast(msg, icon = '') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${icon ? `<span class="ti">${icon}</span>` : ''}<span>${msg}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }
  starsHtml(stars, cls = '') {
    return `<span class="stars ${cls}">${[0, 1, 2].map((i) => `<i class="${stars?.[i] ? 'on' : ''}">★</i>`).join('')}</span>`;
  }
  coinBar() {
    return `<div class="coinbar"><span title="Stars">⭐ ${totalStars()}/60</span><span title="Sprinkle coins">💎 ${S().coins}</span></div>`;
  }

  // =============================================================== TITLE
  goTitle() {
    if (this.session.online) { this.session.close(); this.session = localSession(); }
    this.world = null;
    playMusic('menu');
    setDuck(1);
    this.show('title', `
      <div class="title-wrap">
        <div class="logo">
          <div class="logo-top" data-t="PASTRY"><span>PASTRY</span></div>
          <div class="logo-bot" data-t="PALADINS"><span>PALADINS</span></div>
          <div class="tagline">Co-op crumb-crushing for 1–4 bakers</div>
        </div>
        <div class="menu">
          <button class="btn big primary" data-nav data-act="play" data-autofocus>▶ Play</button>
          <button class="btn big online" data-nav data-act="online">🌐 Online Co-op</button>
          <div class="row">
            <button class="btn" data-nav data-act="heroes">🧁 Heroes</button>
            <button class="btn" data-nav data-act="achievements">🏆 Trophies</button>
          </div>
          <div class="row">
            <button class="btn" data-nav data-act="howto">❓ How to Play</button>
            <button class="btn" data-nav data-act="settings">⚙ Settings</button>
          </div>
        </div>
      </div>
      ${this.coinBar()}
      <button class="btn icon fsbtn" data-nav data-act="fullscreen" title="Fullscreen">⛶</button>
      <div class="version">v1.0 · made with ♥ and butter</div>
    `);
  }

  // =============================================================== ACTIONS
  action(act, d, el) {
    switch (act) {
      case 'play': this.startLocalLobby(); break;
      case 'online': this.goOnline(); break;
      case 'heroes': this.goHeroes(); break;
      case 'achievements': this.goAchievements(); break;
      case 'settings': this.settingsReturn = this.screen === 'pause' ? 'pause' : 'title'; this.goSettings(); break;
      case 'howto': this.goHowto(); break;
      case 'title': this.goTitle(); break;
      case 'back': this.back(); break;
      case 'fullscreen': this.toggleFullscreen(); break;
      // lobby
      case 'hero': this.cycleHero(+d.slot, +d.dir); break;
      case 'hat': this.cycleHat(+d.slot, +d.dir); break;
      case 'removeSlot': this.removeLocalSlot(+d.slot); break;
      case 'addKb': this.addKeyboardPlayer(); break;
      case 'mode': this.lobby.mode = d.mode; this.syncLobby(); this.renderLobby(); break;
      case 'diff': this.lobby.diff = d.diff; settings().difficulty = d.diff; save(); this.syncLobby(); this.renderLobby(); break;
      case 'mut': {
        const m = new Set(this.lobby.mutators || []);
        if (m.has(d.mut)) m.delete(d.mut); else m.add(d.mut);
        this.lobby.mutators = [...m]; this.syncLobby(); this.renderLobby();
        break;
      }
      case 'startLobby': this.lobbyStart(); break;
      case 'copyLink': this.copyLink(); break;
      case 'host': this.hostOnline(); break;
      case 'join': this.joinOnline(); break;
      // world map
      case 'selWorld': this.mapSel = { world: +d.world, level: null }; this.renderWorldMap(); break;
      case 'selLevel': this.mapSel.level = d.level; this.renderWorldMap(); this.syncMap(); break;
      case 'playLevel': this.startRun('campaign', d.level); break;
      // results
      case 'continue': this.resultsContinue(); break;
      case 'retry': this.startStage(); break;
      case 'toMap': this.hostGotoMapOrLobby(); break;
      case 'quitRun': this.quitRun(); break;
      // perks
      case 'perk': this.pickPerk(+d.pid, d.perk); break;
      // pause
      case 'resume': this.resume(); break;
      case 'restart': this.resume(); this.startStage(); break;
      case 'quit': this.quitRun(); break;
      // heroes screen
      case 'viewHero': this.heroSel = d.hero; this.goHeroes(); break;
      case 'buyHat': this.buyHat(d.hat); break;
      case 'equipHat': S().equipped[this.heroSel] = d.hat; save(); this.goHeroes(); break;
      // settings
      case 'toggle': settings()[d.key] = !settings()[d.key]; save(); this.applySettings(); this.goSettings(); break;
      case 'setq': settings()[d.key] = d.val; save(); this.applySettings(); this.goSettings(); break;
      case 'reset': if (confirm('Reset ALL progress, coins, hats and trophies?')) { resetSave(); this.toast('Progress reset'); this.goSettings(); } break;
    }
  }
  toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.then?.(() => { try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => {});
    } else document.exitFullscreen?.();
  }
  applySettings() {
    applyVolumes();
    touch.applyLayout();
    this.renderer.resize();
  }

  // =============================================================== LOCAL LOBBY
  defaultCtl() { return isTouchDevice() ? new Controller('touch') : new Controller('kbFull'); }
  startLocalLobby() {
    if (this.session.online) { this.session.close(); this.session = localSession(); }
    if (!this.localSlots.length) this.localSlots = [{ ctl: this.defaultCtl(), hero: this.firstHero(), hat: null }];
    // re-validate devices (pads may have disconnected)
    this.localSlots = this.localSlots.filter((s) => s.ctl.kind !== 'pad' || connectedPads().includes(s.ctl.padIndex));
    if (!this.localSlots.length) this.localSlots = [{ ctl: this.defaultCtl(), hero: this.firstHero(), hat: null }];
    this.lobby.diff = settings().difficulty;
    this.goLobby();
  }
  firstHero(exclude = []) {
    return (HEROES.find((h) => heroUnlocked(h) && !exclude.includes(h.id)) || HEROES[0]).id;
  }
  goLobby() {
    this.world = null;
    playMusic('menu');
    this.rebuildRoster();
    this.renderLobby();
  }
  rebuildRoster() {
    if (this.session.role === 'client') return; // client receives roster from host
    const mine = this.localSlots.map((s, i) => ({ peer: this.session.myId, slot: i, hero: s.hero, hat: s.hat || S().equipped[s.hero] || 'none', name: this.session.online ? (S().name || 'Host') : `P${i + 1}` }));
    const remote = this.roster.filter((r) => r.peer !== this.session.myId);
    const all = [...mine, ...remote].slice(0, 4);
    this.roster = all.map((r, i) => ({ ...r, id: i, name: this.session.online ? r.name : `P${i + 1}`, perks: r.perks || [] }));
  }
  lobbyPadEvent(ev) {
    // Gamepad joins / hero switching for its own slot
    const slotIdx = this.localSlots.findIndex((s) => s.ctl.kind === 'pad' && s.ctl.padIndex === ev.padIndex);
    if (slotIdx < 0) {
      if ((ev.dir === 'ok' || ev.dir === 'start') && this.localSlots.length === 1 && this.localSlots[0].ctl.kind === 'kbFull' && !this.kbTouched) {
        // a lone gamepad player takes over P1 instead of leaving an idle keyboard player
        this.localSlots[0].ctl = new Controller('pad', ev.padIndex);
        this.toast('🎮 Gamepad is now P1 · use "Add keyboard player" for a friend');
        sfx('join');
        this.rebuildRoster(); this.syncLobby(); this.renderLobby();
        return true;
      }
      if ((ev.dir === 'ok' || ev.dir === 'start') && this.localSlots.length < 4 && this.session.role !== 'client' && this.roster.length < 4) {
        this.localSlots.push({ ctl: new Controller('pad', ev.padIndex), hero: this.firstHero(this.localSlots.map((s) => s.hero)), hat: null });
        sfx('join');
        this.rebuildRoster(); this.syncLobby(); this.renderLobby();
        return true;
      }
      return false;
    }
    if (ev.dir === 'left' || ev.dir === 'right') { this.cycleHero(slotIdx, ev.dir === 'left' ? -1 : 1); return true; }
    if (ev.dir === 'y') { this.cycleHat(slotIdx, 1); return true; }
    if (ev.dir === 'back' && slotIdx > 0) { this.removeLocalSlot(slotIdx); return true; }
    if (ev.dir === 'start' || ev.dir === 'x') { this.lobbyStart(); return true; }
    if (ev.dir === 'up' || ev.dir === 'down' || ev.dir === 'ok') return false; // let menu nav handle
    return true;
  }
  addKeyboardPlayer() {
    if (this.localSlots.length >= 4 || this.roster.length >= 4) return;
    this.kbTouched = true;
    if (!this.localSlots.some((s) => s.ctl.kind.startsWith('kb'))) {
      this.localSlots.push({ ctl: new Controller('kbFull'), hero: this.firstHero(this.localSlots.map((s) => s.hero)), hat: null });
      sfx('join'); this.rebuildRoster(); this.syncLobby(); this.renderLobby();
      return;
    }
    const full = this.localSlots.find((s) => s.ctl.kind === 'kbFull');
    if (full) full.ctl = new Controller('kbLeft');
    else if (this.localSlots.some((s) => s.ctl.kind === 'kbLeft' || s.ctl.kind === 'kbRight')) return;
    this.localSlots.push({ ctl: new Controller(full ? 'kbRight' : 'kbFull'), hero: this.firstHero(this.localSlots.map((s) => s.hero)), hat: null });
    sfx('join');
    this.rebuildRoster(); this.syncLobby(); this.renderLobby();
  }
  removeLocalSlot(i) {
    if (i <= 0 || i >= this.localSlots.length) return;
    const removed = this.localSlots.splice(i, 1)[0];
    if (removed.ctl.kind === 'kbRight') { const l = this.localSlots.find((s) => s.ctl.kind === 'kbLeft'); if (l) l.ctl = new Controller('kbFull'); }
    if (removed.ctl.kind === 'kbLeft') { const r = this.localSlots.find((s) => s.ctl.kind === 'kbRight'); if (r) r.ctl = new Controller('kbFull'); }
    sfx('back');
    this.rebuildRoster(); this.syncLobby(); this.renderLobby();
  }
  cycleHero(slot, dir) {
    const s = this.localSlots[slot];
    if (!s) return;
    const avail = HEROES.filter(heroUnlocked);
    let i = avail.findIndex((h) => h.id === s.hero);
    i = (i + dir + avail.length) % avail.length;
    s.hero = avail[i].id;
    s.hat = null;
    sfx('select');
    this.rebuildRoster();
    if (this.session.role === 'client') this.session.send({ type: 'setHero', hero: s.hero, hat: S().equipped[s.hero] || 'none' });
    this.syncLobby();
    this.renderLobby();
  }
  cycleHat(slot, dir) {
    const s = this.localSlots[slot];
    if (!s) return;
    const owned = HATS.filter((h) => S().hats.includes(h.id));
    const cur = s.hat || S().equipped[s.hero] || 'none';
    let i = owned.findIndex((h) => h.id === cur);
    i = (i + dir + owned.length) % owned.length;
    s.hat = owned[i].id;
    S().equipped[s.hero] = s.hat; save();
    sfx('select');
    this.rebuildRoster();
    if (this.session.role === 'client') this.session.send({ type: 'setHero', hero: s.hero, hat: s.hat });
    this.syncLobby();
    this.renderLobby();
  }
  renderLobby() {
    const online = this.session.online;
    const isClient = this.session.role === 'client';
    const touchDev = isTouchDevice();
    const cards = [];
    for (let i = 0; i < 4; i++) {
      const r = this.roster[i];
      if (r) {
        const h = heroById(r.hero);
        const mineIdx = r.peer === this.session.myId ? r.slot : -1;
        const mine = mineIdx >= 0;
        const slot = mine ? this.localSlots[mineIdx] : null;
        const dev = slot ? slot.ctl.label : online ? '🌐 Online' : '';
        cards.push(`
          <div class="pcard" style="--pc:${PLAYER_COLORS[i]}">
            <div class="pc-top"><span class="pc-tag">${esc(r.name)}</span><span class="pc-dev">${esc(dev)}</span>
              ${mine && mineIdx > 0 ? `<button class="x" data-nav data-act="removeSlot" data-slot="${mineIdx}" title="Remove">✕</button>` : ''}</div>
            <canvas width="120" height="120" data-hero="${h.id}" data-hat="${esc(r.hat || 'none')}"></canvas>
            <div class="pc-name">${esc(h.name)}</div>
            <div class="pc-role">${esc(h.role)} · ${'❤'.repeat(h.hp)}</div>
            <div class="pc-special">★ ${esc(h.special)}</div>
            ${mine ? `<div class="pc-arrows">
              <button class="btn sm" data-nav data-act="hero" data-slot="${mineIdx}" data-dir="-1">◀</button>
              <button class="btn sm hatbtn" data-nav data-act="hat" data-slot="${mineIdx}" data-dir="1" title="Change hat">🎩</button>
              <button class="btn sm" data-nav data-act="hero" data-slot="${mineIdx}" data-dir="1">▶</button></div>` : '<div class="pc-arrows muted">friend</div>'}
          </div>`);
      } else {
        let hint = '';
        if (!online || !isClient) {
          if (online) hint = '<div class="wait">Waiting for a friend…</div>';
          if (!touchDev || connectedPads().length) hint += '<div class="hint">🎮 Press <b>A</b> on a gamepad to join</div>';
          if (!touchDev && !this.localSlots.some((s) => s.ctl.kind === 'kbRight') && i === this.roster.length) hint += `<button class="btn sm" data-nav data-act="addKb">⌨ Add ${this.localSlots.some((s) => s.ctl.kind.startsWith('kb')) ? '2nd ' : ''}keyboard player</button>`;
          if (touchDev && !online && i === this.roster.length) hint += '<div class="hint">Play with friends on their own phones with <b>Online Co-op</b>!</div>';
        } else hint = '<div class="wait">Open slot</div>';
        cards.push(`<div class="pcard empty"><div class="plus">+</div>${hint}</div>`);
      }
    }
    const canStart = !isClient && this.roster.length > 0;
    const shareUrl = online ? this.shareUrl() : '';
    const modeBtns = Object.entries(MODES).map(([k, m]) => `<button class="btn chip ${this.lobby.mode === k ? 'sel' : ''}" data-nav data-act="mode" data-mode="${k}" ${isClient ? 'disabled' : ''}>${m.icon} ${m.name}</button>`).join('');
    const diffBtns = Object.entries(DIFFS).map(([k, n]) => `<button class="btn chip ${this.lobby.diff === k ? 'sel' : ''}" data-nav data-act="diff" data-diff="${k}" ${isClient ? 'disabled' : ''}>${n}</button>`).join('');
    const ctrlHelp = this.controlsHelp();
    this.show('lobby', `
      <div class="topbar">
        <button class="btn icon" data-nav data-act="back">◀</button>
        <h2>${online ? `Online Room <span class="code">${esc(this.session.code)}</span>` : 'Gather your party'}</h2>
        ${online ? `<button class="btn sm" data-nav data-act="copyLink">🔗 Share invite</button>` : '<span></span>'}
      </div>
      <div class="lobby-body">
        <div class="cards">${cards.join('')}</div>
        <div class="lobby-side">
          ${online && !isClient ? `<div class="invite"><div id="qr"></div><div class="invite-txt">Friends scan or open:<br><span class="url">${esc(shareUrl)}</span><br>or enter code <b>${esc(this.session.code)}</b></div></div>` : ''}
          <div class="opt"><div class="lbl">Mode</div><div class="chips">${modeBtns}</div><div class="desc">${MODES[this.lobby.mode].desc}${this.lobby.mode === 'endless' && S().endlessBest ? ` <b>Best: stage ${S().endlessBest}</b>` : ''}</div></div>
          <div class="opt"><div class="lbl">Difficulty</div><div class="chips">${diffBtns}</div></div>
          ${this.lobby.mode !== 'campaign' ? `<div class="opt"><div class="lbl">Mutators</div><div class="chips">${Object.entries(MUTATORS).map(([k, m]) => `<button class="btn chip ${(this.lobby.mutators || []).includes(k) ? 'sel' : ''}" data-nav data-act="mut" data-mut="${k}" title="${esc(m.desc)}" ${isClient ? 'disabled' : ''}>${m.icon} ${m.name}</button>`).join('')}</div>${(this.lobby.mutators || []).length ? `<div class="desc">${this.lobby.mutators.map((k) => esc(MUTATORS[k].desc)).join(' · ')}</div>` : ''}</div>` : ''}
          ${isClient ? '<div class="wait big">Waiting for the host to start…</div>' : `<button class="btn big primary" data-nav data-autofocus data-act="startLobby" ${canStart ? '' : 'disabled'}>Let's Bake! ▶</button>`}
          <div class="ctrl-help">${ctrlHelp}</div>
        </div>
      </div>
    `);
    if (online && !isClient) this.renderQR(shareUrl);
  }
  controlsHelp() {
    if (isTouchDevice()) return '🕹 Left thumb: move · Right: <b>Jump</b>, <b>Attack</b> (hold to charge), <b>★ Special</b>';
    const kinds = new Set(this.localSlots.map((s) => s.ctl.kind));
    const parts = [];
    if (kinds.has('kbFull')) parts.push('⌨ Move <b>WASD/Arrows</b> · Jump <b>Space/Z/K</b> · Attack <b>X/J</b> · Special <b>C/L/Shift</b>');
    if (kinds.has('kbLeft')) parts.push('⌨ Left: <b>WASD</b> · Jump <b>C</b> · Attack <b>V</b> · Special <b>B</b>');
    if (kinds.has('kbRight')) parts.push('⌨ Right: <b>Arrows</b> · Jump <b>K</b> · Attack <b>L</b> · Special <b>;</b>');
    if (kinds.has('pad')) parts.push('🎮 <b>A</b> jump · <b>X</b> attack · <b>B/Y/RB</b> special · ◀▶ in lobby to pick hero');
    return parts.join('<br>');
  }
  controlsText() {
    const kinds = new Set(this.localSlots.map((s) => s.ctl.kind));
    const out = [];
    if (kinds.has('touch')) out.push('Left thumb: move & aim  ·  Green: jump  ·  Pink: attack (hold to charge)  ·  Gold ★: special');
    if (kinds.has('kbFull')) out.push('Move: WASD / Arrows  ·  Jump: Space  ·  Attack: X or J  ·  Special: C or L  ·  Down+Jump: drop');
    if (kinds.has('kbLeft')) out.push('Left keyboard: WASD move · C jump · V attack · B special');
    if (kinds.has('kbRight')) out.push('Right keyboard: Arrows move · K jump · L attack · ; special');
    if (kinds.has('pad')) out.push('Gamepad: A jump · X attack · B/Y special · Start pause');
    return out.slice(0, 3);
  }
  leaveLobby() {
    if (this.session.online) { this.session.close(); this.session = localSession(); this.roster = []; }
    this.goTitle();
  }
  lobbyStart() {
    if (this.session.role === 'client' || !this.roster.length) return;
    sfx('select');
    if (this.lobby.mode === 'campaign') this.goWorldMap();
    else this.startRun(this.lobby.mode);
  }

  // =============================================================== ONLINE
  goOnline() {
    this.show('online', `
      <div class="topbar"><button class="btn icon" data-nav data-act="back">◀</button><h2>Online Co-op</h2><span></span></div>
      <div class="online-body">
        <div class="panel">
          <div class="lbl">Your baker name</div>
          <input id="pname" maxlength="10" placeholder="Baker" value="${esc(S().name || '')}" autocomplete="off">
          <p class="desc">Each friend plays on their own phone or computer. One person hosts, everyone else joins with the room code.</p>
        </div>
        <div class="panel">
          <button class="btn big primary" data-nav data-act="host" data-autofocus>🏠 Host a Room</button>
          <div class="or">— or —</div>
          <div class="joinrow"><input id="jcode" maxlength="5" placeholder="CODE" autocomplete="off" autocapitalize="characters" value="${esc(this.pendingJoin || '')}"><button class="btn big online" data-nav data-act="join">Join ▶</button></div>
          <div id="netmsg" class="netmsg"></div>
        </div>
      </div>
    `);
  }
  readName() {
    const el = $('#pname');
    if (el) { S().name = el.value.trim().slice(0, 10); save(); }
    return S().name || 'Baker';
  }
  netMsg(m, err) { const el = $('#netmsg'); if (el) { el.textContent = m; el.classList.toggle('err', !!err); } }
  goJoin(code) {
    this.pendingJoin = code;
    this.goOnline();
    if (S().name) setTimeout(() => this.joinOnline(), 200);
  }
  async hostOnline() {
    this.readName();
    this.netMsg('Creating room…');
    initAudio();
    try {
      const code = roomCode();
      const s = await hostSession(code, USE_BC);
      this.session = s;
      this.roster = [];
      this.localSlots = [{ ctl: this.defaultCtl(), hero: this.localSlots[0]?.hero || this.firstHero(), hat: null }];
      this.lobby.diff = settings().difficulty;
      this.setupHostHandlers();
      this.goLobby();
      this.toast(`Room ${s.code} is open!`, "🏠");
    } catch (e) {
      this.netMsg(e.message || String(e), true);
    }
  }
  async joinOnline() {
    const name = this.readName();
    const code = ($('#jcode')?.value || this.pendingJoin || '').trim().toUpperCase();
    if (code.length < 4) { this.netMsg('Enter the 5-letter room code', true); return; }
    this.netMsg(`Joining ${code}…`);
    try {
      const s = await joinSession(code, USE_BC);
      this.session = s;
      this.pendingJoin = null;
      this.localSlots = [{ ctl: this.defaultCtl(), hero: this.localSlots[0]?.hero || this.firstHero(), hat: null }];
      this.roster = [];
      this.setupClientHandlers();
      const sl = this.localSlots[0];
      s.send({ type: 'hello', name, hero: sl.hero, hat: S().equipped[sl.hero] || 'none' });
      this.netMsg('Connected! Waiting for room info…');
    } catch (e) {
      this.netMsg(e.message || String(e), true);
    }
  }
  shareUrl() {
    // keep transport-related params (custom PeerServer / test transport) in the invite link
    const keep = new URLSearchParams();
    for (const k of ['net', 'peerhost', 'peerport', 'peerpath', 'peersecure']) if (params.get(k)) keep.set(k, params.get(k));
    keep.set('join', this.session.code);
    return `${location.origin}${location.pathname}?${keep.toString()}`;
  }
  async copyLink() {
    const url = this.shareUrl();
    try {
      if (navigator.share && isTouchDevice()) { await navigator.share({ title: 'Pastry Paladins', text: `Join my Pastry Paladins room ${this.session.code}!`, url }); return; }
      await navigator.clipboard.writeText(url);
      this.toast('Invite link copied!', '🔗');
    } catch (e) { this.toast(`Code: ${this.session.code}`); }
  }
  renderQR(url) {
    const el = $('#qr');
    if (!el) return;
    const draw = () => {
      try {
        const q = window.qrcode(0, 'M'); q.addData(url); q.make();
        el.innerHTML = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
      } catch (e) { el.style.display = 'none'; }
    };
    if (window.qrcode) return draw();
    const s = document.createElement('script');
    s.src = 'vendor/qrcode.js';
    s.onload = draw; s.onerror = () => { el.style.display = 'none'; };
    document.head.appendChild(s);
  }
  syncLobby() {
    if (this.session.role !== 'host') return;
    this.session.broadcast({ type: 'lobby', roster: this.roster, mode: this.lobby.mode, diff: this.lobby.diff, mutators: this.lobby.mutators, code: this.session.code });
  }
  setupHostHandlers() {
    const s = this.session;
    s.on('hello', (m, from) => {
      if (this.screen !== 'lobby' && this.screen !== 'worldmap') { s.sendTo(from, { type: 'busy' }); return; }
      if (this.roster.length >= 4) { s.sendTo(from, { type: 'full' }); return; }
      this.roster.push({ peer: from, slot: 0, hero: m.hero, hat: m.hat, name: (m.name || 'Baker').slice(0, 10), perks: [] });
      this.rebuildRoster();
      sfx('join');
      this.toast(`${esc(m.name || 'A baker')} joined!`, '👋');
      this.syncLobby();
      if (this.screen === 'lobby') this.renderLobby();
      if (this.screen === 'worldmap') s.sendTo(from, { type: 'goto', screen: 'worldmap', sel: this.mapSel });
    });
    s.on('setHero', (m, from) => {
      const r = this.roster.find((x) => x.peer === from);
      if (r) { r.hero = m.hero; r.hat = m.hat; this.syncLobby(); if (this.screen === 'lobby') this.renderLobby(); }
    });
    s.on('perkPick', (m, from) => {
      const r = this.roster.find((x) => x.id === m.id && x.peer === from);
      if (r && !this.perkDone.has(r.id)) { r.perks = [...(r.perks || []), m.perk]; this.perkDone.add(r.id); this.afterPerkPick(); }
    });
    s.onPeerLeave = (peer) => {
      const r = this.roster.find((x) => x.peer === peer);
      this.roster = this.roster.filter((x) => x.peer !== peer);
      if (r) this.toast(`${esc(r.name)} left`, '👋');
      if (this.world) this.world.removePeer(peer);
      if (this.screen === 'lobby' || this.screen === 'worldmap') { this.rebuildRoster(); this.syncLobby(); if (this.screen === 'lobby') this.renderLobby(); }
      else if (this.screen === 'perks') this.afterPerkPick();
    };
  }
  setupClientHandlers() {
    const s = this.session;
    s.on('lobby', (m) => {
      this.roster = m.roster; this.lobby.mode = m.mode; this.lobby.diff = m.diff; this.lobby.mutators = m.mutators || [];
      const mine = this.roster.find((r) => r.peer === s.myId);
      if (mine) { this.localSlots[0].hero = mine.hero; }
      if (this.screen === 'lobby' || this.screen === 'online') this.renderLobby();
    });
    s.on('full', () => { this.netMsg('That room is full (4/4).', true); s.close(); this.session = localSession(); });
    s.on('busy', () => { this.netMsg('That room is mid-game. Ask the host to return to the lobby.', true); s.close(); this.session = localSession(); });
    s.on('goto', (m) => this.onGoto(m));
    s.on('perkState', (m) => { this.perkDone = new Set(m.done); if (this.screen === 'perks') this.renderPerkStatus(); });
    s.onDisconnect = (why) => {
      this.world = null;
      this.session = localSession();
      this.roster = [];
      this.goTitle();
      this.toast(why || 'Disconnected', '⚠');
    };
  }
  onGoto(m) {
    switch (m.screen) {
      case 'lobby': this.world = null; this.renderLobby(); break;
      case 'worldmap': this.mapSel = m.sel || this.mapSel; this.goWorldMap(true); break;
      case 'game': this.run = m.run; this.roster = m.roster; this.enterGame(m.spec, m.diff); break;
      case 'perks': this.run = m.run; this.roster = m.roster; this.goPerks(true); break;
      case 'results':
        // clients normally build their own results from the level-end event; this is a fallback
        if (performance.now() - (this.lastLevelEndAt || 0) > 4000) this.showResults(m.result, true);
        break;
    }
  }
  hostBroadcastGoto(m) {
    if (this.session.role === 'host') this.session.broadcast({ type: 'goto', ...m });
  }

  // =============================================================== WORLD MAP
  goWorldMap(fromNet) {
    this.world = null;
    playMusic('menu');
    if (!this.mapSel) {
      let w = 1;
      for (let i = 1; i <= 4; i++) if (worldUnlocked(i)) w = i;
      this.mapSel = { world: w, level: null };
    }
    this.renderWorldMap();
    if (!fromNet) this.hostBroadcastGoto({ screen: 'worldmap', sel: this.mapSel });
  }
  syncMap() { this.hostBroadcastGoto({ screen: 'worldmap', sel: this.mapSel }); }
  renderWorldMap() {
    const isClient = this.session.role === 'client';
    const sel = this.mapSel;
    const tabs = WORLDS.map((w) => {
      const unlocked = worldUnlocked(w.id);
      const stars = worldLevels(w.id).reduce((a, l) => a + (levelRecord(l.id)?.stars.filter(Boolean).length || 0), 0);
      return `<button class="btn wtab ${sel.world === w.id ? 'sel' : ''} ${unlocked ? '' : 'locked'}" style="--w1:${w.sky[0]};--w2:${w.sky[2]}" data-nav data-act="selWorld" data-world="${w.id}" ${isClient ? 'disabled' : ''}>
        <span class="wn">${w.id}. ${esc(w.name)}</span><span class="ws">${unlocked ? `⭐ ${stars}/15` : '🔒'}</span></button>`;
    }).join('');
    const W0 = WORLDS[sel.world - 1];
    const unlockedW = worldUnlocked(sel.world);
    const levels = worldLevels(sel.world);
    const L = sel.level ? levelById(sel.level) : null;
    const focusId = sel.level || (levels.find((l) => levelUnlocked(l) && !(levelRecord(l.id)?.stars[0])) || levels.filter(levelUnlocked).pop())?.id;
    const nodes = levels.map((l, i) => {
      const rec = levelRecord(l.id);
      const un = levelUnlocked(l);
      const icon = l.type === 'boss' ? '☠' : l.type === 'survive' ? '⏱' : '🧁';
      return `<button class="lnode ${sel.level === l.id ? 'sel' : ''} ${un ? '' : 'locked'} ${l.type}" data-nav ${focusId === l.id && !L ? 'data-autofocus' : ''} data-act="selLevel" data-level="${l.id}" ${un && !isClient ? '' : 'disabled'}>
        <span class="ln-i">${un ? icon : '🔒'}</span><span class="ln-n">${l.id}</span>${this.starsHtml(rec?.stars, 'sm')}</button>${i < levels.length - 1 ? '<span class="lpath"></span>' : ''}`;
    }).join('');
    let detail = '';
    if (L) {
      const rec = levelRecord(L.id);
      const fake = { level: L, nPlayers: Math.max(1, this.roster.length) };
      const goals = World.prototype.starGoals.call(fake);
      const thumb = `<div class="thumb" data-thumb="${L.id}"></div>`;
      detail = `<div class="ldetail">
        ${thumb}
        <div class="ld-info">
          <div class="ld-title">${esc(L.name)}</div>
          <div class="ld-type">${L.type === 'boss' ? 'BOSS BATTLE' : L.type === 'survive' ? `SURVIVE ${L.time}s` : `COLLECT ${Math.round(L.goal * (1 + 0.2 * (Math.max(1, this.roster.length) - 1)))} MUFFINS`}</div>
          <ul class="goals">${goals.map((g, i) => `<li class="${rec?.stars[i] ? 'done' : ''}">★ ${esc(g)}</li>`).join('')}</ul>
          ${rec ? `<div class="best">Best: ${rec.score.toLocaleString()} pts · ${fmtTime(rec.time)}</div>` : ''}
          ${isClient ? '<div class="wait">Host is choosing…</div>' : `<button class="btn big primary" data-nav data-act="playLevel" data-level="${L.id}" data-autofocus>Play ▶</button>`}
        </div></div>`;
    } else {
      detail = `<div class="ldetail empty"><p>${unlockedW ? esc(W0.blurb) : `🔒 Defeat the boss of World ${sel.world - 1} to unlock.`}</p>${unlockedW ? '<p class="muted">Pick a level to begin.</p>' : ''}</div>`;
    }
    this.show('worldmap', `
      <div class="topbar"><button class="btn icon" data-nav data-act="back" ${isClient ? 'disabled' : ''}>◀</button><h2>World Map</h2>${this.coinBar()}</div>
      <div class="map-body" style="--w1:${W0.sky[0]};--w2:${W0.sky[2]}">
        <div class="wtabs">${tabs}</div>
        <div class="wpanel">
          <div class="wtitle">${esc(W0.name)}</div>
          <div class="lnodes">${nodes}</div>
          ${detail}
        </div>
      </div>
    `);
    const th = $('[data-thumb]', this.ui);
    if (th) { const l = levelById(th.dataset.thumb); th.appendChild(levelThumb(l, WORLDS[l.world - 1], tilesForLevel(l), 240)); }
    if (this.menu.themeIdx !== sel.world - 1 && unlockedW) this.menu.setTheme(sel.world - 1);
  }

  // =============================================================== RUN FLOW (host/local)
  startRun(mode, levelId) {
    this.run = { mode, stage: 0, levelId: levelId || null, world: levelId ? levelById(levelId).world : 0, diff: this.lobby.diff, totalScore: 0, mutators: mode === 'campaign' ? [] : [...(this.lobby.mutators || [])] };
    for (const r of this.roster) r.perks = [];
    this.startStage();
  }
  stageSpec() {
    const r = this.run;
    if (r.mode === 'campaign') return { kind: 'campaign', id: r.levelId };
    if (r.mode === 'endless') return { kind: 'endless', stage: r.stage };
    return { kind: 'bossrush', stage: r.stage };
  }
  startStage() {
    if (this.session.role === 'client') return;
    const spec = this.stageSpec();
    this.hostBroadcastGoto({ screen: 'game', spec, roster: this.roster, diff: this.run.diff, run: this.run });
    this.enterGame(spec, this.run.diff);
  }
  levelFromSpec(spec) {
    if (spec.kind === 'campaign') return levelById(spec.id);
    if (spec.kind === 'endless') return endlessStage(spec.stage);
    return bossRushStage(spec.stage);
  }
  enterGame(spec, diff) {
    const level = this.levelFromSpec(spec);
    if (!level) return;
    clearLatches();
    const localCtl = {};
    this.localSlots.forEach((s, i) => { localCtl[i] = s.ctl; s.ctl.clearEdges(); });
    this.world = new World({
      level, roster: this.roster, session: this.session, localCtl, difficulty: diff, endSample, mutators: this.run?.mutators || [],
      hooks: {
        banner: (t, s) => { this.renderer.banner(t, s); sfx('banner'); },
        comboBanner: (n) => { this.renderer.banner(`${n}x COMBO!`, n >= 30 ? 'SUGAR OVERLOAD!' : n >= 20 ? 'SWEET!' : 'Keep it rolling!'); },
        end: (res) => this.onLevelEnd(res),
      },
    });
    this.renderer.banners.length = 0;
    this.renderer.bossHpShown = undefined;
    this.acc = 0;
    const music = level.type === 'boss' ? (level.boss === 'baron' ? 'final' : 'boss') : WORLDS[level.world - 1].music;
    playMusic(music);
    setDuck(1);
    this.show('game', '');
    S().stats.maxPlayers = Math.max(S().stats.maxPlayers, this.roster.length);
    if (this.roster.length >= 4) this.unlock('party4');
  }
  pause() {
    if (!this.world || (this.screen !== 'game' && this.screen !== 'settings')) return;
    if (!this.session.online) this.world.paused = true;
    setDuck(0.4);
    this.overlayOverGame = true;
    const L = this.world.level;
    const isClient = this.session.role === 'client';
    this.show('pause', `
      <div class="modal">
        <h2>Paused</h2>
        <div class="muted">${esc(L.name)}${this.session.online ? ' · the game keeps running online!' : ''}</div>
        <button class="btn big primary" data-nav data-act="resume" data-autofocus>▶ Resume</button>
        ${isClient ? '' : '<button class="btn" data-nav data-act="restart">↻ Restart Level</button>'}
        <button class="btn" data-nav data-act="settings">⚙ Settings</button>
        <button class="btn danger" data-nav data-act="quit">${isClient ? '✕ Leave Room' : '✕ Quit Run'}</button>
        <div class="ctrl-help small">${this.controlsHelp()}</div>
      </div>`, 'overlay');
  }
  resume() {
    if (!this.world) return;
    this.world.paused = false;
    this.overlayOverGame = false;
    setDuck(1);
    clearLatches();
    for (const p of this.world.localPlayers()) p.ctl?.clearEdges();
    this.show('game', '');
  }
  quitRun() {
    this.overlayOverGame = false;
    if (this.session.role === 'client') { this.session.close(); this.session = localSession(); this.world = null; this.goTitle(); return; }
    this.world = null;
    this.run = null;
    if (this.session.role === 'host') { this.hostBroadcastGoto({ screen: 'lobby' }); this.goLobby(); this.syncLobby(); }
    else this.goLobby();
  }
  hostGotoMapOrLobby() {
    if (this.session.role === 'client') return;
    this.world = null;
    if (this.run?.mode === 'campaign') this.goWorldMap();
    else { this.hostBroadcastGoto({ screen: 'lobby' }); this.goLobby(); this.syncLobby(); }
  }

  // =============================================================== LEVEL END / RESULTS
  onLevelEnd(res) {
    this.overlayOverGame = false;
    this.lastLevelEndAt = performance.now();
    const w = this.world;
    const loc = w ? w.local : {};
    const st = S().stats;
    // persistent stats (local players only)
    st.kills += loc.kills || 0; st.stomps += loc.stomps || 0; st.muffins += loc.muffins || 0; st.revives += loc.revives || 0;
    st.shatters += loc.shatters || 0; st.perfectShots += loc.perfectShots || 0; st.bestCombo = Math.max(st.bestCombo, res.bestCombo);
    st.playTime += res.time; st.deaths += loc.downs || 0;
    let coins = loc.coins || 0;
    const nStars = res.stars.filter(Boolean).length;
    if (res.kind === 'clear') coins += 10 + nStars * 5;
    if (this.run) this.run.totalScore = (this.run.totalScore || 0) + (res.kind === 'clear' ? res.score : 0);
    addCoins(coins);
    res.coinsEarned = coins;
    // campaign progress
    const L = levelById(res.levelId);
    res.unlocks = [];
    if (res.kind === 'clear') {
      st.levels++;
      this.unlock('first');
      if (L && !String(res.levelId).match(/^[EB]/)) {
        const prevWorlds = [...S().worldsCleared];
        recordLevel(L.id, res.stars, res.score, res.time);
        if (L.type === 'boss' && !S().worldsCleared.includes(L.world)) {
          S().worldsCleared.push(L.world);
          for (const h of HEROES) if (h.unlock?.world === L.world && !prevWorlds.includes(L.world)) res.unlocks.push(`New hero: ${h.name} the ${h.role}!`);
          if (L.world < 4) res.unlocks.push(`World ${L.world + 1}: ${WORLDS[L.world].name} unlocked!`);
          else res.unlocks.push('The Burnt Baron is toast — the Great Bakery is saved! Thanks for playing! 🧁');
        }
        if (L.type === 'collect' && res.time < 40) this.unlock('speed');
      }
      if (res.teamHits === 0) this.unlock('nohit');
      if (loc.bossKill) {
        st.bossKills++;
        const bmap = { jellyking: 'w1', golem: 'w2', wyrm: 'w3', baron: 'w4' };
        this.unlock(bmap[loc.bossKill]);
        if (this.run?.diff === 'hard') this.unlock('hard');
      }
      if (this.run?.mode === 'bossrush' && this.run.stage >= 3) { this.unlock('bossrush'); S().bossRushBest = 4; }
    }
    if (this.run?.mode === 'endless') {
      const reached = this.run.stage + (res.kind === 'clear' ? 1 : 0);
      if (reached > S().endlessBest) { S().endlessBest = reached; res.newBest = true; }
      if (reached >= 10) this.unlock('endless10');
    }
    save();
    this.checkAchievements();
    if (this.session.role !== 'client') this.hostBroadcastGoto({ screen: 'results', result: res });
    setTimeout(() => this.showResults(res, false), res.kind === 'clear' ? 900 : 300);
  }
  checkAchievements() {
    const st = S().stats;
    if (totalStars() >= 20) this.unlock('stars20');
    if (totalStars() >= 60) this.unlock('stars60');
    if (st.bestCombo >= 20) this.unlock('combo20');
    if (st.bestCombo >= 50) this.unlock('combo50');
    if (st.stomps >= 50) this.unlock('stomp50');
    if (st.muffins >= 100) this.unlock('muffin100');
    if (st.muffins >= 500) this.unlock('muffin500');
    if (st.kills >= 500) this.unlock('kill500');
    if (st.revives >= 10) this.unlock('revive10');
    if (st.shatters >= 25) this.unlock('shatter25');
    if (st.perfectShots >= 20) this.unlock('perfect20');
    if (S().hats.length >= 4) this.unlock('hats3');
    if (st.coinsEarned >= 1000) this.unlock('rich');
  }
  unlock(id) {
    if (S().achievements[id]) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    S().achievements[id] = Date.now();
    save();
    setTimeout(() => { sfx('achievement'); this.toast(`<b>Trophy unlocked:</b> ${esc(a.name)}`, a.icon); }, 1200);
  }
  awards(res) {
    const st = res.stats || {};
    const ids = Object.keys(st);
    if (ids.length < 2) return {};
    const best = (fn, min = 1) => { let b = null, bv = -1; for (const id of ids) { const v = fn(st[id]); if (v > bv) { bv = v; b = id; } } return bv >= min ? b : null; };
    const out = {};
    const add = (id, a) => { if (id !== null) (out[id] = out[id] || []).push(a); };
    add(best((s) => s.dmg + s.kills * 5 + s.revives * 20 + s.muffins * 3), { i: '👑', n: 'MVP' });
    add(best((s) => s.muffins), { i: '🧁', n: 'Muffin Monster' });
    add(best((s) => s.kills), { i: '⚔', n: 'Slayer' });
    add(best((s) => s.revives), { i: '💖', n: 'Guardian Angel' });
    add(best((s) => s.stomps, 3), { i: '👟', n: 'Stomp King' });
    add(best((s) => -s.hits + 100, 100), { i: '🛡', n: 'Untouchable' });
    return out;
  }
  showResults(res, fromNet) {
    this.lastResult = res;
    const clear = res.kind === 'clear';
    const isClient = this.session.role === 'client';
    const L = this.world?.level || levelById(res.levelId);
    playMusic('results');
    if (clear) { sfx('victory'); this.menu.celebrate(L?.type === 'boss' ? 260 : 140); } else sfx('defeat');
    const goals = this.world ? this.world.starGoals() : ['', '', ''];
    const aw = this.awards(res);
    const players = this.roster.map((r) => {
      const s = res.stats?.[r.id];
      if (!s) return '';
      const h = heroById(r.hero);
      return `<div class="rplayer" style="--pc:${PLAYER_COLORS[r.id]}">
        <canvas width="64" height="64" data-hero="${h.id}" data-hat="${esc(r.hat || 'none')}"></canvas>
        <div class="rp-name">${esc(r.name)}</div>
        <div class="rp-stats">⚔ ${s.kills} · 🧁 ${s.muffins} · 💖 ${s.revives}</div>
        <div class="rp-awards">${(aw[r.id] || []).map((a) => `<span class="award">${a.i} ${a.n}</span>`).join('')}</div>
      </div>`;
    }).join('');
    const mode = this.run?.mode || 'campaign';
    let primary = '', secondary = '';
    if (isClient) primary = '<div class="wait">Waiting for the host…</div>';
    else if (clear) {
      let label = 'Continue ▶';
      if (mode === 'campaign' && !nextLevelInWorld(res.levelId)) label = 'World Map ▶';
      if (mode === 'bossrush' && this.run.stage >= 3) label = 'Finish ▶';
      primary = `<button class="btn big primary" data-nav data-act="continue" data-autofocus>${label}</button>`;
      secondary = `<button class="btn" data-nav data-act="retry">↻ Replay</button><button class="btn" data-nav data-act="toMap">${mode === 'campaign' ? '🗺 Map' : '⌂ Lobby'}</button>`;
    } else {
      if (mode === 'endless') primary = `<button class="btn big primary" data-nav data-act="toMap" data-autofocus>⌂ Back to Lobby</button>`;
      else primary = `<button class="btn big primary" data-nav data-act="retry" data-autofocus>↻ Try Again</button>`;
      secondary = `<button class="btn" data-nav data-act="toMap">${mode === 'campaign' ? '🗺 Map' : '⌂ Lobby'}</button>`;
    }
    const title = clear ? (L?.type === 'boss' ? 'BOSS DEFEATED!' : 'LEVEL CLEAR!') : mode === 'endless' ? 'RUN OVER' : 'CRUMBLED!';
    this.show('results', `
      <div class="res-wrap ${clear ? 'win' : 'lose'}">
        <div class="res-title">${title}</div>
        <div class="res-sub">${esc(L?.name || '')}${mode === 'endless' ? ` · reached stage ${this.run.stage + (clear ? 1 : 0)}${res.newBest ? ' · NEW BEST!' : ''}` : ''}</div>
        ${clear && mode === 'campaign' ? `<div class="bigstars">${[0, 1, 2].map((i) => `<span class="bs ${res.stars[i] ? 'on' : ''}" style="animation-delay:${0.3 + i * 0.35}s">★</span>`).join('')}</div>
          <ul class="goals res-goals">${goals.map((g, i) => `<li class="${res.stars[i] ? 'done' : ''}">${res.stars[i] ? '✔' : '✗'} ${esc(g)}</li>`).join('')}</ul>` : ''}
        <div class="res-stats">
          <div><b>${res.score.toLocaleString()}</b><span>score</span></div>
          <div><b>${fmtTime(res.time)}</b><span>time</span></div>
          <div><b>${res.bestCombo}x</b><span>best combo</span></div>
          <div><b>+${res.coinsEarned || 0} 💎</b><span>sprinkles</span></div>
        </div>
        ${(res.unlocks || []).map((u) => `<div class="unlock">🎉 ${esc(u)}</div>`).join('')}
        ${players ? `<div class="rplayers">${players}</div>` : ''}
        <div class="res-btns">${primary}${secondary}</div>
      </div>`);
  }
  resultsContinue() {
    if (this.session.role === 'client' || this.screen !== 'results') return;
    const res = this.lastResult;
    const r = this.run;
    if (!r) return this.goLobby();
    if (res.kind !== 'clear') return this.startStage();
    if (r.mode === 'campaign') {
      const nxt = nextLevelInWorld(res.levelId);
      if (!nxt) { this.mapSel = { world: Math.min(4, levelById(res.levelId).world + (levelById(res.levelId).world < 4 ? 1 : 0)), level: null }; return this.goWorldMap(); }
      r.levelId = nxt.id;
      return this.goPerks();
    }
    r.stage++;
    if (r.mode === 'bossrush' && r.stage >= 4) { this.hostGotoMapOrLobby(); return; }
    this.goPerks();
  }

  // =============================================================== PERKS
  goPerks(fromNet) {
    this.world = null;
    this.perkDone = new Set();
    if (!fromNet) this.hostBroadcastGoto({ screen: 'perks', run: this.run, roster: this.roster });
    this.perkOffers = {};
    const mine = this.roster.filter((r) => r.peer === this.session.myId);
    for (const r of mine) this.perkOffers[r.id] = rollPerks(r.perks || []);
    playMusic('results');
    const rows = mine.map((r) => {
      const h = heroById(r.hero);
      return `<div class="perkrow" data-pid="${r.id}" style="--pc:${PLAYER_COLORS[r.id]}">
        <div class="pr-who"><canvas width="56" height="56" data-hero="${h.id}" data-hat="${esc(r.hat || 'none')}"></canvas><span>${esc(r.name)}</span></div>
        <div class="pr-cards">${this.perkOffers[r.id].map((pid) => {
          const p = perkById(pid);
          return `<button class="perk r${p.rarity}" data-nav data-act="perk" data-pid="${r.id}" data-perk="${p.id}"><span class="pk-i">${p.icon}</span><span class="pk-n">${esc(p.name)}</span><span class="pk-d">${esc(p.desc)}</span></button>`;
        }).join('')}</div>
        <div class="pr-owned">${(r.perks || []).map((id) => `<span title="${esc(perkById(id)?.name)}">${perkById(id)?.icon}</span>`).join('')}</div>
      </div>`;
    }).join('');
    const next = this.run.mode === 'campaign' ? levelById(this.run.levelId)?.name : this.run.mode === 'endless' ? `Stage ${this.run.stage + 1}` : `Boss ${this.run.stage + 1}/4`;
    this.show('perks', `
      <div class="perk-wrap">
        <div class="res-title small">Choose a Topping!</div>
        <div class="res-sub">Next up: ${esc(next || '')}</div>
        ${rows}
        <div id="perkstatus" class="perkstatus"></div>
      </div>`);
    this.renderPerkStatus();
  }
  pickPerk(pid, perk) {
    if (this.perkDone.has(pid)) return;
    const r = this.roster.find((x) => x.id === pid);
    if (!r) return;
    sfx('select');
    const row = $(`.perkrow[data-pid="${pid}"]`, this.ui);
    if (row) { row.classList.add('done'); $$('.perk', row).forEach((b) => { b.disabled = true; if (b.dataset.perk === perk) b.classList.add('chosen'); }); }
    if (this.session.role === 'client') {
      this.session.send({ type: 'perkPick', id: pid, perk });
      this.perkDone.add(pid);
      r.perks = [...(r.perks || []), perk];
      this.renderPerkStatus();
      return;
    }
    r.perks = [...(r.perks || []), perk];
    this.perkDone.add(pid);
    const next = row?.nextElementSibling?.querySelector('.perk');
    if (next && !isTouchDevice()) next.focus();
    this.afterPerkPick();
  }
  afterPerkPick() {
    if (this.session.role === 'client') return;
    if (this.session.role === 'host') this.session.broadcast({ type: 'perkState', done: [...this.perkDone] });
    this.renderPerkStatus();
    if (this.roster.every((r) => this.perkDone.has(r.id))) setTimeout(() => { if (this.screen === 'perks') this.startStage(); }, 700);
  }
  renderPerkStatus() {
    const el = $('#perkstatus');
    if (!el) return;
    el.innerHTML = this.roster.map((r) => `<span class="ps ${this.perkDone.has(r.id) ? 'ok' : ''}" style="--pc:${PLAYER_COLORS[r.id]}">${esc(r.name)} ${this.perkDone.has(r.id) ? '✔' : '…'}</span>`).join('');
  }

  // =============================================================== HEROES / HATS
  goHeroes() {
    if (!this.heroSel) this.heroSel = HEROES[0].id;
    const h = heroById(this.heroSel);
    const unlocked = heroUnlocked(h);
    const equipped = S().equipped[h.id] || 'none';
    const list = HEROES.map((x) => `<button class="hcard ${x.id === h.id ? 'sel' : ''} ${heroUnlocked(x) ? '' : 'locked'}" data-nav data-act="viewHero" data-hero="${x.id}">
      <canvas width="72" height="72" data-hero="${x.id}" data-hat="${esc(S().equipped[x.id] || 'none')}"></canvas><span>${heroUnlocked(x) ? esc(x.name) : '🔒 ???'}</span></button>`).join('');
    const bar = (v, max) => `<span class="bar"><i style="width:${(v / max) * 100}%"></i></span>`;
    const stars = totalStars();
    const hats = HATS.map((hat) => {
      const owned = S().hats.includes(hat.id);
      const needStars = hat.stars && stars < hat.stars;
      const isEq = equipped === hat.id;
      return `<div class="hat ${isEq ? 'eq' : ''}">
        <canvas width="56" height="56" data-hero="${h.id}" data-hat="${hat.id}" data-bg="0"></canvas>
        <div class="hat-n">${esc(hat.name)}</div>
        ${owned ? (isEq ? '<span class="tag">Equipped</span>' : `<button class="btn sm" data-nav data-act="equipHat" data-hat="${hat.id}">Wear</button>`)
          : needStars ? `<span class="tag lock">⭐ ${hat.stars} needed</span>` : `<button class="btn sm buy" data-nav data-act="buyHat" data-hat="${hat.id}" ${S().coins < hat.cost ? 'disabled' : ''}>💎 ${hat.cost}</button>`}
      </div>`;
    }).join('');
    this.show('heroes', `
      <div class="topbar"><button class="btn icon" data-nav data-act="back">◀</button><h2>Heroes & Hats</h2>${this.coinBar()}</div>
      <div class="heroes-body">
        <div class="hlist">${list}</div>
        <div class="hdetail">
          <div class="hd-top">
            <canvas width="160" height="160" data-hero="${h.id}" data-hat="${esc(equipped)}"></canvas>
            <div>
              <div class="hd-name">${unlocked ? esc(h.name) : '🔒 Locked'}</div>
              <div class="hd-role">${esc(h.role)}${!unlocked ? ` · Clear World ${h.unlock.world} to unlock` : ''}</div>
              <div class="hd-desc">${esc(h.desc)}</div>
              <div class="hd-stats">
                <div>Health ${bar(h.hp, 5)}</div><div>Speed ${bar(h.speed - 80, 60)}</div><div>Skill ${bar(h.difficulty, 3)}</div>
              </div>
              <div class="hd-moves"><div><b>Attack:</b> ${esc(h.attackDesc)}</div><div><b>★ ${esc(h.special)}:</b> ${esc(h.specialDesc)}</div></div>
            </div>
          </div>
          <div class="hats-title">Hat Shop <span class="muted">— earn 💎 sprinkles by collecting gems and clearing levels</span></div>
          <div class="hats">${hats}</div>
        </div>
      </div>`);
  }
  buyHat(id) {
    const hat = HATS.find((h) => h.id === id);
    if (!hat || S().hats.includes(id) || S().coins < hat.cost) return;
    S().coins -= hat.cost;
    S().hats.push(id);
    S().equipped[this.heroSel] = id;
    save();
    sfx('coin');
    this.toast(`Bought ${esc(hat.name)}!`, '🎩');
    this.checkAchievements();
    this.goHeroes();
  }

  // =============================================================== ACHIEVEMENTS
  goAchievements() {
    const got = S().achievements;
    const n = Object.keys(got).length;
    const st = S().stats;
    this.show('achievements', `
      <div class="topbar"><button class="btn icon" data-nav data-act="back">◀</button><h2>Trophies <span class="muted">${n}/${ACHIEVEMENTS.length}</span></h2>${this.coinBar()}</div>
      <div class="ach-body">
        <div class="ach-grid">${ACHIEVEMENTS.map((a) => `<div class="ach ${got[a.id] ? 'got' : ''}" tabindex="-1"><span class="ai">${a.icon}</span><div><div class="an">${esc(a.name)}</div><div class="ad">${esc(a.desc)}</div></div></div>`).join('')}</div>
        <div class="lifetime">
          <h3>Lifetime</h3>
          <div>⚔ Enemies defeated <b>${st.kills}</b></div><div>🧁 Muffins <b>${st.muffins}</b></div><div>👟 Stomps <b>${st.stomps}</b></div>
          <div>💖 Revives <b>${st.revives}</b></div><div>⚡ Best combo <b>${st.bestCombo}x</b></div><div>☠ Bosses <b>${st.bossKills}</b></div>
          <div>∞ Endless best <b>stage ${S().endlessBest}</b></div><div>⏱ Play time <b>${fmtTime(st.playTime)}</b></div>
        </div>
      </div>`);
  }

  // =============================================================== SETTINGS
  goSettings() {
    const s = settings();
    const slider = (key, label, min, max, step) => `<label class="srow"><span>${label}</span><input type="range" data-nav data-key="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><output>${Math.round(s[key] * 100)}%</output></label>`;
    const toggle = (key, label, hint = '') => `<div class="srow"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><button class="btn toggle ${s[key] ? 'on' : ''}" data-nav data-act="toggle" data-key="${key}">${s[key] ? 'ON' : 'OFF'}</button></div>`;
    const choice = (key, label, opts) => `<div class="srow"><span>${label}</span><div class="chips">${opts.map(([v, n]) => `<button class="btn chip ${s[key] === v ? 'sel' : ''}" data-nav data-act="setq" data-key="${key}" data-val="${v}">${n}</button>`).join('')}</div></div>`;
    this.show('settings', `
      <div class="topbar"><button class="btn icon" data-nav data-act="back">◀</button><h2>Settings</h2><span></span></div>
      <div class="settings-body">
        <div class="scol">
          <h3>Audio</h3>
          ${slider('master', 'Master volume', 0, 1, 0.05)}${slider('music', 'Music', 0, 1, 0.05)}${slider('sfx', 'Sound effects', 0, 1, 0.05)}
          <h3>Gameplay</h3>
          ${choice('difficulty', 'Default difficulty', [['casual', 'Casual'], ['normal', 'Normal'], ['hard', 'Hard']])}
          ${toggle('assistAim', 'Aim assist', 'Gently bends shots toward enemies')}
          ${toggle('damageNumbers', 'Damage numbers')}
          ${toggle('unlockAll', 'Party mode', 'Unlock all heroes, worlds & levels')}
        </div>
        <div class="scol">
          <h3>Controls</h3>
          ${slider('touchSize', 'Touch button size', 0.7, 1.4, 0.05)}${slider('touchOpacity', 'Touch opacity', 0.2, 1, 0.05)}
          ${toggle('leftHanded', 'Left-handed touch layout')}
          ${toggle('upToJump', 'Up to jump', 'Push stick / W / ↑ up to jump')}
          ${toggle('haptics', 'Vibration')}
          <h3>Display</h3>
          ${slider('shake', 'Screen shake', 0, 1.5, 0.05)}
          ${choice('quality', 'Graphics', [['low', 'Battery saver'], ['high', 'Beautiful']])}
          ${toggle('reduceFlashes', 'Reduce flashes')}
          ${toggle('showFps', 'Show FPS / ping')}
          <div class="srow"><span>Fullscreen</span><button class="btn" data-nav data-act="fullscreen">⛶ Toggle</button></div>
          <div class="srow"><span>Progress</span><button class="btn danger" data-nav data-act="reset">Reset save…</button></div>
        </div>
      </div>`);
    $$('input[type=range]', this.ui).forEach((el) => el.addEventListener('input', () => {
      settings()[el.dataset.key] = Number(el.value);
      el.nextElementSibling.textContent = `${Math.round(Number(el.value) * 100)}%`;
      save();
      applyVolumes(); touch.applyLayout();
      if (el.dataset.key === 'sfx') sfx('coin');
    }));
  }

  // =============================================================== HOW TO PLAY
  goHowto() {
    const sec = (icon, title, body) => `<div class="howto-card"><div class="hi">${icon}</div><div><h4>${title}</h4><p>${body}</p></div></div>`;
    this.show('howto', `
      <div class="topbar"><button class="btn icon" data-nav data-act="back">◀</button><h2>How to Play</h2><span></span></div>
      <div class="howto-body">
        ${sec('🧁', 'Bake the goal', 'Defeat enemies to make them drop muffins. Fill the muffin meter and a <b>Golden Muffin</b> appears — grab it to clear the level. Some levels ask you to <b>survive</b> the clock, others end in a <b>boss battle</b>.')}
        ${sec('👟', 'Stomp!', 'Jump on enemies to stomp them and bounce higher — hold jump for an extra-high bounce. Spiky enemies hurt to stomp. Frozen enemies <b>shatter</b> when stomped.')}
        ${sec('🌀', 'Enrage', 'Enemies that fall into a pit or lava return through a portal <b>ENRAGED</b>: red, faster and tougher — but worth more points and muffins.')}
        ${sec('⚡', 'Combos', 'Keep defeating enemies to build a team combo. Every 5 combo raises the score multiplier. Getting hit halves the combo for everyone!')}
        ${sec('💖', 'Revive your friends', 'When a hero runs out of hearts they float in a bubble. Stand next to them to revive them. If everyone is down, the level is lost. Downed players can steer their bubble toward friends.')}
        ${sec('🧪', 'Teamwork', 'Heroes combo off each other: Mira <b>freezes</b> (frozen foes take +50%), Cinna <b>marks</b> (+25% damage from everyone), Dr. Fizz <b>heals</b> and speeds revives, Sir Brioche <b>blocks</b> shots for the team.')}
        ${sec('🕹', 'Movement tech', 'Jump height depends on how long you hold. You can jump slightly after leaving a ledge and presses just before landing still count. Hold down + jump to drop through wafer platforms. Hold down in the air to fall faster. Run off the screen edge to wrap around!')}
        ${sec('⭐', 'Stars & sprinkles', 'Each level has 3 stars: clear it, beat the par time, and take few hits. Collect 💎 sprinkles to buy hats. Pick a <b>Topping</b> perk between levels to power up your run.')}
        ${sec('🌐', 'Online co-op', 'Tap <b>Online Co-op → Host</b> and share the link or QR code. Friends open it on their phones and join instantly — up to 4 players. Gamepads and a shared keyboard work for local co-op too.')}
      </div>`);
  }
}

const app = new App();
window.__app = app;
app.init();

// in-game pause button (mouse users)
document.getElementById('pausebtn').addEventListener('click', () => app.pause());
// touch pause button maps through controller pause; also allow tapping it directly
document.addEventListener('touchend', (e) => { if (e.target.closest?.('.t-pause')) app.pause(); });

// Service worker for offline / installable PWA
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
