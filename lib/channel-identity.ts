export interface ChannelIdentity {
  channelId?: string;
  handle?: string;
}

export function parseChannelIdentity(input: string): ChannelIdentity | null {
  let value = input.trim();
  if (/^(?:https?:\/\/|www\.)/i.test(value)) {
    try {
      const url = new URL(
        value.startsWith('www.') ? `https://${value}` : value,
      );
      if (
        !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(
          url.hostname,
        )
      )
        return null;
      value = decodeURIComponent(url.pathname).replace(/\/$/, '');
    } catch {
      return null;
    }
  }
  const id = value.match(/^(?:\/?channel\/)?(UC[\w-]{22})$/);
  if (id) return { channelId: id[1] };
  const handle = value.match(/^\/?(@[\p{L}\p{N}_.·-]{3,30})$/u);
  return handle ? { handle: handle[1]!.toLowerCase() } : null;
}

export function channelKey(channel: ChannelIdentity): string {
  return channel.channelId ?? channel.handle?.toLowerCase() ?? '';
}
