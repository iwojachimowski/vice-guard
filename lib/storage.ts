import { browser } from 'wxt/browser';
import { parseSettings, type Settings } from './settings';
import { parseBlocklist, type Blocklist } from './channels';
import { pruneAudit, type AuditEntry } from './audit';

export async function readSettings(): Promise<Settings> {
  const result = await browser.storage.local.get('settings');
  return parseSettings(result.settings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings: parseSettings(settings) });
}

export async function readBlocklist(): Promise<Blocklist> {
  const result = await browser.storage.local.get('channels');
  return parseBlocklist(result.channels);
}

export async function saveBlocklist(list: Blocklist): Promise<void> {
  await browser.storage.local.set({ channels: list });
}

export async function readAudit(): Promise<AuditEntry[]> {
  const result = await browser.storage.local.get('audit');
  return pruneAudit(
    Array.isArray(result.audit) ? (result.audit as AuditEntry[]) : [],
  );
}

export function watchStorage(
  callback: (change: { settings?: Settings; channels?: Blocklist }) => void,
): () => void {
  const listener: Parameters<
    typeof browser.storage.onChanged.addListener
  >[0] = (changes, area) => {
    if (area !== 'local') return;
    if (changes.settings)
      callback({ settings: parseSettings(changes.settings.newValue) });
    if (changes.channels)
      callback({ channels: parseBlocklist(changes.channels.newValue) });
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
