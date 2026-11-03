import { describe, expect, it } from 'vitest';
import { letterbox } from '../lib/image/letterbox';

function image(width: number, height: number, bar: number, value = 128) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inBar = y < bar || y >= height - bar;
      // JPEG-like noise in the bars.
      rgba[i] = rgba[i + 1] = rgba[i + 2] = inBar ? (x * 7 + y) % 9 : value;
      rgba[i + 3] = 255;
    }
  return rgba;
}

describe('letterbox', () => {
  it('finds the bars of a 16:9 video in a 4:3 thumbnail', () => {
    expect(letterbox(image(480, 360, 45), 480, 360)).toEqual({
      top: 45,
      bottom: 45,
    });
  });
  it('leaves full-frame thumbnails alone', () => {
    expect(letterbox(image(480, 360, 0), 480, 360)).toEqual({
      top: 0,
      bottom: 0,
    });
  });
  it('ignores a few dark edge rows', () => {
    expect(letterbox(image(480, 360, 6), 480, 360)).toEqual({
      top: 0,
      bottom: 0,
    });
  });
  it('never crops a dark picture away', () => {
    const { top, bottom } = letterbox(image(480, 360, 0, 5), 480, 360);
    expect(360 - top - bottom).toBeGreaterThanOrEqual(120);
  });
});
