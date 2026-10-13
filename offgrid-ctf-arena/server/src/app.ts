import express from "express";
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db, audit } from "./db.js";
import { fileURLToPath } from "node:url";

const SQLiteStore = connectSqlite3(session);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sessionsDir = path.resolve(__dirname, "../sessions");

fs.mkdirSync(sessionsDir, { recursive: true });
export const app = express();
const isProd = process.env.NODE_ENV === "production";
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "32kb" }));
app.use(session({
 store: new SQLiteStore({
  db: "sessions.sqlite",
  dir: sessionsDir,
}),
  name: "offgrid.sid", secret: process.env.SESSION_SECRET || "dev-only-change-this-session-secret-please",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 1000*60*60*8 }
}));
type User = { id:number; name:string; email:string; role:"participant"|"organizer"|"admin"; disabled:number };
declare module "express-session" { interface SessionData { userId?: number; csrfToken?: string } }
const authLimiter = rateLimit({ windowMs: 15*60*1000, limit: 25, standardHeaders: true, legacyHeaders: false });
const submitLimiter = rateLimit({ windowMs: 60*1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const safeUser = (u:User) => ({ id:u.id,name:u.name,email:u.email,role:u.role });
function currentUser(req: express.Request): User | undefined {
  if (!req.session.userId) return undefined;
  return db.prepare("SELECT id,name,email,role,disabled FROM users WHERE id=?").get(req.session.userId) as User | undefined;
}
function requireAuth(req:express.Request,res:express.Response,next:express.NextFunction) {
  const user=currentUser(req);
  if(!user || user.disabled) return res.status(401).json({error:"Sign in required"});
  (req as any).user=user; next();
}
function requireRole(...roles:string[]) {
  return (req:express.Request,res:express.Response,next:express.NextFunction) => {
    const user=currentUser(req);
    if(!user || user.disabled) return res.status(401).json({error:"Sign in required"});
    if(!roles.includes(user.role)) return res.status(403).json({error:"Insufficient permissions"});
    (req as any).user=user; next();
  };
}
function csrf(req:express.Request,res:express.Response,next:express.NextFunction) {
  if (["GET","HEAD","OPTIONS"].includes(req.method)) return next();
  const user=currentUser(req);
  if (!user) return next();
  const token=req.get("x-csrf-token");
  if(!req.session.csrfToken || token !== req.session.csrfToken) return res.status(403).json({error:"Invalid CSRF token"});
  next();
}
app.use("/api", (req,res,next)=> { if(req.path.startsWith("/auth/") && req.path !== "/auth/logout") return next(); csrf(req,res,next); });
app.get("/api/health",(_req,res)=>res.json({ok:true,service:"offgrid-ctf-arena"}));
app.get("/api/auth/csrf",(req,res)=> {
  req.session.csrfToken ||= crypto.randomBytes(24).toString("hex");
  res.json({csrfToken:req.session.csrfToken});
});
app.post("/api/auth/register",authLimiter, (req,res)=>{
  const schema=z.object({name:z.string().trim().min(2).max(60),email:z.string().trim().email().max(160),password:z.string().min(12).max(128)});
  const parsed=schema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:"Provide a name, valid email, and password of at least 12 characters"});
  const {name,email,password}=parsed.data;
  try {
    const result=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'participant')").run(name,email.toLowerCase(),bcrypt.hashSync(password,12));
    req.session.userId=Number(result.lastInsertRowid); req.session.csrfToken=crypto.randomBytes(24).toString("hex");
    const activeCompetition=db.prepare("SELECT id FROM competitions WHERE slug='offgrid-launch'").get() as any; if(activeCompetition) db.prepare("INSERT OR IGNORE INTO competition_participants(competition_id,user_id) VALUES(?,?)").run(activeCompetition.id,Number(result.lastInsertRowid));
    res.status(201).json({user:{id:Number(result.lastInsertRowid),name,email:email.toLowerCase(),role:"participant"},csrfToken:req.session.csrfToken});
  } catch { res.status(409).json({error:"An account with that email already exists"}); }
});
app.post("/api/auth/login",authLimiter,(req,res)=>{
  const parsed=z.object({email:z.string().email().max(160),password:z.string().min(1).max(128)}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:"Invalid email or password"});
  const user=db.prepare("SELECT * FROM users WHERE email=?").get(parsed.data.email.toLowerCase()) as any;
  if(!user || user.disabled || !bcrypt.compareSync(parsed.data.password,user.password_hash)) return res.status(401).json({error:"Invalid email or password"});
  req.session.regenerate(err=> {
    if(err) return res.status(500).json({error:"Unable to create session"});
    req.session.userId=user.id; req.session.csrfToken=crypto.randomBytes(24).toString("hex");
    const activeCompetition=db.prepare("SELECT id FROM competitions WHERE slug='offgrid-launch'").get() as any; if(activeCompetition) db.prepare("INSERT OR IGNORE INTO competition_participants(competition_id,user_id) VALUES(?,?)").run(activeCompetition.id,user.id);
    res.json({user:safeUser(user),csrfToken:req.session.csrfToken});
  });
});
app.post("/api/auth/logout",requireAuth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/auth/me",(req,res)=>{
  const u=currentUser(req); res.json({user:u&&!u.disabled?safeUser(u):null,csrfToken:req.session.csrfToken||null});
});
app.get("/api/competitions",(_req,res)=>{
  res.json(db.prepare("SELECT id,slug,title,description,starts_at AS startsAt,ends_at AS endsAt,status,rules FROM competitions ORDER BY id DESC").all());
});
app.post("/api/competitions/:id/join",requireAuth,(req,res)=>{
  const id=Number(req.params.id); const c=db.prepare("SELECT * FROM competitions WHERE id=?").get(id) as any;
  if(!c) return res.status(404).json({error:"Competition not found"});
  db.prepare("INSERT OR IGNORE INTO competition_participants(competition_id,user_id) VALUES(?,?)").run(id,(req as any).user.id);
  res.json({joined:true});
});
app.get("/api/challenges",requireAuth,(req,res)=>{
  const category=typeof req.query.category==="string"?req.query.category:undefined;
  const difficulty=typeof req.query.difficulty==="string"?req.query.difficulty:undefined;
  const search=typeof req.query.search==="string"?req.query.search.trim().slice(0,80):"";
  const where=["enabled=1"]; const args:any[]=[];
  if(category){where.push("category=?");args.push(category);}
  if(difficulty){where.push("difficulty=?");args.push(difficulty);}
  if(search){where.push("(title LIKE ? OR description LIKE ?)");args.push(`%${search}%`,`%${search}%`);}
  const rows=db.prepare(`SELECT id,slug,title,description,instructions,category,difficulty,points,flag_format AS flagFormat,artifact_path IS NOT NULL AS hasArtifact FROM challenges WHERE ${where.join(" AND ")} ORDER BY id`).all(...args) as any[];
  const uid=(req as any).user.id;
  const solved=db.prepare("SELECT challenge_id FROM solves WHERE user_id=? AND competition_id=(SELECT id FROM competitions WHERE slug='offgrid-launch')").all(uid).map((r:any)=>r.challenge_id);
  res.json(rows.map(c=>({...c,solved:solved.includes(c.id)})));
});
app.get("/api/challenges/:id",requireAuth,(req,res)=>{
  const c=db.prepare("SELECT id,slug,title,description,instructions,category,difficulty,points,flag_format AS flagFormat,artifact_path IS NOT NULL AS hasArtifact FROM challenges WHERE id=? AND enabled=1").get(Number(req.params.id)) as any;
  if(!c) return res.status(404).json({error:"Challenge not found"});
  const hints=db.prepare("SELECT id,body,cost FROM hints WHERE challenge_id=? ORDER BY id").all(c.id);
  const solved=!!db.prepare("SELECT 1 FROM solves WHERE user_id=? AND challenge_id=? AND competition_id=(SELECT id FROM competitions WHERE slug='offgrid-launch')").get((req as any).user.id,c.id);
  res.json({...c,hints,solved});
});
app.get("/api/challenges/:id/artifact",requireAuth,(req,res)=>{
  const c=db.prepare("SELECT title,artifact_path FROM challenges WHERE id=? AND enabled=1").get(Number(req.params.id)) as any;
  if(!c || !c.artifact_path) return res.status(404).json({error:"Artifact not found"});
  const base=path.resolve(process.cwd(),"../artifacts")+path.sep;
  const target=path.resolve(c.artifact_path);
  if(!target.startsWith(base) || !fs.existsSync(target)) return res.status(404).json({error:"Artifact not found"});
  res.download(target,path.basename(target));
});
app.post("/api/challenges/:id/submit",requireAuth,submitLimiter,(req,res)=>{
  const parsed=z.object({flag:z.string().min(1).max(256)}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:"Submit a flag up to 256 characters"});
  const challenge=db.prepare("SELECT * FROM challenges WHERE id=? AND enabled=1").get(Number(req.params.id)) as any;
  if(!challenge) return res.status(404).json({error:"Challenge not found or disabled"});
  const competition=db.prepare("SELECT * FROM competitions WHERE slug='offgrid-launch'").get() as any;
  if(!competition || competition.status!=="active" || Date.now()<Date.parse(competition.starts_at) || Date.now()>Date.parse(competition.ends_at))
    return res.status(409).json({error:"This competition is not accepting scoring submissions"});
  const user=(req as any).user as User;
  if(!db.prepare("SELECT 1 FROM competition_participants WHERE competition_id=? AND user_id=?").get(competition.id,user.id))
    return res.status(403).json({error:"Join the competition before submitting"});
  // Exact comparison: no trimming or case folding. Canonical flags never leave the server.
  const expected=Buffer.from(challenge.flag,"utf8"), submitted=Buffer.from(parsed.data.flag,"utf8");
  const correct=expected.length===submitted.length && crypto.timingSafeEqual(expected,submitted);
  let newlySolved=false;
  const tx=db.transaction(()=>{
    db.prepare("INSERT INTO submissions(user_id,challenge_id,competition_id,is_correct) VALUES(?,?,?,?)").run(user.id,challenge.id,competition.id,correct?1:0);
    if(correct) { const result=db.prepare("INSERT OR IGNORE INTO solves(user_id,challenge_id,competition_id,points_awarded) VALUES(?,?,?,?)").run(user.id,challenge.id,competition.id,challenge.points); newlySolved=result.changes===1; }
  });
  tx();
  const already=correct && !newlySolved;
  res.json(correct?{correct:true,alreadySolved:!!already,message:already?"Correct flag. Points were already awarded.":"Correct flag! Challenge solved."}:{correct:false,message:"Incorrect flag. Review the challenge and try again."});
});
app.get("/api/leaderboard",(req,res)=>{
  const c=db.prepare("SELECT id FROM competitions WHERE slug='offgrid-launch'").get() as any;
  if(!c) return res.json([]);
  res.json(db.prepare(`SELECT u.id,u.name,COALESCE(SUM(s.points_awarded),0) AS score,COUNT(s.id) AS solved,
    MIN(s.first_solved_at) AS firstSolve
    FROM competition_participants cp JOIN users u ON u.id=cp.user_id
    LEFT JOIN solves s ON s.user_id=u.id AND s.competition_id=cp.competition_id
    WHERE cp.competition_id=? AND u.disabled=0
    GROUP BY u.id ORDER BY score DESC, solved DESC, firstSolve ASC, u.name COLLATE NOCASE ASC`).all(c.id));
});
app.get("/api/me/progress",requireAuth,(req,res)=>{
  const u=(req as any).user as User; const c=db.prepare("SELECT id FROM competitions WHERE slug='offgrid-launch'").get() as any;
  const score=db.prepare("SELECT COALESCE(SUM(points_awarded),0) score,COUNT(*) solved FROM solves WHERE user_id=? AND competition_id=?").get(u.id,c?.id||-1);
  const recent=db.prepare("SELECT c.title,c.category,s.points_awarded AS points,s.first_solved_at AS solvedAt FROM solves s JOIN challenges c ON c.id=s.challenge_id WHERE s.user_id=? AND s.competition_id=? ORDER BY s.first_solved_at DESC").all(u.id,c?.id||-1);
  res.json({score,...score,solves:recent});
});
app.get("/api/announcements",(_req,res)=>{
  const c=db.prepare("SELECT id FROM competitions WHERE slug='offgrid-launch'").get() as any;
  res.json(c?db.prepare("SELECT id,title,body,created_at AS createdAt FROM announcements WHERE competition_id=? ORDER BY id DESC").all(c.id):[]);
});
app.get("/api/organizer/challenges",requireRole("organizer","admin"),(_req,res)=>{
  res.json(db.prepare("SELECT id,slug,title,category,difficulty,points,enabled,artifact_path IS NOT NULL AS hasArtifact FROM challenges ORDER BY id").all());
});
app.post("/api/organizer/challenges",requireRole("organizer","admin"),(req,res)=>{
  const p=z.object({title:z.string().min(3).max(120),description:z.string().min(10).max(2000),instructions:z.string().min(5).max(4000),category:z.enum(["Web Security","Cryptography","Digital Forensics","Linux and System Security","Networking","Reverse Engineering","Binary Exploitation","OSINT","Steganography","Programming and Miscellaneous"]),difficulty:z.enum(["Beginner","Easy","Intermediate"]),points:z.number().int().min(50).max(1000),flag:z.string().regex(/^OFFGRID\\{[a-zA-Z0-9_!-]+\\}$/),solution:z.string().min(10).max(4000)}).safeParse(req.body);
  if(!p.success) return res.status(400).json({error:"Invalid challenge data",details:p.error.flatten()});
  const slug="custom-"+crypto.randomBytes(6).toString("hex");
  const r=db.prepare(`INSERT INTO challenges(slug,title,description,instructions,category,difficulty,points,flag,solution,enabled)
  VALUES(?,?,?,?,?,?,?,?,?,0)`).run(slug,p.data.title,p.data.description,p.data.instructions,p.data.category,p.data.difficulty,p.data.points,p.data.flag,p.data.solution);
  audit((req as any).user.id,"challenge.created","challenge",r.lastInsertRowid);
  res.status(201).json({id:r.lastInsertRowid,slug,enabled:false});
});
app.patch("/api/organizer/challenges/:id/status",requireRole("organizer","admin"),(req,res)=>{
  const p=z.object({enabled:z.boolean()}).safeParse(req.body); if(!p.success)return res.status(400).json({error:"enabled must be boolean"});
  const r=db.prepare("UPDATE challenges SET enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(p.data.enabled?1:0,Number(req.params.id));
  if(!r.changes)return res.status(404).json({error:"Challenge not found"});
  audit((req as any).user.id,"challenge.status_changed","challenge",req.params.id,p.data);
  res.json({ok:true});
});
app.get("/api/organizer/answer-key",requireRole("organizer","admin"),(_req,res)=>{
  res.json(db.prepare("SELECT id,title,category,difficulty,points,flag AS canonicalFlag,solution FROM challenges ORDER BY id").all());
});
app.get("/api/organizer/submissions",requireRole("organizer","admin"),(_req,res)=>{
  res.json(db.prepare(`SELECT s.id,u.name AS participant,c.title AS challenge,s.is_correct AS correct,s.created_at AS createdAt
  FROM submissions s JOIN users u ON u.id=s.user_id JOIN challenges c ON c.id=s.challenge_id ORDER BY s.id DESC LIMIT 500`).all());
});
app.get("/api/organizer/stats",requireRole("organizer","admin"),(_req,res)=>{
  res.json({users:db.prepare("SELECT COUNT(*) n FROM users").get().n,challenges:db.prepare("SELECT COUNT(*) n FROM challenges").get().n,submissions:db.prepare("SELECT COUNT(*) n FROM submissions").get().n,solves:db.prepare("SELECT COUNT(*) n FROM solves").get().n});
});
app.get("/api/admin/users",requireRole("admin"),(_req,res)=>res.json(db.prepare("SELECT id,name,email,role,disabled,created_at AS createdAt FROM users ORDER BY id").all()));
app.patch("/api/admin/users/:id",requireRole("admin"),(req,res)=>{
  const p=z.object({role:z.enum(["participant","organizer","admin"]).optional(),disabled:z.boolean().optional()}).refine(v=>Object.keys(v).length>0).safeParse(req.body);
  if(!p.success)return res.status(400).json({error:"Provide role and/or disabled"});
  const target=Number(req.params.id);
  if(target===(req as any).user.id && p.data.disabled)return res.status(400).json({error:"You cannot disable your own account"});
  if(p.data.role)db.prepare("UPDATE users SET role=? WHERE id=?").run(p.data.role,target);
  if(p.data.disabled!==undefined)db.prepare("UPDATE users SET disabled=? WHERE id=?").run(p.data.disabled?1:0,target);
  audit((req as any).user.id,"user.updated","user",target,p.data); res.json({ok:true});
});
app.get("/api/admin/audit-logs",requireRole("admin"),(_req,res)=>res.json(db.prepare("SELECT id,actor_id AS actorId,action,target_type AS targetType,target_id AS targetId,detail,created_at AS createdAt FROM audit_logs ORDER BY id DESC LIMIT 500").all()));
app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  console.error("Request failed:",isProd?"internal error":err?.message);
  res.status(500).json({error:isProd?"Internal server error":"Request failed"});
});
