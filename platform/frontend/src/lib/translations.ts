/**
 * Translations the workspace adds to the host's (merged in by extendI18n, see
 * platform/frontend/src/lib/extensions.ts). en-US is the only language.
 */
const enUS = {
  navigation: { features: 'AI Features' },
  features: {
    title: "AI Features",
    description:
      "Quickly generate quizzes and roadmaps from your research topics. Each session is scoped to your account so multi-user deployments keep data isolated.",
    quiz: "Quiz",
    roadmap: "Roadmap",
    description_short: "Generate a quiz, a roadmap, or both from a single topic.",
    topic: "Topic",
    titleField: "Title",
    titleOptional: "Optional title",
    descriptionField: "Description",
    questionCount: "Number of questions",
    nodeCount: "Number of nodes",
    generate: "Generate",
    generating: "Generating...",
    generateQuiz: "Generate a new quiz",
    generateRoadmap: "Generate a new roadmap",
    quizHint:
      "Provide a topic and let the AI produce multiple-choice questions with explanations.",
    roadmapHint:
      "Describe a project and the AI will sequence it into ordered milestones.",
    topicPlaceholder: "e.g. Python basics, ประวัติศาสตร์ไทย",
    descriptionPlaceholder: "Describe the project, its goals, and constraints...",
    history: "Recent quizzes",
    roadmapHistory: "Recent roadmaps",
    noQuizzes: "No quizzes yet — generate one to get started.",
    noRoadmaps: "No roadmaps yet — generate one to get started.",
    selectQuiz: "Select a quiz from the list or generate a new one.",
    selectRoadmap: "Select a roadmap from the list or generate a new one.",
    quizGenerated: "Quiz generated successfully",
    roadmapGenerated: "Roadmap generated successfully",
    quizDeleted: "Quiz deleted",
    roadmapDeleted: "Roadmap deleted",
  },
}

export const translations: Record<string, Record<string, unknown>> = {
  'en-US': enUS,
}
