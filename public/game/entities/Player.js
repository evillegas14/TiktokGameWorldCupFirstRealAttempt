import { PITCH } from '../world/Field.js';
import { GAME_WIDTH } from '../constants.js';

const PLAYER_RADIUS = 28;
const KICK_FORCE = 0.06;
const MOVE_SPEED = 2.8;

export class Player {
  constructor(scene, record, teamColor) {
    this.scene = scene;
    this.record = record;
    this.team = record.team;
    this.teamColor = teamColor;

    const startX = this.team === 1 ? 250 : GAME_WIDTH - 250;
    const startY = PITCH.bottom - 80 - Math.random() * 200;

    this.body = scene.matter.add.circle(startX, startY, PLAYER_RADIUS, {
      friction: 0.05,
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
    this.label = scene.add.text(0, -PLAYER_RADIUS - 14, record.nickname || record.uniqueId, {
      fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    this.container.add(this.label);

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

  update(_time, _delta, balls) {
    if (this.destroyed) return;
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
        const goalY = (PITCH.top + PITCH.bottom) / 2;
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
      this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    }

    // Clamp x to own side so they don't drift across the field.
    const minX = this.team === 1 ? PITCH.left + 40 : GAME_WIDTH * 0.5;
    const maxX = this.team === 1 ? GAME_WIDTH * 0.5 : PITCH.right - 40;
    if (this.body.position.x < minX) this.scene.matter.body.setPosition(this.body, { x: minX, y: this.body.position.y });
    if (this.body.position.x > maxX) this.scene.matter.body.setPosition(this.body, { x: maxX, y: this.body.position.y });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.matter.world.remove(this.body);
    this.container.destroy();
    if (this.maskShape) this.maskShape.destroy();
  }
}
