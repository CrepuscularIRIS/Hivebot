# renderer-grok — 0.18 renderer port (P5-50)

Third-rung copy (CLAUDE.md §3) of `github.com/b-nnett/grok-bot-0.18-reconstructed@a9f633e`, private use, not distributed.

- `frontend/` and `source/` mirror the upstream repo layout, so the upstream relative imports
  (`../../../source/shared/rpc/coordinator` and the like) resolve without edits. `source/` holds only the import closure of the
  4 referenced modules (20 files).
- Every upstream file is listed in `SOURCES.tsv` and keeps its upstream bytes after line 1, which is the `来源:` header.
  JSON and woff2 files have no header. `pnpm check` verifies upstream diff=0 and the asset sha256 values.
- Overlay files (ours, replacing upstream behaviour) go outside `frontend/` and `source/` and are never listed in `SOURCES.tsv`.
  They live in `overrides/` (P5-52):
  - `overrides/vite.config.ts` is the build config: the upstream `frontend/vite.config.ts` merged unchanged, plus a plugin that
    swaps whole upstream modules for `overrides/modules/*` (map `MODULE_OVERRIDES`). An override module re-exports its upstream
    module and wraps one export (strip a callback prop / filter a list) so the upstream's own `== null` gate hides the entry.
  - `overrides/*.css` are linked after the bundle styles by `scripts/inject-shim.mjs` (CSS hides use `!important`: the upstream
    stylex atoms carry `:not(#\#)` triple-id specificity).
  - Order of preference for hiding an entry the carrier cannot back: shim capability switch → module override → CSS.
- `assets/runtime/` holds the 18 `rendererRuntimeAssetUrl` assets (R9, byte-identical to the 0.18 manifest). `pnpm build` copies them next to the emitted chunks.
- `harness/` is the S0 stub mounted in our Electron: `pnpm build && pnpm mount [outDir]` (Xvfb, light and dark, asserting).
- `shim/` (P5-51, ours) is the real data layer replacing the S0 stub: `window.desktop` flat bridge + coordinator protocol v1 server
  backed by the M1/M2 carrier (`window.pbots`). `pnpm build` also emits `shim.iife.js` and injects it into the built
  `index.html` as a classic script (runs before the deferred module bundle); `pnpm build:upstream` skips that step.
  Transcript entries are serialized via P6-01 `renderer/fold/turn-fold` (imported across packages, unchanged).
  Approval answers only ever send `allowed-once` / `rejected`; `localToolPermission.ceiling()` reports `"ask"` so the
  upstream store disables "Always allow".

Dependencies are separate from the old renderer (React 19, every @tiptap/* package pinned exactly at 3.14.0, no wildcard override).
