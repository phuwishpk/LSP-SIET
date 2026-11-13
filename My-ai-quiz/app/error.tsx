'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAF7F9] p-4 text-center font-sans">
      <section
        role="alert"
        className="w-full max-w-md space-y-4 rounded-2xl border border-[#EAE6EA] bg-white p-6 shadow-[0_4px_16px_rgba(32,33,36,0.04)]"
      >
        <AlertCircle aria-hidden="true" className="mx-auto h-8 w-8 text-[#E53935]" />
        <h2 className="text-lg font-bold text-[#202124]">มีข้อผิดพลาดบางอย่างเกิดขึ้น</h2>
        <p className="text-sm text-[#3C3C3C]">{error.message || 'ไม่สามารถโหลดเนื้อหานี้ได้'}</p>
        <button
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ED4988] px-4 py-2 text-sm font-semibold text-[#202124] hover:bg-[#C92F6B] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C92F6B]"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          ลองใหม่อีกครั้ง
        </button>
      </section>
    </div>
  );
}
