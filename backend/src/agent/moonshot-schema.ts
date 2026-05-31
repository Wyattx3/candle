/**
 * ============================================================================
 * MOONSHOT / KIMI TOOL-SCHEMA SANITIZER
 * ============================================================================
 * Ported from NousResearch/hermes-agent (`agent/moonshot_schema.py`).
 *
 * Kimi / Moonshot accepts a STRICTER subset of JSON Schema than standard
 * OpenAI tool calling. When a tool's `parameters` schema violates that subset,
 * the provider rejects the whole request with HTTP 400:
 *
 *   "tools.function.parameters is not a valid moonshot flavored json schema"
 *
 * The practical fallout we hit in Candle: when the schema is rejected, the
 * model's native tool-calling path degrades and it emits raw
 * `<|tool_call_begin|>…` tokens as TEXT instead of structured tool_calls — the
 * exact leak we patched downstream in `hermes-tokens.ts`. THIS module fixes the
 * problem at the SOURCE so the leak never happens in the first place.
 *
 * Repairs applied (matching Hermes' rule set):
 *  1. Every property schema must carry a `type`. Standard JSON Schema lets you
 *     omit it; Moonshot refuses. We infer a reasonable type.
 *  2. When `anyOf` is used, `type` belongs on the children, not the parent.
 *     We strip the parent `type` and drop null-typed branches.
 *  3. `enum` arrays on scalar nodes may not contain null / empty string.
 *  4. `$ref` nodes may not carry sibling keywords — collapse to `{ "$ref": … }`.
 *  5. Tuple-style `items` arrays are collapsed to the first element schema.
 *  6. The non-standard `nullable` keyword is stripped.
 *
 * Zod-generated schemas (what Candle's tools use) are usually clean, but MCP
 * tools imported at runtime and any hand-written schemas can trip these rules,
 * so we sanitize the whole tool list before binding.
 */

const SCHEMA_MAP_KEYS = new Set(["properties", "patternProperties", "$defs", "definitions"]);
const SCHEMA_LIST_KEYS = new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);
const SCHEMA_NODE_KEYS = new Set(["items", "contains", "not", "additionalProperties", "propertyNames"]);

type JsonSchema = Record<string, any>;

function fillMissingType(node: JsonSchema): JsonSchema {
  if (node.type !== undefined && node.type !== null && node.type !== "") return node;

  let inferred: string;
  if ("properties" in node || "required" in node || "additionalProperties" in node) {
    inferred = "object";
  } else if ("items" in node || "prefixItems" in node) {
    inferred = "array";
  } else if (Array.isArray(node.enum) && node.enum.length > 0) {
    const sample = node.enum[0];
    if (typeof sample === "boolean") inferred = "boolean";
    else if (typeof sample === "number") inferred = Number.isInteger(sample) ? "integer" : "number";
    else inferred = "string";
  } else {
    inferred = "string";
  }
  return { ...node, type: inferred };
}

