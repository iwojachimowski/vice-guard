const limit = 24_000;
const skipped = 'script, style, noscript, template, [data-vice-guard-ui]';

/**
 * Visible text plus title/aria-label/alt attributes. Nested cards matching
 * `exclude` are skipped: they are judged on their own.
 */
export function readText(card: HTMLElement, exclude?: string): string {
  const parts: string[] = [];
  let length = 0;
  const attributes = (element: Element) => {
    for (const name of ['title', 'aria-label', 'alt']) {
      const value = element.getAttribute(name);
      if (value) parts.push(value);
    }
  };
  attributes(card);
  const walker = card.ownerDocument.createTreeWalker(
    card,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node instanceof Element) {
          if (node.matches(skipped)) return NodeFilter.FILTER_REJECT;
          if (exclude && node.matches(exclude)) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  while (walker.nextNode() && length < limit) {
    const node = walker.currentNode;
    if (node instanceof Element) {
      attributes(node);
      continue;
    }
    const text = node.textContent ?? '';
    parts.push(text);
    length += text.length;
  }
  return parts.join(' ').slice(0, limit);
}
