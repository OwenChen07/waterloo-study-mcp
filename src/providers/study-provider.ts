import type {
  Announcement,
  Course,
  PiazzaFolder,
  PiazzaPost,
  UpcomingWork,
} from "../domain.js";
import type { LearnContentDocument, LearnContentTopic } from "../learn-content.js";

export type ProviderPerformanceStats = {
  cache: { hits: number; misses: number };
  requests: {
    learn: { count: number; totalMs: number };
    piazza: { count: number; totalMs: number };
  };
};

export type StudySnapshot = { courses: Course[]; upcomingWork: UpcomingWork[] };
export type UpcomingWorkOptions = { courseId?: string; now?: Date };

export interface StudyProvider {
  listCourses(): Promise<Course[]>;
  listPiazzaCourses(): Promise<Course[]>;
  resolvePiazzaCourse(reference: string): Promise<Course>;
  getUpcomingWork(daysAhead: number, options?: UpcomingWorkOptions): Promise<UpcomingWork[]>;
  getStudySnapshot(daysAhead: number): Promise<StudySnapshot>;
  getPerformanceStats(): ProviderPerformanceStats;
  getAnnouncements(courseId: string): Promise<Announcement[]>;
  listCourseContent(courseId: string): Promise<LearnContentTopic[]>;
  getCourseContentTopic(courseId: string, topicId: string): Promise<LearnContentDocument>;
  findCourseOutlines(courseId: string): Promise<LearnContentTopic[]>;
  listPiazzaFolders(courseId: string): Promise<PiazzaFolder[]>;
  listRecentPiazzaPosts(courseId: string, limit?: number): Promise<PiazzaPost[]>;
  searchPiazzaPosts(courseId: string, query: string): Promise<PiazzaPost[]>;
  getPiazzaPost(courseId: string, postId: string): Promise<PiazzaPost | undefined>;
}
