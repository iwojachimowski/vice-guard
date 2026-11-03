import type { Settings } from './settings';
import { classify } from './match/matcher';

export { normalize } from './match/normalize';
export { classify, type Verdict, type Layer } from './match/matcher';

export function detect(text: string, settings: Settings): boolean {
  return classify(text, settings).hit;
}
