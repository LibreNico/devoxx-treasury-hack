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

function showTypingIndicator() {
  const log = el('chat-log');
  const wrap = document.createElement('div');
  wrap.className = 'msg guardian typing';
  wrap.id = 'typing-indicator';
  wrap.innerHTML = `<div class="bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}
function hideTypingIndicator() {
  el('typing-indicator')?.remove();
}

async function refreshLeaderboard() {
  const res = await fetch('/api/leaderboard');
  const data = await res.json();
  const list = el('leaderboard-list');
  list.innerHTML = '';
  data.top.forEach((entry, i) => {
    const li = document.createElement('li');
    const msgLabel = entry.messageCount === 1 ? 'msg' : 'msgs';
    li.innerHTML = `
      <span class="lb-rank rank-${i + 1}">${i + 1}</span>
      <div class="lb-info">
        <div class="lb-name">${escapeHtml(entry.nickname)} in ${formatMs(entry.elapsedMs)} with ${entry.messageCount} ${msgLabel}</div>
        <div class="lb-tags">
          <span class="lb-tag">Level ${entry.maxLevelReached}</span>
          ${entry.completedAll ? '<span class="lb-tag lb-complete">Complete</span>' : ''}
        </div>
      </div>
    `;
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
  (session.history || []).forEach((entry) => {
    addMessage(entry.role === 'user' ? 'user' : 'guardian', entry.content);
  });
  if (session.completedAll) {
    showFinalOverlay();
  }
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
    <p>Aldric steps aside. Door 2, The Counting House, awaits.</p>
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

// Shared UI flow for beating a door, whether via a chat leak or an explicit guess.
function handleUnlock(levelJustBeaten, passphrase, gameComplete, session) {
  state.currentLevel = session.currentLevel;
  renderLevelTrack();
  el('chat-log').innerHTML = '';
  renderDoor();
  el('guess-message').value = '';
  el('guess-error').textContent = '';
  if (gameComplete) {
    showFinalOverlay(passphrase);
  } else if (levelJustBeaten === 1) {
    showGoodieOverlay(passphrase);
  } else {
    showDoorUnlockedOverlay(levelJustBeaten, passphrase);
  }
  refreshLeaderboard();
}

el('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('checkin-error').textContent = '';
  const nickname = el('nickname').value;
  const res = await fetch('/api/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.taken) {
      showNicknameTakenOverlay(data.session);
      return;
    }
    el('checkin-error').textContent = data.error || 'Something went wrong.';
    return;
  }
  await loadLevels();
  startGame(data.session);
});

function showNicknameTakenOverlay(existingSession) {
  const progress = existingSession.completedAll
    ? 'has already completed the Treasury'
    : `is currently on Door ${existingSession.currentLevel}`;
  showOverlay(`
    <h2>Nickname already in use</h2>
    <p>"${escapeHtml(existingSession.nickname)}" ${progress}.</p>
    <button class="primary" id="overlay-resume">Resume as ${escapeHtml(existingSession.nickname)}</button>
    <button class="secondary" id="overlay-pick-new">Choose a different nickname</button>
  `);
  el('overlay-resume').addEventListener('click', async () => {
    hideOverlay();
    const res = await fetch(`/api/session/${existingSession.id}`);
    if (res.ok) {
      const data = await res.json();
      startGame(data.session);
    }
  });
  el('overlay-pick-new').addEventListener('click', () => {
    hideOverlay();
    const input = el('nickname');
    input.value = '';
    input.focus();
  });
}

const chatInput = el('chat-message');
function autoGrowChatInput() {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${chatInput.scrollHeight}px`;
}
chatInput.addEventListener('input', autoGrowChatInput);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    el('chat-form').requestSubmit();
  }
});

el('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  addMessage('user', message);
  chatInput.value = '';
  autoGrowChatInput();
  chatInput.disabled = true;
  showTypingIndicator();

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId, message }),
  });
  const data = await res.json();
  hideTypingIndicator();
  chatInput.disabled = false;
  chatInput.focus();

  if (!res.ok) {
    addMessage('guardian', data.error || 'Something went wrong.');
    return;
  }

  addMessage(data.unlocked ? 'unlocked' : 'guardian', data.reply);

  if (data.unlocked) {
    handleUnlock(data.level, data.passphrase, data.gameComplete, data.session);
  }
});

el('guess-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = el('guess-message');
  const guess = input.value.trim();
  if (!guess) return;
  el('guess-error').textContent = '';
  input.disabled = true;

  const res = await fetch('/api/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId, guess }),
  });
  const data = await res.json();
  input.disabled = false;

  if (!res.ok) {
    el('guess-error').textContent = data.error || 'Something went wrong.';
    return;
  }

  if (!data.correct) {
    el('guess-error').textContent = 'Not quite -- try again.';
    input.focus();
    return;
  }

  handleUnlock(data.level, data.passphrase, data.gameComplete, data.session);
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
