/**
 * ============================================================================
 * SKILL SYSTEM
 * ============================================================================
 * Procedural memory for the agent — inspired by Hermes Agent's SKILL.md system.
 *
 * Each skill is a self-contained workflow stored as a Markdown file with YAML
 * front-matter:
 *
 *     ---
 *     name: example-skill
 *     description: One-line summary shown in the system prompt index.
 *     tags: tag1, tag2
 *     ---
 *
 *     # Body (full step-by-step workflow the model reads when it loads the skill)
 *
 * The model never sees the full body in the system prompt — only an index of
 * (name, description). When a task matches a skill, the model calls
 * `skill_view(name)` to load the full body. This keeps the static prompt small
 * while giving the agent access to many specialized workflows on demand.
 *
 * `skill_manage(action="create")` lets the agent persist new skills it learns
 * during a successful run (closed-loop learning).
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { isArchived, recordCreate, recordActivity, forget } from "./skill-usage";

export interface SkillMetadata {
  name: string;
  description: string;
  tags: string[];
  /** Absolute path to the SKILL.md file. */
  filePath: string;
}

export interface Skill extends SkillMetadata {
  body: string;
}

const SKILLS_DIR = path.resolve(__dirname, "../context/skills");
const SKILL_FILE_BASENAME = "SKILL.md";
const NAME_REGEX = /^[a-z0-9][a-z0-9-]{1,62}$/;
const MAX_BODY_CHARS = 16_000;
const MAX_DESCRIPTION_CHARS = 200;
const MAX_INDEX_LINES = 120;

let cache: Skill[] | null = null;

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

/**
 * Parse YAML-ish front-matter (only flat `key: value` pairs) from a Markdown
 * file. Avoids pulling in a full YAML dependency for what is intentionally a
 * very small surface area.
 */
function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }

  return { meta, body: match[2].trim() };
}

function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Discover all SKILL.md files under `backend/context/skills`.
 * Layout supported:
 *   backend/context/skills/<skill-name>/SKILL.md     (preferred — Hermes style)
 *   backend/context/skills/<skill-name>.md           (also accepted)
 */
function discoverSkillFiles(): string[] {
  ensureSkillsDir();
  const out: string[] = [];

  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    const fullPath = path.join(SKILLS_DIR, entry.name);

    if (entry.isDirectory()) {
      const nested = path.join(fullPath, SKILL_FILE_BASENAME);
      if (fs.existsSync(nested)) out.push(nested);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      // README.md at the top level is documentation for humans, not a skill.
      if (entry.name.toLowerCase() === "readme.md") continue;
      out.push(fullPath);
    }
  }

  return out;
}

function loadSkillFromFile(filePath: string): Skill | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const { meta, body } = parseFrontMatter(raw);

    // Fall back to the directory or file basename when `name` is omitted.
    const fallbackName = path.basename(path.dirname(filePath)) === "skills"
      ? path.basename(filePath, ".md").toLowerCase()
      : path.basename(path.dirname(filePath)).toLowerCase();

    const name = (meta.name || fallbackName).trim();
    if (!NAME_REGEX.test(name)) {
      console.warn(`[skills] Ignoring ${filePath}: invalid skill name "${name}"`);
      return null;
    }

    const description = (meta.description || "").trim().slice(0, MAX_DESCRIPTION_CHARS);
    if (!description) {
      console.warn(`[skills] Ignoring ${filePath}: missing description`);
      return null;
    }

    return {
      name,
      description,
      tags: parseTags(meta.tags),
      filePath,
      body: body.slice(0, MAX_BODY_CHARS),
    };
  } catch (error: any) {
    console.warn(`[skills] Failed to read ${filePath}: ${error?.message ?? error}`);
    return null;
  }
}

