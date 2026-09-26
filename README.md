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
3. **Push**: assets pendientes → notas pendientes/borradas. Para cada archivo hace `GET` del SHA remoto y luego `PUT`/`DELETE` con ese SHA (mensajes `create: <id>`, `update: <id>`, `delete: <id>`). Si el contenido ya es idéntico (SHA git calculado en local) no se crea commit.
4. **Pull**: lee el árbol recursivo de la rama y descarga los `notes/*.md` cuyo SHA cambió. Las notas con cambios locales pendientes nunca se sobrescriben (**Last-Write-Wins** a favor de lo local). Las notas sincronizadas que desaparecen del remoto se borran en local.
5. **401** → se borra el token, se detiene el worker y se vuelve al login.

### Estructura del repo de notas

```
notes/<Título>.md    # YAML frontmatter (id, title, date, updated, tags) + cuerpo Markdown
assets/<uuid>.webp   # imágenes redimensionadas a ≤1920px y convertidas a WebP
```

- El archivo se nombra por **título** (sin `/ \ : * ? " < > | # %`); si se repite, `Título (2).md`. Cambiar el título mueve el archivo.
- La identidad estable es el `id` del frontmatter: una nota renombrada desde otro dispositivo se reconoce por él.
- Un `.md` creado a mano en `notes/` se importa (título = nombre de archivo) y en el siguiente sync se le añade frontmatter.

Las imágenes se referencian como `../assets/<uuid>.webp`, por lo que también se ven al navegar el repo en GitHub. Las creadas en otro dispositivo se descargan bajo demanda y se cachean en IndexedDB.

## Autenticación

1. **Google Sign-In** (Google Identity Services, mismo cliente OAuth que `rdr-nfq/team-hub`). Solo entran los correos de `src/config/users.ts`, y cada correo tiene asociado su repositorio de notas (el repo no se muestra ni se elige en la UI).
2. **Token de GitHub**, una vez por dispositivo: fine-grained PAT con acceso **solo** al repo de notas y **Contents: Read and write**. Se guarda únicamente en IndexedDB.

> La comprobación de Google es solo del lado del cliente (no hay backend que verifique la firma del ID token). La protección real de los datos es el token de GitHub, que nunca está en el código.

## Puesta en marcha

1. **Google Cloud**: en el cliente OAuth `535974839401-…` añade a *Orígenes de JavaScript autorizados*: `https://findegil-app.github.io`, `http://localhost:5173` y `http://localhost:4173`.
2. **GitHub Pages**: tras el primer push a `main`, la action `Deploy to GitHub Pages` crea la rama `gh-pages`. En *Settings → Pages* elige *Deploy from a branch* → `gh-pages` / `/ (root)`. La app quedará en `https://<owner>.github.io/start/`.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173/start/
npm test           # tests unitarios (frontmatter + motor de sync con GitHub simulado)
npm run build      # typecheck + build de producción
npm run icons      # regenera los iconos PWA desde public/logo.svg
```

`BASE_PATH` controla la ruta base (por defecto `/start/`; usa `/` si configuras un dominio propio).
