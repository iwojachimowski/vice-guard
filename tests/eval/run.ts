// Recall / false-positive report per layer: `npm run eval`.
// OCR and CLIP results come from caches written by `npm run eval:images`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { classify } from '../../lib/detector';
import { defaults } from '../../lib/settings';
import type { Example } from './build-dataset';

interface Row extends Partial<Omit<Example, 'site'>> {
  text: string;
  label: 0 | 1;
  site: string;
}
const load = <T>(path: string, fallback: T): T =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;

const generated = load<Row[]>('tests/eval/dataset.json', []);
const holdout = readFileSync('tests/eval/holdout.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map((line) => ({
    ...(JSON.parse(line) as Row),
    category: 'holdout',
    carrier: 'text' as const,
  }));
const ocr = load<Record<string, string>>('tests/eval/.cache/ocr.json', {});
const clip = load<Record<string, number>>('tests/eval/.cache/clip.json', {});
// Same threshold the extension ships with, unless overridden.
const clipThreshold = Number(
  process.env.CLIP_THRESHOLD ?? defaults.clipThreshold,
);

type LayerName = 'text' | 'ocr' | 'clip';
function layers(row: Row): Record<LayerName, boolean | undefined> {
  const key = row.id ?? '';
  return {
    text: classify(row.text, defaults).hit,
    // Same as the engine: thumbnail text is judged with the card's text.
    ocr:
      key in ocr
        ? classify(`${row.text} | ${ocr[key]!}`, defaults, { layer: 'ocr' }).hit
        : undefined,
    clip: key in clip ? clip[key]! >= clipThreshold : undefined,
  };
}

interface Score {
  tp: number;
  fn: number;
  fp: number;
  tn: number;
}
const empty = (): Score => ({ tp: 0, fn: 0, fp: 0, tn: 0 });
function tally(score: Score, label: number, hit: boolean) {
  if (label) score[hit ? 'tp' : 'fn']++;
  else score[hit ? 'fp' : 'tn']++;
}
const pct = (a: number, b: number) =>
  b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a';
const recall = (s: Score) => pct(s.tp, s.tp + s.fn);
const fpr = (s: Score) => pct(s.fp, s.fp + s.tn);

function evaluate(rows: Row[]) {
  const byLayer: Record<string, Score> = {
    text: empty(),
    ocr: empty(),
    clip: empty(),
    combined: empty(),
  };
  const byGroup = new Map<string, Score>();
  const misses: string[] = [];
  const falsePositives: string[] = [];
  for (const row of rows) {
    const result = layers(row);
    for (const name of ['text', 'ocr', 'clip'] as const)
      if (result[name] !== undefined)
        tally(byLayer[name]!, row.label, result[name]!);
    // Visual-only rows use placeholder art, which CLIP cannot meaningfully
    // recognise; they are reported separately and left out of "combined".
    if (row.carrier === 'visual') continue;
    const hit = Object.values(result).some(Boolean);
    tally(byLayer.combined!, row.label, hit);
    for (const group of [`site:${row.site}`, `category:${row.category}`]) {
      if (!byGroup.has(group)) byGroup.set(group, empty());
      tally(byGroup.get(group)!, row.label, hit);
    }
    if (row.label && !hit)
      misses.push(
        `${row.id ?? ''} ${row.text}${row.thumb ? ` [thumb: ${row.thumb.text || row.thumb.scene}]` : ''}`,
      );
    if (!row.label && hit) falsePositives.push(`${row.id ?? ''} ${row.text}`);
  }
  return { byLayer, byGroup, misses, falsePositives };
}

const lines: string[] = ['# Vice Guard eval report', ''];
for (const [title, rows] of [
  ['Generated set', generated],
  ['Handwritten holdout', holdout],
  ['All', [...generated, ...holdout]],
] as [string, Row[]][]) {
  const { byLayer, byGroup, misses, falsePositives } = evaluate(rows);
  const visual = rows.filter((r) => r.carrier === 'visual');
  lines.push(`## ${title} (${rows.length} examples)`, '');
  lines.push(
    '| Layer | Positives scored | Recall | Negatives scored | False positives |',
  );
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const [name, s] of Object.entries(byLayer))
    lines.push(
      `| ${name} | ${s.tp + s.fn} | ${recall(s)} | ${s.fp + s.tn} | ${fpr(s)} |`,
    );
  if (visual.length) {
    const caught = visual.filter((r) => layers(r).clip).length;
    lines.push(
      '',
      `Visual-only placeholders (${visual.length}, excluded from "combined"): CLIP caught ${caught}. ` +
        'Placeholder art does not look like GTA 6, so this measures nothing yet; put real ' +
        'screenshots in tests/eval/images-real/ to score CLIP.',
    );
  }
  lines.push('', '| Group | Recall | FP rate |', '| --- | ---: | ---: |');
  for (const [group, s] of [...byGroup].sort())
    lines.push(`| ${group} | ${recall(s)} | ${fpr(s)} |`);
  lines.push(
    '',
    `Misses (${misses.length}):`,
    ...misses.slice(0, 40).map((m) => `- ${m}`),
  );
  lines.push(
    '',
    `False positives (${falsePositives.length}):`,
    ...falsePositives.slice(0, 40).map((m) => `- ${m}`),
    '',
  );
}
// Real screenshots from tests/eval/images-real/{positive,negative}/.
const realIds = Object.keys(clip).filter((id) => id.startsWith('real:'));
if (realIds.length) {
  const positives = realIds.filter((id) => id.startsWith('real:positive/'));
  const negatives = realIds.filter((id) => id.startsWith('real:negative/'));
  const textHit = (id: string) =>
    !!ocr[id] && classify(ocr[id]!, defaults, { layer: 'ocr' }).hit;
  const pct = (n: number, d: number) =>
    d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a';
  lines.push(
    '',
    `## Real screenshots (${positives.length} positive, ${negatives.length} negative)`,
    '',
    'Image only, no title. "Either" is what the extension does: hidden if the',
    'thumbnail text reads as GTA 6 or CLIP scores at or above the sensitivity.',
    '',
    '| CLIP sensitivity | CLIP catches | Either catches | Negatives wrongly blocked |',
    '| ---: | ---: | ---: | ---: |',
  );
  for (const threshold of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
    const caught = positives.filter((id) => clip[id]! >= threshold).length;
    const either = positives.filter(
      (id) => clip[id]! >= threshold || textHit(id),
    ).length;
    const wrong = negatives.filter(
      (id) => clip[id]! >= threshold || textHit(id),
    ).length;
    lines.push(
      `| ${threshold.toFixed(1)}${threshold === defaults.clipThreshold ? ' (default)' : ''} | ${pct(caught, positives.length)} | ${pct(either, positives.length)} | ${pct(wrong, negatives.length)} |`,
    );
  }
  lines.push(
    '',
    `Thumbnail text alone catches ${pct(positives.filter(textHit).length, positives.length)}.`,
    '',
    'Lowest-scoring positives (what CLIP misses):',
    ...positives
      .sort((a, b) => clip[a]! - clip[b]!)
      .slice(0, 10)
      .map(
        (id) =>
          `- ${id.slice(5)}: ${clip[id]!.toFixed(2)}${textHit(id) ? ' (caught by text)' : ''}`,
      ),
  );
}
const report = lines.join('\n');
writeFileSync('tests/eval/report.md', report);
console.log(report);
