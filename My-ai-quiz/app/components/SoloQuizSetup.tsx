'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { QuizNavbar } from './QuizNavbar';
import {
  IconGraduationCap,
  IconSparkles,
  IconClock,
  IconFlame,
  IconZap,
  IconArrowRight,
  IconCheckCircle2,
  IconShieldCheck,
} from './ui/Icons';

export function SoloQuizSetup() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isQuick = searchParams.get('quick') === 'true';

  // Solo Config States
  const [subject, setSubject] = useState('[CS101] สถาปัตยกรรมระบบปฏิบัติการ (Operating Systems)');
  const [selectedTopic, setSelectedTopic] = useState('Synchronization & Mutex (แนะนำ)');
  const [customTopic, setCustomTopic] = useState('');
  const [isCustomTopicOpen, setIsCustomTopicOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [timerMode, setTimerMode] = useState<'standard' | 'speed' | 'zen'>('standard');
  const [adaptiveAi, setAdaptiveAi] = useState(true);

  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isQuick) {
      setSubject('[CS101] สถาปัตยกรรมระบบปฏิบัติการ (Operating Systems)');
      setSelectedTopic('Synchronization & Mutex (แนะนำ)');
      setDifficulty('medium');
      setQuestionCount(5);
    }
  }, [isQuick]);

  const getCreditCost = (count: number) => {
    switch (count) {
      case 3:
        return 3;
      case 5:
        return 4;
      case 10:
        return 8;
      case 15:
        return 12;
      default:
        return 4;
    }
  };

  const handleStartQuiz = async () => {
    setLoading(true);
    setErrorMessage(null);

    const targetTopic = isCustomTopicOpen && customTopic.trim() ? customTopic.trim() : selectedTopic;

    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject,
          topic: targetTopic,
          difficulty,
          questionCount,
          timerMode,
          adaptiveAi,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      if (data && data.questions && Array.isArray(data.questions)) {
        const sessionPayload = {
          subject,
          topic: targetTopic,
          difficulty,
          timerMode,
          questions: data.questions,
          currentIndex: 0,
          score: 0,
          startTime: Date.now(),
        };

        if (typeof window !== 'undefined') {
          localStorage.setItem('active_quiz_session', JSON.stringify(sessionPayload));
        }

        router.push('/solo/play');
      } else {
        throw new Error('รูปแบบข้อสอบที่ได้จาก AI ไม่สมบูรณ์ กรุณาลองใหม่อีกครั้ง');
      }
    } catch (err: unknown) {
      console.error('Quiz Generation Error:', err);
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] font-sans flex flex-col justify-between">
      {/* 1. Header / Navbar matching Community */}
      <QuizNavbar />

      {/* 2. Solo Configuration Screen */}
      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          {/* Header Hero Box */}
          <div className="p-6 sm:p-8 bg-gradient-to-r from-rose-50/80 via-pink-50/40 to-transparent border-b border-rose-100/80 flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-13 h-13 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/20">
                <IconGraduationCap className="w-7 h-7" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 mb-1">
                  <IconSparkles className="w-3 h-3 text-rose-600" />
                  <span>AI Adaptive Quiz</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  ตั้งค่าชุดข้อสอบจำลอง
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  ปรับแต่งเนื้อหา ระดับความท้าทาย และระบบจับเวลาตามที่คุณต้องการ
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-full transition-all hover:bg-slate-50"
            >
              ← ย้อนกลับ
            </Link>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mx-6 sm:mx-8 mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-3">
              <div className="p-1 rounded-full bg-rose-200 text-rose-700 mt-0.5">
                <IconZap className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="font-bold">เกิดข้อผิดพลาดในการสร้างโจทย์</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Form Section */}
          <div className="p-6 sm:p-8 space-y-8">
            {/* 1. เลือกวิชาหลัก */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">1</span>
                <span>เลือกวิชาหลัก</span>
              </label>
              <div className="relative">
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/15 cursor-pointer shadow-2xs"
                >
                  <option value="[CS101] สถาปัตยกรรมระบบปฏิบัติการ (Operating Systems)">
                    [CS101] สถาปัตยกรรมระบบปฏิบัติการ (Operating Systems)
                  </option>
                  <option value="[CS102] โครงสร้างข้อมูลและอัลกอริทึม (Data Structures & Algorithms)">
                    [CS102] โครงสร้างข้อมูลและอัลกอริทึม (Data Structures & Algorithms)
                  </option>
                  <option value="[CS103] เครือข่ายคอมพิวเตอร์ (Computer Networks)">
                    [CS103] เครือข่ายคอมพิวเตอร์ (Computer Networks)
                  </option>
                  <option value="[CS104] ปัญญาประดิษฐ์เบื้องต้น (Introduction to AI)">
                    [CS104] ปัญญาประดิษฐ์เบื้องต้น (Introduction to AI)
                  </option>
                  <option value="[SWE] วิศวกรรมซอฟต์แวร์และการออกแบบระบบ (Software Engineering)">
                    [SWE] วิศวกรรมซอฟต์แวร์และการออกแบบระบบ (Software Engineering)
                  </option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* 2. หัวข้อเฉพาะเจาะจง */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">2</span>
                <span>หัวข้อเฉพาะเจาะจง</span>
              </label>
              <div className="flex flex-wrap gap-2.5">
                {[
                  'ทั้งหมดในวิชา',
                  'Process & Thread',
                  'Synchronization & Mutex (แนะนำ)',
                  'Memory Management',
                ].map((topic) => {
                  const isSelected = !isCustomTopicOpen && selectedTopic === topic;
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => {
                        setIsCustomTopicOpen(false);
                        setSelectedTopic(topic);
                      }}
                      className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer active:scale-95 ${
                        isSelected
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {topic}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setIsCustomTopicOpen(!isCustomTopicOpen)}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold border transition-all cursor-pointer active:scale-95 ${
                    isCustomTopicOpen
                      ? 'border-rose-500 bg-rose-50 text-rose-700'
                      : 'border-dashed border-slate-300 text-slate-600 hover:border-rose-400 hover:text-rose-600'
                  }`}
                >
                  พิมพ์หัวข้อเอง +
                </button>
              </div>

              {isCustomTopicOpen && (
                <input
                  type="text"
                  placeholder="พิมพ์หัวข้อย่อยที่คุณต้องการให้ AI เจาะจง..."
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-rose-300 bg-rose-50/20 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/15 animate-in fade-in"
                />
              )}
            </div>

            {/* 3. ระดับความยาก */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">3</span>
                <span>ระดับความยาก</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Easy */}
                <div
                  onClick={() => setDifficulty('easy')}
                  className={`rounded-2xl p-4 border text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-1.5 active:scale-95 ${
                    difficulty === 'easy'
                      ? 'border-2 border-emerald-500 bg-emerald-50/50 shadow-xs'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm text-emerald-700">
                    <IconCheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>ง่าย (Easy)</span>
                  </div>
                  <span className="text-xs text-slate-500">ปูพื้นฐาน & ความจำแม่นยำ</span>
                </div>

                {/* Medium */}
                <div
                  onClick={() => setDifficulty('medium')}
                  className={`rounded-2xl p-4 border text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-1.5 active:scale-95 ${
                    difficulty === 'medium'
                      ? 'border-2 border-amber-500 bg-amber-50/50 shadow-xs'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm text-amber-800">
                    <IconZap className="w-4 h-4 text-amber-600" />
                    <span>ปานกลาง (Medium)</span>
                    <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-700">แนะนำ</span>
                  </div>
                  <span className="text-xs text-slate-500">ความเข้าใจ & วิเคราะห์โจทย์</span>
                </div>

                {/* Hard */}
                <div
                  onClick={() => setDifficulty('hard')}
                  className={`rounded-2xl p-4 border text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-1.5 active:scale-95 ${
                    difficulty === 'hard'
                      ? 'border-2 border-rose-500 bg-rose-50/50 shadow-xs'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm text-rose-700">
                    <IconFlame className="w-4 h-4 text-rose-600" />
                    <span>ท้าทาย (Hard)</span>
                  </div>
                  <span className="text-xs text-slate-500">ข้อสอบจริง & ปัญหาเชิงลึก</span>
                </div>
              </div>
            </div>

            {/* 4. โหมดจับเวลา (Timer Mode) */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">4</span>
                <span>โหมดเวลา (Timer Mode)</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'standard', label: 'มาตรฐาน (30s/ข้อ)' },
                  { id: 'speed', label: 'สปีด (15s/ข้อ)' },
                  { id: 'zen', label: 'โหมดผ่อนคลาย (ไม่จับเวลา)' },
                ].map((item) => {
                  const isSelected = timerMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTimerMode(item.id as 'standard' | 'speed' | 'zen')}
                      className={`py-3 px-2 rounded-2xl text-xs sm:text-sm font-semibold border text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                        isSelected
                          ? 'border-2 border-rose-500 bg-rose-50/70 text-rose-700 shadow-2xs font-bold'
                          : 'border-slate-200/90 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <IconClock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. จำนวนคำถาม & แต้ม */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">5</span>
                <span>จำนวนข้อสอบ & แต้ม</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { count: 3, label: '3 ข้อ', sub: 'ซ้อมด่วน · 3 แต้ม' },
                  { count: 5, label: '5 ข้อ', sub: 'แนะนำ · 4 แต้ม' },
                  { count: 10, label: '10 ข้อ', sub: 'เต็มชุด · 8 แต้ม' },
                ].map((item) => {
                  const isSelected = questionCount === item.count;
                  return (
                    <button
                      key={item.count}
                      type="button"
                      onClick={() => setQuestionCount(item.count)}
                      className={`py-3 px-2 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                        isSelected
                          ? 'border-2 border-rose-500 bg-rose-50/70 text-rose-700 font-bold shadow-2xs'
                          : 'border-slate-200/90 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-sm font-bold">{item.label}</span>
                      <span className="text-[11px] font-medium opacity-80">{item.sub}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-amber-50/80 border border-amber-200/80 px-3.5 py-2.5 text-xs text-amber-900 font-medium shadow-2xs">
                <IconZap className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  การสร้างควิซชุดนี้จะใช้ <strong>{getCreditCost(questionCount)} แต้ม</strong> (คุณมีแต้มคงเหลือ 22 แต้ม)
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Controls / Action Bar */}
          <div className="p-6 sm:p-8 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Adaptive AI Switch */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAdaptiveAi(!adaptiveAi)}
                className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                  adaptiveAi ? 'bg-rose-600' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    adaptiveAi ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
              <div className="text-xs">
                <p className="font-bold text-slate-800">
                  Adaptive AI ปรับความยากอัตโนมัติ
                </p>
                <p className="text-slate-400">ประเมินผลโจทย์ข้อถัดไปตามความแม่นยำ</p>
              </div>
            </div>

            {/* Start Quiz Button */}
            <button
              type="button"
              disabled={loading}
              onClick={handleStartQuiz}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-extrabold text-sm tracking-wide transition-all shadow-md shadow-rose-600/25 active:scale-95 cursor-pointer text-center flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>AI กำลังสร้างโจทย์...</span>
                </>
              ) : (
                <>
                  <span>เริ่มทำแบบทดสอบ · {getCreditCost(questionCount)} แต้ม</span>
                  <IconArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* 3. Footer */}
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
