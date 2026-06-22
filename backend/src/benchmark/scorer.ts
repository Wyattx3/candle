/**
 * Official GAIA exact-match scorer, ported faithfully from the reference
 * implementation shipped with the gaia-benchmark/GAIA dataset
 * (`scorer.py::question_scorer`).
 *
 * The grading is deterministic and LLM-free:
 *   1. If the ground truth parses as a number, compare numerically after
 *      stripping `$ % ,` separators.
 *   2. If the ground truth contains a list separator (`,` or `;`), split both
 *      sides, require equal length, and compare element-wise (numeric elements
 *      numerically, string elements as punctuation-insensitive normalized
 *      strings).
 *   3. Otherwise compare as fully normalized strings (whitespace removed,
 *      lowercased, punctuation stripped).
 *
 * Keeping this byte-for-byte compatible with the upstream scorer is what makes
 * Candle's measured pass-rate comparable to the public GAIA leaderboard.
 */

// Mirrors Python's string.punctuation.
const PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

function isFloat(element: string): boolean {
  if (element === null || element === undefined) return false;
  const trimmed = element.trim();
  if (trimmed === "") return false;
  // Python float() accepts "inf"/"nan"/scientific notation; Number() is close
  // enough for GAIA ground-truth values, which are ordinary decimals.
  const n = Number(trimmed);
  return Number.isFinite(n);
}

/** Strip currency/percent/thousands separators, then parse. inf on failure. */
export function normalizeNumberStr(numberStr: string): number {
  let s = numberStr;
  for (const ch of ["$", "%", ","]) {
    s = s.split(ch).join("");
  }
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/** Split on any of the given separator characters (default comma/semicolon). */
export function splitString(s: string, charList: string[] = [",", ";"]): string[] {
  const escaped = charList.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
  const pattern = new RegExp(`[${escaped}]`);
  return s.split(pattern);
}

/** Remove all whitespace, lowercase, and (optionally) strip punctuation. */
export function normalizeStr(inputStr: string, removePunct = true): string {
  const noSpaces = inputStr.replace(/\s/g, "");
  const lowered = noSpaces.toLowerCase();
  if (!removePunct) return lowered;
  let out = "";
  for (const ch of lowered) {
    if (!PUNCTUATION.includes(ch)) out += ch;
  }
  return out;
}

/**
 * Returns true if `modelAnswer` exact-matches `groundTruth` under GAIA rules.
 */
export function questionScorer(modelAnswer: string, groundTruth: string): boolean {
  const model = (modelAnswer ?? "").toString();
  const gt = (groundTruth ?? "").toString();

  // Case 1 — numeric ground truth.
  if (isFloat(gt)) {
    const normalizedAnswer = normalizeNumberStr(model);
    return normalizedAnswer === Number(gt.trim());
  }

  // Case 2 — list ground truth (comma/semicolon separated).
  if ([",", ";"].some((ch) => gt.includes(ch))) {
    const gtElems = splitString(gt);
    const maElems = splitString(model);
    if (gtElems.length !== maElems.length) return false;
    for (let i = 0; i < gtElems.length; i += 1) {
      const gtElem = gtElems[i];
      const maElem = maElems[i];
      if (isFloat(gtElem)) {
        if (normalizeNumberStr(maElem) !== Number(gtElem.trim())) return false;
      } else if (normalizeStr(maElem, false) !== normalizeStr(gtElem, false)) {
        return false;
      }
    }
    return true;
  }

  // Case 3 — plain string ground truth.
  return normalizeStr(model) === normalizeStr(gt);
}

/**
 * GAIA answers must be delivered on a line `FINAL ANSWER: <X>`. This pulls the
 * payload out of a full agent reply. Falls back to the last non-empty line if
 * no explicit marker is present, then to the whole trimmed string.
 */
export function extractFinalAnswer(rawReply: string): string {
  if (!rawReply) return "";
  const text = rawReply.replace(/\r/g, "");
  // Case-insensitive, tolerate markdown bold/asterisks around the marker.
  const re = /FINAL ANSWER\s*:?\s*(.*)/i;
  // Search from the end so a trailing FINAL ANSWER wins over any earlier mention.
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const stripped = lines[i].replace(/[*_`#>]/g, "").trim();
    const m = stripped.match(re);
    if (m) return m[1].trim();
  }
  // No marker — use last non-empty line.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const t = lines[i].trim();
    if (t) return t;
  }
  return text.trim();
}
