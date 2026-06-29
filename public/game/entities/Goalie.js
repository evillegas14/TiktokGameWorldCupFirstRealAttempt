import { PITCH, GOAL_Y } from '../world/Field.js';

const BASE_W = 30;
const BASE_H = 80;

export class Goalie {
  constructor(scene, team, teamColor) {
    this.scene = scene;
    this.team = team;
    this.teamColor = teamColor;
    this.buffUntil = 0;
    this.scaleMul = 1;
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

  buff(durationMs, scale) {
    this.buffUntil = this.scene.time.now + durationMs;
    this.scaleMul = scale;
    if (!this.aura && this.scene.textures.exists('fx-glow')) {
      this.aura = this.scene.add.image(this.x, this.y, 'fx-glow').setDepth(4).setScale(1.4).setTint(0x00d4ff);
      this.scene.tweens.add({
        targets: this.aura, alpha: { from: 0.35, to: 0.7 }, scale: { from: 1.2, to: 1.6 },
        duration: 500, yoyo: true, repeat: -1,
      });
    }
  }

  update(_time, delta, balls) {
    if (this.scene.time.now > this.buffUntil) {
      this.scaleMul = 1;
      if (this.aura) { this.aura.destroy(); this.aura = null; }
    }

    // Predict if any ball will reach the goal mouth within ~0.5s
    const goalX = this.team === 1 ? PITCH.left : PITCH.right;
    let triggerJump = false;
    for (const ball of balls) {
      if (ball.destroyed) continue;
      const vx = ball.vx;
      const movingToward = (this.team === 1 && vx < -2) || (this.team === 2 && vx > 2);
      if (!movingToward) continue;
      const t = (goalX - ball.x) / vx; // seconds to reach goal line (vx in px/sec? actually px/step)
      if (t > 0 && t < 30) { // matter velocity units are px/step at ~60fps so 30 steps = 0.5s
        const projY = ball.y + ball.vy * t;
        if (Math.abs(projY - this.baseY) < PITCH.goalMouthHeight / 2 + 20) {
          triggerJump = true;
          break;
        }
      }
    }

    if (triggerJump && this.scene.time.now > this.jumpCooldownUntil) {
      this.scene.matter.body.setVelocity(this.body, { x: 0, y: -10 });
      this.jumpCooldownUntil = this.scene.time.now + 600;
      // Throw the gloves up for the save.
      this.diving = this.scene.time.now + 400;
    }

    // Idle bounce — patrol most of the goal mouth vertically.
    this.bounceTime += delta / 220;
    const idleY = this.baseY + Math.sin(this.bounceTime) * 110;
    const currentY = this.body.position.y;
    if (Math.abs(currentY - idleY) < 4 && Math.abs(this.body.velocity.y) < 0.5) {
      this.scene.matter.body.setPosition(this.body, { x: this.x, y: idleY });
      this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    } else {
      this.scene.matter.body.setPosition(this.body, { x: this.x, y: this.body.position.y });
    }

    // Sync visuals.
    this.sprite.x = this.body.position.x;
    this.sprite.y = this.body.position.y;
    this.sprite.scaleX = this.scaleMul;
    this.sprite.scaleY = this.scaleMul;

    // Gloves raise while diving for a save.
    const diving = this.scene.time.now < (this.diving || 0);
    const gy = diving ? -34 : 2;
    this.gloveL.y = Phaser.Math.Linear(this.gloveL.y, gy, 0.4);
    this.gloveR.y = Phaser.Math.Linear(this.gloveR.y, gy, 0.4);

    // Ground shadow shrinks with jump height.
    const jump = Phaser.Math.Clamp((this.baseY + 110 - this.body.position.y) / 220, 0, 1);
    this.shadow.scaleX = (1 - jump * 0.5) * this.scaleMul;
    this.shadow.setAlpha(0.3 - jump * 0.15);

    this.label.x = this.sprite.x;
    this.label.y = this.body.position.y - (BASE_H * this.scaleMul) / 2 - 14;
    if (this.aura) { this.aura.x = this.sprite.x; this.aura.y = this.sprite.y; }
  }
}
