import { renderThumbs } from '../eval/thumbs';

// The YouTube fixtures serve each example's rendered thumbnail. They are a
// gitignored cache, so render any that are missing before the tests run.
export default async function globalSetup() {
  const rendered = await renderThumbs();
  if (rendered) console.log(`Rendered ${rendered} eval thumbnails.`);
}
