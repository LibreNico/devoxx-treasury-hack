import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS, MAX_LEVEL, getLevel } from './levels.js';
import { chatWithGuardian, judgeLeak, containsSecret, redactLiteral, matchesSecret } from './ollama.js';
import { isOffensive, SAFE_FALLBACK } from './moderation.js';
import {
  findSessionByNickname,
  createSession,
  getSession,
  updateSession,
  appendHistory,
  incrementMessageCount,
  getLeaderboard,
  getAllSessions,
} from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

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
  const { nickname } = req.body || {};
  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ error: 'Nickname is required.' });
  }
  // Nicknames are the only identity now (no email). A taken nickname doesn't hard-fail --
  // the client offers to resume that session or pick a different name instead.
  const existing = findSessionByNickname(nickname);
  if (existing) {
    return res.status(409).json({
      error: 'That nickname is already taken.',
      taken: true,
      session: toClientSession(existing),
    });
  }

  const session = createSession({ nickname });
  res.json({ session: toClientSession(session), taken: false });
});

// Maps stored assistant replies through the same redaction/moderation pipeline
// live chat uses, so resuming a session never shows more than a live reply would have.
function sanitizeHistoryForClient(level, history) {
  return history.map((entry) => {
    if (entry.role !== 'assistant') return entry;
    let content = entry.content;
    if (level.useFilter) content = redactLiteral(level.secret, content);
    if (isOffensive(content)) content = SAFE_FALLBACK;
    return { role: entry.role, content };
  });
}

app.get('/api/session/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const level = getLevel(session.currentLevel);
  const history = level ? sanitizeHistoryForClient(level, session.history[level.id] || []) : [];
  res.json({ session: { ...toClientSession(session), history } });
});

// Advances a session past the level it just beat (via chat leak or an explicit guess).
function advanceLevel(session, level) {
  const now = Date.now();
  const nextLevel = level.id + 1;
  const gameComplete = nextLevel > MAX_LEVEL;
  const updated = updateSession(session.id, {
    currentLevel: nextLevel,
    maxLevelReached: level.id,
    maxLevelReachedAt: now,
    completedAllAt: gameComplete ? now : null,
  });
  return { updated, gameComplete };
}

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
  incrementMessageCount(session.id);

  let updated = session;
  let gameComplete = false;
  if (leaked) {
    ({ updated, gameComplete } = advanceLevel(session, level));
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

// Explicit "enter the passphrase" guess, alongside the chat auto-detect above --
// lets a player who spotted/inferred the secret submit it directly.
app.post('/api/guess', (req, res) => {
  const { sessionId, guess } = req.body || {};
  const session = sessionId && getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!guess || !guess.trim()) return res.status(400).json({ error: 'Enter a passphrase to submit.' });
  if (session.currentLevel > MAX_LEVEL) {
    return res.status(400).json({ error: 'You have already conquered the Treasury.' });
  }

  const level = getLevel(session.currentLevel);
  if (!matchesSecret(level.secret, guess)) {
    return res.json({ correct: false });
  }

  const { updated, gameComplete } = advanceLevel(session, level);
  res.json({
    correct: true,
    level: level.id,
    guardian: level.guardian,
    passphrase: level.secret,
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
    maxLevelReached: s.maxLevelReached,
    elapsedMs: s.maxLevelReachedAt - s.startedAt,
    messageCount: s.messageCount || 0,
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
