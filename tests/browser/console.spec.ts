import { expect, openFixture, test } from './fixtures';

// The offscreen document (OCR and CLIP) must not log errors or warnings:
// Chrome lists them on the extension's Errors page, one per thumbnail.
test('offscreen document logs no errors while reading thumbnails', async ({
  extension: { context },
}) => {
  test.setTimeout(120_000);
  const messages: string[] = [];
  // Playwright does not list offscreen documents, so attach over CDP.
  const cdp = await context.newCDPSession(await context.newPage());
  const findOffscreen = async () =>
    (
      (await cdp.send('Target.getTargets')) as {
        targetInfos: { targetId: string; url: string }[];
      }
    ).targetInfos.find((t) => t.url.endsWith('/offscreen.html'));
  await expect.poll(findOffscreen, { timeout: 30_000 }).toBeTruthy();
  const { sessionId } = (await cdp.send('Target.attachToTarget', {
    targetId: (await findOffscreen())!.targetId,
    flatten: false,
  })) as { sessionId: string };
  // Sessions are nested (offscreen document -> its OCR and CLIP workers);
  // `path` is the chain of session ids from the offscreen document down.
  let id = 0;
  const send = (path: string[], method: string, params: object = {}) => {
    let message = JSON.stringify({ id: ++id, method, params });
    for (const session of path.slice(1).reverse())
      message = JSON.stringify({
        id: ++id,
        method: 'Target.sendMessageToTarget',
        params: { sessionId: session, message },
      });
    return cdp.send('Target.sendMessageToTarget', {
      sessionId: path[0]!,
      message,
    });
  };
  interface Message {
    method?: string;
    params?: {
      sessionId?: string;
      message?: string;
      targetInfo?: { url: string };
      type?: string;
      args?: { value?: unknown; description?: string }[];
      entry?: { level: string; text: string };
      exceptionDetails?: { text: string };
    };
  }
  const enable = async (path: string[]) => {
    for (const method of ['Runtime.enable', 'Log.enable'])
      await send(path, method).catch(() => undefined);
    await send(path, 'Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: false,
    }).catch(() => undefined);
  };
  const handle = (path: string[], message: Message) => {
    const params = message.params ?? {};
    if (message.method === 'Target.attachedToTarget')
      return void enable([...path, params.sessionId!]);
    if (message.method === 'Target.receivedMessageFromTarget')
      return handle(
        [...path, params.sessionId!],
        JSON.parse(params.message!) as Message,
      );
    if (
      message.method === 'Runtime.consoleAPICalled' &&
      ['error', 'warning'].includes(params.type!)
    )
      messages.push(
        `${params.type}: ${params.args!.map((arg) => arg.value ?? arg.description).join(' ')}`,
      );
    if (
      message.method === 'Log.entryAdded' &&
      ['error', 'warning'].includes(params.entry!.level)
    )
      messages.push(`${params.entry!.level}: ${params.entry!.text}`);
    if (message.method === 'Runtime.exceptionThrown')
      messages.push(`exception: ${params.exceptionDetails!.text}`);
  };
  cdp.on('Target.receivedMessageFromTarget', (event) => {
    if (event.sessionId === sessionId)
      handle([sessionId], JSON.parse(event.message) as Message);
  });
  await enable([sessionId]);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // g0679 and g0683 make Tesseract print "Detected N diacritics" unless its
  // debug output is redirected; the others are ordinary thumbnails.
  const ids = ['g0679', 'g0683', 'g0604', 'g0605'];
  const cards = ids
    .map(
      (id) =>
        `<ytd-rich-item-renderer><div id="content"><yt-lockup-view-model><a href="/watch?v=VG_${id}000"><img></a><h3>Watch this</h3></yt-lockup-view-model></div></ytd-rich-item-renderer>`,
    )
    .join('');
  const page = await openFixture(
    context,
    'https://www.youtube.com/',
    `<body><ytd-app><ytd-rich-grid-renderer><div id="contents">${cards}</div></ytd-rich-grid-renderer></ytd-app></body>`,
  );
  await expect
    .poll(() => page.locator('[data-vg-ok], [data-vg-hit]').count(), {
      timeout: 60_000,
    })
    .toBeGreaterThanOrEqual(ids.length * 2);
  expect(messages).toEqual([]);
});
