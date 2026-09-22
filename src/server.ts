import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StudyProvider } from "./providers/study-provider.js";

const asText = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export function createStudyServer(provider: StudyProvider): McpServer {
  const server = new McpServer({ name: "waterloo-study-mcp", version: "0.1.0" });

  server.tool("list_courses", "List the available LEARN courses from the configured data provider.", async () =>
    asText(await provider.listCourses()),
  );

  server.tool(
    "get_upcoming_work",
    "Get upcoming LEARN assignments and quizzes due within a requested number of days.",
    { days_ahead: z.number().int().min(1).max(30).default(7) },
    async ({ days_ahead }) => asText(await provider.getUpcomingWork(days_ahead)),
  );

  server.tool(
    "get_announcements",
    "Get LEARN announcements for a course.",
    { course_id: z.string().min(1) },
    async ({ course_id }) => asText(await provider.getAnnouncements(course_id)),
  );

  server.tool("piazza_list_courses", "List the available Piazza courses from the configured data provider.", async () =>
    asText(await provider.listPiazzaCourses()),
  );

  server.tool(
    "piazza_list_folders",
    "List Piazza folders for a course.",
    { course_id: z.string().min(1) },
    async ({ course_id }) => asText(await provider.listPiazzaFolders(course_id)),
  );

  server.tool(
    "piazza_search_posts",
    "Search Piazza posts by course and text query.",
    { course_id: z.string().min(1), query: z.string().min(2).max(200) },
    async ({ course_id, query }) => asText(await provider.searchPiazzaPosts(course_id, query)),
  );

  server.tool(
    "piazza_get_post",
    "Get one complete Piazza discussion by course and post identifier, including answers and follow-ups when available.",
    { course_id: z.string().min(1), post_id: z.string().min(1) },
    async ({ course_id, post_id }) => {
      const post = await provider.getPiazzaPost(course_id, post_id);
      return post ? asText(post) : asText({ error: "Post not found." });
    },
  );

  return server;
}
