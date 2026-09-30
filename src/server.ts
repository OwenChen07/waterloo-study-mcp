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
    "Get upcoming LEARN assignments and quizzes due within a requested number of days. Optionally restrict the scan to one course.",
    { days_ahead: z.number().int().min(1).max(30).default(7), course_id: z.string().min(1).optional() },
    async ({ days_ahead, course_id }) => asText(await provider.getUpcomingWork(days_ahead, { courseId: course_id })),
  );

  server.tool(
    "get_study_snapshot",
    "Get courses and upcoming work together. This is the fastest way to start a study-planning request.",
    { days_ahead: z.number().int().min(1).max(30).default(7) },
    async ({ days_ahead }) => asText(await provider.getStudySnapshot(days_ahead)),
  );

  server.tool(
    "get_provider_performance",
    "Show request timing and cache statistics for this local MCP session. It never includes course content or credentials.",
    async () => asText(provider.getPerformanceStats()),
  );

  server.tool(
    "get_announcements",
    "Get LEARN announcements for a course, including safe http(s) links found in their bodies when available.",
    { course_id: z.string().min(1) },
    async ({ course_id }) => asText(await provider.getAnnouncements(course_id)),
  );

  server.tool(
    "learn_list_content",
    "List currently available LEARN course-content modules and topics. Use this to locate outlines, syllabi, schedules, and notes; it does not download their contents.",
    { course_id: z.string().min(1) },
    async ({ course_id }) => asText(await provider.listCourseContent(course_id)),
  );

  server.tool(
    "learn_find_course_outlines",
    "Find currently available LEARN content topics whose titles look like a course outline, syllabus, or assessment schedule. Results include source URLs and topic IDs for learn_get_content_topic.",
    { course_id: z.string().min(1) },
    async ({ course_id }) => asText(await provider.findCourseOutlines(course_id)),
  );

  server.tool(
    "learn_get_content_topic",
    "Read one currently available LEARN content topic by ID. Text and HTML can be returned; non-text files such as PDFs are identified with a source URL rather than being misrepresented as extracted text.",
    { course_id: z.string().min(1), topic_id: z.string().min(1) },
    async ({ course_id, topic_id }) => asText(await provider.getCourseContentTopic(course_id, topic_id)),
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
    "piazza_list_recent_posts",
    "List recent Piazza posts for a course. Use piazza_get_post on a relevant result to retrieve its answers and follow-ups.",
    { course_id: z.string().min(1), limit: z.number().int().min(1).max(50).default(20) },
    async ({ course_id, limit }) => asText(await provider.listRecentPiazzaPosts(course_id, limit)),
  );

  server.tool(
    "piazza_search_posts",
    "Search Piazza posts by text query. Provide course as a human reference such as STAT 230, or a course_id from piazza_list_courses.",
    { course_id: z.string().min(1).optional(), course: z.string().min(2).optional(), query: z.string().min(2).max(200) },
    async ({ course_id, course, query }) => {
      if (!course_id && !course) {
        return asText({ error: "Provide course (for example, STAT 230) or a course_id from piazza_list_courses." });
      }
      const resolvedCourseId = course_id ?? (await provider.resolvePiazzaCourse(course!)).id;
      return asText(await provider.searchPiazzaPosts(resolvedCourseId, query));
    },
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

  server.tool(
    "marmoset_list_courses",
    "List Marmoset course links available to the locally authenticated student. This is read-only and never submits work.",
    async () => asText(await provider.listMarmosetCourses()),
  );

  server.tool(
    "marmoset_list_assignments",
    "List Marmoset assignment/project links for a course URL returned by marmoset_list_courses. This is read-only.",
    { course_url: z.string().url() },
    async ({ course_url }) => asText(await provider.listMarmosetAssignments(course_url)),
  );

  server.tool(
    "marmoset_get_submission_status",
    "Read the status of a Marmoset assignment/project URL returned by marmoset_list_assignments. It reports only pending/tested/unknown status and never exposes source files, numeric marks, or submission controls.",
    { assignment_url: z.string().url() },
    async ({ assignment_url }) => asText(await provider.getMarmosetSubmissionStatus(assignment_url)),
  );

  return server;
}
