'use client'

import { Globe2 } from 'lucide-react'
import { PinkOwlMascot } from '@shared/mascot'
import { Button } from '@/components/ui/button'

interface AskWebButtonProps {
  /** The web step for this answer is running. */
  pending: boolean
  /** The web part was already added (shown once per answer). */
  webAdded: boolean
  onAsk: () => void
}

/**
 * "ค้นเว็บเพิ่ม" under an answer the library covered only partly: looks the
 * missing part up on KMITL's own websites (verified pages only), free and once.
 */
export function AskWebButton({ pending, webAdded, onAsk }: AskWebButtonProps) {
  if (webAdded) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2">
      {pending && <PinkOwlMascot mood="search" size={28} label="น้องฮูกกำลังค้นเว็บ" className="shrink-0" />}
      <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
        {pending
          ? 'กำลังค้นจากเว็บไซต์ของ สจล. และตรวจว่าทุกลิงก์เปิดได้จริง…'
          : 'เอกสารตอบได้บางส่วน ค้นข้อมูลเพิ่มจากเว็บไซต์ของ สจล. ได้ (ไม่ตัดแต้ม)'}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 rounded-full text-xs"
        onClick={onAsk}
        disabled={pending}
      >
        <Globe2 className="h-3.5 w-3.5" aria-hidden />
        ค้นเว็บเพิ่ม (เว็บ สจล.)
      </Button>
    </div>
  )
}
