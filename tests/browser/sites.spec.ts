// Tier 1 site fixtures: each page reproduces the live markup of one site,
// filled with the eval set's examples for that site. 40% of the cards are in
// the initial HTML and the rest arrive in batches, like infinite scroll.
// Checks recall, false positives, flashes (any painted frame of a card that
// must be hidden) and that grids reflow without gaps. Writes
// tests/eval/sites-report.md. Run: npm run build && npx playwright test sites
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { thumbPath } from '../eval/thumbs';
import type { Page } from '@playwright/test';
import {
  blankTimes,
  expect,
  flashes,
  openFixture,
  outcomes,
  test,
} from './fixtures';

interface Example {
  id?: string;
  site: string;
  text: string;
  label: number;
  carrier?: string;
  thumb?: { text: string };
}
const dataset = JSON.parse(
  readFileSync('tests/eval/dataset.json', 'utf8'),
) as Example[];
const holdout = readFileSync('tests/eval/holdout.jsonl', 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line, i) => ({ id: `h${i}`, ...(JSON.parse(line) as Example) }));

const esc = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const expectAttr = (e: Example) => `data-expect="${e.label ? 'hide' : 'keep'}"`;
/** 11-character video id; "VG_<id>" makes the image server send its thumbnail. */
const videoId = (e: Example, i: number) =>
  (e.thumb ? `VG_${e.id}` : `v${i.toString(16)}`).padEnd(11, '0').slice(0, 11);
const handle = (i: number) => `creator${i}`;

interface SiteFixture {
  name: string;
  url: string;
  examples: Example[];
  card(e: Example, i: number): string;
  page(cards: string): string;
  /** CSS selector of the element new cards are appended to. */
  container: string;
  grid?: { item: string; columns: number };
  /** Settings stored before the page opens. */
  settings?: Record<string, unknown>;
  /** Pause per 600 px scrolled; the default 80 ms is far faster than a person. */
  scrollStepMs?: number;
  /** Allowed share of keep-labelled cards hidden (image model pages). */
  maxFalsePositiveRate?: number;
}

const pick = (site: string, carriers = ['text']) => [
  ...dataset.filter(
    (e) => e.site === site && carriers.includes(e.carrier ?? 'text'),
  ),
  ...holdout.filter((e) => e.site === site),
];

