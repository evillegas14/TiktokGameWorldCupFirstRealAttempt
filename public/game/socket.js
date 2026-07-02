// Socket.io wrapper exposing a Phaser-friendly event bus.
// Scenes subscribe via bus.on('eventName', handler) in create() and bus.off(...) in shutdown().
export const bus = new Phaser.Events.EventEmitter();

const socket = io();
const events = [
  'state', 'vote:start', 'vote:tally',
  'match:start', 'match:goal', 'match:end',
  'chat', 'player:join', 'players:count', 'players:sync',
  'gift', 'like', 'likes:milestone',
  'leaderboard', 'tiktok:status',
];
const lastByEvent = {};
for (const e of events) {
  socket.on(e, (payload) => {
    lastByEvent[e] = payload;
    bus.emit(e, payload);
  });
}

// Last payload seen for an event — lets a scene that starts after an event read it.
export function getLast(event) { return lastByEvent[event]; }

export { socket };
