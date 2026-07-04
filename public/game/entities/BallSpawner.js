import { Ball, DEFAULT_HEALTH_MS } from './Ball.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';

export class BallSpawner {
  constructor(scene, opts) {
    this.scene = scene;
    this.spawnPoint = opts.spawnPoint;
    this.maxBalls = opts.maxBalls || 30;
    this.ballHealthMs = opts.ballHealthMs || DEFAULT_HEALTH_MS;
    this.minBalls = 2;
    this.balls = new Set();
    this.nextSpinSign = 1;
    // Stored handler so we can detach on match teardown (scene.events persists
    // across scene restarts, so an un-removed listener would leak each match).
    this._onDespawn = (ball) => {
      this.balls.delete(ball);
      this.#ensureMinimum();
    };
    scene.events.on('ball:despawn', this._onDespawn);
  }

  destroy() {
    this.scene.events.off('ball:despawn', this._onDespawn);
  }

  #ensureMinimum() {
    if (this.balls.size < this.minBalls) {
      this.spawnPair();
    }
  }

  spawnPair(extraOpts = {}) {
    if (this.balls.size >= this.maxBalls - 1) return;
    const { x, y } = this.spawnPoint;
    const a = new Ball(this.scene, x - 18, y, {
      health: this.ballHealthMs,
      ...extraOpts,
      angularVelocity: 0.4 * this.nextSpinSign,
      velocity: { x: -0.2, y: 0 },
    });
    const b = new Ball(this.scene, x + 18, y, {
      health: this.ballHealthMs,
      ...extraOpts,
      angularVelocity: -0.4 * this.nextSpinSign,
      velocity: { x: 0.2, y: 0 },
    });
    this.balls.add(a);
    this.balls.add(b);
    this.nextSpinSign *= -1;
  }

  spawnDrop(count, side) {
    // side: 'left' or 'right' — drop balls over the opponent's half so the gift feels offensive.
    const half = side === 'left' ? 480 : 1440;
    for (let i = 0; i < count; i++) {
      if (this.balls.size >= this.maxBalls) break;
      const x = half + (Math.random() - 0.5) * 600;
      const y = 200 + Math.random() * 100;
      const ball = new Ball(this.scene, x, y, {
        kind: 'drop',
        health: this.ballHealthMs,
        angularVelocity: (i % 2 === 0 ? 1 : -1) * (0.3 + Math.random() * 0.4),
        velocity: { x: (Math.random() - 0.5) * 4, y: 1 + Math.random() },
      });
      this.balls.add(ball);
    }
  }

  spawnSuperBall(targetX, targetY, fromX = null) {
    if (this.balls.size >= this.maxBalls) return null;
    const startX = fromX != null ? fromX : this.spawnPoint.x;
    const startY = this.spawnPoint.y - 20;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 14;
    const ball = new Ball(this.scene, startX, startY, {
      kind: 'super',
      angularVelocity: 0.8,
      velocity: { x: (dx / len) * speed, y: (dy / len) * speed },
    });
    this.balls.add(ball);
    return ball;
  }

  fireCannon(fromX, fromY, targetX, targetY) {
    if (this.balls.size >= this.maxBalls) return null;
    const dx = targetX - fromX;
    const dy = targetY - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 20; // enough to arc over the volcano and reach the far goal
    const jitter = (Math.random() - 0.5) * 0.15;
    const ball = new Ball(this.scene, fromX, fromY, {
      kind: 'cannon',
      angularVelocity: jitter * 10,
      velocity: { x: (dx / len) * speed, y: (dy / len) * speed + jitter },
      health: 60_000,
    });
    this.balls.add(ball);
    return ball;
  }

  respawnAtHill(ball) {
    const { x, y } = this.spawnPoint;
    const sign = this.nextSpinSign;
    this.nextSpinSign *= -1;
    ball.respawn(x, y - 30, 0.5 * sign);
  }

  // A ball that tunneled through a wall at high speed (eruption/cannon) and flew off
  // the pitch. It's still counted as "alive", so without this the field could look
  // empty. Generous margin so normal high bounces near the edges don't trigger it.
  #outOfBounds(ball) {
    return ball.x < -80 || ball.x > GAME_WIDTH + 80
      || ball.y < -160 || ball.y > GAME_HEIGHT + 160;
  }

  update(time, delta) {
    for (const ball of this.balls) {
      ball.update(time, delta);
      // Rescue escaped balls back onto the hill instead of losing them off-map.
      if (!ball.destroyed && this.#outOfBounds(ball)) this.respawnAtHill(ball);
    }
    // Belt-and-suspenders: guarantee there are always at least two balls in play.
    if (this.balls.size < this.minBalls) this.spawnPair();
  }

  ensureStarted() {
    if (this.balls.size === 0) {
      this.spawnPair();
    }
  }
}
