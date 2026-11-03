import { classify, type Verdict } from '../match/matcher';
import type { Settings } from '../settings';
import type { SiteModule, Source } from '../sites';
import { collapseWrappers } from '../sites/types';
import { HIT, OK, WAIT } from './style';
import { readText } from './text';

export interface ImageResult {
  /** Text recognised in the image. */
  ocr?: string;
  /** CLIP probability that the image shows GTA 6. */
  clip?: number;
  /** OCR is done and CLIP is still running; ask for it with `deps.clip`. */
  clipPending?: boolean;
  error?: string;
  /** Milliseconds spent per stage in the offscreen document (diagnostics). */
  timing?: { fetch: number; ocr: number; clip: number; total: number };
}

export interface HiddenEntry {
  title: string;
  site: string;
  rule: string;
  layer: string;
  url?: string;
}

export interface EngineDeps {
  /** Classifies one image locally; omitted when the image layer is unavailable. */
  image?: (url: string) => Promise<ImageResult>;
  /** The CLIP verdict for an image whose first result had `clipPending`. */
  clip?: (url: string) => Promise<ImageResult>;
  /** Moves pending image requests for on-screen cards to the front of the queue. */
  prioritize?: (urls: string[]) => void;
  isBlocked(source: Source): boolean;
  onHidden(entry: HiddenEntry): void;
  onCount(count: number): void;
  onSourceSeen?(source: Source, title: string, hit: boolean): void;
  onHealth?(broken: boolean): void;
}

/**
 * A card waiting for its image verdict keeps its slot but is invisible, like
 * a loading placeholder. If it sits on screen this long without a verdict it
 * is removed anyway (fail closed); a late clean verdict restores it. The
 * clock starts when the card becomes visible, not when its thumbnail is
 * prefetched. Collapsing sooner would make the feed jump twice for every
 * clean card that is merely slow, so this only guards against a stuck engine.
 */
export const IMAGE_TIMEOUT_MS = 10_000;
/** A card that keeps changing is re-read in full at most this often. */
export const RESCAN_MS = 1000;
const ATTRIBUTES = [
  'title',
  'aria-label',
  'alt',
  'src',
  'href',
  'data-q',
  'post-title',
  'poster',
];

type Status = 'ok' | 'hit' | 'image';
interface CardState {
  signature: string;
  status: Status;
  target?: HTMLElement;
  /** Hidden by the image timeout; a late clean verdict restores it. */
  timedOut?: boolean;
  timer?: ReturnType<typeof setTimeout>;
  requested?: boolean;
  urls: string[];
  title: string;
  shell?: boolean;
}

/**
 * Timers, view and like counters ("0:13", "1,235 likes", "2h"): when one
 * number replaces another, the card's meaning did not change, and on video
 * feeds this happens several times a second per card.
 */
const UNIT =
  'k|m|b|likes?|views?|comments?|replies|reply|shares?|reposts?|ago|[smhdwy]|min|mins|sec|secs|hours?|minutes?|seconds?|days?|weeks?|months?|years?|watching';
const SEPARATOR = '[\\s\\d:.,/%+·•\\-–]*';
const COUNTER = new RegExp(
  `^${SEPARATOR}(?:(?:${UNIT})\\b${SEPARATOR}){0,3}$`,
  'i',
);
const isCounter = (text: string | null | undefined) =>
  !!text && /\d/.test(text) && COUNTER.test(text.trim());

export function counterOnly(record: MutationRecord): boolean {
  if (record.type === 'characterData')
    return isCounter(record.oldValue) && isCounter(record.target.textContent);
  if (record.type !== 'childList') return false;
  const nodes = [...record.addedNodes, ...record.removedNodes];
  return (
    record.addedNodes.length > 0 &&
    record.removedNodes.length > 0 &&
    nodes.every(
      (node) =>
        (node.nodeType === Node.TEXT_NODE ||
          (node instanceof Element && node.childElementCount === 0)) &&
        isCounter(node.textContent),
    )
  );
}

