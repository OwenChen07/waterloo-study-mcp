import type {
  Announcement,
  Course,
  PiazzaFolder,
  PiazzaPost,
  UpcomingWork,
} from "../domain.js";

export interface StudyProvider {
  listCourses(): Promise<Course[]>;
  getUpcomingWork(daysAhead: number, now?: Date): Promise<UpcomingWork[]>;
  getAnnouncements(courseId: string): Promise<Announcement[]>;
  listPiazzaFolders(courseId: string): Promise<PiazzaFolder[]>;
  searchPiazzaPosts(courseId: string, query: string): Promise<PiazzaPost[]>;
  getPiazzaPost(courseId: string, postId: string): Promise<PiazzaPost | undefined>;
}
