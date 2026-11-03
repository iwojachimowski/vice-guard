import { browser } from 'wxt/browser';
import { createWorker, OEM, PSM } from 'tesseract.js';
import type { ImageResult } from '../../lib/engine/engine';
import {
  brightTextMask,
  confidentText,
  OCR_MAX_SIDE,
  OCR_SCALE,
  ocrParameters,
  recognizeOptions,
} from '../../lib/image/ocr';
import { letterbox } from '../../lib/image/letterbox';
import type { EngineStatus, OffscreenMessage } from '../../lib/messages';

// Everything loads from the extension package; nothing is fetched remotely
// except the image itself, from the host the page already loaded it from.
const asset = (path: string) => browser.runtime.getURL(path as '/');
const status: EngineStatus = { ocr: 'loading', clip: 'loading' };
const started = performance.now();
const since = (start: number) => Math.round(performance.now() - start);
const report = () =>
  void browser.runtime
    .sendMessage({ target: 'background', type: 'vg:engine', status })
    .catch(() => undefined);

// Measured on 4 cores: two OCR and two single-threaded CLIP workers give the
// best throughput (OCR and CLIP run side by side per image). More cores get
// up to three of each.
const cores = navigator.hardwareConcurrency || 4;
const WORKERS = Math.max(1, Math.min(3, cores - 2));
const OCR_WORKERS = WORKERS;
const ocrWorkers = Promise.all(
  Array.from({ length: OCR_WORKERS }, async () => {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: asset('/tesseract/worker.min.js'),
      corePath: asset('/tesseract/tesseract-core-simd-lstm.wasm.js'),
      langPath: asset('/tesseract/'),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none',
    });
    // Thumbnails have scattered display text, not paragraphs.
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      ...ocrParameters,
    });
    return worker;
  }),
);
ocrWorkers.then(
  () => (
    (status.ocr = 'ready'),
    (status.ocrReadyMs = since(started)),
    report()
  ),
  (error: unknown) => (
    (status.ocr = 'error'),
    (status.error = String(error)),
    report()
  ),
);

let nextOcr = 0;
/** Two passes: the image as-is, and with bright overlay text isolated. */
async function ocr(image: OffscreenCanvas, pixels: ImageData): Promise<string> {
  const workers = await ocrWorkers;
  const mask = new OffscreenCanvas(image.width, image.height);
  mask
    .getContext('2d')!
    .putImageData(
      new ImageData(
        brightTextMask(pixels.data, image.width, image.height),
        image.width,
        image.height,
      ),
      0,
      0,
    );
  const texts = await Promise.all(
    [image, mask].map(async (canvas) => {
      const worker = workers[nextOcr++ % workers.length]!;
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const { data } = await worker.recognize(blob, {}, recognizeOptions);
      return confidentText(data);
    }),
  );
  return texts.join(' | ');
}

// Single-threaded wasm (offscreen documents are not cross-origin isolated),
// so throughput comes from separate workers, each with its own session.
const CLIP_WORKERS = WORKERS;
let readyCount = 0;
interface ClipTask {
  job: Job;
  pixels: ImageData;
  resolve(result: { score?: number; error?: string }): void;
}
const idleClip: Worker[] = [];
const clipQueue: ClipTask[] = [];
const clipRunning = new Map<Worker, ClipTask>();
for (let i = 0; i < CLIP_WORKERS; i++) {
  const worker = new Worker(new URL('./clip-worker.ts', import.meta.url), {
    type: 'module',
  });
  idleClip.push(worker);
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as { type: string; score?: number; error?: string };
    if (data.type === 'ready' && ++readyCount === 1)
      ((status.clip = 'ready'), (status.clipReadyMs = since(started)));
    if (data.type === 'error')
      ((status.clip = 'error'), (status.error = data.error));
    if (data.type !== 'result') return report();
    clipRunning.get(worker)?.resolve(data);
    clipRunning.delete(worker);
    idleClip.push(worker);
    pumpClip();
  };
}
/** CLIP has its own queue, on-screen images first, so it never holds up OCR. */
function pumpClip() {
  while (idleClip.length && clipQueue.length) {
    let index = 0;
    for (let i = 1; i < clipQueue.length; i++)
      if (clipQueue[i]!.job.visibleAt > clipQueue[index]!.job.visibleAt)
        index = i;
    const task = clipQueue.splice(index, 1)[0]!;
    const worker = idleClip.pop()!;
    clipRunning.set(worker, task);
    worker.postMessage({ id: 0, pixels: task.pixels });
  }
}
function clip(
  job: Job,
  pixels: ImageData,
): Promise<{ score?: number; error?: string }> {
  if (status.clip === 'error') return Promise.resolve({ error: status.error });
  return new Promise((resolve) => {
    clipQueue.push({ job, pixels, resolve });
    pumpClip();
  });
}

interface Loaded {
  canvas: OffscreenCanvas;
  pixels: ImageData;
  /** A small copy for CLIP, which resizes to 256 px anyway. */
  clipPixels: ImageData;
  fetchMs: number;
}

interface Crop {
  y: number;
  width: number;
  height: number;
}

function scaled(bitmap: ImageBitmap, crop: Crop, scale: number) {
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(crop.width * scale)),
    Math.max(1, Math.round(crop.height * scale)),
  );
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(
    bitmap,
    0,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return {
    canvas,
    pixels: context.getImageData(0, 0, canvas.width, canvas.height),
  };
}

