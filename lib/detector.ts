import dictionary from './spoilers.json';
import type { Settings } from './settings';

export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function contains(text: string, phrase: string): boolean {
  const normalized = normalize(phrase);
  return normalized.length > 0 && ` ${text} `.includes(` ${normalized} `);
}

export function detect(text: string, settings: Settings): boolean {
  if (!settings.enabled) return false;
  const normalized = normalize(text);
  if (!dictionary.context.some((word) => contains(normalized, word)))
    return false;
  if (settings.keywords.some((word) => contains(normalized, word))) return true;
  const withoutSafetyLabels = normalized.replace(
    /\b(?:no spoilers?|spoiler free|spoilers free)\b/g,
    ' ',
  );
  const strong = dictionary.strong.some((word) =>
    contains(withoutSafetyLabels, word),
  );
  if (strong) return true;
  if (settings.mode === 'light' || settings.spoilerFree) return false;
  if (settings.mode === 'strict') return true;
  return [...dictionary.characters, ...dictionary.moderate].some((word) =>
    contains(normalized, word),
  );
}

export function hasGtaContext(text: string): boolean {
  const normalized = normalize(text);
  return dictionary.context.some((word) => contains(normalized, word));
}
