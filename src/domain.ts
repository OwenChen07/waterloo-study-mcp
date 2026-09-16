export type Course = {
  id: string;
  code: string;
  name: string;
  term: string;
};

export type UpcomingWork = {
  id: string;
  courseId: string;
  title: string;
  dueAt: string;
  kind: "assignment" | "quiz" | "exam";
  url: string;
};

export type Announcement = {
  id: string;
  courseId: string;
  title: string;
  publishedAt: string;
  body: string;
  url: string;
};

export type PiazzaFolder = {
  id: string;
  courseId: string;
  name: string;
};

export type PiazzaPost = {
  id: string;
  courseId: string;
  folderIds: string[];
  subject: string;
  content: string;
  createdAt: string;
  url: string;
};
