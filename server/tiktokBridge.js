// Wraps tiktok-live-connector (v2) and emits normalized events plus connection
// status. If no username is configured we run in dev/offline mode (the dev panel
// drives events).
//
// v2 notes: the API is `TikTokLiveConnection` (was `WebcastPushConnection` in
// v1), events are keyed by the `WebcastEvent` enum, and event payloads are the
// raw decoded protobuf messages — the user is nested under `data.user` and the
// chat text is `data.content` (was `data.comment`). Connecting goes through a
// sign server (Euler Stream); the free tier works but is rate-limited, so set
// SIGN_API_KEY to use your own key.
import { EventEmitter } from 'events';

export class TikTokBridge extends EventEmitter {
  constructor(username) {
    super();
    this.username = username ? String(username).replace(/^@+/, '').trim() : null;
    this.connection = null;
    this.connected = false;
    this.lastError = null;
    this.reconnectMs = 5000;
  }

  status() {
    return {
      connected: this.connected,
      mode: this.username ? 'live' : 'dev',
      username: this.username || null,
      error: this.lastError,
    };
  }

  // Switch between dev (offline) and live (connect to a TikTok user) at runtime.
  async setMode(mode, username) {
    clearTimeout(this._reconnectTimer);
    // Null out the active connection first so any teardown events it emits are
    // treated as stale (see the `this.connection !== conn` guards below).
    const old = this.connection;
    this.connection = null;
    try { await old?.disconnect?.(); } catch (e) { /* ignore */ }
    this.connected = false;
    this.lastError = null; // fresh attempt
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
      const Conn = mod.TikTokLiveConnection || mod.default?.TikTokLiveConnection;
      const Events = mod.WebcastEvent || mod.default?.WebcastEvent;
      const Control = mod.ControlEvent || mod.default?.ControlEvent;
      if (!Conn || !Events) {
        throw new Error('TikTokLiveConnection/WebcastEvent not found in tiktok-live-connector');
      }

      // A sign-server API key is optional; only pass it if provided so the
      // library falls back to the free tier (or its own env handling) otherwise.
      const options = process.env.SIGN_API_KEY ? { signApiKey: process.env.SIGN_API_KEY } : {};
      const conn = new Conn(this.username, options);
      this.connection = conn;

      conn.on(Events.CHAT, (d) => this.emit('chat', this.#user(d.user), d.content || ''));

      conn.on(Events.GIFT, (d) => {
        // Streakable gifts (gift.type === 1) fire repeatedly while held; only
        // count once the streak ends (repeatEnd === 1). Others count right away.
        const streakable = d.gift?.type === 1;
        if (streakable && d.repeatEnd !== 1) return;
        this.emit('gift', this.#user(d.user), {
          giftId: d.giftId,
          name: d.gift?.name || '',
          coins: d.gift?.diamondCount || 0,
          repeatCount: d.repeatCount || 1,
        });
      });

      conn.on(Events.LIKE, (d) => this.emit('like', this.#user(d.user), d.count || 1));
      conn.on(Events.MEMBER, (d) => this.emit('member', this.#user(d.user)));

      const onDisconnected = () => {
        if (this.connection !== conn) return; // stale event from a torn-down connection
        console.log('[tiktok] Disconnected.');
        this.connected = false;
        this.#emitStatus();
        this.#scheduleReconnect();
      };
      if (Control?.DISCONNECTED) conn.on(Control.DISCONNECTED, onDisconnected);
      conn.on(Events.STREAM_END, () => {
        if (this.connection !== conn) return;
        console.log('[tiktok] Stream ended.');
        this.connected = false;
        this.#emitStatus();
      });

      const state = await conn.connect();
      if (this.connection !== conn) return; // superseded while connecting
      this.connected = true;
      this.lastError = null;
      this.#emitStatus();
      console.log(`[tiktok] Connected to @${this.username} (roomId ${state?.roomId})`);
    } catch (err) {
      this.lastError = err.message || 'connection failed';
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

  // Normalize a v2 proto User into the shape the rest of the app expects.
  // The stable @handle is `displayId`; the avatar lives in `avatarThumb.urlList`.
  #user(u) {
    u = u || {};
    return {
      uniqueId: u.uniqueId || u.displayId || u.id || 'unknown',
      nickname: u.nickname || u.displayId || u.uniqueId || 'guest',
      profilePictureUrl: u.avatarThumb?.urlList?.[0] || u.profilePictureUrl || null,
    };
  }
}
