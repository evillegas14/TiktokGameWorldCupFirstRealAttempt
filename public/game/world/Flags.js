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

function clothTexKey(team) { return 'flagcloth:' + team.code; }

// Team-colored cloth texture (hoist band + weave lines) used when the real national
// flag image isn't available (e.g. the CDN is blocked/offline).
function ensureClothTexture(scene, team) {
  const key = clothTexKey(team);
  if (scene.textures.exists(key)) return key;
  const w = 120, h = 80;
  const primary = Phaser.Display.Color.HexStringToColor(team.primary).color;
  const secondary = Phaser.Display.Color.HexStringToColor(team.secondary).color;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(primary, 1); g.fillRect(0, 0, w, h);
  g.fillStyle(secondary, 1); g.fillRect(0, 0, Math.round(w * 0.32), h);        // hoist band
  g.fillStyle(0xffffff, 0.12); for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2); // weave
  g.lineStyle(3, secondary, 1); g.strokeRect(1, 1, w - 2, h - 2);
  g.generateTexture(key, w, h); g.destroy();
  return key;
}

// A single waving flag: pole + cloth. Uses the real flag image if available, else a
// team-colored cloth texture. The cloth is a Rope whose points ripple with a
// traveling sine wave so it waves in the wind. Returns the container.
export function makeFlag(scene, x, y, team, { scale = 1, poleH = 90, clothW = 78, clothH = 52 } = {}) {
  const c = scene.add.container(x, y).setScale(scale);

  const pole = scene.add.rectangle(0, 0, 5, poleH, 0x6b6b6b).setOrigin(0.5, 1).setStrokeStyle(1, 0x303030);
  const knob = scene.add.circle(0, -poleH, 5, 0xd4af37).setStrokeStyle(1, 0x7a5b00); // finial
  c.add(pole); c.add(knob);

  // Cloth is anchored by its LEFT edge to the top of the pole and ripples from there.
  const clothX = 2;
  const clothY = -poleH + clothH / 2 + 3;

  const texKey = scene.textures.exists(flagKey(team.iso)) ? flagKey(team.iso) : ensureClothTexture(scene, team);
  const src = scene.textures.get(texKey).getSourceImage();
  const texW = (src && src.width) || 120;
  const texH = (src && src.height) || 80;

  let cloth;
  if (typeof scene.add.rope === 'function') {
    const count = 18;
    cloth = scene.add.rope(clothX, clothY, texKey, null, count, true);
    cloth.setScale(clothW / texW, clothH / texH);
    const amp = texH * 0.16;                 // in texture space; scaled down with the rope
    const speed = 1.5 + Math.random() * 0.5;
    const phase0 = Math.random() * Math.PI * 2;
    scene.tweens.add({
      targets: { t: 0 }, t: Math.PI * 2, duration: 1400, repeat: -1,
      onUpdate: (tw, tgt) => {
        if (!cloth.active) return;
        const pts = cloth.points;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1);            // 0 at pole, 1 at free edge
          pts[i].y = Math.sin(phase0 + tgt.t * speed + f * Math.PI * 2.2) * amp * f;
        }
        cloth.setDirty();
      },
    });
  } else {
    // Rope unavailable: fall back to a static stretched image.
    cloth = scene.add.image(clothX, clothY, texKey).setOrigin(0, 0.5).setDisplaySize(clothW, clothH);
  }
  c.addAt(cloth, 1);
  c._cloth = cloth;
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
