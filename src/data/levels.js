// Worlds, themes and hand-designed arena maps.
// Legend: . empty  # ground  = brick/rock  - one-way platform  i ice  ^ spikes  o spring
//         L lava  E enemy portal  P player spawn  M bonus-muffin spot
// Maps marked `mirror` give the left 16 columns; the right half is mirrored.

export const WORLDS = [
  {
    id: 1, name: 'Candy Meadows', music: 'w1', blurb: 'Rolling frosting hills where the gumdrops have gone rogue.',
    sky: ['#7cc8ff', '#c9ecff', '#ffe1f1'], sun: '#fff4b8',
    far: '#b8e6c9', mid: '#8fd6a8', near: '#6cc28f',
    ground: { base: '#d8925f', dark: '#9a5a37', top: '#ff8fc8', topHi: '#ffd1ea', drip: '#ff8fc8', speck: ['#ff5c8a', '#5cc8ff', '#ffe066', '#7be08b'] },
    plat: { base: '#f4c98a', dark: '#c48b4e', stripe: '#e8b06a' },
    alt: { base: '#ffb3d4', dark: '#d46a9a', line: '#fff' },
    ambient: 'petals', deco: 'lollipop', dark: 0,
  },
  {
    id: 2, name: 'Choco Caverns', music: 'w2', blurb: 'Deep fudge mines lit by glowing sugar crystals.',
    sky: ['#1d1020', '#3a1e2e', '#5a2e3a'], sun: null,
    far: '#3e2230', mid: '#4b2a34', near: '#5d3640',
    ground: { base: '#6b3f2a', dark: '#3d2116', top: '#a8683f', topHi: '#d9955c', drip: '#8a5232', speck: ['#ffcf5c', '#ff9b5c', '#c9f'] },
    plat: { base: '#c58c5c', dark: '#7a4a2a', stripe: '#a56d42' },
    alt: { base: '#8a5a48', dark: '#4a2a22', line: '#b07a60' },
    ambient: 'motes', deco: 'crystal', dark: 0.55,
  },
  {
    id: 3, name: 'Frosting Peaks', music: 'w3', blurb: 'Slippery sorbet slopes under a shimmering aurora.',
    sky: ['#2a3f8f', '#6d8fe0', '#d6e8ff'], sun: '#ffffff',
    far: '#c8dcff', mid: '#a9c4f2', near: '#8fb0e6',
    ground: { base: '#a5c9f0', dark: '#5f86c4', top: '#ffffff', topHi: '#ffffff', drip: '#ffffff', speck: ['#ffffff', '#cfe6ff', '#ffd6f0'] },
    plat: { base: '#e8f4ff', dark: '#9ebde6', stripe: '#cfe2fb' },
    alt: { base: '#bcd8ff', dark: '#6f95cc', line: '#ffffff' },
    ambient: 'snow', deco: 'pine', dark: 0,
  },
  {
    id: 4, name: 'Oven Citadel', music: 'w4', blurb: 'The Burnt Baron\'s fortress, bubbling with caramel lava.',
    sky: ['#2a0d12', '#5e1a1a', '#b5432a'], sun: null,
    far: '#4a1a1e', mid: '#5e2222', near: '#73302a',
    ground: { base: '#5a3a3a', dark: '#2e1a1e', top: '#3b2528', topHi: '#7a4a40', drip: '#3b2528', speck: ['#ff7a3d', '#ffb347'] },
    plat: { base: '#7a5a5a', dark: '#3e2a2e', stripe: '#6a4848' },
    alt: { base: '#8a4a3a', dark: '#4a2420', line: '#b0604a' },
    ambient: 'embers', deco: 'chain', dark: 0.35,
  },
];

const L = [];
const lvl = (o) => { L.push(o); return o; };

