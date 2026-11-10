import Link from 'next/link';
import { SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#FAF7F9] p-4">
      <section
        aria-labelledby="not-found-title"
        className="w-full max-w-md space-y-4 rounded-2xl border border-[#EAE6EA] bg-white p-6 text-center shadow-[0_4px_16px_rgba(32,33,36,0.04)]"
      >
        <SearchX aria-hidden="true" className="mx-auto h-9 w-9 text-[#ED4988]" />
        <h1 id="not-found-title" className="text-xl font-extrabold text-[#202124]">
          ไม่พบหน้านี้
        </h1>
        <p className="text-sm text-[#3C3C3C]">
          ลิงก์อาจไม่ถูกต้อง หรือเนื้อหานี้ถูกย้ายแล้ว
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#ED4988] px-4 py-2 text-sm font-semibold text-[#202124] hover:bg-[#C92F6B] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C92F6B]"
        >
          กลับหน้าหลัก
        </Link>
      </section>
    </main>
  );
}
