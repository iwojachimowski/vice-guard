import { useState } from 'react';
import { channelKey, parseChannelIdentity } from '../../lib/channel-identity';
import {
  builtInChannels,
  protectedChannels,
} from '../../lib/youtube-channel-filter';
import type { Settings } from '../../lib/settings';

export function ChannelSettings({
  settings,
  ready,
  update,
}: {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
}) {
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const channels = protectedChannels(settings);
  const enabled = channels.filter(
    (channel) => !settings.disabledChannels.includes(channelKey(channel)),
  ).length;
  const query = search.trim().toLowerCase();
  const visibleChannels = channels.filter((channel) =>
    `${channel.name} ${channel.handle ?? ''} ${channel.channelId ?? ''}`
      .toLowerCase()
      .includes(query),
  );

  function addChannel() {
    const identity = parseChannelIdentity(input);
    if (!identity) {
      setError(
        'Enter a YouTube @handle, channel ID, or channel URL. Display names are not supported.',
      );
      return;
    }
    const key = channelKey(identity);
    if (
      channels.some(
        (channel) =>
          channelKey(channel) === key ||
          (identity.handle &&
            channel.handle?.toLowerCase() === identity.handle),
      )
    ) {
      setError('This channel is already in the list.');
      return;
    }
    if (settings.customChannels.length >= 200) {
      setError('You can add up to 200 custom channels.');
      return;
    }
    update({
      customChannels: [...settings.customChannels, { ...identity, name: key }],
    });
    setInput('');
    setError('');
  }

  return (
    <section className="channels">
      <h2>Known Spoiler Channels</h2>
      <label className="experimental">
        <input
          type="checkbox"
          checked={settings.channelProtection}
          disabled={!ready}
          onChange={(event) =>
            update({ channelProtection: event.target.checked })
          }
        />
        Enable channel protection
      </label>
      <p>
        Preventive risk indicators, not a claim that every creator posts
        spoilers.
      </p>
      <label htmlFor="channel-mode">Channel protection</label>
      <select
        id="channel-mode"
        value={settings.channelMode}
        disabled={!ready}
        onChange={(event) =>
          update({ channelMode: event.target.value as Settings['channelMode'] })
        }
      >
        <option value="standard">Standard</option>
        <option value="strict">Strict</option>
      </select>
      <p>
        {settings.channelMode === 'standard'
          ? 'Priority and custom channels: hide GTA 6 uploads. GTA-focused channels: filter GTA 6 story and gameplay more closely.'
          : 'Hide every upload from priority and custom channels, including other games. Hide all GTA 6 uploads from GTA-focused channels.'}
      </p>
      <p>
        {settings.channelProtection && settings.enabled ? enabled : 0} channels
        protected · {channels.length} listed
      </p>
      <details>
        <summary>Manage channels</summary>
        <label htmlFor="channel-search">Search channels</label>
        <input
          id="channel-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ul className="channel-list">
          {visibleChannels.map((channel) => {
            const key = channelKey(channel);
            const custom = !builtInChannels.some(
              (entry) => channelKey(entry) === key,
            );
            return (
              <li key={key}>
                <label className="experimental">
                  <input
                    type="checkbox"
                    disabled={!ready}
                    checked={!settings.disabledChannels.includes(key)}
                    onChange={(event) =>
                      update({
                        disabledChannels: event.target.checked
                          ? settings.disabledChannels.filter((id) => id !== key)
                          : [...settings.disabledChannels, key],
                      })
                    }
                  />
                  <span>
                    {channel.name}
                    <small>
                      {custom
                        ? 'Custom'
                        : channel.group === 'priority'
                          ? 'Priority'
                          : 'GTA-focused'}{' '}
                      · {channel.handle ?? channel.channelId}
                    </small>
                    {channel.channelId && channel.handle && (
                      <small>{channel.channelId}</small>
                    )}
                  </span>
                </label>
                {custom && (
                  <button
                    type="button"
                    disabled={!ready}
                    aria-label={`Remove ${channel.name}`}
                    onClick={() =>
                      update({
                        customChannels: settings.customChannels.filter(
                          (entry) => channelKey(entry) !== key,
                        ),
                        disabledChannels: settings.disabledChannels.filter(
                          (id) => id !== key,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {visibleChannels.length === 0 && <p>No matching channels.</p>}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addChannel();
          }}
        >
          <label htmlFor="custom-channel">Add a YouTube channel</label>
          <input
            id="custom-channel"
            value={input}
            maxLength={200}
            disabled={!ready}
            aria-describedby="channel-help channel-error"
            onChange={(event) => {
              setInput(event.target.value);
              setError('');
            }}
          />
          <p id="channel-help">
            Paste an @handle or /channel/ URL. IDs survive handle changes.
            Nothing is fetched from YouTube.
          </p>
          <button disabled={!ready || !input.trim()} type="submit">
            Add channel
          </button>
          <p id="channel-error" role="alert">
            {error}
          </p>
        </form>
      </details>
      <p>Other spoiler filters still apply when a channel is disabled.</p>
    </section>
  );
}
