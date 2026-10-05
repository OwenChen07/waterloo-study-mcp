import { describe, expect, it, vi } from "vitest";
import { TimedAsyncCache } from "./timed-cache.js";

describe("TimedAsyncCache", () => {
  it("reuses an in-flight and fresh result, then refreshes after expiry", async () => {
    let now = 1_000;
    const cache = new TimedAsyncCache(() => now);
    const load = vi.fn(async () => "value");

    await Promise.all([cache.get("courses", 100, load), cache.get("courses", 100, load)]);
    expect(load).toHaveBeenCalledOnce();

    now += 101;
    await cache.get("courses", 100, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.getStats()).toEqual({ hits: 1, misses: 2 });
  });

  it("does not keep failed requests cached", async () => {
    const cache = new TimedAsyncCache();
    const load = vi.fn().mockRejectedValue(new Error("unavailable"));
    await expect(cache.get("courses", 100, load)).rejects.toThrow("unavailable");
    await expect(cache.get("courses", 100, load)).rejects.toThrow("unavailable");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps separate keys independent", async () => {
    const cache = new TimedAsyncCache();
    const load = vi.fn(async () => "value");
    await cache.get("a", 100, load);
    await cache.get("b", 100, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.getStats()).toEqual({ hits: 0, misses: 2 });
  });

  it("does not evict a newer entry when an expired request fails late", async () => {
    let now = 1_000;
    const cache = new TimedAsyncCache(() => now);
    let rejectOld!: (error: Error) => void;
    const oldLoad = () => new Promise<string>((_, reject) => (rejectOld = reject));
    const oldRequest = cache.get("courses", 100, oldLoad);
    const oldOutcome = expect(oldRequest).rejects.toThrow("late failure");

    now += 101;
    const newLoad = vi.fn(async () => "fresh");
    await cache.get("courses", 100, newLoad);

    rejectOld(new Error("late failure"));
    await oldOutcome;

    await expect(cache.get("courses", 100, newLoad)).resolves.toBe("fresh");
    expect(newLoad).toHaveBeenCalledOnce();
  });
});
