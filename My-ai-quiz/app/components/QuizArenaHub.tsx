'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getWorkspaceUrl } from '../lib/workspace';

export function QuizArenaHub() {
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPin] = useState('');

  return (
    <div className="min-h-screen bg-[#fafbfc] text-[#1e293b] font-sans flex flex-col justify-between">
      {/* 1. Header / Navbar */}
      <header className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-8 py-3.5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Brand & Back Button */}
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-[#e11d48]">
              StudyTogether
            </span>
            <a
              href={`${getWorkspaceUrl()}/features`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-2xs"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>กลับหน้าหลัก</span>
            </a>
          </div>

          {/* Center Title (Desktop) */}
          <div className="hidden md:block text-base font-bold text-slate-800">
            AI Quiz Arena (เกมควิซอัจฉริยะ)
          </div>

          {/* Right Status Chips */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
            {/* Level & XP */}
            <div className="flex items-center gap-2 border border-slate-200 rounded-full px-3 py-1.5 bg-slate-50/70">
              <span className="font-semibold text-slate-700">Lv. 8</span>
              <div className="w-16 sm:w-20 bg-slate-200 rounded-full h-2 overflow-hidden relative">
                <div className="bg-[#ec4899] h-2 rounded-full" style={{ width: '65%' }}></div>
              </div>
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">650/1000 XP</span>
            </div>

            {/* Streak */}
            <div className="flex items-center gap-1 border border-slate-200 rounded-full px-2.5 py-1.5 bg-slate-50/70 font-semibold text-slate-700">
              <span className="text-amber-500">🔥</span>
              <span>5 วัน</span>
            </div>

            {/* Lives */}
            <div className="flex items-center gap-0.5 border border-slate-200 rounded-full px-2.5 py-1.5 bg-slate-50/70">
              <span className="text-[#f43f5e] text-xs">❤️❤️❤️</span>
            </div>

            {/* Credits */}
            <div className="flex items-center gap-1 border border-slate-200 rounded-full px-2.5 py-1.5 bg-slate-50/70 text-slate-700 font-medium">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>เครดิต: 20</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Content Body */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8 animate-in fade-in duration-200">
        {/* Banner Section */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#fdf2f8] via-[#fce7f3] to-[#ffe4e6] p-6 sm:p-10 border border-pink-100 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="space-y-3 text-center sm:text-left z-10">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#e11d48]">
              <svg className="w-3.5 h-3.5 text-[#e11d48]" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                  clipRule="evenodd"
                />
              </svg>
              <span>YOUR DAILY LEARNING ARENA</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0f172a] tracking-tight">
              เปลี่ยนการทบทวน ให้เป็นเกมที่อยากเล่นทุกวัน
            </h1>
            <p className="text-slate-600 text-sm sm:text-base font-normal">
              ฝึกฝนเดี่ยวด้วย AI เพื่ออัปเลเวล หรือเปิดห้องดวลสดกับเพื่อนแบบ Real-time
            </p>
          </div>

          {/* Right Badge / Trophy Icon */}
          <div className="flex-shrink-0 flex flex-col items-center justify-center w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-white/95 shadow-md border-2 border-pink-200 p-2 text-center">
            <div className="text-pink-500 mb-1">
              <svg className="w-9 h-9 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.004 0H9.496m5.004 0A5.25 5.25 0 0019.5 9.75V5.25A2.25 2.25 0 0017.25 3H6.75A2.25 2.25 0 004.5 5.25v4.5a5.25 5.25 0 005.004 5.25"
                />
              </svg>
            </div>
            <span className="text-[10px] font-extrabold tracking-wider text-pink-600 uppercase leading-tight">
              PLAY TO GROW
            </span>
          </div>
        </section>

        {/* Section Heading */}
        <div className="flex flex-col sm:flex-row items-baseline justify-between gap-1">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            วันนี้อยากเรียนรู้แบบไหน?
          </h2>
          <span className="text-xs sm:text-sm text-slate-500">
            เลือกโหมด แล้วเริ่มสนุกกับการทบทวน
          </span>
        </div>

        {/* 2x2 Grid of Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Solo Mode */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
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
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-600 border border-pink-100">
                  AI เฉพาะคุณ
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Solo Mode: ฝึกฝนเดี่ยว</h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  โจทย์ AI ปรับตามความสามารถ • รับ XP • ดูเฉลยละเอียด
                </p>
              </div>
            </div>

            <Link
              href="/solo"
              className="w-full text-center py-3.5 px-4 rounded-2xl bg-[#e11d48] hover:bg-[#be123c] text-white font-bold text-sm tracking-wide transition shadow-sm active:scale-[0.99] block"
            >
              เริ่มเล่นคนเดียว (Solo)
            </Link>
          </div>

          {/* Card 2: Battle Mode */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-500">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
                    />
                  </svg>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-600 border border-pink-100">
                  เล่นกับเพื่อน
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Battle Mode: ประลองกับเพื่อน</h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  สร้างห้องแชร์ PIN • แข่งขันสด Real-time • ไต่อันดับ Leaderboard
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => alert('ฟีเจอร์สร้างห้องแข่งกำลังพัฒนา')}
                className="py-3 px-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm transition text-center cursor-pointer"
              >
                สร้างห้องใหม่
              </button>
              <button
                onClick={() => setPinModalOpen(true)}
                className="py-3 px-3 rounded-2xl bg-[#e11d48] hover:bg-[#be123c] text-white font-semibold text-xs sm:text-sm transition text-center cursor-pointer"
              >
                เข้าร่วมด้วยรหัส PIN
              </button>
            </div>
          </div>

          {/* Card 3: AI Recommendation */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
                <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
                <span>AI แนะนำฝึกฝนด่วน - จุดอ่อนล่าสุด</span>
              </div>

              <div className="inline-block px-3 py-1 rounded-full bg-pink-50 text-pink-600 text-xs font-medium border border-pink-100">
                วิชา สถาปัตยกรรมระบบปฏิบัติการ
              </div>

              <div className="space-y-1.5 pt-1">
                <h4 className="text-sm font-bold text-slate-800">
                  เรื่อง Synchronization (Mutex / Semaphore)
                </h4>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">ความแม่นยำ 32%</span>
                  <div className="w-32 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-pink-500 h-2 rounded-full" style={{ width: '32%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/solo?quick=true"
              className="w-full text-center py-3.5 px-4 rounded-2xl bg-[#e11d48] hover:bg-[#be123c] text-white font-bold text-sm tracking-wide transition shadow-sm active:scale-[0.99] block"
            >
              ฝึกซ้อมจุดนี้ทันที (1 คลิก)
            </Link>
          </div>

          {/* Card 4: Daily Quests */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                ภารกิจรายวัน - Daily Quests
              </h3>
              <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-semibold text-slate-800">ทำควิซครบ 2 ชุด (1/2)</span>
                  <span className="font-bold text-[#e11d48]">+50 XP</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-pink-500 h-2 rounded-full" style={{ width: '50%' }}></div>
                </div>
                <span className="text-[11px] text-slate-400">สำเร็จแล้ว 1 จาก 2 ชุด</span>
              </div>

              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-semibold text-slate-800">ตอบถูกต่อเนื่อง 5 ข้อ (0/5)</span>
                  <span className="font-bold text-[#e11d48]">+1 หัวใจ</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-pink-500 h-2 rounded-full" style={{ width: '0%' }}></div>
                </div>
                <span className="text-[11px] text-slate-400">เริ่มควิซเพื่อสะสมคำตอบที่ถูกต้อง</span>
              </div>
            </div>

            <div className="pt-2 text-right">
              <span className="text-[11px] text-slate-400 font-medium">รีเซ็ตทุกเที่ยงคืน</span>
            </div>
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

      {/* PIN Modal Placeholder */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4 text-center">
            <h3 className="text-xl font-bold text-slate-900">เข้าร่วมห้องประลอง</h3>
            <p className="text-xs text-slate-500">กรอกรหัส PIN 6 หลักที่ได้รับจากเพื่อน</p>
            <input
              type="text"
              maxLength={6}
              placeholder="123456"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full text-center tracking-widest text-2xl font-bold py-3 rounded-2xl border border-slate-200 focus:border-pink-500 outline-none"
            />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setPinModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  alert(`รหัส PIN: ${pin} (ระบบห้องดวลกำลังพัฒนา)`);
                  setPinModalOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#e11d48] text-white font-semibold text-sm hover:bg-[#be123c] cursor-pointer"
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

