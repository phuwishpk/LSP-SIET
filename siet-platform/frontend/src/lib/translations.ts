/**
 * Translations the workspace adds to open-notebook's (merged in by
 * extendI18n, see open-notebook/frontend/src/lib/extensions.ts). Languages
 * without a `features` block fall back to en-US, as before.
 */
const appName = { common: { appName: 'LSP-SIET' } }

const enUS = {
  ...appName,
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
  'bn-IN': appName,
  'ca-ES': appName,
  'de-DE': appName,
  'en-US': enUS,
  'es-ES': appName,
  'fr-FR': appName,
  'it-IT': appName,
  'ja-JP': appName,
  'pl-PL': appName,
  'pt-BR': appName,
  'ru-RU': appName,
  'tr-TR': appName,
  'zh-CN': appName,
  'zh-TW': appName,
}
