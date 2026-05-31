import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  tags: string[];
  category: "user_preference" | "project_fact" | "learned_pattern" | "tool_usage";
  createdAt: number;
  accessedAt: number;
  accessCount: number;
}

const MEMORY_FILE = path.resolve(__dirname, "../../.candle_memory.json");

/**
 * Maximum entries kept on disk. When exceeded, the least-recently-accessed
 * entries are evicted on the next save. Keeps the JSON file from growing
 * unboundedly across months of use. Override with `MEMORY_MAX_ENTRIES` env.
 */
const MAX_ENTRIES = (() => {
  const parsed = Number(process.env.MEMORY_MAX_ENTRIES);
  if (!Number.isFinite(parsed)) return 500;
  return Math.max(50, Math.min(5000, Math.floor(parsed)));
})();

export class PersistentMemoryStore {
  private entries: MemoryEntry[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const data = fs.readFileSync(MEMORY_FILE, "utf8");
        const parsed = JSON.parse(data);
        this.entries = Array.isArray(parsed) ? parsed : [];
      }
    } catch (err) {
      console.warn(`[memory] Failed to load memory from ${MEMORY_FILE}:`, err);
    }
  }

  private save(): void {
    try {
      // LRU eviction: if over cap, drop the oldest-accessed entries first.
      if (this.entries.length > MAX_ENTRIES) {
        this.entries.sort((a, b) => b.accessedAt - a.accessedAt);
        const evicted = this.entries.length - MAX_ENTRIES;
        this.entries = this.entries.slice(0, MAX_ENTRIES);
        console.log(`[memory] Evicted ${evicted} oldest entries (cap=${MAX_ENTRIES}).`);
      }
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.entries, null, 2), "utf8");
    } catch (err) {
      console.error(`[memory] Failed to save memory to ${MEMORY_FILE}:`, err);
    }
  }

  public store(key: string, value: string, category: MemoryEntry["category"] = "project_fact", tags: string[] = []): MemoryEntry {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey) throw new Error("Memory key cannot be empty.");
    if (trimmedKey.length > 80) throw new Error("Memory key too long (max 80 chars).");
    if (!trimmedValue) throw new Error("Memory value cannot be empty.");
    if (trimmedValue.length > 2000) throw new Error("Memory value too long (max 2000 chars). Summarize before storing.");

    const cleanedTags = (tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 12);

    const existingIndex = this.entries.findIndex((e) => e.key === trimmedKey);
    if (existingIndex >= 0) {
      this.entries[existingIndex] = {
        ...this.entries[existingIndex],
        value: trimmedValue,
        tags: cleanedTags,
        category,
        accessedAt: Date.now(),
        accessCount: this.entries[existingIndex].accessCount + 1,
      };
      this.save();
      return this.entries[existingIndex];
    }

    const newEntry: MemoryEntry = {
      id: crypto.randomUUID(),
      key: trimmedKey,
      value: trimmedValue,
      tags: cleanedTags,
      category,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 1,
    };
    this.entries.push(newEntry);
    this.save();
    return newEntry;
  }

  public delete(key: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.key !== key.trim());
    const removed = before > this.entries.length;
    if (removed) this.save();
    return removed;
  }

  public listAll(): MemoryEntry[] {
    return [...this.entries].sort((a, b) => b.accessedAt - a.accessedAt);
  }

  public search(query: string, limit: number = 5): MemoryEntry[] {
    const queryLower = query.toLowerCase();
    const scored = this.entries.map((entry) => {
      let score = 0;
      const textToSearch = `${entry.key} ${entry.value} ${entry.tags.join(" ")}`.toLowerCase();
      
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      for (const word of queryWords) {
        if (textToSearch.includes(word)) score += 1;
      }
      
      if (entry.key.toLowerCase().includes(queryLower)) score += 5;
      
      return { entry, score };
    });

    const results = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.entry);

    // Update access counts
    for (const res of results) {
      res.accessedAt = Date.now();
      res.accessCount++;
    }
    if (results.length > 0) this.save();

    return results;
  }

  public getSummary(): string {
    const recent = [...this.entries]
      .sort((a, b) => b.accessedAt - a.accessedAt)
      .slice(0, 10);
    
    if (recent.length === 0) return "";

    const lines = recent.map(r => `- [${r.category}] ${r.key}: ${r.value}`);
    return (
      `## PERSISTENT MEMORY (Top 10 recent facts)\n` +
      `These are facts you have learned and remembered about the user or projects:\n` +
      `${lines.join("\n")}\n\n` +
      `Use the \`search_memory\` tool to find more specific details if needed.`
    );
  }
}

export const memoryStore = new PersistentMemoryStore();

export const storeMemoryTool = tool(
  async ({ key, value, category, tags }) => {
    try {
      const entry = memoryStore.store(key, value, category as any, tags ?? []);
      return `Stored memory under key "${entry.key}" (category=${entry.category}).`;
    } catch (e: any) {
      return `Error storing memory: ${e?.message ?? e}`;
    }
  },
  {
    name: "store_memory",
    description:
      "Save a long-term fact (separate from chat history) so future sessions remember it. " +
      "Use ONLY for stable, non-sensitive info: user preferences, project facts, learned patterns, non-obvious tool usage. " +
      "Never store API keys, passwords, OTPs, or one-off task details. " +
      "If the key already exists, the value is updated.",
    schema: z.object({
      key: z.string().describe("Short snake_case identifier (e.g. 'user_name', 'preferred_video_format'). Max 80 chars."),
      value: z.string().describe("The fact to remember. Max 2000 chars — summarize if longer."),
      category: z.enum(["user_preference", "project_fact", "learned_pattern", "tool_usage"]).describe("Category for grouping."),
      tags: z.array(z.string()).optional().describe("Optional tags for searching. Max 12."),
    }),
  }
);

export const searchMemoryTool = tool(
  async ({ query, limit }) => {
    try {
      const results = memoryStore.search(query, limit ?? 5);
      if (results.length === 0) return `No memories found matching "${query}".`;
      return JSON.stringify(
        results.map((r) => ({ key: r.key, value: r.value, category: r.category, tags: r.tags })),
        null,
        2
      );
    } catch (e: any) {
      return `Error searching memory: ${e?.message ?? e}`;
    }
  },
  {
    name: "search_memory",
    description:
      "Look up previously stored long-term memories by keyword. Call this BEFORE asking the user something they may have already told you (their name, preferences, project paths, etc.).",
    schema: z.object({
      query: z.string().describe("Keywords to search keys/values/tags."),
      limit: z.number().optional().default(5).describe("Max results to return. Defaults to 5."),
    }),
  }
);

export const deleteMemoryTool = tool(
  async ({ key }) => {
    try {
      const removed = memoryStore.delete(key);
      return removed ? `Memory "${key}" deleted.` : `No memory found with key "${key}".`;
    } catch (e: any) {
      return `Error deleting memory: ${e?.message ?? e}`;
    }
  },
  {
    name: "delete_memory",
    description:
      "Remove a stored memory by its exact key. Use when the user retracts a preference, when stored info is wrong, or when cleaning up obsolete project facts.",
    schema: z.object({
      key: z.string().describe("Exact key of the memory to delete."),
    }),
  }
);
