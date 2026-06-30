# TikTok Live World Cup Game ⚽

An interactive **TikTok Live** game, World Cup themed, that reacts in real time to your
viewers' **comments, gifts, and likes**. Two national teams (voted in by chat) play on a
2D bowl-shaped pitch with a triangular hill in the middle. Always-spinning balls bounce
around, viewers join a side and their avatars chase the ball, and gifts trigger escalating
power-ups. You run it locally in a browser and capture it with OBS to stream back to TikTok.

---

## 🚀 Quick start

**Prerequisites:** [Node.js](https://nodejs.org) **18 or newer** (`node -v` to check) and a
modern browser (Chrome/Edge recommended). No build step.

```bash
# 1. Install dependencies (also downloads Phaser locally — no CDN needed)
npm install

# 2. Start the game server
npm run dev
```

Then open:

- **http://localhost:3000** — the game (this is what you capture in OBS)
- **http://localhost:3000/dev** — the operator/dev panel (fake chat, gifts, likes, goals)

On first launch you land on the **start menu** with two choices:

- **🔴 GO LIVE** — type your TikTok `@username` and click to connect to your live and play
  with real viewers. (You must already be live on TikTok.)
- **🧪 DEV MODE** — start offline and drive everything yourself from the **/dev** panel —
  great for testing without going live.

Press **ESC** any time during play to return to this menu (the connection stays running).

> You can also preset the username via `.env` (see below); the menu's GO LIVE button just
> sets/changes it at runtime, so you don't have to edit files to switch accounts.

> Click the game window once (or press any key) to enable sound — browsers block audio until
> you interact. Press **M** to mute.

---

## 🧪 Try it without going live

Open the dev panel at **http://localhost:3000/dev** alongside the game and:

1. Click **+5 votes BRA** and **+5 votes ARG**, then wait for the countdown — the match
   starts with the two leading teams.
2. Click **+4 joins team 1 / team 2** to spawn player avatars.
3. Fire each **gift tier (T1–T5)** and watch the cannon shot, multi-ball drop, goalie buff,
   super-ball, and chaos drop.
4. Click **+200 likes** to drop in an extra pair of balls.
5. Click **Score for Team 1** a few times to end the match → winner screen → back to voting.

---

## 📺 Go live (capture in OBS + connect to TikTok)

1. **Go live on TikTok first** — the game can only read events while you're actually live.
2. **Connect from the menu:** on the start menu, type your TikTok `@username` and click
   **🔴 GO LIVE**. You'll see **Connecting… → ✓ Connected** (or an error so you can fix the
   handle). The bottom-left badge then shows `🔴 LIVE @you` and auto-reconnects if the stream
   drops. *(Optional: preset it in `.env` as `TIKTOK_USERNAME=yourhandle` — `cp .env.example
   .env` — to skip typing it each time.)*
3. **Capture it in OBS:** add a **Window Capture** of the browser (or a **Browser Source**
   pointing at `http://localhost:3000`). The canvas is 1920×1080 and scales to fit. For
   sound, let OBS capture the browser audio, or mute in-game with **M** and use your own.
4. Real chat / gifts / likes now drive the game.

> The game only **reads** public live events via
> [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector); you must
> actually be live for events to arrive. It never posts or logs in as you.

---

## 🎮 How it plays

- **Vote (60s):** chat types `!vote <CODE>` (e.g. `!vote BRA`). The two most-voted nations
  play next; the leading two are highlighted live. Tally resets each round.
- **Match:** sudden death — first team to **5 goals** wins (configurable). Two balls are
  always in play, spinning opposite ways; they drop from the hopper onto the hill and roll
  down the bowl. Keepers patrol each net.
- **Join a team:** chat types `!join 1` (left) or `!join 2` (right). Your TikTok avatar
  (profile pic) spawns and chases the nearest ball, kicking it toward the opponent's goal.
  Each player has a **5-minute life**; sending a gift refills it to 10 minutes.
- **Likes:** every **200 likes** drops in another opposite-spinning pair of balls.
- **Gifts** (coin ranges + named gifts, editable in `server/gifts.json`):

  | Tier | Coins | Effect |
  |------|-------|--------|
  | T1 | 1–9 (e.g. Rose) | Cannon shot from your team's hill toward the opponent goal |
  | T2 | 10–49 | 5-ball drop on the opponent's half |
  | T3 | 50–99 | Goalie buff for your team (bigger, glowing, 30s) |
  | T4 | 100–499 | Super-ball — a flaming comet aimed at the opponent goal |
  | T5 | 500+ | Chaos: 10-ball drop + lightning + screen shake |

- Each ball has a **4-minute health timer** (scoring does **not** reset it); there are
  always at least two. A **Top Supporters** leaderboard tracks coins gifted each match.

---

## ⚙️ Configuration

- `server/config.json` — `goalsToWin`, `voteSeconds`, `winnerDisplaySeconds`,
  `ballsPerLikeMilestone`, `ballHealthMs`, `maxBalls`, `clearPlayersBetweenMatches`.
- `server/gifts.json` — map gift coin-ranges and specific gift names to effect tiers.
- `public/game/data/teams.json` — the 32 nations (code, ISO flag code, colors).
- **Quick-test env overrides:** speed up cycles with
  `VOTE_SECONDS=8 WINNER_DISPLAY_SECONDS=3 GOALS_TO_WIN=2 npm run dev`.
- `PORT` — change the server port (default `3000`).

## ⌨️ Controls

- **M** — toggle game sound on/off.
- **ESC** — return to the start menu (the TikTok connection keeps running).

## 🧰 Troubleshooting

- **"Couldn't connect" / badge stuck on `… connecting`** — make sure you're actually LIVE on
  TikTok and entered your handle without the `@`. The menu shows the result and re-enables
  **GO LIVE** so you can retry.
- **No sound** — click the game window once or press a key (browser autoplay policy); check
  it's not muted (**M**).
- **Flags show as colored blocks** — the real national flags load from a CDN
  (`flagcdn.com`); if your network blocks it, the team-colored fallback is used.
- **Port already in use** — run with a different port: `PORT=3001 npm run dev`.

## 🏗️ Tech

Node + Express + Socket.io backend; Phaser 3 + Matter.js (2D physics) in the browser.
Sound is synthesized at runtime with the Web Audio API and the stadium/balls are drawn
procedurally — **no image or audio asset files required**.
