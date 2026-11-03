import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startScanner } from '../lib/scanner';
import { defaults } from '../lib/settings';
import { builtInChannels } from '../lib/youtube-channel-filter';
import { channelKey } from '../lib/channel-identity';

let scanner: ReturnType<typeof startScanner> | undefined;
async function scan() {
  await vi.advanceTimersByTimeAsync(100);
}
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => {
  scanner?.stop();
  scanner = undefined;
  vi.useRealTimers();
});

describe('feed scanning', () => {
  it.each([
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-video-renderer',
    'yt-lockup-view-model',
  ])(
    'applies channel protection to the complete %s and restores it when disabled',
    async (tag) => {
      document.body.innerHTML = `<${tag} id="video"><img alt="Thumbnail"><h3>GTA 6 first look</h3><ytd-channel-name><a href="/@Shirrako">Shirrako</a></ytd-channel-name></${tag}>`;
      const settings = { ...defaults, mode: 'light' as const };
      scanner = startScanner(settings);
      await scan();
      expect(
        document
          .getElementById('video')!
          .hasAttribute('data-vice-guard-hidden'),
      ).toBe(true);
      scanner.update({
        ...settings,
        disabledChannels: [channelKey(builtInChannels[0]!)],
      });
      expect(document.querySelector('[data-vice-guard-hidden]')).toBeNull();
    },
  );
  it('rescans a recycled card when its uploader changes after reveal or SPA navigation', async () => {
    document.body.innerHTML =
      '<ytd-video-renderer><h3>Unrelated title</h3><ytd-channel-name><a href="/@SomeoneElse">Uploader</a></ytd-channel-name></ytd-video-renderer>';
    scanner = startScanner({
      ...defaults,
      mode: 'light',
      channelMode: 'strict',
    });
    const card = document.querySelector('ytd-video-renderer')!;
    expect(card.hasAttribute('data-vice-guard-hidden')).toBe(false);
    card.querySelector('a')!.setAttribute('href', '/@Shirrako');
    await scan();
    expect(card.hasAttribute('data-vice-guard-hidden')).toBe(true);
    card.querySelector('a')!.setAttribute('href', '/@SomeoneElse');
    await scan();
    expect(card.hasAttribute('data-vice-guard-hidden')).toBe(false);
    document.body.innerHTML =
      '<ytd-compact-video-renderer><h3>GTA VI video</h3><ytd-channel-name><a href="/@Shirrako">Uploader</a></ytd-channel-name></ytd-compact-video-renderer>';
    await scan();
    expect(
      document
        .querySelector('ytd-compact-video-renderer')!
        .hasAttribute('data-vice-guard-hidden'),
    ).toBe(true);
  });
  it('restores grouped YouTube controls if a page rerender removes their panel', async () => {
    document.body.innerHTML =
      '<ytd-rich-grid-renderer><div id="contents"><ytd-rich-item-renderer>GTA 6 ending</ytd-rich-item-renderer></div></ytd-rich-grid-renderer>';
    scanner = startScanner(defaults);
    await scan();
    const panel = document.querySelector<HTMLElement>(
      'body > [data-vice-guard-ui]',
    )!;
    panel.remove();
    await scan();
    expect(panel.isConnected).toBe(true);
    expect(
      document
        .querySelector('ytd-rich-item-renderer')
        ?.hasAttribute('data-vice-guard-hidden'),
    ).toBe(true);
  });
  it('hides complete Google image tiles using captions, panel context and source links', async () => {
    document.body.innerHTML = `<div id="iur"><div data-viewer-group="1" data-q="gta 6 color">
      <div class="vCUuC" id="context-image"><div data-preview-id=""><img alt="Color palette"><a>GTA Color Palette</a></div></div></div>
      <div class="vCUuC" id="caption-image"><div data-preview-id=""><img alt="GTA VI cover"><span>Cover</span></div></div>
      <div class="vCUuC" id="source-image"><div data-preview-id=""><img alt="Corrected photos"><a href="https://www.reddit.com/r/GTA6/comments/example">Photos</a></div></div>
      <div class="vCUuC" id="unrelated-image"><div data-preview-id=""><img alt="Mountain landscape"><span>Mountains</span></div></div></div>`;
    scanner = startScanner({ ...defaults, mode: 'light', allowReveal: false });
    await scan();
    for (const id of ['context-image', 'caption-image', 'source-image'])
      expect(
        document.getElementById(id)?.hasAttribute('data-vice-guard-hidden'),
      ).toBe(true);
    expect(
      document.querySelector('#iur')?.hasAttribute('data-vice-guard-hidden'),
    ).toBe(false);
    expect(
      document
        .querySelector('#unrelated-image')
        ?.hasAttribute('data-vice-guard-hidden'),
    ).toBe(false);
    document
      .querySelector('#unrelated-image img')!
      .setAttribute('alt', 'GTA 6 leaked scene');
    await scan();
    expect(
      document
        .querySelector('#unrelated-image')
        ?.hasAttribute('data-vice-guard-hidden'),
    ).toBe(true);
    scanner.update({ ...defaults, enabled: false });
    expect(document.querySelector('[data-vice-guard-hidden]')).toBeNull();
  });
  it('hides GTA 6 sidebar news and trends independently, including in Light mode', async () => {
    document.body.innerHTML = `<aside data-testid="sidebarColumn"><section id="news"><h2>Today's News</h2>
      <div id="gta-news" role="link" data-testid="news_sidebar_article_123"><span>GTA VI Ads Light Up El Clásico Billboards at Camp Nou</span><img alt="avatars"><small>164 posts</small></div>
      <div id="other-news" role="link" data-testid="news_sidebar_article_456">Dispatch Developers Cut Blonde Blazer's Full Story Arc</div>
      <div id="countdown" role="link" data-testid="news_sidebar_article_789">GTA VI Countdown Hits 24 Days to Launch</div></section>
      <section id="trends"><h2>What's happening</h2><div id="gta-trend" data-testid="trend">GTA6</div><div id="other-trend" data-testid="trend">Andziaks</div></section></aside>`;
    scanner = startScanner({ ...defaults, mode: 'light', spoilerFree: true });
    await scan();
    for (const id of ['gta-news', 'countdown', 'gta-trend'])
      expect(
        document.getElementById(id)?.hasAttribute('data-vice-guard-hidden'),
      ).toBe(true);
    for (const id of ['news', 'trends', 'other-news', 'other-trend'])
      expect(
        document.getElementById(id)?.hasAttribute('data-vice-guard-hidden'),
      ).toBe(false);
    document.querySelector('#other-trend')!.innerHTML =
      '<span>GTA VI new topic</span>';
    await scan();
    expect(
      document
        .querySelector('#other-trend')
        ?.hasAttribute('data-vice-guard-hidden'),
    ).toBe(true);
    scanner.update({ ...defaults, enabled: false });
    await scan();
    expect(document.querySelector('[data-vice-guard-hidden]')).toBeNull();
  });
  it.each([
    [
      'ytd-video-renderer',
      '<div id="dismissible"><img alt="thumbnail"><div><h3><a>Loading</a></h3><p>Description</p></div></div>',
    ],
    [
      'ytd-rich-item-renderer',
      '<div id="content"><yt-lockup-view-model><div><h3><a>Loading</a></h3><img alt="thumbnail"></div></yt-lockup-view-model></div>',
    ],
  ])(
    'keeps delayed title updates scoped to the entire %s',
    async (tag, contents) => {
      document.body.innerHTML = `<${tag}>${contents}</${tag}>`;
      scanner = startScanner(defaults);
      await scan();
      document.querySelector('h3 a')!.innerHTML = '<span>GTA 6 ending</span>';
      await scan();
      expect(
        document.querySelector(tag)?.hasAttribute('data-vice-guard-hidden'),
      ).toBe(true);
      expect(
        document.querySelector('h3')?.hasAttribute('data-vice-guard-hidden'),
      ).toBe(false);
      expect(
        document
          .querySelector('yt-lockup-view-model')
          ?.hasAttribute('data-vice-guard-hidden') ?? false,
      ).toBe(false);
      expect(
        document.querySelectorAll('[data-vice-guard-hidden]'),
      ).toHaveLength(1);
    },
  );

  it('restores videos and removes reveal controls without removing YouTube gap filling when disabled', async () => {
    document.body.innerHTML =
      '<ytd-rich-grid-renderer><div id="contents"><ytd-rich-item-renderer>GTA 6 ending</ytd-rich-item-renderer><ytd-rich-item-renderer>GTA VI story leak</ytd-rich-item-renderer></div></ytd-rich-grid-renderer>';
    scanner = startScanner(defaults);
    await scan();
    expect(document.querySelectorAll('[data-vice-guard-hidden]')).toHaveLength(
      2,
    );
    expect(document.querySelector('[data-vice-guard-grid]')).not.toBeNull();
    expect(
      document.querySelectorAll('body > [data-vice-guard-ui]'),
    ).toHaveLength(1);
    scanner.update({ ...defaults, enabled: false });
    await scan();
    expect(document.querySelector('[data-vice-guard-hidden]')).toBeNull();
    expect(document.querySelector('[data-vice-guard-grid]')).not.toBeNull();
    expect(document.querySelector('[data-vice-guard-ui]')).toBeNull();
    scanner.stop();
    expect(document.querySelector('[data-vice-guard-grid]')).toBeNull();
  });

  it('keeps YouTube grids compact on a disabled start and after SPA replacement', async () => {
    document.body.innerHTML =
      '<ytd-rich-grid-renderer><div id="contents"><ytd-rich-item-renderer>GTA 6 ending</ytd-rich-item-renderer></div></ytd-rich-grid-renderer>';
    scanner = startScanner({ ...defaults, enabled: false });
    await scan();
    expect(document.querySelector('[data-vice-guard-grid]')).not.toBeNull();
    expect(document.querySelector('[data-vice-guard-hidden]')).toBeNull();
    document.body.innerHTML =
      '<ytd-rich-grid-renderer><div id="contents"><ytd-rich-item-renderer>GTA 6 ending</ytd-rich-item-renderer></div></ytd-rich-grid-renderer>';
    await scan();
    expect(document.querySelector('[data-vice-guard-grid]')).not.toBeNull();
    expect(document.querySelector('[data-vice-guard-hidden]')).toBeNull();
  });

  it.each([
    '<ytd-rich-item-renderer><h3>GTA 6 Jason story</h3><img></ytd-rich-item-renderer>',
    '<shreddit-post><h3>GTA VI Lucia</h3></shreddit-post>',
    '<article data-testid="tweet"><div>GTA 6 ending</div></article>',
    '<div id="rso"><div class="g"><h3>GTA 6 leaked story</h3></div></div>',
  ])('hides a complete supported site card: %s', async (markup) => {
    document.body.innerHTML = markup;
    scanner = startScanner(defaults);
    await scan();
    const hidden = document.querySelector('[data-vice-guard-hidden]');
    expect(hidden).not.toBeNull();
    expect(hidden?.matches('h3')).toBe(false);
    expect(document.querySelectorAll('[data-vice-guard-ui]')).toHaveLength(1);
  });

  it('hides a spoiler comment without hiding neighboring discussion', async () => {
    document.body.innerHTML =
      '<article><h2>Weekly discussion</h2><div class="comment">GTA 6 ending</div><div class="comment">Jason cooking</div></article>';
    scanner = startScanner(defaults);
    await scan();
    expect(
      document.querySelector('article')?.hasAttribute('data-vice-guard-hidden'),
    ).toBe(false);
    expect(
      document
        .querySelector('.comment')
        ?.hasAttribute('data-vice-guard-hidden'),
    ).toBe(true);
    expect(document.querySelectorAll('[data-vice-guard-ui]')).toHaveLength(1);
  });

  it('hides the whole card including its thumbnail, leaves unrelated cards, restores on disable', async () => {
    document.body.innerHTML =
      '<article><img alt="thumbnail"><h2>GTA 6 Lucia story</h2></article><article>Lucia cooking</article>';
    scanner = startScanner(defaults);
    await scan();
    const cards = document.querySelectorAll('article');
    expect(cards[0]?.hasAttribute('data-vice-guard-hidden')).toBe(true);
    expect(cards[1]?.hasAttribute('data-vice-guard-hidden')).toBe(false);
    expect(document.querySelectorAll('[data-vice-guard-ui]')).toHaveLength(1);
    scanner.update({ ...defaults, enabled: false });
    await scan();
    expect(document.querySelector('[data-vice-guard-hidden]')).toBeNull();
    expect(document.querySelector('[data-vice-guard-ui]')).toBeNull();
  });
  it('detects added cards and recycled titles without duplicate placeholders', async () => {
    scanner = startScanner(defaults);
    const card = document.createElement('article');
    card.innerHTML = '<h2>Unrelated story</h2>';
    document.body.append(card);
    await scan();
    card.querySelector('h2')!.firstChild!.textContent = 'GTA 6 ending';
    await scan();
    expect(card.hasAttribute('data-vice-guard-hidden')).toBe(true);
    await scan();
    expect(document.querySelectorAll('[data-vice-guard-ui]')).toHaveLength(1);
    card.querySelector('h2')!.textContent = 'Jason cooking';
    await scan();
    expect(card.hasAttribute('data-vice-guard-hidden')).toBe(false);
  });
  it('reads thumbnail metadata and cleans detached placeholders', async () => {
    document.body.innerHTML = '<article><img alt="GTA VI ending"></article>';
    scanner = startScanner(defaults);
    await scan();
    expect(document.querySelector('[data-vice-guard-hidden]')).not.toBeNull();
    document.querySelector('article')!.remove();
    await scan();
    expect(document.querySelector('[data-vice-guard-ui]')).toBeNull();
  });
  it('restores page content and removes its style on stop', async () => {
    document.body.innerHTML = '<article>GTA 6 Jason</article>';
    scanner = startScanner(defaults);
    await scan();
    scanner.stop();
    expect(document.querySelector('[data-vice-guard-hidden]')).toBeNull();
    expect(document.querySelector('[data-vice-guard-ui]')).toBeNull();
    expect(document.head.textContent).not.toContain('data-vice-guard-hidden');
  });
});