// ---------------------------------------------------------------- WORLD 1
lvl({
  id: '1-1', world: 1, name: 'Sprinkle Fields', type: 'collect', goal: 8, par: 55,
  enemies: { gumdrop: 6, bat: 1 }, maxAlive: 4, interval: 2.2,
  tip: 'Jump on enemies to stomp them! Defeated foes drop muffins.',
  mirror: true, map: [
    '................',
    '................',
    '..E.............',
    '................',
    '.-----..........',
    '................',
    '............M...',
    '..........------',
    '................',
    '................',
    '-----...........',
    '................',
    '................',
    '......------....',
    '................',
    '.P.........P....',
    '################',
    '################',
  ],
});
lvl({
  id: '1-2', world: 1, name: 'Gumdrop Hollow', type: 'collect', goal: 10, par: 65,
  enemies: { gumdrop: 4, bat: 2, urchin: 2 }, maxAlive: 5, interval: 2.0,
  tip: 'Enemies that fall in the pit come back ENRAGED. Spiky ones can\'t be stomped!',
  mirror: true, map: [
    '................',
    '................',
    '...E............',
    '..----..........',
    '................',
    '................',
    '.........-------',
    '................',
    '................',
    '###.............',
    '###.............',
    '...........M....',
    '......----......',
    '................',
    '................',
    '.P.........o....',
    '#############...',
    '#############...',
  ],
});
lvl({
  id: '1-3', world: 1, name: 'Sugar Rush', type: 'survive', time: 60, par: 0,
  enemies: { gumdrop: 4, bat: 3, urchin: 2, candycorn: 2 }, maxAlive: 6, interval: 1.6,
  tip: 'Survive until the timer runs out. Watch out for spikes!',
  mirror: true, map: [
    '................',
    '..E.............',
    '................',
    '......----......',
    '................',
    '................',
    '--........------',
    '................',
    '................',
    '....-----.......',
    '................',
    '..........M.....',
    '-------.........',
    '................',
    '................',
    '..P.........^^^^',
    '################',
    '################',
  ],
});
lvl({
  id: '1-4', world: 1, name: 'Lollipop Loop', type: 'collect', goal: 14, par: 95,
  enemies: { gumdrop: 3, bat: 2, urchin: 2, candycorn: 2, brute: 1 }, maxAlive: 6, interval: 1.8,
  tip: 'Run off the screen edge to wrap around to the other side!',
  mirror: true, map: [
    '................',
    '................',
    '.E..............',
    '####............',
    '................',
    '..........------',
    '................',
    '................',
    '....------......',
    '................',
    '...........M....',
    '-----.....------',
    '................',
    '................',
    '................',
    '..P..........o..',
    '#######.....####',
    '#######.....####',
  ],
});
lvl({
  id: '1-5', world: 1, name: 'Royal Jelly Court', type: 'boss', boss: 'jellyking', par: 100,
  enemies: { gumdrop: 1 }, maxAlive: 0, interval: 99,
  tip: 'Jump over the shockwaves. The King is bouncy... try stomping him!',
  mirror: true, map: [
    '................',
    '................',
    '................',
    '................',
    '..E.............',
    '................',
    '................',
    '-----...........',
    '................',
    '................',
    '................',
    '.....-----......',
    '................',
    '................',
    '................',
    '..P.....P.......',
    '################',
    '################',
  ],
});

