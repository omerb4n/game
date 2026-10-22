// Hero progression: XP / levels and a per-hero skill tree.
// Heroes start weaker than their "classic" tuning and grow well past it: each level adds a little raw
// power, and every level after the first grants a skill point. A tree has 3 branches (one shared survival
// branch + two hero branches) of 5 tiers; tiers unlock in order within a branch. There are more points'
// worth of nodes (22) than points (14 at max level), so every build is a choice. Respec is free.

export const MAX_LEVEL = 15;
export const xpToNext = (lv) => 60 + 30 * (lv - 1);

export function levelInfo(xp) {
  let lv = 1, into = Math.max(0, xp | 0);
  while (lv < MAX_LEVEL && into >= xpToNext(lv)) { into -= xpToNext(lv); lv++; }
  return { lv, into, need: lv < MAX_LEVEL ? xpToNext(lv) : 0 };
}
export const totalXpFor = (lv) => { let t = 0; for (let l = 1; l < lv; l++) t += xpToNext(l); return t; };

// ------------------------------------------------------------------ node helpers
const stat = {
  dmg: (name = 'Sharp Sprinkles') => ({ name, icon: '⚔', ranks: 2, desc: '+8% damage per rank.', apply: (m, r) => { m.dmg *= 1 + 0.08 * r; } }),
  atk: (name = 'Rapid Whisk') => ({ name, icon: '≫', ranks: 2, desc: '+10% attack speed per rank.', apply: (m, r) => { m.atkSpeed *= 1 + 0.1 * r; } }),
  cd: (name = 'Quick Oven') => ({ name, icon: '⟳', ranks: 2, desc: 'Special recharges 10% faster per rank.', apply: (m, r) => { m.cdMul *= Math.pow(0.9, r); } }),
  size: (name = 'Big Bites') => ({ name, icon: '⬤', ranks: 2, desc: 'Attacks and specials 12% larger per rank.', apply: (m, r) => { m.size *= 1 + 0.12 * r; } }),
  crit: (name = 'Crit Crumbs') => ({ name, icon: '✷', ranks: 2, desc: '+6% chance per rank to deal double damage.', apply: (m, r) => { m.crit += 0.06 * r; } }),
  invuln: (name = 'Iron Crust') => ({ name, icon: '⛨', ranks: 2, desc: '+0.3s invulnerability after being hit, per rank.', apply: (m, r) => { m.invulnBonus += 0.3 * r; } }),
};
const key = (name, icon, desc, flag, extra) => ({ name, icon, ranks: 1, desc, key: true, apply: (m) => { m.k[flag] = 1; extra?.(m); } });

// shared survival branch (every hero)
const HEARTY = {
  id: 'h', name: 'Hearty', color: '#ff7a9a', nodes: [
    { name: 'Thick Dough', icon: '❤', ranks: 1, desc: '+1 max heart.', apply: (m) => { m.maxHp += 1; } },
    { name: 'Sugar Legs', icon: '➶', ranks: 2, desc: '+6% movement speed per rank.', apply: (m, r) => { m.speed *= 1 + 0.06 * r; } },
    { name: 'Feather Flour', icon: '⇑', ranks: 1, key: true, desc: '+1 mid-air jump.', apply: (m) => { m.airJumps += 1; } },
    { name: 'Extra Layer', icon: '❤', ranks: 1, desc: '+1 max heart.', apply: (m) => { m.maxHp += 1; } },
    { name: 'Second Bake', icon: '♻', ranks: 1, key: true, desc: 'Once per stage, revive yourself automatically when downed.', apply: (m) => { m.secondBake += 1; } },
  ],
};

