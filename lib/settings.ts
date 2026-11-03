export type Mode = 'light' | 'balanced' | 'strict';
export interface Settings {
  enabled: boolean;
  mode: Mode;
  spoilerFree: boolean;
  keywords: string[];
  /** Show the hidden-item count on the toolbar icon. */
  showBadge: boolean;
  /** Run thumbnails through local OCR and CLIP. */
  imageLayer: boolean;
  /** CLIP probability (0-1) at or above which an image counts as GTA 6. */
  clipThreshold: number;
  /**
   * Keep a card hidden until CLIP has judged its image too. Off: show it once
   * text and thumbnail text are clean, and remove it if CLIP objects later.
   */
  waitForClip: boolean;
}

export const defaults: Settings = {
  enabled: true,
  mode: 'strict',
  spoilerFree: false,
  keywords: [],
  showBadge: true,
  imageLayer: true,
  clipThreshold: 0.6,
  waitForClip: true,
};

const bool = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export function parseSettings(value: unknown): Settings {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const threshold = Number(data.clipThreshold);
  return {
    enabled: bool(data.enabled, defaults.enabled),
    mode: ['light', 'balanced', 'strict'].includes(String(data.mode))
      ? (data.mode as Mode)
      : defaults.mode,
    spoilerFree: bool(data.spoilerFree, false),
    keywords: Array.isArray(data.keywords)
      ? [
          ...new Set(
            data.keywords
              .filter((word): word is string => typeof word === 'string')
              .map((word) => word.trim().slice(0, 120))
              .filter(Boolean),
          ),
        ].slice(0, 200)
      : [],
    showBadge: bool(data.showBadge, defaults.showBadge),
    imageLayer: bool(data.imageLayer, defaults.imageLayer),
    waitForClip: bool(data.waitForClip, defaults.waitForClip),
    clipThreshold:
      Number.isFinite(threshold) && threshold > 0 && threshold < 1
        ? threshold
        : defaults.clipThreshold,
  };
}
