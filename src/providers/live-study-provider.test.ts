import { describe, expect, it } from "vitest";
import {
  collectionItems,
  contentTocRootItems,
  extractHtmlLinks,
  flattenContentToc,
  nextCollectionPath,
  piazzaThreadText,
  readableContentText,
  requirePiazzaCourse,
  resolvePiazzaCourseReference,
} from "./live-study-provider.js";

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

  it("flattens both nested content modules and their separate topic list", () => {
    const toc = contentTocRootItems({
      Modules: [{
        ModuleId: 1, Title: "Start here", Modules: [{ ModuleId: 2, Title: "Week 1" }],
        Topics: [{ TopicId: 31, Title: "Course Outline", TopicType: "File", Url: "https://outline.example.edu/view" }],
      }],
    });
    expect(flattenContentToc("1288629", toc)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "1", kind: "module", title: "Start here" }),
      expect.objectContaining({ id: "2", kind: "module", title: "Week 1" }),
      expect.objectContaining({
        id: "31", kind: "topic", title: "Course Outline", topicType: "File", url: "https://outline.example.edu/view",
      }),
    ]));
  });

  it("preserves safe announcement links while ignoring javascript URLs", () => {
    expect(extractHtmlLinks('<a href="/d2l/le/content/1/Home">outline</a><a href="javascript:alert(1)">bad</a>')).toEqual([
      { text: "outline", url: "https://learn.uwaterloo.ca/d2l/le/content/1/Home" },
    ]);
  });

  it("does not claim to extract text from a PDF", () => {
    expect(readableContentText("%PDF", "application/pdf")).toMatchObject({
      truncated: false,
      warning: expect.stringContaining("application/pdf"),
    });
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

  it("requires a Piazza network identifier rather than a LEARN organization-unit identifier", () => {
    expect(() => requirePiazzaCourse([{ id: "piazza-network", code: "CS 245", name: "Logic", term: "Fall" }], "1288499"))
      .toThrow("piazza_list_courses");
  });

  it("resolves punctuation-free course references such as STAT230", () => {
    expect(resolvePiazzaCourseReference([{ id: "network", code: "STAT 230", name: "Statistics", term: "Fall" }], "STAT230"))
      .toMatchObject({ id: "network" });
  });
});
