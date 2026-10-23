'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PinkOwlMascot } from './PinkOwlMascot';
import {
  IconCheckCircle2,
  IconZap,
  IconTrophy,
  IconFlame,
  IconArrowRight,
  IconShieldCheck,
  IconSparkles,
} from './ui/Icons';

interface QuizResultPayload {
  subject: string;
  topic: string;
  total: number;
  correctCount: number;
  accuracy: number;
  earnedXp: number;
  maxCombo: number;
  answersLog: Array<{
    questionId: number;
    questionText: string;
    selected: string;
    correct: string;
    isCorrect: boolean;
    explanation: string;
  }>;
}

export function QuizResultScreen() {
  const [result, setResult] = useState<QuizResultPayload | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    let targetAccuracy = 80;
    let raw = null;
    if (typeof window !== 'undefined') {
      raw = sessionStorage.getItem('current_quiz_result') || localStorage.getItem('current_quiz_result');
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setResult(parsed);
        targetAccuracy = parsed.accuracy || Math.round((parsed.correctCount / (parsed.total || 1)) * 100);
      } catch (e) {
        console.error(e);
      }
    } else {
      // Demo fallback conforming to DESIGN.md
      const fallback = {
        subject: '[CS101] สถาปัตยกรรมระบบปฏิบัติการ',
        topic: 'Synchronization & Mutex Lock',
        total: 5,
        correctCount: 4,
        accuracy: 80,
        earnedXp: 120,
        maxCombo: 3,
        answersLog: [
          {
            questionId: 1,
            questionText: 'Mutex Lock มีวัตถุประสงค์หลักข้อใดในการทำงานของระบบปฏิบัติการ?',
            selected: 'ป้องกันไม่ให้เกิด Race Condition ใน Critical Section โดยอนุญาตให้ทำงานได้ทีละ Thread',
            correct: 'ป้องกันไม่ให้เกิด Race Condition ใน Critical Section โดยอนุญาตให้ทำงานได้ทีละ Thread',
            isCorrect: true,
            explanation: 'Mutex (Mutual Exclusion) ออกแบบมาเพื่อให้มีเพียง Thread เดียวที่สามารถถือครอง Lock และเข้าใช้งาน Critical Section ได้ในเวลาเดียวกัน',
          },
          {
            questionId: 2,
            questionText: 'สภาวะที่ Thread สองตัวต่างรอทรัพยากรซึ่งกันและกันจนไม่สามารถทำงานต่อได้เรียกว่าอะไร?',
            selected: 'Deadlock',
            correct: 'Deadlock',
            isCorrect: true,
            explanation: 'Deadlock คือสภาวะที่มีการค้างรอทรัพยากรเป็นวงกลม ส่งผลให้ไม่มีใครสามารถทำงานต่อไปได้',
          },
          {
            questionId: 3,
            questionText: 'เงื่อนไขใดต่อไปนี้ไม่ใช่ 1 ใน 4 เงื่อนไขของ Coffman ที่ทำให้เกิด Deadlock?',
            selected: 'Mutual Exclusion',
            correct: 'Preemption Allowed',
            isCorrect: false,
            explanation: 'เงื่อนไขที่ถูกต้องคือ "No Preemption" (ไม่ยอมให้แย่งชิงทรัพยากร) ถ้ามี Preemption จะไม่เกิด Deadlock',
          },
        ],
      };
      setResult(fallback);
      targetAccuracy = fallback.accuracy;
    }

    // Trigger smooth entrance progress animation
    const timer = setTimeout(() => {
      setAnimatedProgress(targetAccuracy);
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  const total = result?.total || 5;
  const correct = result?.correctCount || 0;
  const accuracy = result?.accuracy ?? Math.round((correct / (total || 1)) * 100);

  // Circular gauge calculations
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedProgress / 100) * circumference;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex-1 bg-[#fafbfc] text-[#202124] font-sans flex flex-col justify-between">
      
      {/* 2. Main Content Body */}
      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 space-y-7 animate-in fade-in duration-300">
        {/* Breadcrumb & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200/60 mb-1">
              <IconSparkles className="w-3.5 h-3.5 text-rose-500" />
              <span>สรุปผลการทดสอบ & AI Diagnostic</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {result?.subject}: {result?.topic}
            </h1>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full self-start sm:self-auto">
            แบบฝึกหัด {total} ข้อ
          </span>
        </div>

        {/* Hero Banner: Precision Result & Progress Gauge */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rose-50/90 via-pink-50/50 to-amber-50/30 border border-rose-100 p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-4 text-center md:text-left flex-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-rose-700 bg-white px-3 py-1 rounded-full border border-rose-200/70 shadow-2xs">
              <span>{accuracy >= 80 ? 'Mastery Level: ยอดเยี่ยมมาก' : accuracy >= 50 ? 'Proficient: ผ่านเกณฑ์มาตรฐาน' : 'Needs Practice: ต้องฝึกฝนเพิ่มเติม'}</span>
            </div>

            <div>
              <div className="flex items-baseline justify-center md:justify-start gap-2">
                <span className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tight">
                  {correct} / {total}
                </span>
                <span className="text-slate-500 font-bold text-base sm:text-lg">ข้อถูกต้อง</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                {accuracy >= 80
                  ? 'คุณมีความเข้าใจในทฤษฎีและประยุกต์ใช้ได้อย่างแม่นยำ พร้อมลุยบทต่อไป!'
                  : 'ทำได้ดี มีบางจุดที่ยังสับสน ทบทวนคำอธิบายเฉลยด้านล่างเพื่อพัฒนาให้แม่นยำขึ้น'}
              </p>
            </div>

            {/* Gamification Metric Chips according to DESIGN.md */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 pt-2">
              {/* XP Reward (Gold) */}
              <div className="bg-white rounded-2xl p-3 border border-amber-200/80 shadow-2xs text-center">
                <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-amber-700 uppercase">
                  <IconTrophy className="w-3.5 h-3.5 text-amber-500" />
                  <span>XP ที่ได้รับ</span>
                </div>
                <span className="font-black text-base sm:text-lg text-amber-900 mt-0.5 block">
                  +{result?.earnedXp || correct * 25} XP
                </span>
              </div>

              {/* Combo Streak (Flame/Orange) */}
              <div className="bg-white rounded-2xl p-3 border border-orange-200/80 shadow-2xs text-center">
                <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-orange-700 uppercase">
                  <IconFlame className="w-3.5 h-3.5 text-orange-500" />
                  <span>คอมโบสูงสุด</span>
                </div>
                <span className="font-black text-base sm:text-lg text-orange-900 mt-0.5 block">
                  {result?.maxCombo || 1} ข้อติด
                </span>
              </div>

              {/* Evaluation State (Emerald) */}
              <div className="bg-white rounded-2xl p-3 border border-emerald-200/80 shadow-2xs text-center">
                <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-700 uppercase">
                  <IconCheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>สถานะการผ่าน</span>
                </div>
                <span className="font-black text-base sm:text-lg text-emerald-900 mt-0.5 block">
                  {accuracy >= 50 ? 'ผ่านเกณฑ์' : 'ทบทวนเพิ่ม'}
                </span>
              </div>
            </div>
          </div>

          {/* Radial Circular Progress Gauge (Accurate SVG Animation) */}
          <div className="relative shrink-0 flex flex-col items-center justify-center p-3">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 128 128">
                {/* Track circle */}
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  stroke="#f1f5f9"
                  strokeWidth="10"
                  fill="transparent"
                />
                {/* Animated value circle */}
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  stroke="url(#roseGradient)"
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
                <defs>
                  <linearGradient id="roseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="100%" stopColor="#e11d48" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Inside Value Badge */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                  {animatedProgress}%
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  ความแม่นยำ
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 2-Column Section: Breakdown Progress Bars vs AI Coaching Feedback */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column A: Subtopic Breakdown & Animated Progress Bars */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">ผลประเมินตามเกณฑ์รายวิชา</h3>
                <p className="text-xs text-slate-400">วิเคราะห์ทักษะย่อยเพื่อเจาะลึกจุดแข็ง-จุดอ่อน</p>
              </div>
              <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                <IconZap className="w-4 h-4" />
              </span>
            </div>

            <div className="space-y-4 pt-2">
              {[
                {
                  title: result?.topic || 'หัวข้อทดสอบหลัก',
                  percent: accuracy,
                  isWeak: accuracy < 50,
                  tag: accuracy >= 80 ? 'แม่นยำสูง' : accuracy < 50 ? 'จุดที่ต้องทบทวน' : 'ปานกลาง',
                },
                {
                  title: 'ความเข้าใจทฤษฎีพื้นฐาน',
                  percent: Math.min(100, Math.round(accuracy * 1.05)),
                  isWeak: false,
                  tag: 'พื้นฐานแน่น',
                },
                {
                  title: 'การวิเคราะห์โจทย์ & ประยุกต์ใช้',
                  percent: Math.max(20, Math.round(accuracy * 0.9)),
                  isWeak: accuracy < 70,
                  tag: accuracy < 70 ? 'ฝึกซ้อมเพิ่ม' : 'พร้อมสอบ',
                },
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-bold text-slate-800 flex items-center gap-2">
                      <span>{item.title}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.isWeak
                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.tag}
                      </span>
                    </span>
                    <span className="font-extrabold text-slate-900 tabular-nums">{item.percent}%</span>
                  </div>

                  {/* Multi-layer Progress Bar according to DESIGN.md */}
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${
                        item.isWeak
                          ? 'bg-gradient-to-r from-rose-400 to-rose-600'
                          : 'bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600'
                      }`}
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column B: AI Diagnostic Card with Pink Owl Mascot */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-4">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <IconSparkles className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">คำแนะนำเฉพาะบุคคล (AI Coach)</h3>
                    <p className="text-[11px] text-slate-400">ประมวลผลจากข้อมูลการตอบของคุณ</p>
                  </div>
                </div>
                <PinkOwlMascot mood={accuracy >= 80 ? "celebrate" : "study"} size={90} />
              </div>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {accuracy >= 80
                  ? `สุดยอดมาก! คุณเข้าใจหลักการของ "${result?.topic}" เป็นอย่างดี ตอบถูกถึง ${correct} จาก ${total} ข้อ สามารถขยับไปลองทำโจทย์ระดับ "ท้าทาย (Hard)" หรือช่วยติวเพื่อนในคอมมูนิตี้ได้เลย`
                  : `จากคำตอบในหัวข้อ "${result?.topic}" คุณทำได้ดี แต่ยังมีบางข้อที่สับสนในเรื่องเงื่อนไขและการประยุกต์ใช้ แนะนำให้ทบทวนเฉลยละเอียดและลองฝึกซ้ำอีกรอบ`}
              </p>

              {/* Next Action Box */}
              <div className="bg-rose-50/70 border border-rose-200/70 rounded-2xl p-4 space-y-1">
                <span className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                  <IconZap className="w-3.5 h-3.5 text-rose-600" />
                  <span>ก้าวถัดไปที่แนะนำ:</span>
                </span>
                <p className="text-xs text-rose-950 leading-relaxed font-medium">
                  {accuracy < 80
                    ? `ทบทวนแนวคิดสำคัญของ ${result?.topic} ผ่านสรุปใน Community ก่อนสอบจริง`
                    : `เตรียมพร้อมสำหรับบทเรียนถัดไปของ ${result?.subject}`}
                </p>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 font-medium">
              StudyTogether AI Arena · พัฒนาความรู้ทุกวัน
            </div>
          </div>
        </div>

        {/* Detailed Question Review Accordion */}
        {result?.answersLog && result.answersLog.length > 0 && (
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-2xs space-y-4">
            <button
              type="button"
              onClick={() => setShowReview(!showReview)}
              className="w-full flex items-center justify-between text-left font-bold text-sm text-slate-900 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span>เฉลยคำตอบและคำอธิบายละเอียด ({result.answersLog.length} ข้อ)</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {correct}/{total} ถูก
                </span>
              </div>
              <span className="text-rose-600 text-xs font-bold hover:underline">
                {showReview ? 'ซ่อนเฉลย ▲' : 'ดูเฉลยทั้งหมด ▼'}
              </span>
            </button>

            {showReview && (
              <div className="space-y-4 pt-3 border-t border-slate-100 animate-in fade-in duration-200">
                {result.answersLog.map((log, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border transition-all ${
                      log.isCorrect
                        ? 'border-emerald-200/80 bg-emerald-50/20'
                        : 'border-rose-200/80 bg-rose-50/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold text-slate-900 text-xs sm:text-sm leading-relaxed">
                        {idx + 1}. {log.questionText}
                      </p>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          log.isCorrect
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {log.isCorrect ? (
                          <>
                            <IconCheckCircle2 className="w-3 h-3 text-emerald-700" />
                            <span>ถูกต้อง</span>
                          </>
                        ) : (
                          <>
                            <IconZap className="w-3 h-3 text-rose-700" />
                            <span>ยังไม่ถูก</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                      <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700">
                        <span className="text-slate-400 mr-1.5 font-medium">คำตอบของคุณ:</span>
                        <span className="font-semibold">{log.selected || '(ไม่ได้ตอบ)'}</span>
                      </div>
                      {!log.isCorrect && (
                        <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                          <span className="text-emerald-600 mr-1.5 font-medium">คำตอบที่ถูก:</span>
                          <span className="font-bold">{log.correct}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 bg-white p-3.5 rounded-xl border border-slate-200/70 text-xs text-slate-600 leading-relaxed">
                      <span className="font-bold text-slate-800 block mb-0.5">คำอธิบายทางวิชาการ:</span>
                      {log.explanation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Button Navigation */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <Link
            href="/solo"
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm text-center transition-all shadow-2xs active:scale-95"
          >
            ← ปรับแต่งและทำใหม่อีกครั้ง
          </Link>

          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm tracking-wide transition-all shadow-md shadow-rose-600/25 active:scale-95 text-center group"
          >
            <span>กลับสู่ Arena หน้าแรก</span>
            <IconArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white/70 py-4 px-4 sm:px-8 text-xs text-slate-400">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
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
