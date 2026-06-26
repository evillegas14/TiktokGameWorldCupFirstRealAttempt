import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';

export class WinnerScene extends Phaser.Scene {
  constructor() { super('WinnerScene'); }

  init(data) {
    this.winner = data.winner;
    this.finalScore = data.finalScore;
    this.winnerTeam = data.winnerTeam;
  }

  create() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85);

    const primary = Phaser.Display.Color.HexStringToColor(this.winner.primary).color;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100, 400, 240, primary).setStrokeStyle(6, 0xffffff);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 160, this.winner.code, {
      fontSize: '120px', fontFamily: 'Impact', color: '#ffffff', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, this.winner.name, {
      fontSize: '36px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, 'WINS', {
      fontSize: '80px', fontFamily: 'Impact', color: '#ffce00', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 180,
      `${this.finalScore[1]}  —  ${this.finalScore[2]}`, {
      fontSize: '64px', color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 100, 'Next vote starting…', {
      fontSize: '32px', color: '#ffffff',
    }).setOrigin(0.5);
  }
}
