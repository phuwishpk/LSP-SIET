import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'

/** MariaDB DATETIME values arrive as naive ISO strings (UTC). */
export function parseServerDate(value?: string | null): Date | null {
  if (!value) return null
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
  const date = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function timeAgo(value?: string | null): string {
  const date = parseServerDate(value)
  if (!date) return ''
  try {
    return formatDistanceToNow(date, { addSuffix: true, locale: th })
  } catch {
    return date.toLocaleString()
  }
}

export function roleLabel(role?: string | null): string {
  switch (role) {
    case 'admin':
      return 'ผู้ดูแล'
    case 'teacher':
      return 'อาจารย์'
    case 'student':
      return 'นักศึกษา'
    default:
      return role || ''
  }
}

export function displayName(user?: {
  display_name?: string | null
  username?: string | null
} | null): string {
  return user?.display_name || user?.username || 'ไม่ทราบชื่อ'
}

export const KIND_LABELS: Record<string, string> = {
  welcome: 'แต้มต้อนรับ',
  rag_question: 'ถาม KMITL RAG AI',
  rag_session: 'เซสชัน RAG AI',
  quiz_generate: 'สร้าง AI Quiz',
  roadmap_generate: 'สร้าง AI Roadmap',
  quiz_import: 'นำเข้าควิซของเพื่อน',
  cashback: 'แต้มคืน (เพื่อนทำควิซ)',
  creator_bonus: 'Creator Points (แชร์สรุป)',
  post_bonus: 'โพสต์เนื้อหาลงฟีด',
  helpful_bonus: 'มีคนกด Helpful',
  like_bonus: 'มีคนกดถูกใจโพสต์',
  share_bonus: 'มีคนแชร์โพสต์',
  edit_bonus: 'แก้ไขโพสต์ให้ดีขึ้น',
  refund: 'คืนแต้ม',
  admin_grant: 'ผู้ดูแลเพิ่มแต้ม',
  admin_deduct: 'ผู้ดูแลหักแต้ม',
  balance_adjust: 'ปรับยอดยกมา',
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] || kind
}

export function formatBytes(size?: number | null): string {
  if (!size || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * How a room reads in a dropdown. Course rooms lead with their code; discussion
 * rooms have a generated handle nobody needs to see, so they show only a name.
 */
export function roomLabel(room: {
  code?: string | null
  name: string
  kind?: 'course' | 'club'
}): string {
  return room.kind === 'club' ? `💬 ${room.name}` : `${room.code ?? ''} ${room.name}`.trim()
}

/**
 * What to print under a RAG answer.
 *
 * `grounded` only says whether the chosen scope resolved to any notebook — on
 * the "auto" scope the server may still fall back to the whole workspace, which
 * returns citations with `grounded: false`. Printing "ไม่พบเอกสาร" next to three
 * citations reads like a bug, so the three cases are spelled out separately.
 */
export function answerSourceNote(
  grounded: boolean | undefined,
  scopeLabel: string,
  citationCount: number
): string {
  if (grounded) return `📚 อ้างอิงจาก ${scopeLabel}`
  if (citationCount > 0) return `ℹ️ ไม่พบใน ${scopeLabel} — ตอบจากคลังความรู้ทั้งหมดแทน`
  return `⚠️ ไม่พบเอกสารใน ${scopeLabel}`
}
