import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { computeClientDiff, type ClientDiffResult } from '../utils/diff';
import { API } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';

interface UseEditorGitWatcherOptions {
  filePath: string | null;
  content: string;
  originalContent: string;
  debounceMs?: number;
  enabled?: boolean;
  onAutoSaved?: () => void;
}

export interface EditorGitWatcherState {
  liveDiff: ClientDiffResult;
  isDirty: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
  flushSync: () => Promise<boolean>;
}

/**
 * High-performance hook that watches live editor modifications,
 * calculates real-time client diffs (+/- counts & unified patch) without lag,
 * and debounces workspace background synchronization & git status refresh.
 */
export function useEditorGitWatcher({
  filePath,
  content,
  originalContent,
  debounceMs = 700,
  enabled = true,
  onAutoSaved,
}: UseEditorGitWatcherOptions): EditorGitWatcherState {
  const { refreshPendingChanges, refreshGitStatus } = useWorkspace();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Fast in-memory client diff calculation (zero network delay)
  const liveDiff = useMemo(() => {
    if (!filePath) {
      return { hasChanges: false, additions: 0, deletions: 0, diff_text: '' };
    }
    return computeClientDiff(originalContent || '', content || '', filePath);
  }, [filePath, originalContent, content]);

  const isDirty = liveDiff.hasChanges;

  const contentRef = useRef(content);
  contentRef.current = content;

  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  const originalContentRef = useRef(originalContent);
  originalContentRef.current = originalContent;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Perform background sync to workspace and refresh git
  const doSync = useCallback(async (targetPath: string, targetContent: string): Promise<boolean> => {
    if (!targetPath) return false;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await API.saveWorkspaceFile({
        path: targetPath,
        content: targetContent,
      });

      if (res.ok) {
        setLastSyncedAt(new Date());
        // Trigger background git and pending changes refresh asynchronously
        Promise.all([
          refreshPendingChanges(),
          refreshGitStatus()
        ]).catch(err =>
          console.warn('[useEditorGitWatcher] Erro ao atualizar status Git:', err)
        );
        if (onAutoSaved) {
          onAutoSaved();
        }
        return true;
      } else {
        const errMsg = res.data?.error || 'Erro ao sincronizar com workspace';
        setSyncError(errMsg);
        return false;
      }
    } catch (err: unknown) {
      console.error('[useEditorGitWatcher] Falha ao sincronizar documento:', err);
      setSyncError(err instanceof Error ? err.message : 'Erro inesperado');
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [refreshPendingChanges, refreshGitStatus, onAutoSaved]);

  // Immediate flush of any pending debounced change
  const flushSync = useCallback(async (): Promise<boolean> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const currPath = filePathRef.current;
    const currContent = contentRef.current;

    if (!currPath || currContent === originalContentRef.current) {
      return true;
    }

    return await doSync(currPath, currContent);
  }, [doSync]);

  // Watch content changes with performant debouncing
  useEffect(() => {
    if (!enabled || !filePath) return;

    // If identical to original, no sync needed
    if (content === originalContent) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }

    // Clear previous pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Schedule new debounced sync
    debounceTimerRef.current = setTimeout(() => {
      doSync(filePath, content);
      debounceTimerRef.current = null;
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [content, originalContent, filePath, debounceMs, enabled, doSync]);

  // When switching file, clean up timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filePath]);

  return {
    liveDiff,
    isDirty,
    isSyncing,
    lastSyncedAt,
    syncError,
    flushSync,
  };
}