export function startEngine(
  site: SiteModule,
  initial: Settings,
  deps: EngineDeps,
  doc: Document = document,
) {
  let settings = initial;
  let states = new WeakMap<HTMLElement, CardState>();
  const hidden = new Set<HTMLElement>();
  const imageRequests = new Map<string, Promise<ImageResult>>();
  let seenOnPage = 0;
  let countTimer: ReturnType<typeof setTimeout> | undefined;

  const reportCount = () => {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => deps.onCount(hidden.size), 100);
  };

  const toCard = (element: HTMLElement): HTMLElement | null =>
    site.card ? site.card(element) : element;

  function ownText(card: HTMLElement) {
    const exclude = site.includeNested ? undefined : site.cards;
    return `${readText(card, exclude)} ${site.extraText?.(card) ?? ''}`;
  }

  /** Elements removed from layout, with how many hidden cards chose them. */
  const targets = new Map<HTMLElement, number>();
  function setTarget(state: CardState, target: HTMLElement | undefined) {
    const old = state.target;
    if (old === target) return;
    if (old) {
      const n = (targets.get(old) ?? 1) - 1;
      if (n > 0) targets.set(old, n);
      else (targets.delete(old), old.removeAttribute(HIT));
    }
    state.target = target;
    if (target)
      (targets.set(target, (targets.get(target) ?? 0) + 1),
        target.setAttribute(HIT, ''));
  }

  function markOk(card: HTMLElement) {
    // A clean card can still be the wrapper a nested hidden card removed.
    if (!targets.has(card)) card.removeAttribute(HIT);
    card.setAttribute(OK, '');
  }

  function hide(
    card: HTMLElement,
    state: CardState,
    verdict: Verdict,
    log = true,
  ) {
    clearTimeout(state.timer);
    visibility.unobserve(card);
    setTarget(state, site.hideTarget?.(card) ?? collapseWrappers(card));
    state.status = 'hit';
    card.removeAttribute(OK);
    card.setAttribute(HIT, '');
    if (hidden.has(card)) return;
    hidden.add(card);
    if (log && !state.shell) {
      reportCount();
      deps.onHidden({
        title: state.title,
        site: site.id,
        rule: verdict.rule ?? 'unknown',
        layer: verdict.layer ?? 'text',
        url: state.urls[0],
      });
    }
    site.onHide?.(card);
    collapseShell(card);
  }

  function restore(card: HTMLElement, state: CardState) {
    visibility.unobserve(card);
    setTarget(state, undefined);
    state.timedOut = false;
    markOk(card);
    state.status = 'ok';
    if (hidden.delete(card) && !state.shell) reportCount();
    const parent = card.parentElement?.closest<HTMLElement>(site.cards);
    const parentState = parent && states.get(parent);
    if (parent && parentState?.shell) {
      parentState.shell = false;
      restore(parent, parentState);
    }
  }

  /** Hides a section whose cards are all hidden and which has only a heading left. */
  function collapseShell(card: HTMLElement) {
    if (site.includeNested) return;
    const parent = card.parentElement?.closest<HTMLElement>(site.cards);
    const state = parent && states.get(parent);
    if (!parent || !state || state.status === 'hit') return;
    const nested = [...parent.querySelectorAll<HTMLElement>(site.cards)].filter(
      (element) => element.parentElement?.closest(site.cards) === parent,
    );
    if (!nested.every((element) => element.hasAttribute(HIT))) return;
    if (ownText(parent).replace(/\s+/g, ' ').trim().length > 60) return;
    state.shell = true;
    hide(parent, state, { hit: true, rule: 'empty-shell' }, false);
  }

  function nestedImages(card: HTMLElement): Set<string> {
    const urls = new Set<string>();
    if (site.includeNested) return urls;
    for (const nested of card.querySelectorAll<HTMLElement>(site.cards))
      for (const url of site.images?.(nested) ?? []) urls.add(url);
    return urls;
  }

  function scan(card: HTMLElement) {
    if (!card.isConnected || card.closest('[data-vice-guard-ui]')) return;
    seenOnPage++;
    const text = ownText(card);
    const nested = nestedImages(card);
    const urls =
      settings.imageLayer && deps.image
        ? (site.images?.(card) ?? []).filter((url) => !nested.has(url))
        : [];
    const signature = `${text}\u0000${urls.join(' ')}`;
    const previous = states.get(card);
    if (previous && previous.signature === signature) return;
    if (previous) clearTimeout(previous.timer);
    const state: CardState = {
      signature,
      status: 'ok',
      urls,
      title: text.replace(/\s+/g, ' ').trim().slice(0, 160),
      target: previous?.target,
    };
    states.set(card, state);
    const wasHidden = hidden.has(card);
    hidden.delete(card);

    const source = site.source?.(card);
    const blocked = source && deps.isBlocked(source);
    const verdict = classify(text, settings, {
      blockedSource: blocked ? source.name : undefined,
    });
    if (source && !blocked && state.title)
      deps.onSourceSeen?.(source, state.title, verdict.hit);
    if (verdict.hit) {
      if (wasHidden) hidden.add(card);
      hide(card, state, verdict, !wasHidden);
      return;
    }
    if (wasHidden) reportCount();
    if (urls.length) {
      // Waits hidden (layout kept) for the image verdict.
      state.status = 'image';
      setTarget(state, undefined);
      if (!targets.has(card)) card.removeAttribute(HIT);
      card.removeAttribute(OK);
      intersection.observe(card);
      return;
    }
    restore(card, state);
  }

  function classifyImage(url: string) {
    let request = imageRequests.get(url);
    if (!request) {
      request = deps.image!(url).catch((error: unknown) => ({
        error: String(error),
      }));
      imageRequests.set(url, request);
    }
    return request;
  }

  const clipRequests = new Map<string, Promise<ImageResult>>();
  function clipImage(url: string) {
    let request = clipRequests.get(url);
    if (!request) {
      request = (
        deps.clip?.(url) ?? Promise.resolve({ error: 'no clip' })
      ).catch((error: unknown) => ({ error: String(error) }));
      clipRequests.set(url, request);
    }
    return request;
  }

  /** A hit verdict from image results (errors fail closed), if any. */
  function imageVerdict(
    state: CardState,
    results: ImageResult[],
  ): Verdict | undefined {
    for (const result of results) {
      if (result.error)
        return {
          hit: true,
          rule: `image-error: ${result.error.slice(0, 120)}`,
          layer: 'image',
        };
      if (result.ocr) {
        // Thumbnail text is judged together with the card's own text.
        const verdict = classify(`${state.title} | ${result.ocr}`, settings, {
          layer: 'ocr',
        });
        if (verdict.hit)
          return {
            ...verdict,
            rule: `${verdict.rule} "${result.ocr.slice(0, 40)}"`,
          };
      }
      if (result.clip !== undefined && result.clip >= settings.clipThreshold)
        return {
          hit: true,
          rule: `clip ${result.clip.toFixed(2)}`,
          layer: 'clip',
        };
    }
    return undefined;
  }

  function requestImages(card: HTMLElement) {
    const state = states.get(card);
    if (!state || state.status !== 'image' || state.requested) return;
    state.requested = true;
    const signature = state.signature;
    visibility.observe(card);
    const current = () =>
      states.get(card) === state && state.signature === signature;
    const finish = (verdict: Verdict | undefined) => {
      clearTimeout(state.timer);
      card.removeAttribute(WAIT);
      visibility.unobserve(card);
      if (!verdict) return restore(card, state);
      if (state.timedOut) hidden.delete(card);
      hide(card, state, verdict, true);
    };
    void Promise.all(state.urls.map(classifyImage)).then((results) => {
      if (!current()) return;
      const early = imageVerdict(state, results);
      const pending = state.urls.filter((_, i) => results[i]!.clipPending);
      if (early || !pending.length) return finish(early);
      const late = Promise.all(pending.map(clipImage));
      if (settings.waitForClip) {
        // Strict: stays blank until CLIP has judged the image too.
        void late.then(
          (clips) => current() && finish(imageVerdict(state, clips)),
        );
        return;
      }
      // Fast: show now; CLIP can still remove the card when it answers.
      finish(undefined);
      void late.then((clips) => {
        if (!current() || state.status !== 'ok') return;
        const verdict = imageVerdict(state, clips);
        if (verdict) hide(card, state, verdict, true);
      });
    });
  }

  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        intersection.unobserve(entry.target);
        requestImages(entry.target as HTMLElement);
      }
    },
    // Classify images well before they scroll into view.
    { rootMargin: '150% 0px 150% 0px' },
  );

  function startTimeout(card: HTMLElement) {
    const state = states.get(card);
    if (!state || state.status !== 'image' || state.timer !== undefined) return;
    deps.prioritize?.(state.urls);
    state.timer = setTimeout(() => {
      if (states.get(card) !== state || state.status !== 'image') return;
      // Fail closed: no verdict in time means hidden.
      state.timedOut = true;
      card.setAttribute(WAIT, '');
      hide(card, state, { hit: true, rule: 'image-timeout', layer: 'image' });
      state.status = 'image';
    }, IMAGE_TIMEOUT_MS);
  }
  // The fail-closed clock only runs while the blank card is on screen.
  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      if (entry.isIntersecting) {
        startTimeout(card);
        continue;
      }
      const state = states.get(card);
      if (state?.status === 'image' && !state.timedOut) {
        clearTimeout(state.timer);
        state.timer = undefined;
      }
    }
  });

  /** New subtrees: every card inside them is scanned. */
  const roots = new Set<Node>();
  /** Changed nodes: only the card that contains them is rescanned. */
  const touched = new Set<Node>();
  /** Text that changed in each already-judged card since its last scan. */
  const changes = new Map<HTMLElement, string[]>();
  const lastScan = new WeakMap<HTMLElement, number>();
  /** Cards whose image changed: checked at once, never deferred. */
  const urgentCards = new Set<HTMLElement>();
  const deferred = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  const elementOf = (node: Node) =>
    node instanceof Element ? node : node.parentElement;
  /** The card a changed node belongs to (itself included). */
  function cardOf(node: Node): HTMLElement | null {
    const element = elementOf(node);
    if (!element?.isConnected) return null;
    const match = element.closest<HTMLElement>(site.cards);
    if (match) return toCard(match);
    return site.card && element instanceof HTMLElement
      ? site.card(element)
      : null;
  }

  function rescanLater(card: HTMLElement) {
    if (deferred.has(card)) return;
    const wait = Math.max(
      0,
      RESCAN_MS - (performance.now() - (lastScan.get(card) ?? 0)),
    );
    deferred.set(
      card,
      setTimeout(() => {
        deferred.delete(card);
        changes.delete(card);
        if (settings.enabled) judge(card);
      }, wait),
    );
  }

  function judge(card: HTMLElement) {
    lastScan.set(card, performance.now());
    changes.delete(card);
    const timer = deferred.get(card);
    if (timer) (clearTimeout(timer), deferred.delete(card));
    scan(card);
  }

  function process() {
    if (!settings.enabled) {
      roots.clear();
      touched.clear();
      changes.clear();
      return;
    }
    const cards = new Set<HTMLElement>();
    const add = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return;
      const card = toCard(element);
      if (card) cards.add(card);
    };
    for (const root of roots) {
      const element = elementOf(root);
      if (!element?.isConnected) continue;
      if (element.matches(site.cards)) add(element);
      for (const match of element.querySelectorAll(site.cards)) add(match);
      add(element.parentElement?.closest(site.cards) ?? null);
      if (site.card) add(element);
    }
    for (const node of touched) {
      const card = cardOf(node);
      if (card) cards.add(card);
    }
    roots.clear();
    touched.clear();
    const now = performance.now();
    const urgent = new Set(urgentCards);
    urgentCards.clear();
    // Inner cards first, so a section sees its items' verdicts.
    const ordered = [...cards].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1,
    );
    for (const card of ordered) {
      const state = states.get(card);
      const snippets = changes.get(card);
      // A judged card that keeps changing (video timers, like counters,
      // comments loading) is not re-read in full more than once per
      // RESCAN_MS: its new text is judged on its own right away, and the
      // whole card, for matches that span old and new text, shortly after.
      if (
        state?.status === 'ok' &&
        !urgent.has(card) &&
        now - (lastScan.get(card) ?? 0) < RESCAN_MS
      ) {
        changes.delete(card);
        // No snippet means text was only removed, which cannot add a match.
        if (snippets && classify(snippets.join(' | '), settings).hit)
          judge(card);
        else rescanLater(card);
        continue;
      }
      judge(card);
    }
  }

  const SNIPPET_LIMIT = 4000;
  function noteChange(node: Node, text: string | null | undefined) {
    if (!text?.trim()) return;
    const card = cardOf(node);
    if (!card || states.get(card)?.status !== 'ok') return;
    const list = changes.get(card) ?? [];
    changes.set(card, list);
    if (list.join('').length < SNIPPET_LIMIT)
      list.push(text.slice(0, SNIPPET_LIMIT));
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (counterOnly(record)) continue;
      if (record.type === 'childList')
        for (const node of record.addedNodes) {
          roots.add(node);
          noteChange(record.target, node.textContent);
        }
      if (record.type === 'characterData')
        noteChange(record.target, record.target.textContent);
      if (
        record.type === 'attributes' &&
        ['src', 'poster'].includes(record.attributeName!)
      ) {
        const card = cardOf(record.target);
        if (card) urgentCards.add(card);
      }
      if (record.type === 'attributes')
        noteChange(
          record.target,
          (record.target as Element).getAttribute(record.attributeName!),
        );
      touched.add(record.target);
    }
    process();
  });

  function observe() {
    observer.observe(doc, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });
  }

  function rescanAll() {
    for (const card of [...hidden]) {
      const state = states.get(card);
      if (state) {
        state.shell = false;
        restore(card, state);
      }
    }
    for (const element of doc.querySelectorAll(
      `[${HIT}], [${OK}], [${WAIT}]`,
    )) {
      element.removeAttribute(HIT);
      element.removeAttribute(OK);
      element.removeAttribute(WAIT);
    }
    hidden.clear();
    targets.clear();
    states = new WeakMap();
    imageRequests.clear();
    clipRequests.clear();
    for (const timer of deferred.values()) clearTimeout(timer);
    deferred.clear();
    changes.clear();
    urgentCards.clear();
    reportCount();
    if (settings.enabled) {
      roots.add(doc.documentElement);
      process();
    }
  }

  // Broken-selector check: a page with plenty of content but no cards found.
  let lastUrl = doc.location?.href;
  let broken = false;
  let checks = 0;
  const health = setInterval(() => {
    if (doc.location.href !== lastUrl) {
      lastUrl = doc.location.href;
      seenOnPage = doc.querySelectorAll(site.cards).length;
      checks = 0;
    }
    checks++;
    if (site.tier !== 1 || !site.expectsCards || checks < 3) return;
    const now =
      settings.enabled &&
      seenOnPage === 0 &&
      site.expectsCards(doc.location) &&
      doc.querySelectorAll(site.cards).length === 0 &&
      (doc.body?.innerText.length ?? 0) > 2000;
    if (now !== broken) {
      broken = now;
      deps.onHealth?.(broken);
    }
  }, 2000);

  const stopSite = site.start?.(doc, (card) => hidden.has(card)) ?? (() => {});
  observe();
  roots.add(doc.documentElement);
  process();

  return {
    update(next: Settings) {
      settings = next;
      rescanAll();
    },
    /** Rescans everything, e.g. after the channel blocklist changes. */
    rescan: rescanAll,
    stats: () => ({ hidden: hidden.size }),
    stop() {
      observer.disconnect();
      intersection.disconnect();
      visibility.disconnect();
      clearInterval(health);
      clearTimeout(countTimer);
      stopSite();
      settings = { ...settings, enabled: false };
      rescanAll();
    },
  };
}
