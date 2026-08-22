// Minimal keyword-based safety net for the public booth screen. This is a POC-grade
// filter, not a moderation system -- catches the obvious cases so a jailbreak can't
// put something offensive on a public monitor at the booth. Independent of secret-leak logic.
const BLOCKLIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'bastard',
  'nigger', 'faggot', 'retard', 'whore', 'slut',
  'kill yourself', 'kys',
];

export function isOffensive(text) {
  const lower = text.toLowerCase();
  return BLOCKLIST.some((w) => lower.includes(w));
}

export const SAFE_FALLBACK =
  "[This response was filtered by the booth's content policy. Try a different approach!]";
