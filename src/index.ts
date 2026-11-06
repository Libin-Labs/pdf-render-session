export interface PdfRenderViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}
export interface PdfRenderRequest {
  readonly page: number;
  readonly viewport: PdfRenderViewport;
}
export type PdfPageRenderer<T> = (
  request: Readonly<PdfRenderRequest>,
  signal: AbortSignal,
) => Promise<T>;

export class PdfRenderSessionError extends Error {
  constructor(
    readonly code: 'invalid' | 'closed' | 'aborted' | 'limit',
    message: string,
  ) {
    super(message);
    this.name = 'PdfRenderSessionError';
  }
}

export interface PdfRenderSessionOptions<T> {
  readonly maxCacheEntries?: number;
  readonly cloneResult?: (result: T) => T;
}

interface Pending<T> {
  readonly controller: AbortController;
  readonly promise: Promise<T>;
}

export class PdfRenderSession<T> {
  private readonly cache = new Map<string, T>();
  private readonly pending = new Map<string, Pending<T>>();
  private readonly maxCacheEntries: number;
  private closed = false;
  private completed = 0;

  constructor(
    private readonly renderer: PdfPageRenderer<T>,
    options: PdfRenderSessionOptions<T> = {},
  ) {
    this.maxCacheEntries = options.maxCacheEntries ?? 64;
    this.cloneResult = options.cloneResult ?? ((result) => result);
    if (
      !Number.isSafeInteger(this.maxCacheEntries) ||
      this.maxCacheEntries < 0 ||
      this.maxCacheEntries > 10_000
    ) {
      throw new PdfRenderSessionError('invalid', 'Cache entries must be between 0 and 10,000.');
    }
  }

  private readonly cloneResult: (result: T) => T;

  async render(request: PdfRenderRequest, signal?: AbortSignal): Promise<T> {
    if (this.closed) throw new PdfRenderSessionError('closed', 'Render session is closed.');
    this.validateRequest(request);
    if (signal?.aborted)
      throw new PdfRenderSessionError('aborted', 'Render request was cancelled.');
    const key = this.key(request);
    const cached = this.cache.get(key);
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.cache.set(key, cached as T);
      return this.cloneResult(cached as T);
    }
    let task = this.pending.get(key);
    if (!task) {
      const controller = new AbortController();
      const frozen = Object.freeze({
        page: request.page,
        viewport: Object.freeze({ ...request.viewport }),
      });
      const promise = Promise.resolve()
        .then(() => this.renderer(frozen, controller.signal))
        .then((result) => {
          if (this.closed)
            throw new PdfRenderSessionError(
              'closed',
              'Render session closed before rendering completed.',
            );
          this.completed += 1;
          if (this.maxCacheEntries > 0) this.store(key, this.cloneResult(result));
          return result;
        });
      task = { controller, promise };
      this.pending.set(key, task);
      void promise.then(
        () => {
          if (this.pending.get(key) === task) this.pending.delete(key);
        },
        () => {
          if (this.pending.get(key) === task) this.pending.delete(key);
        },
      );
    }
    return this.waitFor(task.promise, signal).then((result) => this.cloneResult(result));
  }

  clearCache(): void {
    this.cache.clear();
  }

  stats(): Readonly<{
    cacheEntries: number;
    inFlight: number;
    completed: number;
    closed: boolean;
  }> {
    return Object.freeze({
      cacheEntries: this.cache.size,
      inFlight: this.pending.size,
      completed: this.completed,
      closed: this.closed,
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cache.clear();
    for (const task of this.pending.values()) task.controller.abort();
  }

  private store(key: string, value: T): void {
    this.cache.set(key, value);
    while (this.cache.size > this.maxCacheEntries)
      this.cache.delete(this.cache.keys().next().value!);
  }

  private key(request: PdfRenderRequest): string {
    const { x, y, width, height, scale } = request.viewport;
    return `${request.page}:${x}:${y}:${width}:${height}:${scale}`;
  }

  private validateRequest(request: PdfRenderRequest): void {
    if (
      !Number.isSafeInteger(request.page) ||
      request.page < 0 ||
      ![
        request.viewport.x,
        request.viewport.y,
        request.viewport.width,
        request.viewport.height,
        request.viewport.scale,
      ].every(Number.isFinite) ||
      request.viewport.x < 0 ||
      request.viewport.y < 0 ||
      request.viewport.width <= 0 ||
      request.viewport.height <= 0 ||
      request.viewport.scale <= 0
    ) {
      throw new PdfRenderSessionError(
        'invalid',
        'Page index and viewport coordinates must be finite and in range.',
      );
    }
  }

  private waitFor(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted)
      return Promise.reject(new PdfRenderSessionError('aborted', 'Render request was cancelled.'));
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        signal.removeEventListener('abort', onAbort);
        reject(new PdfRenderSessionError('aborted', 'Render request was cancelled.'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }
}

export function createPdfRenderSession<T>(
  renderer: PdfPageRenderer<T>,
  options?: PdfRenderSessionOptions<T>,
): PdfRenderSession<T> {
  return new PdfRenderSession(renderer, options);
}