const baseFixtures: SiteFixture[] = [
  {
    name: 'youtube',
    maxFalsePositiveRate: 0.1,
    url: 'https://www.youtube.com/',
    examples: pick('youtube', ['text', 'ocr']),
    container: 'ytd-rich-grid-renderer > #contents',
    grid: { item: 'ytd-rich-item-renderer', columns: 4 },
    card: (e, i) => {
      const id = videoId(e, i);
      return `<ytd-rich-item-renderer ${expectAttr(e)}><div id="content"><yt-lockup-view-model>
        <a href="/watch?v=${id}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" style="width:100%;aspect-ratio:16/9;display:block"></a>
        <h3><a href="/watch?v=${id}"><span>${esc(e.text)}</span></a></h3>
        <a href="/@${handle(i)}">Creator ${i}</a></yt-lockup-view-model></div>
        <div id="menu"></div></ytd-rich-item-renderer>`;
    },
    page: (
      cards,
    ) => `<body style="margin:0;width:1280px"><ytd-app><ytd-rich-grid-renderer style="--ytd-rich-grid-items-per-row:4;display:block">
      <div id="contents">${cards}</div></ytd-rich-grid-renderer></ytd-app></body>`,
  },
  {
    name: 'youtube-search',
    maxFalsePositiveRate: 0.1,
    url: 'https://www.youtube.com/results?search_query=games',
    examples: pick('youtube', ['text', 'ocr']).filter((_, i) => i % 2 === 0),
    container: '#contents',
    card: (e, i) => {
      const id = videoId(e, i);
      return `<ytd-video-renderer ${expectAttr(e)} style="display:flex;gap:16px;margin:12px 0">
        <a href="/watch?v=${id}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" style="width:360px;aspect-ratio:16/9"></a>
        <div><a id="video-title" href="/watch?v=${id}" title="${esc(e.text)}">${esc(e.text)}</a>
        <a href="/@${handle(i)}">Creator ${i}</a></div></ytd-video-renderer>`;
    },
    page: (
      cards,
    ) => `<body><ytd-app><ytd-section-list-renderer><ytd-item-section-renderer>
      <div id="contents">${cards}</div></ytd-item-section-renderer></ytd-section-list-renderer></ytd-app></body>`,
  },
  {
    name: 'reddit',
    url: 'https://www.reddit.com/',
    examples: pick('reddit'),
    container: 'shreddit-feed',
    card: (e, i) =>
      `<article ${expectAttr(e)}><shreddit-post post-title="${esc(e.text)}" subreddit-prefixed-name="r/sub${i}" style="display:block;padding:12px">
        <a href="/r/sub${i}">r/sub${i}</a><a slot="title" href="/r/sub${i}/comments/${i}/x/">${esc(e.text)}</a></shreddit-post></article><hr>`,
    page: (cards) =>
      `<body><shreddit-app><main><shreddit-feed style="display:block">${cards}</shreddit-feed></main></shreddit-app></body>`,
  },
  {
    name: 'x',
    url: 'https://x.com/home',
    examples: pick('x'),
    container: '[aria-label="Timeline"] > div',
    card: (e, i) =>
      /^Trending/.test(e.text)
        ? `<div data-testid="cellInnerDiv" ${expectAttr(e)}><div><div data-testid="trend" role="link">${esc(e.text)}</div></div></div>`
        : `<div data-testid="cellInnerDiv" ${expectAttr(e)}><div><article data-testid="tweet" style="padding:12px">
          <div data-testid="User-Name"><a href="/${handle(i)}">User ${i}</a></div>
          <div data-testid="tweetText" lang="en">${esc(e.text)}</div></article></div></div>`,
    page: (cards) =>
      `<body><main><div aria-label="Timeline"><div>${cards}</div></div></main></body>`,
  },
  {
    name: 'google',
    url: 'https://www.google.com/search?q=games',
    examples: pick('google'),
    container: '#rso',
    card: (e, i) =>
      `<div class="MjjYud" ${expectAttr(e)}><div class="g"><a href="https://site${i}.example/page"><h3>${esc(e.text)}</h3></a>
        <div>Result snippet ${i}.</div></div></div>`,
    page: (cards) =>
      `<body><div id="search"><div id="rso">${cards}</div></div></body>`,
  },
  {
    name: 'google-news',
    maxFalsePositiveRate: 0.1,
    url: 'https://news.google.com/home',
    examples: pick('news'),
    container: 'main',
    card: (e, i) =>
      `<c-wiz data-node-index="${i}" ${expectAttr(e)} style="display:block;padding:8px"><article>
        <figure><img src="https://img.test/news${i}.jpg" style="width:100px;height:60px"></figure>
        <a href="./read/CBMi${i}">${esc(e.text)}</a><time>2 hours ago</time></article></c-wiz>`,
    page: (cards) => `<body><main>${cards}</main></body>`,
  },
  {
    name: 'article (tier 2)',
    url: 'https://blog.example.test/',
    examples: pick('article'),
    container: 'main',
    card: (e) =>
      `<article ${expectAttr(e)}><h2>${esc(e.text)}</h2><p>Continue reading.</p></article>`,
    page: (cards) => `<body><main>${cards}</main></body>`,
  },
];

const fixtures: SiteFixture[] = [
  ...baseFixtures,
  // Same page at skimming and reading speed.
  {
    ...baseFixtures[0]!,
    name: 'youtube (one screen per second)',
    scrollStepMs: 1000,
  },
  {
    ...baseFixtures[0]!,
    name: 'youtube (one screen per 2.5 s)',
    scrollStepMs: 2500,
  },
  {
    ...baseFixtures[0]!,
    name: 'youtube (not waiting for image recognition)',
    settings: { waitForClip: false },
  },
];

/** Appends the remaining cards in batches, as a feed does while scrolling. */
const streamScript = (container: string, rest: string[]) => `<script>
  const rest = ${JSON.stringify(rest)};
  const timer = setInterval(() => {
    const target = document.querySelector(${JSON.stringify(container)});
    const batch = rest.splice(0, 8);
    if (!target || !batch.length) return clearInterval(timer), (window.__streamed = true);
    target.insertAdjacentHTML('beforeend', batch.join(''));
  }, 150);
</script>`;

