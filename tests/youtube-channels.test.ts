import { describe, expect, it } from 'vitest';
import { parseChannelIdentity, channelKey } from '../lib/channel-identity';
import {
  builtInChannels,
  createChannelFilter,
} from '../lib/youtube-channel-filter';
import { defaults, parseSettings } from '../lib/settings';
import { detect } from '../lib/detector';
import { readText } from '../lib/targets';

const light = { ...defaults, mode: 'light' as const };
function video(href: string, title: string, name = 'Uploader') {
  const element = document.createElement('ytd-video-renderer');
  element.innerHTML = '<h3></h3><ytd-channel-name><a></a></ytd-channel-name>';
  element.querySelector('h3')!.textContent = title;
  element.querySelector('a')!.href = href;
  element.querySelector('a')!.textContent = name;
  return element;
}

describe('YouTube channel identities', () => {
  it('bundles all 41 sources with unique verified IDs and handles', () => {
    expect(builtInChannels).toHaveLength(41);
    expect(new Set(builtInChannels.map(channelKey)).size).toBe(41);
    expect(
      new Set(builtInChannels.map((channel) => channel.handle?.toLowerCase()))
        .size,
    ).toBe(41);
    for (const channel of builtInChannels) {
      expect(parseChannelIdentity(channel.channelId!)).toEqual({
        channelId: channel.channelId,
      });
      expect(parseChannelIdentity(channel.handle!)).toBeTruthy();
      expect(channel.source).toMatch(/^https:\/\/www.youtube.com\//);
      expect(channel.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it.each([
    '@Shirrako',
    'https://www.youtube.com/@Shirrako',
    'https://m.youtube.com/@Shirrako/',
  ])('accepts exact handle %s', (input) => {
    expect(parseChannelIdentity(input)).toEqual({ handle: '@shirrako' });
  });
  it.each([
    'Shirrako',
    'https://youtube.com.evil.test/@Shirrako',
    'https://example.com/@Shirrako',
    '/watch?v=abc',
    '/@Shirrako/videos',
    '@ab',
    '@shirrako other',
  ])('rejects ambiguous or unrelated input %s', (input) => {
    expect(parseChannelIdentity(input)).toBeNull();
  });
  it('migrates existing settings and bounds untrusted channel data', () => {
    const settings = parseSettings({
      mode: 'balanced',
      allowReveal: false,
      keywords: ['custom'],
      customChannels: [
        null,
        {},
        { name: 'x', handle: '@CustomUploader' },
        { handle: '@customuploader' },
        { channelId: 'invented' },
      ],
      disabledChannels: ['@CustomUploader', {}, 'display name'],
      channelMode: 'invalid',
    });
    expect(settings.mode).toBe('balanced');
    expect(settings.allowReveal).toBe(false);
    expect(settings.keywords).toEqual(['custom']);
    expect(settings.channelMode).toBe('standard');
    expect(settings.customChannels).toEqual([
      { name: '@customuploader', handle: '@customuploader' },
    ]);
    expect(settings.disabledChannels).toEqual(['@customuploader']);
  });
});

describe('channel filtering', () => {
  it.each([
    '<div id="channel-name"><a href="/@Shirrako">Shirrako</a></div>',
    '<yt-content-metadata-view-model><div class="yt-content-metadata-view-model__metadata-row"><a href="https://www.youtube.com/@Shirrako">Shirrako</a></div></yt-content-metadata-view-model>',
    '<yt-reel-channel-bar-view-model><a href="/@Shirrako">Shirrako</a></yt-reel-channel-bar-view-model>',
    '<a class="ytReelChannelBarViewModelChannelName" href="/@Shirrako">Shirrako</a>',
  ])(
    'reads uploader metadata from legacy and current card layouts',
    (owner) => {
      const element = document.createElement('yt-lockup-view-model');
      element.innerHTML = `<h3>GTA 6 first look</h3>${owner}`;
      expect(createChannelFilter(light)(element, readText(element))).toBe(true);
    },
  );
  it('keeps priority protection scoped to GTA 6 in Standard', () => {
    const filter = createChannelFilter(light);
    expect(
      filter(video('/@Shirrako', 'GTA VI first look'), 'GTA VI first look'),
    ).toBe(true);
    expect(
      filter(video('/@Shirrako', 'Other game ending'), 'Other game ending'),
    ).toBe(false);
  });
  it('tightens secondary filtering without turning GTA creator names into game context', () => {
    const filter = createChannelFilter(light);
    expect(
      filter(video('/@DarkViperAU', 'GTA 6 walkthrough'), 'GTA 6 walkthrough'),
    ).toBe(true);
    const unrelated = video(
      '/@GTAVI-oclock',
      'GTA 5 retrospective',
      'GTA VI O’Clock',
    );
    unrelated
      .querySelector('ytd-channel-name')!
      .setAttribute('title', 'GTA VI O’Clock');
    expect(filter(unrelated, readText(unrelated))).toBe(false);
    expect(detect(readText(unrelated), defaults)).toBe(false);
    expect(
      filter(
        video('/@DarkViperAU', 'GTA 6 release date'),
        'GTA 6 release date',
      ),
    ).toBe(false);
  });
  it('Strict blocks priority uploads completely but keeps secondary filtering GTA 6-specific', () => {
    const filter = createChannelFilter({ ...light, channelMode: 'strict' });
    expect(filter(video('/@Shirrako', 'Other game'), 'Other game')).toBe(true);
    expect(filter(video('/@DarkViperAU', 'Other game'), 'Other game')).toBe(
      false,
    );
    expect(
      filter(
        video('/@DarkViperAU', 'GTA 6 release date'),
        'GTA 6 release date',
      ),
    ).toBe(true);
  });
  it('does not match display names, lookalikes, or description links', () => {
    const filter = createChannelFilter({ ...light, channelMode: 'strict' });
    expect(
      filter(
        video('/@ShirrakoClips', 'GTA 6 first look', 'Shirrako'),
        'GTA 6 first look',
      ),
    ).toBe(false);
    const unrelated = video('/@SomeoneElse', 'GTA 6 first look');
    unrelated.innerHTML +=
      '<div id="description"><ytd-channel-name><a href="/@Shirrako">Shirrako</a></ytd-channel-name></div>';
    expect(filter(unrelated, 'GTA 6 first look')).toBe(false);
  });
  it('uses IDs ahead of handles and supports ID-only uploader links', () => {
    const channel = builtInChannels[0]!;
    const filter = createChannelFilter(light);
    expect(
      filter(
        video(`/channel/${channel.channelId}`, 'GTA 6 first look'),
        'GTA 6 first look',
      ),
    ).toBe(true);
    const mismatch = video('/@Shirrako', 'GTA 6 first look');
    mismatch.querySelector('ytd-channel-name')!.innerHTML +=
      '<a href="/channel/UCaaaaaaaaaaaaaaaaaaaaaa">Other</a>';
    expect(filter(mismatch, 'GTA 6 first look')).toBe(false);
  });
  it('supports custom channels, per-channel exclusions and the global toggles', () => {
    const element = video('/@CustomUploader', 'GTA 6 first look');
    const settings = parseSettings({
      ...light,
      customChannels: [{ handle: '@CustomUploader' }],
    });
    expect(createChannelFilter(settings)(element, 'GTA 6 first look')).toBe(
      true,
    );
    for (const patch of [
      { enabled: false },
      { channelProtection: false },
      { disabledChannels: ['@customuploader'] },
    ])
      expect(
        createChannelFilter({ ...settings, ...patch })(
          element,
          'GTA 6 first look',
        ),
      ).toBe(false);
  });
  it.each([
    'GTA 6 all cutscenes',
    'GTA VI final mission',
    'GTA 6 character deaths',
    'GTA 6 betrayals',
    'GTA VI secret ending',
  ])('catches unknown-channel spoiler title %s in Light', (title) => {
    expect(detect(title, light)).toBe(true);
    expect(detect(title.replace(/GTA (?:6|VI)/, 'GTA 5'), light)).toBe(false);
  });
});
