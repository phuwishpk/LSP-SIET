/**
 * "สั่งแก้ด้วย AI" on a roadmap, without any I/O (tested with `node --test`).
 */

export const EDIT_MAX = 500

/** Chips that fill the box; the learner can still change the text. */
export const EDIT_EXAMPLES = [
  'ทำให้สั้นลง เหลือเฉพาะหัวข้อสำคัญ',
  'เน้นลงมือทำ เพิ่มหัวข้อฝึกปฏิบัติ',
  'เพิ่มหัวข้อพื้นฐานก่อนเริ่ม',
  'เพิ่มหัวข้อทบทวนก่อนสอบ',
]

const count = (list) => (Array.isArray(list) ? list.length : 0)

/** "เพิ่ม 2 · ลบ 1 · แก้ 3", leaving out the kinds that did not happen. */
export function changeSummary(changes) {
  const parts = [
    ['เพิ่ม', count(changes?.added)],
    ['ลบ', count(changes?.removed)],
    ['แก้', count(changes?.updated)],
  ]
    .filter(([, n]) => n > 0)
    .map(([word, n]) => `${word} ${n}`)
  return parts.length ? parts.join(' · ') : 'ไม่มีการเปลี่ยนแปลง'
}

/** The nodes to highlight after an edit: the new ones and the changed ones. */
export function changedIds(changes) {
  return new Set([...(changes?.added || []), ...(changes?.updated || [])].map(String))
}

/** Why the edit cannot be sent yet, or null when it can. */
export function editBlockedReason({ text, cost, balance, exempt }) {
  const value = (text || '').trim()
  if (!value) return 'พิมพ์สิ่งที่อยากให้แก้ก่อน'
  if (value.length > EDIT_MAX) return `พิมพ์ได้ไม่เกิน ${EDIT_MAX} ตัวอักษร`
  if (!exempt && balance < cost) return `ขาดอีก ${cost - balance} แต้ม`
  return null
}
