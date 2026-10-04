# Checkpoint preservation record — Greygen issue #21

This directory archives the completed ten-band/high-resolution target representation
and return-projection micro-prepass. It is not production implementation, an
accepted representation contract, completion of issue #21, or a change to the
programme's acceptance state.

## Assessed parent and additive archive

- Repository: `techrote/greygen`.
- Assessed parent commit: `00ab20354d2ba2af7ca41147f01f324c70c74006`.
- Assessed parent root tree: `3fa675d115fc02b4a9dbb4bea2abf04fc88e0c66`.
- Intended archival branch: `checkpoint/prepass-issue-21-ae060833ac8b`.
- Intended archival directory: `checkpoints/prepass/issue-21/ae060833ac8b/`.

Build the archival commit on the assessed parent using its complete root tree.
The only additions belong inside this directory. Existing implementation,
canonical RAG instructions, workflows and repository state must remain intact.
The original `contract.ts` is an inert API proposal here; no patch file was
present in the supplied packet, and no patch is manufactured by this save.

## Original bytes and reproducible payload identity

All 20 original ZIP members are retained unpacked, byte-for-byte, including the
original `HANDOFF.md`, report, equations, prototype, independent cross-check,
input/output data, source locators, logs and original manifest. The exact original
ZIP is retained at `archives/greygen-21-representation-microprepass.zip`.

Original ZIP SHA-256: `1f192eafaca711b163d3cba4e398d04d571664ceef9deb883c9afceb4f3b2ee0`.
Original ZIP size: 130120 bytes.

`PAYLOAD.sha256` lists the 20 original unpacked files plus the exact original ZIP,
sorted lexicographically by relative POSIX path. Each line is lowercase SHA-256,
two spaces, relative path, then LF. No metadata from this publication attempt is
part of that payload identity. SHA-256 of those manifest bytes:
`ae060833ac8b5021697a55ed6755a61c62c3dbabc4a2e90596822bbcffcc8567`.
Its first 12 hexadecimal characters, `ae060833ac8b`, are the directory and
branch payload identifier. `SHA256SUMS` covers all files in this checkpoint
except itself, including both the original and publication manifests and this
preservation note.

## Evidence boundary

The original `HANDOFF.md`, `VERIFICATION.json`, `RUN.log`, `CROSSCHECK.log` and
`results/` describe the completed earlier prepass. Their read-only/no-Git-write
statements describe that original prepass, not a later archival publication.
They are retained without revision.

This preservation step verified ZIP readability/CRC, all 19 entries in the
original manifest, equality of the three separately supplied Markdown files with
the ZIP entries, JSON/text readability and consistency of the retained assessed
commit. It also read back the assessed commit/root tree and inspected remote
branches/tags for an existing checkpoint. No prototype, numerical experiment,
solver, source audit, audio render, browser test or acceptance suite was rerun.

The numerical counts/results remain historical execution evidence carried by the
original files, not newly measured evidence from this preservation operation.
Target resolution, edit bounds and silent-return tolerance remain proposals.
Realization, audio equivalence, browser behavior and acceptance work remain
unexecuted, as recorded in `HANDOFF.md`. That original handoff retains the
recommended next implementation action and its limitations.

## Publication status

This note defines the archival payload and does not itself certify publication.
Reachability, final commit identity, additive-tree verification and remote byte
checks must be recorded in the publication receipt after the relevant reads.
No PR, issue comment/closure, merge, default-branch change, workflow dispatch or
repository-setting change is authorized by this archive.
