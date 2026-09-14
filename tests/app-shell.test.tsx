import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../src/app/App'

describe('Greygen app shell', () => {
  const markup = renderToStaticMarkup(<App />)

  it('states the product purpose and explicit silent-until-start behavior', () => {
    expect(markup).toContain('Greygen')
    expect(markup).toContain('spectral-noise generator')
    expect(markup).toContain('Audio stays silent until you choose Start')
  })

  it('renders Ready with Start gated until browser capability detection runs', () => {
    expect(markup).toContain('Ready')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Start audio<\/button>/)
  })
})
