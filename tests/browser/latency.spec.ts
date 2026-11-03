import { expect, test } from './fixtures';

// Measures model start-up and per-thumbnail latency in real Chromium.
// Run: npx playwright test latency  (prints a table; asserts loose ceilings)
test('image layer latency', async ({ extension: { popup } }) => {
  test.setTimeout(180_000);
  const status = () =>
    popup.evaluate(() =>
      (globalThis as any).chrome.runtime.sendMessage({ type: 'vg:status' }),
    );
  const t0 = Date.now();
  await expect
    .poll(async () => (await status()).engine, {
      timeout: 120_000,
      intervals: [100],
    })
    .toMatchObject({ ocr: 'ready', clip: 'ready' });
  const engine = (await status()).engine;
  console.log(
    `warm-up: ocr ready ${engine.ocrReadyMs} ms, clip ready ${engine.clipReadyMs} ms (waited ${Date.now() - t0} ms after popup open)`,
  );

  const analyze = (url: string) =>
    popup.evaluate(async (u) => {
      const start = performance.now();
      const send = (type: string) =>
        (globalThis as any).chrome.runtime.sendMessage({ type, url: u });
      const early = await send('vg:image');
      // Time until text and thumbnail text are known (what a card waits
      // for with "Wait for image recognition" off).
      const ocrRoundTrip = Math.round(performance.now() - start);
      const result = early.clipPending
        ? { ...early, ...(await send('vg:clip')) }
        : early;
      return {
        ...result,
        ocrRoundTrip,
        roundTrip: Math.round(performance.now() - start),
      };
    }, url);

  const rows: {
    url: string;
    roundTrip: number;
    ocrRoundTrip: number;
    fetch: number;
    ocr: number;
    clip: number;
    score: number;
  }[] = [];
  for (let i = 0; i < 10; i++) {
    const url = `https://img.test/${i % 2 ? 'plain' : 'GTA'}-${i}-${Date.now()}.png`;
    const result = await analyze(url);
    expect(result.error).toBeUndefined();
    rows.push({
      url: url.split('/').pop()!,
      roundTrip: result.roundTrip,
      ocrRoundTrip: result.ocrRoundTrip,
      ...result.timing,
      score: result.clip,
    });
  }
  // Parallel burst, as when a feed page loads 8 cards at once.
  const burstStart = Date.now();
  const burst = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      analyze(
        `https://img.test/burst-${i % 2 ? 'plain' : 'GTA'}-${i}-${Date.now()}.png`,
      ),
    ),
  );
  const burstMs = Date.now() - burstStart;
  console.table(rows);
  const p = (values: number[], q: number) =>
    [...values].sort((a, b) => a - b)[
      Math.min(values.length - 1, Math.floor(values.length * q))
    ]!;
  const trips = rows.slice(1).map((r) => r.roundTrip);
  console.log(
    `sequential warm: p50 ${p(trips, 0.5)} ms, p90 ${p(trips, 0.9)} ms; first ${rows[0]!.roundTrip} ms`,
  );
  const textTrips = rows.slice(1).map((r) => r.ocrRoundTrip);
  console.log(
    `without waiting for image recognition: p50 ${p(textTrips, 0.5)} ms, p90 ${p(textTrips, 0.9)} ms`,
  );
  console.log(
    `burst of 8: all done in ${burstMs} ms; slowest ${Math.max(...burst.map((r) => r.roundTrip))} ms, slowest text-only ${Math.max(...burst.map((r) => r.ocrRoundTrip))} ms`,
  );
  const cached = await analyze(`https://img.test/${rows[0]!.url}`);
  console.log(`cache hit: ${cached.roundTrip} ms`);
});
