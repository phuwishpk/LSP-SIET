/**
 * The KMITL RAG AI "ค้นคำตอบจาก" picker, split by where a source comes from:
 * every source, my own files, a course library, a teacher/admin notebook, or
 * (admins only) another user's private notebook. One choice is held at a time
 * and turned into the request fields POST /community/ask already accepts.
 */
import type { AskRequest } from '@/lib/api/community'
import type { KnowledgeNotebook, LibraryDocument } from '@/lib/api/library'
import { decodePick } from './knowledge-pick'

export type SourceTab = 'auto' | 'mine' | 'course' | 'staff' | 'users'
export type NotebookTab = Exclude<SourceTab, 'auto' | 'mine'>

export type SourceChoice =
  | { tab: 'auto' }
  /** docId null = all of my files */
  | { tab: 'mine'; docId: number | null }
  /** courseId null = nothing chosen yet; sourceId narrows to one document */
  | { tab: 'course'; courseId: number | null; sourceId?: string }
  | { tab: 'staff' | 'users'; notebookId: string | null; sourceId?: string }

export type ScopeFields = Pick<AskRequest, 'scope' | 'course_id' | 'document_ids' | 'notebook_ids' | 'source_ids'>

/** Which tab lists a notebook. Private ones (incl. a deleted course's library) only reach an admin. */
export function tabOf(nb: KnowledgeNotebook): NotebookTab {
  if (nb.visibility === 'private') return 'users'
  if (nb.kind === 'course' && nb.course_id != null) return 'course'
  if (nb.kind === 'personal' || nb.kind === 'student') return 'users'
  return 'staff'
}

/** The empty choice a tab opens with. */
export function emptyChoice(tab: SourceTab): SourceChoice {
  if (tab === 'auto') return { tab }
  if (tab === 'mine') return { tab, docId: null }
  if (tab === 'course') return { tab, courseId: null }
  return { tab, notebookId: null }
}

/** Request fields for POST /community/ask; null while the tab still needs a choice. */
export function choiceToAskFields(c: SourceChoice): ScopeFields | null {
  const base: ScopeFields = { scope: 'auto', course_id: null, document_ids: [], notebook_ids: [], source_ids: [] }
  switch (c.tab) {
    case 'auto':
      return base
    case 'mine':
      return c.docId == null
        ? { ...base, scope: 'personal' }
        : { ...base, scope: 'document', document_ids: [c.docId] }
    case 'course':
      if (c.sourceId) return { ...base, scope: 'document', source_ids: [c.sourceId] }
      return c.courseId == null ? null : { ...base, scope: 'course', course_id: c.courseId }
    default:
      if (c.sourceId) return { ...base, scope: 'document', source_ids: [c.sourceId] }
      return c.notebookId ? { ...base, scope: 'notebook', notebook_ids: [c.notebookId] } : null
  }
}

function choiceForNotebook(nb: KnowledgeNotebook, sourceId?: string): SourceChoice {
  const tab = tabOf(nb)
  const narrow = sourceId ? { sourceId } : {}
  if (tab === 'course') return { tab, courseId: nb.course_id as number, ...narrow }
  return { tab, notebookId: nb.id, ...narrow }
}

/** ?course=7, ?doc=12, ?notebook=notebook:abc or ?source=source:xyz open the tab that owns it. */
export function choiceFromParams(
  params: { get: (key: string) => string | null },
  notebooks: readonly KnowledgeNotebook[]
): SourceChoice {
  const course = Number(params.get('course'))
  if (params.get('course') && Number.isInteger(course) && course > 0) return { tab: 'course', courseId: course }
  const doc = decodePick(params.get('doc') ? `doc:${params.get('doc')}` : null)
  if (doc?.kind === 'doc') return { tab: 'mine', docId: doc.id }
  const notebook = decodePick(params.get('notebook') ? `nb:${params.get('notebook')}` : null)
  if (notebook?.kind === 'notebook') {
    const nb = notebooks.find((n) => n.id === notebook.id)
    return nb ? choiceForNotebook(nb) : { tab: 'staff', notebookId: notebook.id }
  }
  const source = decodePick(params.get('source') ? `src:${params.get('source')}` : null)
  if (source?.kind === 'source') {
    const nb = notebooks.find((n) => n.sources.some((s) => s.id === source.id))
    // Unplaced (list still loading, or not listed): keep it, the server checks access.
    return nb ? choiceForNotebook(nb, source.id) : { tab: 'staff', notebookId: null, sourceId: source.id }
  }
  return { tab: 'auto' }
}

export interface DescribeContext {
  notebooks: readonly KnowledgeNotebook[]
  myDocs: readonly Pick<LibraryDocument, 'id' | 'title'>[]
  /** Course code for a course room id (from the courses list). */
  courseCode: (id: number) => string | undefined
}

function sourceTitle(id: string, notebooks: readonly KnowledgeNotebook[]): string | undefined {
  for (const nb of notebooks) {
    const s = nb.sources.find((x) => x.id === id)
    if (s) return s.title
  }
  return undefined
}

/** The line under the picker: exactly what the AI will read. */
export function describeChoice(c: SourceChoice, ctx: DescribeContext): string {
  const one = (title: string | undefined) => (title ? `ตอบจากเอกสาร “${title}” เท่านั้น` : 'ตอบจากเอกสารที่เลือกเท่านั้น')
  switch (c.tab) {
    case 'auto':
      return 'ค้นจากไฟล์ของคุณเอง + คลังความรู้ของทุกวิชาที่คุณเข้าร่วม + notebook ที่อาจารย์และผู้ดูแลจัดทำไว้'
    case 'mine':
      if (c.docId == null) return 'ตอบจากไฟล์ที่คุณอัปโหลดเองเท่านั้น คนอื่นไม่เห็น'
      return one(ctx.myDocs.find((d) => d.id === c.docId)?.title)
    case 'course': {
      if (c.sourceId) return one(sourceTitle(c.sourceId, ctx.notebooks))
      if (c.courseId == null) return 'เลือกวิชาที่ต้องการให้ AI อ่านเฉพาะเอกสารของวิชานั้น'
      const code = ctx.courseCode(c.courseId)
      return code ? `ตอบจากเอกสารที่อาจารย์อัปโหลดในวิชา ${code} เท่านั้น` : 'ตอบจากเอกสารของวิชาที่เลือกเท่านั้น'
    }
    default: {
      if (c.sourceId) return one(sourceTitle(c.sourceId, ctx.notebooks))
      const nb = c.notebookId ? ctx.notebooks.find((n) => n.id === c.notebookId) : undefined
      if (nb) return `ตอบจากทุกเอกสารใน notebook “${nb.name}” (${nb.source_count} เอกสาร)`
      if (c.notebookId) return 'ตอบจากทุกเอกสารใน notebook ที่เลือก'
      return 'เลือก notebook ทั้งเล่ม หรือเอกสารหนึ่งฉบับ ให้ AI อ่านเฉพาะส่วนนั้น'
    }
  }
}
