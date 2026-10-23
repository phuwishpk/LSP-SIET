'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface QuizQuestion {
  id: number;
  question: string;
  codeSnippet?: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

interface QuizSession {
  subject: string;
  topic: string;
  difficulty: string;
  timerMode: 'standard' | 'speed' | 'zen';
  questions: QuizQuestion[];
  startedAt: number;
}

export function QuizPlayScreen() {
  const router = useRouter();

  const [session, setSession] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [timer, setTimer] = useState(30);
  const [combo, setCombo] = useState(0);
  const [lives, setLives] = useState(3);
  const [answersLog, setAnswersLog] = useState<Array<{
    questionId: number;
    questionText: string;
    selected: string;
    correct: string;
    isCorrect: boolean;
    explanation: string;
  }>>([]);

  // Load active session from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem('current_quiz_session');
    if (raw) {
      try {
        const parsed: QuizSession = JSON.parse(raw);
        setSession(parsed);
        const initialSeconds = parsed.timerMode === 'speed' ? 15 : parsed.timerMode === 'zen' ? 999 : 30;
        setTimer(initialSeconds);
      } catch (e) {
        console.error(e);
      }
    } else {
      // Fallback demo session if opened directly
      setSession({
        subject: '[CS101] สถาปัตยกรรมระบบปฏิบัติการ',
        topic: 'Synchronization & Mutex',
        difficulty: 'medium',
        timerMode: 'standard',
        startedAt: Date.now(),
        questions: [
          {
            id: 1,
            question: 'ในปัญหา Critical Section Mechanism ใดที่ใช้ป้องกัน Deadlock และรับประกัน Mutual Exclusion?',
            codeSnippet: 'wait(S); // Critical Section; signal(S);',
            options: [
              'Busy Waiting Loop',
              'Counting Semaphore',
              'Turnaround Scheduling',
              'Preemptive Context Switch',
            ],
            correctAnswer: 'Counting Semaphore',
            explanation:
              'Semaphore มีการทำงานแบบ wait() และ signal() เพื่อควบคุมการเข้าใช้ Resource พร้อมกัน ช่วยจัดการ Mutual Exclusion ได้อย่างมีประสิทธิภาพ',
          },
        ],
      });
    }
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!session || hasAnswered || session.timerMode === 'zen') return;

    if (timer <= 0) {
      // Time's up -> auto submit wrong
      handleSelectAnswer('TIMEOUT');
      return;
    }

    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timer, hasAnswered, session]);

  if (!session || !session.questions || session.questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-6 text-center">
        <div className="space-y-4">
          <p className="text-slate-600">กำลังเตรียมคำถาม...</p>
          <Link href="/solo" className="px-5 py-2.5 rounded-xl bg-pink-600 text-white font-bold text-sm inline-block">
            กลับไปตั้งค่าโหมด Solo
          </Link>
        </div>
      </div>
    );
  }

  const currentQ = session.questions[currentIndex] || session.questions[0];
  const totalQ = session.questions.length;
  const isCorrect = selectedOption === currentQ.correctAnswer;

  const handleSelectAnswer = (optionText: string) => {
    if (hasAnswered) return;

    setSelectedOption(optionText);
    setHasAnswered(true);

    const correct = optionText === currentQ.correctAnswer;

    if (correct) {
      setCombo((c) => c + 1);
    } else {
      setCombo(0);
      setLives((l) => Math.max(0, l - 1));
    }

    setAnswersLog((prev) => [
      ...prev,
      {
        questionId: currentQ.id,
        questionText: currentQ.question,
        selected: optionText,
        correct: currentQ.correctAnswer,
        isCorrect: correct,
        explanation: currentQ.explanation,
      },
    ]);
  };

  const handleNext = () => {
    if (currentIndex + 1 < totalQ) {
      // Next Question
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setHasAnswered(false);
      const initialSeconds = session.timerMode === 'speed' ? 15 : session.timerMode === 'zen' ? 999 : 30;
      setTimer(initialSeconds);
    } else {
      // Finished Quiz -> Save result to sessionStorage
      const totalCorrect = answersLog.filter((a) => a.isCorrect).length + (isCorrect ? 1 : 0);
      const resultPayload = {
        subject: session.subject,
        topic: session.topic,
        total: totalQ,
        correctCount: totalCorrect,
        accuracy: Math.round((totalCorrect / totalQ) * 100),
        earnedXp: totalCorrect * 20 + combo * 10,
        maxCombo: Math.max(combo, 1),
        answersLog: answersLog,
      };
      sessionStorage.setItem('current_quiz_result', JSON.stringify(resultPayload));
      router.push('/result');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex-1 bg-[#fafbfc] text-[#1e293b] font-sans flex flex-col justify-between">
      {/* 1. Gameplay Header Bar */}
      <header className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-8 py-3 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Exit button & Progress Chip */}
          <div className="flex items-center gap-3">
            <Link
              href="/solo"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>ยอมแพ้/ออก</span>
            </Link>

            <div className="flex items-center gap-2 border border-slate-200/90 rounded-full px-4 py-1.5 bg-slate-50/80">
              <span className="text-pink-500 text-xs">📌</span>
              <span className="text-xs sm:text-sm font-bold text-slate-800">
                ข้อ {currentIndex + 1}/{totalQ} • {session.topic}
              </span>
              <div className="w-16 sm:w-28 bg-slate-200 rounded-full h-1.5 overflow-hidden ml-1 hidden sm:block">
                <div
                  className="bg-[#e11d48] h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / totalQ) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Right: Timer, Combo, Hearts */}
          <div className="flex items-center gap-2 sm:gap-3">
            {session.timerMode !== 'zen' && (
              <div
                className={`flex items-center gap-1.5 border rounded-full px-3 py-1.5 bg-white text-xs sm:text-sm font-bold shadow-2xs ${
                  timer <= 5 ? 'border-rose-400 text-rose-600 animate-bounce' : 'border-slate-200 text-slate-700'
                }`}
              >
                <span>⏳</span>
                <span>00:{timer < 10 ? `0${timer}` : timer}</span>
              </div>
            )}

            {combo > 1 && (
              <div className="flex items-center gap-1 rounded-full px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs sm:text-sm font-extrabold animate-pulse">
                <span>⚡</span>
                <span>x{combo} Combo</span>
              </div>
            )}

            <div className="flex items-center gap-0.5 border border-slate-200 rounded-full px-2.5 py-1.5 bg-slate-50/70">
              <span className="text-[#f43f5e] text-xs">
                {'❤️'.repeat(lives) || '💔'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Question Card & Answers */}
      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-5 animate-in fade-in duration-200">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="text-pink-600 font-bold">StudyTogether</span>
            <span>/</span>
            <span>{session.subject}</span>
          </div>
          <span>เลือกคำตอบที่ถูกต้องที่สุด 1 ข้อ</span>
        </div>

        {/* Question Prompt Box */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed">
            {currentQ.question}
          </h2>

          {currentQ.codeSnippet && (
            <div className="bg-[#fffdf7] border border-amber-200/80 rounded-2xl p-4 font-mono text-xs sm:text-sm text-slate-700 shadow-2xs overflow-x-auto">
              <code>{currentQ.codeSnippet}</code>
            </div>
          )}
        </div>

        {/* 2x2 Choice Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {currentQ.options.map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx); // A, B, C, D
            const isSelected = selectedOption === opt;
            const isThisCorrect = opt === currentQ.correctAnswer;

            let cardStyle = 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800';

            if (hasAnswered) {
              if (isThisCorrect) {
                cardStyle = 'border-2 border-pink-400 bg-pink-50/70 text-pink-700 shadow-xs';
              } else if (isSelected && !isThisCorrect) {
                cardStyle = 'border-2 border-rose-300 bg-rose-50/70 text-rose-700';
              } else {
                cardStyle = 'border-slate-200 bg-white/60 text-slate-400';
              }
            }

            return (
              <button
                key={opt}
                type="button"
                disabled={hasAnswered}
                onClick={() => handleSelectAnswer(opt)}
                className={`p-4 sm:p-5 rounded-2xl border text-left transition flex items-center justify-between gap-3 cursor-pointer ${cardStyle}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                      isSelected ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {letter}.
                  </span>
                  <div>
                    <p className="font-bold text-sm sm:text-base leading-snug">{opt}</p>
                    {hasAnswered && isThisCorrect && (
                      <span className="text-[11px] font-semibold text-pink-600">คำตอบที่ถูกต้อง</span>
                    )}
                  </div>
                </div>

                {hasAnswered && isThisCorrect && (
                  <div className="w-6 h-6 rounded-full bg-pink-100 border border-pink-300 flex items-center justify-center text-pink-600 flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* AI Explanation Box */}
        {hasAnswered && (
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-sm space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <span className="text-pink-500 text-base">✨</span>
                <span>คำอธิบายจาก AI</span>
              </div>
              {isCorrect ? (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-semibold border border-emerald-100">
                  ✓ ยอดเยี่ยม! ตอบถูกต้อง (+20 XP)
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-semibold border border-rose-100">
                  ✕ ยังไม่ถูกต้อง สู้ใหม่ข้อถัดไป
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {currentQ.explanation}
            </p>
          </div>
        )}

        {/* Action Button: Next Question or Finish */}
        {hasAnswered && (
          <div className="pt-2 animate-in fade-in">
            <button
              onClick={handleNext}
              className="w-full py-4 rounded-2xl bg-[#e11d48] hover:bg-[#be123c] text-white font-bold text-sm sm:text-base tracking-wide transition shadow-sm active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{currentIndex + 1 < totalQ ? 'ข้อถัดไป' : 'ดูสรุปผลการทดสอบ'}</span>
              <span>→</span>
            </button>
          </div>
        )}
      </main>

      <footer className="w-full py-3 text-center text-xs text-slate-400">
        AI Quiz Arena · ขับเคลื่อนด้วย OpenRouter Free AI
      </footer>
    </div>
  );
}
