// Artillery cannon mounted on the volcano. The barrel + wheel are drawn to canvas
// textures (metallic cylinder sheen, rivets, reinforcing bands, spoked wheel)
// for a photo-like look, and firing kicks off a layered muzzle blast.
export class Cannon {
  constructor(scene, team, pos, teamColor) {
    this.scene = scene;
    this.team = team;
    this.pos = pos;
    const color = Phaser.Display.Color.HexStringToColor(teamColor).color;
    ensureCannonTextures(scene);

    // Point clearly up-and-across toward the opponent goal (lobbing artillery),
    // so the barrel visibly aims at the far net rather than lying flat.
    const elevation = Phaser.Math.DegToRad(34);
    this.angle = team === 1 ? -elevation : Math.PI + elevation; // team1 fires right, team2 fires left
    // Aim point far along the barrel line; the shot arcs over the volcano to the far half.
    this.aim = {
      x: pos.x + Math.cos(this.angle) * 1600,
      y: pos.y + Math.sin(this.angle) * 1600,
    };

    // Carriage wheel (metallic, spoked).
    this.wheel = scene.add.image(pos.x, pos.y + 12, 'cannon-wheel').setDepth(8);

    // Barrel as a container so it rotates + recoils as one piece, aimed at the goal.
    this.barrel = scene.add.container(pos.x, pos.y).setDepth(9);
    this.barrel.rotation = this.angle;
    const tube = scene.add.image(0, 0, 'cannon-tube').setOrigin(0.2, 0.5);
    // Team-colored band near the breech to identify the side.
    const band = scene.add.rectangle(10, 0, 8, 30, color).setStrokeStyle(2, 0x000000);
    // Loaded ball peeking from the muzzle.
    this.loaded = scene.add.circle(60, 0, 11, 0xffffff).setStrokeStyle(2, 0x222222);
    this.barrel.add([tube, band, this.loaded]);

    this.muzzleTip = { x: pos.x + Math.cos(this.angle) * 64, y: pos.y + Math.sin(this.angle) * 64 };
  }

  fire(ballSpawner) {
    const deg = Phaser.Math.RadToDeg(this.angle);

    // Charge glow building at the muzzle.
    if (this.scene.textures.exists('fx-glow')) {
      const charge = this.scene.add.image(this.muzzleTip.x, this.muzzleTip.y, 'fx-glow')
        .setDepth(38).setScale(0.2).setTint(0xffaa00).setAlpha(0.9);
      this.scene.tweens.add({ targets: charge, scale: 1.0, duration: 160, onComplete: () => charge.destroy() });
    }
    this.loaded.setVisible(true);
    this.scene.tweens.add({ targets: this.loaded, scale: { from: 1.3, to: 1 }, duration: 160 });

    // After a short charge, launch + blast.
    this.scene.time.delayedCall(160, () => {
      const ball = ballSpawner.fireCannon(this.muzzleTip.x, this.muzzleTip.y, this.aim.x, this.aim.y);
      this.#blast(deg);
      // Recoil along the barrel axis.
      const back = { x: -Math.cos(this.angle) * 12, y: -Math.sin(this.angle) * 12 };
      this.scene.tweens.add({
        targets: this.barrel, x: this.pos.x + back.x, y: this.pos.y + back.y,
        duration: 70, yoyo: true, ease: 'Quad.out',
      });
      this.scene.tweens.add({
        targets: this.wheel, angle: this.wheel.angle + (this.team === 1 ? -40 : 40),
        duration: 220, ease: 'Quad.out',
      });
      this.loaded.setScale(0.2);
      this.scene.tweens.add({ targets: this.loaded, scale: 1, duration: 400 });
    });

    return true;
  }

  #blast(deg) {
    const { x, y } = this.muzzleTip;
    const rad = Phaser.Math.DegToRad(deg);

    // Soft radial fireball glow (photo-like bloom).
    if (this.scene.textures.exists('fx-glow')) {
      const bloom = this.scene.add.image(x, y, 'fx-glow').setDepth(40).setScale(0.3).setTint(0xff8a00).setAlpha(1);
      this.scene.tweens.add({
        targets: bloom, scale: { from: 0.4, to: 1.6 }, alpha: { from: 1, to: 0 },
        duration: 320, ease: 'Quad.out', onComplete: () => bloom.destroy(),
      });
    }

    // Bright muzzle flash core.
    const flash = this.scene.add.circle(x, y, 30, 0xfff2a0, 0.95).setDepth(41);
    this.scene.tweens.add({
      targets: flash, scale: { from: 0.4, to: 2.2 }, alpha: { from: 1, to: 0 },
      duration: 240, onComplete: () => flash.destroy(),
    });

    // Light-beam cone projecting out of the barrel for a split second.
    const beam = this.scene.add.triangle(
      x, y,
      0, 0,
      Math.cos(rad - 0.18) * 140, Math.sin(rad - 0.18) * 140,
      Math.cos(rad + 0.18) * 140, Math.sin(rad + 0.18) * 140,
      0xffdd88, 0.45,
    ).setDepth(39);
    this.scene.tweens.add({ targets: beam, alpha: 0, scaleX: 1.3, scaleY: 1.3, duration: 220, onComplete: () => beam.destroy() });