// ---------------------------------------------------------------- WORLD 2
lvl({
  id: '2-1', world: 2, name: 'Cocoa Mine', type: 'collect', goal: 12, par: 75,
  enemies: { bat: 3, jawbreaker: 2, gumdrop: 2, candycorn: 2 }, maxAlive: 5, interval: 1.9,
  tip: 'Jawbreakers are armored while rolling. Hit them when they\'re dizzy!',
  mirror: true, map: [
    '################',
    '#...............',
    '#..E............',
    '#...............',
    '#=====..........',
    '................',
    '................',
    '........--------',
    '................',
    '#...............',
    '#==....M........',
    '#...............',
    '#.......-----...',
    '#...............',
    '#...............',
    '#P..........P...',
    '################',
    '################',
  ],
});
lvl({
  id: '2-2', world: 2, name: 'Fudge Falls', type: 'collect', goal: 14, par: 85,
  enemies: { bat: 2, bomber: 2, jawbreaker: 2, urchin: 2 }, maxAlive: 6, interval: 1.8,
  tip: 'Cupcake bombers drop explosives. Keep moving!',
  mirror: true, map: [
    '################',
    '................',
    '...E............',
    '..====..........',
    '................',
    '................',
    '..........------',
    '######..........',
    '................',
    '................',
    '...-----........',
    '................',
    '.............M..',
    '=====......-----',
    '................',
    '.P..............',
    '#########.......',
    '#########.......',
  ],
});
lvl({
  id: '2-3', world: 2, name: 'Rolling Thunder', type: 'survive', time: 75, par: 0,
  enemies: { jawbreaker: 3, bat: 2, brute: 1, bomber: 1, gumdrop: 2 }, maxAlive: 6, interval: 1.6,
  tip: 'Marshmallow Brutes charge after a wind-up. Dodge, then punish!',
  mirror: true, map: [
    '################',
    '#...............',
    '#.E.............',
    '#...............',
    '#----...........',
    '#..........-----',
    '#...............',
    '#...............',
    '#.....------....',
    '#...............',
    '#...............',
    '#---............',
    '#..........-----',
    '#...............',
    '#...........M...',
    '#.P.............',
    '################',
    '################',
  ],
});
lvl({
  id: '2-4', world: 2, name: 'Crumble Depths', type: 'collect', goal: 16, par: 100,
  enemies: { bomber: 2, brute: 1, jawbreaker: 2, candycorn: 2, bat: 2 }, maxAlive: 6, interval: 1.7,
  tip: 'Combos multiply your score. Keep the kills flowing!',
  mirror: true, map: [
    '................',
    '.E..............',
    '................',
    '-----.....------',
    '................',
    '................',
    '....##..........',
    '....##....------',
    '................',
    '................',
    '===.......----..',
    '................',
    '................',
    '......----......',
    '................',
    '..P............M',
    '######....######',
    '######....######',
  ],
});
lvl({
  id: '2-5', world: 2, name: 'Colossus Core', type: 'boss', boss: 'golem', par: 120,
  enemies: { bat: 1 }, maxAlive: 0, interval: 99,
  tip: 'After a slam, the Colossus\' core is exposed. Strike it for double damage!',
  mirror: true, map: [
    '################',
    '#...............',
    '#...............',
    '#..E............',
    '#...............',
    '#...............',
    '#----...........',
    '#...............',
    '#...............',
    '#.......--......',
    '#...............',
    '#...............',
    '#---............',
    '#...............',
    '#...............',
    '#.P......P......',
    '################',
    '################',
  ],
});

