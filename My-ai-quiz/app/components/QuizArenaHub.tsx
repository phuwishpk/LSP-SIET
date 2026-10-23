'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  IconGraduationCap,
  IconUsers,
  IconSparkles,
  IconTarget,
  IconTrophy,
  IconHeart,
  IconFlame,
  IconZap,
  IconArrowRight,
  IconKeyRound,
  IconClock,
  IconCheckCircle2,
  IconShieldCheck,
} from './ui/Icons';
import { PinkOwlMascot } from './PinkOwlMascot';
import {
  getDailyQuests,
  getWeakestTopic,
  claimQuestReward,
  DailyQuestsState,
} from '../lib/quizStorage';

export function QuizArenaHub() {
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPin] = useState('');

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

  const [rewardToast, setRewardToast] = useState<string | null>(null);

  useEffect(() => {
    // Load real stats from storage
    const currentQuests = getDailyQuests();
    setQuests(currentQuests);

    const weak = getWeakestTopic();
    if (weak) {
      setWeakestTopic(weak);
    }
  }, []);

  const handleClaimReward = (questId: string, rewardName: string) => {
    const success = claimQuestReward(questId);
    if (success) {
      setQuests(getDailyQuests());
      setRewardToast(`🎉 รับรางวัลสำเร็จ: ${rewardName}!`);
      setTimeout(() => setRewardToast(null), 3000);
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
              ทบทวนบทเรียนด้วย AI Arena
            </h1>
            <p className="text-slate-600 text-sm sm:text-base font-normal leading-relaxed">
              ฝึกฝนเดี่ยวด้วยโจทย์ที่ปรับตามจุดอ่อน หรือสร้างห้องประลองสดกับเพื่อนร่วมชั้นแบบ Real-time
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
              โหมดการเรียนรู้
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              เลือกรูปแบบที่คุณต้องการฝึกฝนในวันนี้
            </p>
          </div>
        </div>

        {/* 2x2 Grid of Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Solo Mode */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between gap-6 group">
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
                  สร้างชุดข้อสอบจำลองตามเนื้อหารายวิชา พร้อมคำอธิบายเฉลยแบบเจาะลึก
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

          {/* Card 2: Battle Mode */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between gap-6 group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform duration-200">
                  <IconUsers className="w-6 h-6" />
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  <IconUsers className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Multiplayer</span>
                </span>
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Quiz Battle: แข่งขันกับเพื่อน
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                  เปิดห้องดวลความเร็วตอบคำถามแบบกลุ่ม พร้อมกระดานคะแนน Leaderboard สด
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => alert('ฟีเจอร์สร้างห้องแข่งกำลังเปิดให้ทดสอบ')}
                className="py-3 px-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm transition-all active:scale-95 text-center cursor-pointer shadow-2xs"
              >
                สร้างห้องใหม่
              </button>
              <button
                onClick={() => setPinModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 py-3 px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm transition-all shadow-sm active:scale-95 text-center cursor-pointer"
              >
                <IconKeyRound className="w-3.5 h-3.5" />
                <span>ใส่รหัส PIN</span>
              </button>
            </div>
          </div>

          {/* Card 3: AI Weakness Recommendation (FUNCTIONAL) */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between gap-5 group">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-base">
                  <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                    <IconTarget className="w-4.5 h-4.5" />
                  </div>
                  <span>จุดที่ควรทบทวนเพิ่ม (AI Diagnostic)</span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/70">
                  วิเคราะห์จากประวัติจริง
                </span>
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
                    ความแม่นยำเฉลี่ย {weakestTopic.accuracy}%
                  </span>
                  <div className="w-36 bg-slate-100 rounded-full h-2.5 overflow-hidden">
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
              <span>ทำแบบฝึกหัดแก้ไขจุดนี้ทันที (1 คลิก)</span>
              <IconArrowRight className="w-4 h-4 transition-transform group-hover/link:translate-x-1" />
            </Link>
          </div>

          {/* Card 4: Daily Quests (FUNCTIONAL) */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between gap-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                  <IconTrophy className="w-4 h-4" />
                </div>
                <span>ภารกิจประจำวัน</span>
              </h3>
              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                <IconClock className="w-3 h-3" />
                <span>รีเซ็ตทุกเที่ยงคืน</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Quest 1: ทำครบ 2 ชุด */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <IconCheckCircle2
                      className={`w-4 h-4 ${
                        quests.quizzesCompleted >= 2 ? 'text-emerald-500' : 'text-slate-300'
                      }`}
                    />
                    <span className="font-semibold text-slate-800">
                      ทำควิซครบ 2 ชุด ({Math.min(2, quests.quizzesCompleted)}/2)
                    </span>
                  </div>

                  {quests.claimedRewards['quest_quiz_count'] ? (
                    <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                      รับแล้ว ✓
                    </span>
                  ) : quests.quizzesCompleted >= 2 ? (
                    <button
                      type="button"
                      onClick={() => handleClaimReward('quest_quiz_count', '+50 XP')}
                      className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-0.5 rounded-md shadow-2xs active:scale-95 transition-all cursor-pointer"
                    >
                      กดรับ +50 XP
                    </button>
                  ) : (
                    <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
                      +50 XP
                    </span>
                  )}
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (quests.quizzesCompleted / 2) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400">
                  {quests.quizzesCompleted >= 2
                    ? 'ภารกิจสำเร็จแล้ว!'
                    : `ขาดอีก ${2 - quests.quizzesCompleted} ชุด`}
                </span>
              </div>

              {/* Quest 2: ตอบถูกต่อเนื่อง 5 ข้อ */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <IconFlame
                      className={`w-4 h-4 ${
                        quests.maxStreakAchieved >= 5 ? 'text-orange-500' : 'text-slate-300'
                      }`}
                    />
                    <span className="font-semibold text-slate-800">
                      ตอบถูกต่อเนื่อง 5 ข้อ ({Math.min(5, quests.maxStreakAchieved)}/5)
                    </span>
                  </div>

                  {quests.claimedRewards['quest_combo_streak'] ? (
                    <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                      รับแล้ว ✓
                    </span>
                  ) : quests.maxStreakAchieved >= 5 ? (
                    <button
                      type="button"
                      onClick={() => handleClaimReward('quest_combo_streak', '+100 XP โบนัส')}
                      className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-2.5 py-0.5 rounded-md shadow-2xs active:scale-95 transition-all cursor-pointer"
                    >
                      กดรับรางวัล
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md text-xs">
                      <IconHeart className="w-3 h-3 text-rose-500" /> +100 XP
                    </span>
                  )}
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-rose-500 to-amber-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (quests.maxStreakAchieved / 5) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400">
                  {quests.maxStreakAchieved >= 5
                    ? 'ยอดเยี่ยมมาก ทำคอมโบทะลุ 5 ข้อแล้ว!'
                    : `สถิติสูงสุดวันนี้: ${quests.maxStreakAchieved} ข้อ`}
                </span>
              </div>
            </div>

            <div className="pt-1 text-right">
              <span className="text-[11px] text-slate-400 font-medium">
                ทำควิซเพื่อสะสมความก้าวหน้าอัตโนมัติ
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Reward Toast Notification */}
      {rewardToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs sm:text-sm font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <span>{rewardToast}</span>
        </div>
      )}

      {/* 3. Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white/70 py-4 px-4 sm:px-8 text-xs text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p className="flex items-center gap-1.5 justify-center sm:justify-start">
            <IconShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>KMITL SIET Intelligent Learning Workspace</span>
          </p>
          <p>StudyTogether · AI Quiz Arena</p>
        </div>
      </footer>

      {/* PIN Entry Modal */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-5 border border-slate-200 shadow-2xl">
            <div className="text-center space-y-1">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 mb-2">
                <IconKeyRound className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">เข้าร่วมห้องประลอง</h3>
              <p className="text-xs text-slate-500">ใส่รหัส PIN 6 หลักที่ได้รับจากผู้สร้างห้อง</p>
            </div>

            <input
              type="text"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.toUpperCase())}
              placeholder="000000"
              className="w-full text-center tracking-[0.4em] font-mono font-black text-2xl py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                className="py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={pin.length < 6}
                onClick={() => alert(`กำลังเชื่อมต่อห้อง PIN: ${pin}`)}
                className="py-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 disabled:opacity-50"
              >
                เข้าร่วม
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
