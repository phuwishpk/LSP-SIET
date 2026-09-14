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
  creator_bonus: 'Creator Points',
  helpful_bonus: 'มีคนกด Helpful',
  refund: 'คืนแต้ม',
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
