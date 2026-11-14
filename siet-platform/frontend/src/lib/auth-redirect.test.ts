import { afterEach, describe, expect, it } from 'vitest'
import { adminLanding, clearPostLoginPath, peekPostLoginPath, rememberPostLoginPath } from './auth-redirect'

afterEach(() => clearPostLoginPath())

describe('where a sign-in lands', () => {
  it('takes an admin who was opening AI Roadmap back to it', () => {
    rememberPostLoginPath('/go/roadmap?path=%2Froadmap%2Froadmap_session-abc')
    expect(peekPostLoginPath('admin')).toBe('/go/roadmap?path=%2Froadmap%2Froadmap_session-abc')
  })

  it('still sends an admin to /admin from any other page (PR #37)', () => {
    rememberPostLoginPath('/community')
    expect(peekPostLoginPath('admin')).toBe('/admin')
  })

  it('Google sign-in: an admin on the way to an app or an admin page goes there, else to /admin', () => {
    expect(adminLanding('/go/roadmap?path=%2F')).toBe('/go/roadmap?path=%2F')
    expect(adminLanding('/admin/rag')).toBe('/admin/rag')
    expect(adminLanding('/community')).toBe('/admin')
    expect(adminLanding(null)).toBe('/admin')
  })

  it('takes a student back to the page they were heading for', () => {
    rememberPostLoginPath('/go/roadmap?path=%2F')
    expect(peekPostLoginPath('student')).toBe('/go/roadmap?path=%2F')
  })
})
