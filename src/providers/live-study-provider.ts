import type {
  Announcement,
  Course,
  PiazzaFolder,
  PiazzaPost,
  UpcomingWork,
} from "../domain.js";
import { getSessionCookieHeader } from "../auth/session-store.js";
import type { StudyProvider } from "./study-provider.js";

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
type D2LPage<T> = T[] | { Items?: T[] };
type D2LAssignment = { Id?: number; Name?: string; DueDate?: string | null };
type D2LQuiz = { QuizId?: number; Name?: string; DueDate?: string | null; EndDate?: string | null };
type D2LNews = {
  Id?: number;
  Title?: string;
  Body?: { Text?: string; Html?: string };
  StartDate?: string | null;
  IsHidden?: boolean;
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
};

export class AuthenticationRequiredError extends Error {
  constructor(service: "learn" | "piazza", detail?: string) {
    super(`${service === "learn" ? "LEARN" : "Piazza"} session is unavailable or expired. Run \`npm run auth:${service}\` and try again.${detail ? ` ${detail}` : ""}`);
    this.name = "AuthenticationRequiredError";
  }
}

function plainText(value: string | undefined): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function pageItems<T>(value: D2LPage<T>): T[] {
  return Array.isArray(value) ? value : (value.Items ?? []);
}

export class LiveStudyProvider implements StudyProvider {
  private piazzaCsrfToken: string | undefined;

  private async learnJson<T>(path: string): Promise<T> {
    const cookie = await getSessionCookieHeader("learn", LEARN_HOST).catch((error) => {
      throw new AuthenticationRequiredError("learn", error instanceof Error ? error.message : undefined);
    });
    const response = await fetch(`${LEARN_BASE}${path}`, {
      headers: { Accept: "application/json", Cookie: cookie, "X-Requested-With": "XMLHttpRequest" },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403 || response.status >= 300 && response.status < 400) {
      throw new AuthenticationRequiredError("learn");
    }
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) {
      throw new Error(`LEARN returned an unexpected response (${response.status}).`);
    }
    return response.json() as Promise<T>;
  }

  private async piazzaCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
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
  }

  async listCourses(): Promise<Course[]> {
    const result = await this.learnJson<D2LPage<D2LEnrollment>>(
      `/d2l/api/lp/${LEARN_LP_VERSION}/enrollments/myenrollments/?orgUnitTypeId=3`,
    );
    return pageItems(result)
      .filter((item) => item.OrgUnit?.Id && item.Access?.CanAccess !== false && item.Access?.IsActive !== false)
      .map((item) => ({
        id: String(item.OrgUnit!.Id),
        code: item.OrgUnit!.Code || item.OrgUnit!.Name || "Course",
        name: item.OrgUnit!.Name || "Unnamed course",
        term: item.Access?.StartDate?.slice(0, 10) ?? "Current",
      }));
  }

  async listPiazzaCourses(): Promise<Course[]> {
    const profile = await this.piazzaCall<PiazzaProfile>("user_profile.get_profile");
    return Object.entries(profile.all_classes ?? {}).map(([id, course]) => ({
      id: course.id ?? id,
      code: course.num ?? course.name ?? "Piazza course",
      name: course.name ?? course.num ?? "Unnamed Piazza course",
      term: course.term ?? "Current",
    }));
  }

  async getUpcomingWork(daysAhead: number, now = new Date()): Promise<UpcomingWork[]> {
    const courses = await this.listCourses();
    const end = new Date(now.getTime() + daysAhead * 86_400_000);
    const perCourse = await Promise.all(courses.map(async (course) => {
      const [assignments, quizzes] = await Promise.all([
        this.learnJson<D2LAssignment[]>(`/d2l/api/le/${LEARN_LE_VERSION}/${course.id}/dropbox/folders/`).catch(() => []),
        this.learnJson<D2LPage<D2LQuiz>>(`/d2l/api/le/${LEARN_LE_VERSION}/${course.id}/quizzes/`).catch(() => []),
      ]);
      const assignmentWork = assignments.flatMap((item): UpcomingWork[] => item.Id && item.DueDate ? [{
        id: String(item.Id), courseId: course.id, title: item.Name ?? "Assignment", dueAt: item.DueDate, kind: "assignment",
        url: `${LEARN_BASE}/d2l/lms/dropbox/user/folders_list.d2l?ou=${course.id}`,
      }] : []);
      const quizWork = pageItems(quizzes).flatMap((item): UpcomingWork[] => {
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

  async getAnnouncements(courseId: string): Promise<Announcement[]> {
    const items = await this.learnJson<D2LNews[]>(`/d2l/api/le/${LEARN_LE_VERSION}/${courseId}/news/`);
    return items.filter((item) => !item.IsHidden).flatMap((item): Announcement[] => item.Id ? [{
      id: String(item.Id), courseId, title: item.Title ?? "Announcement", publishedAt: item.StartDate ?? "",
      body: plainText(item.Body?.Text ?? item.Body?.Html),
      url: `${LEARN_BASE}/d2l/le/news/view?ou=${courseId}&itemId=${item.Id}`,
    }] : []);
  }

  async listPiazzaFolders(courseId: string): Promise<PiazzaFolder[]> {
    const feed = await this.piazzaCall<PiazzaFeed>("network.get_my_feed", { nid: courseId, limit: 1, offset: 0, sort: "date_desc" });
    return [...new Set([...(feed.tags?.popular ?? []), ...(feed.tags?.instructor ?? [])])]
      .map((name) => ({ id: name, courseId, name }));
  }

  async searchPiazzaPosts(courseId: string, query: string): Promise<PiazzaPost[]> {
    const results = await this.piazzaCall<PiazzaFeedItem[]>("network.search", { nid: courseId, query });
    return results.flatMap((item): PiazzaPost[] => item.nr !== undefined ? [{
      id: String(item.nr), courseId, folderIds: item.folders ?? [], subject: item.subject ?? "Untitled post",
      content: plainText(item.content_snipet), createdAt: item.created ?? item.updated ?? "", url: `${PIAZZA_BASE}/class/${courseId}/post/${item.nr}`,
    }] : []);
  }

  async getPiazzaPost(courseId: string, postId: string): Promise<PiazzaPost | undefined> {
    const item = await this.piazzaCall<PiazzaThread>("content.get", { nid: courseId, cid: postId });
    if (!item || item.nr === undefined) return undefined;
    return {
      id: String(item.nr), courseId, folderIds: item.folders ?? [], subject: item.subject ?? "Untitled post",
      content: plainText(item.history?.[0]?.content ?? item.content), createdAt: item.history?.[0]?.created ?? item.created ?? "",
      url: `${PIAZZA_BASE}/class/${courseId}/post/${item.nr}`,
    };
  }
}
