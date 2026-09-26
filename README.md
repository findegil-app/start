# Findegil

PWA de notas **local-first** que usa un repositorio privado de GitHub como base de datos ("Git-as-a-Database").

- **Frontend** (este repo): Vue 3 + TypeScript + Vite, desplegado en GitHub Pages.
- **Almacenamiento**: repo privado [`pablolloce/red-notes`](https://github.com/pablolloce/red-notes), solo Markdown + imágenes, vía la API REST de GitHub.

## Arquitectura

| Capa | Tecnología |
| --- | --- |
| UI | Vue 3 (Composition API) + vue-router (hash history) |
| Bundler / PWA | Vite + vite-plugin-pwa (Workbox, precache Cache-First) |
| BD local | Dexie.js (IndexedDB) |
| API | `@octokit/rest` |
| Editor | TipTap 3 + `@tiptap/markdown` |

### Flujo de datos

1. Toda edición se escribe **inmediatamente** en IndexedDB y la nota queda con `syncStatus: 'pending'`. La UI nunca espera a la red.
2. Un **Web Worker** (`src/sync/sync.worker.ts`) ejecuta el motor de sync (`src/sync/engine.ts`):
   - al arrancar, cada 5 min, al recuperar conexión, al volver a la pestaña, 20 s después de una edición, o al pulsar el indicador de sync;
   - solo si `navigator.onLine`, y con Web Locks para que no sincronicen dos pestañas a la vez.
3. **Push**: todo lo pendiente (notas, contenedores, imágenes, movimientos y borrados) se agrupa en un commit (`createTree` + `createCommit` + `updateRef`). Si otro dispositivo sincronizó a la vez, se reintenta sobre la rama nueva. Contenido idéntico (SHA git calculado en local) no genera cambios.
4. **Pull**: lee el árbol de la rama y descarga los blobs cuyo SHA cambió; la carpeta decide la ubicación PARA. Lo pendiente en local nunca se sobrescribe (**Last-Write-Wins** a favor de lo local).
5. **401** → se borra el token, se detiene el worker y se vuelve al login.

### Estructura del repo de notas (método PARA)

```
00 Landing Zone/<Título>.md            # capturas sin clasificar (inbox)
01 Projects/<Proyecto>/_project.md     # metadatos: id, name, status, deadline; cuerpo = descripción
01 Projects/<Proyecto>/<Título>.md
02 Areas/<Área>/_area.md
03 Resources/<Recurso>/_resource.md
04 Archive/{Projects,Areas,Resources}/<Nombre>/…   # contenedores archivados (se mueve la carpeta entera)
Scratch/<Título>.md                    # notas temporales (lista de la compra…)
assets/<uuid>.webp                     # imágenes (referenciadas como /assets/… desde cualquier nota)
```

- Frontmatter de nota: `id`, `title`, `date`, `updated`, `tags` y, si aplica, `due` (`YYYY-MM-DD` o `YYYY-MM-DDTHH:mm`), `remind` y `done`.
- Cada sincronización sube **todos** los cambios (ediciones, movimientos, archivados, borrados, imágenes) en **un único commit** (Git Data API).
- La carpeta manda: mover un archivo en GitHub a otra carpeta PARA cambia su ubicación en la app; una carpeta de proyecto/área/recurso sin `_meta` se adopta como contenedor nuevo.
- Las notas de la estructura antigua (`notes/`) se migran solas a la Landing Zone.

### Editor (tipo Notion)

- **/** abre el menú de bloques: texto, títulos, to-do, listas, toggle, cita, callouts (note/tip/warning/important), código con resaltado, tabla, divisor, imagen y fecha.
- Seleccionar texto muestra el menú flotante (Turn into, negrita, cursiva, tachado, código, resaltado, enlace); dentro de una tabla, acciones de filas/columnas.
- Tirador de bloque (＋ inserta debajo, ⋮⋮ arrastra para reordenar).
- Todo se guarda como Markdown legible en GitHub: callouts = alertas `> [!TIP]`, toggles = `<details>`, tablas GFM, resaltado `==texto==`.

## Autenticación

1. **Google Sign-In** (Google Identity Services, mismo cliente OAuth que `rdr-nfq/team-hub`). Solo entran los correos de `src/config/users.ts`, y cada correo tiene asociado su repositorio de notas (el repo no se muestra ni se elige en la UI).
2. **Token de GitHub embebido y cifrado** (`src/lib/vault.ts`). En el build, `vite.config.ts` cifra `NOTES_TOKEN` con AES-256-GCM usando una clave PBKDF2 derivada del id interno de la cuenta de Google (`NOTES_GOOGLE_SUB`) y el email. Al entrar con Google, la app recibe ese id, descifra el token y lo guarda en IndexedDB. Nunca hay que pegarlo.

> Seguridad: el token cifrado viaja en el JavaScript público; solo se puede abrir con el `sub` de la cuenta de Google autorizada, que no está en el código ni en el repo. Aun así, no hay backend: trata el `sub` como un secreto y usa un token con acceso **solo** al repo de notas.

### Secretos de GitHub Actions (findegil-app/start → Settings → Secrets and variables → Actions)

| Secreto | Valor |
| --- | --- |
| `NOTES_TOKEN` | Fine-grained PAT con acceso solo a `pablolloce/red-notes`, permiso *Contents: Read and write* |
| `NOTES_GOOGLE_SUB` | Id de tu cuenta de Google. Si falta o no coincide, la app lo muestra tras iniciar sesión con un botón *Copiar* |

Tras crear/cambiar un secreto, relanza el workflow *Deploy to GitHub Pages*. Para rotar el token: nuevo PAT → actualizar `NOTES_TOKEN` → relanzar el deploy (si el antiguo se revoca, la app avisa de que ha caducado).

En local: crea `.env.local` (ignorado por git) con `NOTES_TOKEN=…` y `NOTES_GOOGLE_SUB=…`.

## Puesta en marcha

1. **Secretos** `NOTES_TOKEN` y `NOTES_GOOGLE_SUB` (ver arriba).
1. **Google Cloud**: en el cliente OAuth `535974839401-…` añade a *Orígenes de JavaScript autorizados*: `https://findegil-app.github.io`, `http://localhost:5173` y `http://localhost:4173`.
2. **GitHub Pages**: tras el primer push a `main`, la action `Deploy to GitHub Pages` crea la rama `gh-pages`. En *Settings → Pages* elige *Deploy from a branch* → `gh-pages` / `/ (root)`. La app quedará en `https://<owner>.github.io/start/`.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173/start/
npm test           # tests unitarios (frontmatter + motor de sync con GitHub simulado)
npm run build      # typecheck + build de producción
npm run icons      # regenera logo (scripts/brand-src.mjs) e iconos PWA
```

`BASE_PATH` controla la ruta base (por defecto `/start/`; usa `/` si configuras un dominio propio).
