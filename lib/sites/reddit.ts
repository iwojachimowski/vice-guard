import { collapseWrappers, imagesIn, type SiteModule } from './types';

const post = 'shreddit-post';
const searchPost = [
  '[data-testid="search-post-unit"]',
  '[data-testid="search-sdui-post"]',
  '[data-testid="search-community"]',
  'search-telemetry-tracker:has(> [data-testid="search-post-unit"])',
];

function subreddit(name: string | null | undefined) {
  const match = /(?:^|\/)r\/([\w]+)/i.exec(name ?? '');
  return match
    ? { key: `reddit:r/${match[1]!.toLowerCase()}`, name: `r/${match[1]}` }
    : undefined;
}

export const reddit: SiteModule = {
  id: 'reddit',
  tier: 1,
  matches: (host) => /(^|\.)reddit\.com$/.test(host),
  cards: [
    // New reddit and sh.reddit.com.
    post,
    'shreddit-comment',
    'shreddit-ad-post',
    'faceplate-tracker[noun="trending_search"]',
    'reddit-recent-pages li',
    'li[role="presentation"]:has(> faceplate-tracker[noun*="typeahead"])',
    ...searchPost,
    // Old reddit.
    '.thing.link',
    '.thing.comment',
    '.search-result',
    '.trending-subreddits li',
  ].join(','),
  extraText(card) {
    return [
      'post-title',
      'subreddit-prefixed-name',
      'subreddit-name',
      'content-href',
      'data-subreddit',
      'data-url',
    ]
      .map((name) => card.getAttribute(name))
      .filter(Boolean)
      .join(' ');
  },
  images: (card) =>
    imagesIn(
      card,
      [
        'img[src*="redd.it"]',
        'img[src*="redditmedia.com"]',
        'img[src*="redditstatic.com/gallery"]',
        'a.thumbnail img',
        'shreddit-player[poster]',
        'video[poster]',
        'gallery-carousel img',
      ].join(','),
    ),
  source(card) {
    if (card.matches('shreddit-comment, .thing.comment')) return undefined;
    return subreddit(
      card.getAttribute('subreddit-prefixed-name') ??
        card.getAttribute('data-subreddit-prefixed') ??
        (card.getAttribute('data-subreddit')
          ? `r/${card.getAttribute('data-subreddit')}`
          : null) ??
        card.querySelector('a[href^="/r/"], a.subreddit')?.getAttribute('href'),
    );
  },
  hideTarget(card) {
    // New reddit wraps each feed post in <article>, followed by an <hr>.
    if (card.matches(post)) {
      const article = card.closest('article');
      if (article && article.querySelectorAll(post).length === 1)
        return article;
    }
    return collapseWrappers(card);
  },
  expectsCards: (location) =>
    !/^\/(settings|login|register|message|prefs|submit)/.test(
      location.pathname,
    ),
  css: `
    [data-vg-hit] + hr { display: none !important; }
  `,
};
