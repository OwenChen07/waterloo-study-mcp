export type LearnContentTopic = {
  id: string;
  courseId: string;
  title: string;
  kind: "module" | "topic";
  topicType?: string;
  isHidden: boolean;
  isLocked: boolean;
  url: string;
};

export type LearnContentDocument = {
  topic: LearnContentTopic;
  contentType: string;
  text?: string;
  truncated: boolean;
  warning?: string;
};
