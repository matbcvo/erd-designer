import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';

import { useModelStore } from './store';
import type { Model, Selection } from './model/types';
import { deleteEntities, deleteNotes, deleteRelationships, emptyModel, newEntity, newNote, newRelationship, parentChild, resolveManyToMany, syncForeignKeys } from './model/ops';
import { exampleModel } from './model/example';
import { parseModel, serializeModel } from './model/io';
import { validate } from './model/validate';
import { EntityNode, RelatedEntities, type EntityNodeType } from './components/EntityNode';
import { NoteNode, type NoteNodeType } from './components/NoteNode';
import { RelationshipEdge, type RelationshipEdgeType } from './components/RelationshipEdge';
import { Inspector } from './components/Inspector';
import { SqlDialog } from './components/SqlDialog';
import { downloadText, exportImage, slug } from './export';
import { SHARE_PREFIX, decodeModel, shareUrl } from './share';
import type { Rect } from './components/ports';
import { layoutDiagram } from './components/layout';
import { DICTS, I18nContext, LANGS, initialLang, saveLang, type Lang } from './i18n';

type Theme = 'system' | 'light' | 'dark';
const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

type AppNode = EntityNodeType | NoteNodeType;

/** Width of a relationship label in the label font (see .edge-label). */
const measureLabel = (() => {
  let ctx: CanvasRenderingContext2D | null = null;
  return (text: string) => {
    if (!ctx) {
      ctx = document.createElement('canvas').getContext('2d');
      if (ctx) ctx.font = `italic 11.5px ${getComputedStyle(document.documentElement).fontFamily}`;
    }
    return ctx ? ctx.measureText(text).width : text.length * 6.2;
  };
})();

const nodeTypes = { entity: EntityNode, note: NoteNode };
const edgeTypes = { relationship: RelationshipEdge };

function fkTargetsFor(model: Model) {
  const out: Record<string, string> = {};
  for (const e of model.entities) {
    for (const a of e.attributes) {
      if (!a.fk) continue;
      const rel = model.relationships.find((r) => r.id === a.fk!.relationshipId);
      const pc = rel && parentChild(rel);
      const parent = pc && model.entities.find((x) => x.id === pc.parent.entityId);
      const col = parent?.attributes.find((x) => x.id === a.fk!.refAttributeId);
      if (parent) out[a.id] = `${parent.name}.${col?.name ?? '?'}`;
    }
  }
  return out;
}

