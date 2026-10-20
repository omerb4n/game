# 🧁 Pastry Paladins

**A co-op arena platformer for 1–4 players that runs in the browser.**
Stomp gumdrops, collect muffins, revive your friends, and take down the Burnt Baron together.
Each friend can play on their own phone, or you can share one screen with gamepads and a keyboard.

> Inspired by *Muffin Knight*. Every sprite is drawn in code and every sound is synthesized, so the game ships with no image or audio assets.

## Play
Open `index.html` through any static web server (see below). On a phone, add it to your home screen to play it fullscreen like an app (it's a PWA).

### Online co-op (each friend on their own device)
1. Tap **Online Co-op → Host a Room**.
2. Friends scan the **QR code**, open the **invite link**, or enter the **5-letter room code**.
3. Pick heroes, choose a mode, and tap **Let's Bake!**

Friends can be anywhere: different Wi-Fi networks or mobile data.
When the optional **Cloudflare relay** is set up (see below), games run through a small room server at the nearest Cloudflare data centre. That's the fastest and most reliable path.
Otherwise:
The game first tries a direct peer-to-peer WebRTC link (via the free PeerJS matchmaking server).
If the network blocks that, as some mobile carriers and strict routers do, it switches automatically to a relay.
The relay sends game messages through a public MQTT broker over secure WebSockets.
Joining shows "switching to relay…" when this happens.
To use your own [PeerServer](https://github.com/peers/peerjs-server), add `?peerhost=your.host&peerport=443&peerpath=/` to the URL.
Invite links carry these parameters along automatically.

### Local co-op (one screen)
- **Gamepads**: press **A** in the lobby to join. Up to 4 players.
- **Shared keyboard**: tap **Add 2nd keyboard player**.
  - Left player: `WASD` to move, `C` jump, `V` attack, `B` special.
  - Right player: arrow keys to move, `K` jump, `L` attack, `;` special.

## Controls
| | Touch | Keyboard (solo) | Gamepad |
|---|---|---|---|
| Move / aim | Left thumb (floating stick) | WASD / Arrows | Left stick / D-pad |
| Jump | ⤒ (green) | Space / Z / K | A |
| Attack (hold to charge) | ✦ (pink) | X / J | X / RT |
| Special | ★ (gold) | C / L / Shift | B / Y / RB |
| Drop through platform | Down + Jump | Down + Jump | Down + A |
| Pause | ❚❚ | Esc / P | Start |

## Features
- **6 heroes**, each with their own skill expression:
  - **Sir Brioche**: knight with sword combos, pogo strikes, and a shield charge.
  - **Mira Macaron**: mage with bolts, charged fireballs, and Frost Nova.
  - **Cinna Swirl**: ranger whose arrows crit on perfect-timed release and mark enemies.
  - **Dr. Fizz**: alchemist with slowing potions and a heal cloud.
  - **Pepper Jack**: gunslinger whose shotgun recoil works as a rocket-jump.
  - **Mochi**: ninja with a wall jump and a teleport dash that resets on kills.
- **4 worlds × 5 hand-built arenas**: Candy Meadows, Choco Caverns (dynamic lighting), Frosting Peaks (slippery ice), and Oven Citadel (caramel lava).
- **11 enemy types**, plus **4 multi-phase bosses** with telegraphed attack patterns: King Gelatino, Cocoa Colossus, Sorbet Wyrm, and The Burnt Baron.
- **3 game modes**: Campaign (60 stars to earn), Endless (waves, with a boss every 4th stage), and Boss Rush.
- **19 "Topping" perks**: a roguelite pick-1-of-3 between levels.
- **Co-op systems**:
  - Revive bubbles.
  - A shared team combo multiplier.
  - Hero synergies: freeze → shatter, mark, heal, and projectile blocking.
  - End-of-level awards: MVP, Guardian Angel, and more.
- **Skill mechanics**:
  - Stomping, with a higher bounce when you hold jump.
  - Enraged enemies (knock them into pits at your peril).
  - Platform wrap-around at the screen edges.
  - Springs, spikes, and lava.
  - Coyote time, jump buffering, variable jump height, and fast-fall.
- **Juice**: hit-stop, trauma-based screen shake, squash and stretch, particles, damage numbers, and a Sugar Rush power-up.
- **Progression**: star ratings per level, 13 hats to buy with 💎 sprinkles, 24 trophies, and lifetime stats.
- **Audio**: procedural SFX, plus a generative music sequencer with a unique track per world and for bosses.
- **Settings**:
  - Volume (master, music, SFX).
  - Difficulty: Casual, Normal, or Hard.
  - Aim assist and damage numbers.
  - Touch button size and opacity, plus a left-handed layout.
  - Up-to-jump, vibration, and screen shake.
  - Camera zoom, graphics quality, reduce flashes, and an FPS/ping display.
  - Party mode (unlock everything).

See **[DESIGN.md](DESIGN.md)** for the game-design research (co-op game theory, skill, risk and reward, flow) and the netcode architecture.

## Run locally
There is no build step. Serve the folder with any static server:
```bash
npx http-server -p 8080 .
# then open http://localhost:8080
```
For testing online play on one machine, open two tabs with `?net=bc`. This uses a BroadcastChannel transport instead of WebRTC.
Add `&lag=150` to simulate 150 ms of network latency with jitter.
`?relay=wss://your-broker/mqtt` overrides the relay brokers (comma-separated list).

## Cloudflare relay (recommended for online play)
`worker/` is a tiny Cloudflare Worker + Durable Object that relays a room's messages. The deploy workflow publishes it and points the game at it automatically.
1. In Cloudflare, open **Workers & Pages** once, so your account has a `workers.dev` subdomain.
2. Create an API token: **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"** template.
3. Copy your **Account ID** from the Workers & Pages overview page.
4. In GitHub, go to **Settings → Secrets and variables → Actions** and add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
5. Re-run the **Deploy to GitHub Pages** workflow.

The online lobby shows each player's ping and connection type ("fast relay", "direct" or "backup relay").
The free Workers plan covers casual play.
For local testing, run `npx wrangler dev` in `worker/` and open the game with `?cf=ws://127.0.0.1:8787`.

## Deploy
The included GitHub Action (`.github/workflows/pages.yml`) publishes the game to GitHub Pages on every push to `main`.
To use it, enable **Settings → Pages → Source: GitHub Actions** in the repo.
Any static host works too, such as Netlify, Vercel, or Cloudflare Pages.

## Project layout
```
index.html, css/style.css, manifest.webmanifest, sw.js   app shell + PWA
src/main.js          app/screens, run flow, lobby, online orchestration, main loop
src/game/world.js    simulation: physics, director, combat, objectives, net sync
src/game/player.js   hero movement feel, damage, revive, net state
src/game/render.js   backgrounds, tile art, entities, lighting, HUD
src/game/fx.js       particles, rings, flashes, floating text, screen shake
src/data/*.js        heroes (+kits & drawing), enemies & bosses, levels, perks & trophies
src/audio.js         synthesized SFX + generative music
src/input.js         keyboard schemes, gamepads, multi-touch controls
src/net.js           PeerJS / BroadcastChannel sessions
vendor/              PeerJS 1.5.4, MQTT.js 5.10.1, qrcode-generator 1.4.4 (MIT)
```
