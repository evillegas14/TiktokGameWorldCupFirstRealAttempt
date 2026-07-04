// Procedural 2D stadium background, themed by the two playing teams.
// Drawn once into a texture and added as a single image for cheap rendering.
import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';

const KEY = 'stadium-bg';

export function createBackground(scene, teamAColor = '#ffffff', teamBColor = '#ffffff') {
  if (scene.textures.exists(KEY)) scene.textures.remove(KEY);

  const W = GAME_WIDTH;
  const H = GAME_HEIGHT;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });

  // --- Sky / arena gradient (top dark navy -> deep teal near pitch) ---
  g.fillGradientStyle(0x0a1130, 0x0a1130, 0x103a2e, 0x103a2e, 1);
  g.fillRect(0, 0, W, H);

  // --- Far grandstand band across the top ---
  const standTop = 40;
  const standBot = 250;
  g.fillStyle(0x161b2e, 1);
  g.fillRect(0, standTop, W, standBot - standTop);
  // tier dividers
  g.fillStyle(0x0d1120, 1);
  for (let y = standTop + 50; y < standBot; y += 55) g.fillRect(0, y, W, 6);
  // Corduroy seat-row shading + vertical aisle columns so the stand reads as
  // rows of seats rather than a flat band (crowd specks are drawn on top).
  for (let y = standTop + 4; y < standBot; y += 9) { g.fillStyle(0x000000, 0.10); g.fillRect(0, y, W, 3); }
  g.fillStyle(0x0b0f1c, 0.8);
  for (let x = 0; x < W; x += 150) g.fillRect(x, standTop, 3, standBot - standTop);

  // --- Crowd specks (team colors + white) ---
  const aColor = Phaser.Display.Color.HexStringToColor(teamAColor).color;
  const bColor = Phaser.Display.Color.HexStringToColor(teamBColor).color;
  const palette = [aColor, bColor, 0xffffff, 0xdddddd, aColor, bColor];
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * W;
    const y = standTop + 8 + Math.random() * (standBot - standTop - 16);
    // left half leans team A, right half leans team B
    let color;
    if (x < W * 0.45) color = Math.random() < 0.6 ? aColor : (Math.random() < 0.5 ? 0xffffff : bColor);
    else if (x > W * 0.55) color = Math.random() < 0.6 ? bColor : (Math.random() < 0.5 ? 0xffffff : aColor);
    else color = palette[(Math.random() * palette.length) | 0];
    g.fillStyle(color, 0.9);
    g.fillRect(x, y, 5, 5);
  }

  // --- Floodlight poles + glows in the corners ---
  const drawLight = (x) => {
    g.fillStyle(0x222838, 1);
    g.fillRect(x - 4, 0, 8, 120);            // pole
    g.fillStyle(0x33405c, 1);
    g.fillRect(x - 60, 0, 120, 26);          // lamp bar
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0xfff6cc, 1);
      g.fillCircle(x - 42 + i * 28, 13, 8);  // bulbs
    }
    // soft glow cone
    g.fillStyle(0xfff6cc, 0.06);
    g.fillTriangle(x, 26, x - 320, 360, x + 320, 360);
  };
  drawLight(W * 0.18);
  drawLight(W * 0.82);

  // --- Soft radial glow behind the pitch center ---
  g.fillStyle(0x2bd06a, 0.10);
  g.fillCircle(W / 2, H * 0.62, 520);
  g.fillStyle(0x2bd06a, 0.06);
  g.fillCircle(W / 2, H * 0.62, 720);

  // Bright front railing along the stand lip.
  g.fillStyle(0x5b6785, 0.9); g.fillRect(0, standBot - 4, W, 4);
  g.fillStyle(0x8894b0, 0.5); g.fillRect(0, standBot - 4, W, 1);
  // Faint sky grain / distant lights for atmosphere in the visible upper band.
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * W;
    const y = Math.random() * 300;
    g.fillStyle(Math.random() < 0.5 ? 0x1a2340 : 0x243357, 0.5);
    g.fillRect(x, y, 2, 2);
  }

  g.generateTexture(KEY, W, H);
  g.destroy();

  const img = scene.add.image(W / 2, H / 2, KEY);
  img.setDepth(-100);

  ensureFxTextures(scene);
  return img;
}

// Small reusable textures for the animated layers + confetti.
function ensureFxTextures(scene) {
  if (!scene.textures.exists('fx-dot')) {
    const d = scene.make.graphics({ x: 0, y: 0, add: false });
    d.fillStyle(0xffffff, 1); d.fillCircle(4, 4, 4);
    d.generateTexture('fx-dot', 8, 8); d.destroy();
  }
  if (!scene.textures.exists('fx-glow')) {
    const gl = scene.make.graphics({ x: 0, y: 0, add: false });
    for (let r = 120; r > 0; r -= 8) { gl.fillStyle(0xfff6cc, 0.05); gl.fillCircle(120, 120, r); }
    gl.generateTexture('fx-glow', 240, 240); gl.destroy();
  }
  if (!scene.textures.exists('confetti')) {
    const c = scene.make.graphics({ x: 0, y: 0, add: false });
    c.fillStyle(0xffffff, 1); c.fillRect(0, 0, 10, 14);
    c.generateTexture('confetti', 10, 14); c.destroy();
  }
}

// Live animated layer: twinkling crowd, pulsing floodlights, and a confetti
// burst function for goals. Returns { confettiBurst, destroy }.
export function createBackgroundFX(scene, teamAColor = '#ffffff', teamBColor = '#ffffff') {
  ensureFxTextures(scene);
  const W = GAME_WIDTH;
  const aColor = Phaser.Display.Color.HexStringToColor(teamAColor).color;
  const bColor = Phaser.Display.Color.HexStringToColor(teamBColor).color;

  const created = [];

  // Twinkling crowd highlights.
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * W;
    const y = 50 + Math.random() * 190;
    const tint = x < W / 2
      ? (Math.random() < 0.5 ? aColor : 0xffffff)
      : (Math.random() < 0.5 ? bColor : 0xffffff);
    const dot = scene.add.image(x, y, 'fx-dot').setTint(tint).setDepth(-90).setAlpha(0.2);
    scene.tweens.add({
      targets: dot,
      alpha: { from: 0.15, to: 0.95 },
      duration: 400 + Math.random() * 1200,
      yoyo: true, repeat: -1, delay: Math.random() * 1500,
    });
    created.push(dot);
  }

  // Pulsing floodlight glows.
  for (const lx of [W * 0.18, W * 0.82]) {
    const glow = scene.add.image(lx, 40, 'fx-glow').setDepth(-95).setScale(2).setAlpha(0.12);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.08, to: 0.22 },
      scale: { from: 1.8, to: 2.2 },
      duration: 1800, yoyo: true, repeat: -1,
    });
    created.push(glow);
  }

  // Confetti emitter (idle until a goal triggers a burst).
  const emitter = scene.add.particles(0, 0, 'confetti', {
    speed: { min: 200, max: 520 },
    angle: { min: 200, max: 340 },
    gravityY: 700,
    lifespan: 1600,
    scale: { min: 0.6, max: 1.2 },
    rotate: { min: 0, max: 360 },
    tint: [aColor, bColor, 0xffffff, 0xffce00],
    emitting: false,
  });
  emitter.setDepth(50);
  created.push(emitter);

  return {
    confettiBurst(x, y, count = 60) {
      emitter.emitParticleAt(x, y, count);
    },
    destroy() {
      for (const o of created) o.destroy();
    },
  };
}
