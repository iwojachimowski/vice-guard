# Vice Guard

A local GTA 6 spoiler filter for Chromium and Firefox. It hides matching posts, video cards, headlines, comments, and image results without sending page content anywhere.

Built with TypeScript, WXT, and React. No AI, external services, analytics, or remote filter subscriptions.

## Install

### Chrome, Brave, and Edge

1. [Download Vice Guard](https://github.com/iwojachimowski/vice-guard/releases/latest/download/vice-guard-chrome.zip) and extract the ZIP into a folder you'll keep.
2. Open your browser's **Extensions** page (`chrome://extensions`, `brave://extensions`, or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked**, select the extracted folder containing `manifest.json`, then refresh your open website tabs.

Keep the extracted folder in place: the browser loads the extension from it. To update, replace its files with the new download, click **Reload** on the extension, and refresh your tabs.

### Firefox (temporary installation)

1. [Download the Firefox ZIP](https://github.com/iwojachimowski/vice-guard/releases/latest/download/vice-guard-firefox.zip) and extract it.
2. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and select the extracted `manifest.json`.
3. Refresh your website tabs. Firefox removes temporary add-ons when it closes; permanent installation requires a signed add-on.

All downloads are on the [Releases page](https://github.com/iwojachimowski/vice-guard/releases). The prebuilt ZIPs require no development tools.

### Build from source

Use Node.js 24.15 or newer in the 24.x release line and npm. The supported Node versions are listed in `package.json`.

```sh
npm ci
npm run build
```

In Chrome, Edge, or Brave, open the extensions page, enable **Developer mode**, select **Load unpacked**, and choose `.output/chrome-mv3`.

For Firefox, run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, and load `.output/firefox-mv2/manifest.json` as a temporary add-on. Firefox removes temporary add-ons when it exits; permanent installation requires signing.

Reload website tabs after installing or updating the extension.

## Filtering

| Mode                          | What it hides                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Light                         | Explicit spoiler signals: endings, deaths, plot twists, and similar terms                          |
| Balanced                      | Light matches, plus character names, story and mission coverage, gameplay, map analysis, and leaks |
| Strict (default, recommended) | All recognized GTA 6 mentions                                                                      |

Ordinary posts need a GTA 6 context phrase in the same card, such as `GTA VI`, `GTA6`, or `Grand Theft Auto 6`. Jason or Lucia alone won't trigger a match. Matching normalizes case, accents, punctuation, full-width characters, and common invisible separators.

Two areas are handled more broadly in every mode:

- **X sidebar news and trends:** GTA 6 entries are hidden individually, leaving unrelated topics visible.
- **Google image cards:** matching uses captions, alt text, source links, and explicit image-panel query context. All images within a panel tied to a GTA 6 query are treated as GTA 6 content, even if their captions omit the name.

### Settings

**Enable protection** turns filtering on or off across open tabs.

**Allow click-to-reveal** controls whether a hidden item can be opened from the page. Turn it off to replace reveal buttons with plain notices. Previously revealed items are checked again whenever settings change.

**Spoiler-free browsing (experimental)** allows ordinary GTA 6 cards without explicit spoiler signals, even in Strict mode. Custom keywords still apply. This is a text-based exception, not a safety guarantee: innocent titles can conceal spoiler footage. It does not relax the X sidebar or Google image rules.

**Your keywords** adds literal words or phrases, one per line. These still need GTA 6 context. Up to 200 phrases of 120 characters are saved. Custom regular expressions are not accepted.

**Known Spoiler Channels** adds uploader-based YouTube protection. It starts enabled in Standard mode, independently of the Light/Balanced/Strict text filter:

| Channel mode | Priority and custom channels                | GTA-focused channels                                                                                        |
| ------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Standard     | Hide GTA 6 uploads                          | Apply Balanced story/gameplay detection to GTA 6 uploads, even with Light or experimental browsing selected |
| Strict       | Hide all uploads, including unrelated games | Hide all GTA 6 uploads                                                                                      |

Expand **Manage channels** to search the 41 bundled channels, switch individual entries on or off, or add up to 200 custom channels using a YouTube `@handle`, channel ID, or channel URL. Custom channels follow the priority rules and can be removed. The protected count reflects enabled entries while protection is on. Disabling a channel removes only its extra channel rule; ordinary keyword filtering still applies.

Bundled entries use verified channel IDs first and exact handles when the card exposes no ID. Display names never identify a channel. Custom handles are matched literally without contacting YouTube; use an ID when possible because handles can change. If uploader information is missing, ordinary spoiler detection still runs.

The list is preventive, based on the requested community risk list and GTA-focused creators; inclusion is not proof of spoiler misconduct. Identifiers and verification dates are recorded in [lib/youtube-channels.json](lib/youtube-channels.json). Channel protection never treats a secondary creator's name alone as GTA 6 context.

Settings stay on the device and are not synchronized between browsers.

### YouTube

Blocked home-feed videos are removed from the grid, with reveal controls grouped above it. Remaining loaded videos fill gaps across rows and before full-width shelves. Gap filling stays active when filtering is switched off; disabling the extension itself and refreshing restores YouTube's original layout. No replacement recommendations are requested. Visual order can differ from keyboard navigation order when a later card fills a shelf gap.

Matching Shorts players are covered and paused. Playback attempts are stopped while blocked. Reveal restores visibility without automatically starting playback. Channel rules share the same complete-card protection for home feeds, search, subscriptions, recommendations, and Shorts. The scanner starts at document start and checks existing cards immediately; later updates use the existing batched observer.

## Privacy and permissions

The only extension API permission is `storage`. HTTP/HTTPS content scripts provide access to page content for filtering. Browsers describe this as permission to read website data.

Page text is processed in memory and is never saved or transmitted. Production builds make no network requests and use no background service worker. They request no history, cookie, or tabs permissions. See [PRIVACY.md](PRIVACY.md).

WXT development builds use a local hot-reload connection and may request additional development permissions.

## Limits

Vice Guard reads text and metadata; it does not recognize images, speech, or video footage. Unlabelled content can slip through. Content may briefly appear before a scan runs, and website markup changes can break selectors.

Coverage includes YouTube, Reddit, X, Google Search, and semantic articles and headings on other sites. Unusual layouts may have only their headline hidden. Closed shadow roots, frames, and canvas text are not scanned. Text matching is capped at 24,000 characters per card. The bundled list is mainly English, with some Polish terms.

## Development

```sh
npm run dev               # Chromium, with hot reload
npm run dev:firefox
npm run typecheck
npm run format:check
npm test
npm run build
npm run build:firefox
npx playwright install chromium
npm run test:browser
npm run zip
npm run zip:firefox
```

The browser tests load the production Chromium build in an isolated profile. They cover feed updates, complete-card hiding, playback protection, settings, reveal locks, and layout regressions using local fixtures. They do not certify the current live markup of every supported website. CI runs these checks on Linux.

The code is organized around a small detector and scanner:

- `lib/detector.ts` and `lib/spoilers.json`: text matching and bundled terms.
- `lib/scanner.ts`, `lib/targets.ts`, and `lib/notice.ts`: scanning, card selection, and blocked-content notices.
- `lib/youtube.ts`, `lib/shorts.ts`, and `lib/google-images.ts`: site-specific behavior.
- `lib/youtube-channel-filter.ts`, `lib/channel-identity.ts`, and `lib/youtube-channels.json`: uploader identity and bundled channel rules.
- `lib/settings.ts` and `lib/storage.ts`: preferences and local storage.
- `entrypoints/`: content-script lifecycle and React popup.
- `tests/`: detector, DOM, and browser regressions.
- `assets/logo.png`: original icon artwork; browser-sized exports live in `public/icon/`.

## Contributing

Filter changes belong in [lib/spoilers.json](lib/spoilers.json) and ship with extension releases. Add a regression test for each new term or selector, including an unrelated example that should remain visible. Avoid real unreleased plot details in tests or issue reports.

Keep detection local, avoid additional runtime dependencies, and run the checks above before opening a pull request.

To check bundled channel identifiers against YouTube, run `node scripts/verify-youtube-channels.mjs`. This maintainer-only script makes network requests; it is not shipped as extension code. Review its reported channel titles before using `--write` to refresh metadata. Existing IDs are checked first so a reassigned handle cannot silently replace a stored ID. Name changes and new entries still need manual review.

Code is licensed under [MIT](LICENSE). Unofficial fan project; not affiliated with Rockstar Games or Take-Two Interactive.
