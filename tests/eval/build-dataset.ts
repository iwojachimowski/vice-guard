// Generates tests/eval/dataset.json deterministically: `npx jiti tests/eval/build-dataset.ts`.
// Titles are real-world-style but invented; no real story details are used.
import { writeFileSync } from 'node:fs';

export interface Example {
  id: string;
  site: 'youtube' | 'reddit' | 'x' | 'google' | 'news' | 'article';
  text: string;
  label: 0 | 1;
  category: string;
  /** Which layer is expected to carry a positive. */
  carrier: 'text' | 'ocr' | 'visual';
  thumb?: { text: string; scene: string };
}

let seed = 0x5eed;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
const num = () => String(2 + Math.floor(random() * 60));

const gta6 = [
  'GTA 6', 'GTA VI', 'GTA6', 'GTAVI', 'gta 6', 'Gta Vi', 'G T A 6', 'G.T.A. VI',
  'G.T.A-VI', '#GTA6', '#GTAVI', '#GrandTheftAutoVI', 'Grand Theft Auto VI',
  'Grand Theft Auto 6', 'GTA Ⅵ', 'ＧＴＡ６', '𝐆𝐓𝐀 𝟔', 'GTA⁶', 'GTA 6️⃣',
  'G​TA 6', 'GТА 6', 'gta six', 'GTA-6', 'GTA_VI', "GTA6's", 'GRAND THEFT AUTO Ⅵ',
  '🇬🇹🇦 6', 'ɢᴛᴀ 6', 'G-T-A 6', 'gta.vi', 'GT4 VI', 'Grand­Theft Auto VI',
  'G T A Ⅵ', 'gta⁠vi', 'ǤTA 6', 'GTA ⑥', 'GTA6Leaks', 'gtavi',
];
const others = [
  'GTA 5', 'GTA V', 'GTA San Andreas', 'GTA IV', 'GTA Online', 'GTA Vice City (2002)',
  'Red Dead Redemption 2', 'RDR2', 'Bully', 'Max Payne 3', 'L.A. Noire', 'Cyberpunk 2077',
  'Mafia: The Old Country', 'Elden Ring', 'The Witcher 3', 'Watch Dogs: Legion',
  'Saints Row', 'Sleeping Dogs', "Marvel's Spider-Man 2", "Assassin's Creed Shadows",
  'GTA Trilogy', 'GTA Liberty City Stories', 'GTA 4', 'GTA Vice City Stories',
  'Red Dead Redemption', 'GTA V Enhanced', 'GTA RP', 'Midnight Club',
];
const spoilerish = {
  youtube: [
    '{G} ending explained', '{G} - Final Mission', '{G} all cutscenes movie',
    '{G} walkthrough part {n}', 'I finished {G} and the ending...',
    '{G} SPOILERS: who dies?', '{G} secret ending found', '{G} map size compared',
    '{G} gameplay - first 30 minutes', '{G} trailer 3 breakdown',
    '{G} leaked footage analysis', '{G} review - is it worth it?',
    '{G} PS5 vs Xbox comparison', '{G} story recap in 10 minutes',
    'every {G} mission ranked', '{G} the betrayal scene', '{G} best easter eggs',
    '{G} release date countdown', '{G} funny moments #{n}', '{G} | live stream day {n}',
    'why {G} is the best game ever made', '{G} NPCs are insane', '{G} 100% completion',
    '{G} final boss fight', '{G} plot twist reaction', '{G} sp0ilers ahead',
    '{G} 3nding reaction', '{G} #shorts', 'What happens after the {G} credits',
  ],
  reddit: [
    '[{G}] just finished the story, thoughts?', 'Spoiler: {G} chapter {n} discussion',
    'Is {G} worth full price?', '{G} photo mode thread', '{G} - who else cried at the end?',
    'PSA: {G} day one patch notes', '{G} hidden mission guide',
    'Unpopular opinion: {G} story is overrated', 'My {G} ending tier list',
    '{G} map is way bigger than I expected', '{G} heist strategy megathread',
    'r/gaming · {G} broke me tonight',
  ],
  x: [
    '{G} is ruining my sleep schedule', 'the {G} ending had me in tears',
    'Trending in Gaming · {G} · {n}K posts', "can't stop playing {G}",
    'no spoilers but {G} chapter {n} 😳', 'just got to the last mission of {G} wish me luck',
    'replying to @gamer: {G} spoilers in the replies, mute now',
  ],
  google: [
    '{G} characters list', '{G} cheats PS5', '{G} release time by region',
    'People also ask: How long is {G}?', 'Videos: {G} ending', 'Images: {G} map',
    'Related searches: {G} story', 'Top stories: {G} sales numbers',
  ],
  news: [
    '{G} sells {n} million copies in first week', '{G} review: a sprawling satire',
    'Take-Two says {G} beat expectations', '{G} launch: servers buckle under demand',
    'Inside the making of {G}',
  ],
  article: ['The {n} best missions in {G}, ranked', 'Every ending in {G} explained'],
} as const;

