import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../lib/youtube-channels.json', import.meta.url);
const channels = JSON.parse(await readFile(path, 'utf8'));
for (const channel of channels) {
  const requestedName = process.argv
    .find((arg) => arg.startsWith('--name='))
    ?.slice(7);
  if (requestedName && requestedName !== channel.name) continue;
  if (process.argv.includes('--missing-only') && channel.channelId) continue;
  const source = channel.channelId
    ? `https://www.youtube.com/channel/${channel.channelId}/about`
    : (channel.source ?? `https://www.youtube.com/${channel.handle}/about`);
  try {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(20000),
    });
    const html = await response.text();
    const metadata = html.split('"channelMetadataRenderer":')[1];
    const field = (name) => {
      const match = metadata?.match(
        new RegExp(`"${name}":("(?:[^"\\\\]|\\\\.)*")`),
      );
      return match ? JSON.parse(match[1]) : null;
    };
    const data = {
      title: field('title'),
      externalId: field('externalId'),
      vanityChannelUrl: field('vanityChannelUrl'),
    };
    if (!response.ok || !data?.externalId || !data?.vanityChannelUrl)
      throw new Error(`No channel metadata (${response.status})`);
    if (channel.channelId && channel.channelId !== data.externalId)
      throw new Error('Channel ID changed; manual review required');
    console.log(channel.name, JSON.stringify(data));
    if (process.argv.includes('--write')) {
      channel.channelId = data.externalId;
      channel.handle = new URL(data.vanityChannelUrl).pathname.slice(1);
      channel.source = source;
      channel.verifiedAt = new Date().toISOString().slice(0, 10);
    }
  } catch (error) {
    console.error(channel.name, error.message);
    process.exitCode = 1;
  }
}
if (process.argv.includes('--write'))
  await writeFile(path, `${JSON.stringify(channels, null, 2)}\n`);
