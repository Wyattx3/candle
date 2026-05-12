import { Pinecone } from "@pinecone-database/pinecone";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export type DynamicInstruction = {
  id: string;
  title: string;
  content: string;
  tags?: string[];
};

type PineconeInstructionFields = {
  title?: string;
  content?: string;
  chunk_text?: string;
  tags?: string[] | string;
};

const MAX_DYNAMIC_CONTEXT_CHARS = 2_800;
const DEFAULT_INDEX_NAME = "candle-instructions";
const DEFAULT_NAMESPACE = "agent-instructions";
const DEFAULT_CLOUD = "aws";
const DEFAULT_REGION = "us-east-1";
const DEFAULT_EMBED_MODEL = "multilingual-e5-large";
const TEXT_FIELD = "chunk_text";
const UPSERT_BATCH_SIZE = 96;
const SEED_MANIFEST_ID = "__candle_seed_manifest";

let pineconeReady: Promise<ReturnType<Pinecone["index"]> | null> | undefined;
let pineconeAvailable = true;
let lastPineconeError = "";

function instructionFilePath() {
  return path.resolve(__dirname, "../context/instructions.json");
}

function loadSeedInstructions(): DynamicInstruction[] {
  const raw = fs.readFileSync(instructionFilePath(), "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isInstruction)) {
    throw new Error("backend/context/instructions.json must contain an array of dynamic instructions.");
  }
  return parsed;
}

function isInstruction(value: unknown): value is DynamicInstruction {
  const item = value as Partial<DynamicInstruction>;
  return Boolean(item && typeof item.id === "string" && typeof item.title === "string" && typeof item.content === "string");
}

function pineconeConfig() {
  const apiKey = process.env.PINECONE_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    indexName: process.env.PINECONE_INDEX?.trim() || DEFAULT_INDEX_NAME,
    namespace: process.env.PINECONE_NAMESPACE?.trim() || DEFAULT_NAMESPACE,
    cloud: process.env.PINECONE_CLOUD?.trim() || DEFAULT_CLOUD,
    region: process.env.PINECONE_REGION?.trim() || DEFAULT_REGION,
    embedModel: process.env.PINECONE_EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL,
  };
}

