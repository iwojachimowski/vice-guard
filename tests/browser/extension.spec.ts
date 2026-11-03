import { readFileSync } from 'node:fs';
import { expect, openPage, test } from './fixtures';

test('channel settings persist across browser restart and update video cards immediately', async ({
  extension,
}) => {
  let { context, popup } = extension;
  await popup.getByRole('radio', { name: /Light/ }).check();
  await popup.getByText('Manage channels', { exact: true }).click();
  await popup
    .getByLabel('Add a YouTube channel', { exact: true })
    .fill('Not a channel ID');
  await popup.getByRole('button', { name: 'Add channel', exact: true }).click();
  await expect(popup.getByRole('alert')).toContainText(
    'Display names are not supported',
  );
  await popup
    .getByLabel('Add a YouTube channel', { exact: true })
    .fill('@customuploader');
  await popup.getByRole('button', { name: 'Add channel', exact: true }).click();
  await expect(popup.getByRole('status')).toHaveText('Saved.');
  ({ context, popup } = await extension.restart());
  await popup.getByText('Manage channels', { exact: true }).click();
  await popup
    .getByLabel('Search channels', { exact: true })
    .fill('@customuploader');
  await expect(
    popup.getByRole('checkbox', { name: /@customuploader/ }),
  ).toBeChecked();
  const page = await openPage(
    context,
    `
    <ytd-video-renderer id="custom"><h3>GTA 6 first look</h3><img alt="Thumbnail"><ytd-channel-name><a href="/@customuploader">Custom uploader</a></ytd-channel-name></ytd-video-renderer>
    <ytd-grid-video-renderer id="priority"><h3>Other game review</h3><ytd-channel-name><a href="/@Shirrako">Shirrako</a></ytd-channel-name></ytd-grid-video-renderer>
    <ytd-compact-video-renderer id="secondary"><h3>GTA 5 review</h3><ytd-channel-name><a href="/@DarkViperAU">DarkViperAU</a></ytd-channel-name></ytd-compact-video-renderer>`,
  );
  await expect(page.locator('#custom')).toBeHidden();
  await expect(page.locator('#priority')).toBeVisible();
  await expect(page.locator('#secondary')).toBeVisible();
  await popup.getByRole('checkbox', { name: /@customuploader/ }).uncheck();
  await expect(page.locator('#custom')).toBeVisible();
  await popup.getByRole('checkbox', { name: /@customuploader/ }).check();
  await expect(page.locator('#custom')).toBeHidden();
  await popup
    .getByLabel('Channel protection', { exact: true })
    .selectOption('strict');
  await expect(page.locator('#priority')).toBeHidden();
  await expect(page.locator('#secondary')).toBeVisible();
  await popup
    .getByRole('checkbox', { name: 'Enable channel protection', exact: true })
    .uncheck();
  await expect(page.locator('#priority')).toBeVisible();
  await expect(page.locator('#custom')).toBeVisible();
  await popup
    .getByRole('button', { name: 'Remove @customuploader', exact: true })
    .click();
  await expect(
    popup.getByText('No matching channels.', { exact: true }),
  ).toBeVisible();
  await expect(popup.getByRole('status')).toHaveText('Saved.');
  await popup.reload();
  await popup.getByText('Manage channels', { exact: true }).click();
  await popup
    .getByLabel('Search channels', { exact: true })
    .fill('@customuploader');
  await expect(
    popup.getByText('No matching channels.', { exact: true }),
  ).toBeVisible();
});