type Site = Example['site'];
const implicitPositives: [Site, string][] = [
  ['youtube', 'Vice City {year} trailer breakdown'],
  ['youtube', 'The new Vice City looks unreal on PS5'],
  ['reddit', 'Vice City is back and the leaks were right'],
  ['news', "Rockstar's return to Vice City: release date confirmed"],
  ['youtube', 'Vice City night drive, {year} edition (gameplay)'],
  ['youtube', 'Leonida map tour - every region'],
  ['reddit', 'Leonida Keys hidden beach location'],
  ['youtube', 'Port Gellhorn is so depressing lol'],
  ['x', 'Grassrivers at sunset might be the prettiest thing in gaming'],
  ['youtube', 'Mount Kalaga hiking trail easter egg'],
  ['reddit', 'Every Leonida radio station ranked'],
  ['x', 'Leonida >>> Los Angeles'],
  ['youtube', 'Jason and Lucia - the full story'],
  ['x', 'Lucia & Jason are the best duo in gaming'],
  ['youtube', 'jason x lucia edit 🔥'],
  ['reddit', 'Does Jason trust Lucia at the end?'],
  ['youtube', 'Jason Duval voice actor interview'],
  ['youtube', 'Lucia Caminos character analysis'],
  ['x', 'Boobie Ike is the funniest character this year'],
  ['reddit', 'Real Dimez song in the game is a banger'],
  ['reddit', 'Cal Hampton is the best side character in GTA history'],
  ['youtube', 'Raul Bautista heist mission gameplay'],
  ['youtube', "Rockstar's new game ending is DARK"],
  ['x', 'rockstar killed off my favourite character i am not ok'],
  ['reddit', 'Rockstar mission design has peaked'],
  ['news', 'Rockstar story details leak ahead of launch'],
  ['news', 'Rockstar delays release date again'],
  ['youtube', 'the new GTA trailer has a secret'],
  ['reddit', 'next GTA ending theories'],
  ['x', 'GTA spoilers are everywhere today, stay safe'],
  ['youtube', 'GTA countdown live - {n} days left'],
  ['news', 'GTA leaks: what the 2022 footage got right'],
  ['google', 'gta release date'],
  ['x', '#Leonida #Rockstar'],
  ['youtube', 'Lucia in GTA is the best protagonist'],
  ['reddit', 'Jason in the new Rockstar trailer looks rough'],
  ['google', 'People also ask: Who is Jason Duval?'],
  ['news', 'Rockstar Games confirms next title launches on PS5 and Xbox Series X'],
  ['youtube', 'GTA story is way darker than I expected'],
  ['x', 'Rockstar Games: Welcome to Leonida.'],
  ['youtube', 'Vice City {year} - every new location'],
  ['reddit', 'Who else preordered the new GTA?'],
  ['youtube', 'Rockstar plot twist explained'],
  ['x', 'the GTA final mission hit different'],
  ['news', 'Rockstar Games breaks silence on leaked story footage'],
];
const implicitNegatives: [Site, string][] = [
  ['news', 'GTA {n} cm snowfall expected overnight'],
  ['news', 'GTA home prices drop in {year}'],
  ['x', 'TTC strike leaves GTA commuters stranded'],
  ['x', 'GTA traffic is a nightmare on the 401 again'],
  ['news', 'GTA housing market outlook for {year}'],
  ['news', '6 GTA hospitals report record wait times'],
  ['news', 'GTA weather: 6 degrees and sunny in Toronto'],
  ['reddit', 'r/askTO · Best ramen in the GTA?'],
  ['news', 'Peel police: GTA auto theft ring dismantled'],
  ['news', '{n} teens charged with grand theft auto'],
  ['news', 'Grand theft auto arrest after Miami police chase'],
  ['google', 'grand theft auto sentencing guidelines florida'],
  ['news', 'Man faces grand theft auto, 6 counts of fraud'],
  ['youtube', 'Jason Momoa surfing in Hawaii'],
  ['youtube', 'Jason Statham fight scenes compilation'],
  ['x', 'Jason Kelce on the new season'],
  ['youtube', 'Jason Derulo - Savage Love (Official Video)'],
  ['google', 'Jason Bourne movie order'],
  ['youtube', 'Jason Voorhees origin story'],
  ['youtube', 'Santa Lucia (Italian folk song)'],
  ['google', 'St. Lucia resorts all inclusive'],
  ['youtube', 'Lucia di Lammermoor full opera'],
  ['x', 'Lucia just turned 3 today 🎂'],
  ['reddit', 'My dog Lucia learned a new trick'],
  ['youtube', 'Miami Beach things to do in {year}'],
  ['youtube', 'Florida Keys road trip vlog'],
  ['news', 'Miami Vice reboot casts its leads'],
  ['youtube', 'Ocean Drive art deco walking tour'],
  ['youtube', 'Little Havana food tour - best Cuban sandwich'],
  ['youtube', 'Miami: the real-life Vice City? Nightlife guide {year}'],
  ['google', 'Miami hotels near South Beach'],
  ['youtube', 'Rockstar Energy Drink review'],
  ['youtube', 'Post Malone - rockstar (Lyrics)'],
  ['reddit', 'Rockstar romance novel with the best ending?'],
  ['youtube', 'Nickelback - Rockstar (Official Video)'],
  ['x', 'living that rockstar lifestyle this weekend 🎸'],
  ['youtube', "Rockstar's Red Dead 2 story is a masterpiece"],
  ['news', 'Rockstar Bully 2 rumors resurface'],
  ['youtube', "Rockstar's Max Payne 3 ending still hits"],
  ['youtube', 'Leonidas at Thermopylae - documentary'],
  ['x', 'Leonid meteor shower peaks tonight'],
  ['google', 'ambrosia salad recipe'],
  ['google', 'Duval Street Key West bars'],
  ['news', 'Duval County schools release calendar'],
  ['youtube', 'El Camino: A Breaking Bad Movie ending explained'],
  ['youtube', 'Alfa Romeo Giulia GTA review {year}'],
  ['news', 'Vice News: inside Florida politics'],
  ['youtube', 'GTA San Andreas cheats PS2'],
  ['reddit', 'GTA 4 radio is still the best'],
  ['youtube', 'GTA Online new DLC trailer {year}'],
  ['youtube', 'GTA 5 PS5 next gen trailer'],
  ['reddit', 'Is GTA V worth buying in {year}?'],
  ['youtube', 'GTA Vice City Definitive Edition trailer'],
  ['youtube', 'Tommy Vercetti story recap'],
  ['reddit', 'CJ is the best GTA protagonist'],
  ['youtube', 'GTA Trilogy remaster patch notes'],
  ['youtube', 'Cyberpunk 2077 ending explained'],
  ['youtube', 'Elden Ring final boss reaction'],
  ['reddit', 'Spoilers: The Last of Us season 2 finale'],
  ['news', 'Take-Two earnings: NBA 2K26 sales strong'],
  ['x', 'Miami Heat clinch playoff spot'],
  ['youtube', 'Top 10 open world games of {year}'],
  ['youtube', 'Mafia: The Old Country review'],
  ['google', 'Things to do in Miami this weekend'],
  ['news', 'Hurricane watch for the Florida Keys'],
  ['youtube', 'I played every Rockstar game in order (2001-2018)'],
  ['reddit', 'Which old GTA has the best map? San Andreas or Vice City?'],
];
const neutralTitles = [
  "I can't believe this happened...", 'This ending broke me 😭', 'You NEED to see this',
  'the saddest moment in gaming', '{n} hours later...', 'watch till the end',
  'I was NOT ready for this', 'Reacting to the final mission', 'the twist nobody expected',
  'This changes everything', 'POV: you finally finish it', "we're never getting over this",
];
const ocrPositive = [
  'GTA 6', 'GTA VI', 'GTA 6 ENDING', 'GTAVI', 'LEONIDA', 'VICE CITY 2026', 'GTA VI SPOILERS',
  'JASON & LUCIA', 'NEW GTA', 'GTA 6!!', 'Grand Theft Auto VI', 'G T A 6',
];
const ocrNegative = [
  'GTA 5', 'RDR2', 'MIAMI', 'GTA V ENDING', '2026 PREDICTIONS', 'ELDEN RING', 'TORONTO SNOW',
  'SAN ANDREAS', 'WOW', 'TOP 10', 'GTA IV', 'CYBERPUNK',
];
const scenes = ['neon', 'sunset', 'night', 'dark', 'bright'];

