// Run from the repo root: node --test ai-roadmap/app/src/lib/*.test.mjs (pure functions, no bundler)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTO, ALL_MINE, FILES, MAX_PICKED_COURSES, MAX_PICKED_FILES, NONE, PERSONAL,
  coveredValues, groupKnowledge, pickedFileCount, scopeFields, sourceSummary, togglePick,
} from './knowledge-core.js'

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
  assert.equal(sourceSummary(null, [], g), 'ติ๊กเลือกแหล่งความรู้ที่ต้องการก่อน (เลือกได้หลายวิชา หลาย notebook และหลายไฟล์พร้อมกัน)')
})

test('whole courses, notebooks and all my files can be ticked together', () => {
  assert.deepEqual(scopeFields(FILES, ['course:1', 'course:2', 'nb:notebook:s', ALL_MINE, 'doc:10', 'src:source:s1']), {
    scope: 'document',
    document_ids: [10],
    source_ids: ['source:s1'],
    notebook_ids: ['notebook:s'],
    course_ids: [1, 2],
    include_personal: true,
  })
})

test('ticking a whole course drops its single files, which it already covers', () => {
  const g = groupKnowledge(ROOMS, LIBRARY, KNOWLEDGE)
  const { picked } = togglePick(['doc:20', 'doc:10'], 'course:2', g)
  assert.deepEqual(picked, ['doc:10', 'course:2'])
  assert.deepEqual([...coveredValues(picked, g)].sort(), ['doc:20'])
  assert.deepEqual([...coveredValues(['nb:notebook:s', ALL_MINE], g)].sort(), ['doc:10', 'src:source:s1'])
  // and unticking takes it out again
  assert.deepEqual(togglePick(picked, 'course:2', g).picked, ['doc:10'])
})

test('limits: 50 files, 10 courses', () => {
  const g = groupKnowledge(ROOMS, LIBRARY, KNOWLEDGE)
  const files = Array.from({ length: MAX_PICKED_FILES }, (_, i) => `doc:${100 + i}`)
  assert.equal(MAX_PICKED_FILES, 50)
  const full = togglePick(files, 'doc:999', g)
  assert.deepEqual(full.picked, files)
  assert.equal(full.reason, 'เลือกไฟล์ได้สูงสุด 50 ไฟล์')
  // an attached file counts as one of the 50
  assert.equal(togglePick(files.slice(1), 'doc:999', g, { extraFiles: 1 }).reason, 'เลือกไฟล์ได้สูงสุด 50 ไฟล์')
  const courses = Array.from({ length: MAX_PICKED_COURSES }, (_, i) => `course:${50 + i}`)
  assert.equal(togglePick(courses, 'course:99', g).reason, 'เลือกรายวิชาได้สูงสุด 10 วิชา')
  assert.equal(togglePick([], 'course:1', g).reason, null)
})

test('the summary names what was ticked', () => {
  const g = groupKnowledge(ROOMS, LIBRARY, KNOWLEDGE)
  assert.equal(sourceSummary(FILES, ['course:2'], g), 'ใช้ วิชา DEMO101 Programming')
  assert.equal(
    sourceSummary(FILES, ['course:1', 'course:2', 'nb:notebook:s', ALL_MINE, 'doc:20'], g),
    'ใช้ 2 วิชา · notebook “คู่มือ” · ไฟล์ทั้งหมดของฉัน · 1 ไฟล์ที่เลือก',
  )
  assert.equal(sourceSummary(FILES, ['doc:10', 'doc:20'], g), 'ใช้เฉพาะ 2 ไฟล์ที่เลือก')
})

test('single files are counted apart from whole sources', () => {
  assert.equal(pickedFileCount(['doc:1', 'src:s', 'course:2', 'nb:x', ALL_MINE]), 2)
  assert.equal(pickedFileCount([]), 0)
})
