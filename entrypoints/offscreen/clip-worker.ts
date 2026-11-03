import { loadClip } from '../../lib/image/clip-model';
import type { PromptEmbeddings } from '../../lib/image/score';
import prompts from '../../lib/image/prompts.json';

// Runs CLIP in its own thread; requests are handled one at a time.
const ready = loadClip(
  new URL('/', self.location.href).href,
  prompts as PromptEmbeddings,
);
ready.then(
  () => self.postMessage({ type: 'ready' }),
  (error: unknown) => self.postMessage({ type: 'error', error: String(error) }),
);

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; pixels: ImageData }>) => {
  const { id, pixels } = event.data;
  queue = queue.then(async () => {
    try {
      const score = await (await ready)(pixels);
      self.postMessage({ type: 'result', id, score });
    } catch (error) {
      self.postMessage({ type: 'result', id, error: String(error) });
    }
  });
};
