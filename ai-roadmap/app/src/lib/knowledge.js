import { ws } from './api'

import { groupKnowledge } from './knowledge-core'

export {
  ALL_MINE,
  AUTO,
  FILES,
  MAX_PICKED_FILES,
  NONE,
  PERSONAL,
  coveredValues,
  groupKnowledge,
  scopeFields,
  sourceSummary,
  togglePick,
} from './knowledge-core'

/**
 * Load the picker's lists (see knowledge-core.js); a list that fails to load is
 * simply empty. `opened.courseId` keeps the room the user came from listed.
 */
export async function loadKnowledge(opened = {}) {
  const [rooms, library, knowledge] = await Promise.all([
    ws('community/courses').catch(() => []),
    ws('community/library').catch(() => ({ items: [] })),
    ws('community/knowledge').catch(() => ({ notebooks: [] })),
  ])
  return groupKnowledge(rooms, library, knowledge, opened)
}

/** Upload a file into "ไฟล์ของฉัน" and wait until it is ready to be searched. */
export async function uploadToMyLibrary(file, { onStage } = {}) {
  const form = new FormData()
  form.append('scope', 'personal')
  form.append('title', file.name.replace(/\.[^.]+$/, '').slice(0, 200) || 'เอกสาร')
  form.append('file', file)
  onStage?.('กำลังบันทึกไฟล์เข้าคลังของฉัน…')
  const created = await ws('community/library', { method: 'POST', form })
  const id = created?.document?.id
  if (!id) throw new Error('บันทึกไฟล์ไม่สำเร็จ')

  onStage?.('กำลังประมวลผลไฟล์ (อาจใช้เวลาถึงหนึ่งนาที)…')
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const doc = await ws(`community/library/${id}`)
    if (doc.status === 'ready') return doc
    if (doc.status === 'failed') throw new Error(doc.error || 'ประมวลผลไฟล์ไม่สำเร็จ')
  }
  throw new Error('ประมวลผลไฟล์นานเกินไป ไฟล์ถูกเก็บไว้ในคลังแล้ว ลองสร้างใหม่อีกครั้งโดยเลือกไฟล์นี้จากรายการ')
}
