'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PinkOwlMascot, OwlMood } from '../../components/PinkOwlMascot';
import { saveQuizHistory } from '../../lib/quizStorage';
import {
  IconHeart,
  IconClock,
  IconZap,
  IconArrowRight,
  IconCheckCircle2,
  IconShieldCheck,
  IconSparkles,
  IconPenLine,
  IconLink2,
} from '../../components/ui/Icons';

interface MatchingPair {
  left: string;
  right: string;
}

interface Question {
  id?: number;
  type?: 'mcq' | 'fill' | 'matching';
  question: string;
  options?: string[];
  correctAnswer?: any;
  acceptableAnswers?: string[];
  matchingPairs?: MatchingPair[];
  explanation: string;
}

interface QuizSession {
  subject: string;
  topic: string;
  difficulty: string;
  timerMode?: 'standard' | 'speed' | 'zen' | string;
  questions: Question[];
  currentIndex: number;
  score: number;
}

export default function SoloPlayPage() {
  const router = useRouter();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // MCQ state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  // Fill-in-the-blank state
  const [fillAnswer, setFillAnswer] = useState('');
  
  // Matching state
  const [shuffledRights, setShuffledRights] = useState<string[]>([]);
  const [matchingSelections, setMatchingSelections] = useState<{ [left: string]: string }>({});
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);
  const [answersLog, setAnswersLog] = useState<any[]>([]);

  // Owl reaction state during quiz
  const [owlMood, setOwlMood] = useState<OwlMood>('study');

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

    // Fallback demo multi-type questions
    setSession({
      subject: 'สถาปัตยกรรมระบบปฏิบัติการ (Operating Systems)',
      topic: 'Synchronization & Mutex Lock',
      difficulty: 'medium',
      currentIndex: 0,
      score: 0,
      questions: [
        {
          id: 1,
          type: 'mcq',
          question: 'Mutex Lock มีวัตถุประสงค์หลักข้อใดในการทำงานของระบบปฏิบัติการ?',
          options: [
            'ป้องกันไม่ให้เกิด Race Condition ใน Critical Section โดยอนุญาตให้ทำงานได้ทีละ Thread',
            'เพิ่มความเร็วของ CPU clock cycle ในระหว่างการประมวลผล',
            'จัดการคืนหน่วยความจำ (RAM) สู่ระบบแบบ Garbage Collection',
            'แปลงโค้ดภาษา Assembly ให้กลายเป็นรหัสคำสั่งเครื่อง',
          ],
          correctAnswer: 0,
          explanation: 'Mutex (Mutual Exclusion) ออกแบบมาเพื่อให้มีเพียง Thread เดียวที่สามารถถือครอง Lock และเข้าใช้งาน Critical Section เพื่อป้องกัน Race Condition',
        },
        {
          id: 2,
          type: 'fill',
          question: 'สภาวะที่ Thread สองตัวต่างรอทรัพยากรซึ่งกันและกันจนไม่สามารถทำงานต่อได้เรียกว่า [___]',
          correctAnswer: 'Deadlock',
          acceptableAnswers: ['Deadlock', 'เดดล็อก', 'deadlock'],
          explanation: 'Deadlock คือสภาวะที่เกิดการค้างรอทรัพยากรเป็นวงกลม ทำให้ไม่มี Process ใดสามารถทำงานต่อไปได้',
        },
        {
          id: 3,
          type: 'matching',
          question: 'จงจับคู่ชนิดของหน่วยความจำกับลักษณะการทำงานให้ถูกต้อง',
          matchingPairs: [
            { left: 'Register', right: 'ทำงานเร็วที่สุด อยู่ภายในตัว CPU' },
            { left: 'RAM', right: 'หน่วยความจำหลัก ข้อมูลหายเมื่อปิดเครื่อง' },
            { left: 'SSD / Harddisk', right: 'หน่วยความจำสำรอง บันทึกข้อมูลถาวร' },
          ],
          explanation: 'เรียงลำดับความเร็ว: Register > Cache > RAM > Secondary Storage (SSD)',
        },
      ],
    });
  }, []);

  // Prepare current question matching rights shuffled
  useEffect(() => {
    if (!session) return;
    const currentQ = session.questions[currentIndex];
    if (currentQ?.type === 'matching' && currentQ.matchingPairs) {
      const rights = currentQ.matchingPairs.map((p) => p.right);
      setShuffledRights([...rights].sort(() => Math.random() - 0.5));
      setMatchingSelections({});
      setSelectedLeft(null);
    }
    // Timer by mode
    const mode = session.timerMode || 'standard';
    const initSec = mode === 'speed' ? 15 : mode === 'zen' ? 9999 : 30;

    setFillAnswer('');
    setSelectedOption(null);
    setIsAnswered(false);
    setTimeLeft(initSec);
    setOwlMood('study');
  }, [currentIndex, session]);

  // Timer countdown
  useEffect(() => {
    if (isAnswered || isQuizCompleted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAnswered, isQuizCompleted, currentIndex]);

    const handleTimeUp = () => {
    setIsAnswered(true);
    setOwlMood('idle');
    setAnswersLog((prev) => [
      ...prev,
      {
        questionId: currentQ.id || currentIndex + 1,
        questionText: currentQ.question,
        selected: '(หมดเวลา ไม่ได้ตอบ)',
        correct: currentQ.options ? currentQ.options[currentQ.correctAnswer] : String(currentQ.correctAnswer || ''),
        isCorrect: false,
        explanation: currentQ.explanation,
      },
    ]);
  };

  if (!session) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex-1 bg-[#f8fafc] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-rose-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const currentQ = session.questions[currentIndex];
  const totalQ = session.questions.length;
  const qType = currentQ.type || 'mcq';

  // Check correctness
  let isCurrentCorrect = false;
  if (qType === 'mcq') {
    isCurrentCorrect = selectedOption === currentQ.correctAnswer;
  } else if (qType === 'fill') {
    const cleanUser = fillAnswer.trim().toLowerCase();
    const matches = currentQ.acceptableAnswers?.some(
      (ans) => ans.trim().toLowerCase() === cleanUser
    ) || (String(currentQ.correctAnswer || '').trim().toLowerCase() === cleanUser);
    isCurrentCorrect = Boolean(matches);
  } else if (qType === 'matching') {
    const pairs = currentQ.matchingPairs || [];
    const allMatchedCorrectly = pairs.every(
      (p) => matchingSelections[p.left] === p.right
    );
    isCurrentCorrect = allMatchedCorrectly;
  }

  // Answer Handlers
  const handleSelectMCQ = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);
    const isCorrect = idx === currentQ.correctAnswer;
    if (isCorrect) {
      setScore((s) => s + 1);
      setOwlMood('wave');
    } else {
      setOwlMood('idle');
    }

    setAnswersLog((prev) => [
      ...prev,
      {
        questionId: currentQ.id || currentIndex + 1,
        questionText: currentQ.question,
        selected: currentQ.options ? currentQ.options[idx] : `ตัวเลือก ${idx}`,
        correct: currentQ.options ? currentQ.options[currentQ.correctAnswer] : `ตัวเลือก ${currentQ.correctAnswer}`,
        isCorrect,
        explanation: currentQ.explanation,
      },
    ]);
  };

  const handleSubmitFill = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAnswered || !fillAnswer.trim()) return;
    setIsAnswered(true);
    const cleanUser = fillAnswer.trim().toLowerCase();
    const isCorrect = Boolean(
      currentQ.acceptableAnswers?.some((ans) => ans.trim().toLowerCase() === cleanUser) ||
      (String(currentQ.correctAnswer || '').trim().toLowerCase() === cleanUser)
    );
    if (isCorrect) {
      setScore((s) => s + 1);
      setOwlMood('wave');
    } else {
      setOwlMood('idle');
    }

    setAnswersLog((prev) => [
      ...prev,
      {
        questionId: currentQ.id || currentIndex + 1,
        questionText: currentQ.question,
        selected: fillAnswer.trim(),
        correct: String(currentQ.correctAnswer || ''),
        isCorrect,
        explanation: currentQ.explanation,
      },
    ]);
  };

  const handleMatchingSelectRight = (rightText: string) => {
    if (isAnswered || !selectedLeft) return;
    setMatchingSelections((prev) => ({
      ...prev,
      [selectedLeft]: rightText,
    }));
    setSelectedLeft(null);
  };

  const handleSubmitMatching = () => {
    if (isAnswered) return;
    setIsAnswered(true);
    const pairs = currentQ.matchingPairs || [];
    const correctCount = pairs.filter((p) => matchingSelections[p.left] === p.right).length;
    const isCorrect = correctCount === pairs.length;
    if (isCorrect) {
      setScore((s) => s + 1);
      setOwlMood('wave');
    } else {
      setOwlMood('idle');
    }

    setAnswersLog((prev) => [
      ...prev,
      {
        questionId: currentQ.id || currentIndex + 1,
        questionText: currentQ.question,
        selected: `จับคู่สำเร็จ ${correctCount}/${pairs.length} คู่`,
        correct: `ทุกคู่ถูกต้อง (${pairs.length} คู่)`,
        isCorrect,
        explanation: currentQ.explanation,
      },
    ]);
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < totalQ) {
      setCurrentIndex((i) => i + 1);
    } else {
      // Save full result payload for QuizResultScreen
      const finalAccuracy = Math.round((score / totalQ) * 100);
      const resultPayload = {
        subject: session.subject,
        topic: session.topic,
        total: totalQ,
        correctCount: score,
        accuracy: finalAccuracy,
        earnedXp: score * 25,
        maxCombo: Math.max(1, score),
        answersLog: answersLog.length > 0 ? answersLog : session.questions.map((q, idx) => ({
          questionId: idx + 1,
          questionText: q.question,
          selected: 'ส่งคำตอบแล้ว',
          correct: String(q.correctAnswer || 'คำตอบที่ถูกต้องตามหลักวิชาการ'),
          isCorrect: true,
          explanation: q.explanation || 'คำอธิบายเชิงวิชาการ',
        })),
      };

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('current_quiz_result', JSON.stringify(resultPayload));
        localStorage.setItem('current_quiz_result', JSON.stringify(resultPayload));
        // Save to permanent history for weakness and quests calculation
        saveQuizHistory({
          subject: session.subject,
          topic: session.topic,
          total: totalQ,
          correctCount: score,
          accuracy: finalAccuracy,
          earnedXp: score * 25,
          maxCombo: Math.max(1, score),
        });
      }

      router.push('/solo/result');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex-1 bg-[#f8fafc] text-[#0f172a] font-sans flex flex-col justify-between">
      
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

              <div className="flex items-center gap-2 sm:gap-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                  <IconClock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="tabular-nums">
                    {session.timerMode === 'zen' ? 'Zen ∞' : `${timeLeft}s`}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200/60">
                  <IconZap className="w-3.5 h-3.5 text-rose-600" />
                  <span>{score} คะแนน</span>
                </div>
              </div>
            </div>

            {/* Question Card */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs space-y-6">
              {/* Type Badge & Question Title with Mascot Buddy */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full">
                      <IconSparkles className="w-3 h-3 text-rose-500" />
                      <span>{session.topic}</span>
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {qType === 'fill' ? 'เติมคำในช่องว่าง' : qType === 'matching' ? 'จับคู่คำตอบ' : 'ปรนัย 4 ตัวเลือก'}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                    {currentQ.question}
                  </h2>
                </div>

                {/* Real-time Reaction Owl Mascot */}
                <div className="shrink-0 hidden sm:flex flex-col items-center justify-center">
                  <PinkOwlMascot mood={owlMood} size={92} className="transition-all duration-300" />
                </div>
              </div>

              {/* 1. MCQ MODE */}
              {qType === 'mcq' && currentQ.options && (
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
                        onClick={() => handleSelectMCQ(idx)}
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
              )}

              {/* 2. FILL-IN-THE-BLANK MODE */}
              {qType === 'fill' && (
                <form onSubmit={handleSubmitFill} className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      disabled={isAnswered}
                      value={fillAnswer}
                      onChange={(e) => setFillAnswer(e.target.value)}
                      placeholder="พิมพ์คำตอบของคุณที่นี่..."
                      className="w-full py-3.5 px-4 rounded-2xl border border-slate-300 text-sm font-semibold text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 bg-slate-50/40 disabled:bg-slate-100"
                    />
                  </div>

                  {!isAnswered && (
                    <button
                      type="submit"
                      disabled={!fillAnswer.trim()}
                      className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold text-sm transition-all shadow-md shadow-rose-600/20 active:scale-95"
                    >
                      ส่งคำตอบ
                    </button>
                  )}
                </form>
              )}

              {/* 3. MATCHING MODE */}
              {qType === 'matching' && currentQ.matchingPairs && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium">
                    คลิกเลือกคำทางฝั่งซ้าย แล้วคลิกคำอธิบายทางฝั่งขวาเพื่อจับคู่:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Left Column (Items) */}
                    <div className="space-y-2.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">คำศัพท์ / หัวข้อ</span>
                      {currentQ.matchingPairs.map((pair, idx) => {
                        const isChosen = selectedLeft === pair.left;
                        const matchedRight = matchingSelections[pair.left];

                        return (
                          <div
                            key={idx}
                            onClick={() => !isAnswered && setSelectedLeft(pair.left)}
                            className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-bold cursor-pointer transition-all ${
                              isChosen
                                ? 'border-2 border-rose-500 bg-rose-50 text-rose-900 shadow-xs'
                                : matchedRight
                                ? 'border-slate-300 bg-slate-50 text-slate-800'
                                : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{pair.left}</span>
                              {matchedRight && (
                                <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                  จับคู่แล้ว
                                </span>
                              )}
                            </div>
                            {matchedRight && (
                              <p className="text-[11px] font-normal text-slate-500 mt-1 pl-2 border-l-2 border-rose-400">
                                → {matchedRight}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Right Column (Definitions) */}
                    <div className="space-y-2.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">ความหมาย / คุณสมบัติ</span>
                      {shuffledRights.map((rightText, idx) => {
                        const isUsed = Object.values(matchingSelections).includes(rightText);

                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={isAnswered || !selectedLeft}
                            onClick={() => handleMatchingSelectRight(rightText)}
                            className={`w-full text-left p-3.5 rounded-2xl border text-xs sm:text-sm transition-all ${
                              isUsed
                                ? 'border-slate-200 bg-slate-100 text-slate-400 opacity-70'
                                : selectedLeft
                                ? 'border-dashed border-rose-300 bg-rose-50/30 hover:bg-rose-50 text-slate-800 cursor-pointer'
                                : 'border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            {rightText}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {!isAnswered && (
                    <button
                      type="button"
                      disabled={Object.keys(matchingSelections).length !== currentQ.matchingPairs.length}
                      onClick={handleSubmitMatching}
                      className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold text-sm transition-all shadow-md shadow-rose-600/20 active:scale-95"
                    >
                      ตรวจคำตอบการจับคู่
                    </button>
                  )}
                </div>
              )}

              {/* Feedback & Explanation Box */}
              {isAnswered && (
                <div
                  className={`p-4 rounded-2xl text-xs sm:text-sm border animate-in fade-in duration-200 ${
                    isCurrentCorrect
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                      : 'bg-rose-50/80 border-rose-200 text-rose-950'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold mb-1">
                    {isCurrentCorrect ? (
                      <>
                        <IconCheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700">ถูกต้อง! ยอดเยี่ยมมาก</span>
                      </>
                    ) : (
                      <>
                        <IconZap className="w-4 h-4 text-rose-600" />
                        <span className="text-rose-700">
                          {qType === 'fill'
                            ? `คำตอบที่ถูกต้องคือ: "${currentQ.correctAnswer}"`
                            : 'ยังไม่ถูกต้อง'}
                        </span>
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
              <p className="text-sm text-slate-500 mt-1">คุณได้ทบทวนเนื้อหาบทเรียนครบถ้วนแล้ว</p>
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
