# @lp-labs/pdf-render-session

Coordinates asynchronous page rendering through an injected renderer, with viewport-keyed in-flight
deduplication, cancellation, bounded LRU caching, and explicit close behavior.

## Install and quick start

```sh
npm install @lp-labs/pdf-render-session
```

```js
import { createPdfRenderSession } from '@lp-labs/pdf-render-session';

const session = createPdfRenderSession(
  async ({ page, viewport }, signal) => {
    signal.throwIfAborted();
    return { page, pixels: `${viewport.width}x${viewport.height}` };
  },
  { maxCacheEntries: 32 },
);
console.log(
  await session.render({
    page: 0,
    viewport: { x: 0, y: 0, width: 600, height: 800, scale: 1 },
  }),
);
session.close();
```

## API, types, and customization

- Inject a `PdfPageRenderer<T>` accepting immutable `PdfRenderRequest`/`PdfRenderViewport` values and
  a session-level `AbortSignal`; return `Promise<T>`. `createPdfRenderSession(renderer, options?)`
  creates `PdfRenderSession<T>`.
- `render(request, signal?)` shares identical in-flight work and caches successful results by page,
  viewport, and scale. The optional caller signal cancels only that caller's wait; `close()` aborts
  adapter work and blocks new renders. Renderer errors are propagated so callers can retry.
- `clearCache()` removes cached entries; `stats()` reports cache/in-flight/completed/closed state.
  `PdfRenderSessionOptions.maxCacheEntries` defaults to 64 (0 disables caching); `cloneResult`
  protects mutable render results when the adapter supplies a copy function.
- `PdfRenderSessionError` codes are `invalid`, `closed`, `aborted`, and `limit`. Pages are zero-based;
  viewport sizes and scale must be finite and positive, and origins nonnegative.

## Interoperability and scope

Provide a renderer backed by your chosen PDF library; this package knows nothing about PDF bytes,
canvas, workers, or pixel formats. Cached `T` values are returned by identity unless `cloneResult`
is configured. The cache is bounded by entry count, not byte size; use explicit viewport tiles and a
copy function suited to your renderer's result type.

ESM, CommonJS, and TypeScript declarations are included. There are no runtime or peer dependencies;
TypeScript and Prettier are development-only.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