test('preferences persist and update open pages; reveal locks prevent accidental clicks', async ({
  extension: { context, popup },
}) => {
  const page = await openPage(
    context,
    '<article id="spoiler"><img alt="thumbnail"><h2>GTA VI Jason story</h2></article><article id="safe"><h2>Lucia cooking</h2></article>',
  );
  const enabled = popup.getByRole('checkbox', {
    name: 'Enable spoiler protection',
  });
  const reveal = popup.getByRole('checkbox', { name: 'Allow click-to-reveal' });
  await expect(popup.getByRole('radio', { name: /Strict/ })).toBeChecked();
  await popup.getByRole('radio', { name: /Balanced/ }).check();
  await expect(page.locator('#spoiler')).toBeHidden();
  await expect(page.locator('#safe')).toBeVisible();
  await page.locator('[data-vice-guard-ui]').click();
  await expect(page.locator('#spoiler')).toBeVisible();
  await page.locator('#spoiler h2').evaluate((element) => {
    element.textContent = 'GTA 6 ending explained';
  });
  await expect(page.locator('#spoiler')).toBeHidden();
  await enabled.uncheck();
  await expect(page.locator('#spoiler')).toBeVisible();
  await enabled.check();
  await expect(page.locator('#spoiler')).toBeHidden();
  await reveal.uncheck();
  await page.locator('[data-vice-guard-ui]').click();
  await expect(page.locator('#spoiler')).toBeHidden();
  await popup.getByLabel('Your keywords').fill('cooking');
  await popup.getByRole('button', { name: 'Save keywords' }).click();
  await expect(popup.getByRole('status')).toHaveText('Saved.');
  await popup.reload();
  await expect(reveal).not.toBeChecked();
  await expect(popup.getByRole('radio', { name: /Balanced/ })).toBeChecked();
  await expect(popup.getByLabel('Your keywords')).toHaveValue('cooking');
  await reveal.check();
  await page.locator('[data-vice-guard-ui]').click();
  await expect(page.locator('#spoiler')).toBeVisible();
});

test('experimental mode allows harmless titles while strict mode hides every GTA 6 mention', async ({
  extension: { context, popup },
}) => {
  const page = await openPage(
    context,
    '<article id="safe">GTA 6 trailer discussion</article><article id="spoiler">GTA 6 ending</article>',
  );
  await popup.getByRole('radio', { name: /Strict/ }).check();
  await expect(page.locator('#safe')).toBeHidden();
  await popup.getByRole('checkbox', { name: /Spoiler-free browsing/ }).check();
  await expect(page.locator('#safe')).toBeVisible();
  await expect(page.locator('#spoiler')).toBeHidden();
  await popup.getByLabel('Your keywords').fill('trailer');
  await popup.getByRole('button', { name: 'Save keywords' }).click();
  await expect(page.locator('#safe')).toBeHidden();
});

test('YouTube fills gaps across shelves even with protection off', async ({
  extension: { context, popup },
}) => {
  const page = await openPage(
    context,
    readFileSync('tests/browser/youtube.html', 'utf8').replace(
      '<!doctype html>',
      '',
    ),
  );
  const grid = page.locator('ytd-rich-grid-renderer');
  const enabled = popup.getByRole('checkbox', {
    name: 'Enable spoiler protection',
  });
  await expect(page.locator('#video-1')).toBeHidden();
  await expect
    .poll(
      async () =>
        (await page.locator('#video-0').boundingBox())?.y ===
        (await page.locator('#video-3').boundingBox())?.y,
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await page.locator('#video-4').boundingBox())?.y ===
        (await page.locator('#video-6').boundingBox())?.y,
    )
    .toBe(true);
  await popup
    .getByRole('checkbox', { name: 'Allow click-to-reveal' })
    .uncheck();
  await page.locator('body > [data-vice-guard-ui]').click();
  await expect(page.locator('#video-1')).toBeHidden();
  await popup.getByRole('checkbox', { name: 'Allow click-to-reveal' }).check();
  const review = page.locator('body > [data-vice-guard-ui]');
  await review.click();
  await review.locator('[data-vice-guard-ui]').click();
  await expect(page.locator('#video-1')).toBeVisible();
  await page.locator('#video-5').evaluate((element) => {
    element.style.display = 'none';
  });
  await enabled.uncheck();
  await expect(page.locator('[data-vice-guard-ui]')).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await page.locator('#video-4').boundingBox())?.y ===
        (await page.locator('#video-6').boundingBox())?.y,
    )
    .toBe(true);
  await page.reload();
  await expect(grid).toHaveAttribute('data-vice-guard-grid', '');
  await expect(page.locator('#video-1')).toBeVisible();
});

