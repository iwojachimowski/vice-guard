import {
  channelKey,
  parseChannelIdentity,
  type ChannelIdentity,
} from './channel-identity';

export type Mode = 'light' | 'balanced' | 'strict';
export interface CustomChannel extends ChannelIdentity {
  name: string;
}
export interface Settings {
  enabled: boolean;
  mode: Mode;
  spoilerFree: boolean;
  allowReveal: boolean;
  keywords: string[];
  channelProtection: boolean;
  channelMode: 'standard' | 'strict';
  disabledChannels: string[];
  customChannels: CustomChannel[];
}

export const defaults: Settings = {
  enabled: true,
  mode: 'strict',
  spoilerFree: false,
  allowReveal: true,
  keywords: [],
  channelProtection: true,
  channelMode: 'standard',
  disabledChannels: [],
  customChannels: [],
};

export function parseSettings(value: unknown): Settings {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    channelProtection:
      typeof data.channelProtection === 'boolean'
        ? data.channelProtection
        : true,
    channelMode: data.channelMode === 'strict' ? 'strict' : 'standard',
    disabledChannels: Array.isArray(data.disabledChannels)
      ? [
          ...new Set(
            data.disabledChannels.flatMap((value) => {
              const identity =
                typeof value === 'string' ? parseChannelIdentity(value) : null;
              return identity ? [channelKey(identity)] : [];
            }),
          ),
        ].slice(0, 300)
      : [],
    customChannels: parseCustomChannels(data.customChannels),
    enabled:
      typeof data.enabled === 'boolean' ? data.enabled : defaults.enabled,
    mode: ['light', 'balanced', 'strict'].includes(String(data.mode))
      ? (data.mode as Mode)
      : defaults.mode,
    spoilerFree:
      typeof data.spoilerFree === 'boolean' ? data.spoilerFree : false,
    allowReveal:
      typeof data.allowReveal === 'boolean'
        ? data.allowReveal
        : defaults.allowReveal,
    keywords: Array.isArray(data.keywords)
      ? [
          ...new Set(
            data.keywords
              .filter((word): word is string => typeof word === 'string')
              .map((word) => word.trim().slice(0, 120))
              .filter(Boolean),
          ),
        ].slice(0, 200)
      : [],
  };
}

function parseCustomChannels(value: unknown): CustomChannel[] {
  if (!Array.isArray(value)) return [];
  const channels = new Map<string, CustomChannel>();
  for (const item of value.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    const identity = parseChannelIdentity(
      typeof item.channelId === 'string'
        ? item.channelId
        : typeof item.handle === 'string'
          ? item.handle
          : '',
    );
    if (!identity) continue;
    const key = channelKey(identity);
    channels.set(key, {
      ...identity,
      name:
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim().slice(0, 100)
          : key,
    });
  }
  return [...channels.values()];
}
