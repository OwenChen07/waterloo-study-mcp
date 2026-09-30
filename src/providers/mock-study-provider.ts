import type {
  Announcement,
  Course,
  PiazzaFolder,
  PiazzaPost,
  UpcomingWork,
} from "../domain.js";
import type { LearnContentDocument, LearnContentTopic } from "../learn-content.js";
import type { MarmosetAssignment, MarmosetCourse, MarmosetSubmissionStatus } from "../marmoset.js";
import type { ProviderPerformanceStats, StudyProvider, StudySnapshot, UpcomingWorkOptions } from "./study-provider.js";

const courses: Course[] = [
  { id: "cs-246", code: "CS 246", name: "Object-Oriented Software Development", term: "Fall 2026" },
  { id: "math-239", code: "MATH 239", name: "Introduction to Combinatorics", term: "Fall 2026" },
];

const work: UpcomingWork[] = [
  {
    id: "a2",
    courseId: "cs-246",
    title: "Assignment 2: Memory management",
    dueAt: "2026-09-18T23:59:00-04:00",
    kind: "assignment",
    url: "https://learn.example.invalid/cs-246/assignments/a2",
  },
  {
    id: "q1",
    courseId: "math-239",
    title: "Weekly quiz 1",
    dueAt: "2026-09-20T17:00:00-04:00",
    kind: "quiz",
    url: "https://learn.example.invalid/math-239/quizzes/q1",
  },
];

const announcements: Announcement[] = [
  {
    id: "cs-246-welcome",
    courseId: "cs-246",
    title: "Assignment 2 is available",
    publishedAt: "2026-09-14T09:00:00-04:00",
    body: "The assignment specification and starter files are now available.",
    url: "https://learn.example.invalid/cs-246/announcements/1",
  },
];

const content: LearnContentTopic[] = [
  {
    id: "101", courseId: "math-239", title: "Course Outline", kind: "topic", topicType: "File",
    isHidden: false, isLocked: false, url: "https://learn.example.invalid/math-239/content/course-outline",
  },
  {
    id: "102", courseId: "math-239", title: "Week 1 notes", kind: "topic", topicType: "File",
    isHidden: false, isLocked: false, url: "https://learn.example.invalid/math-239/content/week-1",
  },
];

const folders: PiazzaFolder[] = [
  { id: "general", courseId: "cs-246", name: "General" },
  { id: "assignments", courseId: "cs-246", name: "Assignments" },
];

const posts: PiazzaPost[] = [
  {
    id: "post-1",
    courseId: "cs-246",
    folderIds: ["assignments"],
    subject: "Clarification on assignment 2 ownership",
    content: "Use RAII to make ownership explicit; do not return owning raw pointers.",
    createdAt: "2026-09-15T10:30:00-04:00",
    url: "https://piazza.example.invalid/cs-246/post/1",
  },
];

const marmosetCourses: MarmosetCourse[] = [
  { id: "cs-246", name: "CS 246 – Fall 2026", url: "https://marmoset.example.invalid/course/cs-246" },
];
const marmosetAssignments: MarmosetAssignment[] = [
  { id: "a1", courseId: "cs-246", name: "Assignment 1", url: "https://marmoset.example.invalid/project/a1" },
];

export class MockStudyProvider implements StudyProvider {
  async listCourses(): Promise<Course[]> {
    return courses;
  }

  async listPiazzaCourses(): Promise<Course[]> {
    return courses.filter((course) => course.id === "cs-246");
  }

  async resolvePiazzaCourse(reference: string): Promise<Course> {
    const normalized = reference.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const matches = (await this.listPiazzaCourses()).filter((course) =>
      [course.code, course.name].some((value) => value.replace(/[^a-z0-9]/gi, "").toLowerCase() === normalized),
    );
    if (matches.length !== 1) throw new Error(`Could not identify one Piazza course from: ${reference}.`);
    return matches[0]!;
  }

  async getUpcomingWork(daysAhead: number, options: UpcomingWorkOptions = {}): Promise<UpcomingWork[]> {
    const now = options.now ?? new Date();
    const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    return work.filter(({ dueAt, courseId }) => {
      const due = new Date(dueAt);
      return (!options.courseId || courseId === options.courseId) && due >= now && due <= end;
    });
  }

  async getStudySnapshot(daysAhead: number): Promise<StudySnapshot> {
    return { courses: await this.listCourses(), upcomingWork: await this.getUpcomingWork(daysAhead) };
  }

  getPerformanceStats(): ProviderPerformanceStats {
    return { cache: { hits: 0, misses: 0 }, requests: { learn: { count: 0, totalMs: 0 }, piazza: { count: 0, totalMs: 0 }, marmoset: { count: 0, totalMs: 0 } } };
  }

  async getAnnouncements(courseId: string): Promise<Announcement[]> {
    return announcements.filter((announcement) => announcement.courseId === courseId);
  }

  async listCourseContent(courseId: string): Promise<LearnContentTopic[]> {
    return content.filter((topic) => topic.courseId === courseId);
  }

  async getCourseContentTopic(courseId: string, topicId: string): Promise<LearnContentDocument> {
    const topic = (await this.listCourseContent(courseId)).find((item) => item.id === topicId);
    if (!topic) throw new Error(`No content topic ${topicId} exists for ${courseId}.`);
    return {
      topic, contentType: "text/html", truncated: false,
      text: topic.title === "Course Outline" ? "Mock course outline: weekly quizzes are written in tutorial." : "Mock course notes.",
    };
  }

  async findCourseOutlines(courseId: string): Promise<LearnContentTopic[]> {
    return (await this.listCourseContent(courseId)).filter((topic) => /course\s*(outline|syllabus)|syllabus/i.test(topic.title));
  }

  async listPiazzaFolders(courseId: string): Promise<PiazzaFolder[]> {
    return folders.filter((folder) => folder.courseId === courseId);
  }

  async listRecentPiazzaPosts(courseId: string, limit = 20): Promise<PiazzaPost[]> {
    return posts.filter((post) => post.courseId === courseId).slice(0, limit);
  }

  async searchPiazzaPosts(courseId: string, query: string): Promise<PiazzaPost[]> {
    const normalizedQuery = query.trim().toLowerCase();
    return posts.filter((post) =>
      post.courseId === courseId &&
      `${post.subject} ${post.content}`.toLowerCase().includes(normalizedQuery),
    );
  }

  async getPiazzaPost(courseId: string, postId: string): Promise<PiazzaPost | undefined> {
    return posts.find((post) => post.courseId === courseId && post.id === postId);
  }

  async listMarmosetCourses(): Promise<MarmosetCourse[]> { return marmosetCourses; }

  async listMarmosetAssignments(courseUrl: string): Promise<MarmosetAssignment[]> {
    return marmosetAssignments.filter((assignment) => courseUrl.includes(assignment.courseId));
  }

  async getMarmosetSubmissionStatus(assignmentUrl: string): Promise<MarmosetSubmissionStatus> {
    return { assignmentId: assignmentUrl.split("/").at(-1) ?? "unknown", assignmentUrl, state: "tested", hasSubmission: true, note: "Mock status only." };
  }
}