test('YouTube search hides complete cards and the video sidebar', async ({
  extension: { context, popup },
}) => {
  await popup.getByRole('radio', { name: /Strict/ }).check();
  const page = await openPage(
    context,
    `<style>ytd-video-renderer,ytd-universal-watch-card-renderer{display:block}</style>
    <ytd-video-renderer id="preview"><img alt="thumbnail"><h3><a>Grand Theft Auto VI: An Extended Look</a></h3><p>Gameplay preview</p></ytd-video-renderer>
    <ytd-video-renderer id="late"><img alt="thumbnail"><h3><a>Loading</a></h3><p>Map details</p></ytd-video-renderer>
    <ytd-universal-watch-card-renderer id="sidebar"><h2>Grand Theft Auto VI</h2><img alt="trailer"><a>Launch trailer</a></ytd-universal-watch-card-renderer>
    <ytd-video-renderer id="unrelated"><img alt="thumbnail"><h3>Lucia cooking</h3></ytd-video-renderer>`,
  );
  await expect(page.locator('#preview')).toBeHidden();
  await page.locator('#late h3 a').evaluate((element) => {
    element.innerHTML = '<span>GTA 6 - Analiza i Ciekawostki 4</span>';
  });
  for (const id of ['preview', 'late', 'sidebar']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
    await expect(page.locator(`#${id} img`)).toBeHidden();
  }
  await expect(page.locator('#late h3')).not.toHaveAttribute(
    'data-vice-guard-hidden',
  );
  await expect(page.locator('#unrelated')).toBeVisible();
  await popup
    .getByRole('checkbox', { name: 'Enable spoiler protection' })
    .uncheck();
  for (const id of ['preview', 'late', 'sidebar'])
    await expect(page.locator(`#${id} img`)).toBeVisible();
});

test('Shorts conceal the player, stop playback, and support reveal locking', async ({
  extension: { context, popup },
}) => {
  const page = await openPage(
    context,
    `<style>ytd-reel-video-renderer{display:block;position:relative;height:500px;width:320px;background:#444;margin:20px}video{width:100%;height:350px}</style>
    <ytd-reel-video-renderer id="short"><video muted></video><h2><span>Loading</span></h2><p>Description</p></ytd-reel-video-renderer>
    <ytd-reel-video-renderer id="next-short"><h2>Lucia cooking</h2></ytd-reel-video-renderer>`,
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('head style')].some((style) =>
          style.textContent?.includes('data-vice-guard-short'),
        ),
      ),
    )
    .toBe(true);
  await page.locator('video').evaluate(async (video: HTMLVideoElement) => {
    const canvas = document.createElement('canvas');
    canvas.getContext('2d')!.fillRect(0, 0, 100, 100);
    video.srcObject = canvas.captureStream(1);
    await video.play();
  });
  await page.locator('#short h2 span').evaluate((element) => {
    element.textContent = 'GTA 6 leaked story';
  });
  await expect(page.locator('#short video')).toBeHidden();
  await expect(page.locator('#short p')).toBeHidden();
  await expect(page.locator('#next-short h2')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('video').evaluate((video: HTMLVideoElement) => video.paused),
    )
    .toBe(true);
  await page.locator('video').evaluate(async (video: HTMLVideoElement) => {
    await video.play().catch(() => {});
  });
  await expect
    .poll(() =>
      page.locator('video').evaluate((video: HTMLVideoElement) => video.paused),
    )
    .toBe(true);
  await popup
    .getByRole('checkbox', { name: 'Allow click-to-reveal' })
    .uncheck();
  await page.locator('#short > [data-vice-guard-ui]').click();
  await expect(page.locator('#short video')).toBeHidden();
  await popup.getByRole('checkbox', { name: 'Allow click-to-reveal' }).check();
  await page.locator('#short > [data-vice-guard-ui]').click();
  await expect(page.locator('#short video')).toBeVisible();
  await page.locator('#short h2 span').evaluate((element) => {
    element.textContent = 'GTA 6 ending';
  });
  await expect(page.locator('#short video')).toBeHidden();
  await popup
    .getByRole('checkbox', { name: 'Enable spoiler protection' })
    .uncheck();
  await expect(page.locator('#short video')).toBeVisible();
});

