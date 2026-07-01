import { PITCH, GOAL_Y, floorYAt } from '../world/Field.js';
import { GAME_WIDTH } from '../constants.js';
import { sfx } from '../audio/Sound.js';

const PLAYER_RADIUS = 28;
const KICK_FORCE = 0.06;
const MOVE_SPEED = 2.8;
const AGGRO_SPEED = 4.8;           // enraged players charge faster
const STUN_MS = 2500;              // how long a bumped opponent stays stunned
const BUMP_KNOCKBACK = 10;         // shove velocity applied to a bumped opponent
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
    this.aggroUntil = 0;     // Aggression power-up (charge + bump opponents)
    this.stunnedUntil = 0;   // got bumped by an enraged opponent
    this._wasAggro = false;

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
    this.shadow = scene.add.ellipse(0, PLAYER_RADIUS + 4, PLAYER_RADIUS * 1.8, 12, 0x000000, 0.3);
    this.container.add(this.shadow);
    this.ring = scene.add.circle(0, 0, PLAYER_RADIUS, ringColor).setStrokeStyle(3, 0x000000);
    this.container.add(this.ring);
    // Depth texture on the jersey ring: a darker inner rim + a soft top-left shine.
    this.rim = scene.add.circle(0, 0, PLAYER_RADIUS - 3).setStrokeStyle(3, 0x000000, 0.22);
    this.container.add(this.rim);
    this.shine = scene.add.ellipse(-PLAYER_RADIUS * 0.3, -PLAYER_RADIUS * 0.32, PLAYER_RADIUS * 0.95, PLAYER_RADIUS * 0.55, 0xffffff, 0.14);
    this.container.add(this.shine);
    this.initials = scene.add.text(0, 0, (record.nickname || record.uniqueId || '?').slice(0, 2).toUpperCase(), {
      fontSize: '18px', fontFamily: 'Arial Black', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.container.add(this.initials);
    // Nameplate with a subtle background pill for readability.
    const nameStr = record.nickname || record.uniqueId;
    this.label = scene.add.text(0, -PLAYER_RADIUS - 24, nameStr, {
      fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    this.namePlate = scene.add.rectangle(0, -PLAYER_RADIUS - 24, this.label.width + 12, 20, 0x000000, 0.45);
    this.container.add(this.namePlate);
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

  // AGGRESSION power-up: charge after the ball anywhere and barge through opponents.
  enrage(durationMs = 15000) {
    if (this.destroyed) return;
    this.aggroUntil = Math.max(this.aggroUntil, this.scene.time.now + durationMs);
    this.ring.setStrokeStyle(4, 0xff3030);
    if (!this.aura && this.scene.textures.exists('fx-glow')) {
      this.aura = this.scene.add.image(0, 0, 'fx-glow')
        .setScale(1.2).setTint(0xff2a2a).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
      // Behind the avatar ring but above the shadow.
      this.container.addAt(this.aura, 1);
      this.scene.tweens.add({
        targets: this.aura, alpha: { from: 0.35, to: 0.7 }, scale: { from: 1.05, to: 1.45 },
        duration: 360, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    }
    const t = this.scene.add.text(this.body.position.x, this.body.position.y - 46, '😡 AGGRO!', {
      fontSize: '20px', fontFamily: 'Impact', color: '#ff3b3b', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(31);
    this.scene.tweens.add({ targets: t, y: t.y - 36, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // Got barged by an enraged opponent: knocked back + can't act for a moment.
  stun(durationMs = STUN_MS, knockFrom = null) {
    if (this.destroyed) return;
    this.stunnedUntil = Math.max(this.stunnedUntil, this.scene.time.now + durationMs);
    if (knockFrom) {
      const kx = this.body.position.x - knockFrom.x;
      const ky = this.body.position.y - knockFrom.y;
      const kl = Math.hypot(kx, ky) || 1;
      this.scene.matter.body.setVelocity(this.body, {
        x: (kx / kl) * BUMP_KNOCKBACK, y: (ky / kl) * BUMP_KNOCKBACK - 4,
      });
    }
    if (!this.stunIcon) {
      this.stunIcon = this.scene.add.text(0, -PLAYER_RADIUS - 4, '💫', { fontSize: '22px' }).setOrigin(0.5);
      this.container.add(this.stunIcon);
    }
    this.stunIcon.setVisible(true);
    const flash = this.scene.add.circle(this.body.position.x, this.body.position.y, PLAYER_RADIUS, 0xffffff, 0.7).setDepth(30);
    this.scene.tweens.add({ targets: flash, scale: { from: 0.6, to: 1.9 }, alpha: { from: 0.7, to: 0 }, duration: 320, onComplete: () => flash.destroy() });
    sfx.thud(0.9);
  }

  update(_time, delta, balls, players) {
    if (this.destroyed) return;
    const now = this.scene.time.now;

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

    const aggro = now < this.aggroUntil;
    const stunned = now < this.stunnedUntil;

    // Aggression wearing off: restore normal look.
    if (this._wasAggro && !aggro) {
      this.ring.setStrokeStyle(3, 0x000000);
      if (this.aura) { this.aura.destroy(); this.aura = null; }
    }
    this._wasAggro = aggro;

    // Stunned: dizzy, can't chase — just ride out the knockback.
    if (stunned) {
      if (this.stunIcon) {
        this.stunIcon.setVisible(true);
        this.stunIcon.rotation = Math.sin(now / 110) * 0.4;
      }
      return;
    }
    if (this.stunIcon && this.stunIcon.visible) this.stunIcon.setVisible(false);

    const speed = aggro ? AGGRO_SPEED : MOVE_SPEED;
    // Aggressive players hunt the ball across the whole pitch; others keep to their half.
    const myHalfMaxX = aggro ? GAME_WIDTH : (this.team === 1 ? GAME_WIDTH * 0.55 : GAME_WIDTH);
    const myHalfMinX = aggro ? 0 : (this.team === 1 ? 0 : GAME_WIDTH * 0.45);
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
      this.scene.matter.body.setVelocity(this.body, { x: (dx / len) * speed, y: (dy / len) * speed });

      // On near-contact, apply impulse to ball toward opponent goal.
      const contactDist = PLAYER_RADIUS + nearest.radius + 4;
      if (len < contactDist) {
        const goalX = this.team === 1 ? PITCH.right + 40 : PITCH.left - 40;
        const goalY = GOAL_Y;
        const tx = goalX - nearest.x;
        const ty = goalY - nearest.y;
        const tl = Math.hypot(tx, ty) || 1;
        const force = aggro ? KICK_FORCE * 1.5 : KICK_FORCE;
        this.scene.matter.body.applyForce(
          nearest.image.body,
          { x: nearest.x, y: nearest.y },
          { x: (tx / tl) * force, y: (ty / tl) * force },
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

    // Aggression: barge into opponents — kick + stun any we run into.
    if (aggro && players) {
      const reach = (PLAYER_RADIUS * 2 + 6) ** 2;
      for (const other of players.values()) {
        if (other === this || other.destroyed || other.team === this.team) continue;
        if (this.scene.time.now < other.stunnedUntil) continue; // already stunned
        const dx = other.body.position.x - this.body.position.x;
        const dy = other.body.position.y - this.body.position.y;
        if (dx * dx + dy * dy <= reach) {
          other.stun(STUN_MS, { x: this.body.position.x, y: this.body.position.y });
        }
      }
    }

    // Clamp x to the allowed range (own half normally; full pitch while enraged).
    const minX = aggro ? PITCH.left + 40 : (this.team === 1 ? PITCH.left + 40 : GAME_WIDTH * 0.5);
    const maxX = aggro ? PITCH.right - 40 : (this.team === 1 ? GAME_WIDTH * 0.5 : PITCH.right - 40);
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
