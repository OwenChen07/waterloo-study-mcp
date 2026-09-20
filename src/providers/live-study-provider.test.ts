import { describe, expect, it } from "vitest";
import { collectionItems, nextCollectionPath } from "./live-study-provider.js";

describe("LEARN collection handling", () => {
  it("reads Brightspace quiz collections returned under Objects", () => {
    expect(collectionItems({ Objects: [{ QuizId: 42 }] })).toEqual([{ QuizId: 42 }]);
  });

  it("uses a same-host pagination link without permitting an external host", () => {
    expect(nextCollectionPath("/d2l/api/le/1.96/123/quizzes/?page=2")).toBe(
      "/d2l/api/le/1.96/123/quizzes/?page=2",
    );
    expect(() => nextCollectionPath("https://example.com/page")).toThrow("outside its own host");
  });

  it("accepts a bare collection as well as Brightspace wrapper objects", () => {
    expect(collectionItems([{ QuizId: 99 }])).toEqual([{ QuizId: 99 }]);
  });
});
