# TikTok Live World Cup Game

An interactive **TikTok Live** game, World Cup themed, that reacts in real time to your
viewers' **comments, gifts, and likes**. Two national teams (voted in by chat) play on a
2D bowl-shaped pitch with a triangular hill in the middle. Always-spinning balls bounce
around, viewers join a side and their avatars chase the ball, and gifts trigger escalating
effects. You run it locally in a browser and capture it with OBS to stream back to TikTok.

## How it plays

- **Vote phase (60s):** chat types `!vote <CODE>` (e.g. `!vote BRA`). The two most-voted
  nations play the next match. Vote tally resets each round.
- **Match:** first team to **5 goals** wins (configurable). Two balls are always in play,
  spinning in opposite directions; they drop from the hopper onto the hill and roll down
  the bowl. Goalies bounce in front of each net.
- **Join a team:** chat types `!join 1` (left) or `!join 2` (right). Your TikTok avatar
  spawns on that side and runs at the nearest ball, kicking it toward the opponent's goal.
- **Likes:** every **200 likes** drops in another pair of opposite-spinning balls.
- **Gifts** (tiers configurable in `server/gifts.json`):
  | Tier | Coins | Effect |
  |------|-------|--------|
  | T1 | 1–9 (Rose) | Cannon shot from your team's side |
  | T2 | 10–49 | 5-ball drop on the opponent's half |
  | T3 | 50–99 | Goalie buff for your team (bigger, 30s) |
  | T4 | 100–499 | Super-ball that homes toward the opponent goal |
  | T5 | 500+ | Chaos: 10-ball drop + screen shake |
- Each ball has a **4-minute health timer**; scoring does **not** reset it. When it expires
  the ball despawns (there are always at least two).
- A **Top Supporters** leaderboard tracks coins gifted during the match.

## Run it locally

```bash
npm install
npm run dev
```

Open **http://localhost:3000** for the game and **http://localhost:3000/dev** for the dev
panel (inject fake chat/gift/like events to test without going live).

### Connect to your TikTok LIVE

1. Copy `.env.example` to `.env` and set your handle (without the `@`):
   ```
   TIKTOK_USERNAME=yourhandle
   ```
2. **Start your TikTok LIVE first**, then run `npm run dev`. The badge in the
   bottom-left of the game shows the connection state: `DEV MODE`, `… connecting`,
   or `🔴 LIVE @yourhandle`. It auto-reconnects if the stream drops.

> The game only **reads** public live events (chat, gifts, likes) via
> [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector). You must
> be live for events to arrive.

### Capture in OBS

1. Add a **Window Capture** (or **Browser Source** pointing at `http://localhost:3000`).
2. Size the canvas to 1920×1080; it scales to fit.
3. Stream to TikTok as usual. For sound, either let OBS capture the browser audio or mute
   in-game with **M** and use your own music.

## Configuration

- `server/config.json` — `goalsToWin`, `voteSeconds`, `winnerDisplaySeconds`,
  `ballsPerLikeMilestone`, `ballHealthMs`, `maxBalls`, `clearPlayersBetweenMatches`.
- `server/gifts.json` — map gift names / coin ranges to effect tiers.
- `public/game/data/teams.json` — the 32 nations (code, colors).
- Env overrides for quick testing: `VOTE_SECONDS`, `WINNER_DISPLAY_SECONDS`, `GOALS_TO_WIN`.

## Controls

- **M** — toggle game sound on/off.

## Tech

Node + Express + Socket.io on the backend; Phaser 3 + Matter.js (2D physics) in the
browser. Sound is synthesized at runtime with the Web Audio API (no asset files).
