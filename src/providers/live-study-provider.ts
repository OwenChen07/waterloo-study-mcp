import type {
  Announcement,
  Course,
  PiazzaFolder,
  PiazzaPost,
  UpcomingWork,
} from "../domain.js";
import type { LearnContentDocument, LearnContentTopic } from "../learn-content.js";
import { getSessionCookieHeader } from "../auth/session-store.js";
import { TimedAsyncCache } from "./timed-cache.js";
import type { ProviderPerformanceStats, StudyProvider, StudySnapshot, UpcomingWorkOptions } from "./study-provider.js";

const LEARN_HOST = "learn.uwaterloo.ca";
const LEARN_BASE = `https://${LEARN_HOST}`;
const LEARN_LP_VERSION = "1.62";
const LEARN_LE_VERSION = "1.96";
const PIAZZA_HOST = "piazza.com";
const PIAZZA_BASE = `https://${PIAZZA_HOST}`;

type D2LEnrollment = {
  OrgUnit?: { Id?: number; Code?: string | null; Name?: string };
  Access?: { CanAccess?: boolean; IsActive?: boolean; StartDate?: string | null; EndDate?: string | null };
};
type D2LCollection<T> = T[] | { Items?: T[]; Objects?: T[]; Next?: string | null };
type D2LAssignment = { Id?: number; Name?: string; DueDate?: string | null };
type D2LQuiz = { QuizId?: number; Name?: string; DueDate?: string | null; EndDate?: string | null };
type D2LNews = {
  Id?: number;
  Title?: string;
  Body?: { Text?: string; Html?: string };
  StartDate?: string | null;
  IsHidden?: boolean;
};
type D2LContentObject = {
  Title?: string;
  ShortTitle?: string;
  Type?: string;
  TopicType?: string;
  TopicId?: number;
  ModuleId?: number;
  Url?: string;
  IsHidden?: boolean;
  IsLocked?: boolean;
  Modules?: D2LContentObject[];
  Topics?: D2LContentObject[];
};
type PiazzaCourse = { id?: string; num?: string; name?: string; term?: string };
type PiazzaFeedItem = {
  nr?: number | string;
  subject?: string;
  content_snipet?: string;
  folders?: string[];
  created?: string;
  updated?: string;
};
type PiazzaProfile = { all_classes?: Record<string, PiazzaCourse> };
type PiazzaFeed = { feed?: PiazzaFeedItem[]; tags?: { popular?: string[]; instructor?: string[] } };
type PiazzaThread = PiazzaFeedItem & {
  content?: string;
  history?: Array<{ content?: string; created?: string }>;
  children?: PiazzaThread[];
  type?: string;
};

export class AuthenticationRequiredError extends Error {
  constructor(service: "learn" | "piazza", detail?: string) {
    super(`${service === "learn" ? "LEARN" : "Piazza"} session is unavailable or expired. Run \`npm run auth:${service}\` and try again.${detail ? ` ${detail}` : ""}`);
    this.name = "AuthenticationRequiredError";
  }
}

export class LiveDataRetrievalError extends Error {
  constructor(detail: string) {
    super(`Could not retrieve complete LEARN coursework data: ${detail}. No upcoming-work result was returned, so this must not be interpreted as nothing due.`);
    this.name = "LiveDataRetrievalError";
  }
}

function plainText(value: string | undefined): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const CONTENT_TEXT_LIMIT = 50_000;
const CONTENT_FILE_LIMIT_BYTES = 10 * 1024 * 1024;

function learnContentUrl(courseId: string, topicId: string, sourceUrl?: string): string {
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl, LEARN_BASE);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
      // Fall back to LEARN's topic view when the TOC contains a malformed URL.
    }
  }
  return `${LEARN_BASE}/d2l/le/content/${courseId}/viewContent/${topicId}/View`;
}

