'use client';

import { useState, useEffect } from 'react';
import { getWorkspaceUrl } from '../lib/workspace';

interface UserProfile {
  username?: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  role?: string;
  points_balance?: number;
}

export function QuizNavbar() {
  const [draft, setDraft] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [user, setUser] = useState<UserProfile>({
    username: 'test1',
    display_name: 'test1',
    role: 'student',
    points_balance: 22,
  });

  const workspaceUrl = getWorkspaceUrl();

  useEffect(() => {
    try {
      const storedAuth = localStorage.getItem('auth-storage');
      if (storedAuth) {
        const parsed = JSON.parse(storedAuth);
        if (parsed?.state?.user) {
          setUser(parsed.state.user);
        }
      }
    } catch {
      // ignore parsing error
    }
  }, []);

  const displayName = user.display_name || user.username || 'User';
  const displayInitial = (displayName[0] || 'T').toUpperCase();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.trim()) {
      window.location.href = `${workspaceUrl}/community?q=${encodeURIComponent(draft.trim())}`;
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-1.5 px-3 sm:gap-3 sm:px-5 lg:px-6">
        {/* Brand Logo */}
        <a
          href={`${workspaceUrl}/community`}
          className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-slate-100 transition-colors"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f172a] text-sm font-black text-white shadow-xs">
            S
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-sm font-bold tracking-tight text-slate-900">SIET Space</span>
            <span className="text-[10px] text-slate-500">KMITL learning community</span>
          </span>
        </a>

        {/* Center Search Bar */}
        <form
          className="relative mx-1 min-w-[48px] w-auto max-w-xl flex-1 sm:mx-auto"
          onSubmit={handleSearchSubmit}
        >
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ค้นหาสรุป, ข้อสอบ, รายวิชา, เพื่อน…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-100/80 pl-9 pr-16 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200/50"
          />
          {draft && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
              onClick={() => setDraft('')}
            >
              ล้าง
            </button>
          )}
        </form>

        {/* Right Menu Items */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5 [&_button]:shrink-0">
          {/* Points Wallet Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setWalletOpen(!walletOpen)}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/80 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 shadow-2xs transition-all active:scale-95"
              aria-label="กระเป๋าแต้ม"
            >
              <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="8" cy="8" r="6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12a6 6 0 10-6 6" />
              </svg>
              <span className="tabular-nums font-bold">{user.points_balance ?? 22}</span>
              <span className="max-sm:hidden">PT</span>
            </button>

            {walletOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 text-slate-800">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Points Wallet</p>
                <div className="mt-2 flex items-baseline justify-between border-b border-slate-100 pb-3">
                  <span className="text-3xl font-extrabold text-slate-900 tabular-nums">{user.points_balance ?? 22}</span>
                  <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full">SIET Points</span>
                </div>
                <div className="mt-3 space-y-2 text-xs text-slate-600">
                  <p>• ใช้สำหรับสร้างควิซ AI และฟีเจอร์ขั้นสูง</p>
                  <p>• รับแต้มเพิ่มได้จากการร่วมตอบคำถามในคอมมูนิตี้</p>
                </div>
              </div>
            )}
          </div>

          {/* Notifications Bell */}
          <a
            href={`${workspaceUrl}/community`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            aria-label="การแจ้งเตือน"
            title="การแจ้งเตือน"
          >
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </a>

          {/* User Account Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-pink-400 bg-white px-1.5 pr-2.5 shadow-2xs hover:bg-pink-50/50 focus-visible:ring-2 focus-visible:ring-pink-400 transition-all"
              aria-label="เปิดเมนูบัญชีผู้ใช้"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-200 text-xs font-bold text-pink-800">
                {displayInitial}
              </div>
              <span className="hidden max-w-[120px] truncate text-sm font-medium text-slate-700 sm:inline">
                {displayName}
              </span>
              <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200/80 bg-white p-2.5 text-slate-800 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                {/* Header Info */}
                <div className="flex items-center gap-3 px-2.5 pb-3 pt-2 border-b border-slate-100">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-200 text-sm font-bold text-pink-800">
                    {displayInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {displayName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {user.email || `@${user.username || 'test1'}`}
                    </p>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1 text-xs">
                  <a
                    href={`${workspaceUrl}/community?view=mine`}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium hover:bg-slate-100 transition-colors"
                  >
                    <span>👤</span>
                    <span>โพสต์ของฉัน</span>
                  </a>
                  <a
                    href={`${workspaceUrl}/community?view=saved`}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium hover:bg-slate-100 transition-colors"
                  >
                    <span>📑</span>
                    <span>สรุปที่บันทึกไว้</span>
                  </a>
                  <div className="my-1 border-t border-slate-100" />
                  <a
                    href={`${workspaceUrl}/community`}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <span>←</span>
                    <span>กลับไป SIET Space</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
