import { imagesIn, type SiteModule } from './types';

const storyLink =
  'a[href*="./read/"], a[href*="/read/"], a[href*="./articles/"]';
// A cluster holds at most this many story links; the feed holds many more.
const clusterLinks = 20;

const count = (element: Element) => element.querySelectorAll(storyLink).length;

/**
 * Google News has no stable card element, so a story's card is its cluster:
 * the highest ancestor that still holds only a handful of story links.
 */
function cluster(element: HTMLElement): HTMLElement | null {
  let node = element.closest<HTMLElement>('c-wiz[data-node-index], article');
  if (!node || count(node) === 0 || count(node) > clusterLinks) return null;
  for (
    let parent = node.parentElement;
    parent && !parent.matches('main, body') && count(parent) <= clusterLinks;
    parent = parent.parentElement
  )
    node = parent;
  return node;
}

export const gnews: SiteModule = {
  id: 'gnews',
  tier: 1,
  matches: (host) => host === 'news.google.com',
  cards: `main :is(${storyLink})`,
  prehideCards: false,
  pendingLeaves: `main :is(${storyLink}, time, img, h3, h4, figure)`,
  card: cluster,
  includeNested: true,
  images: (card) =>
    imagesIn(card, 'img[src*="/api/attachments/"], figure img', 2),
  source(card) {
    const name = card
      .querySelector('[data-n-tid] + div, .vr1PYe, [class*="source"]')
      ?.textContent?.trim();
    return name ? { key: `gnews:${name.toLowerCase()}`, name } : undefined;
  },
  expectsCards: (location) =>
    /^\/($|home|topics|stories|search|foryou|publications|showcase)/.test(
      location.pathname,
    ),
};
