export type MarmosetCourse = {
  id: string;
  name: string;
  url: string;
};

export type MarmosetAssignment = {
  id: string;
  courseId: string;
  name: string;
  url: string;
};

export type MarmosetSubmissionStatus = {
  assignmentId: string;
  assignmentUrl: string;
  state: "pending" | "tested" | "unknown";
  hasSubmission: boolean;
  note: string;
};
