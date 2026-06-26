// Triangular hill in the middle of the pitch with a horizontal slit at its base
// so balls and player avatars can pass underneath.
import { PITCH } from './Field.js';
import { GAME_WIDTH } from '../constants.js';

export function buildHill(scene) {
  const apexX = GAME_WIDTH / 2;
  const apexY = PITCH.bottom - 380;          // top of hill
  const halfBase = 220;
  const baseY = PITCH.bottom - 60;           // legs end here, leaving a 60px slit above the ground
  const leftBaseX = apexX - halfBase;
  const rightBaseX = apexX + halfBase;

  const legOpts = { isStatic: true, friction: 0.05, restitution: 0.7, label: 'hill' };
  const thickness = 14;

  const leftLen = Math.hypot(apexX - leftBaseX, apexY - baseY);
  const leftAngle = Math.atan2(apexY - baseY, apexX - leftBaseX);
  const leftCx = (apexX + leftBaseX) / 2;
  const leftCy = (apexY + baseY) / 2;
  scene.matter.add.rectangle(leftCx, leftCy, leftLen, thickness, { ...legOpts, angle: leftAngle });

  const rightLen = Math.hypot(rightBaseX - apexX, baseY - apexY);
  const rightAngle = Math.atan2(baseY - apexY, rightBaseX - apexX);
  const rightCx = (apexX + rightBaseX) / 2;
  const rightCy = (apexY + baseY) / 2;
  scene.matter.add.rectangle(rightCx, rightCy, rightLen, thickness, { ...legOpts, angle: rightAngle });

  // Visual rendering of the triangle (no fill so the slit is obvious).
  const g = scene.add.graphics();
  g.lineStyle(6, 0x6b3a1a);
  g.beginPath();
  g.moveTo(leftBaseX, baseY);
  g.lineTo(apexX, apexY);
  g.lineTo(rightBaseX, baseY);
  g.closePath();
  g.strokePath();
  g.fillStyle(0x8b5a2b, 0.5);
  g.fillTriangle(leftBaseX, baseY, apexX, apexY, rightBaseX, baseY);

  // Slit marker (dashed line so the gap is visible).
  const slit = scene.add.graphics();
  slit.lineStyle(2, 0xffffff, 0.4);
  for (let x = leftBaseX; x < rightBaseX; x += 16) {
    slit.lineBetween(x, PITCH.bottom - 4, Math.min(x + 8, rightBaseX), PITCH.bottom - 4);
  }

  return {
    apex: { x: apexX, y: apexY },
    leftCannon: { x: leftBaseX + 30, y: baseY - 50 },
    rightCannon: { x: rightBaseX - 30, y: baseY - 50 },
    spawnPoint: { x: apexX, y: apexY - 40 },
  };
}
