export type SiteId =
  'youtube' | 'reddit' | 'x' | 'google' | 'gnews' | 'generic';

/** The account a card came from: a channel, subreddit or X handle. */
export interface Source {
  /** Stable lowercase key, e.g. "youtube:@rockstargames" or "reddit:r/gta6". */
  key: string;
  name: string;
}

export interface SiteModule {
  id: SiteId;
  tier: 1 | 2;
  matches(hostname: string): boolean;
  /**
   * Selector for candidate cards. Matching elements stay visibility:hidden
   * until scanned, so it must also be valid CSS.
   */
  cards: string;
  /** Set false when `cards` cannot be hidden directly (it matches feeds). */
  prehideCards?: boolean;
  /**
   * Content hidden until it is inside a scanned card, for sites whose cards
   * cannot be expressed in CSS (Google News clusters).
   */
  pendingLeaves?: string;
  /** Maps a matched element to the card that is judged as a whole. */
  card?(element: HTMLElement): HTMLElement | null;
  /** Read nested cards' text as part of this card instead of judging them apart. */
  includeNested?: boolean;
  /** The element removed from layout for a hidden card (default: its sole-child wrappers). */
  hideTarget?(card: HTMLElement): HTMLElement;
  /** Extra text such as attributes that are not rendered as text nodes. */
  extraText?(card: HTMLElement): string;
  images?(card: HTMLElement): string[];
  source?(card: HTMLElement): Source | undefined;
  /** Whether this page should contain cards, for broken-selector detection. */
  expectsCards?(location: Location): boolean;
  css?: string;
  /** Called after a card is hidden, e.g. to cancel autoplay. */
  onHide?(card: HTMLElement): void;
  start?(doc: Document, isHidden: (card: HTMLElement) => boolean): () => void;
}

const imageUrl = /^(https?:|data:image\/)/;

/** The first `limit` loaded or lazy image URLs inside a card. */
export function imagesIn(card: HTMLElement, selector: string, limit = 2) {
  const urls: string[] = [];
  for (const element of card.querySelectorAll<HTMLElement>(selector)) {
    const url =
      element.getAttribute('src') ??
      element.getAttribute('poster') ??
      element.getAttribute('data-src') ??
      '';
    if (imageUrl.test(url) && !urls.includes(url)) urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

/**
 * The card plus any wrappers that hold nothing else, so a grid or virtual
 * list cell collapses with it instead of leaving a gap.
 */
export function collapseWrappers(card: HTMLElement, stop = 'body, main') {
  let target = card;
  for (let depth = 0; depth < 4; depth++) {
    const parent = target.parentElement;
    if (!parent || parent.childElementCount !== 1 || parent.matches(stop))
      break;
    target = parent;
  }
  return target;
}
