# Privacy

Vice Guard processes page text and text metadata locally to detect GTA 6 spoilers. Page content is kept in memory only and discarded when a tab closes or reloads.

The extension stores your enabled state, filtering mode, experimental browsing and click-to-reveal preferences, custom keywords, channel protection mode, disabled channel entries, and custom YouTube channel identifiers in `browser.storage.local`. It does not use synchronized storage. Uninstalling removes these preferences. Custom channels are never sent to a resolver or fetched from YouTube.

Vice Guard does not collect, transmit, sell, or share data. It includes no analytics, telemetry, AI, external APIs, remote filter updates, or account system. No background process or server receives browsing activity.

The `storage` permission saves preferences. The HTTP/HTTPS content-script declaration lets the extension inspect content on websites you visit. Access to browser history, cookies, and tabs is not requested.

This policy describes production builds. The WXT development server provides local hot reload for developers.
