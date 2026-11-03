import { imagesIn, type SiteModule } from './types';

/** Tier 2: article cards and headings on any other site. Best-effort. */
export const generic: SiteModule = {
  id: 'generic',
  tier: 2,
  matches: () => true,
  cards: [
    'article',
    '[role="article"]',
    '[itemprop="headline"]',
    'h1',
    'h2',
    'h3',
    '.post',
    '.comment',
  ].join(','),
  // Headings in a list of story cards take the whole card with them. Other
  // elements (the engine also offers mutated containers such as <main>) are
  // never cards themselves.
  card(element) {
    if (element.matches('h1, h2, h3, [itemprop="headline"]'))
      return (
        element.closest<HTMLElement>('article, [role="article"], li') ?? element
      );
    return element.matches(generic.cards) ? element : null;
  },
  includeNested: true,
  images: (card) =>
    card.matches('h1, h2, h3') ? [] : imagesIn(card, 'img', 1),
};
