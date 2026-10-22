# Pastry Paladins — Design Notes

This is a design document for a co-op arena platformer in the spirit of *Muffin Knight*.
It covers the research behind the game, the principles drawn from it, and how each one shows up in the mechanics.

---

## 1. Reference games and what we took from them

| Game | What it teaches | Where it lives in Pastry Paladins |
|---|---|---|
| **Muffin Knight** (Angry Mob Games, 2014) | An arena platformer where you collect muffins. It has many playable characters, each with a special ability, plus perks during quests, a final boss, and co-op. | Collect-the-muffins objective, 6 distinct heroes, the "Topping" perks, and the Burnt Baron as final boss. |
| **Mario Bros. / Super Crate Box** | Single-screen arenas, screen wrap, and enemies that come back angrier if you let them fall. | Every level fits on one screen, edges wrap, and enemies that fall into pits or lava return **ENRAGED**. |
| **Celeste** | "Forgiving input" makes hard platforming feel fair. | Coyote time (0.1 s), jump buffering (0.13 s), variable jump height, apex hang time, and fast-fall. |
| **Hollow Knight** | The downward "pogo" strike turns combat into movement. | Sir Brioche's down-air slash bounces off enemies. |
| **Downwell** | Recoil as mobility gives you a skill expression you discover yourself. | Pepper Jack's shotgun recoil works as a rocket-jump. |
| **Vlambeer, "The Art of Screenshake"** | Juice: hit-stop, shake, particles, squash and stretch, and sound pitch-shifting. | Trauma-based screen shake, hit-stop on heavy hits, squash on land and jump, combo-pitched SFX, and damage numbers. |
| **Overcooked / It Takes Two** | Co-op gets its strength from players *needing* each other. | Role kits that synergize (freeze, mark, heal, block) and revive bubbles. |

## 2. Game theory and co-op design

Co-op games are **positive-sum games**: the team only wins if the team wins.
The risk is that individual incentives drift away from the team's interest.
That drift shows up as free-riding, hoarding shared resources, or blaming teammates.
We designed each system so that the selfish move and the team move are the same move.

### 2.1 Positive interdependence
Social interdependence theory separates three kinds of design.
In *individualistic* designs, my actions don't affect you.
In *cooperative* designs, my actions help you.
In *competitive* designs, my gain is your loss.
The practitioner rule of thumb is that *each player should hold a capability the others need*.
- **Mira** freezes enemies, and frozen enemies take **+50%** damage from *everyone*. Stomping one makes it shatter.
- **Cinna**'s arrows **mark** enemies for **+25%** damage from the whole team.
- **Dr. Fizz**'s Healing Brew heals the team and **triples revive speed**.
- **Sir Brioche**'s sword swings and shield charge **delete enemy projectiles**, which protects the players behind him.
- **Revives**: a downed hero becomes a floating bubble and can only come back when a teammate stands next to them. Downed players can steer their bubble, so they stay engaged instead of waiting out a death screen.

### 2.2 Aligned incentives
- **Team combo**: kills by anyone build one shared multiplier, and *anyone* getting hit halves it. Defense is part of scoring, and a teammate's mistake costs you too, so you protect each other.
- **Team stars**: star goals measure the team (total time, total hits, nobody downed). That avoids a zero-sum split of the credit.
- **Hearts go where they're needed**: a player at full health doesn't vacuum up a heart while a teammate is hurt. This removes a small *tragedy of the commons*.

### 2.3 Coopetition
Friendly rivalry keeps a group engaged, as long as it never makes cooperating worse.
The results screen gives **awards**: MVP, Muffin Monster, Slayer, Guardian Angel, Stomp King, and Untouchable.
They're bragging rights with no in-game effect, so competing for them never hurts the team.
*Guardian Angel* rewards revives specifically, which makes altruism a high-status act.

### 2.4 Scaling with player count
More friends should make the game **easier per person**, never harder. Each extra player brings a full share of firepower but adds only:
- **+15%** enemy HP and **+35%** boss HP.
- **+20%** concurrent enemies.
- **+12%** muffin goal.
- At most 2 helper minions during boss fights, and those only arrive every 12 s.

