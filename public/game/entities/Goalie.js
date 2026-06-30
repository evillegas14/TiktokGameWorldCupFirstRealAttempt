import { PITCH, GOAL_Y } from '../world/Field.js';

const BASE_W = 30;
const BASE_H = 80;

export class Goalie {
  constructor(scene, team, teamColor) {
    this.scene = scene;
    this.team = team;
    this.teamColor = teamColor;
    this.jumpCooldownUntil = 0;

    this.x = team === 1 ? PITCH.left + 70 : PITCH.right - 70;
    this.baseY = GOAL_Y;     // patrol the goal mouth, centered on its middle
    this.y = GOAL_Y;
    this.vy = 0;

    this.body = scene.matter.add.rectangle(this.x, this.y, BASE_W, BASE_H, {
      isStatic: false,
      isSensor: false,
      friction: 0,
      frictionAir: 0,
      restitution: 0.9,
      density: 0.05,
      inertia: Infinity, // prevent rotation
      label: 'goalie',
    });
    scene.matter.body.setInertia(this.body, Infinity);

    const color = Phaser.Display.Color.HexStringToColor(teamColor).color;

    // Ground shadow stays on the floor and shrinks as the keeper leaps.
    this.shadow = scene.add.ellipse(this.x, GOAL_Y + BASE_H / 2 + 6, 50, 14, 0x000000, 0.3).setDepth(2);

    // Keeper character: body + head + eyes + gloves, in a container we move/scale.
    this.sprite = scene.add.container(this.x, this.y).setDepth(6);
    const body = scene.add.rectangle(0, 10, BASE_W, 52, color).setStrokeStyle(3, 0x000000);
    const head = scene.add.circle(0, -26, 14, 0xf1c27d).setStrokeStyle(2, 0x000000);
    const eyeL = scene.add.circle(-5, -28, 2.2, 0x000000);
    const eyeR = scene.add.circle(5, -28, 2.2, 0x000000);
    this.gloveL = scene.add.circle(-BASE_W / 2 - 6, 2, 7, 0xffffff).setStrokeStyle(2, 0x000000);
    this.gloveR = scene.add.circle(BASE_W / 2 + 6, 2, 7, 0xffffff).setStrokeStyle(2, 0x000000);
    this.sprite.add([body, this.gloveL, this.gloveR, head, eyeL, eyeR]);

    this.label = scene.add.text(this.x, this.y - BASE_H / 2 - 14, 'GK', {
      fontSize: '16px', fontFamily: 'Impact', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(7);

    // Rhythmic idle bounce.
    this.bounceTime = Math.random() * Math.PI * 2;
  }

  update(_time, delta, balls) {
    // Keepers are good by default now (no donation buff). Find the most imminent
    // incoming ball and slide to intercept its projected height.
    const goalX = this.team === 1 ? PITCH.left : PITCH.right;
    const mouthHalf = PITCH.goalMouthHeight / 2;

    let bestT = Infinity;
    let projY = null;
    for (const ball of balls) {
      if (ball.destroyed) continue;
      const vx = ball.vx;
      const movingToward = (this.team === 1 && vx < -1.5) || (this.team === 2 && vx > 1.5);
      if (!movingToward) continue;
      const t = (goalX - ball.x) / vx; // steps to reach the goal line (~px/step @60fps)
      if (t <= 0 || t > 70) continue;  // look ~1.1s ahead
      const py = ball.y + ball.vy * t;
      if (py < this.baseY - mouthHalf - 50 || py > this.baseY + mouthHalf + 50) continue;
      if (t < bestT) { bestT = t; projY = py; }
    }

    // Target height: intercept the incoming ball, else patrol gently.
    let targetY;
    if (projY != null) {
      targetY = Phaser.Math.Clamp(projY, this.baseY - mouthHalf, this.baseY + mouthHalf);
    } else {
      this.bounceTime += delta / 260;
      targetY = this.baseY + Math.sin(this.bounceTime) * (mouthHalf * 0.6);
    }

    // Brisk reflexes toward the target; x stays pinned to the goal line.
    const dy = targetY - this.body.position.y;
    this.scene.matter.body.setVelocity(this.body, { x: 0, y: Phaser.Math.Clamp(dy * 0.5, -17, 17) });
    this.scene.matter.body.setPosition(this.body, { x: this.x, y: this.body.position.y });

    // Throw the gloves up when committing to a close save.
    if (projY != null && bestT < 24 && this.scene.time.now > this.jumpCooldownUntil) {
      this.diving = this.scene.time.now + 360;
      this.jumpCooldownUntil = this.scene.time.now + 320;
    }

    // Sync visuals.
    this.sprite.x = this.body.position.x;
    this.sprite.y = this.body.position.y;

    // Gloves raise + spread while diving for a save.
    const diving = this.scene.time.now < (this.diving || 0);
    const gy = diving ? -34 : 2;
    const gx = diving ? BASE_W / 2 + 12 : BASE_W / 2 + 6;
    this.gloveL.y = Phaser.Math.Linear(this.gloveL.y, gy, 0.4);
    this.gloveR.y = Phaser.Math.Linear(this.gloveR.y, gy, 0.4);
    this.gloveL.x = Phaser.Math.Linear(this.gloveL.x, -gx, 0.35);
    this.gloveR.x = Phaser.Math.Linear(this.gloveR.x, gx, 0.35);

    // Ground shadow shrinks as the keeper rises above its base line.
    const above = Phaser.Math.Clamp((this.baseY - this.body.position.y) / mouthHalf, 0, 1);
    this.shadow.scaleX = 1 - above * 0.4;
    this.shadow.setAlpha(0.3 - above * 0.12);

    this.label.x = this.sprite.x;
    this.label.y = this.body.position.y - BASE_H / 2 - 14;
  }
}
