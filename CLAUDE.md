# Findegil — notas para Claude

- Idioma del proyecto y de la UI: español.
- **Flujo de entrega**: cada cambio terminado se commitea en la rama de trabajo y se fusiona a `main` (fast-forward o merge) con permiso permanente del usuario. Cada push a `main` despliega automáticamente (`.github/workflows/deploy.yml` → build + tests → rama `gh-pages` → GitHub Pages en https://findegil-app.github.io/start/).
- GitHub Pages publica desde la rama `gh-pages` (no desde `main`: `main` tiene el código sin compilar).
- Antes de fusionar: `npm test` y `npm run build` deben pasar.
- El token de GitHub de las notas nunca se escribe en el repo: llega como secreto de Actions (`NOTES_TOKEN`, `NOTES_GOOGLE_SUB`) y se cifra en build (`src/lib/vault.ts`, `vite.config.ts`).
- Repo de notas: `pablolloce/red-notes` (privado), asociado a `pablo.llorente@nfq.es` en `src/config/users.ts`.
