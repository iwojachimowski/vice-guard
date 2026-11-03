import type { Settings } from '../settings';
import { BOUNDARY, tokenize } from './normalize';
import { createFuzzyIndex, stem } from './stem';
import * as lex from './lexicon';

export type Layer = 'text' | 'ocr' | 'clip' | 'image' | 'channel';
export interface Verdict {
  hit: boolean;
  /** Which rule established GTA 6 context, e.g. "explicit", "leonida". */
  rule?: string;
  layer?: Layer;
}

const joined = (list: lex.Phrase[]) => list.map((p) => ` ${p.join(' ')} `);
const lists = {
  unique: joined(lex.uniqueNames),
  weak: joined(
    lex.weakNames.filter((p) => p[0] !== 'jason' && p[0] !== 'lucia'),
  ),
  other: joined(lex.otherTitles),
  recent: joined(lex.recentSignals),
  recentNoDate: joined(
    lex.recentSignals.filter((p) => !lex.dateSignals.has(p.join(' '))),
  ),
  story: joined(lex.storyWords),
  game: joined(lex.gameSignals),
  gameOnly: joined(
    lex.gameSignals.filter(
      (p) => !['gta', 'grand theft auto', 'rockstar'].includes(p.join(' ')),
    ),
  ),
  gameNotPlace: joined(
    lex.gameSignals.filter(
      (p) =>
        !['gta', 'grand theft auto', 'rockstar', 'vice city'].includes(
          p.join(' '),
        ),
    ),
  ),
  car: joined(lex.carSignals),
  rockstarElsewhere: joined(lex.rockstarElsewhere),
  toronto: joined(lex.torontoSignals),
  crime: joined(lex.crimeSignals),
  travel: joined(lex.travelSignals),
  strong: joined(lex.strong),
  moderate: joined(lex.moderate),
  safety: joined(lex.safetyLabels),
  newNames: joined(
    lex.recentSignals.filter((p) =>
      ['jason', 'lucia', 'leonida', 'duval', 'camino'].includes(p.join(' ')),
    ),
  ),
  newStrong: [' 2025 ', ' 2026 ', ' 2027 ', ' trailer 2 ', ' trailer 3 '],
};

const vocabulary = new Set<string>(
  Object.values(lex)
    .filter(Array.isArray)
    .flat(2)
    .filter((word): word is string => typeof word === 'string'),
);
for (const word of lex.sixes) vocabulary.add(word);
const fuzzyLookup = createFuzzyIndex(
  lex.fuzzyTerms.filter((term) => term.length >= 5),
);

// Multi-word names written as one word: "VICECITY", "#LeonidaKeys".
const gluedPhrases = new Map<string, string[]>(
  [
    ...lex.uniqueNames,
    ...lex.weakNames,
    ...lex.recentSignals,
    ...lex.storyWords,
  ]
    .filter((phrase) => phrase.length > 1)
    .concat([
      ['vice', 'city'],
      ['grand', 'theft', 'auto'],
      ['rockstar', 'game'],
    ])
    .map((phrase) => [phrase.join(''), phrase]),
);
// Tesseract often reads a stylised "6" as G, b or 61 next to "GTA".
const ocrSix = new Set(['g', 'b', '61', '611', '6i', 'gi', '6l', 'e']);

function canonical(token: string, ocr: boolean): string[] {
  if (token === BOUNDARY) return [token];
  const phrase = gluedPhrases.get(token);
  if (phrase) return phrase;
  if (ocr && /^gta(?:g|b|61+|6i)$/.test(token)) return ['gta6'];
  const glued = lex.glued.exec(token);
  if (glued) {
    const rest = glued[1]!;
    const digit = /^(?:gta|grandtheftauto)6/.test(token);
    if (
      (digit && !/^\d/.test(rest)) ||
      rest === '' ||
      rest === 's' ||
      vocabulary.has(stem(rest))
    )
      return rest && rest !== 's' ? ['gta6', stem(rest)] : ['gta6'];
  }
  // Real words one edit or suffix away from a name ("Leonidas") stay as-is.
  if (lex.fuzzyStoplist.has(token)) return [token];
  const stemmed = stem(token);
  if (vocabulary.has(stemmed) || /^\d+$/.test(token)) return [stemmed];
  if (/\d/.test(token) && /\p{L}/u.test(token)) {
    const unleet = stem(token.replace(/\d/g, (d) => lex.leet[d] ?? d));
    if (vocabulary.has(unleet)) return [unleet];
  }
  if (stemmed.length >= 4 && !lex.fuzzyStoplist.has(stemmed))
    return [fuzzyLookup(stemmed) ?? stemmed];
  return [stemmed];
}

export function canonicalTokens(text: string, ocr = false): string[] {
  const words = tokenize(text).flatMap((token) => canonical(token, ocr));
  if (ocr)
    for (let i = 1; i < words.length; i++)
      if (words[i - 1] === 'gta' && ocrSix.has(words[i]!)) words[i] = '6';
  return words;
}

