interface Word {
  text: string;
  confidence: number;
}
interface RecognizeData {
  text: string;
  blocks?: { paragraphs: { lines: { words: Word[] }[] }[] }[] | null;
}

/**
 * Every recognised word. Low-confidence words are kept on purpose: the text
 * matcher is the filter, and noise rarely spells a GTA term.
 */
export function confidentText(data: RecognizeData, minConfidence = 0): string {
  if (!data.blocks) return data.text;
  return data.blocks
    .flatMap((block) =>
      block.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
    )
    .filter((word) => word.confidence >= minConfidence)
    .map((word) => word.text)
    .join(' ');
}

/**
 * Thumbnails are upscaled this much before OCR. Measured on the eval set
 * (480 px wide thumbnails, recall with the title): 1.0x 88.1%, 1.25x 94.0%,
 * 1.5x 94.0% at 30% more OCR time, 2x 94.0%. Smaller sources (320 px
 * mqdefault) lose recall at any scale.
 */
export const OCR_SCALE = 1.25;
/** Longest side after scaling, so large images do not cost more. */
export const OCR_MAX_SIDE = 900;

/** Tesseract options shared by the extension and the eval. */
export const recognizeOptions = { blocks: true } as const;
export const ocrParameters = {
  user_defined_dpi: '300',
  // Tesseract writes debug notes ("Detected 14 diacritics") to stderr, which
  // Chrome lists as extension errors. Send them nowhere.
  debug_file: '/dev/null',
} as const;

/**
 * Thumbnail text is usually white or yellow with a dark outline. Painting
 * those pixels black on white lets Tesseract read it off busy backgrounds.
 * Input and output are RGBA.
 */
export function brightTextMask(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let i = 0; i < width * height * 4; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const text =
      (r > 200 && g > 200 && b > 200) || (r > 200 && g > 190 && b < 110);
    const value = text ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = value;
    out[i + 3] = 255;
  }
  return out;
}
