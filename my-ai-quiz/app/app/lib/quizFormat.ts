/**
 * The system's quiz questions (POST /community/study/quiz) in the shape the
 * player in this app reads (see app/solo/play/page.tsx).
 */

export interface SystemQuestion {
  id?: number;
  type?: 'mcq' | 'fill' | 'matching';
  question?: string;
  options?: (string | { text?: string })[];
  correct_answer?: string;
  acceptable_answers?: string[];
  pairs?: { left: string; right: string }[];
  explanation?: string;
}

/** One question of the system's quiz, in this app's shape (see solo/play). */
export function toAppQuestion(q: SystemQuestion, index: number) {
  const base = { id: q.id || index + 1, question: q.question || '', explanation: q.explanation || '' };
  if (q.type === 'fill') {
    return {
      ...base,
      type: 'fill' as const,
      options: [],
      correctAnswer: q.correct_answer || '',
      acceptableAnswers: q.acceptable_answers?.length ? q.acceptable_answers : [q.correct_answer || ''],
    };
  }
  if (q.type === 'matching') {
    return { ...base, type: 'matching' as const, options: [], matchingPairs: q.pairs || [] };
  }
  const options = (q.options || []).map((o) => (typeof o === 'string' ? o : o?.text || ''));
  return { ...base, type: 'mcq' as const, options, correctAnswer: Math.max(0, options.indexOf(q.correct_answer || '')) };
}
