export interface QuizHistoryItem {
  id: string;
  timestamp: number;
  subject: string;
  topic: string;
  total: number;
  correctCount: number;
  accuracy: number;
  earnedXp: number;
  maxCombo: number;
}

export interface DailyQuestsState {
  date: string; // YYYY-MM-DD
  quizzesCompleted: number; // Goal: 2
  maxStreakAchieved: number; // Goal: 3
  claimedRewards: { [questId: string]: boolean };
}

const HISTORY_KEY = 'siet_quiz_history';
const QUESTS_KEY = 'siet_daily_quests';
const RENAMED_QUESTS: Record<string, string> = {
  quest_quiz_count: 'quest_2_quizzes',
  quest_combo_streak: 'quest_combo_3',
};

/** When each daily quest counts as done; a reward can only be claimed then. */
export const QUEST_DONE: Record<string, (q: DailyQuestsState) => boolean> = {
  quest_2_quizzes: (q) => q.quizzesCompleted >= 2,
  quest_combo_3: (q) => q.maxStreakAchieved >= 3,
};

export function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getQuizHistory(): QuizHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQuizHistory(item: Omit<QuizHistoryItem, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getQuizHistory();
    const newItem: QuizHistoryItem = {
      ...item,
      id: `quiz_${Date.now()}`,
      timestamp: Date.now(),
    };
    current.unshift(newItem);
    // Keep last 30 quizzes
    localStorage.setItem(HISTORY_KEY, JSON.stringify(current.slice(0, 30)));
    updateQuestsAfterQuiz(item);
  } catch (e) {
    console.error('Error saving history:', e);
  }
}

export function getDailyQuests(): DailyQuestsState {
  const today = getTodayDateString();
  const defaultState: DailyQuestsState = {
    date: today,
    quizzesCompleted: 0,
    maxStreakAchieved: 0,
    claimedRewards: {},
  };

  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem(QUESTS_KEY);
    if (!raw) return defaultState;
    const parsed: DailyQuestsState = JSON.parse(raw);
    if (parsed.date !== today) {
      // New day reset
      localStorage.setItem(QUESTS_KEY, JSON.stringify(defaultState));
      return defaultState;
    }
    // Quest ids were renamed (PR #39): a reward claimed today under the old id
    // stays claimed, so it cannot be collected twice on the day of the update.
    const claimed = { ...(parsed.claimedRewards || {}) };
    for (const [oldId, newId] of Object.entries(RENAMED_QUESTS)) {
      if (claimed[oldId]) claimed[newId] = true;
    }
    return { ...parsed, claimedRewards: claimed };
  } catch {
    return defaultState;
  }
}

export function updateQuestsAfterQuiz(item: { correctCount: number; maxCombo?: number }): void {
  const quests = getDailyQuests();
  quests.quizzesCompleted += 1;
  if (item.maxCombo && item.maxCombo > quests.maxStreakAchieved) {
    quests.maxStreakAchieved = item.maxCombo;
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(QUESTS_KEY, JSON.stringify(quests));
  }
}

export function claimQuestReward(questId: string): boolean {
  // Re-read today's state: a tab left open past midnight or a claim made in
  // another tab must not pay out a quest that is not (or no longer) due.
  const quests = getDailyQuests();
  if (quests.claimedRewards[questId]) return false;
  const done = QUEST_DONE[questId];
  if (done && !done(quests)) return false;
  quests.claimedRewards[questId] = true;
  if (typeof window !== 'undefined') {
    localStorage.setItem(QUESTS_KEY, JSON.stringify(quests));
  }
  return true;
}

export function getWeakestTopic(): { subject: string; topic: string; accuracy: number; totalAttempts: number } | null {
  const history = getQuizHistory();
  if (!history || history.length === 0) {
    // Default recommended starter weakness
    return {
      subject: '[CS101] สถาปัตยกรรมระบบปฏิบัติการ (Operating Systems)',
      topic: 'Synchronization & Mutex Lock',
      accuracy: 32,
      totalAttempts: 1,
    };
  }

  // Aggregate by topic
  const topicStats: { [key: string]: { subject: string; topic: string; totalQ: number; correctQ: number; count: number } } = {};

  for (const h of history) {
    const key = `${h.subject}:::${h.topic}`;
    if (!topicStats[key]) {
      topicStats[key] = { subject: h.subject, topic: h.topic, totalQ: 0, correctQ: 0, count: 0 };
    }
    topicStats[key].totalQ += h.total;
    topicStats[key].correctQ += h.correctCount;
    topicStats[key].count += 1;
  }

  // Find lowest accuracy topic
  let weakest: { subject: string; topic: string; accuracy: number; totalAttempts: number } | null = null;
  let minAccuracy = 101;

  for (const stat of Object.values(topicStats)) {
    const acc = Math.round((stat.correctQ / (stat.totalQ || 1)) * 100);
    if (acc < minAccuracy) {
      minAccuracy = acc;
      weakest = {
        subject: stat.subject,
        topic: stat.topic,
        accuracy: acc,
        totalAttempts: stat.count,
      };
    }
  }

  return weakest || {
    subject: '[CS101] สถาปัตยกรรมระบบปฏิบัติการ (Operating Systems)',
    topic: 'Synchronization & Mutex Lock',
    accuracy: 32,
    totalAttempts: 1,
  };
}

