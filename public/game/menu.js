// Wires the HTML start-menu overlay: pick DEV (offline) or LIVE (connect to a
// TikTok user), show the connection result, then hand off to the Phaser game.
import { socket, bus } from './socket.js';

const overlay = document.getElementById('menu');
const input = document.getElementById('tiktok-username');
const msgEl = document.getElementById('menu-error');
const statusEl = document.getElementById('menu-status');
const goLive = document.getElementById('go-live');
const devMode = document.getElementById('dev-mode');

let connecting = false;   // waiting on a GO LIVE result
let entered = false;      // already handed off to the game
let pendingUser = null;
let softTimer = null;

const setMsg = (text, color = '#ff8a8a') => { msgEl.textContent = text; msgEl.style.color = color; };
const shortErr = (e) => (e || 'connection failed').split('\n')[0].slice(0, 90);

function show() {
  overlay.style.display = 'flex';
  connecting = false; entered = false; pendingUser = null;
  goLive.disabled = false; devMode.disabled = false;
  clearTimeout(softTimer);
  setMsg('', '');
  input.focus();
}
function enterGame() {
  if (entered) return;
  entered = true; connecting = false;
  clearTimeout(softTimer);
  overlay.style.display = 'none';
  bus.emit('ui:start');
}

devMode.addEventListener('click', () => {
  socket.emit('admin:mode', { mode: 'dev' });
  enterGame();
});

goLive.addEventListener('click', () => {
  const username = input.value.trim().replace(/^@+/, '');
  if (!username) { setMsg('Enter your TikTok username (without the @).'); input.focus(); return; }
  connecting = true;
  pendingUser = username;
  goLive.disabled = true;
  setMsg(`⏳ Connecting to @${username}…`, '#ffcc44');
  socket.emit('admin:mode', { mode: 'live', username });
  clearTimeout(softTimer);
  softTimer = setTimeout(() => {
    if (connecting) setMsg(`⏳ Still connecting to @${username}… make sure you're LIVE on TikTok, or use DEV MODE.`, '#ffcc44');
  }, 9000);
});

input.addEventListener('keydown', (e) => { if (e.key === 'Enter') goLive.click(); });

// Re-show the menu whenever the player leaves the game (ESC).
bus.on('ui:leave', show);

// Connection status drives both the persistent line and the GO LIVE result.
bus.on('tiktok:status', (s) => {
  if (!s) return;
  statusEl.textContent = s.connected
    ? `🔴 LIVE @${s.username}`
    : (s.mode === 'live' ? `… connecting @${s.username}` : 'DEV MODE');

  if (!connecting) return;
  if (s.connected) {
    setMsg(`✓ Connected to @${s.username}! Starting…`, '#7CFC8A');
    connecting = false;
    clearTimeout(softTimer);
    setTimeout(enterGame, 800);
  } else if (s.mode === 'live' && s.error) {
    setMsg(`⚠️ Couldn't connect to @${pendingUser}: ${shortErr(s.error)} — check the handle and that you're LIVE.`, '#ff8a8a');
    connecting = false;
    goLive.disabled = false;
    clearTimeout(softTimer);
  }
  // otherwise still connecting — keep the "Connecting…" message
});

show();
