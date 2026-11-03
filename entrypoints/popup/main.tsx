import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { AuditEntry } from '../../lib/audit';
import type { Blocklist, ChannelEntry } from '../../lib/channels';
import type { EngineStatus } from '../../lib/messages';
import {
  defaults,
  parseSettings,
  type Mode,
  type Settings,
} from '../../lib/settings';
import {
  readAudit,
  readBlocklist,
  readSettings,
  saveBlocklist,
  saveSettings,
  watchStorage,
} from '../../lib/storage';
import './style.css';

const modes: { value: Mode; title: string; detail: string }[] = [
  { value: 'light', title: 'Light', detail: 'Explicit spoilers only' },
  {
    value: 'balanced',
    title: 'Balanced',
    detail: 'Characters, story and gameplay',
  },
  { value: 'strict', title: 'Strict', detail: 'All GTA 6 mentions' },
];
type Tab = 'settings' | 'blocklist' | 'log';

function Toggle(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <label className="toggle">
        <input
          type="checkbox"
          aria-label={props.label}
          disabled={props.disabled}
          checked={props.checked}
          onChange={(event) => props.onChange(event.target.checked)}
        />
        {props.label}
      </label>
      {props.children && <p>{props.children}</p>}
    </section>
  );
}

function SettingsTab({
  ready,
  settings,
  update,
}: {
  ready: boolean;
  settings: Settings;
  update(patch: Partial<Settings>): void;
}) {
  const [keywordText, setKeywordText] = useState(settings.keywords.join('\n'));
  const [engine, setEngine] = useState<EngineStatus>();
  useEffect(
    () => setKeywordText(settings.keywords.join('\n')),
    [settings.keywords],
  );
  useEffect(() => {
    void browser.runtime
      .sendMessage({ type: 'vg:status' })
      .then((value) =>
        setEngine((value as { engine: EngineStatus } | undefined)?.engine),
      )
      .catch(() => undefined);
  }, []);
  return (
    <>
      <fieldset disabled={!ready}>
        <legend>Filtering</legend>
        {modes.map((mode) => (
          <label className="mode" key={mode.value}>
            <input
              type="radio"
              name="mode"
              checked={settings.mode === mode.value}
              onChange={() => update({ mode: mode.value })}
            />
            <span>
              {mode.title}
              {mode.value === 'strict' && (
                <span className="recommendation">Recommended</span>
              )}
              <small>{mode.detail}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <Toggle
        label="Scan images"
        disabled={!ready}
        checked={settings.imageLayer}
        onChange={(imageLayer) => update({ imageLayer })}
      >
        Reads thumbnail text and recognises GTA 6 imagery on this device. Cards
        stay blank until checked and are removed if no verdict arrives in 10 s.
        {engine && settings.imageLayer && (
          <span className="engine">
            {' '}
            OCR: {engine.ocr} · CLIP: {engine.clip}
          </span>
        )}
      </Toggle>
      <Toggle
        label="Wait for image recognition"
        disabled={!ready || !settings.imageLayer}
        checked={settings.waitForClip}
        onChange={(waitForClip) => update({ waitForClip })}
      >
        On: cards stay blank until the image model has checked them too
        (strictest). Off: cards show once their title and thumbnail text are
        clean, about twice as fast; the image model keeps checking and removes a
        card if it recognises GTA 6, so a thumbnail may show for a moment.
      </Toggle>
      <section>
        <label htmlFor="threshold">
          Image sensitivity <output>{settings.clipThreshold.toFixed(2)}</output>
        </label>
        <input
          id="threshold"
          type="range"
          min={0.2}
          max={0.95}
          step={0.05}
          disabled={!ready || !settings.imageLayer}
          value={settings.clipThreshold}
          onChange={(event) =>
            update({ clipThreshold: Number(event.target.value) })
          }
        />
        <p>Lower hides more images (more false positives).</p>
      </section>
      <Toggle
        label="Show hidden count on icon"
        disabled={!ready}
        checked={settings.showBadge}
        onChange={(showBadge) => update({ showBadge })}
      />
      <Toggle
        label="Spoiler-free browsing (experimental)"
        disabled={!ready}
        checked={settings.spoilerFree}
        onChange={(spoilerFree) => update({ spoilerFree })}
      >
        Allow GTA 6 titles without explicit spoiler signals. Thumbnails can
        still contain spoilers.
      </Toggle>
      <section>
        <label htmlFor="keywords">Your keywords</label>
        <p>One phrase per line. Only matched with GTA 6 content.</p>
        <textarea
          id="keywords"
          rows={3}
          maxLength={24000}
          disabled={!ready}
          value={keywordText}
          onChange={(event) => setKeywordText(event.target.value)}
        />
        <button
          disabled={!ready}
          onClick={() => update({ keywords: keywordText.split('\n') })}
        >
          Save keywords
        </button>
      </section>
    </>
  );
}

function BlocklistTab() {
  const [list, setList] = useState<Blocklist>({});
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState('');
  useEffect(() => {
    void readBlocklist().then(setList);
    return watchStorage(
      (change) => change.channels && setList(change.channels),
    );
  }, []);
  const entries = useMemo(
    () =>
      Object.values(list)
        .filter((entry) => entry.blocked || entry.origin === 'user')
        .filter((entry) =>
          `${entry.name} ${entry.key}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(b.blocked) - Number(a.blocked) ||
            a.name.localeCompare(b.name),
        ),
    [list, filter],
  );
  function set(entry: ChannelEntry, blocked: boolean) {
    const next = {
      ...list,
      [entry.key]: {
        ...entry,
        blocked,
        origin: 'user' as const,
        updated: Date.now(),
      },
    };
    setList(next);
    void saveBlocklist(next);
  }
  function add() {
    const value = adding.trim();
    const match = /^(?:r\/)([\w]+)$/i.exec(value)
      ? `reddit:r/${value.slice(2).toLowerCase()}`
      : /^@[\w.-]+$/.test(value)
        ? `youtube:${value.toLowerCase()}`
        : /^x:@\w{1,15}$/i.test(value)
          ? value.toLowerCase()
          : undefined;
    if (!match) return;
    set(
      {
        key: match,
        name: value,
        blocked: true,
        origin: 'user',
        history: [],
        updated: 0,
      },
      true,
    );
    setAdding('');
  }
  return (
    <>
      <p>
        Every card from these accounts is hidden. A source is added
        automatically once 60% or more of at least 5 recent titles seen from it
        were GTA 6 content.
      </p>
      <div className="row">
        <input
          aria-label="Add a channel or subreddit"
          placeholder="@channel, r/subreddit or x:@handle"
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
        />
        <button onClick={add}>Block</button>
      </div>
      <input
        aria-label="Filter blocklist"
        placeholder="Filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <ul className="list">
        {entries.map((entry) => (
          <li key={entry.key}>
            <span>
              {entry.name}
              <small>
                {entry.key.split(':')[0]} · {entry.origin}
                {entry.history.length > 0 &&
                  ` · ${entry.history.filter(Boolean).length}/${entry.history.length} GTA`}
              </small>
            </span>
            <button onClick={() => set(entry, !entry.blocked)}>
              {entry.blocked ? 'Unblock' : 'Block'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function LogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [site, setSite] = useState('all');
  useEffect(() => {
    const load = () =>
      void readAudit().then((value) => setEntries(value.reverse()));
    load();
    const listener = (changes: Record<string, unknown>, area: string) =>
      area === 'local' && 'audit' in changes && load();
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);
  const sites = [...new Set(entries.map((entry) => entry.site))];
  const shown = entries
    .filter((entry) => site === 'all' || entry.site === site)
    .slice(0, 300);
  return (
    <>
      <p>Everything hidden in the last 7 days, stored only on this device.</p>
      <div className="row">
        <select
          aria-label="Filter log by site"
          value={site}
          onChange={(event) => setSite(event.target.value)}
        >
          <option value="all">All sites ({entries.length})</option>
          {sites.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            void browser.storage.local
              .set({ audit: [] })
              .then(() => setEntries([]))
          }
        >
          Clear log
        </button>
      </div>
      <ul className="list log">
        {shown.map((entry, index) => (
          <li key={`${entry.time}-${index}`}>
            <span>
              {entry.title || '(no text)'}
              <small>
                {entry.site} · {entry.layer} · {entry.rule} ·{' '}
                {new Date(entry.time).toLocaleString()}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function App() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<Tab>('settings');
  const current = useRef(defaults);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    readSettings()
      .then((value) => {
        current.current = value;
        setSettings(value);
        setReady(true);
      })
      .catch(() =>
        setMessage('Could not load settings. Reopen the extension to retry.'),
      );
  }, []);

  function update(patch: Partial<Settings>) {
    const next = parseSettings({ ...current.current, ...patch });
    current.current = next;
    setSettings(next);
    writes.current = writes.current
      .then(() => saveSettings(next))
      .then(() => setMessage('Saved.'))
      .catch(() => setMessage('Could not save. Please try again.'));
  }

  return (
    <main>
      <header>
        <h1>Vice Guard</h1>
        <span>GTA 6 spoiler filter</span>
      </header>
      <label className="enabled">
        <input
          type="checkbox"
          aria-label="Enable spoiler protection"
          disabled={!ready}
          checked={settings.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        Enable protection
      </label>
      <nav role="tablist">
        {(['settings', 'blocklist', 'log'] as const).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
          >
            {name === 'settings'
              ? 'Settings'
              : name === 'blocklist'
                ? 'Blocklist'
                : 'Hidden log'}
          </button>
        ))}
      </nav>
      {tab === 'settings' && (
        <SettingsTab ready={ready} settings={settings} update={update} />
      )}
      {tab === 'blocklist' && <BlocklistTab />}
      {tab === 'log' && <LogTab />}
      <footer>
        <span role="status">{message}</span>
        Runs locally. No tracking or page data sent anywhere.
        <span className="build">Build {__BUILD__}</span>
      </footer>
    </main>
  );
}

declare const __BUILD__: string;

createRoot(document.getElementById('root')!).render(<App />);
