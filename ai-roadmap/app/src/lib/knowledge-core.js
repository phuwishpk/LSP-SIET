/**
 * The knowledge-source picker of "สร้างแผนการเรียน", without any I/O (so it can
 * be tested with `node --test`). Sources are split by where they come from,
 * as on the KMITL RAG AI page: my files / courses / notebooks staff shared.
 *
 * The form keeps one `choice` string plus a list of ticked files:
 *   AUTO | NONE | PERSONAL | FILES | `course:<roomId>` | `nb:<notebookId>` | null (tab still needs a pick)
 */

export const AUTO = 'auto'
export const PERSONAL = 'personal'
export const NONE = 'none'
// Ticked single documents (`doc:<id>` library documents, `src:<id>` notebook sources).
export const FILES = 'files'
// The backend takes at most 20 documents and 20 notebook sources per request.
export const MAX_PICKED_FILES = 20

const byCode = (a, b) => String(a.code).localeCompare(String(b.code))

/**
 * GET community/courses + community/library + community/knowledge -> the three lists the tabs show.
 * `opened.courseId` (the room the user came from) is listed even without documents.
 */
export function groupKnowledge(rooms, library, knowledge, opened = {}) {
  const documents = (library?.items || []).filter((doc) => doc.status === 'ready')
  const mine = documents
    .filter((doc) => doc.scope === 'personal')
    .map((doc) => ({ value: `doc:${doc.id}`, label: doc.title }))

  const docsByCourse = new Map()
  for (const doc of documents) {
    const id = doc.course?.id
    if (doc.scope === 'personal' || id == null) continue
    docsByCourse.set(id, [...(docsByCourse.get(id) || []), { value: `doc:${doc.id}`, label: doc.title }])
  }
  const courses = (rooms || [])
    .filter((room) => room.kind !== 'club')
    .filter((room) => room.joined || docsByCourse.has(room.id) || room.id === opened.courseId)
    .map((room) => ({
      id: room.id,
      value: `course:${room.id}`,
      code: room.code,
      label: `${room.code} ${room.name}`.trim(),
      joined: Boolean(room.joined),
      docs: docsByCourse.get(room.id) || [],
    }))
    .sort((a, b) => Number(b.joined) - Number(a.joined) || byCode(a, b))

  // Course libraries are reached through the course tab; here only what staff share.
  const staff = (knowledge?.notebooks || [])
    .filter((nb) => nb.kind !== 'course')
    .map((nb) => ({
      value: `nb:${nb.id}`,
      label: nb.name,
      meta: nb.owner_label || '',
      sources: (nb.sources || []).map((s) => ({ value: `src:${s.id}`, label: s.title, ready: (s.chunks ?? 1) > 0 })),
    }))

  return { mine, courses, staff }
}

/** Choice (+ the ticked files for FILES) -> the scope fields of POST /community/study/roadmap. */
export function scopeFields(choice, picked = []) {
  if (choice === FILES) {
    const ids = (prefix) => picked.filter((value) => value.startsWith(prefix)).map((value) => value.slice(prefix.length))
    return { scope: 'document', document_ids: ids('doc:').map(Number), source_ids: ids('src:') }
  }
  const [kind, ...rest] = String(choice || AUTO).split(':')
  const id = rest.join(':')
  if (kind === 'course') return { scope: 'course', course_id: Number(id) }
  if (kind === 'nb') return { scope: 'notebook', notebook_ids: [id] }
  if (kind === PERSONAL) return { scope: 'personal' }
  if (kind === NONE) return { scope: 'none' }
  return { scope: 'auto' }
}

/** The line under the picker: exactly what the AI will read. */
export function sourceSummary(choice, picked, groups) {
  if (choice === AUTO) return 'AI เลือกจากทุกคลังที่คุณเห็นได้ (ไฟล์ของฉัน รายวิชา และ notebook ที่อาจารย์แชร์)'
  if (choice === NONE) return 'ไม่ใช้คลังความรู้ AI วางแผนจากเว็บ (ตามที่เลือกด้านล่าง) และความรู้ทั่วไป'
  if (choice === PERSONAL) return `ใช้ไฟล์ทั้งหมดของฉัน (${groups.mine.length} ไฟล์)`
  if (choice === FILES) return `ใช้เฉพาะ ${picked.length} ไฟล์ที่เลือก`
  if (choice?.startsWith('course:')) {
    const course = groups.courses.find((c) => c.value === choice)
    return course ? `ใช้เอกสารทั้งหมดในวิชา ${course.label}` : 'ใช้เอกสารทั้งหมดของวิชาที่เลือก'
  }
  if (choice?.startsWith('nb:')) {
    const nb = groups.staff.find((n) => n.value === choice)
    return nb ? `ใช้ทั้ง notebook “${nb.label}”` : 'ใช้ทั้ง notebook ที่เลือก'
  }
  return 'เลือกวิชาหรือ notebook ที่ต้องการก่อน'
}
