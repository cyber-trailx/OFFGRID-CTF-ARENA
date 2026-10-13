import { describe,it,expect } from "vitest";
import { challengeSpecs, categories } from "../src/challenges.js";
describe("OFFGRID seed data",()=>{
  it("contains exactly 50 challenges",()=>expect(challengeSpecs).toHaveLength(50));
  it("contains ten categories with five challenges each",()=>{
    expect(categories).toHaveLength(10);
    const counts=new Map<string,number>();
    challengeSpecs.forEach(c=>counts.set(c.category,(counts.get(c.category)||0)+1));
    expect([...counts.values()].every(n=>n===5)).toBe(true);
    expect(counts.size).toBe(10);
  });
  it("uses unique flags and required format",()=>{
    expect(new Set(challengeSpecs.map(c=>c.flag)).size).toBe(50);
    expect(challengeSpecs.every(c => /^OFFGRID\{[a-z0-9_]+\}$/.test(c.flag))).toBe(true);
  });
  it("includes artifacts and solutions for every challenge",()=>{
    expect(challengeSpecs.every(c=>c.artifact && c.artifactContent && c.solution.length>10)).toBe(true);
  });
});
