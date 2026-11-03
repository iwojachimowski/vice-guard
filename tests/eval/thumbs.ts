// Renders the eval set's placeholder thumbnails (scene art + overlay text)
// into tests/eval/.cache/thumbs. Used by `npm run eval:images` and, through
// Playwright's global setup, by the site fixtures, so a fresh checkout works.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import type { Example } from './build-dataset';

const thumbs = resolve('tests/eval/.cache/thumbs');
export const thumbPath = (id: string) => join(thumbs, `${id}.png`);

const scenes: Record<string, string> = {
  neon: 'linear-gradient(160deg,#2b0057,#ff2fa0 55%,#ffb347)',
  sunset: 'linear-gradient(180deg,#ff7e5f,#feb47b 45%,#1d2b64)',
  night: 'radial-gradient(circle at 30% 20%,#2c3e75,#05070f 70%)',
  dark: 'radial-gradient(circle at 70% 60%,#7a0b0b,#000 65%)',
  bright: 'linear-gradient(120deg,#00d2ff,#fff200)',
};
const fonts = ['Impact', 'Arial Black', 'Verdana', 'Georgia', 'Trebuchet MS'];

function html(example: Example, index: number) {
  const thumb = example.thumb!;
  const rotate = ((index * 37) % 13) - 6;
  const top = 18 + ((index * 53) % 45);
  const color = index % 3 === 0 ? '#ffe600' : '#fff';
  const size = thumb.text.length > 12 ? 46 : 64;
  // Silhouettes stand in for scenery so text is not on a flat background.
  return `<body style="margin:0"><div style="position:relative;width:480px;height:360px;overflow:hidden;background:${scenes[thumb.scene]}">
    <div style="position:absolute;left:${(index * 29) % 300}px;bottom:0;width:140px;height:${120 + (index % 5) * 30}px;background:#0008;border-radius:60px 60px 0 0"></div>
    <div style="position:absolute;right:20px;bottom:0;width:90px;height:220px;background:repeating-linear-gradient(0deg,#0009 0 12px,#ffd70055 12px 16px)"></div>
    <div style="position:absolute;left:0;right:0;top:${top}%;text-align:center;transform:rotate(${rotate}deg);font:900 ${size}px '${fonts[index % fonts.length]}';color:${color};-webkit-text-stroke:3px #000;paint-order:stroke;text-shadow:4px 4px 0 #000">${thumb.text}</div>
  </div></body>`;
}

/** Every eval example that has a thumbnail. */
export function thumbExamples(): Example[] {
  const dataset = JSON.parse(
    readFileSync('tests/eval/dataset.json', 'utf8'),
  ) as Example[];
  return dataset.filter((example) => example.thumb);
}

/** Renders missing thumbnails; returns how many were rendered. */
export async function renderThumbs(): Promise<number> {
  const withThumbs = thumbExamples();
  const missing = withThumbs.filter(
    (example) => !existsSync(thumbPath(example.id)),
  );
  if (!missing.length) return 0;
  mkdirSync(thumbs, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.VG_CHROMIUM || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 480, height: 360 },
    deviceScaleFactor: 2,
  });
  for (const [index, example] of withThumbs.entries()) {
    const file = thumbPath(example.id);
    if (existsSync(file)) continue;
    await page.setContent(html(example, index));
    await page.screenshot({ path: file });
  }
  await browser.close();
  return missing.length;
}
