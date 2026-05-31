/**
 * ============================================================================
 * SESSION TITLE GENERATOR
 * ============================================================================
 * Ported from NousResearch/hermes-agent (`agent/title_generator.py`).
 *
 * Generates a short, descriptive title (3-7 words) from the first user↔assistant
 * exchange. Runs fire-and-forget AFTER the response is delivered so it never
 * adds latency to the user-facing reply. Uses the no-tools LLM (cheap, fast).
 *
 * Candle wiring: `server.ts` calls `maybeAutoTitle` after the first exchange of
 * a connection and emits a `session_title` WebSocket event when one is produced.
 */

import { auxLLM } from "./llm";
import { contentToText } from "./helpers";

const TITLE_PROMPT =
  "Generate a short, descriptive title (3-7 words) for a conversation that starts with the " +
  "following exchange. The title should capture the main topic or intent. " +
  "Return ONLY the title text, nothing else. No quotes, no punctuation at the end, no prefixes.";

/** Generate a title from the first exchange. Returns null on any failure. */
export async function generateTitle(
  userMessage: string,
  assistantResponse: string
): Promise<string | null> {
  const userSnippet = (userMessage || "").slice(0, 500);
  const assistantSnippet = (assistantResponse || "").slice(0, 500);

  try {
    const response = await auxLLM.invoke([
      { role: "system", content: TITLE_PROMPT },
      { role: "user", content: `User: ${userSnippet}\n\nAssistant: ${assistantSnippet}` },
    ]);
    let title = contentToText(response.content).trim();
    // Strip surrounding quotes and a leading "Title:" prefix.
    title = title.replace(/^["']|["']$/g, "");
    if (/^title:/i.test(title)) title = title.slice(6).trim();
    // Collapse to a single line and clamp length.
    title = title.split(/\r?\n/)[0].trim();
    if (title.length > 80) title = title.slice(0, 77) + "...";
    return title || null;
  } catch (err: any) {
    console.warn(`[title] generation failed: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Fire-and-forget title generation after the first exchange. Only fires when:
 *  - this looks like the first user→assistant exchange (≤ 2 prior user msgs)
 *  - both the prompt and a non-empty assistant response exist
 *
 * `onTitle` is invoked with the generated title (e.g. to emit a WS event).
 * Never throws — failures are logged and swallowed.
 */
export function maybeAutoTitle(opts: {
  userMessage: string;
  assistantResponse: string;
  priorUserMessageCount: number;
  onTitle: (title: string) => void;
}): void {
  const { userMessage, assistantResponse, priorUserMessageCount, onTitle } = opts;
  if (!userMessage || !assistantResponse) return;
  if (priorUserMessageCount > 1) return; // only the first exchange

  // Detach from the request path entirely.
  void (async () => {
    const title = await generateTitle(userMessage, assistantResponse);
    if (!title) return;
    try {
      onTitle(title);
    } catch (err: any) {
      console.warn(`[title] onTitle callback failed: ${err?.message ?? err}`);
    }
  })();
}
