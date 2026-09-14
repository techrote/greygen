export default function App() {
  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Local-first spectral noise</p>
        <h1>Greygen</h1>
        <p className="lede">
          A browser-based calibrated spectral-noise generator and psychoacoustic
          playground, built around deterministic and measurable DSP.
        </p>
      </header>

      <section className="status-card" aria-labelledby="audio-status-heading">
        <div className="status-row">
          <div>
            <p className="label" id="audio-status-heading">
              Audio status
            </p>
            <p className="status-value" aria-live="polite">
              Ready
            </p>
          </div>
          <span className="status-dot" aria-hidden="true" />
        </div>

        <button type="button" disabled aria-describedby="audio-scaffold-note">
          Start audio
        </button>
        <p className="scaffold-note" id="audio-scaffold-note">
          Audio synthesis is intentionally not implemented in this foundation
          milestone. The browser audio engine arrives in a later issue.
        </p>
      </section>
    </main>
  )
}
