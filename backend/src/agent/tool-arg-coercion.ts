/**
 * ============================================================================
 * TOOL-ARGUMENT TYPE COERCION (GLM / open-weight counterpart to moonshot-schema)
 * ============================================================================
 * Ported from NousResearch/hermes-agent (`model_tools.py::coerce_tool_args`).
 *
 * `moonshot-schema.ts` fixes the schema we SEND to Kimi (which 400s on standard
 * JSON Schema). This module fixes the args the model SENDS BACK. Open-weight
 * models (GLM, DeepSeek, Qwen) frequently emit numbers/booleans as strings
 * (`"10"` instead of `10`, `"true"` instead of `true`) or a bare scalar where
 * an array is expected (`"k_abc"` instead of `["k_abc"]`). Candle's tools are
 * Zod-validated, so those arrive as a hard "did not match expected schema"
 * failure on an otherwise well-formed call.
 *
 * We coerce each arg toward its declared JSON-Schema type BEFORE the tool's
 * `.invoke()` runs its Zod check. The function is a no-op for values that
 * already match (a real number stays a number), so it is safe to apply to
 * every model, not just GLM.
 */

import { convertToOpenAITool } from "@langchain/core/utils/function_calling";

/** Cache the derived JSON-schema `properties` per tool object (auto-GC on swap). */
const propsCache = new WeakMap<object, Record<string, any> | null>();

function toolProperties(tool: any): Record<string, any> | null {
  if (!tool || typeof tool !== "object") return null;
  const cached = propsCache.get(tool);
  if (cached !== undefined) return cached;
  let props: Record<string, any> | null = null;
  try {
    const oa = convertToOpenAITool(tool);
    const params = oa?.function?.parameters as any;
    props = params && typeof params.properties === "object" ? params.properties : null;
  } catch {
    props = null;
  }
  propsCache.set(tool, props);
  return props;
}

/** Collect the candidate JSON-Schema types for a property (handles unions / anyOf). */
function schemaTypes(schema: any): string[] {
  if (!schema || typeof schema !== "object") return [];
  if (typeof schema.type === "string") return [schema.type];
  if (Array.isArray(schema.type)) return schema.type.filter((t: any) => typeof t === "string");
  const branches = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(branches)) {
    const out: string[] = [];
    for (const b of branches) out.push(...schemaTypes(b));
    return out;
  }
  return [];
}

function coerceValue(value: unknown, types: string[]): unknown {
  // Wrap a bare scalar when an array is expected (GLM emits `"x"` for `["x"]`).
  if (types.includes("array") && value != null && !Array.isArray(value)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          /* fall through to single-element wrap */
        }
      }
    }
    return [value];
  }

  if (typeof value !== "string") return value;
  const trimmed = value.trim();

  if (types.includes("null") && trimmed.toLowerCase() === "null") return null;

  if (types.includes("integer") || types.includes("number")) {
    if (trimmed !== "" && Number.isFinite(Number(trimmed))) {
      const n = Number(trimmed);
      // Prefer integer only when the schema asks for integer and NOT number.
      if (types.includes("integer") && !types.includes("number")) return Math.trunc(n);
      return n;
    }
  }

  if (types.includes("boolean")) {
    const lower = trimmed.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }

  return value;
}

/**
 * Coerce a tool call's arguments toward the tool's declared parameter types.
 * Returns a NEW object; returns the input unchanged when there is no schema or
 * nothing to coerce.
 */
export function coerceToolArgs(tool: any, args: unknown): any {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const props = toolProperties(tool);
  if (!props) return args;

  let changed = false;
  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    const types = schemaTypes(props[key]);
    if (types.length === 0) continue;
    const coerced = coerceValue(value, types);
    if (coerced !== value) {
      out[key] = coerced;
      changed = true;
    }
  }
  return changed ? out : args;
}
