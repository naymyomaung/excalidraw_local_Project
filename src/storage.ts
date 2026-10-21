import { createStore, del, get, set } from "idb-keyval";

import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

type ExcalidrawElement = NonNullable<
  ExcalidrawInitialDataState["elements"]
>[number];

const LEGACY_SCENE_KEY = "current-scene";
const CANVAS_INDEX_KEY = "canvases-index";
const ACTIVE_CANVAS_KEY = "active-canvas";
const storage = createStore("local-whiteboard", "scene-store");

export type LocalCanvas = {
  id: string;
  name: string;
  updatedAt: number;
};

export type SceneSnapshot = {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};

export type CanvasLibrary = {
  canvases: LocalCanvas[];
  activeCanvasId: string;
};

const sceneKey = (canvasId: string) => `scene:${canvasId}`;

export const loadCanvasLibrary = async (): Promise<CanvasLibrary> => {
  let canvases =
    (await get<LocalCanvas[] | undefined>(CANVAS_INDEX_KEY, storage)) ?? [];

  if (canvases.length === 0) {
    const legacyScene = await get<SceneSnapshot | undefined>(
      LEGACY_SCENE_KEY,
      storage
    );
    const firstCanvas: LocalCanvas = {
      id: crypto.randomUUID(),
      name: "Canvas 1",
      updatedAt: Date.now(),
    };

    if (legacyScene) {
      await set(sceneKey(firstCanvas.id), legacyScene, storage);
    }
    canvases = [firstCanvas];
    await set(CANVAS_INDEX_KEY, canvases, storage);
  }

  const savedActiveId = await get<string | undefined>(
    ACTIVE_CANVAS_KEY,
    storage
  );
  const activeCanvasId = canvases.some((canvas) => canvas.id === savedActiveId)
    ? savedActiveId!
    : canvases[0].id;

  if (activeCanvasId !== savedActiveId) {
    await set(ACTIVE_CANVAS_KEY, activeCanvasId, storage);
  }

  return { canvases, activeCanvasId };
};

export const loadScene = async (
  canvasId: string
): Promise<ExcalidrawInitialDataState | null> =>
  (await get<ExcalidrawInitialDataState | undefined>(
    sceneKey(canvasId),
    storage
  )) ?? null;

export const createCanvas = async (
  canvases: LocalCanvas[]
): Promise<CanvasLibrary> => {
  let nextNumber = canvases.length + 1;
  while (canvases.some((canvas) => canvas.name === `Canvas ${nextNumber}`)) {
    nextNumber += 1;
  }
  const canvas: LocalCanvas = {
    id: crypto.randomUUID(),
    name: `Canvas ${nextNumber}`,
    updatedAt: Date.now(),
  };
  const nextCanvases = [...canvases, canvas];

  await set(CANVAS_INDEX_KEY, nextCanvases, storage);
  await set(ACTIVE_CANVAS_KEY, canvas.id, storage);

  return { canvases: nextCanvases, activeCanvasId: canvas.id };
};

export const setActiveCanvas = async (canvasId: string) => {
  await set(ACTIVE_CANVAS_KEY, canvasId, storage);
};

export const renameCanvas = async (canvasId: string, name: string) => {
  const canvases = await get<LocalCanvas[] | undefined>(
    CANVAS_INDEX_KEY,
    storage
  );
  if (!canvases?.some((canvas) => canvas.id === canvasId)) {
    throw new Error("The selected canvas no longer exists.");
  }

  const nextCanvases = canvases.map((canvas) =>
    canvas.id === canvasId ? { ...canvas, name, updatedAt: Date.now() } : canvas
  );
  await set(CANVAS_INDEX_KEY, nextCanvases, storage);
  return nextCanvases;
};

export const deleteCanvas = async (
  canvasId: string,
  activeCanvasId: string
): Promise<CanvasLibrary> => {
  const canvases = await get<LocalCanvas[] | undefined>(
    CANVAS_INDEX_KEY,
    storage
  );
  if (!canvases?.some((canvas) => canvas.id === canvasId)) {
    throw new Error("The selected canvas no longer exists.");
  }
  if (canvases.length === 1) {
    throw new Error("At least one local canvas must remain.");
  }

  const nextCanvases = canvases.filter((canvas) => canvas.id !== canvasId);
  const nextActiveCanvasId =
    activeCanvasId === canvasId
      ? [...nextCanvases].sort(
          (first, second) => second.updatedAt - first.updatedAt
        )[0].id
      : activeCanvasId;

  await set(CANVAS_INDEX_KEY, nextCanvases, storage);
  if (activeCanvasId === canvasId) {
    await set(ACTIVE_CANVAS_KEY, nextActiveCanvasId, storage);
  }
  await del(sceneKey(canvasId), storage);

  return { canvases: nextCanvases, activeCanvasId: nextActiveCanvasId };
};

export const saveScene = async (
  canvasId: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles
): Promise<LocalCanvas | undefined> => {
  const scene: SceneSnapshot = {
    elements: elements.filter((element) => !element.isDeleted),
    appState: clearAppStateForLocalStorage(appState),
    files,
  };
  const canvases = await get<LocalCanvas[] | undefined>(
    CANVAS_INDEX_KEY,
    storage
  );
  const savedCanvas = canvases?.find((canvas) => canvas.id === canvasId);
  const updatedCanvas = savedCanvas
    ? { ...savedCanvas, updatedAt: Date.now() }
    : undefined;
  const nextCanvases = updatedCanvas
    ? canvases!.map((canvas) =>
        canvas.id === canvasId ? updatedCanvas : canvas
      )
    : canvases;

  await set(sceneKey(canvasId), scene, storage);
  if (nextCanvases) {
    await set(CANVAS_INDEX_KEY, nextCanvases, storage);
  }

  return updatedCanvas;
};
