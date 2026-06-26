export const BALL_RADIUS = 22;
export const SUPER_RADIUS = 32;
export const DEFAULT_HEALTH_MS = 240_000;

export class Ball {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.kind = opts.kind || 'regular';
    this.team = opts.team || null;
    const radius = this.kind === 'super' ? SUPER_RADIUS : BALL_RADIUS;
    this.radius = radius;
    this.health = opts.health != null ? opts.health : DEFAULT_HEALTH_MS;
    this.scoredCount = 0;

    const texKey = this.#textureKey();
    this.image = scene.matter.add.image(x, y, texKey, undefined, {
      shape: { type: 'circle', radius },
      restitution: 0.85,
      friction: 0.02,
      frictionAir: 0.005,
      density: 0.0015,
      label: 'ball',
    });
    this.image.setCircle(radius);
    this.image.ballRef = this;

    if (opts.angularVelocity != null) {
      this.image.setAngularVelocity(opts.angularVelocity);
    }
    if (opts.velocity) {
      this.image.setVelocity(opts.velocity.x, opts.velocity.y);
    }
    if (this.kind === 'super') {
      this.image.setTint(0xff3355);
    }
  }

  #textureKey() {
    if (this.kind === 'super') return 'ball-super';
    return 'ball';
  }

  update(_time, delta) {
    this.health -= delta;
    if (this.health <= 0) {
      this.destroy();
      return;
    }
    // Keep spin alive — Matter friction will dampen it otherwise.
    const av = this.image.body.angularVelocity;
    if (Math.abs(av) < 0.05) {
      this.image.setAngularVelocity(av >= 0 ? 0.1 : -0.1);
    }
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
    this.image.destroy();
    this.scene.events.emit('ball:despawn', this);
  }

  get x() { return this.image.x; }
  get y() { return this.image.y; }
  get vx() { return this.image.body.velocity.x; }
  get vy() { return this.image.body.velocity.y; }
}

export function createBallTextures(scene) {
  const make = (key, r, fill, accent) => {
    const d = r * 2;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(fill);
    g.fillCircle(r, r, r);
    g.lineStyle(2, 0x000000, 0.4);
    g.strokeCircle(r, r, r - 1);
    // pentagon-ish accents so spin is visible
    g.fillStyle(accent);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.fillCircle(r + Math.cos(a) * r * 0.55, r + Math.sin(a) * r * 0.55, r * 0.18);
    }
    g.generateTexture(key, d, d);
    g.destroy();
  };
  make('ball', BALL_RADIUS, 0xffffff, 0x222222);
  make('ball-super', SUPER_RADIUS, 0xffffff, 0xff0000);
}
