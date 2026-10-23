'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { QuizNavbar } from './QuizNavbar';
import { api, ApiError, getWorkspaceUrl } from '../lib/workspace';
import { refreshWorkspace, setBalance, useWorkspace } from '../lib/useWorkspace';
import {
  AUTO,
  FILES,
  MAX_PICKED_FILES,
  NONE,
  PERSONAL,
  loadKnowledgeOptions,
  scopeFields,
  type KnowledgeFile,
  type KnowledgeGroup,
} from '../lib/knowledge';
import {
  IconGraduationCap,
  IconSparkles,
  IconClock,
  IconFlame,
  IconZap,
  IconArrowRight,
  IconCheckCircle2,
  IconShieldCheck,
  IconListFilter,
  IconPenLine,
  IconLink2,
} from './ui/Icons';

export function SoloQuizSetup() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isQuick = searchParams.get('quick') === 'true';

  const { status: workspaceStatus, me } = useWorkspace();

  // Solo Config States
  // Knowledge source: the same picker as the AI Roadmap app (see lib/knowledge.ts).
  const [source, setSource] = useState(AUTO);
  const [groups, setGroups] = useState<KnowledgeGroup[]>([]);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [fileFilter, setFileFilter] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [timerMode, setTimerMode] = useState<'standard' | 'speed' | 'zen'>('standard');
  const [questionType, setQuestionType] = useState<'mixed' | 'mcq' | 'fill' | 'matching'>('mixed');
  const [adaptiveAi, setAdaptiveAi] = useState(true);

  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // "ทบทวนจุดอ่อน" links back here with the topic of an earlier set.
    const qTopic = searchParams.get('topic');
    if (qTopic) {
      setTopic(qTopic);
    }
    if (isQuick) {
      setDifficulty('medium');
      setQuestionCount(5);
    }
  }, [isQuick, searchParams]);

  useEffect(() => {
    if (workspaceStatus !== 'ready') return;
    let alive = true;
    loadKnowledgeOptions().then((loaded) => {
      if (!alive) return;
      setGroups(loaded.groups);
      setFiles(loaded.files);
    });
    return () => {
      alive = false;
    };
  }, [workspaceStatus]);

  // The system's price and the user's points (staff are not charged).
  const cost = Number(me?.costs?.quiz_generate ?? 8);
  const exempt = Boolean(me?.exempt);
  const balance = me?.balance ?? 0;
  const missing = exempt ? 0 : Math.max(0, cost - balance);
  const signedOut = workspaceStatus === 'signed-out';

  const sourceLabel = (() => {
    if (source === NONE) return 'ไม่ใช้คลังความรู้';
    if (source === AUTO) return 'ทุกคลังที่ฉันเห็นได้';
    if (source === PERSONAL) return 'ไฟล์ของฉันทั้งหมด';
    if (source === FILES) return picked.length ? `ไฟล์ที่เลือก ${picked.length} ไฟล์` : 'ไฟล์ที่เลือก';
    for (const group of groups) {
      const found = group.options.find((option) => option.value === source);
      if (found) return found.label;
    }
    return 'คลังความรู้';
  })();
  const specificSource = source !== NONE && source !== AUTO;
  const overviewTopic = `ภาพรวมเนื้อหาทั้งหมดใน${sourceLabel}`;

  const pickLimit = MAX_PICKED_FILES;
  const shownFiles = fileFilter.trim()
    ? files.filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(fileFilter.trim().toLowerCase()))
    : files;
  const togglePicked = (value: string) =>
    setPicked((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : current.length >= pickLimit
        ? current
        : [...current, value]
    );

  const canStart =
    !loading &&
    !signedOut &&
    workspaceStatus === 'ready' &&
    topic.trim().length > 0 &&
    missing === 0 &&
    !(source === FILES && picked.length === 0);

  const handleStartQuiz = async () => {
    if (!canStart) return;
    setLoading(true);
    setErrorMessage(null);

    const targetTopic = topic.trim();
    const subject = sourceLabel;

    try {
      const data = await api<{ session_id?: string; balance?: number; questions?: unknown[]; quiz?: unknown[] }>(
        'generate-quiz',
        {
          method: 'POST',
          json: {
            topic: targetTopic,
            difficulty,
            count: questionCount,
            questionType,
            ...scopeFields(source, picked),
          },
        }
      );
      setBalance(data?.balance);
      const questionsList = data?.questions || data?.quiz;

      if (Array.isArray(questionsList) && questionsList.length > 0) {
        const formattedQuestions = questionsList.map((q: any, qIdx: number) => {
          const type = q.type || (q.matchingPairs ? 'matching' : q.options ? 'mcq' : 'fill');
          
          let correctIdx = 0;
          if (type === 'mcq' && q.options) {
            if (typeof q.correctAnswer === 'number') {
              correctIdx = q.correctAnswer;
            } else if (typeof q.correctAnswer === 'string') {
              const foundIdx = q.options.findIndex((opt: string) => opt.trim() === q.correctAnswer.trim());
              correctIdx = foundIdx !== -1 ? foundIdx : 0;
            }
          }

          return {
            id: q.id || qIdx + 1,
            type: type,
            question: q.question,
            options: q.options || [],
            correctAnswer: type === 'mcq' ? correctIdx : q.correctAnswer,
            acceptableAnswers: q.acceptableAnswers || (q.correctAnswer ? [String(q.correctAnswer)] : []),
            matchingPairs: q.matchingPairs || [],
            explanation: q.explanation || 'คำตอบที่ถูกต้องตามหลักวิชาการ',
          };
        });

        const sessionPayload = {
          // The set saved in SIET Space (its quiz sessions).
          sessionId: data?.session_id ?? null,
          subject,
          topic: targetTopic,
          difficulty,
          timerMode,
          questions: formattedQuestions,
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
      if (err instanceof ApiError && err.status === 402) {
        void refreshWorkspace();
        setErrorMessage(`แต้มไม่พอ ต้องใช้ ${err.headers?.get('x-points-required') ?? cost} แต้ม (มี ${err.headers?.get('x-points-balance') ?? balance} แต้ม)`);
      } else if (err instanceof ApiError && err.status === 401) {
        void refreshWorkspace();
        setErrorMessage(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI');
      }
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
                  <span>AI Multi-format Quiz Engine</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  ตั้งค่าชุดข้อสอบจำลอง
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  ปรับแต่งรูปแบบข้อสอบ (ปรนัย, เติมคำ, จับคู่) ระดับความท้าทาย และระบบจับเวลา
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

          {/* Not signed in: this app works with the SIET Space account */}
          {signedOut && (
            <div className="mx-6 sm:mx-8 mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-3">
              <div className="p-1 rounded-full bg-amber-100 text-amber-700 mt-0.5">
                <IconShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="font-bold">ยังไม่ได้เข้าสู่ระบบ</p>
                <p className="mt-0.5">
                  เปิดแอปนี้จากเมนู “แอป AI Quiz” ใน{' '}
                  <a href={`${getWorkspaceUrl()}/community`} className="font-bold underline">
                    SIET Space
                  </a>{' '}
                  เพื่อใช้แต้มและคลังความรู้ของบัญชีคุณ
                </p>
              </div>
            </div>
          )}

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
            {/* 1. แหล่งความรู้ (the same picker as the AI Roadmap app) */}
            <div className="space-y-2">
              <label htmlFor="quiz-source" className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">1</span>
                <span>แหล่งความรู้</span>
                <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
              </label>
              <div className="relative">
                <select
                  id="quiz-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={loading}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/15 cursor-pointer shadow-2xs"
                >
                  <option value={NONE}>ไม่ใช้คลังความรู้ (ใช้ความรู้ของ AI)</option>
                  <option value={AUTO}>อัตโนมัติ (ทุกคลังที่ฉันเห็นได้)</option>
                  <option value={PERSONAL}>ไฟล์ของฉันทั้งหมด</option>
                  {files.length > 0 && <option value={FILES}>เลือกไฟล์เอง (เลือกได้หลายไฟล์)</option>}
                  {groups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {source === NONE
                  ? 'AI สร้างโจทย์จากความรู้ทั่วไปของตัวเอง'
                  : 'AI อ่านเนื้อหาที่ตรงกับหัวข้อจากคลังที่เลือก แล้วสร้างโจทย์จากเนื้อหานั้น'}
              </p>

              {source === FILES && (
                <div className="space-y-2">
                  {files.length > 8 && (
                    <input
                      type="text"
                      placeholder="ค้นหาไฟล์…"
                      value={fileFilter}
                      onChange={(e) => setFileFilter(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
                    />
                  )}
                  <ul className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5">
                    {shownFiles.map((item) => {
                      const checked = picked.includes(item.value);
                      return (
                        <li key={item.value}>
                          <label
                            className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                              checked ? 'bg-rose-50/60' : 'hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePicked(item.value)}
                              disabled={loading || (!checked && picked.length >= pickLimit)}
                              className="h-4 w-4 accent-rose-600"
                            />
                            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{item.label}</span>
                            <span className="shrink-0 text-xs text-slate-400">{item.meta}</span>
                          </label>
                        </li>
                      );
                    })}
                    {shownFiles.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">ไม่พบไฟล์ที่ตรงกับคำค้น</li>}
                  </ul>
                  <p className="text-xs text-slate-500">
                    {picked.length > 0
                      ? `เลือกแล้ว ${picked.length} ไฟล์${picked.length >= pickLimit ? ` (สูงสุด ${pickLimit} ไฟล์)` : ''}`
                      : 'เลือกอย่างน้อย 1 ไฟล์'}
                  </p>
                </div>
              )}
            </div>

            {/* 2. หัวข้อเฉพาะเจาะจง */}
            <div className="space-y-2.5">
              <label htmlFor="quiz-topic" className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">2</span>
                <span>หัวข้อเฉพาะเจาะจง</span>
              </label>
              <input
                id="quiz-topic"
                type="text"
                maxLength={500}
                placeholder="เช่น Synchronization & Mutex, Normalization, แบบจำลอง OSI"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={loading}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
              />
              {specificSource && (
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTopic(overviewTopic)}
                    disabled={loading}
                    className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer active:scale-95 ${
                      topic === overviewTopic
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    ทั้งหมดในแหล่งที่เลือก
                  </button>
                </div>
              )}
            </div>

            {/* NEW 3: รูปแบบข้อสอบ (Question Types) */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">3</span>
                <span>รูปแบบข้อสอบที่ต้องการ</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'mixed', label: 'ผสมผสาน (แนะนำ)', sub: 'รวมทุกรูปแบบ', icon: IconSparkles },
                  { id: 'mcq', label: 'ปรนัย (4 ตัวเลือก)', sub: 'แบบเลือกตอบ A B C D', icon: IconListFilter },
                  { id: 'fill', label: 'เติมคำในช่องว่าง', sub: 'พิมพ์คำตอบสั้นๆ', icon: IconPenLine },
                  { id: 'matching', label: 'จับคู่คำศัพท์', sub: 'จับคู่ความหมาย/คุณสมบัติ', icon: IconLink2 },
                ].map((item) => {
                  const isSelected = questionType === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setQuestionType(item.id as any)}
                      className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-1.5 cursor-pointer active:scale-95 ${
                        isSelected
                          ? 'border-2 border-rose-500 bg-rose-50/60 shadow-xs'
                          : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        {item.id === 'mixed' && (
                          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700">HOT</span>
                        )}
                      </div>
                      <div>
                        <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-rose-900' : 'text-slate-800'}`}>
                          {item.label}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{item.sub}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. ระดับความยาก */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">4</span>
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

            {/* 5. โหมดจับเวลา (Timer Mode) */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">5</span>
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

            {/* 6. จำนวนคำถาม & แต้ม */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">6</span>
                <span>จำนวนข้อสอบ & แต้ม</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { count: 3, label: '3 ข้อ', sub: 'ซ้อมด่วน' },
                  { count: 5, label: '5 ข้อ', sub: 'แนะนำ' },
                  { count: 10, label: '10 ข้อ', sub: 'เต็มชุด' },
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
                  {exempt ? (
                    <>สร้างควิซได้โดยไม่ตัดแต้ม (อาจารย์/ผู้ดูแล)</>
                  ) : (
                    <>
                      การสร้างควิซชุดนี้จะใช้ <strong>{cost} แต้ม</strong> ไม่ว่าจะกี่ข้อ (คุณมีแต้มคงเหลือ {me ? balance : '—'} แต้ม)
                      {missing > 0 && (
                        <>
                          {' '}· ขาดอีก {missing} แต้ม รับแต้มเพิ่มได้จากการโพสต์และช่วยตอบใน{' '}
                          <a href={`${getWorkspaceUrl()}/community`} className="font-bold underline">
                            SIET Space
                          </a>
                        </>
                      )}
                    </>
                  )}
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
              disabled={!canStart}
              onClick={handleStartQuiz}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-extrabold text-sm tracking-wide transition-all shadow-md shadow-rose-600/25 active:scale-95 cursor-pointer text-center flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>AI กำลังอ่านแหล่งความรู้และสร้างโจทย์...</span>
                </>
              ) : (
                <>
                  <span>{exempt ? 'เริ่มทำแบบทดสอบ' : `เริ่มทำแบบทดสอบ · ${cost} แต้ม`}</span>
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
