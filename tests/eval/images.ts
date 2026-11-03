// Image-layer eval: `npm run eval:images`, then `npm run eval`.
// 1. Renders each dataset thumbnail (placeholder art + overlay text) with Playwright.
// 2. Runs the same Tesseract settings and MobileCLIP-S0 model the extension ships.
// Writes tests/eval/.cache/{ocr,clip,timing}.json. Optional real images go in
// tests/eval/images-real/{positive,negative}/ (gitignored) and get their own scores.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { renderThumbs, thumbPath } from './thumbs';
import { createWorker, OEM, PSM } from 'tesseract.js';
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@huggingface/transformers';
import { CLIP_DTYPE, CLIP_MODEL } from '../../lib/image/clip-files';
import sharp from 'sharp';
import {
  brightTextMask,
  confidentText,
  OCR_MAX_SIDE,
  OCR_SCALE,
  ocrParameters,
  recognizeOptions,
} from '../../lib/image/ocr';
import { gtaProbability, type PromptEmbeddings } from '../../lib/image/score';
import prompts from '../../lib/image/prompts.json';
import type { Example } from './build-dataset';

const cache = 'tests/eval/.cache';
const dataset = JSON.parse(
  readFileSync('tests/eval/dataset.json', 'utf8'),
) as Example[];
const withThumbs = dataset.filter((example) => example.thumb);

function realImages() {
  const root = 'tests/eval/images-real';
  const files: { id: string; path: string; label: 0 | 1 }[] = [];
  for (const [folder, label] of [
    ['positive', 1],
    ['negative', 0],
  ] as const) {
    const dir = join(root, folder);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir))
      if (/\.(png|jpe?g|webp)$/i.test(name))
        files.push({
          id: `real:${folder}/${name}`,
          path: join(dir, name),
          label,
        });
  }
  return files;
}

const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * p))
  ] ?? 0;

await renderThumbs();
const images = [
  ...withThumbs.map((example) => ({
    id: example.id,
    path: thumbPath(example.id),
  })),
  ...realImages(),
];

const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int',
  gzip: true,
  cacheMethod: 'none',
});
await worker.setParameters({
  tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  ...ocrParameters,
});

/**
 * The same two passes as the offscreen document, on the image as a site
 * serves it (480x360 for rendered thumbnails) scaled the same way.
 */
async function ocrPasses(path: string, synthetic: boolean) {
  const source = sharp(path);
  const meta = await source.metadata();
  const [w0, h0] = synthetic ? [480, 360] : [meta.width!, meta.height!];
  const scale = Math.min(OCR_SCALE, OCR_MAX_SIDE / Math.max(w0, h0));
  const [w, h] = [Math.round(w0 * scale), Math.round(h0 * scale)];
  const { data, info } = await sharp(
    await source.resize(w0, h0).png().toBuffer(),
  )
    .resize(w, h)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const original = await sharp(data, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();
  const mask = await sharp(
    Buffer.from(brightTextMask(data, info.width, info.height)),
    {
      raw: { width: info.width, height: info.height, channels: 4 },
    },
  )
    .png()
    .toBuffer();
  const texts = [];
  for (const input of [original, mask])
    texts.push(
      confidentText((await worker.recognize(input, {}, recognizeOptions)).data),
    );
  return texts.join(' | ');
}

/**
 * What the extension hands CLIP: the image as served (480x360 for rendered
 * thumbnails), shrunk so its shorter side is at most 256 px.
 */
async function clipInput(path: string, synthetic: boolean) {
  const meta = await sharp(path).metadata();
  const [w0, h0] = synthetic ? [480, 360] : [meta.width!, meta.height!];
  const scale = Math.min(1, 256 / Math.min(w0, h0));
  const [w, h] = [Math.round(w0 * scale), Math.round(h0 * scale)];
  const { data } = await sharp(path)
    .resize(w0, h0)
    .resize(w, h)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data), w, h, 3);
}

env.allowRemoteModels = false;
env.localModelPath = 'public/models/';
const processor = await AutoProcessor.from_pretrained(CLIP_MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, {
  dtype: CLIP_DTYPE,
});

const ocr: Record<string, string> = {};
const clip: Record<string, number> = {};
const timing = { ocr: [] as number[], clip: [] as number[] };
for (const image of images) {
  let start = performance.now();
  ocr[image.id] = await ocrPasses(image.path, !image.id.startsWith('real:'));
  timing.ocr.push(performance.now() - start);
  start = performance.now();
  const inputs = await processor(
    await clipInput(image.path, !image.id.startsWith('real:')),
  );
  const { image_embeds } = (await model(inputs)) as {
    image_embeds: { data: Float32Array };
  };
  clip[image.id] = gtaProbability(
    image_embeds.data,
    prompts as PromptEmbeddings,
  );
  timing.clip.push(performance.now() - start);
}
await worker.terminate();

writeFileSync(join(cache, 'ocr.json'), JSON.stringify(ocr, null, 1));
writeFileSync(join(cache, 'clip.json'), JSON.stringify(clip, null, 1));
const summary = Object.fromEntries(
  Object.entries(timing).map(([name, values]) => [
    name,
    {
      mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      p95: Math.round(percentile(values, 0.95)),
    },
  ]),
);
writeFileSync(
  join(cache, 'timing.json'),
  JSON.stringify(
    {
      images: images.length,
      ...summary,
      real: realImages().map((r) => ({ id: r.id, label: r.label })),
    },
    null,
    1,
  ),
);
console.log(`Analysed ${images.length} images. Per image (ms):`, summary);
