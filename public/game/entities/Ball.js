import { floorYAt, CATEGORY_VOLCANO } from '../world/Field.js';

export const BALL_RADIUS = 22;
export const SUPER_RADIUS = 32;
export const DEFAULT_HEALTH_MS = 240_000;

// Gift-spawned balls get a distinct texture + colored glow (and a trail for the
// flashier ones) so viewers can instantly tell an ability is in play.
//   super  → big flaming red comet (top-tier gift)
//   cannon → glowing iron cannonball (cannon-shot gift)
//   drop   → cyan energy orb (multi-ball / chaos drop gifts)
const SPECIAL_FX = {
  super:  { glow: 0xff5522, glowScale: 0.95, depth: 20, trail: [0xffee00, 0xff8800, 0xff2200, 0xffffff] },
  cannon: { glow: 0xffaa00, glowScale: 0.7,  depth: 16, trail: [0xffffaa, 0xffaa00, 0xff5500] },
  drop:   { glow: 0x33ddff, glowScale: 0.62, depth: 14, trail: null },
};

export class Ball {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.kind = opts.kind || 'regular';
    this.team = opts.team || null;
    const radius = this.kind === 'super' ? SUPER_RADIUS : BALL_RADIUS;
    this.radius = radius;
    this.health = opts.health != null ? opts.health : DEFAULT_HEALTH_MS;
    this.scoredCount = 0;
    this.squashUntil = 0;

    // Ground contact shadow (projected to the bowl floor).
    this.shadow = scene.add.ellipse(x, y, radius * 1.8, radius * 0.6, 0x000000, 0.3).setDepth(1);

    const texKey = this.#textureKey();
    this.image = scene.matter.add.image(x, y, texKey, undefined, {
      shape: { type: 'circle', radius },
      restitution: 0.808,  // bounciness (was 0.985, lowered 18%) — Matter uses the max restitution of the pair
      friction: 0.012,
      frictionAir: 0.0025, // low drag so balls keep their energy and stay lively
      density: 0.0015,
      label: 'ball',
    });
    // NOTE: do NOT call setCircle() here — the `shape` option above already makes
    // a circle body with our label/restitution/friction. setCircle() would build
    // a *fresh* body and silently drop the 'ball' label (breaking goal detection)
    // and our material settings (killing the bounce).
    this.image.ballRef = this;
    // Cannon & super shots are launched from on/over the volcano — let them fly over
    // the cone cleanly instead of clipping it (regular balls still bounce off it).
    if (this.kind === 'cannon' || this.kind === 'super') {
      this.image.body.collisionFilter.mask &= ~CATEGORY_VOLCANO;
    }
    const fx = SPECIAL_FX[this.kind];
    this.image.setDepth(fx ? fx.depth : 2); // above its ground shadow (depth 1)

    if (opts.angularVelocity != null) this.image.setAngularVelocity(opts.angularVelocity);
    if (opts.velocity) this.image.setVelocity(opts.velocity.x, opts.velocity.y);

