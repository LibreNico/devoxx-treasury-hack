import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || `${__dirname}/../data/sessions.json`;

function ensureFile() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  if (!existsSync(DB_PATH)) writeFileSync(DB_PATH, JSON.stringify({ sessions: [] }, null, 2));
}

function load() {
  ensureFile();
  return JSON.parse(readFileSync(DB_PATH, 'utf-8'));
}

function save(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function findSessionByEmail(email) {
  const db = load();
  const norm = email.trim().toLowerCase();
  return db.sessions.find((s) => s.email === norm);
}

export function createSession({ nickname, email }) {
  const db = load();
  const now = Date.now();
  const session = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    nickname: nickname.trim().slice(0, 40),
    email: email.trim().toLowerCase(),
    startedAt: now,
    currentLevel: 1,
    maxLevelReached: 0,
    maxLevelReachedAt: now,
    completedAllAt: null,
    history: {},
  };
  db.sessions.push(session);
  save(db);
  return session;
}

export function getSession(id) {
  const db = load();
  return db.sessions.find((s) => s.id === id);
}

export function updateSession(id, patch) {
  const db = load();
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error('session not found');
  db.sessions[idx] = { ...db.sessions[idx], ...patch };
  save(db);
  return db.sessions[idx];
}

export function appendHistory(id, level, entries) {
  const db = load();
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error('session not found');
  const session = db.sessions[idx];
  session.history[level] = [...(session.history[level] || []), ...entries];
  save(db);
  return session;
}

export function getLeaderboard(limit = 3) {
  const db = load();
  return db.sessions
    .filter((s) => s.maxLevelReached > 0)
    .map((s) => ({
      nickname: s.nickname,
      maxLevelReached: s.maxLevelReached,
      elapsedMs: s.maxLevelReachedAt - s.startedAt,
      completedAll: !!s.completedAllAt,
    }))
    .sort((a, b) => b.maxLevelReached - a.maxLevelReached || a.elapsedMs - b.elapsedMs)
    .slice(0, limit);
}

export function getAllSessions() {
  return load().sessions;
}
