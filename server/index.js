import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

import { TikTokBridge } from './tiktokBridge.js';
import { VoteState } from './voteState.js';
import { PlayerRegistry } from './playerRegistry.js';
import { MatchState, Phase } from './matchState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const config = JSON.parse(readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
if (process.env.VOTE_SECONDS) config.voteSeconds = Number(process.env.VOTE_SECONDS);
if (process.env.WINNER_DISPLAY_SECONDS) config.winnerDisplaySeconds = Number(process.env.WINNER_DISPLAY_SECONDS);
if (process.env.GOALS_TO_WIN) config.goalsToWin = Number(process.env.GOALS_TO_WIN);
const gifts = JSON.parse(readFileSync(path.join(__dirname, 'gifts.json'), 'utf8'));
const teams = JSON.parse(readFileSync(path.join(ROOT, 'public/game/data/teams.json'), 'utf8'));

const validTeamCodes = new Set(teams.map(t => t.code));

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor/phaser.min.js', express.static(path.join(ROOT, 'node_modules/phaser/dist/phaser.min.js')));
app.get('/dev', (_req, res) => res.sendFile(path.join(ROOT, 'public/dev.html')));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

const server = http.createServer(app);
const io = new IOServer(server);

const votes = new VoteState();
const players = new PlayerRegistry(config.maxPlayersPerTeam);
const match = new MatchState(config);

// Per-match supporter leaderboard (coins gifted), keyed by uniqueId.
let supporters = new Map();
function leaderboardTop(n = 5) {
  return [...supporters.values()]
    .sort((a, b) => b.coins - a.coins)
    .slice(0, n)
    .map((s) => ({ nickname: s.nickname, coins: s.coins, team: s.team }));
}
function recordSupporter(user, coins, team) {
  const prev = supporters.get(user.uniqueId) || { nickname: user.nickname, coins: 0, team: null };
  prev.nickname = user.nickname || prev.nickname;
  prev.coins += coins;
  if (team) prev.team = team;
  supporters.set(user.uniqueId, prev);
}

// Classify by TOTAL coins (unit × streak count) so long streaks of cheap gifts
// earn the big effects. A named override can only upgrade the tier, never
// downgrade a large streak back to its per-unit tier.
function classifyGift(name, totalCoins) {
  const topTier = gifts.tiers[gifts.tiers.length - 1];
  const byCoins = gifts.tiers.find(t => totalCoins >= t.coinsMin && totalCoins <= t.coinsMax)
    || (totalCoins > topTier.coinsMax ? topTier : gifts.tiers[0]);
  const overrideTier = gifts.namedOverrides[name];
  if (overrideTier) {
    const def = gifts.tiers.find(t => t.tier === overrideTier);
    if (def && def.tier > byCoins.tier) return def;
  }
  return byCoins;
}

function broadcast(event, payload) {
  io.emit(event, payload);
}