function seedHash(instructions: DynamicInstruction[]) {
  const normalized = instructions
    .map((instruction) => ({
      id: instruction.id,
      title: instruction.title,
      content: instruction.content,
      tags: instruction.tags ?? [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function createInstructionRecords(instructions: DynamicInstruction[]) {
  return instructions.map((instruction) => ({
    id: instruction.id,
    [TEXT_FIELD]: `${instruction.title}\n${instruction.content}\nTags: ${(instruction.tags ?? []).join(", ")}`,
    title: instruction.title,
    content: instruction.content,
    tags: instruction.tags ?? [],
  }));
}

async function getRemoteSeedHash(index: ReturnType<Pinecone["index"]>, namespace: string) {
  try {
    const response = await index.fetch({ namespace, ids: [SEED_MANIFEST_ID] });
    const record = response.records?.[SEED_MANIFEST_ID] as any;
    const metadata = record?.metadata ?? record ?? {};
    return typeof metadata.seedHash === "string"
      ? metadata.seedHash
      : typeof metadata.content === "string"
        ? metadata.content
        : undefined;
  } catch {
    return undefined;
  }
}

async function ensurePineconeIndex(): Promise<ReturnType<Pinecone["index"]> | null> {
  const config = pineconeConfig();
  if (!config) {
    console.warn("[context] PINECONE_API_KEY not set — dynamic context disabled, using local fallback.");
    pineconeAvailable = false;
    return null;
  }

  try {
    const pc = new Pinecone({ apiKey: config.apiKey });

    const indexes = await pc.listIndexes();
    const exists = indexes.indexes?.some((item) => item.name === config.indexName);

    if (!exists) {
      await pc.createIndexForModel({
        name: config.indexName,
        cloud: config.cloud,
        region: config.region,
        embed: {
          model: config.embedModel,
          fieldMap: { text: TEXT_FIELD },
        },
        waitUntilReady: true,
      });
    }

    const index = pc.index({ name: config.indexName });
    const instructions = loadSeedInstructions();
    const currentSeedHash = seedHash(instructions);
    const remoteSeedHash = await getRemoteSeedHash(index, config.namespace);

    if (remoteSeedHash === currentSeedHash) {
      pineconeAvailable = true;
      return index;
    }

    const records = [
      ...createInstructionRecords(instructions),
      {
        id: SEED_MANIFEST_ID,
        [TEXT_FIELD]: `Candle dynamic instruction seed manifest ${currentSeedHash}`,
        title: "Candle seed manifest",
        content: currentSeedHash,
        seedHash: currentSeedHash,
        tags: ["manifest"],
      },
    ];

    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      await index.upsertRecords({
        namespace: config.namespace,
        records: records.slice(i, i + UPSERT_BATCH_SIZE),
      });
    }

    pineconeAvailable = true;
    return index;
  } catch (error: any) {
    const msg = error?.message ?? String(error);
    lastPineconeError = msg;
    pineconeAvailable = false;
    console.error(`[context] Pinecone initialization failed — falling back to local context: ${msg}`);
    return null;
  }
}

async function getPineconeIndex() {
  pineconeReady ??= ensurePineconeIndex();
  return pineconeReady;
}

function tagsToText(tags: PineconeInstructionFields["tags"]) {
  if (Array.isArray(tags)) return tags.join(", ");
  return tags || "";
}

function formatHit(fields: PineconeInstructionFields) {
  const title = fields.title || "Retrieved instruction";
  const content = fields.content || fields.chunk_text || "";
  const tags = tagsToText(fields.tags);
  return tags ? `- ${title} [${tags}]: ${content}` : `- ${title}: ${content}`;
}

/**
 * Local fallback: keyword-match against instructions.json when Pinecone is unavailable.
 */
function localFallbackContext(query: string, limit = 4): string {
  try {
    const instructions = loadSeedInstructions();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    // Score each instruction by keyword overlap
    const scored = instructions.map((instruction) => {
      const searchable = `${instruction.title} ${instruction.content} ${(instruction.tags ?? []).join(" ")}`.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (searchable.includes(word)) score++;
      }
      // Boost for tag matches
      for (const tag of instruction.tags ?? []) {
        if (queryLower.includes(tag.toLowerCase())) score += 2;
      }
      return { instruction, score };
    });

    const topMatches = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (!topMatches.length) {
      return "No task-specific instructions matched (local fallback mode).";
    }

    const chunks: string[] = [];
    let usedChars = 0;
    for (const { instruction } of topMatches) {
      const tags = (instruction.tags ?? []).join(", ");
      const chunk = tags
        ? `- ${instruction.title} [${tags}]: ${instruction.content}`
        : `- ${instruction.title}: ${instruction.content}`;
      if (usedChars + chunk.length > MAX_DYNAMIC_CONTEXT_CHARS) break;
      chunks.push(chunk);
      usedChars += chunk.length;
    }

    return chunks.join("\n") || "No task-specific instructions matched (local fallback mode).";
  } catch {
    return "Dynamic context unavailable.";
  }
}

export async function retrieveDynamicContext(query: string, limit = 4): Promise<string> {
  // Try Pinecone first
  try {
    const index = await getPineconeIndex();
    if (!index) {
      return localFallbackContext(query, limit);
    }

    const config = pineconeConfig();
    if (!config) {
      return localFallbackContext(query, limit);
    }

    const response = await index.searchRecords({
      namespace: config.namespace,
      query: {
        inputs: { text: query },
        topK: limit,
      },
      fields: ["title", "content", "tags", TEXT_FIELD],
    });

    const hits = response.result.hits ?? [];
    if (!hits.length) {
      return "No task-specific instructions retrieved from Pinecone.";
    }

    const chunks: string[] = [];
    let usedChars = 0;
    for (const hit of hits) {
      const chunk = formatHit(hit.fields as PineconeInstructionFields);
      if (usedChars + chunk.length > MAX_DYNAMIC_CONTEXT_CHARS) break;
      chunks.push(chunk);
      usedChars += chunk.length;
    }

    return chunks.join("\n") || "No task-specific instructions retrieved from Pinecone.";
  } catch (error: any) {
    const msg = error?.message ?? String(error);
    console.error(`[context] Pinecone query failed — using local fallback: ${msg}`);
    // Reset pinecone state so next call retries
    pineconeReady = undefined;
    pineconeAvailable = false;
    return localFallbackContext(query, limit);
  }
}