/** Scrolls through the page until no card is waiting for a verdict. */
async function settle(page: Page, stepMs = 80) {
  await page.waitForFunction(
    () => (window as unknown as { __streamed?: boolean }).__streamed,
    null,
    { timeout: 30_000 },
  );
  const pending = () =>
    page.evaluate(
      () =>
        document.querySelectorAll('[data-vg-wait]').length +
        [...document.querySelectorAll<HTMLElement>('[data-expect]')].filter(
          (card) =>
            !card.closest('[data-vg-hit]') &&
            [card, ...card.querySelectorAll<HTMLElement>('*')].some(
              (node) => getComputedStyle(node).visibility === 'hidden',
            ),
        ).length,
    );
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  for (let y = 0; y <= height; y += 600) {
    await page.evaluate((top) => scrollTo(0, top), y);
    await page.waitForTimeout(stepMs);
  }
  await expect.poll(pending, { timeout: 60_000, intervals: [250] }).toBe(0);
}

/** Visible grid items fill rows completely except the last: no gaps. */
async function gridGaps(page: Page, item: string, columns: number) {
  return page.evaluate(
    ({ item, columns }) => {
      const rows = new Map<number, number>();
      for (const element of document.querySelectorAll<HTMLElement>(item)) {
        const box = element.getBoundingClientRect();
        if (box.height === 0) continue;
        const top = Math.round(box.top + scrollY);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      const counts = [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, n]) => n);
      return counts.slice(0, -1).filter((n) => n !== columns).length;
    },
    { item, columns },
  );
}

interface Result {
  name: string;
  tp: number;
  fn: number;
  fp: number;
  tn: number;
  flashes: string[];
  blank: number[];
  firstScreen: number;
  gaps?: number;
  rules: Record<string, number>;
  ms: number;
  misses: string[];
  falsePositives: string[];
}
// One file per page, so the report survives Playwright restarting the worker after a failure.
const resultDir = 'tests/eval/.cache/sites';

