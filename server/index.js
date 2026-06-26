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

const server = http.createServer(app);
const io = new IOServer(server);

const votes = new VoteState();
const players = new PlayerRegistry();
const match = new MatchState(config);

function classifyGift(name, coins) {
  const overrideTier = gifts.namedOverrides[name];
  if (overrideTier) {
    const def = gifts.tiers.find(t => t.tier === overrideTier);
    if (def) return def;
  }
  return gifts.tiers.find(t => coins >= t.coinsMin && coins <= t.coinsMax) || gifts.tiers[0];
}

function broadcast(event, payload) {
  io.emit(event, payload);
}

function startVotePhase() {
  console.log(`[vote] start (${config.voteSeconds}s window)`);
  votes.reset();
  if (config.clearPlayersBetweenMatches) players.clear();
  match.enterVote();
  match.resetLikes();
  broadcast('vote:start', { seconds: config.voteSeconds, teams });
  broadcast('players:count', players.counts());

  setTimeout(() => {
    if (match.phase !== Phase.VOTE) return;
    const [aCode, bCode] = votes.topTwo();
    const teamA = teams.find(t => t.code === aCode) || teams[0];
    const teamB = teams.find(t => t.code === bCode && t.code !== teamA.code)
      || teams.find(t => t.code !== teamA.code);
    match.startMatch(teamA, teamB);
  }, config.voteSeconds * 1000);
}

match.on('match:start', (payload) => {
  console.log(`[match] start ${payload.teamA.code} vs ${payload.teamB.code} (first to ${payload.goalsToWin})`);
  players.clear();
  broadcast('players:count', players.counts());
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
  const def = classifyGift(gift.name, gift.coins);
  const playerRecord = players.players.get(user.uniqueId);
  const team = playerRecord?.team || null;
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
bridge.connect();

// Dev injection endpoints — only enabled for local dev, accessible via /dev page.
app.post('/dev/chat', (req, res) => {
  const { uniqueId = 'devuser', nickname, text } = req.body;
  handleChat({ uniqueId, nickname: nickname || uniqueId, profilePictureUrl: null }, text);
  res.json({ ok: true });
});
app.post('/dev/gift', (req, res) => {
  const { uniqueId = 'devuser', nickname, name = 'Rose', coins = 1 } = req.body;
  handleGift(
    { uniqueId, nickname: nickname || uniqueId, profilePictureUrl: null },
    { giftId: 0, name, coins, repeatCount: 1 },
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

io.on('connection', (socket) => {
  socket.emit('state', { ...match.snapshot(), players: players.all() });
  socket.on('goal:detected', ({ team }) => {
    if (team === 1 || team === 2) match.scoreGoal(team);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT} (dev panel: /dev)`);
  startVotePhase();
});
