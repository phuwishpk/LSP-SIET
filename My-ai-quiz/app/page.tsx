'use client';

import { useEffect, useMemo, useState } from 'react';

interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

const TOKEN_STORAGE_KEY = 'kmitlai-workspace-token';

export default function QuizPage() {
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{
    topic: string;
    score: number;
    total: number;
    created: string;
  }>>([]);

  // Read the workspace JWT from the URL (?token=…) once and stash it
  // so subsequent requests can ride on it without leaking through the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('token');
    if (fromQuery) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, fromQuery);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }
    setToken(window.localStorage.getItem(TOKEN_STORAGE_KEY));
    const stored = window.localStorage.getItem('kmitlai-quiz-history');
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  const persistHistory = (entry: { topic: string; score: number; total: number; created: string }) => {
    if (typeof window === 'undefined') return;
    const next = [entry, ...history].slice(0, 10);
    setHistory(next);
    window.localStorage.setItem('kmitlai-quiz-history', JSON.stringify(next));
  };

  const generateQuiz = async () => {
    const trimmedTopic = topic.trim();

    if (!trimmedTopic) {
      setError('กรุณาระบุหัวข้อควิซก่อนสร้างข้อสอบ');
      return;
    }

    setError(null);
    setLoading(true);
    setQuestions([]);
    setSelectedAnswers({});
    setShowResult(false);

    try {
      // Prefer the workspace API (open-notebook) when a JWT is present so
      // quizzes are scoped to the signed-in user. Fall back to the local
      // /api/generate-quiz route for anonymous usage.
      const apiBase = process.env.NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL;
      const endpoint = apiBase
        ? `${apiBase.replace(/\/$/, '')}/api/features/quiz/generate`
        : '/api/generate-quiz';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token && apiBase) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic: trimmedTopic,
          question_count: 3,
          language: 'th',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const detail =
          (data && typeof data.detail === 'string' && data.detail) ||
          data?.error ||
          'ไม่สามารถสร้างข้อสอบได้ในขณะนี้';
        throw new Error(detail);
      }

      const list: Question[] = apiBase
        ? ((data?.session?.questions ?? []).map((q: {
            id: number;
            question: string;
            options: { text: string; is_correct: boolean }[];
            correct_answer: string;
            explanation: string;
          }) => ({
            id: q.id,
            question: q.question,
            options: q.options.map((opt) => opt.text),
            correctAnswer: q.correct_answer,
            explanation: q.explanation,
          })))
        : (data.quiz ?? []);

      if (Array.isArray(list) && list.length > 0) {
        setQuestions(list);
      } else {
        setError('ไม่พบข้อสอบที่สร้างขึ้น ลองใหม่อีกครั้ง');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
    } finally {
      setLoading(false);
    }
  };

  const score = useMemo(() => {
    return questions.reduce((acc, q) => {
      return selectedAnswers[q.id] === q.correctAnswer ? acc + 1 : acc;
    }, 0);
  }, [questions, selectedAnswers]);

  const answeredCount = Object.keys(selectedAnswers).length;
  const isReadyToSubmit = questions.length > 0 && answeredCount === questions.length;

  const submit = () => {
    if (!isReadyToSubmit) {
      setError('กรุณาตอบคำถามทุกข้อก่อนส่งคำตอบ');
      return;
    }
    setError(null);
    setShowResult(true);
    persistHistory({
      topic,
      score,
      total: questions.length,
      created: new Date().toISOString(),
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.15),_transparent_45%)] px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-200/70 backdrop-blur sm:p-8">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">AI Quiz Generator</p>
          <h1 className="text-3xl font-bold sm:text-4xl">สร้างควิซให้คุณในเวลาไม่กี่วินาที</h1>
          <p className="mx-auto max-w-2xl text-sm text-slate-600 sm:text-base">
            ใส่หัวข้อที่คุณสนใจ แล้วปล่อยให้ระบบสร้างคำถามแบบปรนัยพร้อมคำอธิบายและเฉลยให้คุณทันที
          </p>
          {token && (
            <p className="text-xs text-emerald-600">
              ✓ ลงชื่อเข้าใช้ด้วย workspace token — ผลลัพธ์จะถูกบันทึกในบัญชีของคุณ
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label htmlFor="topic" className="mb-2 block text-sm font-semibold text-slate-700">
            หัวข้อควิซ
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="topic"
              type="text"
              placeholder="เช่น การโปรแกรมเบื้องต้น, ประวัติศาสตร์ไทย..."
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  generateQuiz();
                }
              }}
            />
            <button
              onClick={generateQuiz}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? 'กำลังสร้างควิซ...' : 'สร้างควิซ'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!questions.length && !loading && !error && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
            เริ่มต้นด้วยการใส่หัวข้อ แล้วคลิกปุ่มสร้างควิซเพื่อดูคำถามที่สร้างขึ้น
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 text-center text-sm font-medium text-blue-700">
            กำลังสร้างข้อสอบให้คุณ กรุณารอสักครู่...
          </div>
        )}

        {questions.length > 0 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span>ข้อที่สร้างขึ้น: {questions.length} ข้อ</span>
              <span>ตอบแล้ว: {answeredCount}/{questions.length}</span>
            </div>

            {questions.map((q) => (
              <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="mb-3 text-base font-semibold text-slate-800">
                  {q.id}. {q.question}
                </p>
                <div className="space-y-2">
                  {q.options.map((opt, idx) => (
                    <label
                      key={`${q.id}-${idx}`}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50"
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={opt}
                        disabled={showResult}
                        checked={selectedAnswers[q.id] === opt}
                        onChange={() => setSelectedAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                      />
                      <span className="text-sm text-slate-700">{opt}</span>
                    </label>
                  ))}
                </div>

                {showResult && (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
                    <p className="font-semibold text-blue-700">
                      เฉลย: <span className="text-green-600">{q.correctAnswer}</span>
                    </p>
                    <p className="mt-1 text-slate-600">เหตุผล: {q.explanation}</p>
                  </div>
                )}
              </div>
            ))}

            {!showResult ? (
              <button
                onClick={submit}
                className="w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700"
              >
                ส่งคำตอบและดูเฉลย
              </button>
            ) : (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center text-slate-700">
                <p className="text-xl font-bold text-green-700">🎉 คุณได้คะแนน {score} / {questions.length}</p>
                <p className="mt-2 text-sm">คุณตอบถูก {score} ข้อ จาก {questions.length} ข้อ</p>
              </div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">ประวัติการทำควิซ</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {history.map((entry, idx) => (
                <li key={idx} className="flex items-center justify-between py-2">
                  <span className="text-slate-700 truncate">{entry.topic}</span>
                  <span className="text-slate-500">
                    {entry.score}/{entry.total} ·{' '}
                    {new Date(entry.created).toLocaleString('th-TH', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}