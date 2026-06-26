import { bus, socket } from '../socket.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import { buildField, PITCH, GOAL_Y } from '../world/Field.js';
import { buildHill } from '../world/Hill.js';
import { createBackground, createBackgroundFX } from '../world/Background.js';
import { buildMatchFlags } from '../world/Flags.js';
import { Ball, createBallTextures } from '../entities/Ball.js';
import { BallSpawner } from '../entities/BallSpawner.js';
import { Player } from '../entities/Player.js';
import { Goalie } from '../entities/Goalie.js';
import { Cannon } from '../entities/Cannon.js';
import { sfx } from '../audio/Sound.js';

export class MatchScene extends Phaser.Scene {
  constructor() { super('MatchScene'); }

  init(data) {
    this.teamA = data.teamA;
    this.teamB = data.teamB;
    this.goalsToWin = data.goalsToWin || 5;
    this.score = { 1: 0, 2: 0 };
    this.playerCounts = { left: 0, right: 0 };
    this.likeProgress = 0;
    this.likeMilestone = 200;
    this.players = new Map();
  }

  create() {
    createBallTextures(this);

    createBackground(this, this.teamA.primary, this.teamB.primary);
    this.fx = createBackgroundFX(this, this.teamA.primary, this.teamB.primary);

    const field = buildField(this);
    const hill = buildHill(this);
    this.field = field;
    this.hill = hill;
    buildMatchFlags(this, this.teamA, this.teamB);

    this.spawner = new BallSpawner(this, { spawnPoint: hill.spawnPoint, maxBalls: 30 });
    this.spawner.spawnPair();
    this.spawner.spawnPair();

    this.goalies = {
      1: new Goalie(this, 1, this.teamA.primary),
      2: new Goalie(this, 2, this.teamB.primary),
    };
    this.cannons = {
      1: new Cannon(this, 1, hill.leftCannon, this.teamA.primary),
      2: new Cannon(this, 2, hill.rightCannon, this.teamB.primary),
    };

    this.#buildHud();
    this.#buildLeaderboard();
    this.#buildStatusBadge();

    // Audio: unlock on first interaction, then kick off ambience + whistle.
    sfx.unlock();
    sfx.startMusic();
    sfx.whistle();
    this.input.once('pointerdown', () => sfx.unlock());
    this.input.keyboard.once('keydown', () => sfx.unlock());
    this.input.keyboard.on('keydown-M', () => {
      const muted = sfx.toggleMute();
      this.muteBadge.setText(muted ? '🔇 Muted (M)' : '🔊 Sound (M)');
    });

    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        this.#handleCollision(pair.bodyA, pair.bodyB);
        this.#handleCollision(pair.bodyB, pair.bodyA);
      }
    });

    // A player's life ran out: drop it locally and tell the server to update counts.
    this.events.on('player:expire', (uniqueId) => {
      this.players.delete(uniqueId);
      socket.emit('player:expire', { uniqueId });
    });

    // Subscribe to live events.
    this.handlerJoin = (record) => this.#addPlayer(record);
    this.handlerCounts = (counts) => this.#setCounts(counts);
    this.handlerGift = (payload) => this.#handleGift(payload);
    this.handlerLike = (payload) => this.#updateLikeBar(payload);
    this.handlerMilestone = ({ milestones }) => {
      for (let i = 0; i < milestones; i++) this.spawner.spawnPair();
      sfx.pop();
      this.#screenFlash(0xff3b6a, 0.18, 180);
    };
    this.handlerGoal = ({ team, score }) => {
      this.score = score;
      this.#refreshScores();
    };
    this.handlerLeaderboard = (rows) => this.#updateLeaderboard(rows);
    this.handlerStatus = (status) => this.#updateStatus(status);
    bus.on('player:join', this.handlerJoin);
    bus.on('players:count', this.handlerCounts);
    bus.on('gift', this.handlerGift);
    bus.on('like', this.handlerLike);
    bus.on('likes:milestone', this.handlerMilestone);
    bus.on('match:goal', this.handlerGoal);
    bus.on('leaderboard', this.handlerLeaderboard);
    bus.on('tiktok:status', this.handlerStatus);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('player:join', this.handlerJoin);
      bus.off('players:count', this.handlerCounts);
      bus.off('gift', this.handlerGift);
      bus.off('like', this.handlerLike);
      bus.off('likes:milestone', this.handlerMilestone);
      bus.off('match:goal', this.handlerGoal);
      bus.off('leaderboard', this.handlerLeaderboard);
      bus.off('tiktok:status', this.handlerStatus);
    });
  }

  update(time, delta) {
    this.spawner.update(time, delta);
    const balls = [...this.spawner.balls];
    for (const player of this.players.values()) player.update(time, delta, balls);
    for (const g of Object.values(this.goalies)) g.update(time, delta, balls);
  }

  #buildHud() {
    const barH = 130;
    this.add.rectangle(GAME_WIDTH / 2, barH / 2, GAME_WIDTH, barH, 0x000000, 0.55);

    const drawSide = (team, x, color, code, name) => {
      const c = Phaser.Display.Color.HexStringToColor(color).color;
      this.add.rectangle(x, 50, 70, 50, c).setStrokeStyle(3, 0xffffff);
      this.add.text(x, 50, code, {
        fontSize: '28px', fontFamily: 'Impact', color: '#ffffff', stroke:'#000', strokeThickness: 3,
      }).setOrigin(0.5);
      const playersText = this.add.text(x, 95, 'Players: 0', {
        fontSize: '20px', color: '#ffffff',
      }).setOrigin(0.5);
      return { playersText };
    };

    this.leftHud = drawSide(1, 240, this.teamA.primary, this.teamA.code, this.teamA.name);
    this.rightHud = drawSide(2, GAME_WIDTH - 240, this.teamB.primary, this.teamB.code, this.teamB.name);

    this.scoreText = this.add.text(GAME_WIDTH / 2, 50, `0 / ${this.goalsToWin}   :   0 / ${this.goalsToWin}`, {
      fontSize: '54px', fontFamily: 'Impact', color: '#ffce00', stroke:'#000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.likeLabel = this.add.text(GAME_WIDTH / 2, 95, `Likes 0 / ${this.likeMilestone}`, {
      fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.rectangle(GAME_WIDTH / 2, 116, 400, 12, 0x000000, 0.6);
    this.likeBar = this.add.rectangle(GAME_WIDTH / 2 - 200, 116, 0, 12, 0xff3b6a).setOrigin(0, 0.5);
  }

  #buildLeaderboard() {
    const x = 24;
    const y = 150;
    this.add.rectangle(x, y, 300, 200, 0x000000, 0.45).setOrigin(0, 0);
    this.add.text(x + 12, y + 8, '🏆 TOP SUPPORTERS', {
      fontSize: '20px', fontFamily: 'Impact', color: '#ffce00',
    }).setOrigin(0, 0);
    this.lbRows = [];
    for (let i = 0; i < 5; i++) {
      const row = this.add.text(x + 12, y + 44 + i * 30, '', {
        fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0);
      this.lbRows.push(row);
    }
  }

  #updateLeaderboard(rows) {
    if (!this.lbRows) return;
    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
    for (let i = 0; i < this.lbRows.length; i++) {
      const r = rows[i];
      this.lbRows[i].setText(r ? `${medals[i]} ${r.nickname} — ${r.coins}🪙` : '');
    }
  }

  #buildStatusBadge() {
    this.statusBadge = this.add.text(24, GAME_HEIGHT - 40, 'DEV MODE', {
      fontSize: '18px', fontFamily: 'Arial', color: '#bbbbbb', backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    }).setOrigin(0, 0.5);
    this.muteBadge = this.add.text(GAME_WIDTH - 24, GAME_HEIGHT - 40, '🔊 Sound (M)', {
      fontSize: '18px', fontFamily: 'Arial', color: '#bbbbbb', backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    }).setOrigin(1, 0.5);
  }

  #updateStatus(status) {
    if (!this.statusBadge) return;
    if (status.connected) {
      this.statusBadge.setText(`🔴 LIVE  @${status.username}`).setColor('#ff4d4d');
    } else if (status.mode === 'live') {
      this.statusBadge.setText(`… connecting @${status.username}`).setColor('#ffcc44');
    } else {
      this.statusBadge.setText('DEV MODE').setColor('#bbbbbb');
    }
  }

  #screenFlash(color = 0xffffff, alpha = 0.4, duration = 220) {
    const f = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, color, alpha).setDepth(60);
    this.tweens.add({ targets: f, alpha: 0, duration, onComplete: () => f.destroy() });
  }

  // Expanding ring — reads as an impact/shockwave.
  #shockwave(x, y, color = 0xffffff, maxR = 220) {
    const ring = this.add.circle(x, y, 10).setStrokeStyle(8, color, 0.9).setDepth(58);
    this.tweens.add({
      targets: ring, radius: maxR, alpha: 0, duration: 500, ease: 'Cubic.out',
      onUpdate: () => ring.setStrokeStyle(8, color, ring.alpha),
      onComplete: () => ring.destroy(),
    });
  }

  // Outward spark burst using the shared fx-dot texture.
  #sparkBurst(x, y, tints = [0xffffff], count = 24) {
    if (!this.textures.exists('fx-dot')) return;
    const p = this.add.particles(x, y, 'fx-dot', {
      speed: { min: 200, max: 600 }, angle: { min: 0, max: 360 },
      lifespan: 600, scale: { start: 2.5, end: 0 }, alpha: { start: 1, end: 0 },
      tint: tints, gravityY: 300, emitting: false,
    });
    p.setDepth(62);
    p.explode(count, x, y);
    this.time.delayedCall(900, () => p.destroy());
  }

  // Coins raining from the top — for the big-money tiers.
  #coinRain(count = 30) {
    if (!this.textures.exists('confetti')) return;
    const p = this.add.particles(0, 0, 'confetti', {
      x: { min: 0, max: GAME_WIDTH }, y: -20,
      speedY: { min: 300, max: 600 }, speedX: { min: -60, max: 60 },
      lifespan: 2200, scale: { min: 0.7, max: 1.3 }, rotate: { min: 0, max: 360 },
      tint: [0xffce00, 0xffd700, 0xfff2a0], gravityY: 400, emitting: false,
    });
    p.setDepth(63);
    p.explode(count);
    this.time.delayedCall(2600, () => p.destroy());
  }

  #refreshScores() {
    this.scoreText.setText(`${this.score[1] || 0} / ${this.goalsToWin}   :   ${this.score[2] || 0} / ${this.goalsToWin}`);
  }

  #setCounts(counts) {
    this.playerCounts = counts;
    this.leftHud.playersText.setText(`Players: ${counts.left}`);
    this.rightHud.playersText.setText(`Players: ${counts.right}`);
  }

  #addPlayer(record) {
    if (this.players.has(record.uniqueId)) {
      this.players.get(record.uniqueId).destroy();
      this.players.delete(record.uniqueId);
    }
    const teamColor = record.team === 1 ? this.teamA.primary : this.teamB.primary;
    const p = new Player(this, record, teamColor);
    this.players.set(record.uniqueId, p);
  }

  #updateLikeBar({ progress, milestone }) {
    this.likeProgress = progress;
    this.likeMilestone = milestone;
    this.likeLabel.setText(`Likes ${progress} / ${milestone}`);
    this.likeBar.width = 400 * (progress / milestone);
  }

  #handleGift({ user, gift, tier, effect, def, team }) {
    // If sender has no team, pick the team with fewer players as a "challenger" target.
    const senderTeam = team || (this.playerCounts.left <= this.playerCounts.right ? 1 : 2);
    const opponent = senderTeam === 1 ? 2 : 1;
    const name = user.nickname || user.uniqueId;
    sfx.giftFanfare(tier);

    // Donating extends the sender's own avatar life (if they've joined).
    const me = this.players.get(user.uniqueId);
    if (me) me.extendLife();
    const coins = (gift?.coins || 0) * (gift?.repeatCount || 1);
    switch (effect) {
      case 'cannonShot': {
        const cannon = this.cannons[senderTeam];
        cannon.fire(this.spawner);
        sfx.cannon();
        this.cameras.main.shake(150, 0.004);
        this.#shockwave(cannon.pos.x, cannon.pos.y - 20, 0xffce00, 140);
        this.#sparkBurst(cannon.pos.x, cannon.pos.y - 20, [0xffce00, 0xffffff], 14);
        this.#announceGift(name, def.label, '#ffce00', tier, coins);
        break;
      }
      case 'multiBallDrop': {
        this.spawner.spawnDrop(def.count || 5, opponent === 1 ? 'left' : 'right');
        const dx = opponent === 1 ? GAME_WIDTH * 0.25 : GAME_WIDTH * 0.75;
        this.#screenFlash(0xff8800, 0.3);
        this.cameras.main.shake(250, 0.006);
        this.#shockwave(dx, 240, 0xff8800, 260);
        this.#sparkBurst(dx, 240, [0xff8800, 0xffff66, 0xffffff], 30);
        this.#announceGift(name, `${def.label} · ${def.count || 5} BALLS`, '#ff8800', tier, coins);
        break;
      }
      case 'goalieBuff': {
        this.goalies[senderTeam].buff(def.durationMs || 30000, def.scale || 1.5);
        const gk = this.goalies[senderTeam];
        this.#screenFlash(0x00d4ff, 0.25);
        this.#shockwave(gk.x, gk.baseY, 0x00d4ff, 200);
        this.#sparkBurst(gk.x, gk.baseY, [0x00d4ff, 0xffffff], 26);
        this.#announceGift(name, `🧤 WALL UP · ${senderTeam === 1 ? this.teamA.code : this.teamB.code}`, '#00d4ff', tier, coins);
        break;
      }
      case 'superBall': {
        const goalX = opponent === 1 ? PITCH.left : PITCH.right;
        this.spawner.spawnSuperBall(goalX, GOAL_Y);
        sfx.whoosh();
        this.#screenFlash(0xff0066, 0.4);
        this.cameras.main.shake(300, 0.008);
        this.#shockwave(this.hill.spawnPoint.x, this.hill.spawnPoint.y, 0xff0066, 260);
        this.#sparkBurst(this.hill.spawnPoint.x, this.hill.spawnPoint.y, [0xff0066, 0xff8800, 0xffffff], 34);
        this.#coinRain(18);
        this.#announceGift(name, '🔥 SUPER BALL!', '#ff0066', tier, coins);
        break;
      }
      case 'chaosDrop': {
        this.spawner.spawnDrop(def.count || 10, opponent === 1 ? 'left' : 'right');
        sfx.cannon(); sfx.goal();
        // Big, repeated flashes + heavy shake + coin rain = clearly the top tier.
        this.cameras.main.shake(900, 0.02);
        this.#screenFlash(0xffffff, 0.6, 120);
        this.time.delayedCall(140, () => this.#screenFlash(0xff0066, 0.5, 300));
        for (let i = 0; i < 4; i++) {
          this.time.delayedCall(i * 120, () =>
            this.#shockwave(GAME_WIDTH * (0.2 + Math.random() * 0.6), 200 + Math.random() * 300, 0xff0066, 320));
        }
        this.#sparkBurst(GAME_WIDTH / 2, GAME_HEIGHT / 2, [0xff0066, 0xffce00, 0xffffff], 60);
        this.#coinRain(40);
        this.fx?.confettiBurst(GAME_WIDTH / 2, 300, 120);
        this.#announceGift(name, '💥 CHAOS DROP!', '#ff0066', tier, coins);
        break;
      }
    }
  }

  #announceGift(name, label, color = '#ffffff', tier = 1, coins = 0) {
    // Stack concurrent banners so simultaneous gifts don't overlap.
    this._activeBanners = (this._activeBanners || 0) + 1;
    const slot = (this._activeBanners - 1) % 4;
    const y = GAME_HEIGHT / 2 - 120 - slot * 96;
    const barW = 520 + tier * 90;
    const barH = 70 + tier * 12;
    const labelSize = 34 + tier * 6;
    const bar = this.add.rectangle(GAME_WIDTH / 2, y, 0, barH, Phaser.Display.Color.HexStringToColor(color).color, 0.88)
      .setDepth(70).setStrokeStyle(4, 0xffffff);
    const nameT = this.add.text(GAME_WIDTH / 2, y - barH / 2 + 22, `🎁 ${name}${coins ? `  ·  ${coins}🪙` : ''}`, {
      fontSize: '28px', fontFamily: 'Arial Black', color: '#000000',
    }).setOrigin(0.5).setDepth(71);
    const labelT = this.add.text(GAME_WIDTH / 2, y + 14, `${label}`, {
      fontSize: `${labelSize}px`, fontFamily: 'Impact', color: '#ffffff', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(71);
    const targets = [bar, nameT, labelT];
    bar.width = 0;
    this.tweens.add({ targets: bar, width: barW, duration: 220, ease: 'Back.out' });
    // Higher tiers linger and pop a bit.
    this.tweens.add({ targets: [nameT, labelT], scale: { from: 0.8, to: 1 }, duration: 220, ease: 'Back.out' });
    this.tweens.add({
      targets, alpha: { from: 1, to: 0 }, delay: 1200 + tier * 250, duration: 350,
      onComplete: () => {
        targets.forEach((t) => t.destroy());
        this._activeBanners = Math.max(0, (this._activeBanners || 1) - 1);
      },
    });
  }

  #flashAnnouncement(text, color = '#ffffff') {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100, text, {
      fontSize: '52px', fontFamily: 'Impact', color, stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: t, alpha: 1, y: GAME_HEIGHT / 2 - 150, duration: 250,
      yoyo: true, hold: 800,
      onComplete: () => t.destroy(),
    });
  }

  #handleCollision(a, b) {
    if (a.label !== 'goal-left' && a.label !== 'goal-right') return;
    if (b.label !== 'ball') return;
    const ball = b.gameObject?.ballRef;
    if (!ball || ball.destroyed) return;
    // Left goal = team 2 scored against team 1, and vice versa.
    const scoringTeam = a.label === 'goal-left' ? 2 : 1;
    socket.emit('goal:detected', { team: scoringTeam });
    this.spawner.respawnAtHill(ball);
    this.#flashAnnouncement('GOAL!', scoringTeam === 1 ? '#ffce00' : '#00d4ff');
    sfx.goal();
    this.#screenFlash(0xffffff, 0.5, 300);
    const goalX = a.label === 'goal-left' ? PITCH.left + 40 : PITCH.right - 40;
    this.fx?.confettiBurst(goalX, GOAL_Y, 80);
  }
}
