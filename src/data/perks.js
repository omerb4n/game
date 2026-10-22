// Roguelite "Toppings" (perks) chosen between stages, and achievements.
import { applyProgress } from './skills.js';

export const PERKS = [
  { id: 'heart', name: 'Extra Layer', icon: '❤', desc: '+1 max heart and heal fully.', rarity: 1, apply: (m) => { m.maxHp += 1; } },
  { id: 'dmg', name: 'Sharp Sprinkles', icon: '⚔', desc: '+20% damage.', rarity: 1, apply: (m) => { m.dmg *= 1.2; } },
  { id: 'speed', name: 'Sugar Legs', icon: '➶', desc: '+12% movement speed.', rarity: 1, apply: (m) => { m.speed *= 1.12; } },
  { id: 'jump', name: 'Feather Flour', icon: '⇑', desc: '+1 mid-air jump.', rarity: 2, max: 2, apply: (m) => { m.airJumps += 1; } },
  { id: 'cd', name: 'Quick Oven', icon: '⟳', desc: 'Special recharges 25% faster.', rarity: 1, apply: (m) => { m.cdMul *= 0.75; } },
  { id: 'atk', name: 'Rapid Whisk', icon: '≫', desc: '+20% attack speed.', rarity: 1, apply: (m) => { m.atkSpeed *= 1.2; } },
  { id: 'crit', name: 'Crit Crumbs', icon: '✷', desc: '+15% chance to deal double damage.', rarity: 1, apply: (m) => { m.crit += 0.15; } },
  { id: 'frost', name: 'Frosty Touch', icon: '❄', desc: 'Hits have a 12% chance to freeze.', rarity: 2, apply: (m) => { m.freezeChance += 0.12; } },
  { id: 'spicy', name: 'Spicy Touch', icon: '🔥', desc: 'Hits have a 20% chance to burn.', rarity: 1, apply: (m) => { m.burnChance += 0.2; } },
  { id: 'magnet', name: 'Muffin Magnet', icon: '◎', desc: 'Pickups fly to you from further away.', rarity: 1, max: 2, apply: (m) => { m.magnet += 50; } },
  { id: 'stomp', name: 'Bouncy Boots', icon: '⤓', desc: 'Stomps deal triple damage and bounce higher.', rarity: 1, max: 1, apply: (m) => { m.stompMul *= 3; } },
  { id: 'thick', name: 'Thick Crust', icon: '⛨', desc: 'Longer invulnerability after being hit.', rarity: 1, max: 2, apply: (m) => { m.invulnBonus += 0.6; } },
  { id: 'angel', name: 'Angel Cake', icon: '✚', desc: 'Revive allies 2× faster. Revived allies get a shield.', rarity: 1, max: 1, apply: (m) => { m.reviveMul *= 2; } },
  { id: 'second', name: 'Second Bake', icon: '♻', desc: 'Once per stage, revive yourself automatically.', rarity: 3, max: 1, apply: (m) => { m.secondBake += 1; } },
  { id: 'vamp', name: 'Jammy Dodger', icon: '♥', desc: 'Every 12 kills, heal 1 heart.', rarity: 2, max: 1, apply: (m) => { m.lifesteal = 12; } },
  { id: 'big', name: 'Big Bites', icon: '⬤', desc: 'Attacks and specials are 25% larger.', rarity: 2, max: 2, apply: (m) => { m.size *= 1.25; } },
  { id: 'revenge', name: 'Sweet Revenge', icon: '✺', desc: 'When hit, blast nearby enemies.', rarity: 2, max: 1, apply: (m) => { m.revenge = 1; } },
  { id: 'coins', name: 'Lucky Cookie', icon: '¢', desc: '+60% sprinkle coins.', rarity: 1, max: 2, apply: (m) => { m.coinMul += 0.6; } },
  { id: 'glass', name: 'Glass Candy', icon: '◆', desc: '+50% damage, but -1 max heart.', rarity: 3, max: 1, apply: (m) => { m.dmg *= 1.5; m.maxHp -= 1; } },
];

export const perkById = (id) => PERKS.find((p) => p.id === id);