A team of 4 therefore does about half the per-player work of a solo run.
Measured with a test bot: two players used to take ~2.3× the hits of one player against King Gelatino. They now take about the same as a solo player and beat bosses much faster.

Solo players get **spare lives**, which auto-revive them.
In co-op on Casual or Normal, a downed player comes back on their own after 10 s or 20 s if nobody reaches them. A whole-team wipe still fails the level.
Revives take 1 s, and players get 1.3 s of invulnerability after being hit.

### Boss fairness
- **Lower HP:** King Gelatino 180, Cocoa Colossus 250, Sorbet Wyrm 230, Burnt Baron 330.
- **More breathing room:** longer pauses between attacks, and slower shockwaves you can jump over.
- **Wider safe gaps:** 3 lanes in icicle and bullet rain, fewer and slower bullets, and a longer weak-core window on the Colossus.
- **Healing:** a heart floats in every ~16 s during boss fights while anyone is hurt.

### 2.5 Dynamic difficulty, gently
- Heart drop chance rises from 4.5% to **12%** while any player is on their last heart. This is a pity mechanic you never see.
- The spawn director ramps intensity over time inside each level, and it opens portals **far from players**, so spawns are never cheap shots.
- The **Casual / Normal / Hard** settings scale enemy HP, enemy speed, and spawn rate. On Casual, downed co-op players also auto-revive after 12 s.

## 3. Skill: risk vs. reward
Skill-based games reward players who take on more risk with more precision.

| Mechanic | Risk | Reward |
|---|---|---|
| **Stomp** | You have to approach from above. Spiky enemies punish a careless stomp. | A bounce (higher if you hold jump), a refreshed double jump, and stun. |
| **Enrage** | Enemies knocked into pits come back faster and tougher. | They're worth ×1.5 score and drop an extra muffin. |
| **Perfect Release** (Cinna) | You move at 60% speed while drawing the bow. | Releasing in the ~0.2 s flash window gives a ×1.5 crit plus pierce. |
| **Shadow Step** (Mochi) | You commit to a dash *through* enemies. | The cooldown resets instantly if the dash kills, so skilled play chains dashes. |
| **Recoil** (Pepper) | Every shot pushes you around. | Shooting down while airborne launches you, and chili bombs rocket-jump you. |
| **Charge** (Mira) | You hold attack and aren't firing bolts while you do. | An explosive fireball that sets enemies on fire. |
| **Combo multiplier** | Getting hit halves it. | Up to ×4 score. |
| **Golden Muffin** | It appears on a platform *away from* the team, while enemies keep spawning. | It clears the level, and speed earns a star. |
| **Bonus muffins** | They float in exposed spots and expire. | Progress toward the goal without a kill. |

### Readability and fairness
- **Enemies patrol platforms.** At a ledge they pause, look around and usually turn back. They drop down only sometimes, more often when a player is below them. A newly spawned enemy stays on the upper platforms for about 9–14 s, where it used to be about 3 s, so there's time to fight it.
- **Hits keep enemies in place.** Light hits nudge an enemy and stagger it so you can combo; only heavy hits launch it.
- Every enemy attack has a **telegraph of at least 0.35 s**: glowing eyes, wind-up shakes, red "!" columns for falling hazards, dashed lines before the wyrm swoops, and target circles before King Gelatino slams.
- **Silhouettes** are distinct: the heroes are a bun, a macaron, a cinnamon roll, a gummy bear, a chili, and a mochi.
- Player colors (P1 red, P2 blue, P3 green, P4 gold) appear on tags, HUD cards, and arrows.
- **Generous hitboxes for the player**: enemy shots test against a hitbox 2 px smaller than the sprite.
- Enraged enemies glow red, and armored states draw a shield ring. Hits on armored enemies "clink" and do nothing, so the rule teaches itself.

## 4. Flow and progression
Csikszentmihalyi's *flow* channel means keeping challenge in step with growing skill.
- **4 worlds × 5 levels**. Each world introduces 1–3 new enemy types and ends with a boss that tests what the world taught:
  - **King Gelatino** tests jumping over shockwaves.
  - **Cocoa Colossus** tests punishing a vulnerable window.
  - **Sorbet Wyrm** tests reading telegraphs.
  - **Burnt Baron** tests bullet-pattern reading across three phases.
