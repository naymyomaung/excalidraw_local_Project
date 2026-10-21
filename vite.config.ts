import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(projectRoot, "../My Project/excalidraw");
const source = (relativePath: string) => path.resolve(sourceRoot, relativePath);

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [projectRoot, sourceRoot],
    },
  },
  resolve: {
    alias: [
      {
        find: /^@excalidraw\/common$/,
        replacement: source("packages/common/src/index.ts"),
      },
      {
        find: /^@excalidraw\/common\/(.*)$/,
        replacement: source("packages/common/src/$1"),
      },
      {
        find: /^@excalidraw\/element$/,
        replacement: source("packages/element/src/index.ts"),
      },
      {
        find: /^@excalidraw\/element\/(.*)$/,
        replacement: source("packages/element/src/$1"),
      },
      {
        find: /^@excalidraw\/excalidraw$/,
        replacement: source("packages/excalidraw/index.tsx"),
      },
      {
        find: /^@excalidraw\/excalidraw\/(.*)$/,
        replacement: source("packages/excalidraw/$1"),
      },
      {
        find: /^@excalidraw\/math$/,
        replacement: source("packages/math/src/index.ts"),
      },
      {
        find: /^@excalidraw\/math\/(.*)$/,
        replacement: source("packages/math/src/$1"),
      },
      {
        find: /^@excalidraw\/utils$/,
        replacement: source("packages/utils/src/index.ts"),
      },
      {
        find: /^@excalidraw\/utils\/(.*)$/,
        replacement: source("packages/utils/src/$1"),
      },
      {
        find: /^@excalidraw\/fractional-indexing$/,
        replacement: source("packages/fractional-indexing/src/index.ts"),
      },
      {
        find: /^@excalidraw\/laser-pointer$/,
        replacement: source("packages/laser-pointer/src/index.ts"),
      },
    ],
  },
});
