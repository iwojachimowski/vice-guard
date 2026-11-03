import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  defaults,
  parseSettings,
  type Mode,
  type Settings,
} from '../../lib/settings';
import { readSettings, saveSettings } from '../../lib/storage';
import './style.css';
import { ChannelSettings } from './channels';

const modes: { value: Mode; title: string; detail: string }[] = [
  { value: 'light', title: 'Light', detail: 'Explicit spoilers only' },
  {
    value: 'balanced',
    title: 'Balanced',
    detail: 'Characters, story and gameplay',
  },
  { value: 'strict', title: 'Strict', detail: 'All GTA 6 mentions' },
];

function App() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [keywordText, setKeywordText] = useState('');
  const currentSettings = useRef(defaults);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    readSettings()
      .then((value) => {
        if (!active) return;
        currentSettings.current = value;
        setSettings(value);
        setKeywordText(value.keywords.join('\n'));
        setReady(true);
      })
      .catch(() => {
        setFailed(true);
        setMessage('Could not load settings. Reopen the extension to retry.');
      });
    return () => {
      active = false;
    };
  }, []);

  function update(patch: Partial<Settings>) {
    const next = parseSettings({ ...currentSettings.current, ...patch });
    currentSettings.current = next;
    setSettings(next);
    if (patch.keywords) setKeywordText(next.keywords.join('\n'));
    setMessage('');
    writes.current = writes.current
      .then(() => saveSettings(next))
      .then(() => {
        setFailed(false);
        setMessage('Saved.');
      })
      .catch(() => {
        setFailed(true);
        setMessage('Could not save. Please try again.');
      });
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
      <section>
        <label className="experimental">
          <input
            type="checkbox"
            disabled={!ready}
            checked={settings.allowReveal}
            onChange={(event) => update({ allowReveal: event.target.checked })}
          />
          Allow click-to-reveal
        </label>
        <p>
          Turn off to prevent accidental reveals. Blocked content stays hidden
          until you change settings or turn protection off.
        </p>
      </section>
      <section>
        <label className="experimental">
          <input
            type="checkbox"
            disabled={!ready}
            checked={settings.spoilerFree}
            onChange={(event) => update({ spoilerFree: event.target.checked })}
          />
          <span>
            Spoiler-free browsing <small>Experimental</small>
          </span>
        </label>
        <p>
          Allow GTA 6 titles without explicit spoiler signals. Video and images
          may still contain spoilers.
        </p>
      </section>
      <section>
        <label htmlFor="keywords">Your keywords</label>
        <p>One phrase per line. Only matched with GTA 6 content.</p>
        <textarea
          id="keywords"
          rows={3}
          maxLength={24000}
          disabled={!ready}
          value={keywordText}
          onChange={(event) => {
            setKeywordText(event.target.value);
            setMessage('');
          }}
        />
        <div className="save-row">
          <button
            disabled={!ready}
            onClick={() => update({ keywords: keywordText.split('\n') })}
          >
            Save keywords
          </button>
          <span role="status" className={failed ? 'error' : ''}>
            {message}
          </span>
        </div>
      </section>
      <ChannelSettings settings={settings} ready={ready} update={update} />
      <footer>Runs locally. No tracking or network requests.</footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
