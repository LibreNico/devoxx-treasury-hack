const state = {
  sessionId: localStorage.getItem('treasury_session_id') || null,
  levels: [],
  maxLevel: 0,
  currentLevel: 1,
};

const el = (id) => document.getElementById(id);
const checkinScreen = el('checkin-screen');
const gameScreen = el('game-screen');
const overlay = el('overlay');
const overlayCard = el('overlay-card');

let idleTimer = null;
const IDLE_RESET_MS = 120000; // reset kiosk to check-in after 2 min of no interaction

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    localStorage.removeItem('treasury_session_id');
    location.reload();
  }, IDLE_RESET_MS);
}
['click', 'keydown'].forEach((evt) => document.addEventListener(evt, resetIdleTimer));

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function showOverlay(html) {
  overlayCard.innerHTML = html;
  overlay.classList.remove('hidden');
}
function hideOverlay() {
  overlay.classList.add('hidden');
}

async function loadLevels() {
  const res = await fetch('/api/levels');
  const data = await res.json();
  state.levels = data.levels;
  state.maxLevel = data.maxLevel;
}

function renderLevelTrack() {
  const track = el('level-track');
  track.innerHTML = '';
  for (let i = 1; i <= state.maxLevel; i++) {
    const dot = document.createElement('div');
    dot.className = 'level-dot';
    if (i < state.currentLevel) dot.classList.add('done');
    else if (i === state.currentLevel) dot.classList.add('active');
    track.appendChild(dot);
  }
}

function renderDoor() {
  const level = state.levels.find((l) => l.id === state.currentLevel);
  if (!level) return;
  el('door-name').textContent = `Door ${level.id}: ${level.name}`;
  el('door-guardian').textContent = level.intro;
  el('door-avatar').src = level.avatar;
  el('door-avatar').alt = level.guardian;
}

function addMessage(role, text) {
  const log = el('chat-log');
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  wrap.innerHTML = `<div class="bubble"></div>`;
  wrap.querySelector('.bubble').textContent = text;
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

async function refreshLeaderboard() {
  const res = await fetch('/api/leaderboard');
  const data = await res.json();
  const list = el('leaderboard-list');
  list.innerHTML = '';
  data.top.forEach((entry) => {
    const li = document.createElement('li');
    li.innerHTML = `<div>${escapeHtml(entry.nickname)} -- Level ${entry.maxLevelReached}${entry.completedAll ? ' (complete!)' : ''}</div><div class="lb-time">${formatMs(entry.elapsedMs)}</div>`;
    list.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function startGame(session) {
  state.sessionId = session.id;
  state.currentLevel = session.currentLevel;
  localStorage.setItem('treasury_session_id', session.id);
  el('player-tag').textContent = session.nickname;
  checkinScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  renderLevelTrack();
  renderDoor();
  el('chat-log').innerHTML = '';
  if (session.completedAll) {
    showFinalOverlay();
  }
  resetIdleTimer();
  refreshLeaderboard();
  setInterval(refreshLeaderboard, 5000);
}

function showFinalOverlay(passphrase) {
  showOverlay(`
    <h2>Treasury Conquered!</h2>
    ${passphrase ? `<p>The final passphrase was:</p><div class="code">${escapeHtml(passphrase)}</div>` : ''}
    <p>You cracked every Guardian. Staff will confirm your final ranking for the big prize.</p>
    <button class="primary" id="overlay-close">New player</button>
  `);
  el('overlay-close').addEventListener('click', () => {
    localStorage.removeItem('treasury_session_id');
    location.reload();
  });
}

function showGoodieOverlay(passphrase) {
  showOverlay(`
    <h2>Door 1 unlocked!</h2>
    <p>The passphrase was:</p>
    <div class="code">${escapeHtml(passphrase || '')}</div>
    <p>Show this screen to booth staff to claim your goodie.</p>
    <button class="primary" id="overlay-continue">Continue to Door 2</button>
  `);
  el('overlay-continue').addEventListener('click', hideOverlay);
}

function showDoorUnlockedOverlay(levelJustBeaten, passphrase) {
  const level = state.levels.find((l) => l.id === levelJustBeaten);
  const next = state.levels.find((l) => l.id === levelJustBeaten + 1);
  showOverlay(`
    <h2>Door ${level.id} unlocked!</h2>
    <p>The passphrase was:</p>
    <div class="code">${escapeHtml(passphrase || '')}</div>
    <p>${escapeHtml(level.guardian)} steps aside. ${next ? `Door ${next.id}, ${escapeHtml(next.name)}, awaits.` : ''}</p>
    <button class="primary" id="overlay-continue">Continue</button>
  `);
  el('overlay-continue').addEventListener('click', hideOverlay);
}

el('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('checkin-error').textContent = '';
  const nickname = el('nickname').value;
  const email = el('email').value;
  const consent = el('consent').checked;
  const res = await fetch('/api/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, email, consent }),
  });
  const data = await res.json();
  if (!res.ok) {
    el('checkin-error').textContent = data.error || 'Something went wrong.';
    return;
  }
  await loadLevels();
  startGame(data.session);
});

el('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = el('chat-message');
  const message = input.value.trim();
  if (!message) return;
  addMessage('user', message);
  input.value = '';
  input.disabled = true;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId, message }),
  });
  const data = await res.json();
  input.disabled = false;
  input.focus();

  if (!res.ok) {
    addMessage('guardian', data.error || 'Something went wrong.');
    return;
  }

  addMessage(data.unlocked ? 'unlocked' : 'guardian', data.reply);

  if (data.unlocked) {
    state.currentLevel = data.session.currentLevel;
    renderLevelTrack();
    el('chat-log').innerHTML = '';
    renderDoor();
    if (data.gameComplete) {
      showFinalOverlay(data.passphrase);
    } else if (data.level === 1) {
      showGoodieOverlay(data.passphrase);
    } else {
      showDoorUnlockedOverlay(data.level, data.passphrase);
    }
    refreshLeaderboard();
  }
});

el('abort-btn').addEventListener('click', () => {
  showOverlay(`
    <h2>Leave the Treasury?</h2>
    <p>Your progress so far will still count for the leaderboard, but you won't be able to continue this run.</p>
    <button class="primary" id="overlay-abort-confirm">Yes, leave</button>
    <button class="secondary" id="overlay-abort-cancel">Keep playing</button>
  `);
  el('overlay-abort-confirm').addEventListener('click', () => {
    localStorage.removeItem('treasury_session_id');
    location.reload();
  });
  el('overlay-abort-cancel').addEventListener('click', hideOverlay);
});

// Resume an in-progress session on page reload (kiosk refresh, browser crash).
(async function init() {
  await loadLevels();
  if (state.sessionId) {
    const res = await fetch(`/api/session/${state.sessionId}`);
    if (res.ok) {
      const data = await res.json();
      startGame(data.session);
      return;
    }
    localStorage.removeItem('treasury_session_id');
  }
})();
