import type {
  Announcement,
  Course,
  PiazzaFolder,
  PiazzaPost,
  UpcomingWork,
} from "../domain.js";

export type ProviderPerformanceStats = {
  cache: { hits: number; misses: number };
  requests: {
    learn: { count: number; totalMs: number };
    piazza: { count: number; totalMs: number };
  };
};

export type StudySnapshot = { courses: Course[]; upcomingWork: UpcomingWork[] };

export interface StudyProvider {
  listCourses(): Promise<Course[]>;
  listPiazzaCourses(): Promise<Course[]>;
  getUpcomingWork(daysAhead: number, now?: Date): Promise<UpcomingWork[]>;
  getStudySnapshot(daysAhead: number): Promise<StudySnapshot>;
  getPerformanceStats(): ProviderPerformanceStats;
  getAnnouncements(courseId: string): Promise<Announcement[]>;
  listPiazzaFolders(courseId: string): Promise<PiazzaFolder[]>;
  listRecentPiazzaPosts(courseId: string, limit?: number): Promise<PiazzaPost[]>;
  searchPiazzaPosts(courseId: string, query: string): Promise<PiazzaPost[]>;
  getPiazzaPost(courseId: string, postId: string): Promise<PiazzaPost | undefined>;
}