const HERO_BRANCHES = {
  knight: [
    { id: 'a', name: 'Blade', color: '#ffd166', nodes: [
      stat.dmg('Honed Edge'), stat.atk('Swift Strikes'),
      key('Whirlwind', '🌀', 'The third combo hit becomes a spin that strikes both sides.', 'whirl'),
      stat.size('Long Blade'),
      key('Crumb Wave', '🌊', 'The third combo hit also sends a piercing sword wave forward.', 'wave'),
    ] },
    { id: 'b', name: 'Bulwark', color: '#7fc8ff', nodes: [
      stat.cd('Second Wind'),
      { name: 'Battering Ram', icon: '🐏', ranks: 2, desc: 'Shield Charge deals +50% damage per rank.', apply: (m, r) => { m.k.dashDmg = (m.k.dashDmg || 0) + 0.5 * r; } },
      key('Long Charge', '➠', 'Shield Charge lasts 50% longer and travels further.', 'longDash'),
      stat.invuln(),
      key('Aegis', '🛡', 'After a Shield Charge you gain a shield that blocks the next hit.', 'aegis'),
    ] },
  ],
  mage: [
    { id: 'a', name: 'Arcana', color: '#ffb347', nodes: [
      stat.dmg('Potent Glaze'), stat.atk('Quick Casting'),
      key('Twin Bolt', '⁑', 'Each tap fires two bolts in a narrow spread.', 'twin'),
      stat.size('Swollen Sparks'),
      key('Inferno', '🔥', 'Fireballs charge 40% faster and explode 40% larger.', 'inferno'),
    ] },
    { id: 'b', name: 'Frost', color: '#9fe6ff', nodes: [
      stat.cd('Cold Oven'),
      { name: 'Chill', icon: '❄', ranks: 2, desc: 'Hits have a +5% chance per rank to freeze.', apply: (m, r) => { m.freezeChance += 0.05 * r; } },
      key('Deep Freeze', '🧊', 'Frost Nova is 30% larger and freezes 50% longer.', 'deepFreeze'),
      stat.crit('Shatterpoint'),
      key('Ice Armor', '🛡', 'Frost Nova also shields you and every ally inside it.', 'iceArmor'),
    ] },
  ],
  ranger: [
    { id: 'a', name: 'Marksman', color: '#fff36b', nodes: [
      stat.dmg('Barbed Tips'), stat.atk('Quick Draw'),
      key('Sweet Spot', '🎯', 'The PERFECT release window is much wider.', 'wideWindow'),
      stat.crit('Keen Eye'),
      key('Twin Shot', '⇉', 'Fully drawn shots fire a second arrow.', 'twinShot'),
    ] },
    { id: 'b', name: 'Storm', color: '#8fd6a8', nodes: [
      stat.cd('Restock'), stat.size('Wide Volley'),
      key('Downpour', '☔', 'Arrow Rain drops 22 arrows instead of 14.', 'downpour'),
      stat.cd('Quiver Belt'),
      key('Frost Rain', '❄', 'Arrow Rain arrows freeze what they hit.', 'frostRain'),
    ] },
  ],
  alchemist: [
    { id: 'a', name: 'Brewing', color: '#c45cff', nodes: [
      stat.dmg('Strong Brew'), stat.atk('Quick Hands'),
      key('Double Toss', '⁂', 'Throw two potions at once.', 'doubleToss'),
      stat.size('Big Splash'),
      key('Volatile Mix', '💥', 'Potions explode 40% larger and set enemies on fire.', 'volatile'),
    ] },
    { id: 'b', name: 'Medic', color: '#9dffb0', nodes: [
      stat.cd('Steady Simmer'),
      { name: 'Bedside Manner', icon: '✚', ranks: 2, desc: 'Revive allies 30% faster per rank.', apply: (m, r) => { m.reviveMul *= 1 + 0.3 * r; } },
      key('Long Brew', '⌛', 'Healing Brew lasts 60% longer and heals faster.', 'longBrew'),
      stat.size('Wide Cloud'),
      key('Sugar Tonic', '⚡', 'Allies standing in your Healing Brew move 20% faster and deal 30% more damage.', 'tonic'),
    ] },
  ],
  gunner: [
    { id: 'a', name: 'Buckshot', color: '#ffcf70', nodes: [
      stat.dmg('Hot Lead'), stat.atk('Fast Pump'),
      key('Extra Shells', '⁙', 'Each blast fires 9 pellets instead of 6.', 'shells'),
      stat.crit('Lucky Pellet'),
      key('Double Barrel', '‖', 'Fire a second blast right after the first before reloading.', 'double'),
    ] },
    { id: 'b', name: 'Demolition', color: '#ff6a2a', nodes: [
      stat.cd('Short Fuse'), stat.size('Big Boom'),
      key('Cluster Chili', '✺', 'Chili Bomb bursts into three mini-bombs.', 'cluster'),
      { name: 'Firestarter', icon: '🔥', ranks: 2, desc: 'Hits have a +10% chance per rank to burn.', apply: (m, r) => { m.burnChance += 0.1 * r; } },
      key('Napalm', '♨', 'Chili Bomb leaves a patch of fire that burns enemies.', 'napalm'),
    ] },
  ],
  ninja: [
    { id: 'a', name: 'Shuriken', color: '#c9a6ff', nodes: [
      stat.dmg('Sharpened Stars'), stat.atk('Flurry'),
      key('Fan of Knives', '⋔', 'Throw three shuriken in a fan.', 'fan'),
      stat.crit('Vital Points'),
      key('Piercing Stars', '➹', 'Shuriken fly further and pierce through two enemies.', 'pierce'),
    ] },
    { id: 'b', name: 'Shadow', color: '#6b5a8f', nodes: [
      stat.cd('Shadow Pact'), stat.size('Long Step'),
      key('Shadow Strike', '⚡', 'Shadow Step deals almost double damage and stuns.', 'strike'),
      stat.invuln('Evasion'),
      key('Afterimage', '👥', 'Shadow Step leaves an exploding afterimage where you started.', 'afterimage'),
    ] },
  ],
};

