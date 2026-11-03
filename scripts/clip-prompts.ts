// One-time developer step: `npm run model`.
// Downloads MobileCLIP-S0 from Hugging Face into public/models (vision encoder
// only is shipped) and precomputes the prompt text embeddings, so the text
// model never ships and the extension makes no model requests at runtime.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AutoTokenizer,
  CLIPTextModelWithProjection,
  env,
} from '@huggingface/transformers';
import { VISION_FILE } from '../lib/image/clip-files';
import {
  negativePrompts,
  normalizeVector,
  positivePrompts,
} from '../lib/image/score';

const repo = 'Xenova/mobileclip_s0';
const out = 'public/models/mobileclip_s0';
env.cacheDir = '.model-cache';

// The int8 builds (vision_model_quantized / _int8 / _uint8) are broken for
// this model: their image embeddings barely relate to the text ones (a music
// video thumbnail matched "a photo of a cat" best). fp16 matches fp32 to
// three decimals at half the size and runs on onnxruntime-web's CPU backend.
for (const file of [
  'config.json',
  'preprocessor_config.json',
  `onnx/${VISION_FILE}`,
]) {
  const target = join(out, file);
  if (existsSync(target)) continue;
  const response = await fetch(
    `https://huggingface.co/${repo}/resolve/main/${file}`,
  );
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded ${target}`);
}

// prompts.json is committed. Only rewrite it when the prompts or the text
// model changed, so running this step never leaves a local change behind
// (which would block git pull).
const TEXT_DTYPE = 'fp32';
const promptsFile = 'lib/image/prompts.json';
const current = existsSync(promptsFile)
  ? (JSON.parse(readFileSync(promptsFile, 'utf8')) as {
      model?: string;
      textDtype?: string;
      positive?: { prompt: string }[];
      negative?: { prompt: string }[];
    })
  : {};
const same = (list: { prompt: string }[] | undefined, prompts: string[]) =>
  JSON.stringify(list?.map((entry) => entry.prompt)) ===
  JSON.stringify(prompts);
if (
  current.model === repo &&
  current.textDtype === TEXT_DTYPE &&
  same(current.positive, positivePrompts) &&
  same(current.negative, negativePrompts)
) {
  console.log(`${promptsFile} is up to date.`);
  process.exit(0);
}

const tokenizer = await AutoTokenizer.from_pretrained(repo);
// Build time only, so the full-precision text model costs nothing to ship.
const model = await CLIPTextModelWithProjection.from_pretrained(repo, {
  dtype: TEXT_DTYPE,
});
async function embed(prompts: string[]) {
  const inputs = tokenizer(prompts, {
    padding: 'max_length',
    truncation: true,
  });
  const { text_embeds } = (await model(inputs)) as {
    text_embeds: { data: Float32Array; dims: number[] };
  };
  const size = text_embeds.dims[1]!;
  return prompts.map((prompt, i) => ({
    prompt,
    embedding: normalizeVector(
      text_embeds.data.slice(i * size, (i + 1) * size),
    ).map((value) => Math.round(value * 1e5) / 1e5),
  }));
}
writeFileSync(
  'lib/image/prompts.json',
  `${JSON.stringify({
    model: repo,
    textDtype: TEXT_DTYPE,
    logitScale: 100,
    positive: await embed(positivePrompts),
    negative: await embed(negativePrompts),
  })}\n`,
);
console.log('Wrote lib/image/prompts.json');
