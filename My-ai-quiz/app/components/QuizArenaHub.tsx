'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  IconGraduationCap,
  IconSparkles,
  IconTarget,
  IconTrophy,
  IconFlame,
  IconZap,
  IconArrowRight,
  IconClock,
  IconCheckCircle2,
  IconShieldCheck,
} from './ui/Icons';
import { PinkOwlMascot } from './mascot';
import {
  getDailyQuests,
  getWeakestTopic,
  claimQuestReward,
  DailyQuestsState,
} from '../lib/quizStorage';

export function QuizArenaHub() {
  // Real data states
  const [quests, setQuests] = useState<DailyQuestsState>({
    date: '',
    quizzesCompleted: 0,
    maxStreakAchieved: 0,
    claimedRewards: {},
  });

  const [weakestTopic, setWeakestTopic] = useState<{
    subject: string;
    topic: string;
    accuracy: number;
    totalAttempts: number;
  }>({
    subject: '[CS101] สถาปัตยกรรมระบบปฏิบัติการ (Operating Systems)',
    topic: 'Synchronization & Mutex Lock',
    accuracy: 32,
    totalAttempts: 1,
  });

  // Reward Celebration Modal State
  const [celebrationReward, setCelebrationReward] = useState<{
    rewardName: string;
    questTitle: string;
  } | null>(null);

  useEffect(() => {
    // Load real stats from storage
    const currentQuests = getDailyQuests();
    setQuests(currentQuests);

    const weak = getWeakestTopic();
    if (weak) {
      setWeakestTopic(weak);
    }
  }, []);

  const handleClaimReward = (questId: string, rewardName: string, questTitle: string) => {
    const success = claimQuestReward(questId);
    if (success) {
      setQuests(getDailyQuests());
      // Open celebratory owl modal
      setCelebrationReward({ rewardName, questTitle });
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex-1 bg-[#f8fafc] text-[#0f172a] font-sans flex flex-col justify-between">
      
      {/* 2. Main Content Body */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8 animate-in fade-in duration-200">
        {/* Banner Section - Cockpit Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rose-50/90 via-pink-50/50 to-rose-50/20 p-6 sm:p-10 border border-rose-100 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="space-y-3 text-center sm:text-left z-10 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-700 bg-rose-100/70 px-3 py-1 rounded-full border border-rose-200/60">
              <IconZap className="w-3.5 h-3.5 text-rose-600" />
              <span>SIET AI Adaptive Learning Arena</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              ทบทวนบทเรียนด้วย AI Quiz
            </h1>
            <p className="text-slate-600 text-sm sm:text-base font-normal leading-relaxed">
              ฝึกฝนเดี่ยวด้วยโจทย์ที่ปรับระดับตามความแม่นยำ พร้อมวิเคราะห์จุดอ่อนรายบุคคลแบบ Real-time
            </p>
          </div>

          {/* Cute Pink Owl Mascot Widget */}
          <div className="shrink-0 flex flex-col items-center justify-center">
            <PinkOwlMascot mood="idle" size={170} className="drop-shadow-sm hover:scale-105 transition-transform duration-300" />
          </div>
        </section>

        {/* Section Heading */}
        <div className="flex flex-col sm:flex-row items-baseline justify-between gap-1">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              ศูนย์การเรียนรู้
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              เลือกฝึกฝนและทำภารกิจเพื่อสะสมคะแนน
            </p>
          </div>
        </div>

        {/* Main Grid: Solo Mode + AI Diagnostic + Daily Quests */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card 1: Solo Mode (Hero Focus) */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-rose-200/80 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between gap-6 group lg:col-span-1 bg-gradient-to-b from-white to-rose-50/20">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 group-hover:scale-105 transition-transform duration-200">
                  <IconGraduationCap className="w-6 h-6" />
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80">
                  <IconSparkles className="w-3.5 h-3.5 text-rose-600" />
                  <span>AI Personalised</span>
                </span>
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-rose-600 transition-colors">
                  Solo Training: ฝึกฝนเดี่ยว
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                  สร้างชุดข้อสอบจำลองตามเนื้อหารายวิชา พร้อมเฉลยละเอียดและวิเคราะห์จุดที่ต้องปรับปรุง
                </p>
              </div>
            </div>

            <Link
              href="/solo"
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm tracking-wide transition-all shadow-md shadow-rose-600/20 active:scale-95 group/btn"
            >
              <span>เริ่มฝึกฝนเดี่ยว</span>
              <IconArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
            </Link>
          </div>

          {/* Card 2: AI Weakness Recommendation (FUNCTIONAL) */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between gap-5 group lg:col-span-1">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-base">
                  <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                    <IconTarget className="w-4.5 h-4.5" />
                  </div>
                  <span>จุดที่ควรทบทวน (AI Diagnostic)</span>
                </div>
              </div>

              <div className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold max-w-full truncate">
                {weakestTopic.subject}
              </div>

              <div className="space-y-2 pt-1">
                <h4 className="text-sm font-bold text-slate-800">
                  หัวข้อ: {weakestTopic.topic}
                </h4>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-rose-600 tabular-nums">
                    ความแม่นยำ {weakestTopic.accuracy}%
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-rose-500 to-rose-600 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, weakestTopic.accuracy)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Direct 1-Click Fix Button */}
            <Link
              href={`/solo?quick=true&subject=${encodeURIComponent(weakestTopic.subject)}&topic=${encodeURIComponent(weakestTopic.topic)}`}
              className="w-full inline-flex items-center justify-center gap-2 text-center py-3.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm tracking-wide transition-all border border-rose-200/80 active:scale-95 group/link shadow-2xs"
            >
              <span>ฝึกซ้ำหัวข้อนี้ทันที</span>
              <IconArrowRight className="w-4 h-4 transition-transform group-hover/link:translate-x-1" />
            </Link>
          </div>

          {/* Card 3: Daily Quests (FUNCTIONAL) */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between gap-5 lg:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                  <IconTrophy className="w-4 h-4" />
                </div>
                <span>ภารกิจประจำวัน</span>
              </h3>
              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                <IconClock className="w-3 h-3" />
                <span>รีเซ็ตเที่ยงคืน</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Quest 1: ทำครบ 2 ชุด */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <span>ทำควิซครบ 2 ชุด</span>
                    <span className="text-[10px] text-amber-600 font-extrabold">(+50 XP)</span>
                  </div>
                  <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (quests.quizzesCompleted / 2) * 100)}%` }}
                    />
                  </div>
                </div>
                {quests.claimedRewards['quest_2_quizzes'] ? (
                  <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <IconCheckCircle2 className="w-3.5 h-3.5" /> รับแล้ว
                  </span>
                ) : quests.quizzesCompleted >= 2 ? (
                  <button
                    onClick={() => handleClaimReward('quest_2_quizzes', '50 XP', 'ทำควิซครบ 2 ชุด')}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs cursor-pointer active:scale-95 transition-all"
                  >
                    รับรางวัล
                  </button>
                ) : (
                  <span className="text-xs font-bold text-slate-400 tabular-nums">
                    {quests.quizzesCompleted}/2
                  </span>
                )}
              </div>

              {/* Quest 2: Combo Streak */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <IconFlame className="w-3 h-3 text-orange-500" />
                    <span>ตอบถูกติดกัน 3 ข้อ</span>
                    <span className="text-[10px] text-amber-600 font-extrabold">(+30 XP)</span>
                  </div>
                  <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (quests.maxStreakAchieved / 3) * 100)}%` }}
                    />
                  </div>
                </div>
                {quests.claimedRewards['quest_combo_3'] ? (
                  <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <IconCheckCircle2 className="w-3.5 h-3.5" /> รับแล้ว
                  </span>
                ) : quests.maxStreakAchieved >= 3 ? (
                  <button
                    onClick={() => handleClaimReward('quest_combo_3', '30 XP', 'ตอบถูกติดกัน 3 ข้อ')}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs cursor-pointer active:scale-95 transition-all"
                  >
                    รับรางวัล
                  </button>
                ) : (
                  <span className="text-xs font-bold text-slate-400 tabular-nums">
                    {quests.maxStreakAchieved}/3
                  </span>
                )}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 text-center">
              สะสม XP เพื่ออัปเลเวลและปลดล็อกเข็มกลัด
            </div>
          </div>
        </div>

        {/* Subjects Directory Bar */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-base font-extrabold text-slate-900">
                คลังวิชาที่เปิดให้ทดสอบ AI Quiz
              </h3>
              <p className="text-xs text-slate-500">
                เลือกรายวิชาเพื่อเข้าสู่โหมดการทำแบบฝึกหัดอย่างรวดเร็ว
              </p>
            </div>
            <Link
              href="/solo"
              className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors"
            >
              <span>ดูทั้งหมด</span>
              <IconArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                code: 'CS101',
                name: 'สถาปัตยกรรมระบบปฏิบัติการ',
                topic: 'Process Scheduling, Mutex Lock',
                color: 'bg-rose-50 border-rose-200 text-rose-700',
              },
              {
                code: 'CS202',
                name: 'การออกแบบอัลกอริทึมและโครงสร้างข้อมูล',
                topic: 'Binary Search Tree, Dynamic Programming',
                color: 'bg-blue-50 border-blue-200 text-blue-700',
              },
              {
                code: 'NET301',
                name: 'เครือข่ายคอมพิวเตอร์และการสื่อสาร',
                topic: 'TCP/IP Model, Subnetting, Routing Protocols',
                color: 'bg-amber-50 border-amber-200 text-amber-700',
              },
            ].map((sub) => (
              <Link
                key={sub.code}
                href={`/solo?subject=${encodeURIComponent(`[${sub.code}] ${sub.name}`)}`}
                className="p-4 rounded-2xl border border-slate-200/90 hover:border-rose-300 hover:shadow-xs transition-all flex flex-col justify-between gap-3 group"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${sub.color}`}>
                      {sub.code}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 group-hover:text-rose-600 transition-colors">
                      เริ่มทำควิซ →
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-rose-600 transition-colors">
                    {sub.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                    {sub.topic}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white py-6 mt-12 text-center text-xs text-slate-400 font-medium">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 justify-center sm:justify-start">
            <IconShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>KMITL SIET Intelligent Learning Workspace</span>
          </p>
          <p>StudyTogether · AI Quiz Arena</p>
        </div>
      </footer>

      {/* 4. Celebratory Owl Reward Popup Modal */}
      {celebrationReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4 border border-rose-100 shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Mascot in Wave (Cheering) Mood */}
            <div className="relative flex justify-center pt-2">
              <div className="absolute -top-3 w-36 h-36 bg-rose-100/60 rounded-full blur-xl -z-10" />
              <PinkOwlMascot mood="wave" size={135} className="drop-shadow-md" />
            </div>

            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
                <IconTrophy className="w-3.5 h-3.5 text-amber-500" />
                <span>สำเร็จภารกิจประจำวัน!</span>
              </span>
              <h3 className="text-xl font-extrabold text-slate-900">
                {celebrationReward.questTitle}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                ยอดเยี่ยมมาก! นกฮูกดีใจที่คุณหมั่นทบทวนความรู้อย่างสม่ำเสมอ
              </p>
            </div>

            {/* Reward Pill */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-50 via-rose-50 to-amber-50 border border-amber-200/80 flex items-center justify-center gap-2">
              <IconSparkles className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-black text-amber-800">
                ได้รับรางวัล +{celebrationReward.rewardName}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setCelebrationReward(null)}
              className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-sm shadow-md shadow-rose-600/25 transition-all cursor-pointer"
            >
              รับทราบ ลุยต่อเลย!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default QuizArenaHub;