export function flattenContentToc(courseId: string, objects: D2LContentObject[]): LearnContentTopic[] {
  const topics: LearnContentTopic[] = [];
  const visit = (item: D2LContentObject) => {
    const topicId = item.TopicId;
    const moduleId = item.ModuleId;
    if (topicId ?? moduleId) {
      topics.push({
        id: String(topicId ?? moduleId),
        courseId,
        title: item.Title ?? item.ShortTitle ?? "Untitled content",
        kind: topicId ? "topic" : "module",
        topicType: item.TopicType ?? item.Type,
        isHidden: item.IsHidden === true,
        isLocked: item.IsLocked === true,
        url: topicId ? learnContentUrl(courseId, String(topicId), item.Url) : `${LEARN_BASE}/d2l/le/content/${courseId}/Home`,
      });
    }
    for (const child of item.Modules ?? []) visit(child);
    for (const child of item.Topics ?? []) visit(child);
  };
  for (const item of objects) visit(item);
  return topics;
}

export function contentTocRootItems(value: D2LContentObject[] | { Modules?: D2LContentObject[] }): D2LContentObject[] {
  return Array.isArray(value) ? value : (value.Modules ?? []);
}

export function extractHtmlLinks(value: string | undefined): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of (value ?? "").matchAll(pattern)) {
    try {
      const url = new URL(match[2]!, LEARN_BASE);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      const link = { text: plainText(match[3]) || url.toString(), url: url.toString() };
      if (!links.some((existing) => existing.url === link.url && existing.text === link.text)) links.push(link);
    } catch {
      // Ignore malformed and non-web announcement links.
    }
  }
  return links;
}

type AnnouncementWithLinks = Announcement & { links: Array<{ text: string; url: string }> };

function announcementWithLinks(announcement: Announcement, links: Array<{ text: string; url: string }>): AnnouncementWithLinks {
  return { ...announcement, links };
}

export function readableContentText(value: string, contentType: string): { text?: string; truncated: boolean; warning?: string } {
  if (!/^(text\/|application\/(xhtml\+xml|json))/i.test(contentType)) {
    return {
      truncated: false,
      warning: `This topic is ${contentType || "a non-text file"}; its text was not extracted. Open the source URL to read it.`,
    };
  }
  const normalized = /html|xhtml/i.test(contentType)
    ? plainText(value.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ""))
    : value.trim();
  return normalized.length > CONTENT_TEXT_LIMIT
    ? { text: normalized.slice(0, CONTENT_TEXT_LIMIT), truncated: true }
    : { text: normalized, truncated: false };
}

async function extractPdfText(data: Uint8Array): Promise<{ text?: string; truncated: boolean; warning?: string }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data });
  try {
    const document = await loadingTask.promise;
    const pages: string[] = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => "str" in item ? item.str : "")
        .filter(Boolean)
        .join(" ");
      page.cleanup();
      if (!pageText) continue;
      const remaining = CONTENT_TEXT_LIMIT - length;
      if (pageText.length > remaining) {
        pages.push(pageText.slice(0, Math.max(0, remaining)));
        return { text: pages.join("\n\n"), truncated: true };
      }
      pages.push(pageText);
      length += pageText.length;
    }
    const text = pages.join("\n\n").trim();
    return text
      ? { text, truncated: false }
      : { truncated: false, warning: "No selectable text was found in this PDF. It may be a scanned document; open the source URL to read it." };
  } finally {
    await loadingTask.destroy();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function collectionItems<T>(value: D2LCollection<T>): T[] {
  return Array.isArray(value) ? value : (value.Items ?? value.Objects ?? []);
}

export function nextCollectionPath(next: string | null | undefined): string | undefined {
  if (!next) return undefined;
  const url = new URL(next, LEARN_BASE);
  if (url.host !== LEARN_HOST) throw new LiveDataRetrievalError("LEARN returned a pagination link outside its own host");
  return `${url.pathname}${url.search}`;
}

export function requirePiazzaCourse(courses: Course[], courseId: string): void {
  if (!courses.some((course) => course.id === courseId)) {
    throw new Error(
      `Unknown Piazza course_id: ${courseId}. Use piazza_list_courses first; LEARN organization-unit IDs cannot be used with Piazza tools.`,
    );
  }
}

export function resolvePiazzaCourseReference(courses: Course[], reference: string): Course {
  const normalized = reference.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const matches = courses.filter((course) =>
    [course.code, course.name].some((value) => value.replace(/[^a-z0-9]/gi, "").toLowerCase() === normalized),
  );
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) throw new Error(`No Piazza course matches "${reference}". Call piazza_list_courses to see available courses.`);
  throw new Error(`More than one Piazza course matches "${reference}". Call piazza_list_courses and use course_id instead.`);
}

