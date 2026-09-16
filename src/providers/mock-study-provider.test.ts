import { describe, expect, it } from "vitest";
import { MockStudyProvider } from "./mock-study-provider.js";

describe("MockStudyProvider", () => {
  const provider = new MockStudyProvider();

  it("returns upcoming work inside the requested window", async () => {
    const now = new Date("2026-09-16T12:00:00-04:00");
    const items = await provider.getUpcomingWork(3, now);

    expect(items.map((item) => item.id)).toEqual(["a2"]);
  });

  it("searches Piazza posts within one course", async () => {
    const items = await provider.searchPiazzaPosts("cs-246", "ownership");

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("post-1");
  });

  it("does not return a post from a different course", async () => {
    await expect(provider.getPiazzaPost("math-239", "post-1")).resolves.toBeUndefined();
  });
});
