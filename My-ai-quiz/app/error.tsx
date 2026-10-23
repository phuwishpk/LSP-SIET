'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 text-center font-sans">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-md w-full space-y-4">
        <h2 className="text-lg font-bold text-slate-900">มีข้อผิดพลาดบางอย่างเกิดขึ้น</h2>
        <p className="text-xs text-slate-500">{error.message || 'ไม่สามารถโหลดเนื้อหานี้ได้'}</p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold"
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    </div>
  );
}

