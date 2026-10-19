import { ws } from './api'

/**
 * The knowledge-source picker: same choices as the "KMITL RAG AI" page.
 * A <select> value is a string, so every choice is encoded as `<kind>[:<id>]`.
 */

export const AUTO = 'auto'
export const PERSONAL = 'personal'

/** Load every group of choices; a group that fails to load is simply empty. */
export async function loadKnowledgeOptions() {
  const [rooms, library, knowledge] = await Promise.all([
    ws('community/courses').catch(() => []),
    ws('community/library').catch(() => ({ items: [] })),
    ws('community/knowledge').catch(() => ({ notebooks: [] })),
  ])

  const courseRooms = (rooms || []).filter((room) => room.kind !== 'club')
  const documents = (library.items || []).filter((doc) => doc.status === 'ready')
  // Course libraries are already offered as rooms; here only what staff share.
  const notebooks = (knowledge.notebooks || []).filter((nb) => nb.kind !== 'course')

  return {
    rooms: courseRooms,
    groups: [
      {
        label: 'ห้องวิชาของฉัน',
        options: courseRooms
          .filter((room) => room.joined)
          .map((room) => ({ value: `course:${room.id}`, label: `คลังวิชา ${room.code} ${room.name}` })),
      },
      {
        label: 'เอกสารในคลังความรู้',
        options: documents.map((doc) => ({
          value: `doc:${doc.id}`,
          label: `${doc.title}${doc.course?.code ? ` · ${doc.course.code}` : doc.scope === 'personal' ? ' · ไฟล์ของฉัน' : ''}`,
        })),
      },
      {
        label: 'Notebook ที่อาจารย์แชร์',
        options: notebooks.flatMap((nb) => [
          { value: `nb:${nb.id}`, label: `${nb.name} (ทั้ง notebook)` },
          ...(nb.sources || []).map((source) => ({ value: `src:${source.id}`, label: `— ${source.title}` })),
        ]),
      },
    ].filter((group) => group.options.length > 0),
  }
}

/** Choice -> the scope fields of POST /community/study/roadmap. */
export function scopeFields(choice) {
  const [kind, ...rest] = String(choice || AUTO).split(':')
  const id = rest.join(':')
  if (kind === 'course') return { scope: 'course', course_id: Number(id) }
  if (kind === 'doc') return { scope: 'document', document_ids: [Number(id)] }
  if (kind === 'nb') return { scope: 'notebook', notebook_ids: [id] }
  if (kind === 'src') return { scope: 'document', source_ids: [id] }
  if (kind === PERSONAL) return { scope: 'personal' }
  return { scope: 'auto' }
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