// ---------------------------------------------------------------- WORLD 3
lvl({
  id: '3-1', world: 3, name: 'Glacier Gateway', type: 'collect', goal: 14, par: 85,
  enemies: { icegolem: 2, bat: 2, ghost: 1, gumdrop: 2 }, maxAlive: 5, interval: 1.9,
  tip: 'Ice is slippery! Ice shards slow you down.',
  mirror: true, map: [
    '................',
    '..E.............',
    '................',
    '.iiii...........',
    '................',
    '................',
    '..........iiiiii',
    '................',
    '................',
    'iii....---......',
    '................',
    '...........M....',
    '.....iiii.......',
    '................',
    '................',
    '.P........o.....',
    '################',
    '################',
  ],
});
lvl({
  id: '3-2', world: 3, name: 'Snowcone Summit', type: 'collect', goal: 16, par: 95,
  enemies: { ghost: 2, wizard: 1, icegolem: 2, bomber: 1, bat: 1 }, maxAlive: 6, interval: 1.8,
  tip: 'Toast Ghosts can only be hit while they\'re solid.',
  mirror: true, map: [
    '................',
    '................',
    '..............E.',
    '................',
    '............iiii',
    '................',
    '................',
    '........iiiiiiii',
    '................',
    '--..............',
    '................',
    '....iiiiii......',
    '................',
    '..............M.',
    '................',
    '..P.............',
    '#####......#####',
    '#####......#####',
  ],
});
lvl({
  id: '3-3', world: 3, name: 'Blizzard Bash', type: 'survive', time: 80, par: 0,
  enemies: { ghost: 2, icegolem: 2, wizard: 1, urchin: 2, bat: 2 }, maxAlive: 7, interval: 1.5,
  tip: 'Springs launch you high. Use them to escape!',
  mirror: true, map: [
    '................',
    '.E..............',
    '................',
    '................',
    'iii......iiiiiii',
    '................',
    '................',
    '................',
    '....----........',
    '................',
    '..........M.....',
    'iiii......------',
    '................',
    '................',
    '................',
    '..P...^^.......o',
    '################',
    '################',
  ],
});
lvl({
  id: '3-4', world: 3, name: 'Frostbite Fortress', type: 'collect', goal: 18, par: 110,
  enemies: { wizard: 2, icegolem: 2, ghost: 2, brute: 1, jawbreaker: 1 }, maxAlive: 7, interval: 1.6,
  tip: 'Licorice Wizards teleport. Watch for the sparkles where they\'ll appear.',
  mirror: true, map: [
    '################',
    '#...............',
    '#.E.............',
    '#...............',
    '#iii......------',
    '#...............',
    '#...............',
    '#.....iii.......',
    '#...............',
    '................',
    '..............M.',
    '####.....---....',
    '#...............',
    '#......iiii.....',
    '#...............',
    '#.P.............',
    '########....####',
    '########....####',
  ],
});
lvl({
  id: '3-5', world: 3, name: 'Wyrm\'s Roost', type: 'boss', boss: 'wyrm', par: 130,
  enemies: { bat: 1 }, maxAlive: 0, interval: 99,
  tip: 'Only the Sorbet Wyrm\'s head can be damaged. Watch for falling icicles!',
  mirror: true, map: [
    '................',
    '................',
    '..E.............',
    '................',
    '................',
    '-----...........',
    '................',
    '................',
    '..........------',
    '................',
    '................',
    '....iiii........',
    '................',
    '................',
    '................',
    '..P.....P.......',
    '################',
    '################',
  ],
});

// ---------------------------------------------------------------- WORLD 4
lvl({
  id: '4-1', world: 4, name: 'Ember Entry', type: 'collect', goal: 16, par: 95,
  enemies: { imp: 3, bat: 1, candycorn: 2, brute: 1 }, maxAlive: 6, interval: 1.8,
  tip: 'Caramel lava burns! Ember Imps leave fire behind them.',
  mirror: true, map: [
    '................',
    '..E.............',
    '................',
    '====............',
    '................',
    '................',
    '.........-------',
    '................',
    '................',
    '...=====........',
    '................',
    '..........M.....',
    '==.......-------',
    '................',
    '................',
    '.P..............',
    '########LLLL####',
    '########LLLL####',
  ],
});
lvl({
  id: '4-2', world: 4, name: 'Magma Mixer', type: 'collect', goal: 18, par: 105,
  enemies: { imp: 3, wizard: 1, bomber: 2, jawbreaker: 1, gumdrop: 1 }, maxAlive: 7, interval: 1.7,
  tip: 'Floating springs can save you from the lava.',
  mirror: true, map: [
    '================',
    '................',
    '.E..............',
    '......====......',
    '................',
    '................',
    '----.........---',
    '................',
    '................',
    '.....----.......',
    '................',
    '...............M',
    '==.........-----',
    '................',
    '................',
    '..P...o.........',
    '####LLLLLL######',
    '####LLLLLL######',
  ],
});
lvl({
  id: '4-3', world: 4, name: 'Inferno Gauntlet', type: 'survive', time: 90, par: 0,
  enemies: { imp: 3, brute: 2, ghost: 1, wizard: 1, bomber: 1, jawbreaker: 1 }, maxAlive: 7, interval: 1.4,
  tip: 'Stick together. Revive fallen friends by standing next to them!',
  mirror: true, map: [
    '================',
    '=...............',
    '=.E.............',
    '=...............',
    '=---.......-----',
    '................',
    '................',
    '......---.......',
    '................',
    '..............M.',
    '===.......------',
    '................',
    '................',
    '................',
    '.....--.........',
    '.P.......^^.....',
    '################',
    '################',
  ],
});
lvl({
  id: '4-4', world: 4, name: 'Baron\'s Bakery', type: 'collect', goal: 20, par: 120,
  enemies: { imp: 2, wizard: 2, brute: 1, icegolem: 1, ghost: 1, jawbreaker: 1, bomber: 1 }, maxAlive: 7, interval: 1.5,
  tip: 'The final stretch! Everything the Baron has, all at once.',
  mirror: true, map: [
    '................',
    '...E............',
    '..====..........',
    '................',
    '................',
    '........--------',
    '................',
    '................',
    '---.............',
    '................',
    '......-----.....',
    '................',
    '..............M.',
    '..............--',
    '................',
    '..P.............',
    '#####LLL########',
    '#####LLL########',
  ],
});
lvl({
  id: '4-5', world: 4, name: 'The Burnt Throne', type: 'boss', boss: 'baron', par: 160,
  enemies: { imp: 1 }, maxAlive: 0, interval: 99,
  tip: 'Learn the Baron\'s bullet patterns. Look for the gaps!',
  mirror: true, map: [
    '================',
    '=...............',
    '=...............',
    '=..E............',
    '=...............',
    '=...............',
    '=---............',
    '=...............',
    '=...............',
    '=.......----....',
    '=...............',
    '=...............',
    '=-----..........',
    '=...............',
    '=...............',
    '=.P.....P.......',
    '################',
    '################',
  ],
});

