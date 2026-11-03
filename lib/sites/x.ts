import { collapseWrappers, imagesIn, type SiteModule } from './types';

export const x: SiteModule = {
  id: 'x',
  tier: 1,
  matches: (host) => /(^|\.)(x|twitter)\.com$/.test(host),
  cards: [
    // Timeline, replies and search results; quote tweets and link cards are inside.
    'article[data-testid="tweet"]',
    'article[data-testid="notification"]',
    '[data-testid="trend"]',
    '[data-testid^="news_sidebar_article"]',
    '[data-testid="UserCell"]',
    '[data-testid="typeaheadResult"]',
    '[data-testid="typeaheadRecentSearchesItem"]',
    '[data-testid="eventHero"]',
    '[data-testid="cellInnerDiv"] [role="link"]:has(> div > div > div > [data-testid="trend"])',
  ].join(','),
  images: (card) =>
    imagesIn(
      card,
      [
        '[data-testid="tweetPhoto"] img',
        'video[poster]',
        '[data-testid="card.layoutLarge.media"] img',
        '[data-testid="card.layoutSmall.media"] img',
        '[data-testid="trend"] img',
      ].join(','),
    ),
  source(card) {
    const href = card
      .querySelector('[data-testid="User-Name"] a[href^="/"]')
      ?.getAttribute('href');
    const handle = href && /^\/(\w{1,15})$/.exec(href)?.[1];
    return handle
      ? { key: `x:@${handle.toLowerCase()}`, name: `@${handle}` }
      : undefined;
  },
  // Removing the whole virtual-list cell lets X re-measure and close the gap.
  hideTarget: (card) =>
    card.closest<HTMLElement>('[data-testid="cellInnerDiv"]') ??
    collapseWrappers(card),
  expectsCards: (location) =>
    /^\/(home|search|explore|notifications|[\w]{1,15}(\/status\/\d+)?)\/?$/.test(
      location.pathname,
    ) && !/^\/(settings|i|login|messages)/.test(location.pathname),
};
