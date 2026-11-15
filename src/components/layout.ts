import type { Relationship } from '../model/types';
import { computePorts, portPoint, type Port, type Rect } from './ports';
import { elbow, nudgeOverlaps, routeAround, segmentsOf, type Pt, type Seg } from './routing';

type Ports = Map<string, { source: Port; target: Port }>;

export interface Layout {
  ports: Ports;
  routes: Map<string, Pt[]>;
  /** Centre of each relationship's name label, and whether it runs along a vertical stretch of line. */
  labels: Map<string, LabelSpot>;
}

export type LabelSpot = Pt & { vertical: boolean };

/** Width in px of a label's text; the default is a rough estimate for the 11.5px italic label font. */
export type MeasureText = (text: string) => number;
const roughMeasure: MeasureText = (text) => text.length * 6.2;

function routeAll(rects: Map<string, Rect>, relationships: Relationship[], ports: Ports): Map<string, Pt[]> {
  // Every line is routed with right angles around the entities and away from other lines.
  const routes = new Map<string, Pt[]>();
  const occupied: Seg[] = [];
  for (const r of relationships) {
    if (r.source.entityId === r.target.entityId) continue;
    const sr = rects.get(r.source.entityId);
    const tr = rects.get(r.target.entityId);
    const pr = ports.get(r.id);
    if (!sr || !tr || !pr) continue;
    const A = portPoint(sr, pr.source);
    const B = portPoint(tr, pr.target);
    const route = routeAround(A.p, A.u, B.p, B.u, [...rects.values()], occupied) ?? elbow(A.p, A.u, B.p, B.u);
    routes.set(r.id, route);
    occupied.push(...segmentsOf(route));
  }
  nudgeOverlaps([...routes.values()]);
  return routes;
}

function crossingsBetween(a: Seg[], b: Seg[]): number {
  let n = 0;
  for (const s of a) {
    for (const t of b) {
      if (s.horizontal === t.horizontal) continue;
      const [h, v] = s.horizontal ? [s, t] : [t, s];
      if (v.at > h.from + 0.5 && v.at < h.to - 0.5 && h.at > v.from + 0.5 && h.at < v.to - 0.5) n++;
    }
  }
  return n;
}

/** Number of points where two different lines cross. */
export function countCrossings(routes: Iterable<Pt[]>): number {
  const all = [...routes].map(segmentsOf);
  let n = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) n += crossingsBetween(all[i], all[j]);
  return n;
}

/** Crossings that involve at least one of the given lines. */
function crossingsOf(ids: Set<string>, segs: Map<string, Seg[]>): number {
  let n = 0;
  for (const id of ids) {
    for (const [other, s] of segs) {
      if (other === id || (ids.has(other) && other < id)) continue;
      n += crossingsBetween(segs.get(id)!, s);
    }
  }
  return n;
}

/** Which way a route turns after leaving a port, and how far out: lines are ordered on a side by this. */
function exitKey(pts: Pt[], side: Port['side']): number {
  if (pts.length <= 2) return 0; // straight across
  const alongX = side === 'top' || side === 'bottom';
  const turn = alongX ? pts[2].x - pts[1].x : pts[2].y - pts[1].y;
  const dist = alongX ? Math.abs(pts[1].y - pts[0].y) : Math.abs(pts[1].x - pts[0].x);
  // Turning toward the low end (up / left): at that end, earliest turn outermost. Likewise for the high end.
  if (turn < -0.5) return -1e6 + dist;
  if (turn > 0.5) return 1e6 - dist;
  return 0;
}

