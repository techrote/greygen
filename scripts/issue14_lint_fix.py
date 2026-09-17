from pathlib import Path

p = Path('src/features/calibration/GuidedCalibrationWizard.tsx')
text = p.read_text()
replacements = [
    ("      !wizard ||\n      wizard.stage !== 'matching' ||\n", "      wizard?.stage !== 'matching' ||\n"),
    ("    if (!wizard || wizard.stage !== 'matching') {\n", "    if (wizard?.stage !== 'matching') {\n"),
    ("    if (!wizard || wizard.stage !== 'review') {\n", "    if (wizard?.stage !== 'review') {\n"),
    ("      !wizard ||\n      wizard.stage !== 'review' ||\n", "      wizard?.stage !== 'review' ||\n"),
    ("        aria-labelledby=\"guided-heading\"\n        tabIndex={0}\n        onKeyDown={handleKeyboard}\n", "        aria-labelledby=\"guided-heading\"\n"),
    ("      aria-labelledby=\"guided-heading\"\n      onKeyDown={handleKeyboard}\n", "      aria-labelledby=\"guided-heading\"\n"),
    ('      <div className="calibration-review-grid" role="list">\n', '      <ul className="calibration-review-grid">\n'),
    ("            <div\n              className=\"calibration-review-band\"\n              role=\"listitem\"\n              key={frequency}\n            >\n", "            <li className=\"calibration-review-band\" key={frequency}>\n"),
    ("            </div>\n          )\n        })}\n      </div>\n", "            </li>\n          )\n        })}\n      </ul>\n"),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'missing wizard lint pattern: {old!r}')
    text = text.replace(old, new, 1)

anchor = "        <p className=\"status-note\" aria-live=\"polite\">\n          Heard reference: {heardReference ? 'yes' : 'no'} · Heard test:{' '}\n          {heardTest ? 'yes' : 'no'}\n        </p>\n"
keyboard = anchor + "        <button\n          id=\"guided-keyboard-control\"\n          type=\"button\"\n          className=\"secondary-action\"\n          onKeyDown={handleKeyboard}\n        >\n          Keyboard controls\n        </button>\n"
if anchor not in text:
    raise SystemExit('missing keyboard control anchor')
text = text.replace(anchor, keyboard, 1)
p.write_text(text)

p = Path('e2e/guided-calibration.spec.ts')
text = p.read_text()
text = text.replace("      await region.focus()\n", "      await page.locator('#guided-keyboard-control').focus()\n", 1)
text = text.replace(
    "  await page.locator('.guided-calibration-active').focus()\n  await page.keyboard.press('Escape')\n",
    "  await page.locator('#guided-keyboard-control').focus()\n  await page.keyboard.press('Escape')\n",
    1,
)
p.write_text(text)

p = Path('src/styles/base.css')
text = p.read_text()
anchor = ".calibration-review-grid {\n  display: grid;\n"
if anchor not in text:
    raise SystemExit('missing review-grid css anchor')
text = text.replace(
    anchor,
    ".calibration-review-grid {\n  display: grid;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n",
    1,
)
p.write_text(text)
