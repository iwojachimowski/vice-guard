import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

export interface Extension {
  context: BrowserContext;
  popup: Page;
  background: Worker;
  /** Every network request made while the test ran. */
  requests: string[];
}

const fixture = (name: string) =>
  readFileSync(path.resolve('tests/browser/fixtures', name));
/** Image hosts redirected to the local thumbnail server. */
export const imageHosts = [
  'i.ytimg.com',
  'pbs.twimg.com',
  'preview.redd.it',
  'img.test',
  'encrypted-tbn0.gstatic.com',
];

/**
 * Serves thumbnails for every image host: URLs containing "GTA" get a
 * thumbnail with "GTA VI ENDING" on it, the rest a neutral one. The offscreen
 * document's fetches cannot be routed by Playwright, so DNS is remapped.
 */
async function startImageServer() {
  const server = createServer(
    { key: fixture('test-key.pem'), cert: fixture('test-cert.pem') },
    (request, response) => {
      const url = request.url ?? '';
      // Like i.ytimg.com from a home connection: 90-350 ms per image,
      // fixed per URL so runs are comparable. VG_FAST_IMAGES=1 turns it off.
      let hash = 0;
      for (const char of url) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      const network = process.env.VG_FAST_IMAGES ? 0 : 90 + (hash % 261);
      const delay = /slow/i.test(url) ? 4000 : network;
      // "VG_g0603" in a URL serves that eval example's rendered thumbnail.
      const example = /VG_(g\d{4})/.exec(url)?.[1];
      const rendered =
        example && path.resolve('tests/eval/.cache/thumbs', `${example}.png`);
      // Never fall back to a plain image: it would look like an OCR miss.
      if (rendered && !existsSync(rendered)) {
        response.writeHead(404);
        response.end();
        return;
      }
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end(
          rendered
            ? readFileSync(rendered)
            : fixture(/gta/i.test(url) ? 'thumb-gta.png' : 'thumb-plain.png'),
        );
      }, delay);
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

export const test = base.extend<{
  extension: Extension;
  settings: Record<string, unknown>;
}>({
  settings: [{}, { option: true }],
  extension: async ({ settings }, use) => {
    const extensionPath = path.resolve('.output/chrome-mv3');
    const images = await startImageServer();
    const port = (images.address() as AddressInfo).port;
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // Set when the preinstalled browser differs from Playwright's pinned one.
      executablePath: process.env.VG_CHROMIUM || undefined,
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--host-resolver-rules=${imageHosts.map((host) => `MAP ${host} 127.0.0.1:${port}`).join(',')}`,
        '--ignore-certificate-errors',
        // Fixture hosts are local; never route them through a system proxy.
        '--no-proxy-server',
      ],
    });
    const requests: string[] = [];
    context.on('request', (request) => requests.push(request.url()));
    const errors: Error[] = [];
    context.on('weberror', (event) => errors.push(event.error()));
    try {
      const background =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker'));
      const id = new URL(background.url()).host;
      if (Object.keys(settings).length)
        await background.evaluate(
          (value) =>
            (globalThis as any).chrome.storage.local.set({ settings: value }),
          settings,
        );
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 350, height: 700 });
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await expect(
        popup.getByRole('checkbox', { name: 'Enable spoiler protection' }),
      ).toBeEnabled();
      await use({ context, popup, background, requests });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      images.close();
    }
  },
});

/**
 * Serves `html` at `url` (any real hostname, so the matching site module
 * runs) and records every animation frame in which a card marked
 * data-expect="hide" was rendered visibly.
 */
export async function openFixture(
  context: BrowserContext,
  url: string,
  html: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(() => {
    const flashes: string[] = [];
    (window as unknown as { __flashes: string[] }).__flashes = flashes;
    // A flash is any frame in which text of a card labelled "hide" was
    // painted on screen. Checked per text node, since cards are often
    // wrappers whose inner element carries the pre-hide style.
    // Per card: when it was first on screen while still blank, and for how long.
    const blankSince = new Map<Element, number>();
    const blank: number[] = [];
    (window as unknown as { __blank: number[] }).__blank = blank;
    const firstText = new WeakMap<Element, Element | null>();
    // Attribute history of every card, for diagnosing flashes.
    const history = new Map<Element, string[]>();
    (window as unknown as { __history: (text: string) => string[] }).__history =
      (text) => {
        const out: string[] = [];
        for (const [element, log] of history)
          if (
            (element.closest('[data-expect]')?.textContent ?? '')
              .replace(/\s+/g, ' ')
              .trim()
              .startsWith(text)
          )
            out.push(...log);
        return out.sort((x, y) => parseInt(x) - parseInt(y));
      };
    new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target as Element;
        const log = history.get(element) ?? [];
        history.set(element, log);
        log.push(
          `${Math.round(performance.now())} ${element.tagName.toLowerCase()} ${record.attributeName}=${element.getAttribute(record.attributeName!)}`,
        );
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-vg-hit', 'data-vg-ok', 'data-vg-wait'],
    });
    const check = () => {
      const now = performance.now();
      for (const element of document.querySelectorAll<HTMLElement>(
        '[data-expect]',
      )) {
        if (!firstText.has(element)) {
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: (node) => ((node.textContent ?? '').trim() ? 1 : 3),
            },
          );
          firstText.set(element, walker.nextNode()?.parentElement ?? null);
        }
        const text = firstText.get(element);
        const box = element.getBoundingClientRect();
        const onScreen =
          box.height > 0 && box.bottom > 0 && box.top < innerHeight;
        const waiting =
          !!text &&
          !element.closest('[data-vg-hit]') &&
          getComputedStyle(text).visibility === 'hidden';
        const since = blankSince.get(element);
        if (waiting && onScreen && since === undefined)
          blankSince.set(element, now);
        if ((!waiting || !onScreen) && since !== undefined) {
          blank.push(Math.round(now - since));
          blankSince.delete(element);
        }
      }
      for (const element of document.querySelectorAll<HTMLElement>(
        '[data-expect="hide"]',
      )) {
        if (element.closest('[data-vg-hit]')) continue;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!parent || !(node.textContent ?? '').trim()) continue;
          const box = parent.getBoundingClientRect();
          if (
            box.width === 0 ||
            box.height === 0 ||
            box.bottom < 0 ||
            box.top > innerHeight
          )
            continue;
          if (
            getComputedStyle(parent).visibility === 'hidden' ||
            !parent.checkVisibility()
          )
            continue;
          flashes.push(
            (element.textContent ?? '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 60),
          );
          break;
        }
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><meta charset="utf-8">${html}`,
    }),
  );
  await page.goto(url);
  return page;
}

/** Per-card outcome against the fixture's data-expect labels. */
export async function outcomes(page: Page) {
  return page.evaluate(() => {
    const result = {
      tp: 0,
      fn: 0,
      fp: 0,
      tn: 0,
      misses: [] as string[],
      falsePositives: [] as string[],
    };
    for (const element of document.querySelectorAll<HTMLElement>(
      '[data-expect]',
    )) {
      const style = getComputedStyle(element);
      const hidden =
        style.display === 'none' ||
        !!element.closest('[data-vg-hit]') ||
        element.getBoundingClientRect().height === 0;
      const label = element.dataset.expect === 'hide';
      const text = (element.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
      if (label && hidden) result.tp++;
      if (label && !hidden) (result.fn++, result.misses.push(text));
      if (!label && hidden) (result.fp++, result.falsePositives.push(text));
      if (!label && !hidden) result.tn++;
    }
    return result;
  });
}

/** Durations (ms) that blank, still-unjudged cards were on screen. */
export async function blankTimes(page: Page): Promise<number[]> {
  return page.evaluate(
    () => (window as unknown as { __blank: number[] }).__blank,
  );
}

export async function flashes(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __flashes: string[] }).__flashes,
  );
}

export { expect };
