// Team flags. Tries to load real national flags (flagcdn, by ISO code) and
// gracefully falls back to a team-colored flag if the image can't be fetched
// (e.g. offline). Shared by the VoteScene tiles and the in-match decorations.
import { PITCH, floorYAt } from './Field.js';
import { GAME_WIDTH } from '../constants.js';

export function flagKey(iso) { return 'flag:' + iso; }
export function flagUrl(iso) { return `https://flagcdn.com/w320/${iso}.png`; }

// Queue a batch of flag image loads; calls onComplete once the loader finishes.
// Safe to call with isos that may 404 — those simply won't exist afterward.
export function loadFlags(scene, isos, onComplete) {
  const unique = [...new Set(isos)].filter((iso) => iso && !scene.textures.exists(flagKey(iso)));
  if (unique.length === 0) { onComplete && onComplete(); return; }
  for (const iso of unique) scene.load.image(flagKey(iso), flagUrl(iso));
  scene.load.once('complete', () => onComplete && onComplete());
  // loaderror is non-fatal; the loader still emits 'complete'.
  scene.load.start();
}

// A single waving flag: pole + cloth. Real flag image if available, else a
// team-colored cloth with the team code. Returns the container.
export function makeFlag(scene, x, y, team, { scale = 1, poleH = 90, clothW = 78, clothH = 52 } = {}) {
  const primary = Phaser.Display.Color.HexStringToColor(team.primary).color;
  const secondary = Phaser.Display.Color.HexStringToColor(team.secondary).color;
  const c = scene.add.container(x, y).setScale(scale);

  const pole = scene.add.rectangle(0, 0, 5, poleH, 0x6b6b6b).setOrigin(0.5, 1).setStrokeStyle(1, 0x303030);
  c.add(pole);

  // Cloth is anchored by its LEFT edge to the top of the pole and ripples from there.
  const clothX = 2;
  const clothY = -poleH + clothH / 2 + 3;

  let cloth;
  if (scene.textures.exists(flagKey(team.iso))) {
    cloth = scene.add.image(clothX, clothY, flagKey(team.iso)).setOrigin(0, 0.5).setDisplaySize(clothW, clothH);
  } else {
    cloth = scene.add.rectangle(clothX, clothY, clothW, clothH, primary).setOrigin(0, 0.5).setStrokeStyle(2, secondary);
    const code = scene.add.text(clothX + clothW / 2, clothY, team.code, {
      fontSize: '20px', fontFamily: 'Impact', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    c.add(code);
    c._code = code;
  }
  c.addAt(cloth, 1);
  c._cloth = cloth;

  // Ripple relative to the cloth's base scale (setDisplaySize already scaled the
  // image, so tween from that base — never to absolute 1, which would blow it up).
  const baseSX = cloth.scaleX;
  scene.tweens.add({
    targets: cloth, scaleX: { from: baseSX, to: baseSX * 0.9 },
    duration: 800 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut',
  });
  return c;
}

// Build the in-match flag decorations for both playing teams.
export function buildMatchFlags(scene, teamA, teamB) {
  const apply = () => {
    // Big stand flags high up on each side (clear of the HUD + leaderboard).
    makeFlag(scene, GAME_WIDTH * 0.30, 250, teamA, { scale: 1.3, clothW: 100, clothH: 66, poleH: 120 });
    makeFlag(scene, GAME_WIDTH * 0.70, 250, teamB, { scale: 1.3, clothW: 100, clothH: 66, poleH: 120 });
    // Corner flags grounded low on each side, well below the leaderboard.
    makeFlag(scene, 230, floorYAt(230), teamA, { scale: 0.9 });
    makeFlag(scene, GAME_WIDTH - 230, floorYAt(GAME_WIDTH - 230), teamB, { scale: 0.9 });
  };
  loadFlags(scene, [teamA.iso, teamB.iso], apply);
}
