import { describe, expect, it } from 'vitest'

import nextConfig from '../next.config'

describe('next.config redirects', () => {
  it('sends the deleted /podcasts page to the dashboard', async () => {
    const redirects = await nextConfig.redirects!()
    expect(redirects).toContainEqual({ source: '/podcasts', destination: '/', permanent: false })
  })

  it('sends the deleted /transformations page to the dashboard', async () => {
    const redirects = await nextConfig.redirects!()
    expect(redirects).toContainEqual({ source: '/transformations', destination: '/', permanent: false })
  })

  it('keeps the legacy credentials redirect', async () => {
    const redirects = await nextConfig.redirects!()
    expect(redirects).toContainEqual({
      source: '/settings/api-keys',
      destination: '/settings/models',
      permanent: true,
    })
  })
})
