import { collapseWrappers, type SiteModule, type Source } from './types';

const upNext = '.ytp-autonav-endscreen-upnext-container';
const activeShort = 'ytd-reel-video-renderer';

const videoCards = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-reel-item-renderer',
  'ytd-playlist-renderer',
  'ytd-compact-playlist-renderer',
  'ytd-radio-renderer',
  'ytd-compact-radio-renderer',
  'ytd-movie-renderer',
  'ytd-channel-renderer',
  'ytd-universal-watch-card-renderer',
  'ytd-search-refinement-card-renderer',
  'yt-lockup-view-model',
  'ytm-shorts-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
];
const otherCards = [
  'ytd-comment-thread-renderer',
  'ytd-comment-view-model',
  'ytd-backstage-post-thread-renderer',
  'ytd-post-renderer',
  'ytd-notification-renderer',
  'ytd-rich-section-renderer',
  'ytd-shelf-renderer',
  'ytd-reel-shelf-renderer',
  'grid-shelf-view-model',
  activeShort,
  // Player end screen, end cards and autoplay countdown.
  '.ytp-videowall-still',
  '.ytp-ce-element',
  '.ytp-modern-videowall-still',
  upNext,
  // Search box suggestions.
  '.ytSearchboxComponentSuggestionsContainer [role="option"]',
  '.sbsb_c',
];

/** Grid and list cells that wrap a single video lockup. */
const cells = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-reel-item-renderer',
].join(',');

function videoId(card: HTMLElement): string | undefined {
  for (const link of card.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/watch?"], a[href*="/shorts/"]',
  )) {
    const match = /[?&]v=([\w-]{11})|\/shorts\/([\w-]{11})/.exec(
      link.getAttribute('href') ?? '',
    );
    if (match) return match[1] ?? match[2];
  }
  const id = /\/vi(?:_webp)?\/([\w-]{11})\//.exec(
    card.querySelector('img')?.getAttribute('src') ?? '',
  );
  return id?.[1];
}

function skipAutoplay(doc: Document) {
  doc
    .querySelector<HTMLElement>('.ytp-autonav-endscreen-upnext-cancel-button')
    ?.click();
}

function pageChannel(location: Location): Source | undefined {
  const match = /^\/(@[\w.-]+|channel\/[\w-]+|c\/[\w-]+)/.exec(
    location.pathname,
  );
  if (!match) return undefined;
  return { key: `youtube:${match[1]!.toLowerCase()}`, name: match[1]! };
}

export const youtube: SiteModule = {
  id: 'youtube',
  tier: 1,
  matches: (host) => /(^|\.)youtube\.com$/.test(host),
  cards: [...videoCards, ...otherCards].join(','),
  extraText(card) {
    // The autoplay countdown and end cards keep titles in attributes.
    return [
      card.getAttribute('aria-label'),
      card
        .querySelector('[data-tooltip-text]')
        ?.getAttribute('data-tooltip-text'),
    ]
      .filter(Boolean)
      .join(' ');
  },
  images(card) {
    if (card.matches('ytd-comment-thread-renderer, ytd-comment-view-model'))
      return [];
    // Derived from the video ID, so it works before YouTube lazy-loads the image.
    const id = videoId(card);
    if (id) return [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`];
    const style = card.querySelector<HTMLElement>('[style*="background-image"]')
      ?.style.backgroundImage;
    const url = /url\("?([^")]+)/.exec(style ?? '')?.[1];
    return url ? [new URL(url, location.href).href] : [];
  },
  source(card) {
    const link = card.querySelector<HTMLAnchorElement>(
      'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"]',
    );
    const href = link?.getAttribute('href');
    const handle =
      href && /^\/(@[\w.-]+|channel\/[\w-]+|c\/[\w-]+)/.exec(href)?.[1];
    if (handle)
      return {
        key: `youtube:${handle.toLowerCase()}`,
        name: link?.textContent?.trim() || handle,
      };
    const label = card
      .querySelector('[aria-label^="Go to channel "]')
      ?.getAttribute('aria-label')
      ?.slice('Go to channel '.length);
    if (label)
      return { key: `youtube:name:${label.toLowerCase()}`, name: label };
    if (card.matches('ytd-comment-thread-renderer, ytd-comment-view-model'))
      return undefined;
    return pageChannel(location);
  },
  expectsCards: (location) =>
    /^\/($|results|watch|feed\/|shorts\/|@|channel\/|c\/)/.test(
      location.pathname,
    ),
  css: `
    ytd-rich-grid-renderer > #contents {
      display: grid !important;
      grid-auto-flow: row dense !important;
      grid-template-columns: repeat(var(--ytd-rich-grid-items-per-row, 3), minmax(0, 1fr)) !important;
      column-gap: 16px !important;
      row-gap: 32px !important;
    }
    ytd-rich-grid-renderer > #contents > ytd-rich-grid-row,
    ytd-rich-grid-renderer > #contents > ytd-rich-grid-row > #contents {
      display: contents !important;
    }
    ytd-rich-grid-renderer > #contents > ytd-rich-item-renderer,
    ytd-rich-grid-renderer > #contents > ytd-rich-grid-row > #contents > ytd-rich-item-renderer {
      width: auto !important;
      min-width: 0 !important;
      margin: 0 !important;
    }
    ytd-rich-grid-renderer > #contents > :not(ytd-rich-item-renderer):not(ytd-rich-grid-row) {
      grid-column: 1 / -1;
    }
    /* A hidden Shorts player keeps its slot so the scroller does not jump. */
    ${activeShort}[data-vg-hit] { display: block !important; visibility: hidden !important; }
  `,
  hideTarget(card) {
    if (card.matches(activeShort)) return card;
    // Remove the whole grid or list cell. Walking up sole-child wrappers is
    // not enough: live cells hold extra children (menus, overlays), and
    // stopping inside the cell leaves an empty slot in the grid.
    const cell = card.closest<HTMLElement>(cells);
    if (cell) return cell;
    return collapseWrappers(
      card,
      'body, #contents, #items, ytd-item-section-renderer',
    );
  },
  onHide(card) {
    const doc = card.ownerDocument;
    if (card.matches(upNext)) skipAutoplay(doc);
    if (!card.matches(activeShort)) return;
    for (const video of card.querySelectorAll('video')) video.pause();
    if (card.hasAttribute('is-active'))
      doc
        .querySelector<HTMLElement>(
          '#navigation-button-down button, #navigation-button-down [role="button"]',
        )
        ?.click();
  },
  start(doc, isHidden) {
    const onPlay = (event: Event) => {
      const short =
        event.target instanceof HTMLVideoElement &&
        event.target.closest<HTMLElement>(activeShort);
      if (short && isHidden(short)) (event.target as HTMLVideoElement).pause();
    };
    const onEnded = () => {
      const next = doc.querySelector<HTMLElement>(upNext);
      if (next && isHidden(next)) skipAutoplay(doc);
    };
    doc.addEventListener('play', onPlay, true);
    doc.addEventListener('ended', onEnded, true);
    return () => {
      doc.removeEventListener('play', onPlay, true);
      doc.removeEventListener('ended', onEnded, true);
    };
  },
};
