import { useCallback, useEffect, useRef, useState } from 'react';
import type { Model } from './model/types';
import { parseModel, serializeModel } from './model/io';
import { exampleModel } from './model/example';
import { initialLang } from './i18n';

const STORAGE_KEY = 'erd-modeler:model';
const LIMIT = 200;

function loadInitial(): Model {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseModel(saved);
  } catch {
    /* corrupt or unavailable storage: fall back to the example */
  }
  return exampleModel(initialLang());
}

export interface ModelStore {
  model: Model;
  /** Apply a change. Changes sharing a coalesce key within a second collapse into one undo step. */
  update: (fn: (m: Model) => Model, coalesceKey?: string) => void;
  /** Replace without recording history (used while dragging). */
  replaceSilently: (fn: (m: Model) => Model) => void;
  /** Record the current state as an undo point (call before a silent series of changes). */
  checkpoint: () => void;
  reset: (m: Model) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useModelStore(): ModelStore {
  const [model, setModel] = useState<Model>(loadInitial);
  const [, setHistoryVersion] = useState(0);
  const modelRef = useRef(model);
  const past = useRef<Model[]>([]);
  const future = useRef<Model[]>([]);
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);

  const commit = useCallback((m: Model) => {
    modelRef.current = m;
    setModel(m);
    setHistoryVersion((v) => v + 1);
  }, []);

  const pushPast = useCallback((m: Model) => {
    past.current.push(m);
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
  }, []);

  const update = useCallback(
    (fn: (m: Model) => Model, coalesceKey?: string) => {
      const prev = modelRef.current;
      const next = fn(prev);
      if (next === prev) return;
      const now = Date.now();
      const last = lastCoalesce.current;
      const coalesce = coalesceKey && last && last.key === coalesceKey && now - last.at < 1000;
      if (!coalesce) pushPast(prev);
      lastCoalesce.current = coalesceKey ? { key: coalesceKey, at: now } : null;
      commit(next);
    },
    [commit, pushPast],
  );

  const replaceSilently = useCallback(
    (fn: (m: Model) => Model) => {
      const next = fn(modelRef.current);
      if (next !== modelRef.current) commit(next);
    },
    [commit],
  );

  const checkpoint = useCallback(() => {
    lastCoalesce.current = null;
    pushPast(modelRef.current);
    setHistoryVersion((v) => v + 1);
  }, [pushPast]);

  const reset = useCallback(
    (m: Model) => {
      pushPast(modelRef.current);
      lastCoalesce.current = null;
      commit(m);
    },
    [commit, pushPast],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.unshift(modelRef.current);
    lastCoalesce.current = null;
    commit(prev);
  }, [commit]);

  const redo = useCallback(() => {
    const next = future.current.shift();
    if (!next) return;
    past.current.push(modelRef.current);
    lastCoalesce.current = null;
    commit(next);
  }, [commit]);

  // Autosave (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, serializeModel(model));
      } catch {
        /* storage full or blocked: ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [model]);

  return {
    model,
    update,
    replaceSilently,
    checkpoint,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
