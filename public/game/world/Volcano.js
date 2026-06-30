// Volcano in the middle of the pitch (replaces the old triangular hill). A SINGLE
// SOLID trapezoidal body (wide base, flat crater rim) so nothing tunnels inside and
// gets stuck — balls and players roll over its slopes or pass through the slit above
// the bowl floor at its base. The crater glows and periodically ERUPTS (the eruption
// itself is orchestrated by MatchScene, which has the live ball list + camera + sfx).
import { PITCH } from './Field.js';
import { GAME_WIDTH } from '../constants.js';

export function buildVolcano(scene) {
  const apexX = GAME_WIDTH / 2;
  const topY = PITCH.bottom - 320;   // crater rim height
  const baseY = PITCH.bottom - 60;   // base sits here, leaving a slit above the floor
  const halfTop = 70;                // narrow flat crater rim
  const halfBase = 195;              // wide base
  const leftBaseX = apexX - halfBase;
  const rightBaseX = apexX + halfBase;
  const leftTopX = apexX - halfTop;
  const rightTopX = apexX + halfTop;

  // --- Solid trapezoidal physics body (convex → no decomposition needed) ---
  // Clockwise: top-left, top-right, bottom-right, bottom-left.
  const corners = [
    { x: leftTopX, y: topY },
    { x: rightTopX, y: topY },
    { x: rightBaseX, y: baseY },
    { x: leftBaseX, y: baseY },
  ];
  // fromVertices repositions the body so its CENTROID lands at (x, y). For a
  // trapezoid the area centroid is NOT the vertex average, so compute it properly,
  // otherwise the physics body sits offset from the drawn cone.
  const c = polyCentroid(corners);
  scene.matter.add.fromVertices(c.x, c.y, corners, {
    isStatic: true, friction: 0.06, restitution: 0.55, label: 'volcano',
  });

  // Soft ground shadow under the base, so it reads as grounded above the slit.
  scene.add.ellipse(apexX, baseY + 10, halfBase * 2.1, 36, 0x000000, 0.3).setDepth(0);

  // --- Photoreal-ish basalt cone with lava streaks + glowing crater ---
  const craterY = topY + 14;
  drawVolcano(scene, { apexX, topY, baseY, leftBaseX, rightBaseX, leftTopX, rightTopX });

  // Ambient crater glow (pulsing) + a lazy smoke plume so it always looks "alive".
  // Self-contained tweens here; eruption surges in MatchScene use throwaway glows so
  // nothing fights these.
  if (scene.textures.exists('fx-glow')) {
    const glow = scene.add.image(apexX, craterY, 'fx-glow')
      .setTint(0xff5a18).setScale(1.15).setAlpha(0.55).setDepth(2);
    scene.tweens.add({
      targets: glow, alpha: { from: 0.4, to: 0.72 }, scale: { from: 1.0, to: 1.3 },
      duration: 850, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
    // Small inner-mouth hot core.
    const core = scene.add.image(apexX, craterY + 2, 'fx-glow')
      .setTint(0xffd24a).setScale(0.5).setAlpha(0.6).setDepth(2);
    scene.tweens.add({
      targets: core, alpha: { from: 0.45, to: 0.8 }, scale: { from: 0.42, to: 0.6 },
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
    // Lazy rising smoke.
    const smoke = scene.add.particles(apexX, craterY - 6, 'fx-glow', {
      frequency: 700, lifespan: 2600,
      speedY: { min: -42, max: -18 }, speedX: { min: -14, max: 14 },
      scale: { start: 0.16, end: 0.52 }, alpha: { start: 0.3, end: 0 },
      tint: 0x8a8a8a,
    });
    smoke.setDepth(2);
  }

  // Top hopper / ball dropper (NOT a cannon) — balls fall from here into the crater.
  const hopperY = PITCH.top + 60;
  const hop = scene.add.graphics().setDepth(8);
  hop.fillStyle(0x3a3f55, 1);
  hop.lineStyle(3, 0x9aa3c0, 1);
  hop.fillTriangle(apexX - 70, hopperY - 40, apexX + 70, hopperY - 40, apexX, hopperY + 28);
  hop.strokeTriangle(apexX - 70, hopperY - 40, apexX + 70, hopperY - 40, apexX, hopperY + 28);
  hop.fillStyle(0x2a2e40, 1);
  hop.fillRect(apexX - 14, hopperY + 22, 28, 26);
  hop.strokeRect(apexX - 14, hopperY + 22, 28, 26);
  scene.add.text(apexX, hopperY - 58, 'BALL DROP', {
    fontSize: '18px', fontFamily: 'Impact', color: '#cfd6f0',
  }).setOrigin(0.5).setDepth(8);

  const dropPoint = { x: apexX, y: hopperY + 60 };

  return {
    apex: { x: apexX, y: topY },
    crater: { x: apexX, y: craterY },
    leftCannon: { x: leftBaseX + 46, y: baseY - 74 },
    rightCannon: { x: rightBaseX - 46, y: baseY - 74 },
    spawnPoint: dropPoint,
  };
}

// Area centroid of a simple polygon (handles the trapezoid correctly).
function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    a += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// Render the cone to a canvas texture (rock gradient, form shading, lava veins,
// crater mouth) for a photo-like look; falls back to flat graphics.
function drawVolcano(scene, geo) {
  const { apexX, topY, baseY, leftBaseX, rightBaseX, leftTopX, rightTopX } = geo;
  const w = Math.ceil(rightBaseX - leftBaseX);
  const h = Math.ceil(baseY - topY);
  const key = 'volcano-tex';
  // Convert world x → canvas x (canvas origin at leftBaseX, topY).
  const X = (wx) => wx - leftBaseX;

  let ct = null;
  try {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    ct = scene.textures.createCanvas(key, w, h);
  } catch (e) { ct = null; }

  if (ct) {
    const ctx = ct.getContext();
    // Clip to the trapezoid so everything stays on the cone.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(X(leftTopX), 0);
    ctx.lineTo(X(rightTopX), 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.clip();

    // Vertical rock gradient: ashy lit rim → dark basalt → near-black base.
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#6f655a');
    grad.addColorStop(0.18, '#574c43');
    grad.addColorStop(0.5, '#352c25');
    grad.addColorStop(1.0, '#140f0b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Form shading: lit left face, shadowed right face (light from upper-left).
    const lit = ctx.createLinearGradient(0, 0, w, 0);
    lit.addColorStop(0, 'rgba(255,235,210,0.16)');
    lit.addColorStop(0.5, 'rgba(255,255,255,0)');
    lit.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = lit;
    ctx.fillRect(0, 0, w, h);

    // Rocky strata / cracks lower down.
    ctx.strokeStyle = 'rgba(10,6,3,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const y = h * (0.42 + i * 0.095);
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(i * 1.7) * 6);
      ctx.lineTo(w, y - Math.cos(i * 1.3) * 6);
      ctx.stroke();
    }

    // Glowing lava veins running from the crater down the slopes.
    const craterCx = X(apexX);
    const veins = [
      [{ x: craterCx - 6, y: 8 }, { x: craterCx - 26, y: h * 0.4 }, { x: X(leftBaseX) + 70, y: h * 0.82 }],
      [{ x: craterCx + 8, y: 8 }, { x: craterCx + 30, y: h * 0.45 }, { x: X(rightBaseX) - 60, y: h * 0.8 }],
      [{ x: craterCx + 2, y: 10 }, { x: craterCx + 6, y: h * 0.55 }, { x: craterCx + 24, y: h * 0.95 }],
    ];
    for (const v of veins) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,90,0,0.9)';
      ctx.shadowBlur = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // outer hot glow
      ctx.strokeStyle = 'rgba(255,90,0,0.85)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      ctx.quadraticCurveTo(v[1].x, v[1].y, v[2].x, v[2].y);
      ctx.stroke();
      // bright core
      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(255,210,90,0.95)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      ctx.quadraticCurveTo(v[1].x, v[1].y, v[2].x, v[2].y);
      ctx.stroke();
      ctx.restore();
    }

    // Rock grain speckle.
    for (let i = 0; i < 260; i++) {
      const px = Math.random() * w;
      const py = h * 0.25 + Math.random() * h * 0.75;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(150,130,110,0.14)';
      ctx.fillRect(px, py, 2, 2);
    }

    // Crater mouth: dark elliptical lip with a glowing throat.
    const cmW = X(rightTopX) - X(leftTopX);
    const cmX = craterCx;
    const cmY = 12;
    ctx.fillStyle = 'rgba(8,5,3,0.92)';
    ctx.beginPath();
    ctx.ellipse(cmX, cmY, cmW * 0.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    const throat = ctx.createRadialGradient(cmX, cmY, 1, cmX, cmY, cmW * 0.5);
    throat.addColorStop(0, 'rgba(255,240,170,0.95)');
    throat.addColorStop(0.45, 'rgba(255,140,20,0.8)');
    throat.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = throat;
    ctx.beginPath();
    ctx.ellipse(cmX, cmY, cmW * 0.46, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    // Lit rim highlight along the front edge of the crater.
    ctx.strokeStyle = 'rgba(255,200,140,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cmX, cmY, cmW * 0.5, 13, 0, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();

    ctx.restore();
    ct.refresh();

    scene.add.image(leftBaseX + w / 2, topY + h / 2, key).setDepth(1);
    return;
  }

  // Fallback: flat shaded trapezoid + crater dot.
  const g = scene.add.graphics().setDepth(1);
  g.fillStyle(0x2a221c, 1);
  g.beginPath();
  g.moveTo(leftTopX, topY);
  g.lineTo(rightTopX, topY);
  g.lineTo(rightBaseX, baseY);
  g.lineTo(leftBaseX, baseY);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xff6a1a, 0.9);
  g.fillEllipse(apexX, topY + 12, (rightTopX - leftTopX), 18);
  g.lineStyle(4, 0x120c08, 1);
  g.strokePath();
}
