// Lowercase Latin look-alikes from Cyrillic, Greek, small caps and IPA.
const confusables: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  з: '3',
  і: 'i',
  ї: 'i',
  ј: 'j',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  ѕ: 's',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  ӏ: 'l',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  ω: 'w',
  ᴀ: 'a',
  ʙ: 'b',
  ᴄ: 'c',
  ᴅ: 'd',
  ᴇ: 'e',
  ғ: 'f',
  ɢ: 'g',
  ʜ: 'h',
  ɪ: 'i',
  ᴊ: 'j',
  ᴋ: 'k',
  ʟ: 'l',
  ᴍ: 'm',
  ɴ: 'n',
  ᴏ: 'o',
  ᴘ: 'p',
  ʀ: 'r',
  ꜱ: 's',
  ᴛ: 't',
  ᴜ: 'u',
  ᴠ: 'v',
  ᴡ: 'w',
  ʏ: 'y',
  ᴢ: 'z',
  ɡ: 'g',
  ı: 'i',
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ǥ: 'g',
  ħ: 'h',
  ŧ: 't',
  ƀ: 'b',
  ɨ: 'i',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};
const confusablePattern = new RegExp(
  `[${Object.keys(confusables).join('')}]`,
  'gu',
);

/** Script-folded, lowercased text with hashtags and camelCase split apart. */
export function fold(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[\p{M}\p{Cf}]/gu, '')
      // Regional indicator letters (🇬🇹🇦) become plain letters.
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, (c) =>
        String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 97),
      )
      .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
      .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
      .replace(/(\p{N})(\p{Lu}\p{Ll})/gu, '$1 $2')
      .toLowerCase()
      .replace(confusablePattern, (c) => confusables[c]!)
      // Symbols used as letters inside words: "sp@iler", "$poilers".
      .replace(/(?<=\p{L})@(?=\p{L})/gu, 'a')
      .replace(/(?<![\p{L}\p{N}])\$(?=\p{L}{2})/gu, 's')
  );
}

export const BOUNDARY = '|';
type Separator = 'space' | 'joined' | 'boundary';

/**
 * Splits text into word tokens, with BOUNDARY between clauses so phrases
 * never match across commas or sentences. Spelled-out letters are rejoined:
 * "G.T.A-VI" and "G T A 6" become "gta vi" and "gta6".
 */
export function tokenize(text: string): string[] {
  const raw: { word: string; before: Separator }[] = [];
  let before: Separator = 'boundary';
  const folded = fold(text);
  for (const match of folded.matchAll(
    /([\p{L}\p{N}]+)|(\s+)|([^\p{L}\p{N}\s]+)/gu,
  )) {
    const [, word, space, punct] = match;
    if (word) {
      raw.push({ word, before });
      before = 'joined';
    } else if (space) {
      if (/[\n\r]/.test(space)) before = 'boundary';
      else if (before !== 'boundary') before = 'space';
    } else if (punct) {
      const last = raw.at(-1)?.word ?? '';
      if (/[,;!?|•¡¿。！？]/.test(punct)) before = 'boundary';
      else if (
        /^\.+$/.test(punct) &&
        last.length >= 2 &&
        /^(\s|$)/.test(folded.slice(match.index + punct.length))
      ) {
        // A sentence end splits; "G.T.A. 6" and "gta.vi" stay joined.
        before = 'boundary';
      } else if (before !== 'boundary') before = 'joined';
    }
  }
  const tokens: string[] = [];
  for (let i = 0; i < raw.length;) {
    const start = raw[i]!;
    if (start.before === 'boundary' && tokens.length) tokens.push(BOUNDARY);
    if (start.word.length === 1) {
      let end = i + 1;
      let spaced = false;
      while (
        end < raw.length &&
        raw[end]!.word.length === 1 &&
        raw[end]!.before !== 'boundary'
      ) {
        if (raw[end]!.before === 'space') spaced = true;
        end++;
      }
      const run = end - i;
      if (run >= 3 || (run === 2 && !spaced)) {
        tokens.push(
          raw
            .slice(i, end)
            .map((part) => part.word)
            .join(''),
        );
        i = end;
        continue;
      }
    }
    tokens.push(start.word);
    i++;
  }
  return tokens;
}

/** The original normalize(): plain space-separated words. */
export function normalize(text: string): string {
  return tokenize(text)
    .filter((token) => token !== BOUNDARY)
    .join(' ');
}
