import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { AuditEntry } from '../lib/audit';
import type { Blocklist, Observation } from '../lib/channels';
import { startEngine, type ImageResult } from '../lib/engine/engine';
import { engineCss, injectStyle } from '../lib/engine/style';
import type { ContentMessage } from '../lib/messages';
import { siteFor } from '../lib/sites';
import { readBlocklist, readSettings, watchStorage } from '../lib/storage';

const blockedKeys = (list: Blocklist) =>
  Object.values(list)
    .filter((entry) => entry.blocked)
    .map((entry) => entry.key)
    .sort()
    .join('\n');

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  async main(ctx) {
    const site = siteFor(location.hostname);
    // Hide candidates before the page paints anything; settings load after.
    const css = engineCss(site);
    let style: HTMLStyleElement | undefined = injectStyle(document, css);
    let [settings, blocklist] = await Promise.all([
      readSettings(),
      readBlocklist(),
    ]);
    if (ctx.isInvalid) return style.remove();
    if (!settings.enabled) style = (style.remove(), undefined);

    const send = (message: ContentMessage) =>
      browser.runtime.sendMessage(message).catch(() => undefined);
    let audit: AuditEntry[] = [];
    const sources = new Map<string, Observation & { titles: Set<string> }>();
    const flush = setInterval(() => {
      if (audit.length) void send({ type: 'vg:audit', entries: audit });
      audit = [];
      const observations = [...sources.values()]
        .filter((entry) => entry.hits.length)
        .map(({ source, hits }) => ({ source, hits }));
      for (const entry of sources.values()) entry.hits = [];
      if (observations.length) void send({ type: 'vg:sources', observations });
    }, 3000);

    void send({ type: 'vg:count', count: 0 });
    const engine = startEngine(site, settings, {
      image: (url) =>
        browser.runtime.sendMessage({
          type: 'vg:image',
          url,
        } satisfies ContentMessage) as Promise<ImageResult>,
      clip: (url) =>
        browser.runtime.sendMessage({
          type: 'vg:clip',
          url,
        } satisfies ContentMessage) as Promise<ImageResult>,
      prioritize: (urls) => void send({ type: 'vg:prioritize', urls }),
      isBlocked: (source) => blocklist[source.key]?.blocked === true,
      onHidden: (entry) =>
        audit.push({ ...entry, time: Date.now(), page: location.hostname }),
      onCount: (count) => void send({ type: 'vg:count', count }),
      onSourceSeen(source, title, hit) {
        let entry = sources.get(source.key);
        if (!entry)
          sources.set(
            source.key,
            (entry = { source, hits: [], titles: new Set() }),
          );
        if (entry.titles.has(title)) return;
        entry.titles.add(title);
        entry.hits.push(hit ? 1 : 0);
      },
      onHealth: (broken) =>
        void send({ type: 'vg:health', broken, site: site.id }),
    });

    const unwatch = watchStorage((change) => {
      if (change.settings) {
        settings = change.settings;
        if (settings.enabled && !style) style = injectStyle(document, css);
        if (!settings.enabled && style) style = (style.remove(), undefined);
        engine.update(settings);
      }
      if (change.channels) {
        const changed = blockedKeys(change.channels) !== blockedKeys(blocklist);
        blocklist = change.channels;
        if (changed) engine.rescan();
      }
    });
    ctx.onInvalidated(() => {
      clearInterval(flush);
      unwatch();
      engine.stop();
      style?.remove();
    });
  },
});