/** Move the end of a route to a new port point on the same side, keeping right angles. */
function moveEnd(route: Pt[], atStart: boolean, p: Pt, alongX: boolean): Pt[] {
  const pts = atStart ? route.map((q) => ({ ...q })) : route.map((q) => ({ ...q })).reverse();
  if (pts.length === 2) {
    // Straight line: add a jog halfway.
    const [a, b] = pts;
    const mid = alongX ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
    const jog = alongX ? [{ x: p.x, y: mid }, { x: b.x, y: mid }] : [{ x: mid, y: p.y }, { x: mid, y: b.y }];
    pts.splice(0, 2, p, ...jog, b);
  } else {
    if (alongX) pts[1].x = p.x;
    else pts[1].y = p.y;
    pts[0] = p;
  }
  return atStart ? pts : pts.reverse();
}

/**
 * Lines sharing an entity side are first ordered by where the entity at the other end is.
 * Once routed, re-order them by where their routes actually go, so neighbouring lines don't
 * cross just outside the entity. Each side's new order is kept only if it doesn't add crossings.
 */
function untangleEnds(rects: Map<string, Rect>, relationships: Relationship[], layout: Omit<Layout, 'labels'>): Omit<Layout, 'labels'> {
  const ports: Ports = new Map([...layout.ports].map(([id, p]) => [id, { ...p }]));
  const routes = new Map(layout.routes);
  type End = { relId: string; end: 'source' | 'target'; entityId: string };
  const groups = new Map<string, End[]>();
  for (const r of relationships) {
    const pr = ports.get(r.id);
    if (!pr || !routes.has(r.id)) continue;
    for (const end of ['source', 'target'] as const) {
      const entityId = r[end].entityId;
      const k = `${entityId}|${pr[end].side}`;
      const g = groups.get(k);
      if (g) g.push({ relId: r.id, end, entityId });
      else groups.set(k, [{ relId: r.id, end, entityId }]);
    }
  }
  const segs = new Map([...routes].map(([id, r]) => [id, segmentsOf(r)]));
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const side = ports.get(g[0].relId)![g[0].end].side;
    const alongX = side === 'top' || side === 'bottom';
    const keyOf = (e: End) => {
      const route = routes.get(e.relId)!;
      return exitKey(e.end === 'source' ? route : [...route].reverse(), side);
    };
    const fOf = (e: End) => ports.get(e.relId)![e.end].f;
    const current = [...g].sort((a, b) => fOf(a) - fOf(b));
    const wanted = [...g].sort((a, b) => keyOf(a) - keyOf(b) || fOf(a) - fOf(b));
    if (wanted.every((e, i) => e === current[i])) continue;
    const fs = current.map(fOf);
    const trial = new Map<string, Pt[]>();
    const trialPorts = new Map<string, { source: Port; target: Port }>();
    wanted.forEach((e, i) => {
      const port = { side, f: fs[i] };
      const p = portPoint(rects.get(e.entityId)!, port).p;
      trial.set(e.relId, moveEnd(trial.get(e.relId) ?? routes.get(e.relId)!, e.end === 'source', p, alongX));
      const pr = trialPorts.get(e.relId) ?? { ...ports.get(e.relId)! };
      pr[e.end] = port;
      trialPorts.set(e.relId, pr);
    });
    const ids = new Set(trial.keys());
    const before = crossingsOf(ids, segs);
    const trialSegs = new Map(segs);
    for (const [id, r] of trial) trialSegs.set(id, segmentsOf(r));
    if (crossingsOf(ids, trialSegs) <= before) {
      for (const [id, r] of trial) {
        routes.set(id, r);
        segs.set(id, trialSegs.get(id)!);
      }
      for (const [id, pr] of trialPorts) ports.set(id, { ...ports.get(id)!, ...pr });
    }
  }
  return { ports, routes };
}

type Box = { x: number; y: number; w: number; h: number };
const boxesOverlap = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const boxGap = (a: Box, b: Box) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));

