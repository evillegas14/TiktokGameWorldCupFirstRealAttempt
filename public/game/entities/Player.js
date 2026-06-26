import { PITCH, GOAL_Y, floorYAt } from '../world/Field.js';
import { GAME_WIDTH } from '../constants.js';

const PLAYER_RADIUS = 28;
const KICK_FORCE = 0.06;
const MOVE_SPEED = 2.8;
const BASE_LIFE_MS = 300_000;     // 5 minutes
const DONATE_FLOOR_MS = 600_000;  // donating bumps life up to at least 10 minutes
const DONATE_ADD_MS = 300_000;    // and adds 5 minutes on top of current
const MAX_LIFE_MS = 1_800_000;    // cap at 30 minutes

export class Player {
  constructor(scene, record, teamColor) {
    this.scene = scene;
    this.record = record;
    this.team = record.team;
    this.teamColor = teamColor;

    // Home position on the team's side of the slope; players drift back here when idle.
    this.homeX = this.team === 1
      ? PITCH.left + 280 + Math.random() * 220
      : PITCH.right - 280 - Math.random() * 220;
    const startX = this.homeX;
    const startY = floorYAt(startX) - 60;

    this.body = scene.matter.add.circle(startX, startY, PLAYER_RADIUS, {
      friction: 0.4,        // grip the slope so they hold position instead of sliding
      frictionAir: 0.15,
      restitution: 0.3,
      density: 0.004,
      label: 'player',
    });

    this.container = scene.add.container(startX, startY);
    const ringColor = Phaser.Display.Color.HexStringToColor(teamColor).color;
    this.ring = scene.add.circle(0, 0, PLAYER_RADIUS, ringColor).setStrokeStyle(3, 0x000000);
    this.container.add(this.ring);
    this.initials = scene.add.text(0, 0, (record.nickname || record.uniqueId || '?').slice(0, 2).toUpperCase(), {
      fontSize: '18px', fontFamily: 'Arial Black', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.container.add(this.initials);
    this.label = scene.add.text(0, -PLAYER_RADIUS - 22, record.nickname || record.uniqueId, {
      fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    this.container.add(this.label);

    // Lifespan + health bar.
    this.maxLife = BASE_LIFE_MS;
    this.life = BASE_LIFE_MS;
    this.healthBarBg = scene.add.rectangle(0, -PLAYER_RADIUS - 6, 54, 7, 0x000000, 0.6);
    this.healthBar = scene.add.rectangle(-27, -PLAYER_RADIUS - 6, 54, 7, 0x33dd55).setOrigin(0, 0.5);
    this.container.add(this.healthBarBg);
    this.container.add(this.healthBar);

    if (record.profilePictureUrl) this.#loadProfilePic(record.profilePictureUrl);
  }

  #loadProfilePic(url) {
    const key = 'pfp:' + this.record.uniqueId;
    if (this.scene.textures.exists(key)) {
      this.#applyPic(key);
      return;
    }
    this.scene.load.image(key, url);
    this.scene.load.once('complete', () => {
      if (this.scene.textures.exists(key)) this.#applyPic(key);
    });
    this.scene.load.once('loaderror', () => {/* keep initials fallback */});
    this.scene.load.start();
  }

  #applyPic(key) {
    if (this.destroyed) return;
    const pic = this.scene.add.image(0, 0, key)
      .setDisplaySize(PLAYER_RADIUS * 1.6, PLAYER_RADIUS * 1.6);
    // Circular mask
    const maskShape = this.scene.make.graphics({ x: 0, y: 0, add: false });
    maskShape.fillStyle(0xffffff);
    maskShape.fillCircle(this.container.x, this.container.y, PLAYER_RADIUS * 0.8);
    const mask = maskShape.createGeometryMask();
    pic.setMask(mask);
    this.container.add(pic);
    this.initials.setVisible(false);
    this.picture = pic;
    this.maskShape = maskShape;
  }

  // Donating extends the player's life (floors it at 10 min, adds on top, caps at 30).
  extendLife() {
    this.life = Math.min(MAX_LIFE_MS, Math.max(this.life + DONATE_ADD_MS, DONATE_FLOOR_MS));
    this.maxLife = Math.max(this.maxLife, this.life);
    // Brief green pulse + floating "+life".
    const pulse = this.scene.add.circle(this.body.position.x, this.body.position.y, PLAYER_RADIUS + 6, 0x33dd55, 0.5).setDepth(30);
    this.scene.tweens.add({ targets: pulse, scale: { from: 0.8, to: 2 }, alpha: { from: 0.5, to: 0 }, duration: 500, onComplete: () => pulse.destroy() });
    const t = this.scene.add.text(this.body.position.x, this.body.position.y - 40, '+LIFE', {
      fontSize: '20px', fontFamily: 'Impact', color: '#33dd55', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(31);
    this.scene.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  update(_time, delta, balls) {
    if (this.destroyed) return;

    // Lifespan tick.
    this.life -= delta;
    if (this.life <= 0) {
      this.expire();
      return;
    }
    const ratio = Phaser.Math.Clamp(this.life / this.maxLife, 0, 1);
    this.healthBar.width = 54 * ratio;
    this.healthBar.fillColor = ratio > 0.5 ? 0x33dd55 : ratio > 0.25 ? 0xffcc33 : 0xff4444;

    // Sync visual container with physics body.
    this.container.x = this.body.position.x;
    this.container.y = this.body.position.y;
    if (this.maskShape) {
      this.maskShape.clear();
      this.maskShape.fillStyle(0xffffff);
      this.maskShape.fillCircle(this.body.position.x, this.body.position.y, PLAYER_RADIUS * 0.8);
    }

    // Pick the nearest ball within own half (plus slight overlap so they engage near the slit).
    const myHalfMaxX = this.team === 1 ? GAME_WIDTH * 0.55 : GAME_WIDTH;
    const myHalfMinX = this.team === 1 ? 0 : GAME_WIDTH * 0.45;
    let nearest = null;
    let nearestD = Infinity;
    for (const ball of balls) {
      if (ball.destroyed) continue;
      if (ball.x < myHalfMinX || ball.x > myHalfMaxX) continue;
      const dx = ball.x - this.body.position.x;
      const dy = ball.y - this.body.position.y;
      const d = dx * dx + dy * dy;
      if (d < nearestD) { nearestD = d; nearest = ball; }
    }

    if (nearest) {
      const dx = nearest.x - this.body.position.x;
      const dy = nearest.y - this.body.position.y;
      const len = Math.hypot(dx, dy) || 1;
      this.scene.matter.body.setVelocity(this.body, { x: (dx / len) * MOVE_SPEED, y: (dy / len) * MOVE_SPEED });

      // On near-contact, apply impulse to ball toward opponent goal.
      const contactDist = PLAYER_RADIUS + nearest.radius + 4;
      if (len < contactDist) {
        const goalX = this.team === 1 ? PITCH.right + 40 : PITCH.left - 40;
        const goalY = GOAL_Y;
        const tx = goalX - nearest.x;
        const ty = goalY - nearest.y;
        const tl = Math.hypot(tx, ty) || 1;
        this.scene.matter.body.applyForce(
          nearest.image.body,
          { x: nearest.x, y: nearest.y },
          { x: (tx / tl) * KICK_FORCE, y: (ty / tl) * KICK_FORCE },
        );
      }
    } else {
      // No ball in range: drift back toward home x, let gravity settle on the slope.
      const dx = this.homeX - this.body.position.x;
      this.scene.matter.body.setVelocity(this.body, {
        x: Phaser.Math.Clamp(dx * 0.04, -2, 2),
        y: this.body.velocity.y,
      });
    }

    // Clamp x to own side so they don't drift across the field.
    const minX = this.team === 1 ? PITCH.left + 40 : GAME_WIDTH * 0.5;
    const maxX = this.team === 1 ? GAME_WIDTH * 0.5 : PITCH.right - 40;
    if (this.body.position.x < minX) this.scene.matter.body.setPosition(this.body, { x: minX, y: this.body.position.y });
    if (this.body.position.x > maxX) this.scene.matter.body.setPosition(this.body, { x: maxX, y: this.body.position.y });
  }

  // Life ran out: poof, then notify the scene to remove + update the server count.
  expire() {
    if (this.destroyed) return;
    const poof = this.scene.add.circle(this.body.position.x, this.body.position.y, PLAYER_RADIUS, 0xffffff, 0.6).setDepth(30);
    this.scene.tweens.add({ targets: poof, scale: { from: 1, to: 2.2 }, alpha: { from: 0.6, to: 0 }, duration: 350, onComplete: () => poof.destroy() });
    this.scene.events.emit('player:expire', this.record.uniqueId);
    this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.matter.world.remove(this.body);
    this.container.destroy();
    if (this.maskShape) this.maskShape.destroy();
  }
}
