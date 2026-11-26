// Run from the repo root: node --test ai-roadmap/app/src/lib/*.test.mjs (pure functions, no bundler)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUTO, FILES, NONE, PERSONAL, groupKnowledge, scopeFields, sourceSummary } from './knowledge-core.js'

const ROOMS = [
  { id: 1, code: 'CS301', name: 'OS', kind: 'course', joined: true },
  { id: 2, code: 'DEMO101', name: 'Programming', kind: 'course', joined: false },
  { id: 3, code: 'EMPTY', name: 'No docs', kind: 'course', joined: false },
  { id: 4, code: 'CLUB', name: 'Club', kind: 'club', joined: true },
]
const LIBRARY = {
  items: [
    { id: 10, title: 'สรุปของฉัน', scope: 'personal', status: 'ready' },
    { id: 11, title: 'กำลังประมวลผล', scope: 'personal', status: 'processing' },
    { id: 20, title: 'Lecture 1', scope: 'course', status: 'ready', course: { id: 2, code: 'DEMO101' } },
  ],
}
const KNOWLEDGE = {
  notebooks: [
    { id: 'notebook:c', name: 'คลัง DEMO101', kind: 'course', sources: [{ id: 'source:c1', title: 'x', chunks: 1 }] },
    { id: 'notebook:s', name: 'คู่มือ', kind: 'staff', owner_label: 'อ.ก', sources: [{ id: 'source:s1', title: 'บทที่ 1', chunks: 2 }] },
  ],
}

test('groupKnowledge splits sources by where they come from', () => {
  const g = groupKnowledge(ROOMS, LIBRARY, KNOWLEDGE)
  assert.deepEqual(g.mine, [{ value: 'doc:10', label: 'สรุปของฉัน' }])
  // joined rooms first, then rooms that have documents; clubs and empty unjoined rooms are left out
  assert.deepEqual(
    g.courses.map((c) => [c.id, c.joined, c.docs.map((d) => d.value)]),
    [
      [1, true, []],
      [2, false, ['doc:20']],
    ],
  )
  assert.equal(g.courses[1].label, 'DEMO101 Programming')
  // course libraries are reached through the course tab, so only staff notebooks here
  assert.deepEqual(
    g.staff.map((nb) => [nb.value, nb.sources.map((s) => s.value)]),
    [['nb:notebook:s', ['src:source:s1']]],
  )
})

test('a room opened from a link is listed even with no documents', () => {
  const g = groupKnowledge(ROOMS, LIBRARY, KNOWLEDGE, { courseId: 3 })
  assert.ok(g.courses.some((c) => c.id === 3))
})

test('groupKnowledge copes with failed loads', () => {
  assert.deepEqual(groupKnowledge(null, null, null), { mine: [], courses: [], staff: [] })
})

test('scopeFields keeps the request shapes the API takes', () => {
  assert.deepEqual(scopeFields(AUTO), { scope: 'auto' })
  assert.deepEqual(scopeFields(NONE), { scope: 'none' })
  assert.deepEqual(scopeFields(PERSONAL), { scope: 'personal' })
  assert.deepEqual(scopeFields('course:2'), { scope: 'course', course_id: 2 })
  assert.deepEqual(scopeFields('nb:notebook:s'), { scope: 'notebook', notebook_ids: ['notebook:s'] })
  assert.deepEqual(scopeFields(FILES, ['doc:10', 'src:source:s1']), {
    scope: 'document',
    document_ids: [10],
    source_ids: ['source:s1'],
  })
})

test('sourceSummary says what the AI will read', () => {
  const g = groupKnowledge(ROOMS, LIBRARY, KNOWLEDGE)
  assert.equal(sourceSummary(AUTO, [], g), 'AI เลือกจากทุกคลังที่คุณเห็นได้ (ไฟล์ของฉัน รายวิชา และ notebook ที่อาจารย์แชร์)')
  assert.equal(sourceSummary(NONE, [], g), 'ไม่ใช้คลังความรู้ AI วางแผนจากเว็บ (ตามที่เลือกด้านล่าง) และความรู้ทั่วไป')
  assert.equal(sourceSummary(PERSONAL, [], g), 'ใช้ไฟล์ทั้งหมดของฉัน (1 ไฟล์)')
  assert.equal(sourceSummary('course:2', [], g), 'ใช้เอกสารทั้งหมดในวิชา DEMO101 Programming')
  assert.equal(sourceSummary('nb:notebook:s', [], g), 'ใช้ทั้ง notebook “คู่มือ”')
  assert.equal(sourceSummary(FILES, ['doc:10', 'doc:20'], g), 'ใช้เฉพาะ 2 ไฟล์ที่เลือก')
  assert.equal(sourceSummary(null, [], g), 'เลือกวิชาหรือ notebook ที่ต้องการก่อน')
})
