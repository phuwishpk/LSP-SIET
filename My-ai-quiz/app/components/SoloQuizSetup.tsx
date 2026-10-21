'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

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
  const [questionCount, setQuestionCount] = useState<number>(5); // default 5 for fast demo
  const [timerMode, setTimerMode] = useState<'standard' | 'speed' | 'zen'>('standard');
  const [questionType, setQuestionType] = useState<'mcq' | 'tf' | 'code'>('mcq');
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
      case 5:
        return 4;
      case 15:
        return 12;
      default:
        return 8;
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
          count: questionCount,
          timerMode,
          questionType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'ไม่สามารถสร้างข้อสอบได้ในขณะนี้');
      }

      if (data?.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
        // Save quiz session to localStorage for Gameplay screen
        const sessionPayload = {
          subject: data.subject || subject,
          topic: data.topic || targetTopic,
          difficulty,
          timerMode,
          questions: data.quiz,
          startedAt: Date.now(),
        };
        sessionStorage.setItem('current_quiz_session', JSON.stringify(sessionPayload));

        // Navigate to play screen
        router.push('/play');
      } else {
        throw new Error('ไม่พบข้อมูลข้อสอบจาก AI กรุณาลองใหม่อีกครั้ง');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

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
              <span>กลับหน้าหลัก</span>
            </Link>
          </div>

          <div className="hidden md:block text-base font-bold text-slate-800">
            โหมดฝึกฝนเดี่ยว (Solo Practice)
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-0.5 border border-slate-200 rounded-full px-2.5 py-1.5 bg-slate-50/70">
              <span className="text-[#f43f5e] text-xs">❤️❤️❤️</span>
            </div>
            <div className="flex items-center gap-1 border border-slate-200 rounded-full px-2.5 py-1.5 bg-slate-50/70 font-semibold text-slate-700">
              <span className="text-amber-500">🔥</span>
              <span>5 วัน</span>
            </div>
            <div className="flex items-center gap-1 border border-slate-200 rounded-full px-2.5 py-1.5 bg-slate-50/70 text-slate-700 font-medium">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>เครดิตคงเหลือ: 20 แต้ม</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Solo Configuration Screen */}
      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
          {/* Header Box */}
          <div className="p-6 sm:p-8 border-b border-slate-100 flex items-start gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14v7" />
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 text-pink-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                กำหนดค่าแบบทดสอบ AI (OpenRouter AI)
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                ขับเคลื่อนด้วยโมเดลฟรีอัจฉริยะ สร้างโจทย์ตามหลักสูตรของคุณแบบ Real-time
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mx-6 sm:mx-8 mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-start gap-2.5">
              <span className="text-base">⚠️</span>
              <div>
                <p className="font-bold">เกิดข้อผิดพลาดในการสร้างโจทย์</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Form Section */}
          <div className="p-6 sm:p-8 space-y-7">
            {/* 1. เลือกวิชาหลัก */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-800">
                1. เลือกวิชาหลัก
              </label>
              <div className="relative">
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-700 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-100 cursor-pointer"
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
              <label className="block text-sm font-bold text-slate-800">
                2. หัวข้อเฉพาะเจาะจง
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
                      className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition cursor-pointer ${
                        isSelected
                          ? 'bg-pink-50 text-pink-600 border-2 border-pink-300 font-semibold'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {topic}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setIsCustomTopicOpen(!isCustomTopicOpen)}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium border transition cursor-pointer ${
                    isCustomTopicOpen
                      ? 'border-2 border-pink-400 bg-pink-50 text-pink-600 font-bold'
                      : 'border-dashed border-slate-300 text-slate-600 hover:border-pink-400 hover:text-pink-600'
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
                  className="mt-2 w-full rounded-2xl border border-pink-200 px-4 py-3 text-sm text-slate-800 outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100"
                />
              )}
            </div>

            {/* 3. ระดับความยาก */}
            <div className="space-y-2.5">
              <label className="block text-sm font-bold text-slate-800">
                3. ระดับความยาก
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  onClick={() => setDifficulty('easy')}
                  className={`rounded-2xl p-4 border text-center cursor-pointer transition flex flex-col items-center justify-center gap-1 ${
                    difficulty === 'easy'
                      ? 'border-2 border-pink-400 bg-pink-50/40 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm text-slate-800">
                    <span className="w-2.5 h-2.5 rounded-full border border-slate-300 inline-block"></span>
                    <span>ง่าย</span>
                  </div>
                  <span className="text-xs text-slate-400">พื้นฐานความจำ</span>
                </div>

                <div
                  onClick={() => setDifficulty('medium')}
                  className={`rounded-2xl p-4 border text-center cursor-pointer transition flex flex-col items-center justify-center gap-1 ${
                    difficulty === 'medium'
                      ? 'border-2 border-pink-400 bg-pink-50/40 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm text-pink-600">
                    <span className="text-pink-500 text-xs">☀️</span>
                    <span>ปานกลาง</span>
                  </div>
                  <span className="text-xs text-slate-500">ความเข้าใจ & วิเคราะห์</span>
                </div>

                <div
                  onClick={() => setDifficulty('hard')}
                  className={`rounded-2xl p-4 border text-center cursor-pointer transition flex flex-col items-center justify-center gap-1 ${
                    difficulty === 'hard'
                      ? 'border-2 border-pink-400 bg-pink-50/40 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm text-slate-800">
                    <span className="w-2.5 h-2.5 rounded-full border border-slate-300 inline-block"></span>
                    <span>ท้าทาย</span>
                  </div>
                  <span className="text-xs text-slate-400">ประยุกต์ใช้ & แก้ปัญหา</span>
                </div>
              </div>
            </div>

            {/* 4. โหมดจับเวลา (Timer Mode) */}
            <div className="space-y-2.5">
              <label className="block text-sm font-bold text-slate-800">
                4. โหมดเวลา (Timer Mode)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'standard', label: 'ปกติ (30s/ข้อ)', icon: '⏱️' },
                  { id: 'speed', label: 'สปีด (15s/ข้อ)', icon: '⚡' },
                  { id: 'zen', label: 'ไร้ความกดดัน (Zen)', icon: '🌿' },
                ].map((item) => {
                  const isSelected = timerMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTimerMode(item.id as 'standard' | 'speed' | 'zen')}
                      className={`py-3 px-2 rounded-2xl text-xs sm:text-sm font-medium border text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? 'border-2 border-pink-400 bg-pink-50 text-pink-600 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. จำนวนคำถาม & เครดิต */}
            <div className="space-y-2.5">
              <label className="block text-sm font-bold text-slate-800">
                5. จำนวนคำถาม & เครดิต
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { count: 3, label: '3 ข้อ (เทสต์เร็ว)' },
                  { count: 5, label: '5 ข้อ (4 แต้ม - แนะนำ)' },
                  { count: 10, label: '10 ข้อ (8 แต้ม)' },
                ].map((item) => {
                  const isSelected = questionCount === item.count;
                  return (
                    <button
                      key={item.count}
                      type="button"
                      onClick={() => setQuestionCount(item.count)}
                      className={`py-3 px-2 rounded-2xl text-xs sm:text-sm font-medium border text-center transition cursor-pointer ${
                        isSelected
                          ? 'border-2 border-pink-400 bg-pink-50 text-pink-600 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-pink-50/60 border border-pink-100 px-3.5 py-2.5 text-xs text-pink-700 font-medium">
                <svg className="w-4 h-4 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                <span>
                  การสร้างชุดนี้จะใช้ {getCreditCost(questionCount)} แต้ม (คุณเหลือ 20 แต้ม)
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Controls / Action Bar */}
          <div className="p-6 sm:p-8 bg-slate-50/60 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Adaptive AI Switch */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAdaptiveAi(!adaptiveAi)}
                className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition duration-300 ${
                  adaptiveAi ? 'bg-[#e11d48]' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-300 ${
                    adaptiveAi ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
              <div className="text-xs">
                <p className="font-semibold text-slate-800">
                  เปิดการปรับความยากตามผลลัพธ์อัตโนมัติ
                </p>
                <p className="text-slate-400">(Adaptive AI)</p>
              </div>
            </div>

            {/* Start Quiz Button */}
            <button
              type="button"
              disabled={loading}
              onClick={handleStartQuiz}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-[#e11d48] hover:bg-[#be123c] disabled:bg-slate-400 text-white font-bold text-sm tracking-wide transition shadow-sm active:scale-[0.99] cursor-pointer text-center flex items-center justify-center gap-2"
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
                <span>สร้างโจทย์และเริ่มเล่นทันที (Start Quiz)</span>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white/70 py-4 px-4 sm:px-8 text-xs text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p>ทุกคำตอบคืออีกก้าวของการเรียนรู้ ค่อย ๆ เก่งขึ้นไปด้วยกัน</p>
          <p>StudyTogether · Learn. Play. Grow.</p>
        </div>
      </footer>
    </div>
  );
}
