import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS, MAX_LEVEL, getLevel } from './levels.js';
import { chatWithGuardian, judgeLeak, containsSecret, redactLiteral } from './ollama.js';
import { isOffensive, SAFE_FALLBACK } from './moderation.js';
import {
  findSessionByEmail,
  createSession,
  getSession,
  updateSession,
  appendHistory,
  getLeaderboard,
  getAllSessions,
} from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Level metadata safe to send to the client -- never includes secret or systemPrompt.
function publicLevels() {
  return LEVELS.map((l) => ({
    id: l.id,
    name: l.name,
    guardian: l.guardian,
    intro: l.intro,
    avatar: `avatars/${l.id}-${l.guardian.toLowerCase()}.svg`,
  }));
}

app.get('/api/levels', (_req, res) => {
  res.json({ levels: publicLevels(), maxLevel: MAX_LEVEL });
});

app.post('/api/checkin', (req, res) => {
  const { nickname, email, consent } = req.body || {};
  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ error: 'Nickname is required.' });
  }
  if (!email || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!consent) {
    return res.status(400).json({ error: 'Consent is required to play.' });
  }

  const existing = findSessionByEmail(email);
  if (existing) {
    // Same person resuming (page refresh, browser closed) -- not a fresh play.
    return res.json({ session: toClientSession(existing), resumed: true });
  }

  const session = createSession({ nickname, email });
  res.json({ session: toClientSession(session), resumed: false });
});

app.get('/api/session/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  res.json({ session: toClientSession(session) });
});

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body || {};
  const session = sessionId && getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });
  if (session.currentLevel > MAX_LEVEL) {
    return res.status(400).json({ error: 'You have already conquered the Treasury.' });
  }

  const level = getLevel(session.currentLevel);
  const history = session.history[level.id] || [];

  let rawReply;
  try {
    rawReply = await chatWithGuardian(level.systemPrompt, history, message);
  } catch (err) {
    console.error('Ollama call failed:', err.message);
    return res.status(502).json({ error: 'The Guardian is unreachable. Try again in a moment.' });
  }

  let leaked = containsSecret(level.secret, rawReply);
  if (!leaked && level.useJudge) {
    leaked = await judgeLeak(level.secret, rawReply);
  }

  let displayText = rawReply;
  if (level.useFilter) displayText = redactLiteral(level.secret, displayText);
  if (isOffensive(displayText)) displayText = SAFE_FALLBACK;

  appendHistory(session.id, level.id, [
    { role: 'user', content: message },
    { role: 'assistant', content: rawReply },
  ]);

  let updated = session;
  let gameComplete = false;
  if (leaked) {
    const now = Date.now();
    const nextLevel = level.id + 1;
    gameComplete = nextLevel > MAX_LEVEL;
    updated = updateSession(session.id, {
      currentLevel: nextLevel,
      maxLevelReached: level.id,
      maxLevelReachedAt: now,
      completedAllAt: gameComplete ? now : null,
    });
  }

  res.json({
    reply: displayText,
    unlocked: leaked,
    level: level.id,
    guardian: level.guardian,
    passphrase: leaked ? level.secret : undefined,
    gameComplete,
    session: toClientSession(updated),
  });
});

app.get('/api/leaderboard', (_req, res) => {
  res.json({ top: getLeaderboard(3) });
});

// End-of-day export for merging results across the 3-4 independent laptops.
app.get('/api/export', (_req, res) => {
  const sessions = getAllSessions().map((s) => ({
    nickname: s.nickname,
    email: s.email,
    maxLevelReached: s.maxLevelReached,
    elapsedMs: s.maxLevelReachedAt - s.startedAt,
    completedAll: !!s.completedAllAt,
  }));
  res.json({ sessions });
});

function toClientSession(session) {
  return {
    id: session.id,
    nickname: session.nickname,
    currentLevel: session.currentLevel,
    maxLevelReached: session.maxLevelReached,
    completedAll: !!session.completedAllAt,
  };
}

app.listen(PORT, () => {
  console.log(`Treasury booth game running at http://localhost:${PORT}`);
});
