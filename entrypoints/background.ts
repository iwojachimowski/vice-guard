import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { pruneAudit, type AuditEntry } from '../lib/audit';
import { learn } from '../lib/channels';
import type { ImageResult } from '../lib/engine/engine';
import { createImageCache } from '../lib/image-cache';
import type {
  ContentMessage,
  EngineStatus,
  OffscreenMessage,
} from '../lib/messages';
import { defaults, type Settings } from '../lib/settings';
import {
  readBlocklist,
  readSettings,
  saveBlocklist,
  watchStorage,
} from '../lib/storage';

interface TabState {
  count: number;
  broken?: string;
}

export default defineBackground(() => {
  const tabs = new Map<number, TabState>();
  let settings: Settings = defaults;
  void readSettings().then((value) => {
    settings = value;
  });
  watchStorage((change) => {
    if (!change.settings) return;
    settings = change.settings;
    warm(settings);
    for (const tabId of tabs.keys()) render(tabId);
  });

  function render(tabId: number) {
    const state = tabs.get(tabId);
    if (!state) return;
    // A red "!" means a supported site's layout changed and nothing is being scanned.
    const text = !settings.enabled
      ? ''
      : state.broken
        ? '!'
        : settings.showBadge && state.count
          ? String(state.count)
          : '';
    void browser.action.setBadgeText({ tabId, text }).catch(() => undefined);
    void browser.action
      .setBadgeBackgroundColor({
        tabId,
        color: state.broken ? '#d93025' : '#5f6368',
      })
      .catch(() => undefined);
    void browser.action
      .setTitle({
        tabId,
        title: state.broken
          ? `Vice Guard: protection may be broken on ${state.broken}; no cards found`
          : 'Vice Guard',
      })
      .catch(() => undefined);
  }

  // Storage writes are serialized so batches from many tabs never race.
  let writes = Promise.resolve();
  const enqueue = (task: () => Promise<void>) => {
    writes = writes.then(task).catch(() => undefined);
  };

  let engineStatus: EngineStatus = { ocr: 'loading', clip: 'loading' };
  const cache = createImageCache();
  let offscreen: Promise<void> | undefined;
  function ensureOffscreen() {
    offscreen ??= (async () => {
      const contexts = await browser.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType],
      });
      if (contexts.length) return;
      await browser.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS' as Browser.offscreen.Reason],
        justification:
          'Runs the local OCR and image models off the page main thread.',
      });
    })().catch((error: unknown) => {
      offscreen = undefined;
      throw error;
    });
    return offscreen;
  }

  // Load OCR and CLIP as soon as the worker starts, not on the first
  // thumbnail, so model start-up never lands on a card the user is waiting on.
  const warm = (value: Settings) => {
    if (value.enabled && value.imageLayer)
      void ensureOffscreen().catch(() => undefined);
  };
  void readSettings().then(warm);
  browser.runtime.onStartup.addListener(() => void readSettings().then(warm));
  browser.runtime.onInstalled.addListener(() => void readSettings().then(warm));

  // One offscreen request per URL, however many cards or tabs show it.
  const inflight = new Map<string, Promise<ImageResult>>();
  function analyze(url: string): Promise<ImageResult> {
    let request = inflight.get(url);
    if (!request) {
      request = analyzeOnce(url).finally(() => inflight.delete(url));
      inflight.set(url, request);
    }
    return request;
  }
  async function analyzeOnce(url: string): Promise<ImageResult> {
    const cached = await cache.get(url);
    if (cached) return cached;
    await ensureOffscreen();
    const result = (await browser.runtime.sendMessage({
      target: 'offscreen',
      type: 'vg:analyze',
      url,
    } satisfies OffscreenMessage)) as ImageResult | undefined;
    if (!result) return { error: 'no response' };
    if (!result.clipPending) {
      if (!result.error) await cache.set(url, result);
      return result;
    }
    // OCR answered first; fetch CLIP's half now so it is cached complete.
    const full = (
      browser.runtime.sendMessage({
        target: 'offscreen',
        type: 'vg:clip',
        url,
      } satisfies OffscreenMessage) as Promise<ImageResult | undefined>
    ).then(async (clip) => {
      const merged: ImageResult = {
        ...result,
        ...(clip ?? { error: 'no response' }),
        clipPending: undefined,
      };
      if (!merged.error) await cache.set(url, merged);
      return merged;
    });
    late.set(url, full);
    clipOutstanding++;
    void full.finally(() => clipOutstanding--);
    void full.finally(() => setTimeout(() => late.delete(url), 60_000));
    return result;
  }
  /** Complete results (with CLIP) still being finished, by URL. */
  const late = new Map<string, Promise<ImageResult>>();
  /** CLIP verdicts still being computed (diagnostics). */
  let clipOutstanding = 0;
  async function clipResult(url: string): Promise<ImageResult> {
    return (
      (await late.get(url)) ??
      (await cache.get(url)) ?? { error: 'no clip result' }
    );
  }

  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const message = raw as
      | ContentMessage
      | { type: 'vg:engine'; status: EngineStatus }
      | { type: 'vg:status' };
    if (
      'target' in (raw as object) &&
      (raw as { target: string }).target === 'offscreen'
    )
      return;
    if (message.type === 'vg:engine') {
      engineStatus = message.status;
      return;
    }
    if (message.type === 'vg:status') {
      sendResponse({
        engine: engineStatus,
        cached: cache.size(),
        clipOutstanding,
      });
      return;
    }
    if (message.type === 'vg:image') {
      analyze(message.url)
        .then(sendResponse)
        .catch((error: unknown) => sendResponse({ error: String(error) }));
      return true;
    }
    if (message.type === 'vg:clip') {
      clipResult(message.url)
        .then(sendResponse)
        .catch((error: unknown) => sendResponse({ error: String(error) }));
      return true;
    }
    if (message.type === 'vg:prioritize') {
      // Sent even for requests still in the cache lookup; the offscreen
      // document keeps the priority until the request arrives.
      const urls = message.urls.filter((url) => inflight.has(url));
      if (urls.length)
        void browser.runtime
          .sendMessage({
            target: 'offscreen',
            type: 'vg:prioritize',
            urls,
          } satisfies OffscreenMessage)
          .catch(() => undefined);
      return;
    }
    if (message.type === 'vg:audit') {
      enqueue(async () => {
        const stored = await browser.storage.local.get('audit');
        const audit = Array.isArray(stored.audit)
          ? (stored.audit as AuditEntry[])
          : [];
        await browser.storage.local.set({
          audit: pruneAudit([...audit, ...message.entries]),
        });
      });
      return;
    }
    if (message.type === 'vg:sources') {
      enqueue(async () => {
        const list = await readBlocklist();
        learn(list, message.observations);
        await saveBlocklist(list);
      });
      return;
    }
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    const state = tabs.get(tabId) ?? { count: 0 };
    tabs.set(tabId, state);
    if (message.type === 'vg:count') state.count = message.count;
    if (message.type === 'vg:health')
      state.broken = message.broken ? message.site : undefined;
    render(tabId);
  });
  browser.tabs.onRemoved.addListener((tabId) => tabs.delete(tabId));

  // Expire audit entries older than seven days even when nothing new is logged.
  enqueue(async () => {
    const stored = await browser.storage.local.get('audit');
    if (Array.isArray(stored.audit))
      await browser.storage.local.set({
        audit: pruneAudit(stored.audit as AuditEntry[]),
      });
  });
});
