/**
 * The knowledge-source picker of "สร้างแผนการเรียน", without any I/O (so it can
 * be tested with `node --test`). Sources are split by where they come from,
 * as on the KMITL RAG AI page: my files / courses / notebooks staff shared.
 *
 * The form keeps one `choice` string plus a list of ticked items:
 *   AUTO | NONE | PERSONAL | FILES | `course:<roomId>` | `nb:<notebookId>` | null (tab still needs a pick)
 * With FILES the ticked list may mix single files (`doc:`, `src:`) with whole
 * courses (`course:`), whole notebooks (`nb:`) and all my files (ALL_MINE).
 */

export const AUTO = 'auto'
export const PERSONAL = 'personal'
export const NONE = 'none'
// Ticked single documents (`doc:<id>` library documents, `src:<id>` notebook sources).
export const FILES = 'files'
// The backend takes at most 50 documents + 50 notebook sources, 10 courses and
// 20 notebooks per request; the form keeps single files to 50 in all.
export const MAX_PICKED_FILES = 50
export const MAX_PICKED_COURSES = 10
export const MAX_PICKED_NOTEBOOKS = 20
// "ไฟล์ทั้งหมดของฉัน" ticked together with other sources.
export const ALL_MINE = 'mine:all'

const isFile = (value) => value.startsWith('doc:') || value.startsWith('src:')
const isCourse = (value) => value.startsWith('course:')
const isNotebook = (value) => value.startsWith('nb:')

/** Single files that a ticked whole (course, notebook, all my files) already includes. */
export function coveredValues(picked, groups) {
  const covered = new Set()
  const set = new Set(picked)
  for (const course of groups?.courses || []) if (set.has(course.value)) course.docs.forEach((d) => covered.add(d.value))
  for (const nb of groups?.staff || []) if (set.has(nb.value)) nb.sources.forEach((s) => covered.add(s.value))
  if (set.has(ALL_MINE)) (groups?.mine || []).forEach((d) => covered.add(d.value))
  return covered
}

/**
 * Tick or untick one item. Returns `{ picked, reason }`; `reason` says why an
 * item could not be added (a limit), and `picked` is then unchanged.
 * `extraFiles` = files attached outside the list (they count toward the 50).
 */
export function togglePick(picked, value, groups, { extraFiles = 0 } = {}) {
  if (picked.includes(value)) return { picked: picked.filter((item) => item !== value), reason: null }
  const count = (test) => picked.filter(test).length
  if (isFile(value) && count(isFile) + extraFiles >= MAX_PICKED_FILES) {
    return { picked, reason: `เลือกไฟล์ได้สูงสุด ${MAX_PICKED_FILES} ไฟล์` }
  }
  if (isCourse(value) && count(isCourse) >= MAX_PICKED_COURSES) {
    return { picked, reason: `เลือกรายวิชาได้สูงสุด ${MAX_PICKED_COURSES} วิชา` }
  }
  if (isNotebook(value) && count(isNotebook) >= MAX_PICKED_NOTEBOOKS) {
    return { picked, reason: `เลือก notebook ได้สูงสุด ${MAX_PICKED_NOTEBOOKS} เล่ม` }
  }
  const next = [...picked, value]
  // A whole course/notebook replaces the single files of it that were ticked.
  const covered = isFile(value) ? new Set() : coveredValues([value], groups)
  return { picked: next.filter((item) => !covered.has(item)), reason: null }
}

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
    const fields = { scope: 'document', document_ids: ids('doc:').map(Number), source_ids: ids('src:') }
    if (ids('nb:').length) fields.notebook_ids = ids('nb:')
    if (ids('course:').length) fields.course_ids = ids('course:').map(Number)
    if (picked.includes(ALL_MINE)) fields.include_personal = true
    return fields
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
  if (choice === FILES) {
    const files = picked.filter(isFile).length
    const courses = picked.filter(isCourse)
    const notebooks = picked.filter(isNotebook)
    if (!courses.length && !notebooks.length && !picked.includes(ALL_MINE)) return `ใช้เฉพาะ ${files} ไฟล์ที่เลือก`
    const parts = []
    if (courses.length === 1) {
      const course = groups.courses.find((c) => c.value === courses[0])
      parts.push(course ? `วิชา ${course.label}` : '1 วิชา')
    } else if (courses.length) parts.push(`${courses.length} วิชา`)
    if (notebooks.length === 1) {
      const nb = groups.staff.find((n) => n.value === notebooks[0])
      parts.push(nb ? `notebook “${nb.label}”` : '1 notebook')
    } else if (notebooks.length) parts.push(`${notebooks.length} notebook`)
    if (picked.includes(ALL_MINE)) parts.push('ไฟล์ทั้งหมดของฉัน')
    if (files) parts.push(`${files} ไฟล์ที่เลือก`)
    return `ใช้ ${parts.join(' · ')}`
  }
  if (choice?.startsWith('course:')) {
    const course = groups.courses.find((c) => c.value === choice)
    return course ? `ใช้เอกสารทั้งหมดในวิชา ${course.label}` : 'ใช้เอกสารทั้งหมดของวิชาที่เลือก'
  }
  if (choice?.startsWith('nb:')) {
    const nb = groups.staff.find((n) => n.value === choice)
    return nb ? `ใช้ทั้ง notebook “${nb.label}”` : 'ใช้ทั้ง notebook ที่เลือก'
  }
  return 'ติ๊กเลือกแหล่งความรู้ที่ต้องการก่อน (เลือกได้หลายวิชา หลาย notebook และหลายไฟล์พร้อมกัน)'
}
