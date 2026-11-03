import { describe, expect, it } from 'vitest';
import { detect, normalize } from '../lib/detector';
import { defaults, parseSettings } from '../lib/settings';

const balanced = { ...defaults, mode: 'balanced' as const };

describe('local spoiler matching', () => {
  it('defaults new installs to Strict without overriding a saved mode', () => {
    expect(parseSettings(null).mode).toBe('strict');
    expect(parseSettings({ mode: 'balanced' }).mode).toBe('balanced');
    expect(parseSettings({ mode: 'light' }).mode).toBe('light');
    expect(detect('GTA 6 release date', defaults)).toBe(true);
  });
  it.each([
    'GTA 6 - Analiza i Ciekawostki 4',
    'GTA 6: SZCZEGÓŁOWA ANALIZA MAPY',
    'Grand Theft Auto VI: An Extended Look',
  ])('treats %s as gameplay or story coverage in Balanced', (title) => {
    expect(detect(title, balanced)).toBe(true);
    expect(detect(title, { ...defaults, mode: 'light' })).toBe(false);
    expect(detect(title, { ...defaults, spoilerFree: true })).toBe(false);
  });
  it.each([
    'Jason dies in GTA 6',
    'GTA VI: Lucia story',
    'Grand Theft Auto VI walkthrough',
    'GTAVI ending explained',
    'GＴＡ ６ — Lúcia',
    'GTA\u200b6 leaked story',
  ])('blocks %s', (title) => {
    expect(detect(title, defaults)).toBe(true);
  });
  it.each([
    'Jason reviews a movie',
    'Lucia cooking tutorial',
    'GTA 5 ending',
    'GTAVice city guide',
    'GTA 6 release date',
    'GTA 6 trailer reaction',
    'GTA 6 classical music',
  ])('allows %s', (title) => {
    expect(detect(title, balanced)).toBe(false);
  });
  it('uses word boundaries and normalizes punctuation', () => {
    expect(detect('GTA 6: Jasonville sightseeing', balanced)).toBe(false);
    expect(normalize('  GＴＡ—VI: Lúcia! ')).toBe('gta vi lucia');
  });
  it('keeps light narrow and strict broad', () => {
    expect(
      detect('GTA 6 Lucia interview', { ...defaults, mode: 'light' }),
    ).toBe(false);
    expect(detect('GTA 6 release date', { ...defaults, mode: 'strict' })).toBe(
      true,
    );
    expect(detect('GTA 6 ending', { ...defaults, mode: 'light' })).toBe(true);
  });
  it('experimental mode allows ambiguous content while retaining explicit and custom signals', () => {
    const settings = {
      ...defaults,
      mode: 'strict' as const,
      spoilerFree: true,
      keywords: ['bank robbery'],
    };
    expect(detect('GTA 6 Jason gameplay', settings)).toBe(false);
    expect(detect('GTA 6 ending', settings)).toBe(true);
    expect(detect('GTA 6 spoiler-free review', settings)).toBe(false);
    expect(detect('GTA 6 no spoilers gameplay', settings)).toBe(false);
    expect(
      detect('GTA 6 spoiler-free review: ending explained', settings),
    ).toBe(true);
    expect(detect('GTA 6 bank robbery', settings)).toBe(true);
    expect(detect('Bank robbery in a movie', settings)).toBe(false);
  });
  it('treats custom phrases literally and honors the global switch', () => {
    expect(detect('GTA 6 .*', { ...balanced, keywords: ['.*'] })).toBe(false);
    expect(detect('GTA 6 ending', { ...defaults, enabled: false })).toBe(false);
  });
  it('repairs invalid stored preferences and bounds custom input', () => {
    expect(parseSettings({ showBadge: false }).showBadge).toBe(false);
    expect(parseSettings({ showBadge: 'false' }).showBadge).toBe(true);
    expect(parseSettings({ clipThreshold: 2 }).clipThreshold).toBe(
      defaults.clipThreshold,
    );
    expect(parseSettings(null)).toEqual(defaults);
    expect(
      parseSettings({
        enabled: 'false',
        mode: 'other',
        keywords: [' hi ', null, 'hi'],
      }),
    ).toEqual({ ...defaults, keywords: ['hi'] });
    expect(
      parseSettings({ keywords: Array.from({ length: 300 }, (_, i) => `${i}`) })
        .keywords,
    ).toHaveLength(200);
  });
});

describe('Rockstar negation', () => {
  it.each([
    "The 10 best open world games of the decade (that aren't from Rockstar) Continue reading the story",
    'Great non-Rockstar story games',
  ])('keeps %s', (title) => expect(detect(title, defaults)).toBe(false));
  it('still blocks Rockstar story coverage', () =>
    expect(detect("Rockstar's new story trailer is here", defaults)).toBe(
      true,
    ));
});
