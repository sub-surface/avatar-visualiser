/**
 * export-state.js — tiny shared export state.
 *
 * Lives apart from export.js so the UI and render loop can check "is an export
 * running?" and request cancellation without statically importing the export
 * pipeline (which, with mp4-muxer, is loaded on demand).
 */
export const exportState = {
  /** True while a save dialog is open or an export is running. */
  busy: false,
  /** True once rendering has begun (the preview render loop pauses). */
  active: false,
  /** The running job; `cancelled` is polled every frame. */
  job: null,
};

export function cancelExport() {
  if (exportState.job) exportState.job.cancelled = true;
}

let exporterPromise = null;

/** Lazily load the export pipeline (export.js + mp4-muxer). */
export function loadExporter() {
  exporterPromise ??= import('../../export.js').catch((error) => {
    exporterPromise = null;
    throw error;
  });
  return exporterPromise;
}
