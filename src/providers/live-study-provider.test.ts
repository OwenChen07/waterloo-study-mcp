import { describe, expect, it } from "vitest";
import { collectionItems, nextCollectionPath, piazzaThreadText } from "./live-study-provider.js";

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

  it("includes the question, answers, and nested follow-ups in a Piazza thread", () => {
    expect(piazzaThreadText({
      content: "When is assignment one due?",
      children: [{
        type: "i_answer",
        history: [{ content: "It is due Friday at 5 PM." }],
        children: [{ type: "followup", content: "The course outline has the same date." }],
      }],
    })).toBe(
      "When is assignment one due?\n\n[i_answer] It is due Friday at 5 PM.\n\n[followup] The course outline has the same date.",
    );
  });
});
