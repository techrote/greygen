from pathlib import Path

path = Path('src/app/App.tsx')
text = path.read_text()
old = """  const handleDeleteProfiles = (): void => {
    applyProfileState(createDefaultProfileState())
  }
"""
new = """  const handleDeleteProfiles = (): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    const next = createDefaultProfileState()
    setControlError(null)
    void engine
      .setCalibrationBandOffsetsDb(
        resolveCalibrationRecordOffsetsDb(null, 'off'),
      )
      .then(() => {
        setProfileState(next)
        const repository = repositoryRef.current
        if (repository) {
          reportPersistenceResult(repository.deleteProfiles())
        }
      })
      .catch(reportControlFailure)
  }
"""
if old not in text:
    raise SystemExit('profile deletion handler pattern not found')
path.write_text(text.replace(old, new, 1))
