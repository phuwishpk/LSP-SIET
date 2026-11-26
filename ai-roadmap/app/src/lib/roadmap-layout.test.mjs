// Run from the repo root: node --test ai-roadmap/app/src/lib/*.test.mjs (pure functions, no bundler)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryColor, categoryLabel, layoutRoadmap } from './roadmap-layout.js'

test('old plans with English stage names read in Thai', () => {
  assert.equal(categoryLabel('planning'), 'วางแผน')
  assert.equal(categoryLabel('Design'), 'ออกแบบ')
  assert.equal(categoryLabel('development'), 'ลงมือทำ')
  assert.equal(categoryLabel('testing'), 'ทดสอบ')
  assert.equal(categoryLabel('deployment'), 'นำไปใช้')
  assert.equal(categoryLabel('พื้นฐาน'), 'พื้นฐาน')
  assert.equal(categoryLabel(''), 'ทั่วไป')
})

test('an English stage keeps the colour of its Thai twin', () => {
  assert.equal(categoryColor('planning'), categoryColor('พื้นฐาน'))
})

test('lanes carry the Thai label', () => {
  const layout = layoutRoadmap([
    { id: 1, label: 'a', category: 'planning' },
    { id: 2, label: 'b', category: 'design' },
  ])
  assert.deepEqual(layout.lanes.map((lane) => lane.label), ['วางแผน', 'ออกแบบ'])
})
