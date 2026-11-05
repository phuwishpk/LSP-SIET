import { describe, expect, it } from 'vitest'
import { canAccessRoute } from './roles'

describe('canAccessRoute', () => {
  it('keeps students out of AI Features, which is a teaching tool', () => {
    expect(canAccessRoute('student', '/features')).toBe(false)
    expect(canAccessRoute('student', '/features/quiz')).toBe(false)
    expect(canAccessRoute('teacher', '/features')).toBe(true)
    expect(canAccessRoute('admin', '/features')).toBe(true)
  })

  it('does not mistake a longer path for AI Features', () => {
    expect(canAccessRoute('student', '/featuresque')).toBe(true)
    expect(canAccessRoute('student', '/community')).toBe(true)
  })
})
