import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoalescingCache } from "./CoalescingCache";

describe("CoalescingCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves a fresh fetch on the first call", async () => {
    const cache = new CoalescingCache<number>(1000);
    const fetcher = vi.fn().mockResolvedValue(42);

    await expect(cache.get("key", fetcher)).resolves.toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reuses a cached result within the TTL without calling the fetcher again", async () => {
    const cache = new CoalescingCache<number>(1000);
    const fetcher = vi.fn().mockResolvedValue(42);

    await cache.get("key", fetcher);
    await cache.get("key", fetcher);
    await cache.get("key", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has expired", async () => {
    const cache = new CoalescingCache<number>(1000);
    const fetcher = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await expect(cache.get("key", fetcher)).resolves.toBe(1);
    vi.advanceTimersByTime(1001);
    await expect(cache.get("key", fetcher)).resolves.toBe(2);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("coalesces hundreds of concurrent callers into a single in-flight fetch", async () => {
    const cache = new CoalescingCache<number>(1000);
    let resolveFetch!: (value: number) => void;
    const fetcher = vi.fn().mockReturnValue(
      new Promise<number>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const callers = Array.from({ length: 500 }, () => cache.get("key", fetcher));
    resolveFetch(7);
    const results = await Promise.all(callers);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toEqual(Array.from({ length: 500 }, () => 7));
  });

  it("keeps separate cache entries per key", async () => {
    const cache = new CoalescingCache<string>(1000);
    const fetcher = vi.fn().mockImplementation((key: string) => Promise.resolve(key));

    await expect(cache.get("a", () => fetcher("a"))).resolves.toBe("a");
    await expect(cache.get("b", () => fetcher("b"))).resolves.toBe("b");

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("applies a per-value TTL so some results expire sooner than others", async () => {
    const cache = new CoalescingCache<string>((value) => (value === "ok" ? 10_000 : 1000));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce("fail")
      .mockResolvedValueOnce("ok")
      .mockResolvedValueOnce("ok");

    await expect(cache.get("key", fetcher)).resolves.toBe("fail");
    vi.advanceTimersByTime(1001);
    await expect(cache.get("key", fetcher)).resolves.toBe("ok");

    vi.advanceTimersByTime(1001);
    await expect(cache.get("key", fetcher)).resolves.toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10_000);
    await cache.get("key", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not poison the cache when the fetcher rejects, so the next call retries", async () => {
    const cache = new CoalescingCache<number>(1000);
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(9);

    await expect(cache.get("key", fetcher)).rejects.toThrow("boom");
    await expect(cache.get("key", fetcher)).resolves.toBe(9);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
