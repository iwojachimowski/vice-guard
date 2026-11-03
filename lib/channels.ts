import type { Source } from './sites';

export type Origin = 'seed' | 'auto' | 'user';
export interface ChannelEntry {
  key: string;
  name: string;
  blocked: boolean;
  origin: Origin;
  /** Verdicts (1 = GTA) for the most recent distinct titles from this source. */
  history: number[];
  updated: number;
}
export type Blocklist = Record<string, ChannelEntry>;

/** Auto-block once at least this many recent titles were seen... */
export const MIN_SEEN = 5;
/** ...and at least this share of them were GTA 6 content. */
export const BLOCK_SHARE = 0.6;
export const WINDOW = 10;

// Accounts that post GTA content almost exclusively. Editable in the popup.
const seeds: [string, string][] = [
  ['youtube:@rockstargames', 'Rockstar Games'],
  ['youtube:name:rockstar games', 'Rockstar Games'],
  ['youtube:@gtaseriesvideos', 'GTA Series Videos'],
  ['youtube:@tgg', 'TGG'],
  ['reddit:r/gta6', 'r/GTA6'],
  ['reddit:r/gta', 'r/GTA'],
  ['reddit:r/gtavi', 'r/GTAVI'],
  ['reddit:r/rockstar', 'r/rockstar'],
  ['x:@rockstargames', '@RockstarGames'],
  ['x:@rockstarsupport', '@RockstarSupport'],
  ['x:@rockstarnorth', '@RockstarNorth'],
];

export function seedBlocklist(now = Date.now()): Blocklist {
  return Object.fromEntries(
    seeds.map(([key, name]) => [
      key,
      { key, name, blocked: true, origin: 'seed', history: [], updated: now },
    ]),
  );
}

export function parseBlocklist(value: unknown): Blocklist {
  if (!value || typeof value !== 'object') return seedBlocklist();
  const list: Blocklist = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const entry = raw as Partial<ChannelEntry> | null;
    if (!entry || typeof entry !== 'object') continue;
    list[key] = {
      key,
      name: typeof entry.name === 'string' ? entry.name : key,
      blocked: entry.blocked === true,
      origin:
        entry.origin === 'seed' || entry.origin === 'user'
          ? entry.origin
          : 'auto',
      history: Array.isArray(entry.history)
        ? entry.history.filter((n) => n === 0 || n === 1).slice(-WINDOW)
        : [],
      updated: typeof entry.updated === 'number' ? entry.updated : 0,
    };
  }
  return list;
}

export interface Observation {
  source: Source;
  hits: number[];
}

/**
 * Merges observed verdicts into the list and blocks sources whose recent
 * titles are mostly GTA 6. Entries the user set by hand never change.
 */
export function learn(
  list: Blocklist,
  observations: Observation[],
  now = Date.now(),
) {
  const added: ChannelEntry[] = [];
  for (const { source, hits } of observations) {
    const entry = (list[source.key] ??= {
      key: source.key,
      name: source.name,
      blocked: false,
      origin: 'auto',
      history: [],
      updated: now,
    });
    if (entry.origin === 'user') continue;
    entry.history = [...entry.history, ...hits].slice(-WINDOW);
    entry.updated = now;
    const share =
      entry.history.reduce((a, b) => a + b, 0) / entry.history.length;
    if (
      !entry.blocked &&
      entry.history.length >= MIN_SEEN &&
      share >= BLOCK_SHARE
    ) {
      entry.blocked = true;
      added.push(entry);
    }
  }
  // Forget sources that never became interesting, to bound storage.
  const entries = Object.values(list);
  if (entries.length > 3000)
    for (const entry of entries
      .filter((e) => !e.blocked && e.origin === 'auto')
      .sort((a, b) => a.updated - b.updated)
      .slice(0, entries.length - 3000))
      delete list[entry.key];
  return added;
}
