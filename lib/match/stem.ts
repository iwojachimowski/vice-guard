const vowel = /[aeiouy]/;

/**
 * A light suffix stripper (Porter step 1 style). Lexicon terms go through the
 * same function, so "endings", "ended" and "ending" all meet at "end".
 */
export function stem(word: string): string {
  if (word.length <= 4 || /\d/.test(word)) return word;
  let w = word;
  if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("'s")) w = w.slice(0, -2);
  else if (/[^su]s$/.test(w)) w = w.slice(0, -1);
  for (const suffix of ['ing', 'ed']) {
    const base = w.slice(0, -suffix.length);
    if (w.endsWith(suffix) && base.length >= 3 && vowel.test(base)) {
      w = /([^aeiouylsz])\1$/.test(base) ? base.slice(0, -1) : base;
      break;
    }
  }
  return w;
}

/** Optimal string alignment distance, capped: returns limit + 1 early. */
export function editDistance(a: string, b: string, limit = 1): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, prev2[j - 2]! + 1);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length]!;
}

/** Index for edit-distance-1 lookups via single-deletion neighbourhoods. */
export function createFuzzyIndex(terms: Iterable<string>) {
  const byDeletion = new Map<string, Set<string>>();
  const add = (key: string, term: string) => {
    let set = byDeletion.get(key);
    if (!set) byDeletion.set(key, (set = new Set()));
    set.add(term);
  };
  for (const term of terms) {
    add(term, term);
    for (let i = 0; i < term.length; i++)
      add(term.slice(0, i) + term.slice(i + 1), term);
  }
  return (word: string): string | undefined => {
    const keys = [word];
    for (let i = 0; i < word.length; i++)
      keys.push(word.slice(0, i) + word.slice(i + 1));
    for (const key of keys)
      for (const term of byDeletion.get(key) ?? [])
        if (editDistance(word, term) <= 1) return term;
    return undefined;
  };
}
