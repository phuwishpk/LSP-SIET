import { Suspense } from 'react';
import { SoloQuizSetup } from '../components/SoloQuizSetup';

export default function SoloPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">กำลังโหลด...</div>}>
      <SoloQuizSetup />
    </Suspense>
  );
}
