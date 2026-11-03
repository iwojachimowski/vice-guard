// Copies the local OCR and CLIP runtime files into public/ before a build:
// `npm run assets`. Nothing here is fetched from a CDN at runtime.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { VISION_FILE } from '../lib/image/clip-files';
import { dirname, join } from 'node:path';

// Some packages do not export package.json, so resolve their folders directly.
const packageDir = (name: string) => join('node_modules', name);

const copies: [from: string, to: string][] = [
  [
    join(packageDir('tesseract.js'), 'dist/worker.min.js'),
    'public/tesseract/worker.min.js',
  ],
  [
    join(packageDir('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'),
    'public/tesseract/tesseract-core-simd-lstm.wasm.js',
  ],
  [
    join(
      packageDir('@tesseract.js-data/eng'),
      '4.0.0_best_int/eng.traineddata.gz',
    ),
    'public/tesseract/eng.traineddata.gz',
  ],
  // The plain (non-WebGPU) build: 14 MB instead of 27 MB.
  [
    join(packageDir('onnxruntime-web'), 'dist/ort-wasm-simd-threaded.wasm'),
    'public/ort/ort-wasm-simd-threaded.wasm',
  ],
  [
    join(packageDir('onnxruntime-web'), 'dist/ort-wasm-simd-threaded.mjs'),
    'public/ort/ort-wasm-simd-threaded.mjs',
  ],
];

for (const [from, to] of copies) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

const model = 'public/models/mobileclip_s0';
// Only the shipped encoder may be in public/, or it is bundled too.
for (const file of readdirSync(join(model, 'onnx')))
  if (file !== VISION_FILE) rmSync(join(model, 'onnx', file));
for (const file of [
  'config.json',
  'preprocessor_config.json',
  `onnx/${VISION_FILE}`,
])
  if (!existsSync(join(model, file)))
    throw new Error(
      `Missing ${join(model, file)}. Run \`npm run model\` once to download it.`,
    );
console.log('Copied OCR and CLIP runtime assets into public/.');