const LABEL_H = 16;
const LABEL_PAD = 10; // horizontal padding of the label plate
const LABEL_GAP = 12; // wanted space between two labels
const SYMBOL_REACH = 40; // keep labels this far (along the line) from its ends, where the crow's feet are
const LINE_CLEARANCE = 12; // wanted space between a label and other lines
const BESIDE_COST = 40; // a label beside its line reads slightly less clearly than one on it
const VERTICAL_COST = 150; // turned text is harder to read: only turn a label when a horizontal one won't fit

/**
 * Place every relationship name on its own line: near the middle where possible, but apart from
 * other labels and off entities, crow's foot symbols and other lines.
 */
function placeLabels(rects: Map<string, Rect>, relationships: Relationship[], layout: Omit<Layout, 'labels'>, measure: MeasureText): Map<string, LabelSpot> {
  const labels = new Map<string, LabelSpot>();
  const placed: Box[] = [];
  const entities = [...rects.values()];
  // Crow's foot symbols of every line end.
  const symbols: Box[] = [];
  for (const r of relationships) {
    const pr = layout.ports.get(r.id);
    if (!pr || !layout.routes.has(r.id)) continue;
    for (const end of ['source', 'target'] as const) {
      const rect = rects.get(r[end].entityId);
      if (!rect) continue;
      const { p, u } = portPoint(rect, pr[end]);
      const x2 = p.x + u.x * 34;
      const y2 = p.y + u.y * 34;
      symbols.push({ x: Math.min(p.x, x2) - (u.x ? 0 : 11), y: Math.min(p.y, y2) - (u.y ? 0 : 11), w: Math.abs(x2 - p.x) || 22, h: Math.abs(y2 - p.y) || 22 });
    }
  }
  // Self-reference labels sit at the corner of their loop (see RelationshipEdge).
  for (const r of relationships) {
    const rect = rects.get(r.source.entityId);
    if (r.source.entityId !== r.target.entityId || !r.name.trim() || !rect) continue;
    const w = measure(r.name) + LABEL_PAD;
    placed.push({ x: rect.x + rect.w + 46 - w / 2, y: rect.y - 46 - LABEL_H / 2, w, h: LABEL_H });
  }
  const segs = new Map([...layout.routes].map(([id, pts]) => [id, segmentsOf(pts)]));

  type Item = { id: string; name: string; pts: Pt[]; lens: number[]; total: number };
  const items: Item[] = [];
  for (const r of relationships) {
    const pts = layout.routes.get(r.id);
    if (!pts || !r.name.trim()) continue;
    const lens = pts.slice(1).map((p, i) => Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y));
    items.push({ id: r.id, name: r.name, pts, lens, total: lens.reduce((a, b) => a + b, 0) });
  }
  // Lines with the least room choose first.
  items.sort((a, b) => a.total - b.total);

  /** Point at distance d along the line, whether that stretch is horizontal, and the room left before its bends. */
  const pointAt = (it: Item, d: number): { p: Pt; horizontal: boolean; room: number } => {
    for (let i = 0; i < it.lens.length; i++) {
      if (d <= it.lens[i] || i === it.lens.length - 1) {
        const t = it.lens[i] ? Math.min(1, d / it.lens[i]) : 0;
        const a = it.pts[i];
        const b = it.pts[i + 1];
        const room = Math.min(d, it.lens[i] - d);
        return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, horizontal: Math.abs(a.y - b.y) < 0.5, room };
      }
      d -= it.lens[i];
    }
    return { p: it.pts[it.pts.length - 1], horizontal: true, room: 0 };
  };
  const otherSegs = (it: Item, area: Box) => {
    const out: Box[] = [];
    for (const [id, ss] of segs) {
      if (id === it.id) continue;
      for (const s of ss) {
        const sb = s.horizontal ? { x: s.from, y: s.at, w: s.to - s.from, h: 0 } : { x: s.at, y: s.from, w: 0, h: s.to - s.from };
        if (boxesOverlap(sb, area)) out.push(sb);
      }
    }
    return out;
  };

  for (const it of items) {
    const w = measure(it.name) + LABEL_PAD;
    // Only things near this line can matter.
    const xs = it.pts.map((p) => p.x);
    const ys = it.pts.map((p) => p.y);
    const reach = w / 2 + LABEL_H + 40;
    const area = { x: Math.min(...xs) - reach, y: Math.min(...ys) - reach, w: Math.max(...xs) - Math.min(...xs) + 2 * reach, h: Math.max(...ys) - Math.min(...ys) + 2 * reach };
    const near = <T extends Box>(list: T[]) => list.filter((b) => boxesOverlap(b, area));
    const nearPlaced = near(placed);
    const nearEntities = near(entities);
    const nearSymbols = near(symbols);
    const lines = otherSegs(it, area);

    const lo = Math.min(SYMBOL_REACH, it.total / 2);
    const hi = it.total - lo;
    let best: { cost: number; p: Pt; box: Box; vertical: boolean } | null = null;
    for (let d = lo; d <= hi + 0.01; d += Math.max(4, Math.min(8, (hi - lo) / 2 || 8))) {
      const at = pointAt(it, d);
      // Labels are horizontal; on a vertical stretch one may be turned to run along the line when a
      // horizontal label would run into nearby lines or labels.
      const spots: [Pt, number, boolean][] = [];
      for (const vertical of at.horizontal ? [false] : [false, true]) {
        // Extent of the label along / across the line here.
        const alongLine = vertical || at.horizontal ? w : LABEL_H;
        const across = vertical || at.horizontal ? LABEL_H : w;
        // Prefer spots where the label fits on this straight stretch rather than hanging over a bend.
        const extra = Math.max(0, alongLine / 2 - at.room) * 3 + (vertical ? VERTICAL_COST : 0);
        // On the line, or just beside it when the line itself is busy.
        const beside = across / 2 + 3;
        const side = (k: number): Pt => (at.horizontal ? { x: at.p.x, y: at.p.y + k * beside } : { x: at.p.x + k * beside, y: at.p.y });
        spots.push([at.p, extra, vertical], [side(-1), extra + BESIDE_COST, vertical], [side(1), extra + BESIDE_COST + 1, vertical]);
      }
      for (const [p, extra, vertical] of spots) {
        const bw = vertical ? LABEL_H : w;
        const bh = vertical ? w : LABEL_H;
        const box = { x: p.x - bw / 2, y: p.y - bh / 2, w: bw, h: bh };
        let cost = Math.abs(d - it.total / 2) * 0.5 + extra;
        if (best && cost >= best.cost) continue;
        for (const o of nearPlaced) {
          if (boxesOverlap(box, o, LABEL_GAP)) cost += 2000;
          else cost += Math.max(0, 40 - boxGap(box, o)) * 5;
        }
        for (const e of nearEntities) if (boxesOverlap(box, e, 2)) cost += 2000;
        for (const s of nearSymbols) if (boxesOverlap(box, s)) cost += 800;
        for (const sb of lines) {
          // Covering another line hides it (and any crossing on it); running close beside one is cramped.
          if (boxesOverlap(box, sb)) cost += 300;
          else cost += Math.max(0, LINE_CLEARANCE - boxGap(box, sb)) * 15;
        }
        if (!best || cost < best.cost) best = { cost, p, box, vertical };
      }
    }
    if (best) {
      labels.set(it.id, { ...best.p, vertical: best.vertical });
      placed.push(best.box);
    }
  }
  return labels;
}

/** Attachment ports, right-angle routes and label positions for every relationship line (self-references excluded). */
export function layoutDiagram(rects: Map<string, Rect>, relationships: Relationship[], measure: MeasureText = roughMeasure): Layout {
  const ports = computePorts(rects, relationships);
  const layout = untangleEnds(rects, relationships, { ports, routes: routeAll(rects, relationships, ports) });
  const labels = placeLabels(rects, relationships, layout, measure);
  return { ...layout, labels };
}
