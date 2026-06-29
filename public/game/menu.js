// Wires the HTML start-menu overlay: pick DEV (offline) or LIVE (connect to a
// TikTok user), then hand off to the Phaser game via the shared event bus.
import { socket, bus } from './socket.js';

const overlay = document.getElementById('menu');
const input = document.getElementById('tiktok-username');
const errEl = document.getElementById('menu-error');
const statusEl = document.getElementById('menu-status');
const goLive = document.getElementById('go-live');
const devMode = document.getElementById('dev-mode');

const show = () => { overlay.style.display = 'flex'; input.focus(); };
const hide = () => { overlay.style.display = 'none'; };

function startGame() {
  errEl.textContent = '';
  hide();
  bus.emit('ui:start');
}

devMode.addEventListener('click', () => {
  socket.emit('admin:mode', { mode: 'dev' });
  startGame();
});

goLive.addEventListener('click', () => {
  const username = input.value.trim().replace(/^@+/, '');
  if (!username) {
    errEl.textContent = 'Enter your TikTok username (without the @).';
    input.focus();
    return;
  }
  socket.emit('admin:mode', { mode: 'live', username });
  startGame();
});

input.addEventListener('keydown', (e) => { if (e.key === 'Enter') goLive.click(); });

// Re-show the menu whenever the player leaves the game (ESC).
bus.on('ui:leave', show);

// Keep the menu's status line in sync with the server connection state.
bus.on('tiktok:status', (s) => {
  if (!s) return;
  if (s.connected) statusEl.textContent = `🔴 LIVE @${s.username}`;
  else if (s.mode === 'live') statusEl.textContent = `… connecting @${s.username}`;
  else statusEl.textContent = 'DEV MODE';
});

show();
