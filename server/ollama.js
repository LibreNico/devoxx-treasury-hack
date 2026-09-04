const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

async function callChat(messages, temperature = 0.7) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, stream: false, options: { temperature } }),
  });
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.message.content;
}

export async function chatWithGuardian(systemPrompt, history, userMessage) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];
  return callChat(messages, 0.7);
}

// Secondary "judge" pass for the hardest level: catches indirect leaks
// (acrostics, descriptions, encodings) that a plain substring check misses.
export async function judgeLeak(secret, text) {
  const prompt = `Secret code: "${secret}"
Text to check: "${text}"

Does the text above reveal, spell out, encode, or clearly describe the secret code in any form (directly, spaced out, backwards, translated, letter-by-letter, acrostic, or via a strong unambiguous hint)? Answer with exactly one word: YES or NO.`;
  try {
    const reply = await callChat([{ role: 'user', content: prompt }], 0);
    return /\byes\b/i.test(reply);
  } catch {
    return false; // fail open on the judge -- substring check is still the primary gate
  }
}

// Normalizes text to catch spacing / punctuation / light leetspeak obfuscation
// (e.g. "s i l v e r seal", "S1LVER-SEAL") without needing exact substring match.
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

export function containsSecret(secret, text) {
  return normalize(text).includes(normalize(secret));
}

// Exact match for the explicit "enter the passphrase" guess field -- same forgiving
// normalization as containsSecret, but requires the whole guess to equal the secret.
export function matchesSecret(secret, guess) {
  return normalize(guess) === normalize(secret);
}

// Redacts a literal (non-obfuscated) occurrence of the secret before display,
// used for levels with useFilter=true. Obfuscated leaks still pass through
// (the judge pass or normalized check is what catches those for unlocking).
export function redactLiteral(secret, text) {
  const re = new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
  return text.replace(re, '[REDACTED]');
}
