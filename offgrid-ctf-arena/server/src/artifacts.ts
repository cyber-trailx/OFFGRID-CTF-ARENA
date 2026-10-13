import fs from "node:fs";
import path from "node:path";
import { challengeSpecs } from "./challenges.js";
const root = path.resolve(process.cwd(), "../artifacts");
fs.mkdirSync(root, { recursive: true });
for (const [i, c] of challengeSpecs.entries()) {
  const dir = path.join(root, `challenge-${String(i+1).padStart(2,"0")}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, c.artifact), `${c.artifactContent}\n`, "utf8");
  fs.writeFileSync(path.join(dir, "README.txt"),
    `OFFGRID CTF ARENA — ${c.title}\n\n${c.description}\n\n${c.instructions}\n\nTraining artifact only. No real systems or people are involved.\n`, "utf8");
}
console.log(`Generated ${challengeSpecs.length} self-contained challenge artifact directories in ${root}`);
