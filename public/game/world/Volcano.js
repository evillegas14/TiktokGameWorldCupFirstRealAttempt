// Volcano in the middle of the pitch (replaces the old triangular hill). A SINGLE
// SOLID trapezoidal body (wide base, flat crater rim) so nothing tunnels inside and
// gets stuck — balls and players roll over its slopes or pass through the slit above
// the bowl floor at its base. The crater glows and periodically ERUPTS (the eruption
// itself is orchestrated by MatchScene, which has the live ball list + camera + sfx).
import { PITCH, CATEGORY_VOLCANO } from './Field.js';
import { GAME_WIDTH } from '../constants.js';

export function buildVolcano(scene) {
  const apexX = GAME_WIDTH / 2;
  const topY = PITCH.bottom - 352;   // crater rim height (a touch taller = more iconic)
  const baseY = PITCH.bottom - 60;   // base sits here, leaving a slit above the floor
  const halfTop = 64;                // narrow flat crater rim
  const halfBase = 198;              // wide base
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
    // Own category so cannon/super shots can opt out of colliding with the cone.
    collisionFilter: { category: CATEGORY_VOLCANO },
  });

  // Soft ground shadow under the base, so it reads as grounded above the slit.
  scene.add.ellipse(apexX, baseY + 10, halfBase * 2.1, 36, 0x000000, 0.3).setDepth(0);

  // --- Photoreal-ish basalt cone with lava streaks + glowing crater ---
  const craterY = topY + 14;
  drawVolcano(scene, { apexX, topY, baseY, leftBaseX, rightBaseX, leftTopX, rightTopX });

  // Ambient crater glow (pulsing) + a lazy smoke plume + rising embers so it always
  // looks "alive". Self-contained tweens here; eruption surges in MatchScene use
  // throwaway glows so nothing fights these.
  if (scene.textures.exists('fx-glow')) {
    // Broad heat-haze glow over the crater.
    const glow = scene.add.image(apexX, craterY, 'fx-glow')
      .setTint(0xff5a18).setScale(1.25).setAlpha(0.5).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: glow, alpha: { from: 0.36, to: 0.66 }, scale: { from: 1.05, to: 1.4 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
    // Hot inner mouth core (bubbling brightness).
    const core = scene.add.image(apexX, craterY + 2, 'fx-glow')
      .setTint(0xffe06a).setScale(0.52).setAlpha(0.7).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: core, alpha: { from: 0.5, to: 0.95 }, scale: { from: 0.4, to: 0.62 },
      duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
    // Lazy rising smoke.
    if (scene.textures.exists('fx-glow')) {
      const smoke = scene.add.particles(apexX, craterY - 6, 'fx-glow', {
        frequency: 620, lifespan: 2800,
        speedY: { min: -46, max: -20 }, speedX: { min: -16, max: 16 },
        scale: { start: 0.16, end: 0.58 }, alpha: { start: 0.32, end: 0 },
        tint: [0x9a9a9a, 0x7a7066],
      });
      smoke.setDepth(2);
    }
    // Occasional drifting embers.
    if (scene.textures.exists('fx-dot')) {
      const embers = scene.add.particles(apexX, craterY, 'fx-dot', {
        frequency: 240, lifespan: 1500,
        speedY: { min: -90, max: -36 }, speedX: { min: -28, max: 28 },
        scale: { start: 1.2, end: 0 }, alpha: { start: 0.9, end: 0 },
        tint: [0xffd24a, 0xff8a1e, 0xff5a18], gravityY: 30,
      });
      embers.setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    }
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
    grad.addColorStop(0.0, '#7c7165');
    grad.addColorStop(0.16, '#5d5249');
    grad.addColorStop(0.46, '#3a3028');
    grad.addColorStop(0.78, '#241b14');
    grad.addColorStop(1.0, '#110c08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const craterCx = X(apexX);

    // Volume: two big soft facets (lit left flank, shadowed right flank) so the cone
    // reads as round rather than flat.
    const litFace = ctx.createLinearGradient(0, 0, craterCx, h);
    litFace.addColorStop(0, 'rgba(255,238,210,0.20)');
    litFace.addColorStop(1, 'rgba(255,238,210,0)');
    ctx.fillStyle = litFace;
    ctx.beginPath();
    ctx.moveTo(X(leftTopX), 0); ctx.lineTo(craterCx, 0); ctx.lineTo(craterCx, h); ctx.lineTo(0, h);
    ctx.closePath(); ctx.fill();
    const darkFace = ctx.createLinearGradient(w, 0, craterCx, h);
    darkFace.addColorStop(0, 'rgba(0,0,0,0.42)');
    darkFace.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = darkFace;
    ctx.beginPath();
    ctx.moveTo(X(rightTopX), 0); ctx.lineTo(craterCx, 0); ctx.lineTo(craterCx, h); ctx.lineTo(w, h);
    ctx.closePath(); ctx.fill();

    // Rocky strata / cracks, denser lower down.
    ctx.strokeStyle = 'rgba(8,5,3,0.5)';
    for (let i = 0; i < 9; i++) {
      const y = h * (0.3 + i * 0.075);
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(i * 1.7) * 7);
      let cx2 = 0;
      while (cx2 < w) {
        const nx = cx2 + 24 + Math.random() * 40;
        ctx.lineTo(nx, y + (Math.random() - 0.5) * 10);
        cx2 = nx;
      }
      ctx.stroke();
    }
    // A few angular rock chips for relief.
    for (let i = 0; i < 26; i++) {
      const px = Math.random() * w;
      const py = h * (0.2 + Math.random() * 0.78);
      const s = 4 + Math.random() * 9;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,220,0.10)' : 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + s, py + s * 0.4);
      ctx.lineTo(px + s * 0.5, py + s);
      ctx.closePath();
      ctx.fill();
    }

    // Glowing lava veins running from the crater down the slopes, with molten pools.
    const veins = [
      [{ x: craterCx - 8, y: 14 }, { x: craterCx - 34, y: h * 0.4 }, { x: X(leftBaseX) + 64, y: h * 0.86 }],
      [{ x: craterCx + 10, y: 14 }, { x: craterCx + 40, y: h * 0.46 }, { x: X(rightBaseX) - 56, y: h * 0.82 }],
      [{ x: craterCx + 2, y: 16 }, { x: craterCx + 8, y: h * 0.55 }, { x: craterCx + 30, y: h * 0.97 }],
      [{ x: craterCx - 4, y: 14 }, { x: craterCx - 12, y: h * 0.5 }, { x: craterCx - 70, y: h * 0.98 }],
    ];
    for (const v of veins) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(255,90,0,0.95)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(255,80,0,0.85)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      ctx.quadraticCurveTo(v[1].x, v[1].y, v[2].x, v[2].y);
      ctx.stroke();
      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(255,215,110,0.98)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      ctx.quadraticCurveTo(v[1].x, v[1].y, v[2].x, v[2].y);
      ctx.stroke();
      // Molten pool where the vein hits the base.
      const pg = ctx.createRadialGradient(v[2].x, v[2].y, 1, v[2].x, v[2].y, 22);
      pg.addColorStop(0, 'rgba(255,230,140,0.95)');
      pg.addColorStop(0.5, 'rgba(255,110,10,0.6)');
      pg.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.shadowBlur = 0;
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(v[2].x, v[2].y, 22, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Rock grain speckle.
    for (let i = 0; i < 320; i++) {
      const px = Math.random() * w;
      const py = h * 0.2 + Math.random() * h * 0.8;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(160,140,118,0.14)';
      ctx.fillRect(px, py, 2, 2);
    }

    // Crater: raised rocky lip + dark bowl + bubbling molten throat.
    const cmW = X(rightTopX) - X(leftTopX);
    const cmX = craterCx;
    const cmY = 14;
    const rx = cmW * 0.62;
    // Rocky outer lip (slightly raised, jagged).
    ctx.fillStyle = '#2a221b';
    ctx.beginPath();
    ctx.ellipse(cmX, cmY, rx + 7, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,235,205,0.18)'; // lit back rim
    ctx.beginPath();
    ctx.ellipse(cmX, cmY - 2, rx + 7, 16, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Dark bowl.
    ctx.fillStyle = 'rgba(6,4,2,0.95)';
    ctx.beginPath();
    ctx.ellipse(cmX, cmY, rx, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // Molten throat.
    ctx.save();
    ctx.shadowColor = 'rgba(255,120,20,0.9)';
    ctx.shadowBlur = 18;
    const throat = ctx.createRadialGradient(cmX, cmY, 1, cmX, cmY, rx);
    throat.addColorStop(0, 'rgba(255,245,200,0.98)');
    throat.addColorStop(0.4, 'rgba(255,150,30,0.85)');
    throat.addColorStop(1, 'rgba(255,80,0,0.05)');
    ctx.fillStyle = throat;
    ctx.beginPath();
    ctx.ellipse(cmX, cmY, rx * 0.92, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    // Lava bubbles.
    for (let i = 0; i < 5; i++) {
      const bx = cmX + (Math.random() - 0.5) * rx * 1.2;
      const by = cmY + (Math.random() - 0.5) * 10;
      const br = 1.5 + Math.random() * 3.5;
      ctx.fillStyle = 'rgba(255,240,180,0.95)';
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Lit highlight along the front lip.
    ctx.strokeStyle = 'rgba(255,205,150,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cmX, cmY, rx + 5, 17, 0, Math.PI * 0.12, Math.PI * 0.88);
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
