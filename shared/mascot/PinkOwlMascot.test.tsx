import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PinkOwlMascot } from './PinkOwlMascot'

describe('PinkOwlMascot', () => {
  it('labels the owl when label is given', () => {
    render(<PinkOwlMascot label="น้องฮูก ผู้ช่วย AI" />)
    expect(screen.getByRole('img', { name: 'น้องฮูก ผู้ช่วย AI' })).toBeInTheDocument()
  })

  it('is decorative without a label', () => {
    const { container } = render(<PinkOwlMascot />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('still keeps the pose but marks it still', () => {
    const { container } = render(<PinkOwlMascot mood="wave" still />)
    expect(container.querySelector('.action-wave.owl-still')).not.toBeNull()
  })

  it('gives each owl its own gradient ids', () => {
    const { container } = render(
      <>
        <PinkOwlMascot />
        <PinkOwlMascot />
      </>
    )
    const ids = [...container.querySelectorAll('radialGradient')].map((g) => g.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    const svgs = container.querySelectorAll('svg')
    svgs.forEach((svg) => {
      const own = svg.querySelector('radialGradient')!.id
      expect(svg.querySelector(`[fill="url(#${own})"]`)).not.toBeNull()
    })
  })

  it('stops motion for reduced-motion visitors', () => {
    const { container } = render(<PinkOwlMascot />)
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain('.owl-still')
  })

  it('has the roadmap poses: holding a map and pointing the way', () => {
    const map = render(<PinkOwlMascot mood="map" />).container
    expect(map.querySelector('.action-map')).not.toBeNull()
    expect(map.querySelector('#roadMap')).not.toBeNull()
    const point = render(<PinkOwlMascot mood="point" />).container
    expect(point.querySelector('.action-point')).not.toBeNull()
    expect(point.querySelector('#rightWingPoint')).not.toBeNull()
  })

  it('has the RAG poses: searching with a magnifying glass and a lightbulb idea', () => {
    const search = render(<PinkOwlMascot mood="search" />).container
    expect(search.querySelector('.action-search')).not.toBeNull()
    expect(search.querySelector('#searchGlass')).not.toBeNull()
    expect(search.querySelector('#searchPage')).not.toBeNull()
    const idea = render(<PinkOwlMascot mood="idea" still />).container
    expect(idea.querySelector('.action-idea.owl-still')).not.toBeNull()
    expect(idea.querySelector('#ideaBulb')).not.toBeNull()
  })
})