    if (fx) {
      // Pulsing colored glow that follows the ball.
      if (scene.textures.exists('fx-glow')) {
        this.glow = scene.add.image(x, y, 'fx-glow')
          .setDepth(fx.depth - 1).setScale(fx.glowScale).setTint(fx.glow).setAlpha(0.8);
        scene.tweens.add({
          targets: this.glow, alpha: { from: 0.5, to: 0.9 },
          scale: { from: fx.glowScale * 0.85, to: fx.glowScale },
          duration: 400, yoyo: true, repeat: -1,
        });
      }
      // Particle trail for the flashier kinds (skipped for bulk drops to keep
      // the emitter count — and the screen — under control).
      if (fx.trail && scene.textures.exists('fx-dot')) {
        const big = this.kind === 'super';
        this.trail = scene.add.particles(0, 0, 'fx-dot', {
          follow: this.image,
          speed: { min: 0, max: 40 },
          lifespan: big ? 420 : 300,
          scale: { start: big ? 3.6 : 2.4, end: 0 },
          alpha: { start: 0.9, end: 0 },
          tint: fx.trail,
          frequency: big ? 12 : 22,
        });
        this.trail.setDepth(fx.depth - 2);
      }
    }
  }

  #textureKey() {
    if (this.kind === 'super') return 'ball-super';
    if (this.kind === 'cannon') return 'ball-cannon';
    if (this.kind === 'drop') return 'ball-drop';
    return 'ball';
  }

  // Quick squash-and-stretch when the ball thuds into something.
  squash() {
    this.squashUntil = this.scene.time.now + 130;
  }

  update(_time, delta) {
    this.health -= delta;
    if (this.health <= 0) {
      this.destroy();
      return;
    }
    // Keep spin alive — Matter friction dampens it otherwise.
    const av = this.image.body.angularVelocity;
    if (Math.abs(av) < 0.05) this.image.setAngularVelocity(av >= 0 ? 0.1 : -0.1);

    // Cap runaway speed (well above eruption/cannon launch speeds) so a ball can't
    // punch through a wall in a single step and fly off the map.
    const speed = Math.hypot(this.image.body.velocity.x, this.image.body.velocity.y);
    const MAX_SPEED = 32;
    if (speed > MAX_SPEED) {
      const v = this.image.body.velocity;
      this.image.setVelocity((v.x / speed) * MAX_SPEED, (v.y / speed) * MAX_SPEED);
    }

    // Keep-alive: if a ball goes nearly idle (e.g. nobody is playing), give it a
    // lively random kick so the match keeps moving on its own.
    if (speed < 1.5) {
      this.idleMs = (this.idleMs || 0) + delta;
      if (this.idleMs > 900) {
        this.idleMs = 0;
        const dir = this.image.x < 960 ? 1 : -1; // nudge toward the far side
        this.image.setVelocity((5 + Math.random() * 5) * dir, -(7 + Math.random() * 5));
        this.image.setAngularVelocity((Math.random() - 0.5) * 0.9);
      }
    } else {
      this.idleMs = 0;
    }

    // Contact shadow: smaller/fainter the higher the ball is above the floor.
    const floorY = floorYAt(this.image.x);
    const height = Phaser.Math.Clamp(floorY - this.image.y, 0, 700);
    const k = 1 - height / 800;
    this.shadow.x = this.image.x;
    this.shadow.y = floorY - 4;
    this.shadow.setScale(Phaser.Math.Clamp(k, 0.35, 1));
    this.shadow.setAlpha(0.32 * Phaser.Math.Clamp(k, 0.25, 1));

    // Squash-and-stretch: briefly flatten after a bounce, else keep round.
    if (this.scene.time.now < this.squashUntil) {
      this.image.setScale(1.25, 0.78);
    } else if (this.image.scaleX !== 1) {
      const nx = Phaser.Math.Linear(this.image.scaleX, 1, 0.3);
      const ny = Phaser.Math.Linear(this.image.scaleY, 1, 0.3);
      if (Math.abs(nx - 1) < 0.01) this.image.setScale(1, 1); // snap to avoid lerping forever
      else this.image.setScale(nx, ny);
    }

    if (this.glow) { this.glow.x = this.image.x; this.glow.y = this.image.y; }
  }

  respawn(x, y, angularVelocity) {
    this.image.setPosition(x, y);
    this.image.setVelocity(0, 0);
    this.image.setAngularVelocity(angularVelocity);
    this.scoredCount++;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.trail) this.trail.destroy();
    if (this.glow) this.glow.destroy();
    if (this.shadow) this.shadow.destroy();
    this.image.destroy();
    this.scene.events.emit('ball:despawn', this);
  }

  get x() { return this.image.x; }
  get y() { return this.image.y; }
  get vx() { return this.image.body.velocity.x; }
  get vy() { return this.image.body.velocity.y; }
}

// Canvas textures for crisp, shaded soccer balls (falls back to graphics if
// the canvas backend is unavailable).
export function createBallTextures(scene) {
  makeSoccerBall(scene, 'ball', BALL_RADIUS, false);
  makeSoccerBall(scene, 'ball-super', SUPER_RADIUS, true);
  makeCannonball(scene, 'ball-cannon', BALL_RADIUS);
  makeEnergyBall(scene, 'ball-drop', BALL_RADIUS);
}

