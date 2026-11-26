import { describe, expect, it } from 'vitest'
import { avatarIsStill } from './ask-avatar'

const msgs = [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }, { role: 'assistant' }]

describe('avatarIsStill', () => {
  it('keeps older answers still', () => {
    expect(avatarIsStill(1, msgs)).toBe(true)
  })

  it('lets only the newest answer move', () => {
    expect(avatarIsStill(3, msgs)).toBe(false)
  })

  it('newest answer moves even when the user asked after it', () => {
    expect(avatarIsStill(3, [...msgs, { role: 'user' }])).toBe(false)
  })
})
