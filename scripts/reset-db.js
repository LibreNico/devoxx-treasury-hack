// Staff-only cleanup: wipes this laptop's session/leaderboard data at end of day.
// Deliberately a CLI script, not a UI button -- keeps it out of reach of players
// on the kiosk screen. Run: npm run reset-db
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'sessions.json');

writeFileSync(DB_PATH, JSON.stringify({ sessions: [] }, null, 2));
console.log(`Cleared all sessions from ${DB_PATH}`);