export default function App() {
  const store = useModelStore();
  const { model, update } = store;
  const rf = useReactFlow();
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [edges, setEdges] = useState<RelationshipEdgeType[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  /** Entities being dragged; their lines are highlighted meanwhile. */
  const [dragging, setDragging] = useState<Set<string> | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [showTypes, setShowTypes] = useState(true);
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = DICTS[lang];
  const i18n = useMemo(() => ({ lang, t }), [lang, t]);
  useEffect(() => {
    saveLang(lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem('erd-modeler:theme');
      return t === 'light' || t === 'dark' ? t : 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('erd-modeler:theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const [exportOpen, setExportOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingSelect = useRef<Selection>(null);

  const fkTargets = useMemo(() => fkTargetsFor(model), [model]);
  const issues = useMemo(() => validate(model), [model]);

  // Model -> React Flow nodes, keeping React Flow's own bookkeeping (measured size, selection).
  useEffect(() => {
    const want = pendingSelect.current;
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      const entities = model.entities.map((e): EntityNodeType => {
        const old = byId.get(e.id) as EntityNodeType | undefined;
        const selected = want ? want.kind === 'entity' && want.id === e.id : (old?.selected ?? false);
        const data = { entity: e, fkTargets, showTypes };
        return old
          ? { ...old, position: { x: e.x, y: e.y }, data, selected }
          : { id: e.id, type: 'entity' as const, position: { x: e.x, y: e.y }, data, selected };
      });
      const notes = model.notes.map((n): NoteNodeType => {
        const old = byId.get(n.id) as NoteNodeType | undefined;
        const selected = want ? want.kind === 'note' && want.id === n.id : (old?.selected ?? false);
        return old
          ? { ...old, position: { x: n.x, y: n.y }, data: { note: n }, selected }
          : { id: n.id, type: 'note' as const, position: { x: n.x, y: n.y }, data: { note: n }, selected };
      });
      return [...entities, ...notes];
    });
  }, [model.entities, model.notes, fkTargets, showTypes]);

  // Attachment ports depend on where entities are, so recompute when nodes move or resize.
  const layout = useMemo(() => {
    const rects = new Map<string, Rect>();
    for (const n of nodes) {
      if (n.type === 'entity') rects.set(n.id, { x: n.position.x, y: n.position.y, w: n.measured?.width ?? 200, h: n.measured?.height ?? 100 });
    }
    // While dragging, skip the slowest clean-up so the drag stays smooth; it runs on drop.
    return layoutDiagram(rects, model.relationships, measureLabel, !!dragging);
  }, [nodes, model.relationships, dragging]);

  // Entities whose lines are highlighted: the selected ones, and any being dragged.
  const selectedKey = nodes
    .filter((n) => n.type === 'entity' && n.selected)
    .map((n) => n.id)
    .join('|');
  const focused = useMemo(() => new Set([...(selectedKey ? selectedKey.split('|') : []), ...(dragging ?? [])]), [selectedKey, dragging]);
  // ...and the entities at the other end of those lines.
  const related = useMemo(() => {
    const out = new Set<string>();
    for (const r of model.relationships) {
      if (focused.has(r.source.entityId) && !focused.has(r.target.entityId)) out.add(r.target.entityId);
      if (focused.has(r.target.entityId) && !focused.has(r.source.entityId)) out.add(r.source.entityId);
    }
    return out;
  }, [focused, model.relationships]);

  useEffect(() => {
    const want = pendingSelect.current;
    setEdges((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e]));
      return model.relationships.map((r) => {
        const old = byId.get(r.id);
        const selected = want ? want.kind === 'relationship' && want.id === r.id : (old?.selected ?? false);
        const highlighted = focused.has(r.source.entityId) || focused.has(r.target.entityId);
        return {
          ...(old ?? {}),
          id: r.id,
          type: 'relationship' as const,
          source: r.source.entityId,
          target: r.target.entityId,
          sourceHandle: 'out-right',
          targetHandle: 'in',
          data: { relationship: r, ports: layout.ports.get(r.id), route: layout.routes.get(r.id), label: layout.labels.get(r.id), highlighted },
          selected,
          // Draw highlighted lines above the others.
          zIndex: highlighted ? 1 : 0,
        };
      });
    });
  }, [model.relationships, layout, focused]);

  // A pending programmatic selection applies to the render that follows one model change.
  useEffect(() => {
    pendingSelect.current = null;
  }, [model]);

  const select = useCallback(
    (s: Selection) => {
      setSelection(s);
      setNodes((ns) => ns.map((n) => ({ ...n, selected: s?.kind === n.type && s.id === n.id })));
      setEdges((es) => es.map((e) => ({ ...e, selected: s?.kind === 'relationship' && s.id === e.id })));
      if (s?.kind === 'entity') {
        const n = rf.getNode(s.id);
        if (n) {
          const w = n.measured?.width ?? 200;
          const h = n.measured?.height ?? 100;
          rf.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: Math.max(rf.getZoom(), 0.8), duration: 300 });
        }
      }
    },
    [rf],
  );

  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => {
    // Removals go through onDelete so they become one undo step.
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<RelationshipEdgeType>[]) => {
    setEdges((es) => applyEdgeChanges(changes.filter((c) => c.type !== 'remove'), es));
  }, []);

  const onNodeDragStart = useCallback((_: unknown, __: unknown, dragged: AppNode[]) => {
    setDragging(new Set(dragged.map((n) => n.id)));
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, __: unknown, dragged: AppNode[]) => {
      setDragging(null);
      const pos = new Map(dragged.map((n) => [n.id, n.position]));
      const moved = <T extends { id: string; x: number; y: number }>(item: T): T => {
        const p = pos.get(item.id);
        return p && (p.x !== item.x || p.y !== item.y) ? { ...item, x: Math.round(p.x), y: Math.round(p.y) } : item;
      };
      update((m) => ({ ...m, entities: m.entities.map(moved), notes: m.notes.map(moved) }));
    },
    [update],
  );

  const onDelete = useCallback(
    ({ nodes: dn, edges: de }: { nodes: AppNode[]; edges: RelationshipEdgeType[] }) => {
      const ids = new Set(dn.map((n) => n.id));
      update((m) => deleteRelationships(deleteEntities(deleteNotes(m, ids), ids), new Set(de.map((e) => e.id))));
      setSelection(null);
    },
    [update],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      const rel = newRelationship(c.source, c.target);
      if (c.source === c.target) rel.source = { ...rel.source, min: 0 }; // self-reference: parent optional
      pendingSelect.current = { kind: 'relationship', id: rel.id };
      update((m) => syncForeignKeys({ ...m, relationships: [...m.relationships, rel] }));
      setSelection({ kind: 'relationship', id: rel.id });
    },
    [update],
  );

  const onSelectionChange = useCallback(({ nodes: sn, edges: se }: OnSelectionChangeParams) => {
    if (sn.length === 1 && se.length === 0) setSelection({ kind: sn[0].type === 'note' ? 'note' : 'entity', id: sn[0].id });
    else if (se.length === 1 && sn.length === 0) setSelection({ kind: 'relationship', id: se[0].id });
    else setSelection(null);
  }, []);

  const addEntityAt = useCallback(
    (x: number, y: number) => {
      let id = '';
      update((m) => {
        const e = newEntity(m, Math.round(x), Math.round(y), undefined, t.defaultEntityName);
        id = e.id;
        return { ...m, entities: [...m.entities, e] };
      });
      pendingSelect.current = { kind: 'entity', id };
      setSelection({ kind: 'entity', id });
    },
    [update, t],
  );

  /** A free spot near the centre of the view. */
  const freeSpot = () => {
    const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
    const center = pane
      ? rf.screenToFlowPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 })
      : { x: 0, y: 0 };
    // Find a free spot near the centre, spiralling outwards.
    const boxes = rf.getNodes().map((n) => ({ x: n.position.x, y: n.position.y, w: n.measured?.width ?? 200, h: n.measured?.height ?? 120 }));
    const W = 220, H = 110, M = 30;
    const free = (x: number, y: number) => boxes.every((b) => x + W + M < b.x || x > b.x + b.w + M || y + H + M < b.y || y > b.y + b.h + M);
    let spot = { x: center.x - W / 2, y: center.y - H / 2 };
    search: for (let r = 0; r < 30; r++) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = center.x - W / 2 + Math.cos(ang) * r * 60;
        const y = center.y - H / 2 + Math.sin(ang) * r * 45;
        if (free(x, y)) {
          spot = { x, y };
          break search;
        }
      }
    }
    return { x: Math.round(spot.x / 10) * 10, y: Math.round(spot.y / 10) * 10 };
  };

  const addEntity = () => {
    const { x, y } = freeSpot();
    addEntityAt(x, y);
  };

  const addNote = () => {
    const note = newNote(freeSpot());
    update((m) => ({ ...m, notes: [...m.notes, note] }));
    pendingSelect.current = { kind: 'note', id: note.id };
    setSelection({ kind: 'note', id: note.id });
  };

  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.detail === 2) {
        const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addEntityAt(p.x - 100, p.y - 30);
      }
    },
    [rf, addEntityAt],
  );

  const saveJson = useCallback(() => {
    downloadText(serializeModel(model), `${slug(model.name)}.erd.json`, 'application/json');
  }, [model]);

  const openFile = async (file: File) => {
    try {
      const m = parseModel(await file.text());
      store.reset(m);
      setSelection(null);
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 50);
    } catch (err) {
      alert(t.openFailed(file.name, err instanceof Error ? err.message : String(err)));
    }
  };

  const loadModel = (m: Model) => {
    store.reset(m);
    setSelection(null);
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 50);
  };

  const share = async () => {
    const url = await shareUrl(model);
    try {
      await navigator.clipboard.writeText(url);
      alert(t.shareCopied);
    } catch {
      prompt(t.sharePrompt, url);
    }
  };

  // Open a shared diagram from the link (#model=…), on load and when a link is pasted into this tab.
  const openShared = useRef<() => void>(() => {});
  openShared.current = () => {
    const hash = location.hash;
    if (!hash.startsWith(SHARE_PREFIX)) return;
    history.replaceState(null, '', location.pathname + location.search);
    decodeModel(hash.slice(SHARE_PREFIX.length))
      .then((m) => {
        if ((model.entities.length === 0 && model.notes.length === 0) || confirm(t.shareOpenConfirm)) loadModel(m);
      })
      .catch(() => alert(t.shareBroken));
  };
  useEffect(() => {
    const onHash = () => openShared.current();
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const exportAs = async (format: 'png' | 'svg') => {
    setExportOpen(false);
    select(null);
    // Let the deselection render before capturing.
    await new Promise((r) => setTimeout(r, 50));
    await exportImage(rf.getNodes(), format, `${slug(model.name)}.${format}`);
  };

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        saveJson();
        return;
      }
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return; // keep native text undo
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        store.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveJson, store]);

  // Close the export menu on outside click.
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.menu')) setExportOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [exportOpen]);

  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;
  const isEmpty = model.entities.length === 0 && model.notes.length === 0;

  return (
    <I18nContext.Provider value={i18n}>
    <RelatedEntities.Provider value={related}>
    <div className="app">
      <header className="toolbar">
        <div className="brand" title={t.appName}>
          <img src="./favicon.svg" alt="" width={20} height={20} />
        </div>
        <input
          className="model-name"
          value={model.name}
          aria-label={t.modelName}
          onChange={(e) => update((m) => ({ ...m, name: e.target.value }), 'model-name')}
        />
        <div className="group">
          <button className="primary" onClick={addEntity} title={t.addEntityTitle}>
            {t.addEntity}
          </button>
          <button onClick={addNote} title={t.addNoteTitle}>
            {t.addNote}
          </button>
          <button onClick={store.undo} disabled={!store.canUndo} title={t.undo}>
            ↶
          </button>
          <button onClick={store.redo} disabled={!store.canRedo} title={t.redo}>
            ↷
          </button>
        </div>
        <div className="group">
          <button
            onClick={() => {
              if (isEmpty || confirm(t.newConfirm)) loadModel(emptyModel(t.newModelName));
            }}
          >
            {t.new}
          </button>
          <button onClick={() => fileInput.current?.click()} title={t.openTitle}>
            {t.open}
          </button>
          <button onClick={saveJson} title={t.saveTitle}>
            {t.save}
          </button>
          <button onClick={share} title={t.shareTitle}>
            {t.share}
          </button>
          <div className="menu">
            <button onClick={() => setExportOpen((v) => !v)} aria-expanded={exportOpen}>
              {t.export}
            </button>
            {exportOpen && (
              <div className="menu-list" role="menu">
                <button
                  onClick={() => {
                    setExportOpen(false);
                    setShowSql(true);
                  }}
                >
                  {t.exportSql}
                </button>
                <button onClick={() => exportAs('png')}>{t.exportPng}</button>
                <button onClick={() => exportAs('svg')}>{t.exportSvg}</button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    saveJson();
                  }}
                >
                  {t.exportJson}
                </button>
              </div>
            )}
          </div>
        </div>
        <span className="spacer" />
        <label className="check toolbar-check">
          <input type="checkbox" checked={showTypes} onChange={(e) => setShowTypes(e.target.checked)} />
          <span>{t.types}</span>
        </label>
        <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t.language} title={t.language}>
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button onClick={() => setTheme(NEXT_THEME[theme])} title={t.themeTitle}>
          {t.theme[theme]}
        </button>
        <button
          className={`status ${errors ? 'has-errors' : warnings ? 'has-warnings' : 'clean'}`}
          onClick={() => select(null)}
          title={t.showChecks}
        >
          {errors ? t.errors(errors) : warnings ? t.warnings(warnings) : t.noIssues}
        </button>
        <button
          onClick={() => {
            if (isEmpty || confirm(t.exampleConfirm)) loadModel(exampleModel(lang));
          }}
        >
          {t.example}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openFile(f);
            e.target.value = '';
          }}
        />
      </header>

      <main
        className="workspace"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) openFile(f);
        }}
      >
        <div className="canvas">
          <ReactFlow<AppNode, RelationshipEdgeType>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onDelete={onDelete}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onPaneClick={onPaneClick}
            zoomOnDoubleClick={false}
            deleteKeyCode={['Delete', 'Backspace']}
            selectionKeyCode="Shift"
            multiSelectionKeyCode={['Meta', 'Control']}
            snapToGrid
            snapGrid={[10, 10]}
            minZoom={0.15}
            maxZoom={2.5}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            colorMode={theme}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeStrokeWidth={2} className="minimap" />
          </ReactFlow>
          {isEmpty && (
            <div className="empty-hint">
              <p>{t.emptyHint1}</p>
              <p>
                {t.emptyHint2a}
                <button className="link" onClick={() => loadModel(exampleModel(lang))}>
                  {t.emptyHint2link}
                </button>
                {t.emptyHint2b}
              </p>
            </div>
          )}
        </div>
        <aside className="inspector">
          <Inspector
            model={model}
            selection={selection}
            issues={issues}
            update={update}
            onSelect={select}
            onDeleteEntity={(id) => {
              update((m) => deleteEntities(m, new Set([id])));
              setSelection(null);
            }}
            onDeleteRelationship={(id) => {
              update((m) => deleteRelationships(m, new Set([id])));
              setSelection(null);
            }}
            onDeleteNote={(id) => {
              update((m) => deleteNotes(m, new Set([id])));
              setSelection(null);
            }}
            onResolveManyToMany={(id) => {
              const res = resolveManyToMany(model, id);
              if (!res) return;
              update(() => res.model);
              pendingSelect.current = { kind: 'entity', id: res.junctionId };
              setSelection({ kind: 'entity', id: res.junctionId });
            }}
          />
        </aside>
      </main>

      {showSql && <SqlDialog model={model} onClose={() => setShowSql(false)} />}
    </div>
    </RelatedEntities.Provider>
    </I18nContext.Provider>
  );
}
