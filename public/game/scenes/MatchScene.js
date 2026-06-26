import { bus, socket } from '../socket.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import { buildField, PITCH, GOAL_Y } from '../world/Field.js';
import { buildHill } from '../world/Hill.js';
import { createBackground, createBackgroundFX } from '../world/Background.js';
import { Ball, createBallTextures } from '../entities/Ball.js';
import { BallSpawner } from '../entities/BallSpawner.js';
import { Player } from '../entities/Player.js';
import { Goalie } from '../entities/Goalie.js';
import { Cannon } from '../entities/Cannon.js';

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

    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        this.#handleCollision(pair.bodyA, pair.bodyB);
        this.#handleCollision(pair.bodyB, pair.bodyA);
      }
    });

    // Subscribe to live events.
    this.handlerJoin = (record) => this.#addPlayer(record);
    this.handlerCounts = (counts) => this.#setCounts(counts);
    this.handlerGift = (payload) => this.#handleGift(payload);
    this.handlerLike = (payload) => this.#updateLikeBar(payload);
    this.handlerMilestone = ({ milestones }) => {
      for (let i = 0; i < milestones; i++) this.spawner.spawnPair();
    };
    this.handlerGoal = ({ team, score }) => {
      this.score = score;
      this.#refreshScores();
    };
    bus.on('player:join', this.handlerJoin);
    bus.on('players:count', this.handlerCounts);
    bus.on('gift', this.handlerGift);
    bus.on('like', this.handlerLike);
    bus.on('likes:milestone', this.handlerMilestone);
    bus.on('match:goal', this.handlerGoal);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('player:join', this.handlerJoin);
      bus.off('players:count', this.handlerCounts);
      bus.off('gift', this.handlerGift);
      bus.off('like', this.handlerLike);
      bus.off('likes:milestone', this.handlerMilestone);
      bus.off('match:goal', this.handlerGoal);
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
    switch (effect) {
      case 'cannonShot': {
        this.cannons[senderTeam].fire(this.spawner);
        this.#flashAnnouncement(`${user.nickname || user.uniqueId}: ${def.label}`, '#ffce00');
        break;
      }
      case 'multiBallDrop': {
        this.spawner.spawnDrop(def.count || 5, opponent === 1 ? 'left' : 'right');
        this.#flashAnnouncement(`${def.label}!`, '#ff8800');
        break;
      }
      case 'goalieBuff': {
        this.goalies[senderTeam].buff(def.durationMs || 30000, def.scale || 1.5);
        this.#flashAnnouncement(`Goalie buff for ${senderTeam === 1 ? this.teamA.code : this.teamB.code}!`, '#00d4ff');
        break;
      }
      case 'superBall': {
        const goalX = opponent === 1 ? PITCH.left : PITCH.right;
        const goalY = GOAL_Y;
        this.spawner.spawnSuperBall(goalX, goalY);
        this.#flashAnnouncement(`SUPER BALL incoming!`, '#ff0066');
        break;
      }
      case 'chaosDrop': {
        this.spawner.spawnDrop(def.count || 10, opponent === 1 ? 'left' : 'right');
        if (def.shake) this.cameras.main.shake(600, 0.01);
        this.#flashAnnouncement(`CHAOS DROP!`, '#ff0066');
        break;
      }
    }
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
    const goalX = a.label === 'goal-left' ? PITCH.left + 40 : PITCH.right - 40;
    this.fx?.confettiBurst(goalX, GOAL_Y, 80);
  }
}
