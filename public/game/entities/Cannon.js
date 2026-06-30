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

    // Magma rock base the vent sits on.
    this.wheel = scene.add.image(pos.x, pos.y + 12, 'cannon-wheel').setDepth(8);

    // Barrel as a container so it rotates + recoils as one piece, aimed at the goal.
    this.barrel = scene.add.container(pos.x, pos.y).setDepth(9);
    this.barrel.rotation = this.angle;
    const tube = scene.add.image(0, 0, 'cannon-tube').setOrigin(0.2, 0.5);
    // Team-colored band near the breech to identify the side.
    const band = scene.add.rectangle(10, 0, 8, 30, color).setStrokeStyle(2, 0x000000);
    // Molten ball glowing in the muzzle.
    this.loaded = scene.add.circle(60, 0, 11, 0xffcf6a).setStrokeStyle(2, 0x5a2a00);
    this.barrel.add([tube, band, this.loaded]);

    this.muzzleTip = { x: pos.x + Math.cos(this.angle) * 64, y: pos.y + Math.sin(this.angle) * 64 };

    // Ambient heat glow at the vent mouth so it always looks hot.
    if (scene.textures.exists('fx-glow')) {
      this.ventGlow = scene.add.image(this.muzzleTip.x, this.muzzleTip.y, 'fx-glow')
        .setDepth(10).setScale(0.32).setTint(0xff7a18).setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: this.ventGlow, alpha: { from: 0.3, to: 0.6 }, scale: { from: 0.3, to: 0.44 },
        duration: 720, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    }
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
        targets: this.wheel, scaleX: { from: 1.18, to: 1 }, scaleY: { from: 0.84, to: 1 },
        duration: 240, ease: 'Quad.out',
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

// One-time canvas textures for the volcanic lava-vent barrel + magma rock base.
function ensureCannonTextures(scene) {
  // --- Barrel: basalt rock vent with glowing lava cracks + a hot bore ---
  if (!scene.textures.exists('cannon-tube')) {
    const W = 84, H = 32;
    let ct = null;
    try { ct = scene.textures.createCanvas('cannon-tube', W, H); } catch (e) { ct = null; }
    if (ct) {
      const c = ct.getContext();
      const r = 10;
      // Dark basalt cylinder (top-lit rock gradient).
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0.0, '#3c342d');
      g.addColorStop(0.38, '#262019');
      g.addColorStop(0.6, '#1a1410');
      g.addColorStop(1.0, '#0b0805');
      c.fillStyle = g;
      roundRect(c, 1, 1, W - 2, H - 2, r);
      c.fill();
      // Faint top sheen on the rock.
      c.fillStyle = 'rgba(255,228,200,0.10)';
      c.fillRect(8, H * 0.3, W - 22, 3);
      // Glowing lava cracks snaking along the barrel.
      c.save();
      c.lineCap = 'round';
      c.shadowColor = 'rgba(255,90,0,0.9)';
      const cracks = [
        [[10, 21], [28, 14], [50, 22], [70, 15]],
        [[12, 25], [33, 27], [56, 23], [76, 26]],
      ];
      for (const pts of cracks) {
        c.shadowBlur = 8;
        c.strokeStyle = 'rgba(255,85,0,0.85)';
        c.lineWidth = 3.2;
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
        c.stroke();
        c.shadowBlur = 4;
        c.strokeStyle = 'rgba(255,212,110,0.95)';
        c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
        c.stroke();
      }
      c.restore();
      // Rocky speckle.
      for (let i = 0; i < 42; i++) {
        c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.32)' : 'rgba(185,165,140,0.12)';
        c.fillRect(3 + Math.random() * (W - 8), 3 + Math.random() * (H - 7), 2, 2);
      }
      // Hot molten bore at the muzzle.
      c.save();
      c.shadowColor = 'rgba(255,120,20,0.9)';
      c.shadowBlur = 10;
      const bore = c.createRadialGradient(W - 9, H / 2, 1, W - 9, H / 2, 12);
      bore.addColorStop(0, 'rgba(255,242,185,0.98)');
      bore.addColorStop(0.5, 'rgba(255,130,20,0.85)');
      bore.addColorStop(1, 'rgba(255,80,0,0)');
      c.fillStyle = bore;
      c.beginPath(); c.ellipse(W - 9, H / 2, 9, H / 2 - 3, 0, 0, Math.PI * 2); c.fill();
      c.restore();
      // Dark stone muzzle rim.
      c.strokeStyle = 'rgba(18,12,8,0.9)';
      c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(W - 9, H / 2, 8, H / 2 - 3, 0, 0, Math.PI * 2); c.stroke();
      // Outline.
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = 2;
      roundRect(c, 1, 1, W - 2, H - 2, r);
      c.stroke();
      ct.refresh();
    } else {
      const gg = scene.make.graphics({ x: 0, y: 0, add: false });
      gg.fillStyle(0x231c16, 1); gg.fillRoundedRect(0, 0, 84, 32, 8);
      gg.generateTexture('cannon-tube', 84, 32); gg.destroy();
    }
  }

  // --- Base: craggy magma boulder with glowing cracks ---
  if (!scene.textures.exists('cannon-wheel')) {
    const S = 46;
    let ct = null;
    try { ct = scene.textures.createCanvas('cannon-wheel', S, S); } catch (e) { ct = null; }
    if (ct) {
      const c = ct.getContext();
      const cx = S / 2, cy = S / 2;
      // Rounded rock boulder.
      const rg = c.createRadialGradient(cx - 5, cy - 5, 4, cx, cy, S / 2);
      rg.addColorStop(0, '#4a4038');
      rg.addColorStop(0.6, '#241d18');
      rg.addColorStop(1, '#0b0805');
      c.fillStyle = rg;
      c.beginPath(); c.arc(cx, cy, S / 2 - 1, 0, Math.PI * 2); c.fill();
      // Glowing lava cracks radiating from a hot core.
      c.save();
      c.lineCap = 'round';
      c.shadowColor = 'rgba(255,90,0,0.9)';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.5;
        const ex = cx + Math.cos(a) * (S / 2 - 4);
        const ey = cy + Math.sin(a) * (S / 2 - 4);
        c.shadowBlur = 7;
        c.strokeStyle = 'rgba(255,85,0,0.8)';
        c.lineWidth = 2.6;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
        c.shadowBlur = 3;
        c.strokeStyle = 'rgba(255,212,110,0.95)';
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
      }
      // Hot core.
      const core = c.createRadialGradient(cx, cy, 1, cx, cy, 9);
      core.addColorStop(0, 'rgba(255,232,150,0.95)');
      core.addColorStop(1, 'rgba(255,90,0,0)');
      c.fillStyle = core;
      c.beginPath(); c.arc(cx, cy, 9, 0, Math.PI * 2); c.fill();
      c.restore();
      // Speckle + rim.
      for (let i = 0; i < 28; i++) {
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(4 + Math.random() * (S - 8), 4 + Math.random() * (S - 8), 2, 2);
      }
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, S / 2 - 1, 0, Math.PI * 2); c.stroke();
      ct.refresh();
    } else {
      const gg = scene.make.graphics({ x: 0, y: 0, add: false });
      gg.fillStyle(0x241d18, 1); gg.fillCircle(23, 23, 22);
      gg.fillStyle(0xff7a18, 1); gg.fillCircle(23, 23, 6);
      gg.generateTexture('cannon-wheel', 46, 46); gg.destroy();
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
