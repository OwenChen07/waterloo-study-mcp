export type CacheStats = { hits: number; misses: number };

type Entry = { expiresAt: number; value: Promise<unknown> };

/** Small in-memory cache that also coalesces identical in-flight requests. */
export class TimedAsyncCache {
  private readonly entries = new Map<string, Entry>();
  private stats: CacheStats = { hits: 0, misses: 0 };

  constructor(private readonly now: () => number = Date.now) {}

  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > this.now()) {
      this.stats.hits++;
      return existing.value as Promise<T>;
    }

    this.stats.misses++;
    const value = load();
    const entry: Entry = { expiresAt: this.now() + ttlMs, value };
    this.entries.set(key, entry);
    void value.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return value;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }
}
