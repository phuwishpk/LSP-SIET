'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { QuizNavbar } from '../../components/QuizNavbar';
import {
  IconHeart,
  IconClock,
  IconZap,
  IconArrowRight,
  IconCheckCircle2,
  IconShieldCheck,
  IconSparkles,
} from '../../components/ui/Icons';

interface Question {
  id?: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface QuizSession {
  subject: string;
  topic: string;
  difficulty: string;
  questions: Question[];
  currentIndex: number;
  score: number;
}

export default function SoloPlayPage() {
  const router = useRouter();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('active_quiz_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.questions?.length) {
          setSession(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }

    // Fallback demo questions if opened directly
    setSession({
      subject: 'สถาปัตยกรรมระบบปฏิบัติการ (Operating Systems)',
      topic: 'Synchronization & Mutex Lock',
      difficulty: 'medium',
      currentIndex: 0,
      score: 0,
      questions: [
        {
          question: 'Mutex Lock มีวัตถุประสงค์หลักข้อใดในการทำงานของระบบปฏิบัติการ?',
          options: [
            'ป้องกันไม่ให้เกิด Race Condition ใน Critical Section โดยอนุญาตให้ทำงานได้ทีละ Thread',
            'เพิ่มความเร็วของ CPU clock cycle ในระหว่างการประมวลผล',
            'จัดการคืนหน่วยความจำ (RAM) สู่ระบบแบบ Garbage Collection',
            'แปลงโค้ดภาษา Assembly ให้กลายเป็นรหัสคำสั่งเครื่อง',
          ],
          correctAnswer: 0,
          explanation: 'Mutex (Mutual Exclusion) ออกแบบมาเพื่อให้มีเพียง Thread เดียวที่สามารถถือครอง Lock และเข้าใช้งาน Critical Section ในเวลาเดียวกัน เพื่อป้องกัน Race Condition',
        },
        {
          question: 'เงื่อนไขใดต่อไปนี้ "ไม่ใช่" 1 ใน 4 เงื่อนไขของ Coffman ที่ทำให้เกิดสภาวะ Deadlock?',
          options: [
            'Mutual Exclusion',
            'Hold and Wait',
            'Preemption Allowed (ยินยอมให้แทรกแซงแย่งชิงทรัพยากร)',
            'Circular Wait',
          ],
          correctAnswer: 2,
          explanation: 'เงื่อนไขที่ทำให้เกิด Deadlock คือ "No Preemption" (ไม่อนุญาตให้แย่งชิงทรัพยากร) ดังนั้นหากมี Preemption Allowed จะทำให้ไม่เกิด Deadlock',
        },
      ],
    });
  }, []);

  // Timer countdown
  useEffect(() => {
    if (isAnswered || isQuizCompleted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsAnswered(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAnswered, isQuizCompleted, currentIndex]);

  if (!session) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-rose-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const currentQ = session.questions[currentIndex];
  const totalQ = session.questions.length;
  const isCorrect = selectedOption === currentQ.correctAnswer;

  const handleSelectOption = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);
    if (idx === currentQ.correctAnswer) {
      setScore((s) => s + 1);
      setStreak((st) => st + 1);
    } else {
      setStreak(0);
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < totalQ) {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setTimeLeft(30);
    } else {
      setIsQuizCompleted(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] font-sans flex flex-col justify-between">
      <QuizNavbar />

      <main className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 animate-in fade-in duration-200">
        {!isQuizCompleted ? (
          <div className="space-y-6">
            {/* Top Stat Bar */}
            <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  คำถามที่ {currentIndex + 1} จาก {totalQ}
                </span>
                <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-rose-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / totalQ) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Timer Badge */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                  <IconClock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="tabular-nums">{timeLeft}s</span>
                </div>

                {/* Score Pill */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200/60">
                  <IconZap className="w-3.5 h-3.5 text-rose-600" />
                  <span>{score} คะแนน</span>
                </div>
              </div>
            </div>

            {/* Question Card */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full">
                  <IconSparkles className="w-3 h-3 text-rose-500" />
                  <span>{session.topic}</span>
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                  {currentQ.question}
                </h2>
              </div>

              {/* Options Grid */}
              <div className="space-y-3">
                {currentQ.options.map((option, idx) => {
                  let optStyle = 'border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/70 bg-white text-slate-700';

                  if (isAnswered) {
                    if (idx === currentQ.correctAnswer) {
                      optStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold shadow-xs';
                    } else if (idx === selectedOption) {
                      optStyle = 'border-rose-500 bg-rose-50 text-rose-900 font-semibold shadow-xs';
                    } else {
                      optStyle = 'border-slate-200/60 bg-slate-50/40 text-slate-400 opacity-60';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => handleSelectOption(idx)}
                      className={`w-full text-left p-4 rounded-2xl border text-sm transition-all flex items-start gap-3.5 cursor-pointer active:scale-98 ${optStyle}`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold bg-white/80">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="leading-relaxed">{option}</span>
                    </button>
                  );
                })}
              </div>

              {/* Feedback & Explanation Box */}
              {isAnswered && (
                <div
                  className={`p-4 rounded-2xl text-xs sm:text-sm border animate-in fade-in duration-200 ${
                    isCorrect
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                      : 'bg-rose-50/80 border-rose-200 text-rose-950'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold mb-1">
                    {isCorrect ? (
                      <>
                        <IconCheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700">ถูกต้อง! ยอดเยี่ยมมาก</span>
                      </>
                    ) : (
                      <>
                        <IconZap className="w-4 h-4 text-rose-600" />
                        <span className="text-rose-700">ยังไม่ถูกต้อง</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed opacity-90">{currentQ.explanation}</p>
                </div>
              )}

              {/* Action Bottom */}
              {isAnswered && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md shadow-rose-600/20 active:scale-95 transition-all"
                  >
                    <span>{currentIndex + 1 < totalQ ? 'ข้อถัดไป' : 'ดูผลคะแนนรวม'}</span>
                    <IconArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Completion Summary */
          <div className="bg-white rounded-3xl border border-slate-200/90 p-8 sm:p-10 shadow-xs text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <IconCheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">การฝึกฝนเสร็จสมบูรณ์!</h2>
              <p className="text-sm text-slate-500 mt-1">คุณได้ทบทวนเนื้อหาบทเรียนเรียบร้อยแล้ว</p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-xs text-slate-400 font-semibold uppercase">คะแนนที่ได้</span>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{score} / {totalQ}</p>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center">
                <span className="text-xs text-amber-600 font-semibold uppercase">XP ที่ได้รับ</span>
                <p className="text-2xl font-extrabold text-amber-800 mt-0.5">+{score * 20} XP</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Link
                href="/solo"
                className="w-full sm:w-auto px-6 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm"
              >
                ฝึกซ้อมอีกครั้ง
              </Link>
              <Link
                href="/"
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md shadow-rose-600/20"
              >
                กลับหน้าหลัก Arena
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white/70 py-4 px-4 sm:px-8 text-xs text-slate-400">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p className="flex items-center gap-1.5 justify-center sm:justify-start">
            <IconShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>KMITL SIET Intelligent Learning Workspace</span>
          </p>
          <p>StudyTogether · AI Quiz Arena</p>
        </div>
      </footer>
    </div>
  );
}

