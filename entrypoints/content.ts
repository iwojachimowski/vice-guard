import { defineContentScript } from 'wxt/utils/define-content-script';
import { startScanner } from '../lib/scanner';
import { readSettings, watchSettings } from '../lib/storage';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  async main(ctx) {
    const settings = await readSettings();
    if (ctx.isInvalid) return;
    const scanner = startScanner(settings);
    const unwatch = watchSettings((settings) => scanner.update(settings));
    ctx.onInvalidated(() => {
      unwatch();
      scanner.stop();
    });
  },
});