    if (this.scene.textures.exists('fx-dot')) {
      // Fire cone.
      const fire = this.scene.add.particles(x, y, 'fx-dot', {
        speed: { min: 160, max: 480 }, angle: { min: deg - 24, max: deg + 24 },
        lifespan: 520, scale: { start: 3.0, end: 0 }, alpha: { start: 1, end: 0 },
        tint: [0xffffaa, 0xffff66, 0xff8800, 0xff2200], gravityY: 140, emitting: false,
      });
      fire.setDepth(42);
      fire.explode(28, x, y);
      this.scene.time.delayedCall(800, () => fire.destroy());

      // Sparks shooting further.
      const sparks = this.scene.add.particles(x, y, 'fx-dot', {
        speed: { min: 320, max: 760 }, angle: { min: deg - 32, max: deg + 32 },
        lifespan: 560, scale: { start: 1.4, end: 0 }, tint: [0xffffff, 0xffe066],
        gravityY: 420, emitting: false,
      });
      sparks.setDepth(43);
      sparks.explode(18, x, y);
      this.scene.time.delayedCall(800, () => sparks.destroy());
    }

    // Billowing smoke ring puffs (soft glow tinted gray reads as photo smoke).
    for (let i = 0; i < 8; i++) {
      const ang = rad + (Math.random() - 0.5) * 1.2;
      const useGlow = this.scene.textures.exists('fx-glow');
      const s = useGlow
        ? this.scene.add.image(x, y, 'fx-glow').setScale(0.18).setTint(0x8a8a8a).setAlpha(0.55).setDepth(39)
        : this.scene.add.circle(x, y, 9 + Math.random() * 7, 0x999999, 0.5).setDepth(39);
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(ang) * (50 + Math.random() * 60),
        y: y + Math.sin(ang) * (50 + Math.random() * 60) - 18,
        scale: { from: useGlow ? 0.18 : 0.6, to: useGlow ? 0.7 : 2.4 }, alpha: { from: 0.5, to: 0 },
        duration: 700 + Math.random() * 250, onComplete: () => s.destroy(),
      });
    }
  }
}

// One-time canvas textures for the metallic barrel + spoked wheel.
function ensureCannonTextures(scene) {
  // --- Barrel: horizontal steel cylinder ---
  if (!scene.textures.exists('cannon-tube')) {
    const W = 84, H = 32;
    let ct = null;
    try { ct = scene.textures.createCanvas('cannon-tube', W, H); } catch (e) { ct = null; }
    if (ct) {
      const c = ct.getContext();
      // Cylindrical sheen (top dark → bright band → bottom dark).
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0.0, '#15181f');
      g.addColorStop(0.28, '#5b6473');
      g.addColorStop(0.45, '#aab3c2');
      g.addColorStop(0.62, '#646d7d');
      g.addColorStop(1.0, '#0f1218');
      // Rounded tube body.
      const r = 9;
      c.fillStyle = g;
      roundRect(c, 1, 1, W - 2, H - 2, r);
      c.fill();
      // Length sheen highlight.
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(6, H * 0.34, W - 14, 3);
      // Reinforcing bands.
      c.fillStyle = '#2b313c';
      for (const bx of [W * 0.16, W * 0.44]) {
        c.fillRect(bx, 1, 6, H - 2);
        // rivets on the band
        c.fillStyle = '#c9d2e0';
        c.fillRect(bx + 2, 6, 2, 2);
        c.fillRect(bx + 2, H - 8, 2, 2);
        c.fillStyle = '#2b313c';
      }
      // Muzzle ring + dark bore at the right end.
      c.fillStyle = '#1a1d24';
      c.beginPath();
      c.ellipse(W - 7, H / 2, 6, H / 2 - 2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#050608';
      c.beginPath();
      c.ellipse(W - 7, H / 2, 3.4, H / 2 - 7, 0, 0, Math.PI * 2);
      c.fill();
      // Outline.
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = 2;
      roundRect(c, 1, 1, W - 2, H - 2, r);
      c.stroke();
      ct.refresh();
    } else {
      const gg = scene.make.graphics({ x: 0, y: 0, add: false });
      gg.fillStyle(0x3a3f4a, 1); gg.fillRoundedRect(0, 0, 84, 32, 8);
      gg.generateTexture('cannon-tube', 84, 32); gg.destroy();
    }
  }

  // --- Wheel: spoked carriage wheel ---
  if (!scene.textures.exists('cannon-wheel')) {
    const S = 44;
    let ct = null;
    try { ct = scene.textures.createCanvas('cannon-wheel', S, S); } catch (e) { ct = null; }
    if (ct) {
      const c = ct.getContext();
      const cx = S / 2, cy = S / 2;
      // Tyre rim with metallic ring gradient.
      const rg = c.createRadialGradient(cx - 4, cy - 4, 4, cx, cy, S / 2);
      rg.addColorStop(0, '#4a4f5a');
      rg.addColorStop(0.7, '#23262e');
      rg.addColorStop(1, '#0c0e12');
      c.fillStyle = rg;
      c.beginPath(); c.arc(cx, cy, S / 2 - 1, 0, Math.PI * 2); c.fill();
      // Inner cut-out.
      c.fillStyle = '#161922';
      c.beginPath(); c.arc(cx, cy, S / 2 - 6, 0, Math.PI * 2); c.fill();
      // Spokes.
      c.strokeStyle = '#6b7280';
      c.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(a) * (S / 2 - 6), cy + Math.sin(a) * (S / 2 - 6));
        c.stroke();
      }
      // Hub.
      c.fillStyle = '#9aa3b2';
      c.beginPath(); c.arc(cx, cy, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3a3f4a';
      c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill();
      ct.refresh();
    } else {
      const gg = scene.make.graphics({ x: 0, y: 0, add: false });
      gg.fillStyle(0x2a2a2a, 1); gg.fillCircle(22, 22, 21);
      gg.fillStyle(0x777777, 1); gg.fillCircle(22, 22, 6);
      gg.generateTexture('cannon-wheel', 44, 44); gg.destroy();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
