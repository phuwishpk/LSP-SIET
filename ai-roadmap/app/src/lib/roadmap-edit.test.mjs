// Run from the repo root: node --test ai-roadmap/app/src/lib/*.test.mjs (pure functions, no bundler)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EDIT_EXAMPLES, EDIT_MAX, changeSummary, changedIds, editBlockedReason } from './roadmap-edit.js'

test('summary counts each kind of change and leaves out the zeros', () => {
  assert.equal(changeSummary({ added: ['a', 'b'], removed: ['c'], updated: ['d', 'e', 'f'] }), 'เพิ่ม 2 · ลบ 1 · แก้ 3')
  assert.equal(changeSummary({ added: ['a'], removed: [], updated: [] }), 'เพิ่ม 1')
  assert.equal(changeSummary({ added: [], removed: ['x'], updated: ['y'] }), 'ลบ 1 · แก้ 1')
  assert.equal(changeSummary({}), 'ไม่มีการเปลี่ยนแปลง')
  assert.equal(changeSummary(null), 'ไม่มีการเปลี่ยนแปลง')
})

test('the highlighted nodes are the added and the updated ones', () => {
  assert.deepEqual([...changedIds({ added: ['n6'], removed: ['n2'], updated: ['n1'] })].sort(), ['n1', 'n6'])
  assert.equal(changedIds(undefined).size, 0)
})

test('why the edit button is off', () => {
  assert.equal(editBlockedReason({ text: '   ', cost: 3, balance: 10, exempt: false }), 'พิมพ์สิ่งที่อยากให้แก้ก่อน')
  assert.equal(editBlockedReason({ text: 'เพิ่ม Docker', cost: 3, balance: 1, exempt: false }), 'ขาดอีก 2 แต้ม')
  assert.equal(editBlockedReason({ text: 'เพิ่ม Docker', cost: 3, balance: 0, exempt: true }), null)
  assert.equal(editBlockedReason({ text: 'เพิ่ม Docker', cost: 3, balance: 3, exempt: false }), null)
  assert.equal(editBlockedReason({ text: 'ก'.repeat(EDIT_MAX + 1), cost: 3, balance: 9, exempt: false }), `พิมพ์ได้ไม่เกิน ${EDIT_MAX} ตัวอักษร`)
})

test('limits and examples', () => {
  assert.equal(EDIT_MAX, 500)
  assert.ok(EDIT_EXAMPLES.length >= 3 && EDIT_EXAMPLES.every((text) => text.length <= EDIT_MAX))
})
