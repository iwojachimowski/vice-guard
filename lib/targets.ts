import { shortsSelector } from './shorts';
import { googleImageSelector } from './google-images';
import { isUploaderText, youtubeVideoSelector } from './youtube-channel-filter';

export const xSidebarSelector =
  '[data-testid="sidebarColumn"] [data-testid^="news_sidebar_article_"], [data-testid="sidebarColumn"] [data-testid="trend"]';

const selectors = [
  googleImageSelector,
  xSidebarSelector,
  shortsSelector,
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-universal-watch-card-renderer',
  'ytd-grid-video-renderer',
  'ytd-reel-item-renderer',
  'yt-lockup-view-model',
  'ytm-shorts-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
  'ytd-comment-thread-renderer',
  'ytd-comment-view-model',
  'shreddit-post',
  'shreddit-comment',
  '.thing',
  '[data-testid="post-container"]',
  '[data-testid="tweet"]',
  'article',
  '[role="article"]',
  '#search .MjjYud',
  '#rso .g',
  '#rso .SoaBEf',
  '.news-card',
  '.post',
  '.comment',
  '[itemprop="headline"]',
  'h1',
  'h2',
  'h3',
];

export const targetSelector = selectors.join(',');
const commentSelector =
  'shreddit-comment, ytd-comment-thread-renderer, .comment';

function contentTarget(element: Element): HTMLElement | null {
  let target = element.closest<HTMLElement>(targetSelector);
  if (!target) return null;
  for (
    let parent = target.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (target.matches(googleImageSelector))
      return target.closest<HTMLElement>('#iur .vCUuC') ?? target;
    if (target.matches(commentSelector)) break;
    if (parent.matches(targetSelector)) target = parent;
  }
  return target;
}

export function readText(element: HTMLElement): string {
  const parts: string[] = [];
  const isVideo = element.matches(youtubeVideoSelector);
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
  );
  let length = 0;
  while (walker.nextNode() && length < 24_000) {
    const node = walker.currentNode;
    if (isVideo && node.parentElement && isUploaderText(node.parentElement))
      continue;
    if (
      node.parentElement?.closest(
        'script, style, noscript, [data-vice-guard-ui]',
      )
    )
      continue;
    const text = node.textContent ?? '';
    parts.push(text);
    length += text.length;
  }
  for (const child of element.querySelectorAll(
    '[title], [aria-label], img[alt]',
  )) {
    if (isVideo && isUploaderText(child)) continue;
    parts.push(
      child.getAttribute('title') ?? '',
      child.getAttribute('aria-label') ?? '',
      child.getAttribute('alt') ?? '',
    );
  }
  parts.push(
    element.getAttribute('title') ?? '',
    element.getAttribute('aria-label') ?? '',
  );
  return parts.join(' ').slice(0, 24_000);
}

export function findTargets(root: Element): HTMLElement[] {
  const found = [...root.querySelectorAll<HTMLElement>(targetSelector)];
  const enclosing = contentTarget(root);
  if (enclosing) found.unshift(enclosing);
  return [
    ...new Set(
      found
        .map(contentTarget)
        .filter((element): element is HTMLElement => element !== null),
    ),
  ];
}
