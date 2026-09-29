import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { MockStudyProvider } from "./providers/mock-study-provider.js";
import { createStudyServer } from "./server.js";

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(first!.text);
}

describe("createStudyServer", () => {
  let client: Client;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createStudyServer(new MockStudyProvider()).connect(serverTransport);
    client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  it("asks for a course when piazza_search_posts has neither course nor course_id", async () => {
    await expect(callTool(client, "piazza_search_posts", { query: "ownership" })).resolves.toEqual({
      error: "Provide course (for example, STAT 230) or a course_id from piazza_list_courses.",
    });
  });

  it("resolves a human course reference before searching Piazza", async () => {
    await expect(callTool(client, "piazza_search_posts", { course: "CS 246", query: "ownership" })).resolves.toMatchObject([
      { id: "post-1", courseId: "cs-246" },
    ]);
  });

  it("reports a missing Piazza post instead of returning null", async () => {
    await expect(callTool(client, "piazza_get_post", { course_id: "math-239", post_id: "post-1" })).resolves.toEqual({
      error: "Post not found.",
    });
  });

  it("rejects get_upcoming_work requests beyond the 30-day window", async () => {
    const result = await client.callTool({ name: "get_upcoming_work", arguments: { days_ahead: 31 } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/days_ahead/);
  });

  it("returns only outline-like topics from learn_find_course_outlines", async () => {
    await expect(callTool(client, "learn_find_course_outlines", { course_id: "math-239" })).resolves.toEqual([
      expect.objectContaining({ id: "101", title: "Course Outline" }),
    ]);
  });
});
