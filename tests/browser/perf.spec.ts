import { writeFileSync } from 'node:fs';
import { expect, openFixture, test } from './fixtures';

// A feed that behaves like Instagram: big posts (caption + long comment
// threads) whose DOM changes all the time (video timers, like counters,
// carousels swapping images), plus infinite scroll. Measures main-thread
// script time with protection on vs off.
const comments = (i: number) =>
  Array.from(
    { length: 40 },
    (_, j) =>
      `<li><b>user${i}_${j}</b> <span>great shot, love the colours here ${j} 🔥</span></li>`,
  ).join('');
const post = (i: number) => `<article role="presentation">
  <header><a href="/u${i}/">u${i}</a></header>
  <div class="media"><img src="https://img.test/post${i}-0.jpg" width="470" height="470">
    <video poster="https://img.test/poster${i}.jpg"></video><span class="timer">0:00</span></div>
  <section><span class="likes">${i * 37} likes</span></section>
  <h1>Weekend trip ${i}: beach, food and sunsets</h1>
  <ul>${comments(i)}</ul></article>`;
const page = (
  count: number,
) => `<body><main>${Array.from({ length: count }, (_, i) => post(i)).join('')}</main>
<script>
  const comments = ${comments.toString()};
  const post = ${post.toString()};
  let tick = 0, next = ${count};
  setInterval(() => {
    tick++;
    for (const t of document.querySelectorAll('.timer')) t.textContent = '0:' + String(tick % 60).padStart(2, '0');
    for (const l of document.querySelectorAll('.likes')) l.textContent = (parseInt(l.textContent) + 1) + ' likes';
    if (tick % 8 === 0) for (const img of document.querySelectorAll('.media img')) img.src = img.src.replace(/-[0-9]+[.]jpg/, '-' + (tick % 3) + '.jpg');
    if (tick % 4 === 0) document.querySelector('main').insertAdjacentHTML('beforeend', [0, 1, 2].map(() => post(next++)).join(''));
  }, 250);
</script></body>`;

// Tracing snapshots the DOM on every action and would dominate the numbers.
test.use({ trace: 'off' });

for (const enabled of [false, true]) {
  test(`instagram-like feed, protection ${enabled ? 'on' : 'off'}`, async ({
    extension: { context, background },
  }) => {
    test.setTimeout(120_000);
    await background.evaluate(
      (value) =>
        (globalThis as any).chrome.storage.local.set({ settings: value }),
      { enabled },
    );
    const tab = await openFixture(
      context,
      'https://www.instagram.example/',
      page(12),
    );
    await tab.setViewportSize({ width: 1280, height: 900 });
    const cdp = await context.newCDPSession(tab);
    await cdp.send('Performance.enable');
    const metric = async () =>
      Object.fromEntries(
        (
          (await cdp.send('Performance.getMetrics')) as {
            metrics: { name: string; value: number }[];
          }
        ).metrics.map((m) => [m.name, m.value]),
      );
    await tab.waitForTimeout(2000);
    if (process.env.VG_PROFILE) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
    }
    const before = await metric();
    // 15 s of scrolling through a feed that keeps changing.
    for (let i = 0; i < 30; i++) {
      await tab.mouse.wheel(0, 400);
      await tab.waitForTimeout(500);
    }
    const after = await metric();
    if (process.env.VG_PROFILE) {
      const { profile } = (await cdp.send('Profiler.stop')) as {
        profile: {
          nodes: {
            id: number;
            callFrame: {
              functionName: string;
              url: string;
              lineNumber: number;
            };
          }[];
          samples: number[];
          timeDeltas: number[];
        };
      };
      const self = new Map<number, number>();
      profile.samples.forEach((id, i) =>
        self.set(id, (self.get(id) ?? 0) + profile.timeDeltas[i]!),
      );
      const byName = new Map<string, number>();
      for (const node of profile.nodes) {
        const key = `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber}`;
        byName.set(key, (byName.get(key) ?? 0) + (self.get(node.id) ?? 0));
      }
      // Inclusive time per content-script function.
      const children = new Map<number, number[]>();
      for (const node of profile.nodes as any[])
        children.set(node.id, node.children ?? []);
      const total = (id: number): number =>
        (self.get(id) ?? 0) +
        (children.get(id) ?? []).reduce((a, c) => a + total(c), 0);
      const inclusive = new Map<string, number>();
      for (const node of profile.nodes) {
        if (!node.callFrame.url.includes('content')) continue;
        const key = `${node.callFrame.functionName || '(anon)'}:${node.callFrame.lineNumber}`;
        inclusive.set(key, (inclusive.get(key) ?? 0) + total(node.id));
      }
      console.log(
        [...inclusive]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([k, v]) => `incl ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`)
          .join('\n'),
      );
      console.log(
        [...byName]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25)
          .map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`)
          .join('\n'),
      );
    }
    const script = after.ScriptDuration! - before.ScriptDuration!;
    const task = after.TaskDuration! - before.TaskDuration!;
    const line = `protection ${enabled ? 'on ' : 'off'}: script ${(script * 1000).toFixed(0)} ms, all main-thread tasks ${(task * 1000).toFixed(0)} ms over 15 s`;
    console.log(line);
    writeFileSync(`test-results/perf-${enabled ? 'on' : 'off'}.txt`, line);
    expect(script).toBeGreaterThan(0);
  });
}