function loadAll(): Skill[] {
  const files = discoverSkillFiles();
  const skills: Skill[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const skill = loadSkillFromFile(file);
    if (!skill) continue;
    if (seen.has(skill.name)) {
      console.warn(`[skills] Duplicate skill name "${skill.name}" — keeping first one`);
      continue;
    }
    seen.add(skill.name);
    skills.push(skill);
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

function getCache(): Skill[] {
  if (!cache) cache = loadAll();
  return cache;
}

/** Force a re-scan from disk. Cheap, only called when a skill is created/edited. */
export function reloadSkills(): Skill[] {
  cache = loadAll();
  return cache;
}

export function listSkills(): SkillMetadata[] {
  return getCache().map(({ body, ...meta }) => meta);
}

export function getSkillByName(name: string): Skill | null {
  if (!NAME_REGEX.test(name)) return null;
  const skill = getCache().find((skill) => skill.name === name) ?? null;
  if (skill) recordActivity(name);
  return skill;
}

/**
 * Compact, token-efficient index for the system prompt. Each skill renders as
 * one line: `- name — description [tags]`. Archived (curator-retired) skills
 * are excluded so they stop consuming prompt budget — they remain on disk and
 * reappear if reactivated. Truncated if the registry grows unbounded so the
 * static prompt stays predictable.
 */
export function getSkillIndexText(): string {
  const skills = getCache().filter((skill) => !isArchived(skill.name));
  if (skills.length === 0) {
    return "(no skills registered yet — create one with skill_manage when a workflow proves useful)";
  }

  const lines = skills.slice(0, MAX_INDEX_LINES).map((skill) => {
    const tags = skill.tags.length > 0 ? ` [${skill.tags.join(", ")}]` : "";
    return `- ${skill.name} — ${skill.description}${tags}`;
  });

  if (skills.length > MAX_INDEX_LINES) {
    lines.push(`- ...${skills.length - MAX_INDEX_LINES} more (use skill_manage(action="list") to enumerate)`);
  }

  return lines.join("\n");
}

export interface CreateSkillInput {
  name: string;
  description: string;
  body: string;
  tags?: string[];
}

export interface CreateSkillResult {
  status: "created" | "exists";
  filePath: string;
  name: string;
}

/**
 * Persist a new skill. Used by the closed-loop learning path: when the agent
 * solves a task in a non-obvious way, it can record the trajectory as a new
 * skill so future runs short-circuit the exploration.
 */
export function createSkill(input: CreateSkillInput): CreateSkillResult {
  const name = input.name.trim().toLowerCase();
  if (!NAME_REGEX.test(name)) {
    throw new Error(
      `Invalid skill name "${input.name}". Use kebab-case, 2-63 chars, starting with a letter or digit.`
    );
  }

  const description = input.description.trim();
  if (!description) {
    throw new Error("Skill description is required.");
  }

  const body = input.body.trim();
  if (!body) {
    throw new Error("Skill body is required.");
  }

  ensureSkillsDir();
  const dir = path.join(SKILLS_DIR, name);
  const filePath = path.join(dir, SKILL_FILE_BASENAME);

  if (fs.existsSync(filePath)) {
    return { status: "exists", filePath, name };
  }

  const tags = (input.tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  const frontMatter = [
    "---",
    `name: ${name}`,
    `description: ${description.replace(/\n/g, " ").slice(0, MAX_DESCRIPTION_CHARS)}`,
    `tags: ${tags.join(", ")}`,
    `created: ${new Date().toISOString()}`,
    `id: ${crypto.randomBytes(4).toString("hex")}`,
    "---",
    "",
    body.slice(0, MAX_BODY_CHARS),
    "",
  ].join("\n");

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, frontMatter, "utf8");

  reloadSkills();
  recordCreate(name);
  console.log(`[skills] Created new skill "${name}" at ${filePath}`);

  return { status: "created", filePath, name };
}

/** Path the closed-loop learning prompt can reference. */
export const skillsDirectory = SKILLS_DIR;

/**
 * Update an existing skill in place. Used by the agent when it learns a
 * better version of a workflow it persisted earlier. Body and description
 * can be replaced; tags overwrite the old set if provided.
 */
export interface UpdateSkillInput {
  name: string;
  description?: string;
  body?: string;
  tags?: string[];
}

export function updateSkill(input: UpdateSkillInput): { status: "updated" | "not_found"; filePath?: string } {
  const name = input.name.trim().toLowerCase();
  if (!NAME_REGEX.test(name)) {
    throw new Error(`Invalid skill name "${input.name}".`);
  }
  const existing = getSkillByName(name);
  if (!existing) return { status: "not_found" };

  const description = (input.description ?? existing.description).trim().slice(0, MAX_DESCRIPTION_CHARS);
  const body = (input.body ?? existing.body).trim().slice(0, MAX_BODY_CHARS);
  if (!description) throw new Error("Skill description cannot be empty.");
  if (!body) throw new Error("Skill body cannot be empty.");
  const tags = (input.tags ?? existing.tags).map((t) => t.trim().toLowerCase()).filter(Boolean);

  const frontMatter = [
    "---",
    `name: ${name}`,
    `description: ${description.replace(/\n/g, " ")}`,
    `tags: ${tags.join(", ")}`,
    `updated: ${new Date().toISOString()}`,
    "---",
    "",
    body,
    "",
  ].join("\n");

  fs.writeFileSync(existing.filePath, frontMatter, "utf8");
  reloadSkills();
  recordActivity(name);
  console.log(`[skills] Updated skill "${name}" at ${existing.filePath}`);
  return { status: "updated", filePath: existing.filePath };
}

/**
 * Permanently remove a skill. Removes the SKILL.md and its parent directory
 * if the directory is empty afterwards (the typical Hermes-style layout).
 * Returns "not_found" silently — never throws on a missing skill.
 */
export function deleteSkill(name: string): { status: "deleted" | "not_found"; filePath?: string } {
  const normalized = name.trim().toLowerCase();
  if (!NAME_REGEX.test(normalized)) {
    throw new Error(`Invalid skill name "${name}".`);
  }
  const existing = getSkillByName(normalized);
  if (!existing) return { status: "not_found" };

  fs.unlinkSync(existing.filePath);
  const dir = path.dirname(existing.filePath);
  // Only remove the dir if it sat directly under SKILLS_DIR and is now empty.
  if (path.dirname(dir) === SKILLS_DIR) {
    try {
      const remaining = fs.readdirSync(dir);
      if (remaining.length === 0) fs.rmdirSync(dir);
    } catch {
      // ignore — the file removal is what mattered
    }
  }
  reloadSkills();
  forget(normalized);
  console.log(`[skills] Deleted skill "${normalized}" (${existing.filePath})`);
  return { status: "deleted", filePath: existing.filePath };
}
