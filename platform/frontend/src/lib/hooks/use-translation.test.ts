import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
// Ensure we are testing the real implementation
vi.unmock('@/lib/hooks/use-translation')
import { useTranslation } from './use-translation'
import { useTranslation as useI18nTranslation } from 'react-i18next'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: vi.fn()
}))

describe('useTranslation Hook', () => {
  const changeLanguageMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useI18nTranslation as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      t: (key: string) => {
        if (key === 'common.appName') return 'LSP-SIET'
        return key
      },
      i18n: {
        language: 'en-US',
        changeLanguage: changeLanguageMock,
      },
    })
  })

  it('should return standard t() function for translations', () => {
    const { result } = renderHook(() => useTranslation())
    expect(result.current.language).toBe('en-US')
    expect(result.current.t('common.appName')).toBe('LSP-SIET')
  })

  it('does not expose a way to switch language (en-US only)', () => {
    const { result } = renderHook(() => useTranslation())

    expect(Object.keys(result.current)).not.toContain('setLanguage')
    expect(changeLanguageMock).not.toHaveBeenCalled()
  })
})