/** Downloads and decodes one image: scaled up for OCR, down for CLIP. */
async function download(url: string): Promise<Loaded> {
  const start = performance.now();
  const response = await fetch(url, {
    credentials: 'omit',
    cache: 'force-cache',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  // Cut black letterbox bars (a quarter of a 16:9 video's hqdefault.jpg).
  const full = scaled(
    bitmap,
    { y: 0, width: bitmap.width, height: bitmap.height },
    1,
  );
  const bars = letterbox(full.pixels.data, bitmap.width, bitmap.height);
  const crop = {
    y: bars.top,
    width: bitmap.width,
    height: bitmap.height - bars.top - bars.bottom,
  };
  // OCR reads small thumbnail text better upscaled.
  const { canvas, pixels } = scaled(
    bitmap,
    crop,
    Math.min(OCR_SCALE, OCR_MAX_SIDE / Math.max(crop.width, crop.height)),
  );
  const { pixels: clipPixels } = scaled(
    bitmap,
    crop,
    Math.min(1, 256 / Math.min(crop.width, crop.height)),
  );
  bitmap.close();
  return { canvas, pixels, clipPixels, fetchMs: since(start) };
}

/** CLIP halves of results whose OCR half was already sent, by URL. */
const lateClip = new Map<string, Promise<ImageResult>>();

/**
 * Starts OCR and queues CLIP. Resolves when OCR is done, with clipPending
 * set; CLIP's half is collected with a vg:clip message.
 */
function analyze(job: Job, { canvas, pixels, clipPixels, fetchMs }: Loaded) {
  const start = performance.now();
  const timed = async <T>(task: Promise<T>): Promise<[T, number]> => {
    const begin = performance.now();
    const value = await task;
    return [value, since(begin)];
  };
  const ocrTask = timed(
    status.ocr === 'error' ? Promise.resolve('') : ocr(canvas, pixels),
  );
  const clipTask = timed(clip(job, clipPixels));
  lateClip.set(
    job.url,
    Promise.all([ocrTask, clipTask]).then(([[, ocrMs], [vision, clipMs]]) =>
      vision.error
        ? { error: vision.error }
        : {
            clip: vision.score,
            timing: {
              fetch: fetchMs,
              ocr: ocrMs,
              clip: clipMs,
              total: fetchMs + since(start),
            },
          },
    ),
  );
  return ocrTask.then(([text]): ImageResult => ({
    ocr: text,
    clipPending: true,
  }));
}

// Downloads start as soon as a request arrives (network time would otherwise
// sit inside a compute slot); OCR runs OCR_WORKERS images at a time on images
// that have arrived. Cards on screen go first, most recently shown first, so
// cards the user already scrolled past do not hold up the ones in view.
const MAX_DOWNLOADS = 8;
interface Job {
  url: string;
  /** When the card came on screen; 0 while it is only a prefetch. */
  visibleAt: number;
  started: boolean;
  loaded?: Loaded;
  failed?: string;
  resolve(result: ImageResult): void;
}
const queue: Job[] = [];
/** Every job not yet finished with CLIP, for priority updates. */
const live = new Map<string, Job>();
/** Priorities that arrived before their request. */
const shownEarly = new Map<string, number>();
let running = 0;
let downloading = 0;
const byPriority = (a: Job, b: Job) => b.visibleAt - a.visibleAt;

function pump() {
  // Downloads, highest priority first.
  for (const job of [...queue].sort(byPriority)) {
    if (downloading >= MAX_DOWNLOADS) break;
    if (job.started) continue;
    job.started = true;
    downloading++;
    download(job.url)
      .then(
        (loaded) => (job.loaded = loaded),
        (error: unknown) => (job.failed = String(error)),
      )
      .finally(() => {
        downloading--;
        pump();
      });
  }
  // OCR, highest priority first among images that have arrived.
  while (running < OCR_WORKERS) {
    const job = queue
      .filter((entry) => entry.loaded || entry.failed)
      .sort(byPriority)[0];
    if (!job) break;
    queue.splice(queue.indexOf(job), 1);
    if (job.failed) {
      live.delete(job.url);
      job.resolve({ error: job.failed });
      continue;
    }
    running++;
    const loaded = job.loaded!;
    job.loaded = undefined;
    void analyze(job, loaded)
      .catch((error: unknown): ImageResult => ({ error: String(error) }))
      .then((result) => {
        running--;
        job.resolve(result);
        void lateClip.get(job.url)?.finally(() => live.delete(job.url));
        pump();
      });
  }
}

browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = raw as OffscreenMessage;
  if (message.target !== 'offscreen') return;
  if (message.type === 'vg:clip') {
    const result = lateClip.get(message.url);
    lateClip.delete(message.url);
    void (result ?? Promise.resolve({ error: 'no pending clip' })).then(
      sendResponse,
    );
    return true;
  }
  if (message.type === 'vg:prioritize') {
    const now = performance.now();
    for (const url of message.urls) {
      const job = live.get(url);
      if (job) job.visibleAt = now;
      // The request itself can arrive after this (the background checks its
      // cache first); remember the priority for it.
      else shownEarly.set(url, now);
    }
    pump();
    return;
  }
  const early = shownEarly.get(message.url) ?? 0;
  shownEarly.delete(message.url);
  const job: Job = {
    url: message.url,
    visibleAt: early,
    started: false,
    resolve: sendResponse,
  };
  queue.push(job);
  live.set(job.url, job);
  pump();
  return true;
});
report();
