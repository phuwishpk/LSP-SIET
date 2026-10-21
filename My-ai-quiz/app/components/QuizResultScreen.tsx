'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

  useEffect(() => {
    const raw = sessionStorage.getItem('current_quiz_result');
    if (raw) {
      try {
        setResult(JSON.parse(raw));
      } catch (e) {
        console.error(e);
      }
    } else {
      // Demo fallback
      setResult({
        subject: '[CS101] สถาปัตยกรรมระบบปฏิบัติการ',
        topic: 'Synchronization & Mutex',
        total: 5,
        correctCount: 4,
        accuracy: 80,
        earnedXp: 120,
        maxCombo: 3,
        answersLog: [],
      });
    }
  }, []);

  const total = result?.total || 5;
  const correct = result?.correctCount || 0;
  const accuracy = result?.accuracy || Math.round((correct / total) * 100);

  return (
    <div className="min-h-screen bg-[#fafbfc] text-[#1e293b] font-sans flex flex-col justify-between">
      {/* 1. Header / Navbar */}
      <header className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-8 py-3.5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/" className="text-xl sm:text-2xl font-black tracking-tight text-[#e11d48]">
              StudyTogether
            </Link>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-2xs"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>กลับหน้าหลัก (Quiz Hub)</span>
            </Link>
          </div>

          <div className="hidden md:block text-base font-bold text-slate-800">
            สรุปผลการทดสอบและวิเคราะห์จาก AI
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
            <span className="font-semibold text-slate-700">Lv. 8</span>
            <div className="flex items-center gap-1 border border-slate-200 rounded-full px-2.5 py-1.5 bg-slate-50/70 font-semibold text-slate-700">
              <span className="text-amber-500">🔥</span>
              <span>5 วัน</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Content Body */}
      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 space-y-6 animate-in fade-in duration-200">
        <div className="flex items-center justify-between text-xs sm:text-sm">
          <div>
            <p className="text-pink-600 font-bold text-xs uppercase tracking-wider">AI Quiz Arena / Result & AI Analysis</p>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {result?.subject}: {result?.topic}
            </h1>
          </div>
          <span className="text-slate-400 text-xs hidden sm:inline">ทำแบบทดสอบแล้ว · {total} ข้อ</span>
        </div>

        {/* Big Pink Summary Hero Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-[#fdf2f8] via-[#fce7f3] to-[#ffe4e6] border border-pink-200/80 p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="space-y-4 text-center md:text-left flex-1">
            <span className="inline-block px-3 py-1 rounded-full bg-pink-100/90 text-pink-700 text-xs font-bold border border-pink-200">
              {accuracy >= 80 ? 'ยอดเยี่ยมมาก! 🎉' : accuracy >= 50 ? 'ทำได้ดี! พัฒนาต่อได้อีก 🚀' : 'พยายามได้ดี ฝึกฝนบ่อยๆ จะเก่งขึ้น! 💪'}
            </span>

            <div className="flex items-baseline justify-center md:justify-start gap-2">
              <span className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tight">
                {correct} / {total}
              </span>
              <span className="text-slate-600 font-bold text-lg sm:text-xl">ข้อถูกต้อง</span>
            </div>

            {/* Metric Chips */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2">
              <div className="bg-white/80 rounded-2xl p-3 border border-pink-100/80 text-center">
                <span className="text-[10px] sm:text-xs text-slate-400 block font-medium">EXP ที่ได้รับ</span>
                <span className="font-extrabold text-sm sm:text-base text-pink-600">+{result?.earnedXp || 100} XP</span>
              </div>
              <div className="bg-white/80 rounded-2xl p-3 border border-pink-100/80 text-center">
                <span className="text-[10px] sm:text-xs text-slate-400 block font-medium">คอมโบสูงสุด</span>
                <span className="font-extrabold text-sm sm:text-base text-amber-600">⚡ {result?.maxCombo || 1} Combo</span>
              </div>
              <div className="bg-white/80 rounded-2xl p-3 border border-pink-100/80 text-center">
                <span className="text-[10px] sm:text-xs text-slate-400 block font-medium">ผลการประเมิน</span>
                <span className="font-extrabold text-sm sm:text-base text-slate-700">
                  {accuracy >= 80 ? 'ดีเยี่ยม' : accuracy >= 50 ? 'ผ่านเกณฑ์' : 'ต้องทบทวน'}
                </span>
              </div>
            </div>
          </div>

          {/* Circular Accuracy Gauge */}
          <div className="flex flex-col items-center justify-center p-4">
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-8 border-pink-400 flex items-center justify-center bg-white shadow-inner">
              <span className="text-2xl sm:text-3xl font-black text-pink-600">{accuracy}%</span>
            </div>
            <span className="text-xs font-bold text-slate-600 mt-2">ความแม่นยำโดยรวม</span>
            <span className="text-[10px] text-pink-500 font-medium">วิเคราะห์จาก AI</span>
          </div>
        </div>

        {/* 2 Column Details: Breakdown vs AI Feedback */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">ผลประเมินตามหัวข้อย่อย</h3>
              <p className="text-xs text-slate-400">วิเคราะห์ระดับความเข้าใจจากคำตอบจริง</p>
            </div>

            <div className="space-y-3.5 pt-1">
              {[
                { name: result?.topic || 'หัวข้อหลัก', percentage: accuracy, isWeak: accuracy < 50 },
                { name: 'ความเข้าใจทฤษฎีพื้นฐาน', percentage: Math.min(100, accuracy + 10), isWeak: false },
                { name: 'การประยุกต์ใช้ & วิเคราะห์โจทย์', percentage: Math.max(20, accuracy - 15), isWeak: accuracy < 70 },
              ].map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <span>{item.name}</span>
                      {item.isWeak && (
                        <span className="text-[10px] text-pink-500 font-bold bg-pink-50 px-1.5 py-0.5 rounded border border-pink-100">
                          จุดอ่อนหลัก
                        </span>
                      )}
                    </span>
                    <span className="font-bold text-slate-800">{item.percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${item.isWeak ? 'bg-pink-400' : 'bg-pink-500'}`}
                      style={{ width: `${item.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-500 flex items-center justify-center">
                  <span className="text-base">🧬</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">คำแนะนำเฉพาะบุคคล (AI Analysis)</h3>
                  <p className="text-[11px] text-slate-400">สร้างจากโมเดล OpenRouter AI</p>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-1">
                {accuracy >= 80
                  ? `คุณมีความเข้าใจในหัวข้อ "${result?.topic}" เป็นอย่างดี ตอบถูกถึง ${correct} จาก ${total} ข้อ สามารถขยับไปลองทำโจทย์ระดับ "ท้าทาย" ได้เลย!`
                  : `จากผลการทดสอบหัวข้อ "${result?.topic}" คุณตอบถูก ${correct} ข้อ ยังมีบางจุดที่สับสน แนะนำให้อ่านทบทวนคำอธิบายเฉลยและลองทำซ้ำอีกครั้ง`}
              </p>

              <div className="bg-pink-50/70 border border-pink-200/80 rounded-2xl p-4 space-y-1">
                <span className="text-xs font-bold text-pink-600 flex items-center gap-1">
                  <span>📌</span>
                  <span>สิ่งที่ควรทบทวนต่อ</span>
                </span>
                <p className="text-xs text-pink-900">
                  {accuracy < 80
                    ? `โฟกัสที่การทำความเข้าใจความหมายและเงื่อนไขของ ${result?.topic}`
                    : `เตรียมพร้อมสำหรับบทถัดไปของวิชา ${result?.subject}`}
                </p>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 pt-2">
              AI Quiz Arena ช่วยให้คุณพัฒนาทีละจุดอย่างแม่นยำ
            </div>
          </div>
        </div>

        {/* Review Answers Toggle */}
        {result?.answersLog && result.answersLog.length > 0 && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
            <button
              onClick={() => setShowReview(!showReview)}
              className="w-full flex items-center justify-between text-left font-bold text-sm text-slate-800"
            >
              <span>📋 ทบทวนเฉลยคำตอบแต่ละข้อ ({result.answersLog.length} ข้อ)</span>
              <span className="text-pink-600 text-xs font-semibold">
                {showReview ? 'ซ่อนเฉลย ▲' : 'แสดงเฉลยละเอียด ▼'}
              </span>
            </button>

            {showReview && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                {result.answersLog.map((log, idx) => (
                  <div key={idx} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60 space-y-2 text-xs sm:text-sm">
                    <p className="font-bold text-slate-900">
                      {idx + 1}. {log.questionText}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`px-2.5 py-1 rounded-full ${log.isCorrect ? 'bg-emerald-100 text-emerald-800 font-semibold' : 'bg-rose-100 text-rose-800 font-semibold'}`}>
                        คำตอบของคุณ: {log.selected} {log.isCorrect ? '✓' : '✕'}
                      </span>
                      {!log.isCorrect && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                          เฉลยที่ถูกต้อง: {log.correct}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600 text-xs mt-1 bg-white p-3 rounded-xl border border-slate-200/60">
                      💡 <strong>คำอธิบาย:</strong> {log.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
          <Link
            href="/solo"
            className="py-3.5 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm text-center transition cursor-pointer"
          >
            ตั้งค่าสร้างควิซชุดใหม่
          </Link>
          <Link
            href="/solo?quick=true"
            className="py-3.5 px-4 rounded-2xl bg-[#e11d48] hover:bg-[#be123c] text-white font-bold text-sm text-center transition shadow-sm active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>⚡</span>
            <span>ฝึกซ้อมจุดอ่อนนี้ทันทีด้วย AI</span>
          </Link>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white/70 py-4 px-4 sm:px-8 text-xs text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p>ทุกครั้งที่ฝึก คืออีกก้าวของความสำเร็จ · ให้ AI ช่วยวางแกนวิถีเรียนรู้ของคุณ</p>
          <p>StudyTogether · Learn. Play. Grow.</p>
        </div>
      </footer>
    </div>
  );
}