/**
 * Piazza represents a post as a tree: the question is the root and answers and
 * follow-ups are children.  The first history item alone is therefore not a
 * complete discussion (and is often not the instructor's answer).
 */
export function piazzaThreadText(thread: PiazzaThread): string {
  const segments: string[] = [];
  const visit = (node: PiazzaThread, isRoot = false) => {
    const content = plainText(node.history?.[0]?.content ?? node.content);
    if (content) {
      const label = !isRoot && node.type ? `[${node.type}] ` : "";
      const segment = `${label}${content}`;
      if (!segments.includes(segment)) segments.push(segment);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(thread, true);
  return segments.join("\n\n");
}

export class LiveStudyProvider implements StudyProvider {
  private piazzaCsrfToken: string | undefined;
  private readonly cache = new TimedAsyncCache();
  private readonly requestStats = {
    learn: { count: 0, totalMs: 0 },
    piazza: { count: 0, totalMs: 0 },
  };

  private recordRequest(service: "learn" | "piazza", startedAt: number): void {
    this.requestStats[service].count++;
    this.requestStats[service].totalMs += Math.round(performance.now() - startedAt);
  }

  private async learnResponse(path: string, accept: string): Promise<Response> {
    const startedAt = performance.now();
    try {
      const cookie = await getSessionCookieHeader("learn", LEARN_HOST).catch((error) => {
        throw new AuthenticationRequiredError("learn", error instanceof Error ? error.message : undefined);
      });
      const url = new URL(path, LEARN_BASE);
      if (url.hostname !== LEARN_HOST || url.protocol !== "https:") {
        throw new Error("Refusing to send a LEARN session to a non-LEARN URL.");
      }
      const response = await fetch(url, {
        headers: { Accept: accept, Cookie: cookie, "X-Requested-With": "XMLHttpRequest" },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 401 || response.status >= 300 && response.status < 400) {
        throw new AuthenticationRequiredError("learn");
      }
      if (response.status === 403) {
        throw new Error("LEARN denied access to this resource for the current enrollment.");
      }
      if (!response.ok) throw new Error(`LEARN returned an unexpected response (${response.status}).`);
      return response;
    } finally {
      this.recordRequest("learn", startedAt);
    }
  }

  private async learnJson<T>(path: string): Promise<T> {
    const response = await this.learnResponse(path, "application/json");
    if (!(response.headers.get("content-type") ?? "").includes("json")) {
      throw new Error(`LEARN returned non-JSON content (${response.status}).`);
    }
    return response.json() as Promise<T>;
  }

  private async listQuizzes(courseId: string): Promise<D2LQuiz[]> {
    const quizzes: D2LQuiz[] = [];
    let path: string | undefined = `/d2l/api/le/${LEARN_LE_VERSION}/${courseId}/quizzes/`;
    let pages = 0;

    while (path && pages < 10) {
      const page: D2LCollection<D2LQuiz> = await this.learnJson<D2LCollection<D2LQuiz>>(path);
      quizzes.push(...collectionItems(page));
      path = Array.isArray(page) ? undefined : nextCollectionPath(page.Next);
      pages++;
    }

    if (path) throw new LiveDataRetrievalError(`quiz pagination exceeded the 10-page safety limit for course ${courseId}`);
    return quizzes;
  }

  private async piazzaCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const startedAt = performance.now();
    try {
    const cookie = await getSessionCookieHeader("piazza", PIAZZA_HOST).catch((error) => {
      throw new AuthenticationRequiredError("piazza", error instanceof Error ? error.message : undefined);
    });
    if (!this.piazzaCsrfToken) {
      const page = await fetch(`${PIAZZA_BASE}/class`, {
        headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(20_000),
      });
      const html = await page.text();
      const token = /<meta[^>]+name=["']csrf_token["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
      if (!page.ok || !token) throw new AuthenticationRequiredError("piazza");
      this.piazzaCsrfToken = token;
    }

    const response = await fetch(`${PIAZZA_BASE}/logic/api?method=${encodeURIComponent(method)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "CSRF-Token": this.piazzaCsrfToken, Cookie: cookie, Referer: `${PIAZZA_BASE}/class`,
      },
      body: JSON.stringify({ method, params }),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    if (response.status === 401 || response.status === 403 || response.status >= 300 && response.status < 400) {
      this.piazzaCsrfToken = undefined;
      throw new AuthenticationRequiredError("piazza");
    }
    let payload: { result?: T; error?: unknown };
    try { payload = JSON.parse(text) as { result?: T; error?: unknown }; } catch { throw new AuthenticationRequiredError("piazza"); }
    if (payload.error) throw new Error(`Piazza rejected ${method}.`);
    return payload.result as T;
    } finally {
      this.recordRequest("piazza", startedAt);
    }
  }

  async listCourses(): Promise<Course[]> {
    return this.cache.get("learn:courses", 120_000, async () => {
      const result = await this.learnJson<D2LCollection<D2LEnrollment>>(
        `/d2l/api/lp/${LEARN_LP_VERSION}/enrollments/myenrollments/?orgUnitTypeId=3`,
      );
      return collectionItems(result)
        .filter((item) => item.OrgUnit?.Id && item.Access?.CanAccess !== false && item.Access?.IsActive !== false)
        .map((item) => ({
          id: String(item.OrgUnit!.Id),
          code: item.OrgUnit!.Code || item.OrgUnit!.Name || "Course",
          name: item.OrgUnit!.Name || "Unnamed course",
          term: item.Access?.StartDate?.slice(0, 10) ?? "Current",
        }));
    });
  }

  async listPiazzaCourses(): Promise<Course[]> {
    return this.cache.get("piazza:courses", 120_000, async () => {
      const profile = await this.piazzaCall<PiazzaProfile>("user_profile.get_profile");
      return Object.entries(profile.all_classes ?? {}).map(([id, course]) => ({
        id: course.id ?? id,
        code: course.num ?? course.name ?? "Piazza course",
        name: course.name ?? course.num ?? "Unnamed Piazza course",
        term: course.term ?? "Current",
      }));
    });
  }

  async resolvePiazzaCourse(reference: string): Promise<Course> {
    return resolvePiazzaCourseReference(await this.listPiazzaCourses(), reference);
  }

  async getUpcomingWork(daysAhead: number, options: UpcomingWorkOptions = {}): Promise<UpcomingWork[]> {
    const now = options.now ?? new Date();
    if (!options.now) {
      const scope = options.courseId ?? "all";
      return this.cache.get(`learn:upcoming:${scope}:${daysAhead}`, 120_000, () =>
        this.getUpcomingWorkUncached(daysAhead, now, options.courseId),
      );
    }
    return this.getUpcomingWorkUncached(daysAhead, now, options.courseId);
  }

  private async getUpcomingWorkUncached(daysAhead: number, now: Date, courseId?: string): Promise<UpcomingWork[]> {
    const courses = await this.listCourses();
    // Community shells are represented as course offerings but commonly have no term start
    // date and deny coursework endpoints. They remain visible in list_courses, but do not
    // belong in a scan for course deadlines.
    const courseworkCourses = courses.filter((course) => course.term !== "Current" && (!courseId || course.id === courseId));
    const end = new Date(now.getTime() + daysAhead * 86_400_000);
    const perCourse = await Promise.all(courseworkCourses.map(async (course) => {
      const [assignmentResult, quizResult] = await Promise.allSettled([
        this.learnJson<D2LAssignment[]>(`/d2l/api/le/${LEARN_LE_VERSION}/${course.id}/dropbox/folders/`),
        this.listQuizzes(course.id),
      ]);
      const failures = [
        assignmentResult.status === "rejected" ? `${course.code}: assignments (${errorMessage(assignmentResult.reason)})` : undefined,
        quizResult.status === "rejected" ? `${course.code}: quizzes (${errorMessage(quizResult.reason)})` : undefined,
      ].filter((failure): failure is string => Boolean(failure));
      if (failures.length > 0) throw new LiveDataRetrievalError(failures.join("; "));
      if (assignmentResult.status !== "fulfilled" || quizResult.status !== "fulfilled") {
        throw new LiveDataRetrievalError("an unexpected coursework request failure occurred");
      }

      const assignments = assignmentResult.value;
      const quizzes = quizResult.value;
      const assignmentWork = assignments.flatMap((item): UpcomingWork[] => item.Id && item.DueDate ? [{
        id: String(item.Id), courseId: course.id, title: item.Name ?? "Assignment", dueAt: item.DueDate, kind: "assignment",
        url: `${LEARN_BASE}/d2l/lms/dropbox/user/folders_list.d2l?ou=${course.id}`,
      }] : []);
      const quizWork = quizzes.flatMap((item): UpcomingWork[] => {
        const dueAt = item.DueDate ?? item.EndDate;
        return item.QuizId && dueAt ? [{
          id: String(item.QuizId), courseId: course.id, title: item.Name ?? "Quiz", dueAt, kind: "quiz",
          url: `${LEARN_BASE}/d2l/lms/quizzing/user/quizzes_list.d2l?ou=${course.id}`,
        }] : [];
      });
      return [...assignmentWork, ...quizWork];
    }));
    return perCourse.flat().filter((item) => {
      const due = new Date(item.dueAt);
      return due >= now && due <= end;
    }).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  }

  async getStudySnapshot(daysAhead: number): Promise<StudySnapshot> {
    const [courses, upcomingWork] = await Promise.all([this.listCourses(), this.getUpcomingWork(daysAhead)]);
    return { courses, upcomingWork };
  }

  getPerformanceStats(): ProviderPerformanceStats {
    return {
      cache: this.cache.getStats(),
      requests: {
        learn: { ...this.requestStats.learn },
        piazza: { ...this.requestStats.piazza },
      },
    };
  }

  async getAnnouncements(courseId: string): Promise<Announcement[]> {
    return this.cache.get(`learn:announcements:${courseId}`, 90_000, async () => {
      const items = await this.learnJson<D2LNews[]>(`/d2l/api/le/${LEARN_LE_VERSION}/${courseId}/news/`);
      return items.filter((item) => !item.IsHidden).flatMap((item): Announcement[] => item.Id ? [announcementWithLinks({
        id: String(item.Id), courseId, title: item.Title ?? "Announcement", publishedAt: item.StartDate ?? "",
        body: plainText(item.Body?.Text ?? item.Body?.Html),
        url: `${LEARN_BASE}/d2l/le/news/view?ou=${courseId}&itemId=${item.Id}`,
      }, extractHtmlLinks(item.Body?.Html ?? item.Body?.Text))] : []);
    });
  }

  async listCourseContent(courseId: string): Promise<LearnContentTopic[]> {
    return this.cache.get(`learn:content:${courseId}`, 120_000, async () => {
      const toc = await this.learnJson<D2LContentObject[] | { Modules?: D2LContentObject[] }>(
        `/d2l/api/le/${LEARN_LE_VERSION}/${courseId}/content/toc`,
      );
      return flattenContentToc(courseId, contentTocRootItems(toc))
        .filter((topic) => !topic.isHidden && !topic.isLocked);
    });
  }

  async getCourseContentTopic(courseId: string, topicId: string): Promise<LearnContentDocument> {
    const topic = (await this.listCourseContent(courseId)).find((item) => item.kind === "topic" && item.id === topicId);
    if (!topic) {
      throw new Error(`No currently available LEARN content topic with ID ${topicId} was found for course ${courseId}. Use learn_list_content first.`);
    }
    const source = new URL(topic.url);
    if (source.hostname !== LEARN_HOST) {
      return {
        topic, contentType: "external resource", truncated: false,
        warning: "This LEARN topic links to a resource outside LEARN. The server will not send your LEARN session to another host; open the source URL yourself.",
      };
    }
    let response: Response;
    try {
      response = await this.learnResponse(
        `/d2l/api/le/${LEARN_LE_VERSION}/${courseId}/content/topics/${encodeURIComponent(topicId)}/file`,
        "text/html, text/plain, application/xhtml+xml, application/pdf;q=0.8",
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("unexpected response (404)")) {
        return {
          topic, contentType: "unavailable", truncated: false,
          warning: "This LEARN topic does not expose a downloadable text or file resource. Open the source URL to read it.",
        };
      }
      throw error;
    }
    const contentType = (response.headers.get("content-type") ?? "application/octet-stream").split(";", 1)[0]!.trim();
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > CONTENT_FILE_LIMIT_BYTES) {
      throw new Error(`LEARN content topic is larger than the ${CONTENT_FILE_LIMIT_BYTES / 1024 / 1024} MB read-only safety limit. Open the source URL to read it.`);
    }
    const extracted = contentType === "application/pdf"
      ? await (async () => {
        const data = new Uint8Array(await response.arrayBuffer());
        if (data.byteLength > CONTENT_FILE_LIMIT_BYTES) {
          throw new Error(`LEARN content topic is larger than the ${CONTENT_FILE_LIMIT_BYTES / 1024 / 1024} MB read-only safety limit. Open the source URL to read it.`);
        }
        return extractPdfText(data);
      })()
      : readableContentText(await response.text(), contentType);
    return { topic, contentType, ...extracted };
  }

  async findCourseOutlines(courseId: string): Promise<LearnContentTopic[]> {
    const outlineTitle = /\b(course\s*(outline|syllabus)|syllabus|assessment\s*(schedule|plan))\b/i;
    return (await this.listCourseContent(courseId)).filter((topic) => topic.kind === "topic" && outlineTitle.test(topic.title));
  }

  async listPiazzaFolders(courseId: string): Promise<PiazzaFolder[]> {
    const feed = await this.piazzaCall<PiazzaFeed>("network.get_my_feed", { nid: courseId, limit: 1, offset: 0, sort: "date_desc" });
    return [...new Set([...(feed.tags?.popular ?? []), ...(feed.tags?.instructor ?? [])])]
      .map((name) => ({ id: name, courseId, name }));
  }

  async listRecentPiazzaPosts(courseId: string, limit = 20): Promise<PiazzaPost[]> {
    const feed = await this.piazzaCall<PiazzaFeed>("network.get_my_feed", {
      nid: courseId, limit, offset: 0, sort: "date_desc",
    });
    return (feed.feed ?? []).flatMap((item): PiazzaPost[] => item.nr !== undefined ? [{
      id: String(item.nr), courseId, folderIds: item.folders ?? [], subject: item.subject ?? "Untitled post",
      content: plainText(item.content_snipet), createdAt: item.created ?? item.updated ?? "",
      url: `${PIAZZA_BASE}/class/${courseId}/post/${item.nr}`,
    }] : []);
  }

  async searchPiazzaPosts(courseId: string, query: string): Promise<PiazzaPost[]> {
    try {
      const results = await this.piazzaCall<PiazzaFeedItem[]>("network.search", { nid: courseId, query });
      return results.flatMap((item): PiazzaPost[] => item.nr !== undefined ? [{
        id: String(item.nr), courseId, folderIds: item.folders ?? [], subject: item.subject ?? "Untitled post",
        content: plainText(item.content_snipet), createdAt: item.created ?? item.updated ?? "", url: `${PIAZZA_BASE}/class/${courseId}/post/${item.nr}`,
      }] : []);
    } catch (error) {
      if (error instanceof Error && error.message === "Piazza rejected network.search.") {
        requirePiazzaCourse(await this.listPiazzaCourses(), courseId);
      }
      throw error;
    }
  }

  async getPiazzaPost(courseId: string, postId: string): Promise<PiazzaPost | undefined> {
    const item = await this.piazzaCall<PiazzaThread>("content.get", { nid: courseId, cid: postId });
    if (!item || item.nr === undefined) return undefined;
    return {
      id: String(item.nr), courseId, folderIds: item.folders ?? [], subject: item.subject ?? "Untitled post",
      content: piazzaThreadText(item), createdAt: item.history?.[0]?.created ?? item.created ?? "",
      url: `${PIAZZA_BASE}/class/${courseId}/post/${item.nr}`,
    };
  }
}
