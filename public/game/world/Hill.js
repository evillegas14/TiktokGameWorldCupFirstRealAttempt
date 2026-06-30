// Triangular hill in the middle of the pitch with a horizontal slit at its base
// so balls and player avatars can pass underneath. The hill is a SINGLE SOLID
// body (not two thin walls) so nothing can tunnel inside and get stuck — balls
// and players either roll over its slopes or pass through the slit beneath it.
import { PITCH } from './Field.js';
import { GAME_WIDTH } from '../constants.js';

export function buildHill(scene) {
  const apexX = GAME_WIDTH / 2;
  const apexY = PITCH.bottom - 330;          // top of hill (smaller than before)
  const halfBase = 185;                       // narrower base (was 220)
  const baseY = PITCH.bottom - 60;            // base sits here, leaving a slit above the floor
  const leftBaseX = apexX - halfBase;
  const rightBaseX = apexX + halfBase;

  // --- Solid triangular physics body (convex → no decomposition needed) ---
  const corners = [
    { x: apexX, y: apexY },
    { x: rightBaseX, y: baseY },
    { x: leftBaseX, y: baseY },
  ];
  // Matter recenters the body on its centroid; for a triangle that's the vertex
  // average, so pass that as the position to line the body up with the visual.
  const cx = (apexX + rightBaseX + leftBaseX) / 3;
  const cy = (apexY + baseY + baseY) / 3;
  scene.matter.add.fromVertices(cx, cy, corners, {
    isStatic: true, friction: 0.05, restitution: 0.6, label: 'hill',
  });

  // Soft ground shadow under the mound, so it reads as grounded above the slit.
  scene.add.ellipse(apexX, baseY + 10, halfBase * 2.1, 34, 0x000000, 0.28).setDepth(0);

  // --- Photoreal-ish mound: grassy crown blending into earthy dirt ---
  drawHill(scene, apexX, apexY, leftBaseX, rightBaseX, baseY);

  // Top hopper / ball dropper (NOT a cannon) — balls fall from here onto the hill.
  const hopperY = PITCH.top + 60;
  const hop = scene.add.graphics().setDepth(8);
  hop.fillStyle(0x3a3f55, 1);
  hop.lineStyle(3, 0x9aa3c0, 1);
  // funnel body
  hop.fillTriangle(apexX - 70, hopperY - 40, apexX + 70, hopperY - 40, apexX, hopperY + 28);
  hop.strokeTriangle(apexX - 70, hopperY - 40, apexX + 70, hopperY - 40, apexX, hopperY + 28);
  // spout
  hop.fillStyle(0x2a2e40, 1);
  hop.fillRect(apexX - 14, hopperY + 22, 28, 26);
  hop.strokeRect(apexX - 14, hopperY + 22, 28, 26);
  scene.add.text(apexX, hopperY - 58, 'BALL DROP', {
    fontSize: '18px', fontFamily: 'Impact', color: '#cfd6f0',
  }).setOrigin(0.5).setDepth(8);

  const dropPoint = { x: apexX, y: hopperY + 60 };

  return {
    apex: { x: apexX, y: apexY },
    leftCannon: { x: leftBaseX + 46, y: baseY - 74 },
    rightCannon: { x: rightBaseX - 46, y: baseY - 74 },
    spawnPoint: dropPoint,
  };
}

// Render the mound to a canvas texture (gradient grass→dirt, ridge highlight,
// shaded right face) for a photo-like look; falls back to flat graphics.
function drawHill(scene, apexX, apexY, leftBaseX, rightBaseX, baseY) {
  const w = Math.ceil(rightBaseX - leftBaseX);
  const h = Math.ceil(baseY - apexY);
  const key = 'hill-tex';
  const ax = apexX - leftBaseX; // apex x within the canvas

  let ct = null;
  try {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    ct = scene.textures.createCanvas(key, w, h);
  } catch (e) { ct = null; }

  if (ct) {
    const ctx = ct.getContext();
    // Clip to the triangle so the gradient only fills the mound.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ax, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.clip();

    // Vertical gradient: bright grassy crown → mid grass → earthy dirt base.
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#5bbf4a');
    grad.addColorStop(0.22, '#3f9b34');
    grad.addColorStop(0.5, '#6b4a2a');
    grad.addColorStop(1.0, '#3c2a17');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Form shading: lit left face, shadowed right face (light from upper-left).
    const lit = ctx.createLinearGradient(0, 0, w, 0);
    lit.addColorStop(0, 'rgba(255,255,255,0.18)');
    lit.addColorStop(0.5, 'rgba(255,255,255,0)');
    lit.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = lit;
    ctx.fillRect(0, 0, w, h);

    // Dirt striations / sediment bands lower down.
    ctx.strokeStyle = 'rgba(40,26,14,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const y = h * (0.55 + i * 0.085);
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(i) * 4);
      ctx.lineTo(w, y - Math.cos(i) * 4);
      ctx.stroke();
    }

    // Grass crown: little blades fringing the top third.
    for (let i = 0; i < 90; i++) {
      const t = Math.random();
      const gx = ax + (Math.random() - 0.5) * (w * 0.7) * t;
      const gy = (h * 0.35) * t + 2;
      const len = 5 + Math.random() * 8;
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(120,210,90,0.8)' : 'rgba(70,150,50,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx, gy + len);
      ctx.lineTo(gx + (Math.random() - 0.5) * 5, gy);
      ctx.stroke();
    }

    // Speckle dirt grain for texture.
    for (let i = 0; i < 240; i++) {
      const px = Math.random() * w;
      const py = h * 0.5 + Math.random() * h * 0.5;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(180,140,90,0.18)';
      ctx.fillRect(px, py, 2, 2);
    }

    // Ridge highlight along the lit (left) slope.
    ctx.strokeStyle = 'rgba(200,255,180,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax, 1);
    ctx.lineTo(2, h - 1);
    ctx.stroke();

    ctx.restore();
    ct.refresh();

    scene.add.image(leftBaseX + w / 2, apexY + h / 2, key).setDepth(1);
    return;
  }

  // Fallback: flat shaded triangle.
  const g = scene.add.graphics().setDepth(1);
  g.fillStyle(0x6b4a2a, 1);
  g.fillTriangle(leftBaseX, baseY, apexX, apexY, rightBaseX, baseY);
  g.fillStyle(0x3f9b34, 1);
  g.fillTriangle(leftBaseX + 30, apexY + (baseY - apexY) * 0.45, apexX, apexY, rightBaseX - 30, apexY + (baseY - apexY) * 0.45);
  g.lineStyle(4, 0x2a1c0e, 1);
  g.strokeTriangle(leftBaseX, baseY, apexX, apexY, rightBaseX, baseY);
}