let currentVoteEndsAt = 0;
let voteTimer = null;
function startVotePhase() {
  console.log(`[vote] start (${config.voteSeconds}s window)`);
  if (voteTimer) clearTimeout(voteTimer); // avoid orphan timers on re-entry (e.g. /dev/reset)
  votes.reset();
  if (config.clearPlayersBetweenMatches) players.clear();
  match.enterVote();
  match.resetLikes();
  currentVoteEndsAt = Date.now() + config.voteSeconds * 1000;
  broadcast('vote:start', { seconds: config.voteSeconds, endsAt: currentVoteEndsAt, teams });
  broadcast('players:count', players.counts());

  voteTimer = setTimeout(() => {
    voteTimer = null;
    if (match.phase !== Phase.VOTE) return;
    const [aCode, bCode] = votes.topTwo();
    // Fill any missing slot with a random nation so quiet rounds still vary.
    const randomTeam = (exclude) => {
      const pool = teams.filter(t => t !== exclude);
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const teamA = teams.find(t => t.code === aCode) || randomTeam(null);
    const teamB = teams.find(t => t.code === bCode && t.code !== teamA.code) || randomTeam(teamA);
    match.startMatch(teamA, teamB);
  }, config.voteSeconds * 1000);
}

match.on('match:start', (payload) => {
  console.log(`[match] start ${payload.teamA.code} vs ${payload.teamB.code} (first to ${payload.goalsToWin})`);
  players.clear();
  supporters = new Map();
  broadcast('players:count', players.counts());
  broadcast('leaderboard', leaderboardTop());
  broadcast('match:start', payload);
});
match.on('match:goal', (payload) => {
  console.log(`[match] goal team=${payload.team} score=${payload.score[1]}-${payload.score[2]}`);
  broadcast('match:goal', payload);
});
match.on('match:end', (payload) => {
  console.log(`[match] end winner=${payload.winner.code} final=${payload.finalScore[1]}-${payload.finalScore[2]}`);
  broadcast('match:end', payload);
  setTimeout(startVotePhase, config.winnerDisplaySeconds * 1000);
});
match.on('likes:milestone', (payload) => {
  console.log(`[match] like milestone x${payload.milestones}`);
  broadcast('likes:milestone', payload);
});

function handleChat(user, text) {
  broadcast('chat', { user, text });
  const trimmed = (text || '').trim();
  if (match.phase === Phase.VOTE) {
    const m = trimmed.match(/^!vote\s+([A-Za-z]{2,3})$/i);
    if (m) {
      const code = m[1].toUpperCase();
      if (validTeamCodes.has(code)) {
        votes.castVote(user.uniqueId, code);
        broadcast('vote:tally', votes.tallyObject());
      }
    }
    return;
  }
  if (match.phase === Phase.MATCH) {
    const m = trimmed.match(/^!join\s+([12])$/i);
    if (m) {
      const team = parseInt(m[1], 10);
      const record = players.join(user.uniqueId, user.nickname, user.profilePictureUrl, team);
      if (record) {
        broadcast('player:join', record);
        broadcast('players:count', players.counts());
      }
    }
  }
}

function handleGift(user, gift) {
  const totalCoins = (gift.coins || 0) * (gift.repeatCount || 1);
  const def = classifyGift(gift.name, totalCoins);
  const playerRecord = players.players.get(user.uniqueId);
  const team = playerRecord?.team || null;
  if (totalCoins > 0) {
    recordSupporter(user, totalCoins, team);
    broadcast('leaderboard', leaderboardTop());
  }
  broadcast('gift', { user, gift, tier: def.tier, effect: def.effect, def, team });
}

function handleLike(user, count) {
  match.addLikes(count);
  broadcast('like', {
    user,
    count,
    runningTotal: match.likesTotal,
    progress: match.likesSinceLastSpawn,
    milestone: config.ballsPerLikeMilestone,
  });
}

const bridge = new TikTokBridge(process.env.TIKTOK_USERNAME);
bridge.on('chat', handleChat);
bridge.on('gift', handleGift);
bridge.on('like', handleLike);
bridge.on('status', (status) => {
  console.log(`[tiktok] status: ${status.connected ? 'connected' : status.mode}`);
  broadcast('tiktok:status', status);
});
bridge.connect();

// Dev injection endpoints — only enabled for local dev, accessible via /dev page.
app.post('/dev/chat', (req, res) => {
  const { uniqueId = 'devuser', nickname, text } = req.body;
  handleChat({ uniqueId, nickname: nickname || uniqueId, profilePictureUrl: null }, text);
  res.json({ ok: true });
});
app.post('/dev/gift', (req, res) => {
  const { uniqueId = 'devuser', nickname, name = 'Rose', coins = 1, repeatCount = 1 } = req.body;
  handleGift(
    { uniqueId, nickname: nickname || uniqueId, profilePictureUrl: null },
    { giftId: 0, name, coins, repeatCount },
  );
  res.json({ ok: true });
});
app.post('/dev/like', (req, res) => {
  const { uniqueId = 'devuser', nickname, count = 1 } = req.body;
  handleLike({ uniqueId, nickname: nickname || uniqueId, profilePictureUrl: null }, count);
  res.json({ ok: true });
});
app.post('/dev/score', (req, res) => {
  const { team = 1 } = req.body;
  match.scoreGoal(team);
  res.json({ ok: true });
});
app.post('/dev/reset', (_req, res) => {
  startVotePhase();
  res.json({ ok: true });
});

// Goals are detected client-side; trust only ONE client so multiple connected
// game windows/tabs can't each report the same goal and double-count it. The
// first socket to report a goal becomes authoritative; if it disconnects,
// another can take over.
let authoritativeSocket = null;

function stateSnapshot() {
  return { ...match.snapshot(), voteEndsAt: currentVoteEndsAt, players: players.all() };
}

io.on('connection', (socket) => {
  socket.emit('state', stateSnapshot());
  socket.emit('leaderboard', leaderboardTop());
  socket.emit('tiktok:status', bridge.status());
  // Clients re-entering from the menu ask for a fresh snapshot (the one from
  // connect time goes stale as goals/phases happen while they sit in the menu).
  socket.on('state:request', () => socket.emit('state', stateSnapshot()));
  socket.on('goal:detected', ({ team }) => {
    if (authoritativeSocket && authoritativeSocket !== socket && authoritativeSocket.connected) return;
    authoritativeSocket = socket;
    if (team === 1 || team === 2) match.scoreGoal(team);
  });
  socket.on('player:expire', ({ uniqueId }) => {
    if (players.remove(uniqueId)) broadcast('players:count', players.counts());
  });
  // A client entering (or re-entering) a match asks for the live player roster.
  socket.on('players:request', () => {
    socket.emit('players:sync', players.all());
  });
  // Operator picks DEV (offline) or LIVE (connect to a TikTok user) from the menu.
  socket.on('admin:mode', async ({ mode, username }) => {
    console.log(`[admin] mode=${mode}${username ? ' @' + username : ''}`);
    try { await bridge.setMode(mode, username); }
    catch (e) { console.error('[admin] setMode failed:', e.message); }
  });
  socket.on('disconnect', () => {
    if (authoritativeSocket === socket) authoritativeSocket = null;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT} (dev panel: /dev)`);
  startVotePhase();
});
