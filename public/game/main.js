import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { VoteScene } from './scenes/VoteScene.js';
import { MatchScene } from './scenes/MatchScene.js';
import { WinnerScene } from './scenes/WinnerScene.js';
import { bus, getLast } from './socket.js';
import { sfx } from './audio/Sound.js';
import { GAME_WIDTH, GAME_HEIGHT } from './constants.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0c5e1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 1.2 },
      enableSleeping: false,
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, VoteScene, MatchScene, WinnerScene],
};

const game = new Phaser.Game(config);
window.__phaserGame = game;

// The server runs the vote→match→winner loop continuously; the client only
// follows it once the player presses START, and ESC returns to the menu.
let started = false;

// START: jump into whatever phase the server is currently in.
bus.on('ui:start', () => {
  started = true;
  game.scene.stop('MenuScene');
  const st = getLast('state');
  if (st && st.phase === 'match' && st.teamA && st.teamB) {
    game.scene.start('MatchScene', {
      teamA: st.teamA, teamB: st.teamB, goalsToWin: st.goalsToWin, score: st.score,
    });
  } else {
    game.scene.start('VoteScene', { endsAt: st?.voteEndsAt });
  }
});

// ESC: leave the game and return to the menu (server keeps running).
bus.on('ui:leave', () => {
  started = false;
  sfx.stopMusic();
  game.scene.stop('VoteScene');
  game.scene.stop('MatchScene');
  game.scene.stop('WinnerScene');
  game.scene.start('MenuScene');
});

// Server-driven scene transitions — only while the player is in the game.
bus.on('vote:start', (payload) => {
  if (!started || game.scene.isActive('VoteScene')) return;
  game.scene.stop('MatchScene');
  game.scene.stop('WinnerScene');
  game.scene.start('VoteScene', payload);
});
bus.on('match:start', (payload) => {
  if (!started) return;
  game.scene.stop('VoteScene');
  game.scene.stop('WinnerScene');
  game.scene.start('MatchScene', payload);
});
bus.on('match:end', (payload) => {
  if (!started) return;
  game.scene.stop('MatchScene');
  game.scene.start('WinnerScene', payload);
});
