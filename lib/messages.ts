import type { AuditEntry } from './audit';
import type { Observation } from './channels';
import type { ImageResult } from './engine/engine';

/** Content script → background. */
export type ContentMessage =
  | { type: 'vg:count'; count: number }
  | { type: 'vg:health'; broken: boolean; site: string }
  | { type: 'vg:audit'; entries: AuditEntry[] }
  | { type: 'vg:sources'; observations: Observation[] }
  | { type: 'vg:image'; url: string }
  /** CLIP's verdict for an image whose vg:image answer had clipPending. */
  | { type: 'vg:clip'; url: string }
  /** These images' cards are now on screen: analyse them before prefetches. */
  | { type: 'vg:prioritize'; urls: string[] };

/** Background → offscreen document. */
export type OffscreenMessage =
  | { target: 'offscreen'; type: 'vg:analyze'; url: string }
  | { target: 'offscreen'; type: 'vg:clip'; url: string }
  | { target: 'offscreen'; type: 'vg:prioritize'; urls: string[] };
export type OffscreenStatus = {
  target: 'background';
  type: 'vg:engine';
  status: EngineStatus;
};

export interface EngineStatus {
  ocr: 'loading' | 'ready' | 'error';
  clip: 'loading' | 'ready' | 'error';
  error?: string;
  /** Milliseconds from offscreen start until each model was ready. */
  ocrReadyMs?: number;
  clipReadyMs?: number;
}

export type { ImageResult };
