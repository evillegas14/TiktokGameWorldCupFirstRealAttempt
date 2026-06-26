// Pitch geometry shared by MatchScene. A 2D side-view soccer field with a
// concave (bowl) floor that dips toward the center, plus an extra divot
// directly under the hill so balls/players have more room to pass beneath.
// Coordinate system: 1920x1080.
import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';

export const PITCH = Object.freeze({
  top: 180,
  bottom: 1000,            // reference height the hill is built against
  left: 40,
  right: GAME_WIDTH - 40,
  centerX: GAME_WIDTH / 2,
  goalMouthHeight: 280,
  sideFloorY: 770,         // floor height at the left/right ends (goals sit here)
  centerFloorY: 980,       // bowl floor at center before the divot
  divotDepth: 95,          // extra dip carved under the hill
  divotWidth: 250,         // gaussian spread of the divot
});

// Goal-mouth vertical center, sitting just above the side floor.
export const GOAL_Y = PITCH.sideFloorY - PITCH.goalMouthHeight / 2;

// Floor height at a given x: parabolic bowl + a gaussian divot under the hill.
export function floorYAt(x) {
  const norm = Phaser.Math.Clamp((x - PITCH.centerX) / (PITCH.right - PITCH.centerX), -1, 1);
  const bowl = PITCH.centerFloorY - (PITCH.centerFloorY - PITCH.sideFloorY) * norm * norm;
  const dx = x - PITCH.centerX;
  const divot = PITCH.divotDepth * Math.exp(-(dx * dx) / (2 * PITCH.divotWidth * PITCH.divotWidth));
  return bowl + divot;
}

export function buildField(scene) {
  const wallOpts = { isStatic: true, friction: 0.05, restitution: 0.6 };

  // --- Pitch surface (filled bowl polygon) ---
  const samples = [];
  for (let x = PITCH.left; x <= PITCH.right; x += 24) samples.push({ x, y: floorYAt(x) });
  if (samples[samples.length - 1].x !== PITCH.right) {
    samples.push({ x: PITCH.right, y: floorYAt(PITCH.right) });
  }

  // Helper that traces the bowl outline onto a graphics object.
  const traceBowl = (gfx) => {
    gfx.beginPath();
    gfx.moveTo(PITCH.left, PITCH.top);
    gfx.lineTo(PITCH.right, PITCH.top);
    for (let i = samples.length - 1; i >= 0; i--) gfx.lineTo(samples[i].x, samples[i].y);
    gfx.closePath();
  };

  const poly = scene.add.graphics();
  poly.fillStyle(0x0f7a26, 1);
  traceBowl(poly);
  poly.fillPath();

  // Mask so decorations (stripes) stay inside the bowl rather than over the background.
  const maskG = scene.make.graphics({ x: 0, y: 0, add: false });
  maskG.fillStyle(0xffffff);
  traceBowl(maskG);
  maskG.fillPath();
  const pitchMask = maskG.createGeometryMask();

  // Mowed stripes (subtle vertical bands), clipped to the pitch.
  const stripes = scene.add.graphics();
  for (let i = 0, x = PITCH.left; x < PITCH.right; i++, x += 120) {
    if (i % 2 === 0) continue;
    stripes.fillStyle(0x14902f, 0.5);
    stripes.fillRect(x, PITCH.top, 120, GAME_HEIGHT - PITCH.top);
  }
  stripes.setMask(pitchMask);

  // Floor surface line.
  const floorLine = scene.add.graphics();
  floorLine.lineStyle(6, 0x0a5a1b, 1);
  floorLine.beginPath();
  floorLine.moveTo(samples[0].x, samples[0].y);
  for (let i = 1; i < samples.length; i++) floorLine.lineTo(samples[i].x, samples[i].y);
  floorLine.strokePath();

  // Halfway line + center mark (drawn down into the divot).
  const marks = scene.add.graphics();
  marks.lineStyle(3, 0xffffff, 0.5);
  marks.lineBetween(PITCH.centerX, PITCH.top, PITCH.centerX, floorYAt(PITCH.centerX));
  marks.strokeCircle(PITCH.centerX, (PITCH.top + PITCH.centerFloorY) / 2, 90);

  // --- Physics floor: chain of angled segments following the curve ---
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) + 6; // small overlap to avoid seams
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    scene.matter.add.rectangle(cx, cy + 18, len, 40, { ...wallOpts, angle });
  }

  // --- Top wall + goal-mouth side walls ---
  scene.matter.add.rectangle(GAME_WIDTH / 2, PITCH.top - 10, GAME_WIDTH, 20, wallOpts);

  const mouthTop = GOAL_Y - PITCH.goalMouthHeight / 2;
  const aboveH = mouthTop - PITCH.top;
  // Walls above each goal mouth (below the mouth is the floor, so no wall needed there).
  scene.matter.add.rectangle(PITCH.left, PITCH.top + aboveH / 2, 20, aboveH, wallOpts);
  scene.matter.add.rectangle(PITCH.right, PITCH.top + aboveH / 2, 20, aboveH, wallOpts);

  // Goal back walls (stop balls that have gone in).
  scene.matter.add.rectangle(PITCH.left - 60, GOAL_Y, 20, PITCH.goalMouthHeight, wallOpts);
  scene.matter.add.rectangle(PITCH.right + 60, GOAL_Y, 20, PITCH.goalMouthHeight, wallOpts);

  // --- Goal sensors ---
  const leftGoal = scene.matter.add.rectangle(PITCH.left - 30, GOAL_Y, 40, PITCH.goalMouthHeight - 10, {
    isStatic: true, isSensor: true, label: 'goal-left',
  });
  const rightGoal = scene.matter.add.rectangle(PITCH.right + 30, GOAL_Y, 40, PITCH.goalMouthHeight - 10, {
    isStatic: true, isSensor: true, label: 'goal-right',
  });

  // --- Goal net visuals ---
  const drawNet = (x) => {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 0.12);
    g.fillRect(x - 40, GOAL_Y - PITCH.goalMouthHeight / 2, 80, PITCH.goalMouthHeight);
    g.lineStyle(2, 0xffffff, 0.5);
    for (let dy = -PITCH.goalMouthHeight / 2; dy <= PITCH.goalMouthHeight / 2; dy += 20) {
      g.lineBetween(x - 40, GOAL_Y + dy, x + 40, GOAL_Y + dy);
    }
    for (let dx = -40; dx <= 40; dx += 20) {
      g.lineBetween(x + dx, GOAL_Y - PITCH.goalMouthHeight / 2, x + dx, GOAL_Y + PITCH.goalMouthHeight / 2);
    }
    // Crossbar + posts.
    g.lineStyle(6, 0xffffff, 1);
    g.lineBetween(x - 42, GOAL_Y - PITCH.goalMouthHeight / 2, x + 42, GOAL_Y - PITCH.goalMouthHeight / 2);
  };
  drawNet(PITCH.left - 30);
  drawNet(PITCH.right + 30);

  return { leftGoal, rightGoal, goalY: GOAL_Y };
}
