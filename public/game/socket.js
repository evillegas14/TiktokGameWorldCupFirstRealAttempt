// Socket.io wrapper exposing a Phaser-friendly event bus.
// Scenes subscribe via bus.on('eventName', handler) in create() and bus.off(...) in shutdown().
export const bus = new Phaser.Events.EventEmitter();

const socket = io();
const events = [
  'state', 'vote:start', 'vote:tally',
  'match:start', 'match:goal', 'match:end',
  'chat', 'player:join', 'players:count',
  'gift', 'like', 'likes:milestone',
];
for (const e of events) {
  socket.on(e, (payload) => bus.emit(e, payload));
}

export { socket };
