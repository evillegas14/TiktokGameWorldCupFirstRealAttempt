// Wraps tiktok-live-connector and emits normalized events.
// If no username is configured we simply don't connect — the dev panel can still drive events.
import { EventEmitter } from 'events';

export class TikTokBridge extends EventEmitter {
  constructor(username) {
    super();
    this.username = username;
    this.connection = null;
  }

  async connect() {
    if (!this.username) {
      console.log('[tiktok] No TIKTOK_USERNAME set — running in dev/offline mode.');
      return;
    }
    try {
      const mod = await import('tiktok-live-connector');
      const Conn = mod.WebcastPushConnection || mod.default?.WebcastPushConnection;
      if (!Conn) throw new Error('WebcastPushConnection not found in tiktok-live-connector');
      this.connection = new Conn(this.username);
      this.connection.on('chat', (d) => this.emit('chat', this.#user(d), d.comment));
      this.connection.on('gift', (d) => {
        const repeatEnd = d.giftType === 1 ? d.repeatEnd : true;
        if (!repeatEnd) return;
        this.emit('gift', this.#user(d), {
          giftId: d.giftId,
          name: d.giftName,
          coins: d.diamondCount || 0,
          repeatCount: d.repeatCount || 1,
        });
      });
      this.connection.on('like', (d) => this.emit('like', this.#user(d), d.likeCount || 1));
      this.connection.on('member', (d) => this.emit('member', this.#user(d)));
      const state = await this.connection.connect();
      console.log(`[tiktok] Connected to @${this.username} (roomId ${state.roomId})`);
    } catch (err) {
      console.error('[tiktok] Connect failed:', err.message);
    }
  }

  #user(d) {
    return {
      uniqueId: d.uniqueId,
      nickname: d.nickname || d.uniqueId,
      profilePictureUrl: d.profilePictureUrl || null,
    };
  }
}