export function baseMods() {
  return {
    dmg: 1, speed: 1, atkSpeed: 1, cdMul: 1, size: 1, crit: 0, freezeChance: 0, burnChance: 0, airJumps: 0, magnet: 0,
    stompMul: 1, invulnBonus: 0, reviveMul: 1, lifesteal: 0, secondBake: 0, revenge: 0, coinMul: 1, maxHp: 0,
    k: {}, // skill-tree keystones (flags read by hero kits)
  };
}

// prog: { hero, lv, sk } from the hero's progression (level + skill tree); perks stack on top
export function computeMods(perkIds, prog) {
  const m = baseMods();
  if (prog) applyProgress(m, prog);
  for (const id of perkIds || []) perkById(id)?.apply(m);
  return m;
}

export function rollPerks(owned, n = 3) {
  const counts = {};
  for (const id of owned) counts[id] = (counts[id] || 0) + 1;
  const pool = PERKS.filter((p) => !p.max || (counts[p.id] || 0) < p.max);
  const out = [];
  const weights = pool.map((p) => (p.rarity === 1 ? 6 : p.rarity === 2 ? 3 : 1.4));
  while (out.length < n && pool.length) {
    let tot = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    let i = 0;
    for (; i < pool.length; i++) { r -= weights[i]; if (r <= 0) break; }
    i = Math.min(i, pool.length - 1);
    out.push(pool[i].id);
    pool.splice(i, 1); weights.splice(i, 1);
  }
  return out;
}

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Bite', desc: 'Clear your first level.', icon: '🧁' },
  { id: 'w1', name: 'Jelly Dethroned', desc: 'Defeat King Gelatino.', icon: '👑' },
  { id: 'w2', name: 'Core Meltdown', desc: 'Defeat the Cocoa Colossus.', icon: '🍫' },
  { id: 'w3', name: 'Brain Freeze', desc: 'Defeat the Sorbet Wyrm.', icon: '🍧' },
  { id: 'w4', name: 'Well Done', desc: 'Defeat the Burnt Baron and save the bakery.', icon: '🔥' },
  { id: 'stars20', name: 'Rising Dough', desc: 'Earn 20 stars.', icon: '⭐' },
  { id: 'stars60', name: 'Master Baker', desc: 'Earn all 60 stars.', icon: '🌟' },
  { id: 'combo20', name: 'Sugar High', desc: 'Reach a 20x combo.', icon: '⚡' },
  { id: 'combo50', name: 'Hyperglycemic', desc: 'Reach a 50x combo.', icon: '💥' },
  { id: 'nohit', name: 'Untouchable', desc: 'Clear a level without anyone getting hit.', icon: '🛡' },
  { id: 'stomp50', name: 'Stomp Champion', desc: 'Stomp 50 enemies.', icon: '👟' },
  { id: 'muffin100', name: 'Sweet Tooth', desc: 'Collect 100 muffins.', icon: '🧁' },
  { id: 'muffin500', name: 'Muffin Monster', desc: 'Collect 500 muffins.', icon: '🍰' },
  { id: 'kill500', name: 'Crumb Maker', desc: 'Defeat 500 enemies.', icon: '💀' },
  { id: 'revive10', name: 'Lifesaver', desc: 'Revive teammates 10 times.', icon: '💖' },
  { id: 'party4', name: 'Full Oven', desc: 'Play a level with 4 players.', icon: '👨‍👩‍👧‍👦' },
  { id: 'speed', name: 'Speed Baker', desc: 'Clear a collect level in under 40 seconds.', icon: '⏱' },
  { id: 'shatter25', name: 'Shatterproof', desc: 'Shatter 25 frozen enemies.', icon: '❄' },
  { id: 'perfect20', name: 'Bullseye', desc: 'Land 20 perfect-release arrows.', icon: '🎯' },
  { id: 'endless10', name: 'Bottomless Batter', desc: 'Reach stage 10 in Endless.', icon: '∞' },
  { id: 'bossrush', name: 'Boss Buffet', desc: 'Clear Boss Rush.', icon: '🏆' },
  { id: 'hard', name: 'Burnt to a Crisp', desc: 'Defeat any boss on Hard difficulty.', icon: '🌶' },
  { id: 'hats3', name: 'Fashionista', desc: 'Own 3 hats.', icon: '🎩' },
  { id: 'rich', name: 'Sprinkle Hoarder', desc: 'Earn 1000 sprinkle coins in total.', icon: '💰' },
];
