// Pitch geometry shared by MatchScene. Walls + goal sensor bodies.
// Coordinate system: 1920x1080. Field area is roughly y=180 (below HUD) to y=1000.
import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';

export const PITCH = Object.freeze({
  top: 180,
  bottom: 1000,
  left: 40,
  right: GAME_WIDTH - 40,
  centerX: GAME_WIDTH / 2,
  goalMouthHeight: 280,
});

export function buildField(scene) {
  // Visuals: pitch background + halfway stripe.
  scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0c5e1a);
  scene.add.rectangle(GAME_WIDTH / 2, (PITCH.top + PITCH.bottom) / 2,
    GAME_WIDTH - 80, PITCH.bottom - PITCH.top, 0x1a7b2c).setStrokeStyle(4, 0xffffff);
  scene.add.line(0, 0, GAME_WIDTH / 2, PITCH.top, GAME_WIDTH / 2, PITCH.bottom, 0xffffff, 0.6).setLineWidth(3);
  scene.add.circle(GAME_WIDTH / 2, (PITCH.top + PITCH.bottom) / 2, 90).setStrokeStyle(3, 0xffffff);

  // Top/bottom walls and outer side walls.
  const wallOpts = { isStatic: true, friction: 0.05, restitution: 0.6 };
  scene.matter.add.rectangle(GAME_WIDTH / 2, PITCH.top - 10, GAME_WIDTH, 20, wallOpts);
  scene.matter.add.rectangle(GAME_WIDTH / 2, PITCH.bottom + 10, GAME_WIDTH, 20, wallOpts);

  // Goal mouths sit inside the left/right margins. Walls flank the mouth top and bottom.
  const goalY = (PITCH.top + PITCH.bottom) / 2;
  const mouthTop = goalY - PITCH.goalMouthHeight / 2;
  const mouthBot = goalY + PITCH.goalMouthHeight / 2;
  const wallSegH = mouthTop - PITCH.top;

  // Left side walls (above and below goal mouth)
  scene.matter.add.rectangle(PITCH.left, PITCH.top + wallSegH / 2, 20, wallSegH, wallOpts);
  scene.matter.add.rectangle(PITCH.left, PITCH.bottom - wallSegH / 2, 20, wallSegH, wallOpts);
  // Right side walls
  scene.matter.add.rectangle(PITCH.right, PITCH.top + wallSegH / 2, 20, wallSegH, wallOpts);
  scene.matter.add.rectangle(PITCH.right, PITCH.bottom - wallSegH / 2, 20, wallSegH, wallOpts);

  // Goal back walls (so balls that go in stop somewhere)
  scene.matter.add.rectangle(PITCH.left - 60, goalY, 20, PITCH.goalMouthHeight, wallOpts);
  scene.matter.add.rectangle(PITCH.right + 60, goalY, 20, PITCH.goalMouthHeight, wallOpts);

  // Goal sensor bodies (a ball entering triggers a goal).
  const leftGoal = scene.matter.add.rectangle(PITCH.left - 30, goalY, 40, PITCH.goalMouthHeight - 10, {
    isStatic: true, isSensor: true, label: 'goal-left',
  });
  const rightGoal = scene.matter.add.rectangle(PITCH.right + 30, goalY, 40, PITCH.goalMouthHeight - 10, {
    isStatic: true, isSensor: true, label: 'goal-right',
  });

  // Visualize the nets.
  const drawNet = (x, color) => {
    const g = scene.add.graphics();
    g.lineStyle(2, 0xffffff, 0.5);
    for (let dy = -PITCH.goalMouthHeight / 2; dy <= PITCH.goalMouthHeight / 2; dy += 20) {
      g.lineBetween(x - 40, goalY + dy, x + 40, goalY + dy);
    }
    for (let dx = -40; dx <= 40; dx += 20) {
      g.lineBetween(x + dx, goalY - PITCH.goalMouthHeight / 2, x + dx, goalY + PITCH.goalMouthHeight / 2);
    }
    scene.add.rectangle(x, goalY, 80, PITCH.goalMouthHeight, color, 0.15);
  };
  drawNet(PITCH.left - 30, 0xffffff);
  drawNet(PITCH.right + 30, 0xffffff);

  return { leftGoal, rightGoal, goalY };
}