function repairSchema(node: any, isSchema = true): any {
  if (Array.isArray(node)) {
    return node.map((item) => repairSchema(item, true));
  }
  if (!node || typeof node !== "object") return node;

  const repaired: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (SCHEMA_MAP_KEYS.has(key) && value && typeof value === "object" && !Array.isArray(value)) {
      const out: JsonSchema = {};
      for (const [subKey, subVal] of Object.entries(value as JsonSchema)) {
        out[subKey] = repairSchema(subVal, true);
      }
      repaired[key] = out;
    } else if (SCHEMA_LIST_KEYS.has(key) && Array.isArray(value)) {
      repaired[key] = value.map((v) => repairSchema(v, true));
    } else if (key === "items" && Array.isArray(value)) {
      // Rule 5 — tuple-style items collapse to the first element schema.
      const first = value.length > 0 ? value[0] : {};
      repaired[key] = first && typeof first === "object" ? repairSchema(first, true) : first;
    } else if (SCHEMA_NODE_KEYS.has(key)) {
      repaired[key] = value && typeof value === "object" ? repairSchema(value, true) : value;
    } else {
      repaired[key] = value;
    }
  }

  if (!isSchema) return repaired;

  // Rule 2 — anyOf: type goes on the children, drop null branches.
  if (Array.isArray(repaired.anyOf)) {
    delete repaired.type;
    const nonNull = repaired.anyOf.filter(
      (b: any) => b && typeof b === "object" && b.type !== "null"
    );
    if (nonNull.length > 0 && nonNull.length < repaired.anyOf.length) {
      if (nonNull.length === 1) {
        const merged: JsonSchema = {};
        for (const [k, v] of Object.entries(repaired)) if (k !== "anyOf") merged[k] = v;
        Object.assign(merged, nonNull[0]);
        return finalizeScalarRules(merged);
      }
      repaired.anyOf = nonNull;
      return repaired;
    }
    return repaired;
  }

  return finalizeScalarRules(repaired);
}

function finalizeScalarRules(repaired: JsonSchema): JsonSchema {
  // Rule 6 — strip non-standard `nullable`.
  delete repaired.nullable;

  // Rule 1 — fill missing type (except on $ref nodes).
  if (!("$ref" in repaired)) {
    repaired = fillMissingType(repaired);
  }

  // Rule 3 — clean enum arrays on scalar nodes.
  if (Array.isArray(repaired.enum)) {
    const t = repaired.type;
    if (t === "string" || t === "integer" || t === "number" || t === "boolean") {
      const cleaned = repaired.enum.filter((v: any) => v !== null && v !== "");
      if (cleaned.length > 0) repaired.enum = cleaned;
      else delete repaired.enum;
    }
  }

  // Rule 4 — $ref nodes must not have siblings.
  if ("$ref" in repaired) {
    return { $ref: repaired.$ref };
  }

  return repaired;
}

/** Normalize a tool's `parameters` to a Moonshot-compatible object schema. */
export function sanitizeMoonshotToolParameters(parameters: any): JsonSchema {
  if (!parameters || typeof parameters !== "object") {
    return { type: "object", properties: {} };
  }
  const repaired = repairSchema(structuredClone(parameters), true);
  if (!repaired || typeof repaired !== "object") {
    return { type: "object", properties: {} };
  }
  if (repaired.type !== "object") repaired.type = "object";
  if (!("properties" in repaired)) repaired.properties = {};
  return repaired;
}

/**
 * Apply `sanitizeMoonshotToolParameters` to every tool's parameters. Accepts
 * OpenAI-format tool dicts ({ type:"function", function:{ name, parameters }}).
 * Returns a new array (input is not mutated).
 */
export function sanitizeMoonshotTools(tools: any[]): any[] {
  if (!Array.isArray(tools) || tools.length === 0) return tools;
  return tools.map((tool) => {
    if (!tool || typeof tool !== "object") return tool;
    const fn = tool.function;
    if (!fn || typeof fn !== "object") return tool;
    const repaired = sanitizeMoonshotToolParameters(fn.parameters);
    return { ...tool, function: { ...fn, parameters: repaired } };
  });
}

/**
 * True for any Kimi / Moonshot model slug, regardless of aggregator prefix.
 * Matches bare names (`kimi-k2.6`, `moonshotai/Kimi-K2.6`) and aggregator-
 * prefixed slugs (`@cf/moonshotai/kimi-k2.6`, `openrouter/moonshotai/...`).
 */
export function isMoonshotModel(model: string | null | undefined): boolean {
  if (!model) return false;
  const bare = model.trim().toLowerCase();
  const tail = bare.split("/").pop() ?? bare;
  if (tail.startsWith("kimi-") || tail === "kimi") return true;
  if (bare.includes("moonshot") || bare.includes("/kimi") || bare.startsWith("kimi")) return true;
  return false;
}
