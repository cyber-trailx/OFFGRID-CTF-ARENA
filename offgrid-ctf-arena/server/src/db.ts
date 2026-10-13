import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
const dbPath = process.env.DATABASE_PATH || "./data/offgrid.sqlite";
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'participant' CHECK(role IN ('participant','organizer','admin')),
 disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS competitions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 description TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('upcoming','active','ended')),
 rules TEXT NOT NULL DEFAULT 'Be respectful. Attack only the supplied training artifacts. Do not attack the platform or other participants.',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS competition_participants (
 competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(competition_id,user_id)
);
CREATE TABLE IF NOT EXISTS challenges (
 id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 description TEXT NOT NULL, instructions TEXT NOT NULL, category TEXT NOT NULL,
 difficulty TEXT NOT NULL CHECK(difficulty IN ('Beginner','Easy','Intermediate')),
 points INTEGER NOT NULL CHECK(points > 0), flag TEXT NOT NULL, flag_format TEXT NOT NULL DEFAULT 'OFFGRID{...}',
 enabled INTEGER NOT NULL DEFAULT 1, artifact_path TEXT, solution TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS hints (
 id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
 body TEXT NOT NULL, cost INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS submissions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 challenge_id INTEGER NOT NULL REFERENCES challenges(id), competition_id INTEGER NOT NULL REFERENCES competitions(id),
 is_correct INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS solves (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 challenge_id INTEGER NOT NULL REFERENCES challenges(id), competition_id INTEGER NOT NULL REFERENCES competitions(id),
 points_awarded INTEGER NOT NULL, first_solved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id, challenge_id, competition_id)
);
CREATE TABLE IF NOT EXISTS announcements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
 title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
 target_type TEXT NOT NULL, target_id TEXT, detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_submissions_competition ON submissions(competition_id, created_at);
CREATE INDEX IF NOT EXISTS idx_solves_leaderboard ON solves(competition_id, points_awarded);
CREATE INDEX IF NOT EXISTS idx_challenges_category ON challenges(category, difficulty);
`);
export function audit(actorId: number | null, action: string, targetType: string, targetId: string | number | null, detail = {}) {
  db.prepare("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES(?,?,?,?,?)")
    .run(actorId, action, targetType, targetId == null ? null : String(targetId), JSON.stringify(detail));
}
