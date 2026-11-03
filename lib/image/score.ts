/**
 * Zero-shot CLIP scoring against prompt embeddings computed at build time
 * (scripts/clip-prompts.ts), so the text model never ships.
 */
export interface PromptEmbeddings {
  model: string;
  logitScale: number;
  positive: { prompt: string; embedding: number[] }[];
  negative: { prompt: string; embedding: number[] }[];
}

export function normalizeVector(vector: ArrayLike<number>): number[] {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i]! * vector[i]!;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (value) => value / norm);
}

/** Probability mass the image puts on the GTA 6 prompts (0-1). */
export function gtaProbability(
  imageEmbedding: ArrayLike<number>,
  prompts: PromptEmbeddings,
): number {
  const image = normalizeVector(imageEmbedding);
  const logits = [...prompts.positive, ...prompts.negative].map(
    ({ embedding }) =>
      prompts.logitScale *
      embedding.reduce((sum, value, i) => sum + value * image[i]!, 0),
  );
  const max = Math.max(...logits);
  const exp = logits.map((logit) => Math.exp(logit - max));
  const total = exp.reduce((a, b) => a + b, 0);
  return (
    exp.slice(0, prompts.positive.length).reduce((a, b) => a + b, 0) / total
  );
}

export const positivePrompts = [
  'a screenshot of Grand Theft Auto VI',
  'a Grand Theft Auto VI trailer still',
  'Vice City at night, neon lights, from the video game GTA 6',
  'Jason and Lucia, the protagonists of GTA 6',
  'GTA VI key art by Rockstar Games',
  'a YouTube thumbnail about GTA 6',
  'a sunny Leonida beach in the video game GTA 6',
  'a GTA 6 gameplay screenshot with a car chase in Florida',
];
export const negativePrompts = [
  'a screenshot of Grand Theft Auto V in Los Santos',
  'a screenshot of Red Dead Redemption 2',
  'a photo of Miami Beach',
  'a photo of a real city at night',
  'a screenshot of a video game',
  'a YouTube thumbnail',
  'a photo of a person',
  'a cartoon or anime',
  'text on a plain background',
  'a screenshot of a website or app',
  'a meme',
  'a photo of food',
  'a sports photo',
  'a Minecraft or Fortnite screenshot',
  'a photo of a car',
  'a photo of nature',
];