for (const fixture of fixtures) {
  test(`site: ${fixture.name}`, async ({
    extension: { context, background, popup },
  }) => {
    test.setTimeout(300_000);
    const missing = fixture.examples.filter(
      (e) => e.thumb && !existsSync(thumbPath(e.id!)),
    );
    expect(
      missing.map((e) => e.id),
      'eval thumbnails are rendered (global setup)',
    ).toEqual([]);
    const cards = fixture.examples.map((e, i) => fixture.card(e, i));
    const initial = Math.ceil(cards.length * 0.4);
    const start = Date.now();
    if (fixture.settings)
      await background.evaluate(
        (value) =>
          (globalThis as any).chrome.storage.local.set({ settings: value }),
        fixture.settings,
      );
    const page = await openFixture(
      context,
      fixture.url,
      fixture.page(cards.slice(0, initial).join('')) +
        streamScript(fixture.container, cards.slice(initial)),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    // Time from navigation until every card on the first screen is judged.
    const firstScreen = await page
      .waitForFunction(
        () => {
          const pending = [
            ...document.querySelectorAll<HTMLElement>('[data-expect]'),
          ].some((card) => {
            const box = card.getBoundingClientRect();
            if (
              box.height === 0 ||
              box.top > innerHeight ||
              card.closest('[data-vg-hit]')
            )
              return false;
            return [card, ...card.querySelectorAll<HTMLElement>('*')].some(
              (node) => getComputedStyle(node).visibility === 'hidden',
            );
          });
          return pending ? false : Math.round(performance.now());
        },
        null,
        { timeout: 30_000, polling: 'raf' },
      )
      .then((handle) => handle.jsonValue() as Promise<number>);
    await settle(page, fixture.scrollStepMs);
    // Without waiting for image recognition, CLIP can still remove cards
    // after they were shown; let it finish.
    if (fixture.settings?.waitForClip === false) {
      const outstanding = () =>
        popup.evaluate(
          async () =>
            (
              await (globalThis as any).chrome.runtime.sendMessage({
                type: 'vg:status',
              })
            ).clipOutstanding as number,
        );
      await expect
        .poll(outstanding, { timeout: 180_000, intervals: [500] })
        .toBe(0);
      await page.waitForTimeout(500);
    }
    const result = await outcomes(page);
    // A flash is a card painted and then hidden. Painted cards that stay
    // visible are misses, reported as recall.
    const seen = [...new Set(await flashes(page))].filter(
      (text) => !result.misses.some((miss) => miss.startsWith(text)),
    );
    const blank = await blankTimes(page);
    if (seen.length && process.env.VG_DEBUG)
      for (const text of seen.slice(0, 3))
        console.log(
          text,
          await page.evaluate((t) => (window as any).__history(t), text),
        );
    // Audit entries are flushed every 3 s.
    await page.waitForTimeout(3500);
    const audit = (
      await background.evaluate(() =>
        (globalThis as any).chrome.storage.local.get('audit'),
      )
    ).audit as { rule: string; title: string }[] | undefined;
    const rules: Record<string, number> = {};
    for (const entry of audit ?? []) {
      const rule = entry.rule
        .replace(/ ".*/, '')
        .replace(/clip [\d.]+/, 'clip');
      rules[rule] = (rules[rule] ?? 0) + 1;
    }
    const gaps = fixture.grid
      ? await gridGaps(page, fixture.grid.item, fixture.grid.columns)
      : undefined;
    mkdirSync(resultDir, { recursive: true });
    writeFileSync(
      `${resultDir}/${fixtures.indexOf(fixture)}.json`,
      JSON.stringify({
        name: fixture.name,
        ...result,
        flashes: seen,
        blank,
        firstScreen,
        gaps,
        rules,
        ms: Date.now() - start,
      }),
    );
    writeReport();
    expect(seen, 'no card that must be hidden is ever painted').toEqual([]);
    if (gaps !== undefined) expect(gaps, 'grid rows have no holes').toBe(0);
    // The image model trades some false positives for recall (it calls
    // thumbnails of other GTA games GTA 6). Text-only pages must have none.
    expect(
      result.fp / Math.max(1, result.fp + result.tn),
      `false positives: ${result.falsePositives.join(' / ')}`,
    ).toBeLessThanOrEqual(fixture.maxFalsePositiveRate ?? 0);
    expect(result.tp / (result.tp + result.fn)).toBeGreaterThanOrEqual(0.95);
  });
}

function writeReport() {
  const results = readdirSync(resultDir)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map(
      (file) =>
        JSON.parse(readFileSync(`${resultDir}/${file}`, 'utf8')) as Result,
    );
  const q = (values: number[], p: number) =>
    [...values].sort((a, b) => a - b)[
      Math.min(values.length - 1, Math.floor(values.length * p))
    ];
  const pct = (a: number, b: number) =>
    b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a';
  const lines = [
    '# Vice Guard site fixture report',
    '',
    'Generated by `npx playwright test sites` against the built extension in Chromium.',
    'Each page reproduces the live markup of the site; 60% of its cards arrive after load.',
    '',
    'Cards waiting for their thumbnail verdict keep their slot but are blank.',
    '"Blank on screen" is how long such slots were inside the viewport before',
    'their verdict (p50 / p95 / max over cards that were blank on screen at all).',
    '"Timeout hides" are cards removed by the 10 s fail-closed image timeout.',
    '"First screen" is from navigation until every card in the first viewport is judged.',
    'Thumbnails arrive with 90-350 ms of simulated network delay.',
    'Pages scroll one screen per 80 ms (far faster than a person) unless noted.',
    '',
    '| Page | Cards | Recall | False positives | Flashes | Grid gaps | First screen | Blank on screen | Timeout hides | Time |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.tp + r.fn + r.fp + r.tn} | ${pct(r.tp, r.tp + r.fn)} (${r.tp}/${r.tp + r.fn}) | ${pct(r.fp, r.fp + r.tn)} (${r.fp}/${r.fp + r.tn}) | ${r.flashes.length} | ${r.gaps ?? 'n/a'} | ${(r.firstScreen / 1000).toFixed(1)} s | ${r.blank.length ? `${r.blank.length} cards: ${q(r.blank, 0.5)} / ${q(r.blank, 0.95)} / ${q(r.blank, 1)} ms` : 'none'} | ${r.rules['image-timeout'] ?? 0} | ${(r.ms / 1000).toFixed(1)} s |`,
    ),
    '',
    'Hide reasons (audit log, includes timeout hides that were later undone):',
    '',
    ...results.map(
      (r) =>
        `- ${r.name}: ${Object.entries(r.rules)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')}`,
    ),
    '',
    ...results.flatMap((r) => [
      ...(r.misses.length
        ? [`Misses on ${r.name}:`, ...r.misses.map((m) => `- ${m}`), '']
        : []),
      ...(r.falsePositives.length
        ? [
            `False positives on ${r.name}:`,
            ...r.falsePositives.map((m) => `- ${m}`),
            '',
          ]
        : []),
      ...(r.flashes.length
        ? [`Flashes on ${r.name}:`, ...r.flashes.map((m) => `- ${m}`), '']
        : []),
    ]),
  ];
  writeFileSync('tests/eval/sites-report.md', `${lines.join('\n')}\n`);
}
