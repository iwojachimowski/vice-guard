/**
 * Rows of black bars above and below the picture. YouTube's hqdefault.jpg
 * is 4:3, so a 16:9 video arrives with a quarter of it black; reading those
 * rows costs OCR and CLIP time for nothing. Input is RGBA.
 */
export function letterbox(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): { top: number; bottom: number } {
  const dark = (y: number) => {
    // JPEG noise keeps bars from being pure black; sample every 4th pixel.
    let sum = 0;
    let max = 0;
    let count = 0;
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const value = (rgba[i]! + rgba[i + 1]! + rgba[i + 2]!) / 3;
      sum += value;
      max = Math.max(max, value);
      count++;
    }
    return sum / count < 20 && max < 60;
  };
  let top = 0;
  while (top < height / 3 && dark(top)) top++;
  let bottom = 0;
  while (bottom < height / 3 && dark(height - 1 - bottom)) bottom++;
  // Only real bars: a few dark rows are just a dark picture edge.
  if (top < height * 0.05) top = 0;
  if (bottom < height * 0.05) bottom = 0;
  return { top, bottom };
}
