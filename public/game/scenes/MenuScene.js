import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';

// Idle backdrop behind the HTML start-menu overlay (see public/game/menu.js).
export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x0a1130, 0x0a1130, 0x0c5e1a, 0x0c5e1a, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}
