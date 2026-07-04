export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    this.load.json('teams', '/game/data/teams.json');
  }

  create() {
    const teams = this.cache.json.get('teams');
    this.registry.set('teams', teams);
    this.scene.start('MenuScene');
  }
}
