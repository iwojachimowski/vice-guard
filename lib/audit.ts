import type { HiddenEntry } from './engine/engine';

export interface AuditEntry extends HiddenEntry {
  time: number;
  page: string;
}

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;

export function pruneAudit(
  entries: AuditEntry[],
  now = Date.now(),
): AuditEntry[] {
  return entries
    .filter((entry) => now - entry.time < RETENTION_MS)
    .slice(-MAX_ENTRIES);
}
