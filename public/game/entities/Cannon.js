import { PITCH, GOAL_Y } from '../world/Field.js';

export class Cannon {
  constructor(scene, team, pos, teamColor) {
    this.scene = scene;
    this.team = team;
    this.pos = pos;
    const color = Phaser.Display.Color.HexStringToColor(teamColor).color;

    // Aim toward the opponent goal.
    const goalX = team === 1 ? PITCH.right : PITCH.left;
    const goalY = GOAL_Y;
    this.angle = Math.atan2(goalY - pos.y, goalX - pos.x);
    this.aim = { x: goalX, y: goalY };

    // Carriage wheel.
    this.wheel = scene.add.circle(pos.x, pos.y + 10, 16, 0x2a2a2a).setStrokeStyle(4, 0x111111).setDepth(8);
    this.wheelHub = scene.add.circle(pos.x, pos.y + 10, 5, 0x777777).setDepth(9);

    // Barrel as a container so it rotates + recoils as one piece, aimed at the goal.
    this.barrel = scene.add.container(pos.x, pos.y).setDepth(9);
    this.barrel.rotation = this.angle;
    const tube = scene.add.rectangle(0, 0, 64, 26, 0x3a3f4a).setStrokeStyle(3, 0x10131a).setOrigin(0.2, 0.5);
    const sheen = scene.add.rectangle(0, -6, 60, 6, 0x9aa6b8, 0.7).setOrigin(0.2, 0.5);
    this.muzzle = scene.add.circle(56, 0, 15, 0x23262e).setStrokeStyle(3, 0x10131a);
    const band = scene.add.rectangle(8, 0, 8, 30, color).setStrokeStyle(2, 0x000000);
    // Loaded ball peeking from the muzzle.
    this.loaded = scene.add.circle(56, 0, 11, 0xffffff).setStrokeStyle(2, 0x222222);
    this.barrel.add([tube, sheen, band, this.muzzle, this.loaded]);

    this.muzzleTip = { x: pos.x + Math.cos(this.angle) * 64, y: pos.y + Math.sin(this.angle) * 64 };
  }

  fire(ballSpawner) {
    const deg = Phaser.Math.RadToDeg(this.angle);

    // Charge glow building at the muzzle.
    if (this.scene.textures.exists('fx-glow')) {
      const charge = this.scene.add.image(this.muzzleTip.x, this.muzzleTip.y, 'fx-glow')
        .setDepth(38).setScale(0.2).setTint(0xffaa00).setAlpha(0.9);
      this.scene.tweens.add({ targets: charge, scale: 0.9, duration: 160, onComplete: () => charge.destroy() });
    }
    this.loaded.setVisible(true);
    this.scene.tweens.add({ targets: this.loaded, scale: { from: 1.3, to: 1 }, duration: 160 });

    // After a short charge, launch + blast.
    this.scene.time.delayedCall(160, () => {
      const ball = ballSpawner.fireCannon(this.muzzleTip.x, this.muzzleTip.y, this.aim.x, this.aim.y);
      this.#blast(deg);
      // Recoil along the barrel axis.
      const back = { x: -Math.cos(this.angle) * 10, y: -Math.sin(this.angle) * 10 };
      this.scene.tweens.add({
        targets: this.barrel, x: this.pos.x + back.x, y: this.pos.y + back.y,
        duration: 70, yoyo: true, ease: 'Quad.out',
      });
      this.loaded.setScale(0.2);
      this.scene.tweens.add({ targets: this.loaded, scale: 1, duration: 400 });
    });

    return true;
  }

  #blast(deg) {
    const { x, y } = this.muzzleTip;
    // Bright muzzle flash.
    const flash = this.scene.add.circle(x, y, 34, 0xfff2a0, 0.95).setDepth(40);
    this.scene.tweens.add({
      targets: flash, scale: { from: 0.4, to: 2.2 }, alpha: { from: 1, to: 0 },
      duration: 240, onComplete: () => flash.destroy(),
    });
    // Fire cone.
    if (this.scene.textures.exists('fx-dot')) {
      const fire = this.scene.add.particles(x, y, 'fx-dot', {
        speed: { min: 160, max: 460 }, angle: { min: deg - 22, max: deg + 22 },
        lifespan: 480, scale: { start: 2.6, end: 0 }, alpha: { start: 1, end: 0 },
        tint: [0xffff66, 0xff8800, 0xff2200], gravityY: 120, emitting: false,
      });
      fire.setDepth(41);
      fire.explode(22, x, y);
      this.scene.time.delayedCall(700, () => fire.destroy());

      // Sparks shooting further.
      const sparks = this.scene.add.particles(x, y, 'fx-dot', {
        speed: { min: 300, max: 700 }, angle: { min: deg - 30, max: deg + 30 },
        lifespan: 500, scale: { start: 1.2, end: 0 }, tint: [0xffffff, 0xffe066],
        gravityY: 400, emitting: false,
      });
      sparks.setDepth(42);
      sparks.explode(14, x, y);
      this.scene.time.delayedCall(700, () => sparks.destroy());
    }
    // Smoke ring puffs.
    for (let i = 0; i < 6; i++) {
      const ang = Phaser.Math.DegToRad(deg) + (Math.random() - 0.5) * 1.1;
      const s = this.scene.add.circle(x, y, 9 + Math.random() * 7, 0x999999, 0.5).setDepth(39);
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(ang) * (40 + Math.random() * 50),
        y: y + Math.sin(ang) * (40 + Math.random() * 50) - 15,
        scale: { from: 0.6, to: 2.2 }, alpha: { from: 0.5, to: 0 },
        duration: 600 + Math.random() * 200, onComplete: () => s.destroy(),
      });
    }
  }
}
