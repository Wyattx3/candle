/**
 * ============================================================================
 * OUTPUT DEGENERATION DETECTION
 * ============================================================================
 * Some models (notably GLM-5.2 via Cloudflare Workers AI) occasionally fall
 * into a repetition collapse mid-generation: they emit the same short phrase or
 * character cycle over and over until the run times out, producing thousands of
 * characters of garbage that becomes the "answer". Observed in GAIA runs:
 *
 *   "Let me research the user'sLet me needLetLet me use the the | …"  (166s)
 *   "0:0|0>0|0)2) | 0:0|0>0|0)2) | 0:0|0>0|0)2) | …"                   (410s)
 *   "search for web: \"https://www.en.wikipedia: search for web: …"   (166s)
 *
 * The per-call timeout doesn't help because tokens keep flowing — the request
 * isn't hung, it's looping. This module gives a cheap, streaming-friendly check
 * so the agent loop can abort the moment the output has clearly collapsed,
 * salvage any earlier good content, and stop wasting minutes on garbage.
 *
 * Two independent signals, either of which fires:
 *   1. Character-level periodicity — the recent tail is a short unit repeated.
 *   2. Word-level diversity collapse — very few distinct words across many.
 *
 * Thresholds are intentionally conservative: normal prose (even repetitive
 * lists or tables) has far higher diversity, so false positives are unlikely.
 */

/** Minimum tail length before degeneration is even considered. */
const MIN_LEN = 400;
/** Longest repeating unit we test for character-level periodicity. */
const MAX_PERIOD = 80;
/**
 * Fraction of characters that must match `period` positions back to count as a
 * collapse. Set high (0.92) because real degeneration is near-EXACT repetition
 * (match rate ~1.0), while legitimately structured output — markdown tables,
 * numbered lists — has varying content that breaks periodicity well below this.
 * Biasing toward false negatives is safe: a missed collapse just falls back to
 * the existing timeout, but a false positive would discard a real answer.
 */
const PERIODIC_THRESHOLD = 0.92;
/** Below this distinct/total word ratio (over enough words) is a collapse. */
const WORD_DIVERSITY_THRESHOLD = 0.12;
/** Minimum word count before the diversity check applies. */
const MIN_WORDS = 60;
/** How much of the trailing output to examine. */
const TAIL_CHARS = 1200;

/**
 * True if `text` shows clear repetition collapse. Examines only the trailing
 * `TAIL_CHARS` so it stays O(MAX_PERIOD * TAIL_CHARS) regardless of total size.
 */
export function isDegenerateText(text: string): boolean {
  if (!text || text.length < MIN_LEN) return false;
  const tail = text.slice(-TAIL_CHARS);
  return isPeriodic(tail) || hasLowWordDiversity(tail);
}

/** Smallest-period test: is `s` (approximately) a short unit repeated? */
function isPeriodic(s: string): boolean {
  const n = s.length;
  const maxPeriod = Math.min(MAX_PERIOD, Math.floor(n / 4));
  for (let p = 1; p <= maxPeriod; p += 1) {
    let matches = 0;
    for (let i = p; i < n; i += 1) {
      if (s[i] === s[i - p]) matches += 1;
    }
    if (matches / (n - p) > PERIODIC_THRESHOLD) return true;
  }
  return false;
}

/** Word-diversity test: many words but almost all duplicates. */
function hasLowWordDiversity(s: string): boolean {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS) return false;
  const distinct = new Set(words).size;
  return distinct / words.length < WORD_DIVERSITY_THRESHOLD;
}