// Glowing iron cannonball — used for cannon-shot gifts.
function makeCannonball(scene, key, r) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const size = r * 2;
  let ct;
  try { ct = scene.textures.createCanvas(key, size, size); } catch (e) { ct = null; }
  if (!ct) { fallbackBall(scene, key, r, true); return; }
  const ctx = ct.getContext();

  // Iron sphere, lit from upper-left.
  const grad = ctx.createRadialGradient(r * 0.6, r * 0.52, r * 0.1, r, r, r);
  grad.addColorStop(0, '#9aa3b2');
  grad.addColorStop(0.5, '#3a3f4a');
  grad.addColorStop(1, '#13161c');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.fill();

  // Hot ember glow bleeding out (looks red-hot from the cannon).
  const ember = ctx.createRadialGradient(r, r * 1.05, 0, r, r, r);
  ember.addColorStop(0, 'rgba(255,150,30,0.5)');
  ember.addColorStop(0.55, 'rgba(255,80,0,0.14)');
  ember.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = ember;
  ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.fill();

  // Rivets around the shell.
  ctx.fillStyle = 'rgba(15,17,22,0.9)';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(r + Math.cos(a) * r * 0.6, r + Math.sin(a) * r * 0.6, r * 0.07, 0, Math.PI * 2); ctx.fill();
  }

  // Specular highlight + rim.
  const hi = ctx.createRadialGradient(r * 0.62, r * 0.48, 0, r * 0.62, r * 0.48, r * 0.55);
  hi.addColorStop(0, 'rgba(255,255,255,0.65)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.stroke();

  ct.refresh();
}

// Cyan energy orb — used for multi-ball / chaos drop gifts.
function makeEnergyBall(scene, key, r) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const size = r * 2;
  let ct;
  try { ct = scene.textures.createCanvas(key, size, size); } catch (e) { ct = null; }
  if (!ct) { fallbackBall(scene, key, r, false); return; }
  const ctx = ct.getContext();

  // Glowing cyan sphere.
  const grad = ctx.createRadialGradient(r * 0.6, r * 0.52, r * 0.1, r, r, r);
  grad.addColorStop(0, '#e6fbff');
  grad.addColorStop(0.45, '#3fd2ff');
  grad.addColorStop(1, '#0a6fb0');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.fill();

  // Bright energy panels (soccer-ball pentagons, glowing white).
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  drawPentagon(ctx, r, r, r * 0.32, -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    drawPentagon(ctx, r + Math.cos(a) * r * 0.64, r + Math.sin(a) * r * 0.64, r * 0.17, a + Math.PI);
  }

  // Core bloom + rim glow.
  const hi = ctx.createRadialGradient(r * 0.6, r * 0.5, 0, r * 0.6, r * 0.5, r * 0.7);
  hi.addColorStop(0, 'rgba(255,255,255,0.7)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(180,245,255,0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(r, r, r - 1.5, 0, Math.PI * 2); ctx.stroke();

  ct.refresh();
}

function makeSoccerBall(scene, key, r, fiery) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const size = r * 2;
  let ct;
  try {
    ct = scene.textures.createCanvas(key, size, size);
  } catch (e) {
    ct = null;
  }
  if (!ct) { fallbackBall(scene, key, r, fiery); return; }
  const ctx = ct.getContext();

  // Shaded sphere base.
  const grad = ctx.createRadialGradient(r * 0.62, r * 0.58, r * 0.15, r, r, r);
  if (fiery) {
    grad.addColorStop(0, '#fff2b0');
    grad.addColorStop(0.45, '#ff8a00');
    grad.addColorStop(1, '#c61b00');
  } else {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#ededed');
    grad.addColorStop(1, '#bcbcbc');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.fill();

  // Classic pentagon pattern (central + ring of five).
  const patch = fiery ? 'rgba(90,10,0,0.85)' : 'rgba(20,20,20,0.92)';
  ctx.fillStyle = patch;
  drawPentagon(ctx, r, r, r * 0.34, -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    const px = r + Math.cos(a) * r * 0.66;
    const py = r + Math.sin(a) * r * 0.66;
    drawPentagon(ctx, px, py, r * 0.22, a + Math.PI);
  }

  // Glossy highlight + rim.
  const hi = ctx.createRadialGradient(r * 0.6, r * 0.55, 0, r * 0.6, r * 0.55, r * 0.6);
  hi.addColorStop(0, 'rgba(255,255,255,0.55)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.stroke();

  ct.refresh();
}

function drawPentagon(ctx, cx, cy, size, rot) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot + (i / 5) * Math.PI * 2;
    const x = cx + Math.cos(a) * size;
    const y = cy + Math.sin(a) * size;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function fallbackBall(scene, key, r, fiery) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(fiery ? 0xff5522 : 0xffffff);
  g.fillCircle(r, r, r);
  g.lineStyle(2, 0x000000, 0.4);
  g.strokeCircle(r, r, r - 1);
  g.fillStyle(fiery ? 0x5a0a00 : 0x222222);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fillCircle(r + Math.cos(a) * r * 0.55, r + Math.sin(a) * r * 0.55, r * 0.18);
  }
  g.generateTexture(key, r * 2, r * 2);
  g.destroy();
}
