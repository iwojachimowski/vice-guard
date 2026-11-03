import database from './youtube-channels.json';
import {
  channelKey,
  parseChannelIdentity,
  type ChannelIdentity,
} from './channel-identity';
import { detect, hasGtaContext } from './detector';
import type { Settings } from './settings';

export interface YouTubeChannel extends ChannelIdentity {
  name: string;
  group: 'priority' | 'secondary';
  source?: string;
  verifiedAt?: string;
}

export const builtInChannels: YouTubeChannel[] = database as YouTubeChannel[];
export const youtubeVideoSelector = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-reel-item-renderer',
  'ytd-reel-video-renderer',
  'yt-lockup-view-model',
  'ytm-shorts-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
].join(',');

// Only uploader links count: links in descriptions and comments may name other channels.
const ownerSelector = [
  '#channel-name a[href]',
  'ytd-channel-name a[href]',
  '.yt-content-metadata-view-model__metadata-row:first-child a[href]',
  'yt-reel-channel-bar-view-model a[href]',
  '.ytReelChannelBarViewModelChannelName a[href]',
  'a.ytReelChannelBarViewModelChannelName[href]',
].join(',');

export function protectedChannels(settings: Settings): YouTubeChannel[] {
  const channels = new Map(
    builtInChannels.map((channel) => [channelKey(channel), channel]),
  );
  for (const channel of settings.customChannels) {
    const existing = builtInChannels.find(
      (entry) =>
        (channel.channelId && channel.channelId === entry.channelId) ||
        (channel.handle &&
          channel.handle.toLowerCase() === entry.handle?.toLowerCase()),
    );
    if (!existing)
      channels.set(channelKey(channel), { ...channel, group: 'priority' });
  }
  return [...channels.values()];
}

export function readUploader(element: HTMLElement): ChannelIdentity {
  const identity: ChannelIdentity = {};
  for (const link of element.querySelectorAll<HTMLAnchorElement>(
    ownerSelector,
  )) {
    if (
      link.closest(
        'ytd-comment-thread-renderer, ytd-comment-view-model, #description',
      )
    )
      continue;
    const href = link.getAttribute('href');
    if (!href) continue;
    try {
      const parsed = parseChannelIdentity(
        new URL(href, 'https://www.youtube.com').href,
      );
      if (parsed) Object.assign(identity, parsed);
    } catch {
      // Malformed links carry no usable channel identity.
    }
  }
  return identity;
}

export function uploaderSignature(element: HTMLElement): string {
  if (!element.matches(youtubeVideoSelector)) return '';
  const identity = readUploader(element);
  return `${identity.channelId ?? ''}:${identity.handle ?? ''}`;
}

export function createChannelFilter(settings: Settings) {
  const byId = new Map<string, YouTubeChannel>();
  const byHandle = new Map<string, YouTubeChannel>();
  for (const channel of protectedChannels(settings)) {
    if (settings.disabledChannels.includes(channelKey(channel))) continue;
    if (channel.channelId) byId.set(channel.channelId, channel);
    if (channel.handle) byHandle.set(channel.handle.toLowerCase(), channel);
  }
  return (element: HTMLElement, text: string): boolean => {
    if (
      !settings.enabled ||
      !settings.channelProtection ||
      !element.matches(youtubeVideoSelector)
    )
      return false;
    const identity = readUploader(element);
    const channel = identity.channelId
      ? byId.get(identity.channelId)
      : identity.handle
        ? byHandle.get(identity.handle)
        : undefined;
    if (!channel) return false;
    if (channel.group === 'priority' && settings.channelMode === 'strict')
      return true;
    if (!hasGtaContext(text)) return false;
    if (channel.group === 'priority' || settings.channelMode === 'strict')
      return true;
    return detect(text, { ...settings, mode: 'balanced', spoilerFree: false });
  };
}

export function isUploaderText(element: Element): boolean {
  return (
    element.closest(
      `${ownerSelector}, ytd-channel-name, #channel-name, yt-reel-channel-bar-view-model`,
    ) !== null
  );
}
