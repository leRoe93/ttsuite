# TTSuite – Hinweise für Claude

- Rein clientseitige React/TypeScript-App, Build mit esbuild (`scripts/build.mjs`), kein Backend.
- Vor jedem Push: `npm run typecheck && npm test && npm run build` müssen grün sein.
- Ein Push auf `main` veröffentlicht automatisch auf GitHub Pages (`.github/workflows/deploy.yml`): https://leroe93.github.io/ttsuite/
- Fachlogik liegt in `src/domain/` (ohne React) und hat Tests in `tests/`. Regeln mit Quellen: `docs/REGULATIONS.md`.
- Nutzerdaten liegen im localStorage unter `ttsuite:v1`. Schemaänderungen nur mit Migration in `src/storage/store.ts`, sonst verlieren Nutzer ihre Planungen.
- UI-Sprache Deutsch. Beispieldaten nur fiktiv.
- click-TT wird nie automatisch abgerufen; es werden nur Links erzeugt (`src/imports/clickTtWeb.ts`).
