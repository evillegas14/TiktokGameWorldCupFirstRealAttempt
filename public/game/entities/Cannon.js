import { PITCH, GOAL_Y } from '../world/Field.js';

export class Cannon {
  constructor(scene, team, pos, teamColor) {
    this.scene = scene;
    this.team = team;
    this.pos = pos;
    const color = Phaser.Display.Color.HexStringToColor(teamColor).color;
    this.base = scene.add.rectangle(pos.x, pos.y + 6, 36, 18, 0x222222).setStrokeStyle(2, 0xffffff);
    this.barrel = scene.add.rectangle(pos.x, pos.y - 8, 14, 36, color).setStrokeStyle(2, 0x000000);
    // Aim barrel toward opponent goal.
    const goalX = team === 1 ? PITCH.right : PITCH.left;
    const goalY = GOAL_Y;
    const angle = Math.atan2(goalY - pos.y, goalX - pos.x) - Math.PI / 2;
    this.barrel.rotation = angle;
    this.aim = { x: goalX, y: goalY };
  }

  fire(ballSpawner) {
    const ball = ballSpawner.fireCannon(this.pos.x, this.pos.y - 20, this.aim.x, this.aim.y);
    if (ball) {
      // Recoil.
      this.scene.tweens.add({
        targets: this.barrel,
        scaleX: 0.7, scaleY: 0.7,
        duration: 80, yoyo: true,
      });
      // Muzzle flash at the barrel tip, pointing toward the aim.
      const ang = Math.atan2(this.aim.y - this.pos.y, this.aim.x - this.pos.x);
      const tipX = this.pos.x + Math.cos(ang) * 26;
      const tipY = this.pos.y - 20 + Math.sin(ang) * 26;
      const flash = this.scene.add.circle(tipX, tipY, 26, 0xfff2a0, 0.95).setDepth(40);
      this.scene.tweens.add({
        targets: flash, scale: { from: 0.4, to: 1.8 }, alpha: { from: 0.95, to: 0 },
        duration: 220, onComplete: () => flash.destroy(),
      });
      // Smoke puff.
      for (let i = 0; i < 5; i++) {
        const s = this.scene.add.circle(tipX, tipY, 10 + Math.random() * 8, 0xaaaaaa, 0.5).setDepth(39);
        this.scene.tweens.add({
          targets: s,
          x: tipX + Math.cos(ang) * (30 + Math.random() * 40) + (Math.random() - 0.5) * 30,
          y: tipY + Math.sin(ang) * (30 + Math.random() * 40) - 20,
          scale: { from: 0.6, to: 2 }, alpha: { from: 0.5, to: 0 },
          duration: 500 + Math.random() * 200, onComplete: () => s.destroy(),
        });
      }
    }
    return ball;
  }
}