const years = ['2025', '2026', '2027'];
const fill = (t: string, g = '') =>
  t.replaceAll('{G}', g).replaceAll('{n}', num()).replaceAll('{year}', pick(years));

const examples: Example[] = [];
const seen = new Set<string>();
function add(e: Omit<Example, 'id'>) {
  const key = `${e.text}|${e.thumb?.text ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  examples.push({ id: `g${String(examples.length).padStart(4, '0')}`, ...e });
}

const sites = Object.keys(spoilerish) as (keyof typeof spoilerish)[];
for (let i = 0; i < 320; i++) {
  const site = pick(sites);
  add({ site, text: fill(pick(spoilerish[site]), pick(gta6)), label: 1, category: 'explicit', carrier: 'text' });
}
for (let i = 0; i < 200; i++) {
  const site = pick(sites);
  add({ site, text: fill(pick(spoilerish[site]), pick(others)), label: 0, category: 'other-game', carrier: 'text' });
}
for (const [site, text] of implicitPositives)
  for (let i = 0; i < 2; i++) add({ site, text: fill(text), label: 1, category: 'implicit', carrier: 'text' });
for (const [site, text] of implicitNegatives)
  for (let i = 0; i < 2; i++) add({ site, text: fill(text), label: 0, category: 'tricky-negative', carrier: 'text' });
for (let i = 0; i < 90; i++)
  add({
    site: 'youtube', text: fill(pick(neutralTitles)), label: 1, category: 'thumbnail-text',
    carrier: 'ocr', thumb: { text: pick(ocrPositive), scene: pick(scenes) },
  });
for (let i = 0; i < 70; i++)
  add({
    site: 'youtube', text: fill(pick(neutralTitles)), label: 0, category: 'thumbnail-negative',
    carrier: 'ocr', thumb: { text: pick(ocrNegative), scene: pick(scenes) },
  });
for (let i = 0; i < 24; i++)
  add({
    site: pick(['youtube', 'reddit', 'x'] as const), text: fill(pick(neutralTitles)), label: 1,
    category: 'visual-only', carrier: 'visual', thumb: { text: '', scene: pick(scenes) },
  });

writeFileSync('tests/eval/dataset.json', `${JSON.stringify(examples, null, 1)}\n`);
const count = (f: (e: Example) => boolean) => examples.filter(f).length;
console.log(
  `${examples.length} examples: ${count((e) => e.label === 1)} positive, ${count((e) => e.label === 0)} negative`,
);
