import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../src/app/App'

describe('Greygen app shell', () => {
  const markup = renderToStaticMarkup(<App />)

  it('states the product purpose without claiming audio is implemented', () => {
    expect(markup).toContain('Greygen')
    expect(markup).toContain('spectral-noise generator')
    expect(markup).toContain('Audio synthesis is intentionally not implemented')
  })

  it('renders an honest Ready state with the future Start action disabled', () => {
    expect(markup).toContain('Ready')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Start audio<\/button>/)
  })
})
