import { BootScene } from './scenes/BootScene.js';
import { VoteScene } from './scenes/VoteScene.js';
import { MatchScene } from './scenes/MatchScene.js';
import { WinnerScene } from './scenes/WinnerScene.js';
import { bus } from './socket.js';
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
  scene: [BootScene, VoteScene, MatchScene, WinnerScene],
};

const game = new Phaser.Game(config);

// Top-level scene transitions driven by server events. Each scene also listens
// to its own events, but routing live up here keeps the lifecycle simple.
bus.on('vote:start', () => {
  if (game.scene.isActive('VoteScene')) return;
  game.scene.stop('MatchScene');
  game.scene.stop('WinnerScene');
  game.scene.start('VoteScene');
});
bus.on('match:start', (payload) => {
  game.scene.stop('VoteScene');
  game.scene.stop('WinnerScene');
  game.scene.start('MatchScene', payload);
});
bus.on('match:end', (payload) => {
  game.scene.stop('MatchScene');
  game.scene.start('WinnerScene', payload);
});
