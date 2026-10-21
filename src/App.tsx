import { Excalidraw, THEME } from "@excalidraw/excalidraw";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createCanvas,
  deleteCanvas,
  loadCanvasLibrary,
  loadScene,
  renameCanvas,
  saveScene,
  setActiveCanvas,
} from "./storage";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { LocalCanvas } from "./storage";

type SaveStatus = "loading" | "ready" | "error";
type PendingSave = Parameters<typeof saveScene>;

const SAVE_DELAY = 500;
const HISTORY_PAGE_SIZE = 5;

const App = () => {
  const [canvases, setCanvases] = useState<LocalCanvas[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false);
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null);
  const [draftCanvasName, setDraftCanvasName] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );
  const [canvasActionError, setCanvasActionError] = useState<string | null>(
    null
  );
  const [loadError, setLoadError] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<PendingSave | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const activeCanvasIdRef = useRef<string | null>(null);
  const filteredCanvases = useMemo(() => {
    const normalizedQuery = historySearch.trim().toLocaleLowerCase();
    return [...canvases]
      .sort((first, second) => second.updatedAt - first.updatedAt)
      .filter((canvas) =>
        canvas.name.toLocaleLowerCase().includes(normalizedQuery)
      );
  }, [canvases, historySearch]);
  const historyPageCount = Math.max(
    1,
    Math.ceil(filteredCanvases.length / HISTORY_PAGE_SIZE)
  );
  const currentHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const visibleCanvases = filteredCanvases.slice(
    currentHistoryPage * HISTORY_PAGE_SIZE,
    (currentHistoryPage + 1) * HISTORY_PAGE_SIZE
  );

  const closeCanvasPicker = useCallback(() => {
    setCanvasPickerOpen(false);
    setHistorySearchOpen(false);
    setHistorySearch("");
    setHistoryPage(0);
    setEditingCanvasId(null);
    setConfirmingDeleteId(null);
    setCanvasActionError(null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadCanvasLibrary()
      .then(({ canvases: loadedCanvases, activeCanvasId: selectedId }) => {
        if (isMounted) {
          setCanvases(loadedCanvases);
          activeCanvasIdRef.current = selectedId;
          setActiveCanvasId(selectedId);
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to load local canvases.", error);
        if (isMounted) {
          setLoadError(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canvasPickerOpen) {
      return;
    }
    const picker = pickerRef.current;
    const ownerDocument = picker?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    if (!picker || !ownerDocument || !ownerWindow) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof ownerWindow.Node &&
        !picker.contains(event.target)
      ) {
        closeCanvasPicker();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCanvasPicker();
      }
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [canvasPickerOpen, closeCanvasPicker]);

  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    while (pendingSave.current) {
      const snapshot = pendingSave.current;
      pendingSave.current = null;

      saveQueue.current = saveQueue.current
        .then(async () => {
          const updatedCanvas = await saveScene(...snapshot);
          if (updatedCanvas) {
            setCanvases((current) =>
              current.map((canvas) =>
                canvas.id === updatedCanvas.id ? updatedCanvas : canvas
              )
            );
          }
          if (activeCanvasIdRef.current === snapshot[0]) {
            setSaveStatus("ready");
          }
        })
        .catch((error: unknown) => {
          console.error("Unable to save the whiteboard locally.", error);
          if (activeCanvasIdRef.current === snapshot[0]) {
            setSaveStatus("error");
          }
        });

      await saveQueue.current;
    }
  }, []);

  const handleChange = useCallback(
    (
      elements: PendingSave[1],
      appState: PendingSave[2],
      files: PendingSave[3]
    ) => {
      if (!activeCanvasId) {
        return;
      }
      setIsDarkTheme(appState.theme === THEME.DARK);
      pendingSave.current = [activeCanvasId, elements, appState, files];
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => {
        void flushPendingSave();
      }, SAVE_DELAY);
    },
    [activeCanvasId, flushPendingSave]
  );

  const handleSelectCanvas = useCallback(
    async (canvasId: string) => {
      if (canvasId === activeCanvasId) {
        closeCanvasPicker();
        return;
      }

      await flushPendingSave();
      try {
        await setActiveCanvas(canvasId);
        activeCanvasIdRef.current = canvasId;
        setActiveCanvasId(canvasId);
        setSaveStatus("loading");
        closeCanvasPicker();
      } catch (error) {
        console.error("Unable to open the selected local canvas.", error);
        setSaveStatus("error");
      }
    },
    [activeCanvasId, closeCanvasPicker, flushPendingSave]
  );

  const handleCreateCanvas = useCallback(async () => {
    await flushPendingSave();
    try {
      const nextLibrary = await createCanvas(canvases);
      activeCanvasIdRef.current = nextLibrary.activeCanvasId;
      setCanvases(nextLibrary.canvases);
      setActiveCanvasId(nextLibrary.activeCanvasId);
      setSaveStatus("loading");
      closeCanvasPicker();
    } catch (error) {
      console.error("Unable to create a local canvas.", error);
      setSaveStatus("error");
    }
  }, [canvases, closeCanvasPicker, flushPendingSave]);

  const handleRenameCanvas = useCallback(
    async (canvasId: string) => {
      const name = draftCanvasName.trim();
      if (!name) {
        setCanvasActionError("Canvas name cannot be empty.");
        return;
      }
      try {
        const nextCanvases = await renameCanvas(canvasId, name);
        setCanvases(nextCanvases);
        setEditingCanvasId(null);
        setCanvasActionError(null);
      } catch (error) {
        console.error("Unable to rename the local canvas.", error);
        setCanvasActionError("Could not rename this canvas.");
      }
    },
    [draftCanvasName]
  );

  const handleDeleteCanvas = useCallback(
    async (canvasId: string) => {
      if (!activeCanvasId) {
        return;
      }
      await flushPendingSave();
      try {
        const nextLibrary = await deleteCanvas(canvasId, activeCanvasId);
        setCanvases(nextLibrary.canvases);
        setConfirmingDeleteId(null);
        setCanvasActionError(null);
        if (nextLibrary.activeCanvasId !== activeCanvasId) {
          activeCanvasIdRef.current = nextLibrary.activeCanvasId;
          setActiveCanvasId(nextLibrary.activeCanvasId);
          setSaveStatus("loading");
        }
      } catch (error) {
        console.error("Unable to delete the local canvas.", error);
        setCanvasActionError(
          error instanceof Error
            ? error.message
            : "Could not delete this canvas."
        );
      }
    },
    [activeCanvasId, flushPendingSave]
  );

  const loadInitialData = useCallback(async () => {
    if (!activeCanvasId) {
      return null;
    }
    try {
      const scene = await loadScene(activeCanvasId);
      setIsDarkTheme(scene?.appState?.theme === THEME.DARK);
      setSaveStatus("ready");
      return scene;
    } catch (error) {
      console.error("Unable to load the selected local canvas.", error);
      setSaveStatus("error");
      return null;
    }
  }, [activeCanvasId]);

  const renderCanvasPicker = useCallback(
    () => (
      <div className="local-canvas-picker" ref={pickerRef}>
        <button
          type="button"
          className="local-canvas-picker__trigger"
          aria-label="Canvas history"
          title="Canvas history"
          aria-expanded={canvasPickerOpen}
          aria-haspopup="dialog"
          onClick={() => {
            if (canvasPickerOpen) {
              closeCanvasPicker();
            } else {
              setCanvasPickerOpen(true);
            }
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="local-canvas-picker__icon"
          >
            <path d="M4.5 6.5A6.5 6.5 0 1 1 3.8 11" />
            <path d="M3.5 3.5v4h4M10 6.5v4l2.5 1.5" />
          </svg>
        </button>
        {canvasPickerOpen && (
          <section
            className="local-canvas-picker__panel"
            role="dialog"
            aria-label="Canvas history"
          >
            <div className="local-canvas-picker__heading">
              <strong>Canvas history</strong>
              <button
                type="button"
                className="local-canvas-picker__search-toggle"
                aria-label={
                  historySearchOpen ? "Close canvas search" : "Search canvases"
                }
                aria-expanded={historySearchOpen}
                onClick={() => {
                  if (historySearchOpen) {
                    setHistorySearch("");
                  }
                  setHistorySearchOpen(!historySearchOpen);
                  setHistoryPage(0);
                  setCanvasActionError(null);
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <circle cx="8.75" cy="8.75" r="5.5" />
                  <path d="m13 13 4 4" />
                </svg>
              </button>
              <button
                type="button"
                className="local-canvas-picker__new"
                onClick={() => void handleCreateCanvas()}
              >
                <span aria-hidden="true">+</span>
                New canvas
              </button>
            </div>
            {historySearchOpen && (
              <label className="local-canvas-picker__search">
                <span className="visually-hidden">Search canvases</span>
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <circle cx="8.75" cy="8.75" r="5.5" />
                  <path d="m13 13 4 4" />
                </svg>
                <input
                  autoFocus
                  type="search"
                  value={historySearch}
                  placeholder="Search canvases"
                  onChange={(event) => {
                    setHistorySearch(event.target.value);
                    setHistoryPage(0);
                  }}
                />
              </label>
            )}
            <ul className="local-canvas-picker__list">
              {visibleCanvases.map((canvas) => (
                <li className="local-canvas-picker__list-item" key={canvas.id}>
                  {editingCanvasId === canvas.id ? (
                    <form
                      className="local-canvas-picker__rename-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleRenameCanvas(canvas.id);
                      }}
                    >
                      <input
                        aria-label={`Name for ${canvas.name}`}
                        autoFocus
                        maxLength={80}
                        value={draftCanvasName}
                        onChange={(event) => {
                          setDraftCanvasName(event.target.value);
                          setCanvasActionError(null);
                        }}
                      />
                      <button
                        type="submit"
                        aria-label={`Save name for ${canvas.name}`}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setEditingCanvasId(null)}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : confirmingDeleteId === canvas.id ? (
                    <div className="local-canvas-picker__delete-confirm">
                      <span>Delete {canvas.name}?</span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCanvas(canvas.id)}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="local-canvas-picker__row">
                      <button
                        type="button"
                        className="local-canvas-picker__item"
                        aria-current={
                          canvas.id === activeCanvasId ? "page" : undefined
                        }
                        onClick={() => void handleSelectCanvas(canvas.id)}
                      >
                        <span
                          className="local-canvas-picker__canvas-icon"
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 20 20">
                            <rect
                              x="3.25"
                              y="3.25"
                              width="13.5"
                              height="13.5"
                              rx="2"
                            />
                            <path d="M6.5 7h7M6.5 10h4.5M6.5 13h6" />
                          </svg>
                        </span>
                        <span className="local-canvas-picker__name">
                          {canvas.name}
                        </span>
                        {canvas.id === activeCanvasId && (
                          <span className="local-canvas-picker__current">
                            Current
                          </span>
                        )}
                      </button>
                      <div className="local-canvas-picker__actions">
                        <button
                          type="button"
                          aria-label={`Rename ${canvas.name}`}
                          onClick={() => {
                            setEditingCanvasId(canvas.id);
                            setDraftCanvasName(canvas.name);
                            setCanvasActionError(null);
                          }}
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20">
                            <path d="m12.9 4.1 3 3M4 16l3.8-.8L16.4 6.6a1.4 1.4 0 0 0-2-2L5.8 13.2 4 16Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${canvas.name}`}
                          disabled={canvases.length === 1}
                          onClick={() => {
                            setConfirmingDeleteId(canvas.id);
                            setCanvasActionError(null);
                          }}
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20">
                            <path d="M4.5 6h11M8 6V4.5h4V6m-6 0 .7 9.5h6.6L14 6m-4 3v4m2-4v4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {visibleCanvases.length === 0 && (
                <li className="local-canvas-picker__empty">
                  No canvases match your search.
                </li>
              )}
            </ul>
            {filteredCanvases.length > HISTORY_PAGE_SIZE && (
              <div className="local-canvas-picker__pagination">
                <span>
                  {currentHistoryPage * HISTORY_PAGE_SIZE + 1}–
                  {Math.min(
                    (currentHistoryPage + 1) * HISTORY_PAGE_SIZE,
                    filteredCanvases.length
                  )}{" "}
                  of {filteredCanvases.length}
                </span>
                <div>
                  <button
                    type="button"
                    aria-label="Previous canvases"
                    disabled={currentHistoryPage === 0}
                    onClick={() =>
                      setHistoryPage((page) => Math.max(0, page - 1))
                    }
                  >
                    Previous
                  </button>
                  <span aria-live="polite">
                    {currentHistoryPage + 1} / {historyPageCount}
                  </span>
                  <button
                    type="button"
                    aria-label="Next canvases"
                    disabled={currentHistoryPage >= historyPageCount - 1}
                    onClick={() =>
                      setHistoryPage((page) =>
                        Math.min(historyPageCount - 1, page + 1)
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {canvasActionError && (
              <p className="local-canvas-picker__error" role="alert">
                {canvasActionError}
              </p>
            )}
          </section>
        )}
      </div>
    ),
    [
      activeCanvasId,
      canvasPickerOpen,
      canvases,
      currentHistoryPage,
      filteredCanvases.length,
      handleCreateCanvas,
      handleSelectCanvas,
      historyPageCount,
      historySearch,
      historySearchOpen,
      editingCanvasId,
      draftCanvasName,
      confirmingDeleteId,
      canvasActionError,
      handleRenameCanvas,
      handleDeleteCanvas,
      closeCanvasPicker,
      isDarkTheme,
      visibleCanvases,
    ]
  );

  const renderSaveStatus = useCallback(
    () => (
      <span
        className={`local-save-status local-save-status--${saveStatus}`}
        role="status"
        aria-live="polite"
      >
        {saveStatus === "loading" && "Loading canvas..."}
        {saveStatus === "ready" && "Autosaves locally"}
        {saveStatus === "error" && "Local save failed"}
      </span>
    ),
    [saveStatus]
  );

  if (loadError) {
    return (
      <main className="local-whiteboard-error" role="alert">
        Unable to load your local canvases. Check this browser's storage
        permissions, then reload the page.
      </main>
    );
  }

  if (!activeCanvasId) {
    return (
      <main className="local-whiteboard-loading">
        Loading local canvases...
      </main>
    );
  }

  return (
    <div className={`local-whiteboard${isDarkTheme ? " theme--dark" : ""}`}>
      <Excalidraw
        key={activeCanvasId}
        initialData={loadInitialData}
        onChange={handleChange}
        excalidrawAPI={(api) => {
          excalidrawAPIRef.current = api;
        }}
        renderTopRightUI={renderSaveStatus}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            changeViewBackgroundColor: true,
          },
        }}
      />
      {renderCanvasPicker()}
    </div>
  );
};

export default App;