/** Finds the rule that ties this text to GTA 6, if any. */
function contextRule(words: string[], text: string): string | undefined {
  const has = (list: string[]) => list.some((phrase) => text.includes(phrase));
  // "GTA" also means the Greater Toronto Area, a car trim and a criminal charge.
  const torontoOrCrime =
    (has(lists.toronto) || has(lists.crime) || has(lists.car)) &&
    !has(lists.gameOnly);

  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'gta6') return 'explicit';
    let number = -1;
    if (words[i] === 'gta') number = i + 1;
    // "Theft Auto VI" alone counts too: OCR and cropped titles drop "Grand".
    else if (words[i] === 'theft' && words[i + 1] === 'auto') number = i + 2;
    const value = words[number];
    if (value === undefined || !lex.sixes.has(value)) continue;
    const digit = value !== 'vi';
    if (
      digit &&
      (lex.quantityNouns.has(words[number + 1] ?? '') || torontoOrCrime)
    )
      continue;
    return 'explicit';
  }

  if (has(lists.unique)) return 'unique-name';

  const jason = words.some(
    (w, i) => w === 'jason' && !lex.otherJasons.has(words[i + 1] ?? ''),
  );
  const lucia = words.some(
    (w, i) =>
      w === 'lucia' &&
      !lex.otherLucias.has(words[i - 1] ?? '') &&
      !lex.otherLucias.has(words[i + 1] ?? ''),
  );
  if (jason && lucia) return 'jason-lucia';

  const otherTitle = has(lists.other);
  const nameOverride = has(lists.unique) || has(lists.newNames);
  const blockedByOtherGame = otherTitle && !nameOverride;
  if (
    (jason || lucia || has(lists.weak)) &&
    has(lists.gameOnly) &&
    !blockedByOtherGame
  )
    return 'character';

  if (text.includes(' vice city ')) {
    const fresh = has(lists.recentNoDate);
    const dated = has(lists.newStrong);
    const travel = has(lists.travel) && !has(lists.gameNotPlace);
    if ((!otherTitle || dated || nameOverride) && (fresh || (dated && !travel)))
      return 'vice-city';
  }

  const gta = words.some(
    (w, i) =>
      w === 'gta' ||
      (w === 'grand' && words[i + 1] === 'theft' && words[i + 2] === 'auto'),
  );
  if (gta && !blockedByOtherGame && !torontoOrCrime) {
    const upcoming = words.some(
      (w, i) =>
        ['new', 'next', 'upcom', 'latest'].includes(w) &&
        (words[i + 1] === 'gta' || words[i + 1] === 'grand'),
    );
    if (upcoming || has(lists.recent) || has(lists.story)) return 'gta-recent';
  }

  // "(that aren't from Rockstar)", "non-Rockstar", "not by Rockstar".
  const negated = (i: number) =>
    words
      .slice(Math.max(0, i - 3), i)
      .some((w) =>
        ['not', 'non', 'aren', 'isn', 'without', 'except', 'besides'].includes(
          w,
        ),
      );
  const rockstarAt = words.flatMap((w, i) => (w === 'rockstar' ? [i] : []));
  if (
    rockstarAt.some((i) => !negated(i)) &&
    !blockedByOtherGame &&
    !(has(lists.rockstarElsewhere) && !has(lists.gameOnly))
  ) {
    if (has(lists.story)) return 'rockstar-story';
    if (has(lists.recent)) return 'rockstar-recent';
  }
  return undefined;
}

export interface ClassifyOptions {
  layer?: Layer;
  /** The card's author or channel is on the blocklist. */
  blockedSource?: string;
}

export function classify(
  input: string,
  settings: Settings,
  options: ClassifyOptions = {},
): Verdict {
  if (!settings.enabled) return { hit: false };
  if (options.blockedSource)
    return {
      hit: true,
      rule: `account:${options.blockedSource}`,
      layer: 'channel',
    };
  const words = canonicalTokens(input, options.layer === 'ocr');
  const text = ` ${words.join(' ')} `;
  const rule = contextRule(words, text);
  if (!rule) return { hit: false };
  const layer = options.layer ?? 'text';
  const verdict = (name: string): Verdict => ({ hit: true, rule: name, layer });
  if (
    settings.keywords.some((keyword) => {
      const phrase = canonicalTokens(keyword).join(' ');
      return phrase.length > 0 && text.includes(` ${phrase} `);
    })
  )
    return verdict(`${rule}+keyword`);
  if (settings.mode === 'strict' && !settings.spoilerFree) return verdict(rule);
  let unlabeled = text;
  for (const label of lists.safety)
    unlabeled = unlabeled.replaceAll(label, ' ');
  if (lists.strong.some((phrase) => unlabeled.includes(phrase)))
    return verdict(`${rule}+spoiler`);
  if (settings.mode === 'light' || settings.spoilerFree) return { hit: false };
  if (lists.moderate.some((phrase) => text.includes(phrase)))
    return verdict(`${rule}+coverage`);
  return { hit: false };
}
