// Persistent save data (localStorage, guarded)
const KEY = 'pastry-paladins-save-v1';

const defaults = () => ({
  name: '',
  settings: {
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    shake: 1,
    haptics: true,
    damageNumbers: true,
    quality: 'high', // 'low' | 'high'
    showFps: false,
    touchSize: 1,
    touchOpacity: 0.55,
    leftHanded: false,
    upToJump: false,
    assistAim: true,
    difficulty: 'normal', // casual | normal | hard
    unlockAll: false,
    reduceFlashes: false,
    colorblind: false,
  },
  levels: {}, // '1-1': {stars, score, time, stars bits}
  worldsCleared: [],
  coins: 0,
  hats: ['none'],
  equipped: {}, // heroId -> hatId
  achievements: {},
  stats: {
    kills: 0, muffins: 0, stomps: 0, revives: 0, levels: 0, deaths: 0, shatters: 0,
    perfectShots: 0, bestCombo: 0, playTime: 0, coinsEarned: 0, bossKills: 0, maxPlayers: 1,
  },
  endlessBest: 0,
  bossRushBest: 0,
  seenTutorial: false,
});

let data = defaults();

function deepMerge(base, over) {
  for (const k in over) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') {
      deepMerge(base[k], over[k]);
    } else base[k] = over[k];
  }
  return base;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = deepMerge(defaults(), JSON.parse(raw));
  } catch (e) {
    data = defaults();
  }
  return data;
}

let saveTimer = 0;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }, 100);
}

export function resetSave() {
  data = defaults();
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  save();
}

export const S = () => data;
export const settings = () => data.settings;

export function levelRecord(id) {
  return data.levels[id] || null;
}

export function recordLevel(id, stars, score, time) {
  const r = data.levels[id] || { stars: [false, false, false], score: 0, time: 0 };
  for (let i = 0; i < 3; i++) r.stars[i] = r.stars[i] || !!stars[i];
  r.score = Math.max(r.score, score);
  r.time = r.time ? Math.min(r.time, time) : time;
  data.levels[id] = r;
  save();
  return r;
}

export function totalStars() {
  let n = 0;
  for (const k in data.levels) n += data.levels[k].stars.filter(Boolean).length;
  return n;
}

export function addCoins(n) {
  data.coins += n;
  data.stats.coinsEarned += Math.max(0, n);
  save();
}
