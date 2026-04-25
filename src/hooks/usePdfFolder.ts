'use client';

import { useState, useCallback, useMemo } from 'react';

type ShowDirectoryPickerFn = () => Promise<FileSystemDirectoryHandle>;

/**
 * @returns `true` when the browser exposes the File System Access API directory picker.
 */
function checkDirectoryPickerSupport(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export interface UsePdfFolderResult {
  /** Open the system folder picker; no-op if unsupported. Ignores `AbortError` (cancel). */
  pickFolder: () => Promise<void>;
  /**
   * Resolve `documentNumber`.pdf in the currently selected directory.
   * @param documentNumber - Base name without extension (e.g. "INV-001")
   * @returns A `File` for the PDF, or `null` if missing or invalid.
   */
  getPdfFile: (documentNumber: string) => Promise<File | null>;
  /** Display name of the chosen directory, or `null` if none. */
  folderName: string | null;
  /** `true` after the user has successfully picked a directory this session. */
  isReady: boolean;
  /** `false` in Firefox and other browsers without `showDirectoryPicker`. */
  isSupported: boolean;
  /** Set when a non-abort error occurs in `pickFolder`. */
  error: string | null;
}

/**
 * Keeps a {@link FileSystemDirectoryHandle} in React state for the session and resolves PDFs by `documentNumber`.
 * Uses the File System Access API (`showDirectoryPicker`).
 */
export function usePdfFolder(): UsePdfFolderResult {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSupported = useMemo(() => checkDirectoryPickerSupport(), []);

  const pickFolder = useCallback(async () => {
    if (!isSupported) {
      return;
    }
    setError(null);
    try {
      const handle = await (window as unknown as { showDirectoryPicker: ShowDirectoryPickerFn })
        .showDirectoryPicker();
      setDirHandle(handle);
      setFolderName(handle.name);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'AbortError') {
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not open folder');
    }
  }, [isSupported]);

  const getPdfFile = useCallback(
    async (documentNumber: string): Promise<File | null> => {
      if (!dirHandle) {
        return null;
      }
      const base = String(documentNumber).replace(/[\\/]/g, '');
      if (!base) {
        return null;
      }
      const filename = `${base}.pdf`;
      try {
        const fileHandle = await dirHandle.getFileHandle(filename);
        return await fileHandle.getFile();
      } catch {
        return null;
      }
    },
    [dirHandle]
  );

  const isReady = dirHandle !== null;

  return {
    pickFolder,
    getPdfFile,
    folderName,
    isReady,
    isSupported,
    error,
  };
}
