import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { challengeSpecs } from "./challenges.js";
const now = new Date();
const inPast = new Date(now.getTime() - 86400000).toISOString();
const inFuture = new Date(now.getTime() + 30*86400000).toISOString();
const insertUser = db.prepare("INSERT OR IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,?)");
insertUser.run("OFFGRID Organizer", process.env.SEED_ORGANIZER_EMAIL || "organizer@offgrid.local",
  bcrypt.hashSync(process.env.SEED_ORGANIZER_PASSWORD || "ChangeThisLocalOnly!42", 12), "organizer");
insertUser.run("OFFGRID Admin", "admin@offgrid.local",
  bcrypt.hashSync(process.env.SEED_ADMIN_PASSWORD || "ChangeThisAdminOnly!42", 12), "admin");
db.prepare(`INSERT OR IGNORE INTO competitions(slug,title,description,starts_at,ends_at,status,rules)
 VALUES(?,?,?,?,?,'active',?)`).run("offgrid-launch", "OFFGRID Launch CTF",
 "A beginner-friendly 50-challenge cybersecurity arena. All artifacts are synthetic and designed for safe local practice.",
 inPast, inFuture,
 "Only attack supplied training artifacts. Do not attack the platform, other participants, or third-party systems. Do not share flags during an active event. Respect organizers and other players.");
const competition = db.prepare("SELECT id FROM competitions WHERE slug='offgrid-launch'").get() as {id:number};
const insertChallenge = db.prepare(`INSERT OR IGNORE INTO challenges
(slug,title,description,instructions,category,difficulty,points,flag,flag_format,enabled,artifact_path,solution)
VALUES(?,?,?,?,?,?,?,?,?,1,?,?)`);
const insertHint = db.prepare("INSERT INTO hints(challenge_id,body,cost) SELECT id,?,0 FROM challenges WHERE slug=? AND NOT EXISTS(SELECT 1 FROM hints WHERE challenge_id=challenges.id)");
const insertArtifact = db.prepare("INSERT OR IGNORE INTO competition_participants(competition_id,user_id) SELECT ?,id FROM users WHERE email=?");
for (const [i,c] of challengeSpecs.entries()) {
  const slug = `challenge-${String(i+1).padStart(2,"0")}`;
  const artifactPath = path.resolve(process.cwd(), `../artifacts/challenge-${String(i+1).padStart(2,"0")}/${c.artifact}`);
  insertChallenge.run(slug,c.title,c.description,c.instructions,c.category,c.difficulty,c.points,c.flag,"OFFGRID{...}",artifactPath,c.solution);
  insertHint.run(c.hint,slug);
}
const organizer = db.prepare("SELECT id FROM users WHERE email=?").get(process.env.SEED_ORGANIZER_EMAIL || "organizer@offgrid.local") as {id:number};
db.prepare("INSERT OR IGNORE INTO competition_participants(competition_id,user_id) VALUES(?,?)").run(competition.id,organizer.id);
console.log(`Seed complete: ${db.prepare("SELECT COUNT(*) n FROM challenges").get().n} challenges; categories:`);
console.table(db.prepare("SELECT category,COUNT(*) AS count FROM challenges GROUP BY category").all());
console.log(`Local organizer: ${process.env.SEED_ORGANIZER_EMAIL || "organizer@offgrid.local"} / ${process.env.SEED_ORGANIZER_PASSWORD || "ChangeThisLocalOnly!42"}`);
