import { bus, getLast } from '../socket.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import { loadFlags, flagKey } from '../world/Flags.js';

export class VoteScene extends Phaser.Scene {
  constructor() { super('VoteScene'); }

  init(data) {
    // Prefer an absolute end-time so mid-vote joiners see the correct countdown.
    this.initialEndsAt = data?.endsAt
      || getLast('vote:start')?.endsAt
      || getLast('state')?.voteEndsAt
      || (Date.now() + (data?.seconds || 60) * 1000);
  }

  create() {
    this.teams = this.registry.get('teams') || [];
    this.tally = {};
    this.endsAt = this.initialEndsAt;
    this.tiles = new Map();

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a3b12);
    this.add.text(GAME_WIDTH / 2, 50, 'VOTE FOR YOUR TEAMS', {
      fontSize: '64px', fontFamily: 'Impact, sans-serif', color: '#ffce00',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 110, 'Type  !vote <CODE>  in chat (e.g. !vote BRA)', {
      fontSize: '28px', color: '#ffffff',
    }).setOrigin(0.5);

    this.countdownText = this.add.text(GAME_WIDTH / 2, 165, '', {
      fontSize: '40px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0.5);
    this.leaderText = this.add.text(GAME_WIDTH / 2, 210, '', {
      fontSize: '30px', fontFamily: 'Impact', color: '#ffd700', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    const cols = 8;
    const tileW = 200;
    const tileH = 150;
    const startX = (GAME_WIDTH - cols * tileW - (cols - 1) * 20) / 2 + tileW / 2;
    const startY = 300;
    this.teams.forEach((team, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (tileW + 20);
      const y = startY + row * (tileH + 30);
      const tile = this.#makeTile(team, x, y, tileW, tileH);
      this.tiles.set(team.code, tile);
    });

    // Try to load real national flags; overlay them on the tiles when ready.
    loadFlags(this, this.teams.map((t) => t.iso), () => {
      if (!this.sys.isActive()) return; // scene may have moved on before the load finished
      for (const team of this.teams) {
        const tile = this.tiles.get(team.code);
        if (tile && this.textures.exists(flagKey(team.iso))) tile.applyFlag(flagKey(team.iso));
      }
    });

    this.handleVoteStart = (data) => {
      this.endsAt = data.endsAt || Date.now() + (data.seconds * 1000);
      this.tally = {};
      for (const [, tile] of this.tiles) tile.setCount(0);
    };
    this.handleTally = (tally) => {
      this.tally = tally;
      const max = Math.max(1, ...Object.values(tally));
      for (const [code, tile] of this.tiles) {
        tile.setCount(tally[code] || 0, max);
      }
      // Highlight the current top two (these play if voting ended now).
      const ranked = Object.entries(tally).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
      const top = ranked.slice(0, 2).map(([code]) => code);
      for (const [code, tile] of this.tiles) tile.setLeading(top.includes(code));
      if (top.length === 2) {
        const nameOf = (code) => this.teams.find((t) => t.code === code)?.name || code;
        this.leaderText.setText(`🔥 Leading: ${nameOf(top[0])}  vs  ${nameOf(top[1])}`);
      } else if (top.length === 1) {
        this.leaderText.setText('🔥 Needs one more team to vote in…');
      } else {
        this.leaderText.setText('');
      }
    };
    bus.on('vote:start', this.handleVoteStart);
    bus.on('vote:tally', this.handleTally);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('vote:start', this.handleVoteStart);
      bus.off('vote:tally', this.handleTally);
    });
  }

  #makeTile(team, x, y, w, h) {
    const primary = Phaser.Display.Color.HexStringToColor(team.primary).color;
    const secondary = Phaser.Display.Color.HexStringToColor(team.secondary).color;

    const bg = this.add.rectangle(x, y, w, h, primary).setStrokeStyle(3, secondary);
    // Flag area fills the top of the tile (colored until/if a real flag loads).
    const flagH = h - 50;
    const code = this.add.text(x, y - 25, team.code, {
      fontSize: '48px', fontFamily: 'Impact', color: '#ffffff',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    const name = this.add.text(x, y + 18, team.name, {
      fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    const barBg = this.add.rectangle(x, y + 55, w - 20, 14, 0x000000, 0.6);
    const bar = this.add.rectangle(x - (w - 20) / 2, y + 55, 0, 14, 0xffce00).setOrigin(0, 0.5);
    const countText = this.add.text(x, y + 55, '0', {
      fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    const crown = this.add.text(x, y - h / 2 - 4, '🔥', { fontSize: '26px' }).setOrigin(0.5).setVisible(false);
    let leading = false;

    return {
      applyFlag: (key) => {
        const img = this.add.image(x, y - 18, key).setDisplaySize(w - 14, flagH);
        // Put the code label on top of the flag for readability.
        code.setY(y - 18).setFontSize(34);
        code.setStroke('#000', 6);
        img.setDepth(code.depth - 1);
        name.setY(y + 18);
      },
      setCount(n, max = 1) {
        const ratio = max > 0 ? n / max : 0;
        bar.width = (w - 20) * ratio;
        countText.setText(String(n));
      },
      setLeading(on) {
        if (on === leading) return;
        leading = on;
        crown.setVisible(on);
        bg.setStrokeStyle(on ? 7 : 3, on ? 0xffd700 : secondary);
        bg.setScale(on ? 1.04 : 1);
      },
    };
  }

  update() {
    const remaining = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
    this.countdownText.setText(`Match starts in ${remaining}s`);
  }
}