export const LEVELS = L;

export function levelById(id) {
  return L.find((l) => l.id === id);
}

export function worldLevels(world) {
  return L.filter((l) => l.world === world);
}

// Expand mirrored maps into full 32-col rows
export function expandMap(level) {
  if (level._rows) return level._rows;
  const rows = level.map.map((r) => {
    let row = r;
    if (level.mirror) {
      row = r.padEnd(16, '.').slice(0, 16);
      row = row + row.split('').reverse().join('');
    }
    return row.padEnd(32, '.').slice(0, 32);
  });
  while (rows.length < 18) rows.push('.'.repeat(32));
  level._rows = rows.slice(0, 18);
  return level._rows;
}

// ---------------------------------------------------------------- ENDLESS / BOSS RUSH
const ENDLESS_POOL = [
  ['gumdrop', 1], ['bat', 1], ['urchin', 2], ['candycorn', 2], ['jawbreaker', 3], ['bomber', 4],
  ['brute', 4], ['icegolem', 5], ['ghost', 6], ['wizard', 7], ['imp', 6],
];

export function endlessStage(stageIndex) {
  // each stage = 3 waves on a rotating arena. Every 4th stage is a boss.
  const nonBoss = L.filter((l) => l.type !== 'boss');
  const bosses = ['jellyking', 'golem', 'wyrm', 'baron'];
  const isBoss = (stageIndex + 1) % 4 === 0;
  const tier = stageIndex + 1;
  if (isBoss) {
    const b = bosses[Math.floor(stageIndex / 4) % 4];
    const base = L.find((l) => l.boss === b);
    return { ...base, id: `E${tier}`, name: `Stage ${tier}: ${base.name}`, endless: true, tier, hpScale: 1 + Math.floor(stageIndex / 16) * 0.5 };
  }
  const base = nonBoss[(stageIndex * 7) % nonBoss.length];
  const enemies = {};
  for (const [k, minTier] of ENDLESS_POOL) if (tier >= minTier) enemies[k] = 1 + (tier >= minTier + 3 ? 1 : 0);
  return {
    ...base, id: `E${tier}`, name: `Stage ${tier}: ${base.name}`, type: 'waves', waves: 3, endless: true, tier,
    enemies, maxAlive: Math.min(10, 4 + Math.floor(tier * 0.6)), interval: Math.max(0.8, 2 - tier * 0.08), par: 0,
    hpScale: 1 + tier * 0.08,
  };
}

export function bossRushStage(i) {
  const order = ['jellyking', 'golem', 'wyrm', 'baron'];
  if (i >= order.length) return null;
  const base = L.find((l) => l.boss === order[i]);
  return { ...base, id: `B${i + 1}`, name: `Boss ${i + 1}/4: ${base.name}`, bossRush: true, hpScale: 1 };
}
