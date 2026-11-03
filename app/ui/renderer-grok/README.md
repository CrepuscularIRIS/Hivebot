# renderer-grok — 0.18 renderer port (P5-50)

Third-rung copy (CLAUDE.md §3) of `github.com/b-nnett/grok-bot-0.18-reconstructed@a9f633e`, private use, not distributed.

- `frontend/` and `source/` mirror the upstream repo layout, so the upstream relative imports
  (`../../../source/shared/rpc/coordinator` and the like) resolve without edits. `source/` holds only the import closure of the
  4 referenced modules (20 files).
- Every upstream file is listed in `SOURCES.tsv` and keeps its upstream bytes after line 1, which is the `来源:` header.
  JSON and woff2 files have no header. `pnpm check` verifies upstream diff=0 and the asset sha256 values.
- Overlay files (ours, replacing upstream behaviour) go outside `frontend/` and `source/` and are never listed in `SOURCES.tsv`. There are none yet.
- `assets/runtime/` holds the 18 `rendererRuntimeAssetUrl` assets (R9, byte-identical to the 0.18 manifest). `pnpm build` copies them next to the emitted chunks.
- `harness/` is the S0 stub mounted in our Electron: `pnpm build && pnpm mount [outDir]` (Xvfb, light and dark, asserting).

Dependencies are separate from the old renderer (React 19, every @tiptap/* package pinned exactly at 3.14.0, no wildcard override).
