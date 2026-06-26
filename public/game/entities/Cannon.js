import { PITCH } from '../world/Field.js';

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
    const goalY = (PITCH.top + PITCH.bottom) / 2;
    const angle = Math.atan2(goalY - pos.y, goalX - pos.x) - Math.PI / 2;
    this.barrel.rotation = angle;
    this.aim = { x: goalX, y: goalY };
  }

  fire(ballSpawner) {
    const ball = ballSpawner.fireCannon(this.pos.x, this.pos.y - 20, this.aim.x, this.aim.y);
    // Recoil flash.
    if (ball) {
      this.scene.tweens.add({
        targets: this.barrel,
        scaleX: 0.7, scaleY: 0.7,
        duration: 80, yoyo: true,
      });
    }
    return ball;
  }
}
