interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Canonical rate-limit-safe request strategy for exchange clients (see DECISIONS.md):
 * concurrent callers for the same key share one in-flight fetch, and the resolved result
 * (success or typed failure) is served from cache afterwards. Bounds the downstream
 * request rate regardless of caller volume. `ttl` may vary by resolved value so a cached
 * failure can expire sooner than a cached success.
 */
export class CoalescingCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly ttlFor: (value: T) => number;

  constructor(ttl: number | ((value: T) => number)) {
    this.ttlFor = typeof ttl === "number" ? () => ttl : ttl;
  }

  async get(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }

    const promise = fetcher()
      .then((value) => {
        this.entries.set(key, { value, expiresAt: Date.now() + this.ttlFor(value) });
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }
}
