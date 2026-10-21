# Local Whiteboard

A standalone React + TypeScript app using the published `@excalidraw/excalidraw` package. Drawings are saved in the browser's IndexedDB on the current device; use **My local** to search and page through canvas history, switch drawings, rename them, delete them, create a new canvas, or choose a preset canvas background. The app does not upload scenes to a server, and it includes the editor's font assets locally.

Install dependencies and start the app:

```sh
npm install
npm run dev
```

Build and type-check it with:

```sh
npm run build
npm run typecheck
```

Use the editor's export controls to download a portable drawing file. Clearing the browser's site data also removes the locally saved canvases. The app is standalone and includes its font assets in `public/fonts`.
