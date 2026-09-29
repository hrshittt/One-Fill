/**
 * Level 4 — fuzzy string similarity, used to tolerate typos ("adress", "emial") and
 * unusual concatenations that exact/keyword matching misses.
 */

/** Jaro–Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Optimal-string-alignment distance: Levenshtein plus adjacent transpositions, so the
 * very common typo "emial" → "email" costs one edit instead of two.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, d[i - 2]![j - 2]! + 1);
      d[i]![j] = value;
    }
  }
  return d[a.length]![b.length]!;
}

/** Cheap check for "same word with one typo" — used to apply exclusion words to misspellings. */
export function isOneTypoAway(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4 || a[0] !== b[0] || Math.abs(a.length - b.length) > 1) return false;
  return editDistance(a, b) <= 1;
}

/**
 * Similarity tuned for field names: requires both strings to be reasonably long (short strings
 * like "city"/"cty" are too easy to confuse) and combines Jaro–Winkler with edit distance.
 */
export function fieldNameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 4 || b.length < 4) return 0;
  // Typos rarely change length by more than a couple of characters; skip the expensive part.
  if (Math.abs(a.length - b.length) > 2) return 0;
  const jw = jaroWinkler(a, b);
  if (jw < 0.85) return jw * 0.85;
  const edits = editDistance(a, b);
  const maxEdits = a.length >= 8 ? 2 : 1;
  return edits <= maxEdits ? jw : jw * 0.85;
}
