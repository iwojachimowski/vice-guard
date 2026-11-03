import { collapseWrappers, imagesIn, type SiteModule } from './types';

const imageCards = [
  '#iur .w43QB',
  '#iur .vCUuC',
  '#iur [data-lpage]',
  '[data-viewer-group] [data-preview-id]',
  '#islrg [data-docid]',
  '#islrg .isv-r',
  '[data-docid][data-ri]',
  'div[data-lpage][data-ri]',
  'div[jsname="dTDiAc"]',
];
const imageCard = imageCards.join(',');

/** Image cards get their panel's query and source domains as context. */
function imageContext(element: HTMLElement): string {
  const parts = [
    element.closest('[data-viewer-group][data-q]')?.getAttribute('data-q') ??
      '',
    element.getAttribute('data-lpage') ?? '',
  ];
  for (const link of element.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    try {
      const url = new URL(link.href);
      parts.push(url.hostname + url.pathname);
    } catch {
      // Malformed source links have no usable context.
    }
  }
  return decodeURIComponent(parts.join(' ')).replace(/[/_.-]+/g, ' ');
}

export const google: SiteModule = {
  id: 'google',
  tier: 1,
  matches: (host) =>
    /(^|\.)google\.[a-z.]+$/.test(host) && !host.startsWith('news.'),
  cards: [
    // Web results and the section wrappers (Videos, Images, Top stories...).
    '#rso > div',
    '#rso .MjjYud',
    '#rso .ULSxyf',
    '#rso .g',
    '#botstuff .MjjYud',
    // People also ask, "Things to know" and the AI Overview.
    '.related-question-pair',
    '[jsname="yEVEwb"] > div',
    '[data-attrid*="ThingsToKnow"]',
    '[jsname="txosbe"]',
    '[jsname="ZLxsqf"]',
    // Videos and Shorts carousels.
    'div[data-vid]',
    'video-voyager',
    // Top stories.
    'g-section-with-header',
    '.SoaBEf',
    '[data-news-doc-id]',
    'g-inner-card',
    // Knowledge panel.
    '#rhs',
    '.kp-wholepage',
    // Related searches.
    '#bres a',
    'a.ngTNl',
    // Autocomplete.
    'li[data-attrid="AutocompletePrediction"]',
    'ul[role="listbox"] > li[role="presentation"]',
    ...imageCards,
  ].join(','),
  extraText(card) {
    return [
      card.getAttribute('data-q'),
      card.matches(imageCard) ? imageContext(card) : '',
      card.getAttribute('data-entityname'),
    ]
      .filter(Boolean)
      .join(' ');
  },
  // Only image results and video thumbnails; web results only carry favicons.
  images: (card) =>
    card.matches(imageCard)
      ? imagesIn(card, 'img', 1)
      : card.matches('div[data-vid], g-inner-card, .SoaBEf')
        ? imagesIn(card, 'img', 1)
        : [],
  hideTarget: (card) =>
    collapseWrappers(card, 'body, #rso, #botstuff, #rhs, [role="list"]'),
  expectsCards: (location) =>
    location.pathname === '/search' &&
    new URLSearchParams(location.search).has('q'),
};
