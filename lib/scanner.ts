import { detect, hasGtaContext } from './detector';
import {
  findTargets,
  readText,
  targetSelector,
  xSidebarSelector,
} from './targets';
import type { Settings } from './settings';
import { createYouTubeLayout, youtubeStyles } from './youtube';
import { createShortsProtection, shortsStyles } from './shorts';
import { googleImageSelector, imageContext } from './google-images';
import { createNotice } from './notice';
import {
  createChannelFilter,
  uploaderSignature,
} from './youtube-channel-filter';

export function startScanner(initial: Settings, doc = document) {
  let settings = initial;
  let channelFilter = createChannelFilter(settings);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Set<Element>();
  const hidden = new Map<HTMLElement, HTMLElement>();
  let revealed = new WeakMap<HTMLElement, string>();
  const attribute = 'data-vice-guard-hidden';
  const youtube = createYouTubeLayout(doc);
  const shorts = createShortsProtection(doc);
  const style = doc.createElement('style');
  style.textContent = `[${attribute}]:not([data-vice-guard-short]) { display: none !important; }${youtubeStyles}${shortsStyles}`;
  (doc.head ?? doc.documentElement).append(style);

  function restore(element: HTMLElement) {
    hidden.get(element)?.remove();
    youtube.remove(element);
    shorts.remove(element);
    hidden.delete(element);
    element.removeAttribute(attribute);
  }

  function contentText(element: HTMLElement) {
    return (
      readText(element) +
      (element.matches(googleImageSelector) ? ` ${imageContext(element)}` : '')
    );
  }

  function inspect(element: HTMLElement) {
    if (!element.isConnected || element.closest('[data-vice-guard-ui]')) return;
    const isImage = element.matches(googleImageSelector);
    const text = contentText(element);
    const signature = text + '\n' + uploaderSignature(element);
    const filtering =
      element.matches(xSidebarSelector) || isImage
        ? { ...settings, mode: 'strict' as const, spoilerFree: false }
        : settings;
    if (
      (!detect(text, filtering) && !channelFilter(element, text)) ||
      revealed.get(element) === signature
    ) {
      if (hidden.has(element)) restore(element);
      return;
    }
    const existing = hidden.get(element);
    if (existing) {
      if (!existing.isConnected) {
        youtube.remove(element);
        if (
          !shorts.place(element, existing) &&
          !youtube.place(element, existing, settings.allowReveal)
        )
          element.before(existing);
      } else if (
        !element.hasAttribute('data-vice-guard-short') &&
        !existing.parentElement?.closest('[data-vice-guard-ui]') &&
        element.previousElementSibling !== existing
      )
        element.before(existing);
      return;
    }
    const host = createNotice(
      doc,
      settings.allowReveal,
      () => {
        if (!settings.allowReveal) return;
        revealed.set(
          element,
          contentText(element) + '\n' + uploaderSignature(element),
        );
        restore(element);
      },
      hasGtaContext(text) ? 'GTA 6 content hidden' : 'Channel content hidden',
    );
    if (
      !shorts.place(element, host) &&
      !youtube.place(element, host, settings.allowReveal)
    )
      element.before(host);
    hidden.set(element, host);
    element.setAttribute(attribute, '');
  }

  function flush() {
    timer = undefined;
    youtube.sync();
    if (!settings.enabled) return;
    for (const [element] of hidden) if (!element.isConnected) restore(element);
    const targets = new Set<HTMLElement>();
    for (const root of pending) {
      if (!root.isConnected) continue;
      for (const element of findTargets(root)) targets.add(element);
    }
    pending.clear();
    // Children first keeps a matching comment from hiding its entire discussion.
    for (const element of [...targets].reverse()) {
      if (element.querySelector(`[${attribute}]`)) continue;
      inspect(element);
    }
  }

  function queue(root: Element) {
    if (!settings.enabled) return;
    if (root.closest('[data-vice-guard-ui]')) return;
    pending.add(root);
    if (!timer) timer = setTimeout(flush, 80);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes)
          if (node instanceof Element) queue(node);
      }
      const target =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      if (record.attributeName === 'data-q' && target) queue(target);
      const container = target?.closest(targetSelector);
      if (container) queue(container);
      if (!timer) timer = setTimeout(flush, 80);
    }
  });
  function observe() {
    const keepYouTubeLayout =
      /(^|\.)youtube\.com$/.test(doc.location.hostname) ||
      doc.querySelector('ytd-rich-grid-renderer') !== null;
    if (settings.enabled || keepYouTubeLayout)
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        characterData: settings.enabled,
        attributes: settings.enabled,
        ...(settings.enabled
          ? {
              attributeFilter: ['title', 'aria-label', 'alt', 'data-q', 'href'],
            }
          : {}),
      });
  }
  youtube.sync();
  observe();
  if (settings.enabled) {
    pending.add(doc.documentElement);
    flush();
  }
  return {
    update(next: Settings) {
      observer.disconnect();
      pending.clear();
      clearTimeout(timer);
      timer = undefined;
      settings = next;
      channelFilter = createChannelFilter(settings);
      revealed = new WeakMap();
      for (const [element] of hidden) restore(element);
      youtube.sync();
      if (settings.enabled) {
        pending.add(doc.documentElement);
        flush();
      }
      observe();
    },
    stop() {
      observer.disconnect();
      clearTimeout(timer);
      pending.clear();
      for (const [element] of hidden) restore(element);
      youtube.reset();
      shorts.stop();
      style.remove();
    },
  };
}
