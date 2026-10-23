import { Suspense } from 'react';
import { SoloQuizSetup } from '../components/SoloQuizSetup';

function SoloSkeleton() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex-1 bg-[#f8fafc] flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-4xl w-full mx-auto space-y-6">
        <div className="h-14 w-full rounded-2xl bg-slate-200/60 animate-pulse" />
        <div className="h-[550px] w-full rounded-3xl bg-slate-200/50 animate-pulse border border-slate-200/60" />
      </div>
    </div>
  );
}

export default function SoloPage() {
  return (
    <Suspense fallback={<SoloSkeleton />}>
      <SoloQuizSetup />
    </Suspense>
  );
}
