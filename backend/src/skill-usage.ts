/**
 * Skill usage + lifecycle state tracker.
 *
 * A lightweight JSON sidecar (`data/skill_usage.json`) that records, per
 * agent-created skill:
 *   - createdAt / lastActivityAt timestamps
 *   - viewCount (how often skill_view loaded it)
 *   - lifecycle state: active | stale | archived
 *   - pinned flag (pin protects from archive/stale transitions)
 *
 * Why a sidecar instead of frontmatter: the curator needs to flip state and
 * bump timestamps frequently without rewriting SKILL.md files (which would
 * thrash the skills cache and lose the human-authored body formatting).
 *
 * Only AGENT-CREATED skills are tracked here. Bundled skills (shipped in the
 * repo, never `recordCreate`-d) are intentionally absent, so the curator can
 * never archive a skill a human shipped. `getSkillIndexText()` consults
 * `isArchived()` so archived skills drop out of the system-prompt index
 * without being deleted from disk.
 *
 * Zero imports beyond fs/path — keeps this safe to import from `skills.ts`
 * without any module cycle.
 */

import * as fs from "fs";
import * as path from "path";

export type SkillLifecycleState = "active" | "stale" | "archived";

export interface SkillUsageRecord {
  name: string;
  createdByAgent: boolean;
  createdAt: number;
  lastActivityAt: number;
  viewCount: number;
  state: SkillLifecycleState;
  pinned: boolean;
}

const USAGE_FILE = path.resolve(__dirname, "../data/skill_usage.json");

type UsageMap = Record<string, SkillUsageRecord>;

let cache: UsageMap | null = null;
let persistEnabled = true;

function load(): UsageMap {
  if (cache) return cache;
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
      cache = parsed && typeof parsed === "object" ? parsed : {};
    } else {
      cache = {};
    }
  } catch (err) {
    console.warn(`[skill-usage] failed to load ${USAGE_FILE}: ${(err as any)?.message ?? err}`);
    cache = {};
  }
  return cache!;
}

function save(): void {
  if (!cache) return;
  if (!persistEnabled) return;
  try {
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.warn(`[skill-usage] failed to save ${USAGE_FILE}: ${(err as any)?.message ?? err}`);
  }
}

/** Record that the agent created a skill (marks it curator-eligible). */
export function recordCreate(name: string): void {
  const map = load();
  const now = Date.now();
  const existing = map[name];
  map[name] = {
    name,
    createdByAgent: true,
    createdAt: existing?.createdAt ?? now,
    lastActivityAt: now,
    viewCount: existing?.viewCount ?? 0,
    state: "active",
    pinned: existing?.pinned ?? false,
  };
  save();
}

/** Record activity (view / update / re-use). Reactivates a stale skill. */
export function recordActivity(name: string): void {
  const map = load();
  const now = Date.now();
  const existing = map[name];
  if (!existing) {
    // First time we see it via activity (e.g. a viewed bundled skill). Track
    // activity but DON'T mark it agent-created — bundled skills stay
    // curator-exempt.
    map[name] = {
      name,
      createdByAgent: false,
      createdAt: now,
      lastActivityAt: now,
      viewCount: 1,
      state: "active",
      pinned: false,
    };
  } else {
    existing.lastActivityAt = now;
    existing.viewCount += 1;
    if (existing.state === "stale") existing.state = "active"; // used again → revive
  }
  save();
}

export function getRecord(name: string): SkillUsageRecord | null {
  return load()[name] ?? null;
}

export function isArchived(name: string): boolean {
  return load()[name]?.state === "archived";
}

export function setState(name: string, state: SkillLifecycleState): void {
  const map = load();
  const rec = map[name];
  if (!rec) return;
  rec.state = state;
  save();
}

export function setPinned(name: string, pinned: boolean): boolean {
  const map = load();
  const rec = map[name];
  if (!rec) return false;
  rec.pinned = pinned;
  save();
  return true;
}

/** All agent-created skill records (the curator's working set). */
export function agentCreatedReport(): SkillUsageRecord[] {
  return Object.values(load()).filter((r) => r.createdByAgent);
}

/** Forget a skill's usage record (e.g. when the skill is deleted). */
export function forget(name: string): void {
  const map = load();
  if (map[name]) {
    delete map[name];
    save();
  }
}

/** Test-only: reset in-memory cache so a fresh file is read. */
export function _resetUsageCacheForTests(): void {
  cache = null;
}

/** Test-only: overwrite the in-memory usage map without touching disk. */
export function _seedUsageForTests(records: SkillUsageRecord[]): void {
  persistEnabled = false;
  cache = {};
  for (const r of records) cache[r.name] = { ...r };
}
