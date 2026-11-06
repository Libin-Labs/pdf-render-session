import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfRenderSession } from '../dist/esm/index.js';

const request = {
  page: 0,
  viewport: { x: 0, y: 0, width: 100, height: 80, scale: 1 },
};

test('renders asynchronously, deduplicates in-flight work, and caches detached results', async () => {
  let calls = 0;
  const session = createPdfRenderSession(
    async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Uint8Array([calls]);
    },
    { cloneResult: (bytes) => new Uint8Array(bytes) },
  );
  const [first, second] = await Promise.all([session.render(request), session.render(request)]);
  assert.equal(calls, 1);
  first[0] = 99;
  assert.equal(second[0], 1);
  assert.equal((await session.render(request))[0], 1);
  assert.equal(session.stats().completed, 1);
  session.close();
});

test('per-request cancellation does not cancel other readers of the shared render', async () => {
  let finish;
  const session = createPdfRenderSession(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const cancelled = session.render(request, controller.signal);
  const survivor = session.render(request);
  controller.abort();
  await assert.rejects(cancelled, { code: 'aborted' });
  finish('pixels');
  assert.equal(await survivor, 'pixels');
  session.close();
});

test('rejects invalid requests, preserves renderer errors, and permits retry', async () => {
  let attempts = 0;
  const session = createPdfRenderSession(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('adapter failed');
    return 'ok';
  });
  await assert.rejects(session.render({ ...request, page: -1 }), {
    code: 'invalid',
  });
  await assert.rejects(session.render(request), /adapter failed/);
  assert.equal(await session.render(request), 'ok');
  session.close();
});

test('caches a successful undefined adapter result', async () => {
  let calls = 0;
  const session = createPdfRenderSession(async () => {
    calls += 1;
    return undefined;
  });
  assert.equal(await session.render(request), undefined);
  assert.equal(await session.render(request), undefined);
  assert.equal(calls, 1);
  session.close();
});

test('close aborts adapter work, clears cache, and blocks future renders', async () => {
  let adapterSignal;
  const session = createPdfRenderSession((_input, signal) => {
    adapterSignal = signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('aborted by adapter')), {
        once: true,
      }),
    );
  });
  const pending = session.render(request);
  await Promise.resolve();
  session.close();
  assert.equal(adapterSignal.aborted, true);
  await assert.rejects(pending, /aborted by adapter/);
  assert.equal(session.stats().closed, true);
  await assert.rejects(session.render(request), { code: 'closed' });
});
