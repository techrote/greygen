# Greygen #21 — mathematical representation micro-prepass

Read `HANDOFF.md` for status, the representation decision and publication boundary.
Read `EQUATIONS.md` for the complete proposed contract and derivation.
Read `REPORT.md` for results, counterexamples and limitations.

`prototype.py` is a standard-library-only executable reference; `contract.ts`
is a proposed TypeScript boundary, not production code. `crosscheck_scipy.py`
provides an optional independent numerical solver/assembly check.
`SOURCE_FINDINGS.md` and `sources.json` identify inspected repository sources.

```sh
python prototype.py --out rerun
# Optional numerical oracle, after installing requirements-crosscheck.txt:
OPENBLAS_NUM_THREADS=1 python crosscheck_scipy.py --out rerun
```

`results/` retains all executed numeric evidence, grid, a full serialized notch
example, environment metadata and complete input/reconstructed curve fields.
`RUN.log` and `CROSSCHECK.log` retain stdout. A second standard-library run
produced byte-identical `results.json` and `curves.csv` in this environment.

From this directory verify the payload:

```sh
sha256sum -c MANIFEST.sha256
```

No remote mutation or IIR/FIR/FFT realization is part of this packet.
