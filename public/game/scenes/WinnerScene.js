import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import { sfx } from '../audio/Sound.js';
import { flagKey } from '../world/Flags.js';
import { bus } from '../socket.js';

export class WinnerScene extends Phaser.Scene {
  constructor() { super('WinnerScene'); }

  init(data) {
    this.winner = data.winner;
    this.finalScore = data.finalScore;
    this.winnerTeam = data.winnerTeam;
  }

  create() {
    const primary = Phaser.Display.Color.HexStringToColor(this.winner.primary).color;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x07111e, 0.88);

    // Trophy + winner card pop in.
    const card = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90).setScale(0.2);
    const panel = this.add.rectangle(0, 0, 420, 260, primary).setStrokeStyle(6, 0xffffff);
    card.add(panel);
    if (this.textures.exists(flagKey(this.winner.iso))) {
      card.add(this.add.image(0, -10, flagKey(this.winner.iso)).setDisplaySize(220, 140));
    }
    card.add(this.add.text(0, -70, this.winner.code, {
      fontSize: '96px', fontFamily: 'Impact', color: '#ffffff', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5));
    card.add(this.add.text(0, 70, this.winner.name, {
      fontSize: '34px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    this.tweens.add({ targets: card, scale: 1, duration: 500, ease: 'Back.out' });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 110, '🏆 WINS 🏆', {
      fontSize: '76px', fontFamily: 'Impact', color: '#ffce00', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 190,
      `${this.finalScore[1]}  —  ${this.finalScore[2]}`, {
      fontSize: '60px', color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 70, 'Next vote starting…', {
      fontSize: '30px', color: '#ffffff',
    }).setOrigin(0.5);

    // Celebration: horn + cheer, confetti rain, repeating fireworks.
    sfx.goal();
    this.#confetti();
    this.fireTimer = this.time.addEvent({
      delay: 500, loop: true, callback: () => this.#firework(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.fireTimer?.remove());
    this.input.keyboard.on('keydown-ESC', () => bus.emit('ui:leave'));
    this.#firework();
  }

  #ensureTex() {
    if (!this.textures.exists('win-dot')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 10, 10);
      g.generateTexture('win-dot', 10, 10); g.destroy();
    }
  }

  #confetti() {
    this.#ensureTex();
    const p = this.add.particles(0, 0, 'win-dot', {
      x: { min: 0, max: GAME_WIDTH }, y: -20,
      speedY: { min: 150, max: 420 }, speedX: { min: -80, max: 80 },
      lifespan: 4000, scale: { min: 0.6, max: 1.4 }, rotate: { min: 0, max: 360 },
      gravityY: 200, frequency: 40,
      tint: [0xffce00, 0xff3b6a, 0x00d4ff, 0xffffff, 0x33dd55],
    });
    p.setDepth(5);
  }

  #firework() {
    this.#ensureTex();
    const x = 200 + Math.random() * (GAME_WIDTH - 400);
    const y = 150 + Math.random() * 300;
    const tint = [0xffce00, 0xff3b6a, 0x00d4ff, 0xffffff][(Math.random() * 4) | 0];
    const ring = this.add.circle(x, y, 6).setStrokeStyle(5, tint, 1).setDepth(6);
    this.tweens.add({
      targets: ring, radius: 120, alpha: 0, duration: 700, ease: 'Cubic.out',
      onUpdate: () => ring.setStrokeStyle(5, tint, ring.alpha),
      onComplete: () => ring.destroy(),
    });
    const burst = this.add.particles(x, y, 'win-dot', {
      speed: { min: 150, max: 400 }, angle: { min: 0, max: 360 },
      lifespan: 800, scale: { start: 1.6, end: 0 }, gravityY: 250,
      tint, emitting: false,
    });
    burst.setDepth(6);
    burst.explode(40, x, y);
    this.time.delayedCall(1000, () => burst.destroy());
  }
}