- There are 3 objective types (Collect, Survive, Boss) for pacing variety. Endless uses Waves.
- **Stars** (60 in total) give mastery goals beyond "clear it". They gate cosmetic hats, never content.
- **Toppings** are 19 roguelite perks with rarities. You pick 1 of 3 between levels, which is a meaningful choice with build variety (Glass Candy is a real trade-off). You keep them for the whole run.
- **Hero levels & skill trees** (`src/data/skills.js`). Each hero has its own level (1–15) and tree, so trying a new hero means starting fresh, which is a reason to replay early worlds.
  - **Power curve.** A level-1 hero deals ~20% less damage than the old tuning, attacks a little slower, and has slower specials. Each level adds raw power (+2.5% damage), and every level after the first gives a skill point. At max level a built hero is roughly 1.6–2× as strong, plus the keystone behaviours.
  - **Trees.** There are 3 branches of 5 tiers: the shared *Hearty* branch (hearts, speed, air jump, Second Bake) and two hero branches, one for the attack and one for the special. Tiers unlock top to bottom. Tier 3 and 5 nodes are **keystones** that change how a move works rather than adding a percentage. There are 22 ranks but only 14 points, so a build is a real choice. Respec is free, so experimenting costs nothing.
  - **XP.** A clear gives `30 + 6×rec` XP; stars, kills, revives and bosses add more. A failed attempt still gives a little. The XP to the next level is `60 + 30×(lv−1)`, which puts a hero at about level 4 after World 1, 7 after World 2, 9 after World 3 and 11–12 after World 4.
  - **Keeping early levels honest.** Every stage has a recommended level, shown on the map. A hero more than 2 levels above it earns −25% XP per extra level, down to 15%, so farming 1-1 doesn't work. Enemy health scales with the team's *average* hero level (+1.2% per level, about half of a hero's raw growth, so levels still feel like power), and later worlds are tuned for built heroes (World 1 ×0.85 → World 4 ×1.1). Replaying an early world as a strong hero is still easier, but it isn't free.
  - **Co-op catch-up.** A hero 3+ levels below your best hero earns 1.5× XP. A hero 3+ levels below anyone in the room earns 2×, so a new friend catches up in a few stages. Because scaling uses the team average, a low-level friend makes the stage a bit easier for everyone instead of being a dead weight.
  - **Online.** Each player's level and skills live on their own device. They are sent with the roster (`hello` / `setHero`) and re-validated by the host. *Party mode* treats every hero as level 15.
- **Unlocks**: Pepper Jack unlocks after World 1, and Mochi after World 2. *Party mode* in Settings unlocks everything for groups who just want to play.
- **Endless** and **Boss Rush** give replay value. Your best Endless stage is saved.

## 5. Game feel numbers
| Parameter | Value |
|---|---|
| Simulation | Fixed 60 Hz, sub-stepped collision |
| Jump velocity | 372 u/s: a tap gives about 2 tiles, a full hold about 4.4 tiles |
| Gravity | 950 rising while held, 2500 after an early release (smooth short hops, no velocity snap), 1350 falling |
| Apex hang | ×0.5 gravity when \|vy\| < 55 and jump is held |
| Launches | Springs, pogo, rocket-jumps and held stomp bounces always rise in full |
| Coyote / buffer | 0.12 s / 0.15 s |
| Rendering | Interpolated between 60 Hz simulation steps, so 90/120 Hz screens stay smooth |
| Camera | 1.35× zoom by default (adjustable 1–1.7×) that follows this device's hero(es); it zooms out to frame every local player, shows the whole arena during the intro, and puts edge arrows on off-screen enemies, teammates and the Golden Muffin. Motion uses critically damped springs, an eased look-ahead in the running direction, and a vertical floor lock so small hops don't bob the view. The camera stays inside the arena so its edges read clearly (an endless, tiled view was tried and felt disorienting, and drawing the arena twice near the seam cost phones frame rate). Open side edges get a soft glow with chevrons, and when the hero wraps the camera swoops across quickly instead of gliding |
| Ground acceleration | 1700 (×1.6 when turning around), ice 420 |
| Hit-stop | 25 ms on normal hits, 60 ms on heavy hits and crits, 70 ms when you get hit |
| Invulnerability | 1.1 s after a hit (more with *Thick Crust*) |

### Phone performance
Phones are usually limited by pixel fill and compositing, not by JavaScript; the per-frame script cost is about 1 ms on a desktop.
- **Frame governor (`src/perf.js`).** On the default *Auto* graphics setting it watches real frame intervals during play.
  - When more than 10% of frames miss vsync, it first caps rendering at 60 fps on 120 Hz screens. The sim runs at 60 Hz, and a steady 60 looks smoother than a stuttering 120.
  - If frames are still missed, it lowers the canvas resolution in steps: 2× → 1.75× → 1.5× → 1.3× → 1.1×.
  - It steps back up after a long stretch of headroom, and stops retrying a step that has failed twice.
  - What it learns is remembered per device.
- **Opaque canvas** (`alpha: false`), which phones composite more cheaply.
- **No `ctx.filter`:** the enemy hit flash is drawn through a small scratch canvas instead.
- **Light touch HUD:** it writes to the DOM only when a value changes, caches button rects (no layout reads on each touch), moves the stick with transforms, and animates the "special ready" glow with opacity only.

## 6. Online architecture
Mobile co-op means every friend is on their own phone. Room codes run over WebRTC (PeerJS).
- **Host-authoritative world**: the host simulates enemies, spawns, pickups, objectives, and score. It broadcasts 20 Hz snapshots.
- **Client-authoritative movement**: you simulate your own hero locally, so controls have zero input lag even on mobile networks.
- **Favor the shooter**: your attacks hit what *you* see. The hit is predicted locally (flash, numbers, hit-stop) and confirmed by the host.
- **Interpolation**: remote entities render 110 ms in the past, between snapshots.
- **Deterministic projectiles**: the host sends each enemy shot once as a spawn event. Each client then simulates it locally, so dodging is judged against what you actually saw.
- Clients relay cosmetic events (shots, zones, effects) through the host.
- Disconnects are handled without crashing the game.
- **Cloudflare room relay (preferred)**: a Worker + Durable Object per room, created at the Cloudflare data centre nearest the host.
  - Clients connect to it over a WebSocket.
  - Player movement is forwarded straight to the other players as well as to the host, which skips one hop.
- **Update rate and smoothing**: snapshots and player states go out at 30 Hz.
  - The interpolation delay adapts to measured arrival jitter: about 50 ms on a good link, up to 200 ms on a jittery one.
- **Resilience**: a player is marked "reconnecting" after 3.5 s of silence and only removed after 30 s.
  - The relay connection has a keep-alive, so a silently dead mobile connection is detected in about 4.5 s and re-established automatically.
  - Reconnected players are brought back to whatever screen the host is on.
  - Closing the tab is a real leave and takes effect immediately.
- **Relay fallback**: a joining client first tries direct WebRTC for 7 s.
  - If that fails, it reaches the host through a public MQTT broker over `wss://`.
  - The host listens on several brokers at once, and the client uses the first one it can reach.
  - The game protocol is the same over either path. The relay adds some latency, but it gets through any network that allows web browsing.

## Sources
- [Muffin Knight on Steam](https://store.steampowered.com/app/263700)
- [Positive interdependence (Wikipedia)](https://en.wikipedia.org/wiki/Positive_interdependence)
- [Leveraging Asymmetry and Interdependence to Enhance Social Connectedness in Cooperative Digital Games (University of Waterloo)](https://uwspace.uwaterloo.ca/handle/10012/14710)
- [Building Co-op Games: practitioner notes on interdependence](https://api.bybrand.io/building-co-op-games-3603191961.html)
- [Platformer feel conventions: coyote time, jump buffering, asymmetric gravity](https://claudeskills.info/skills/gamedev-skills/awesome-gamedev-agent-skills/platformer/)