const trees = {};
export function treeFor(heroId) {
  if (trees[heroId]) return trees[heroId];
  const branches = [HEARTY, ...(HERO_BRANCHES[heroId] || HERO_BRANCHES.knight)].map((b) => ({
    ...b, nodes: b.nodes.map((n, i) => ({ ...n, id: `${b.id}${i + 1}`, tier: i + 1, branch: b.id })),
  }));
  const byId = {};
  for (const b of branches) for (const n of b.nodes) byId[n.id] = n;
  return (trees[heroId] = { branches, byId });
}

export const pointsFor = (lv) => Math.max(0, Math.min(MAX_LEVEL, lv) - 1);
export const spent = (sk) => Object.values(sk || {}).reduce((a, b) => a + (b | 0), 0);

export function canBuy(heroId, sk, nodeId, lv) {
  const t = treeFor(heroId), n = t.byId[nodeId];
  if (!n) return false;
  if ((sk[nodeId] || 0) >= n.ranks) return false;
  if (spent(sk) >= pointsFor(lv)) return false;
  return n.tier === 1 || (sk[`${n.branch}${n.tier - 1}`] || 0) > 0;
}

// clean up skills that arrive over the network or from an old save: valid nodes, ranks and prerequisites,
// and no more points than the level allows
export function sanitizeSkills(heroId, sk, lv) {
  const t = treeFor(heroId), out = {};
  let left = pointsFor(lv);
  for (const b of t.branches) {
    for (const n of b.nodes) {
      const r = Math.min(n.ranks, (sk?.[n.id] | 0), left);
      if (r <= 0) break; // later tiers need this one
      out[n.id] = r; left -= r;
    }
  }
  return out;
}

// raw power from level alone: level 1 is ~20% below classic tuning; max level is a bit above it
export function applyProgress(m, prog) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, prog.lv || 1));
  m.dmg *= 0.8 * (1 + 0.025 * (lv - 1));
  m.atkSpeed *= 0.9 + 0.008 * (lv - 1);
  m.cdMul *= 1.15 - 0.012 * (lv - 1);
  const t = treeFor(prog.hero);
  for (const [id, r] of Object.entries(prog.sk || {})) if (r > 0 && t.byId[id]) t.byId[id].apply(m, Math.min(r, t.byId[id].ranks));
}

// recommended hero level for a stage (drives the overleveled-XP falloff)
export function recLevel(L) {
  if (!L) return 1;
  if (L.endless) return Math.min(MAX_LEVEL, 1 + (L.tier || 1));
  if (L.bossRush) return 12;
  const idx = +String(L.id).split('-')[1] || 1;
  return Math.round(1 + ((L.world || 1) - 1) * 3 + (idx - 1) * 0.6);
}

// later worlds expect a built hero; early ones are tuned for a fresh one
export function worldToughness(L) {
  if (!L || L.endless) return 0.9;
  return [0.85, 0.95, 1.05, 1.1][(L.world || 1) - 1] || 1;
}
