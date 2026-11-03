import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

export const test = base.extend<{
  extension: {
    context: BrowserContext;
    popup: Page;
    restart: () => Promise<{ context: BrowserContext; popup: Page }>;
  };
}>({
  extension: async ({}, use) => {
    const extensionPath = path.resolve('.output/chrome-mv3');
    const prefix = path.join(tmpdir(), 'vice-guard-test-');
    const profile = await mkdtemp(prefix);
    let context: BrowserContext | undefined;
    const errors: Error[] = [];
    async function launch() {
      const launched = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      });
      context = launched;
      launched.on('weberror', (event) => errors.push(event.error()));
      const manager = await launched.newPage();
      await manager.goto('chrome://extensions');
      const id = await manager
        .locator('extensions-item')
        .first()
        .getAttribute('id');
      expect(id).toBeTruthy();
      await manager.close();
      const popup = await launched.newPage();
      await popup.setViewportSize({ width: 350, height: 700 });
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await expect(
        popup.getByRole('checkbox', { name: 'Enable spoiler protection' }),
      ).toBeEnabled();
      return { context: launched, popup };
    }
    try {
      const initial = await launch();
      await use({
        ...initial,
        restart: async () => {
          await context?.close();
          return launch();
        },
      });
      expect(errors).toEqual([]);
    } finally {
      await context?.close();
      if (path.resolve(profile).startsWith(path.resolve(prefix)))
        await rm(profile, { recursive: true, force: true });
    }
  },
});

export async function openPage(
  context: BrowserContext,
  html: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.route('http://vice-guard.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html>${html}` }),
  );
  await page.goto('http://vice-guard.test/');
  return page;
}

export { expect };
