import { expect, flashes, openFixture, test } from './fixtures';

// Posts that change after they were judged clean, as on Instagram or X:
// new comments, ticking timers, counters. Checks the shortcuts that keep
// such pages fast (counter changes ignored, full re-reads at most once a
// second) never let a spoiler through.
const post = (
  id: string,
  extra = '',
) => `<article id="${id}" data-expect="keep">
  <h2>Weekend trip</h2><span class="timer">0:00</span><span class="likes">10 likes</span>
  <ul class="comments"><li>Lovely photos</li>${extra}</ul></article>`;

test('changes inside a judged post', async ({ extension: { context } }) => {
  test.setTimeout(60_000);
  const page = await openFixture(
    context,
    'https://social.example.test/',
    `<body><main>${post('a')}${post('b')}${post('c', '<li>Jason was great</li>')}${post('d', '<li>playing GTA Online tonight</li>')}</main></body>`,
  );
  const hidden = (id: string) =>
    page.evaluate(
      (i) => !!document.getElementById(i)!.closest('[data-vg-hit]'),
      id,
    );
  await expect.poll(() => page.locator('[data-vg-ok]').count()).toBe(4);

  // Counters tick in every post for a while: nothing is hidden.
  for (let tick = 1; tick <= 8; tick++) {
    await page.evaluate((t) => {
      for (const el of document.querySelectorAll('.timer'))
        el.textContent = `0:0${t}`;
      for (const el of document.querySelectorAll('.likes'))
        el.textContent = `${10 + t} likes`;
    }, tick);
    await page.waitForTimeout(100);
  }
  for (const id of ['a', 'b', 'c', 'd']) expect(await hidden(id)).toBe(false);

  // 1. A spoiler comment on its own, right after another change: hidden
  // before it is ever painted.
  await page.evaluate(() =>
    document
      .querySelector('#a .comments')!
      .insertAdjacentHTML('beforeend', '<li>so nice</li>'),
  );
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    const a = document.getElementById('a')!;
    a.dataset.expect = 'hide';
    a.querySelector('.comments')!.insertAdjacentHTML(
      'beforeend',
      '<li>GTA 6 ending explained</li>',
    );
  });
  expect(await hidden('a')).toBe(true);

  // 2. A match that needs old and new text together ("Jason" was already
  // there, "Lucia" arrives): hidden within the re-read window.
  await page.evaluate(() =>
    document
      .querySelector('#c .comments')!
      .insertAdjacentHTML('beforeend', '<li>so nice</li>'),
  );
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    const c = document.getElementById('c')!;
    c.dataset.expect = 'hide';
    c.querySelector('.comments')!.insertAdjacentHTML(
      'beforeend',
      '<li>and Lucia too</li>',
    );
  });
  await expect.poll(() => hidden('c'), { timeout: 2000 }).toBe(true);

  // 3. A counter in a post that already mentions another GTA: still kept.
  await page.evaluate(
    () => (document.querySelector('#d .likes')!.textContent = '6 likes'),
  );
  await page.waitForTimeout(1500);
  expect(await hidden('d')).toBe(false);

  // Only the cross-text post (c, the one with "Jason") may have been on
  // screen, and for at most about the re-read window (60 frames a second).
  const frames = await flashes(page);
  expect(frames.filter((text) => !text.includes('Jason'))).toEqual([]);
  expect(frames.length).toBeLessThanOrEqual(75);
});
