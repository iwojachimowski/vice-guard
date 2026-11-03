import { browser } from 'wxt/browser';
import type { ImageResult } from './engine/engine';

const MAX_ENTRIES = 5000;
type Stored = Record<string, [ocr: string, clip: number | null, time: number]>;

/** Sizing parameters that do not change what an image shows. */
export function canonicalImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'i.ytimg.com') {
      const id = /\/vi(?:_webp)?\/([\w-]{11})\//.exec(parsed.pathname)?.[1];
      if (id) return `ytimg:${id}`;
    }
    for (const name of [
      'sqp',
      'rs',
      'name',
      'width',
      'height',
      'w',
      'h',
      's',
      'auto',
      'crop',
    ])
      parsed.searchParams.delete(name);
    return parsed.href;
  } catch {
    return url;
  }
}

export async function hashUrl(url: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalImageUrl(url)),
  );
  return [...new Uint8Array(digest).slice(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Verdicts keyed by URL hash, persisted locally so revisits are instant. */
export function createImageCache() {
  let entries: Stored | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const load = async () =>
    (entries ??=
      ((await browser.storage.local.get('imageCache')).imageCache as
        Stored | undefined) ?? {});
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const list = Object.entries(entries ?? {});
      if (list.length > MAX_ENTRIES) {
        list.sort((a, b) => a[1][2] - b[1][2]);
        entries = Object.fromEntries(list.slice(-MAX_ENTRIES));
      }
      void browser.storage.local.set({ imageCache: entries });
    }, 2000);
  };
  return {
    async get(url: string): Promise<ImageResult | undefined> {
      const value = (await load())[await hashUrl(url)];
      return value && { ocr: value[0], clip: value[1] ?? undefined };
    },
    async set(url: string, result: ImageResult) {
      (await load())[await hashUrl(url)] = [
        result.ocr ?? '',
        result.clip ?? null,
        Date.now(),
      ];
      save();
    },
    size: () => Object.keys(entries ?? {}).length,
  };
}
