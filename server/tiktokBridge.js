// Wraps tiktok-live-connector and emits normalized events plus connection status.
// If no username is configured we run in dev/offline mode (the dev panel drives events).
import { EventEmitter } from 'events';

export class TikTokBridge extends EventEmitter {
  constructor(username) {
    super();
    this.username = username;
    this.connection = null;
    this.connected = false;
    this.reconnectMs = 5000;
  }

  status() {
    return {
      connected: this.connected,
      mode: this.username ? 'live' : 'dev',
      username: this.username || null,
    };
  }

  // Switch between dev (offline) and live (connect to a TikTok user) at runtime.
  async setMode(mode, username) {
    clearTimeout(this._reconnectTimer);
    try { await this.connection?.disconnect?.(); } catch (e) { /* ignore */ }
    this.connection = null;
    this.connected = false;
    this.username = (mode === 'live' && username)
      ? String(username).replace(/^@+/, '').trim()
      : null;
    this.#emitStatus();
    if (this.username) await this.connect();
  }

  #emitStatus() {
    this.emit('status', this.status());
  }

  async connect() {
    if (!this.username) {
      console.log('[tiktok] No TIKTOK_USERNAME set — running in dev/offline mode.');
      this.#emitStatus();
      return;
    }
    try {
      const mod = await import('tiktok-live-connector');
      const Conn = mod.WebcastPushConnection || mod.default?.WebcastPushConnection;
      if (!Conn) throw new Error('WebcastPushConnection not found in tiktok-live-connector');
      this.connection = new Conn(this.username);

      this.connection.on('chat', (d) => this.emit('chat', this.#user(d), d.comment));
      this.connection.on('gift', (d) => {
        // For streakable gifts, only count once the streak ends to avoid double counting.
        const streakEnded = d.giftType === 1 ? d.repeatEnd : true;
        if (!streakEnded) return;
        this.emit('gift', this.#user(d), {
          giftId: d.giftId,
          name: d.giftName,
          coins: d.diamondCount || 0,
          repeatCount: d.repeatCount || 1,
        });
      });
      this.connection.on('like', (d) => this.emit('like', this.#user(d), d.likeCount || 1));
      this.connection.on('member', (d) => this.emit('member', this.#user(d)));

      this.connection.on('disconnected', () => {
        console.log('[tiktok] Disconnected.');
        this.connected = false;
        this.#emitStatus();
        this.#scheduleReconnect();
      });
      this.connection.on('streamEnd', () => {
        console.log('[tiktok] Stream ended.');
        this.connected = false;
        this.#emitStatus();
      });

      const state = await this.connection.connect();
      this.connected = true;
      this.#emitStatus();
      console.log(`[tiktok] Connected to @${this.username} (roomId ${state.roomId})`);
    } catch (err) {
      console.error('[tiktok] Connect failed:', err.message);
      this.connected = false;
      this.#emitStatus();
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect() {
    if (!this.username) return;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      console.log('[tiktok] Attempting reconnect…');
      this.connect();
    }, this.reconnectMs);
  }

  #user(d) {
    return {
      uniqueId: d.uniqueId,
      nickname: d.nickname || d.uniqueId,
      profilePictureUrl: d.profilePictureUrl || null,
    };
  }
}
