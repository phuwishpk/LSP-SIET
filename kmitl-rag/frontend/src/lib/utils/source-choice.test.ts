import { describe, expect, it } from 'vitest'
import type { KnowledgeNotebook, LibraryDocument } from '@/lib/api/library'
import { choiceFromParams, choiceToAskFields, describeChoice, tabOf } from './source-choice'

function nb(over: Partial<KnowledgeNotebook>): KnowledgeNotebook {
  return {
    id: 'notebook:x',
    name: 'NB',
    description: '',
    kind: 'staff',
    course_id: null,
    visibility: 'shared',
    archived: false,
    owner_label: '',
    source_count: 1,
    sources: [],
    ...over,
  }
}

const COURSE = nb({
  id: 'notebook:c',
  name: '03206107 Programming',
  kind: 'course',
  course_id: 7,
  owner_label: 'คลังวิชา 03206107',
  source_count: 2,
  sources: [{ id: 'source:a', title: 'Lecture 1', chunks: 3 }],
})
const STAFF = nb({
  id: 'notebook:s',
  name: 'คู่มือนักศึกษา',
  source_count: 4,
  sources: [{ id: 'source:x', title: 'บทที่ 1', chunks: 5 }],
})
const NOTEBOOKS = [COURSE, STAFF]
const MY_DOCS = [{ id: 12, title: 'สรุปของฉัน.pdf' } as LibraryDocument]
const params = (q: string) => new URLSearchParams(q)
const EMPTY = { document_ids: [], notebook_ids: [], source_ids: [] }

describe('tabOf', () => {
  it('puts each kind of notebook in its tab', () => {
    expect(tabOf(COURSE)).toBe('course')
    expect(tabOf(STAFF)).toBe('staff')
    expect(tabOf(nb({ kind: 'personal', visibility: 'private' }))).toBe('users')
    expect(tabOf(nb({ kind: 'student', visibility: 'private' }))).toBe('users')
  })

  it('a deleted course library (private) is admin-only', () => {
    expect(tabOf(nb({ kind: 'course', course_id: 9, visibility: 'private' }))).toBe('users')
  })
})

describe('choiceToAskFields', () => {
  it('maps every choice to the request the API already takes', () => {
    expect(choiceToAskFields({ tab: 'auto' })).toEqual({ scope: 'auto', course_id: null, ...EMPTY })
    expect(choiceToAskFields({ tab: 'mine', docId: null })).toEqual({ scope: 'personal', course_id: null, ...EMPTY })
    expect(choiceToAskFields({ tab: 'mine', docId: 12 })).toEqual({
      scope: 'document',
      course_id: null,
      ...EMPTY,
      document_ids: [12],
    })
    expect(choiceToAskFields({ tab: 'course', courseId: 7 })).toEqual({ scope: 'course', course_id: 7, ...EMPTY })
    expect(choiceToAskFields({ tab: 'course', courseId: 7, sourceId: 'source:a' })).toEqual({
      scope: 'document',
      course_id: null,
      ...EMPTY,
      source_ids: ['source:a'],
    })
    expect(choiceToAskFields({ tab: 'staff', notebookId: 'notebook:s' })).toEqual({
      scope: 'notebook',
      course_id: null,
      ...EMPTY,
      notebook_ids: ['notebook:s'],
    })
    expect(choiceToAskFields({ tab: 'users', notebookId: null, sourceId: 'source:x' })).toEqual({
      scope: 'document',
      course_id: null,
      ...EMPTY,
      source_ids: ['source:x'],
    })
  })

  it('returns null while nothing is chosen in a tab that needs a choice', () => {
    expect(choiceToAskFields({ tab: 'course', courseId: null })).toBeNull()
    expect(choiceToAskFields({ tab: 'staff', notebookId: null })).toBeNull()
  })
})

describe('choiceFromParams', () => {
  it('opens the tab a deep link points at', () => {
    expect(choiceFromParams(params('course=7'), NOTEBOOKS)).toEqual({ tab: 'course', courseId: 7 })
    expect(choiceFromParams(params('doc=12'), NOTEBOOKS)).toEqual({ tab: 'mine', docId: 12 })
    expect(choiceFromParams(params('notebook=notebook:c'), NOTEBOOKS)).toEqual({ tab: 'course', courseId: 7 })
    expect(choiceFromParams(params('notebook=notebook:s'), NOTEBOOKS)).toEqual({ tab: 'staff', notebookId: 'notebook:s' })
    expect(choiceFromParams(params('source=source:a'), NOTEBOOKS)).toEqual({
      tab: 'course',
      courseId: 7,
      sourceId: 'source:a',
    })
    expect(choiceFromParams(params('source=source:x'), NOTEBOOKS)).toEqual({
      tab: 'staff',
      notebookId: 'notebook:s',
      sourceId: 'source:x',
    })
  })

  it('keeps a source it cannot place yet (the list may still be loading)', () => {
    expect(choiceFromParams(params('source=source:zz'), [])).toEqual({
      tab: 'staff',
      notebookId: null,
      sourceId: 'source:zz',
    })
  })

  it('starts on every source without a link', () => {
    expect(choiceFromParams(params(''), NOTEBOOKS)).toEqual({ tab: 'auto' })
    expect(choiceFromParams(params('course=abc'), NOTEBOOKS)).toEqual({ tab: 'auto' })
  })
})

describe('describeChoice', () => {
  const ctx = { notebooks: NOTEBOOKS, myDocs: MY_DOCS, courseCode: (id: number) => (id === 7 ? '03206107' : undefined) }

  it('says exactly what the AI will read', () => {
    expect(describeChoice({ tab: 'auto' }, ctx)).toBe(
      'ค้นจากไฟล์ของคุณเอง + คลังความรู้ของทุกวิชาที่คุณเข้าร่วม + notebook ที่อาจารย์และผู้ดูแลจัดทำไว้'
    )
    expect(describeChoice({ tab: 'mine', docId: null }, ctx)).toBe('ตอบจากไฟล์ที่คุณอัปโหลดเองเท่านั้น คนอื่นไม่เห็น')
    expect(describeChoice({ tab: 'mine', docId: 12 }, ctx)).toBe('ตอบจากเอกสาร “สรุปของฉัน.pdf” เท่านั้น')
    expect(describeChoice({ tab: 'course', courseId: 7 }, ctx)).toBe(
      'ตอบจากเอกสารที่อาจารย์อัปโหลดในวิชา 03206107 เท่านั้น'
    )
    expect(describeChoice({ tab: 'course', courseId: null }, ctx)).toBe(
      'เลือกวิชาที่ต้องการให้ AI อ่านเฉพาะเอกสารของวิชานั้น'
    )
    expect(describeChoice({ tab: 'course', courseId: 7, sourceId: 'source:a' }, ctx)).toBe(
      'ตอบจากเอกสาร “Lecture 1” เท่านั้น'
    )
    expect(describeChoice({ tab: 'staff', notebookId: 'notebook:s' }, ctx)).toBe(
      'ตอบจากทุกเอกสารใน notebook “คู่มือนักศึกษา” (4 เอกสาร)'
    )
    expect(describeChoice({ tab: 'staff', notebookId: null }, ctx)).toBe(
      'เลือก notebook ทั้งเล่ม หรือเอกสารหนึ่งฉบับ ให้ AI อ่านเฉพาะส่วนนั้น'
    )
  })
})