test('X sidebar news and trends are hidden individually in Light mode', async ({
  extension: { context, popup },
}) => {
  await popup.getByRole('radio', { name: /Light/ }).check();
  await popup.getByRole('checkbox', { name: /Spoiler-free browsing/ }).check();
  const page = await openPage(
    context,
    `<aside data-testid="sidebarColumn"><h2>Today's News</h2>
    <div id="gta-news" data-testid="news_sidebar_article_1" role="link"><span>GTA VI Ads Light Up El Clásico Billboards at Camp Nou</span><img alt="avatars"><small>164 posts</small></div>
    <div id="other-news" data-testid="news_sidebar_article_2" role="link">Dispatch Developers Cut Blonde Blazer's Full Story Arc</div>
    <h2>What's happening</h2><div id="gta-trend" data-testid="trend">GTA6</div><div id="other-trend" data-testid="trend">Andziaks</div></aside>`,
  );
  await expect(page.locator('#gta-news')).toBeHidden();
  await expect(page.locator('#gta-news img')).toBeHidden();
  await expect(page.locator('#gta-trend')).toBeHidden();
  await expect(page.locator('#other-news')).toBeVisible();
  await expect(page.locator('#other-trend')).toBeVisible();
  await page.locator('[data-vice-guard-ui]').first().click();
  await expect(page.locator('#gta-news')).toBeVisible();
  await expect(page.locator('#gta-trend')).toBeHidden();
  await popup
    .getByRole('checkbox', { name: 'Enable spoiler protection' })
    .uncheck();
  await expect(page.locator('#gta-trend')).toBeVisible();
});

test('Google image cards use source and panel context and respect reveal locking', async ({
  extension: { context, popup },
}) => {
  await popup
    .getByRole('checkbox', { name: 'Allow click-to-reveal' })
    .uncheck();
  const page = await openPage(
    context,
    `<div id="iur"><div data-viewer-group="1" data-q="gta 6 color">
    <div class="vCUuC" id="palette"><div data-preview-id=""><img alt="Color palette"><span>GTA Color Palette</span></div></div>
    <div class="vCUuC" id="cover"><div data-preview-id=""><img alt="GTA VI cover"><span>Cover colors</span></div></div></div>
    <div class="vCUuC" id="source"><div data-preview-id=""><img alt="Photos"><a href="https://www.reddit.com/r/GTA6/">Photos</a></div></div>
    <div class="vCUuC" id="landscape"><div data-preview-id=""><img alt="Mountain landscape"><span>Mountains</span></div></div></div>`,
  );
  for (const id of ['palette', 'cover', 'source'])
    await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#landscape')).toBeVisible();
  await page.locator('[data-vice-guard-ui]').first().click();
  await expect(page.locator('#palette')).toBeHidden();
  await page.locator('#landscape img').evaluate((element) => {
    element.setAttribute('alt', 'GTA 6 leaked scene');
  });
  await expect(page.locator('#landscape')).toBeHidden();
  await popup.getByRole('checkbox', { name: 'Allow click-to-reveal' }).check();
  await page.locator('[data-vice-guard-ui]').first().click();
  await expect(page.locator('#palette')).toBeVisible();
  await expect(page.locator('#cover')).toBeHidden();
  await popup
    .getByRole('checkbox', { name: 'Enable spoiler protection' })
    .uncheck();
  await expect(page.locator('#cover')).toBeVisible();
});

test('popup fits the browser window in light and dark themes', async ({
  extension: { popup },
}) => {
  for (const theme of ['light', 'dark'] as const) {
    await popup.emulateMedia({ colorScheme: theme });
    expect(
      await popup.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await popup.screenshot({
      path: `test-results/settings-${theme}.png`,
      fullPage: true,
    });
    await popup.getByText('Manage channels', { exact: true }).click();
    expect(
      await popup.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await popup.screenshot({
      path: `test-results/channels-${theme}.png`,
      fullPage: true,
    });
    await popup.getByText('Manage channels', { exact: true }).click();
  }
});
