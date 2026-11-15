import type { Relationship } from '../model/types';

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** Where a line attaches: a side of the entity and a fraction (0..1) along it. */
export interface Port {
  side: Side;
  f: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;

/** Pick the sides two entities should face each other with: across the larger gap between them. */
export function facingSides(a: Rect, b: Rect): [Side, Side] {
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (gapX >= gapY) return cx(b) >= cx(a) ? ['right', 'left'] : ['left', 'right'];
  return cy(b) >= cy(a) ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Room a line needs in front of a side: stub for the crow's foot plus clearance. */
const EXIT_CLEARANCE = 70;

/** Is the area just outside this side of `r` occupied by one of `others`? */
export function sideBlocked(r: Rect, side: Side, others: Rect[]): boolean {
  const c = EXIT_CLEARANCE;
  const zone: Rect =
    side === 'top'
      ? { x: r.x, y: r.y - c, w: r.w, h: c }
      : side === 'bottom'
        ? { x: r.x, y: r.y + r.h, w: r.w, h: c }
        : side === 'left'
          ? { x: r.x - c, y: r.y, w: c, h: r.h }
          : { x: r.x + r.w, y: r.y, w: c, h: r.h };
  return others.some((o) => o.x < zone.x + zone.w && o.x + o.w > zone.x && o.y < zone.y + zone.h && o.y + o.h > zone.y);
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Preferred side first; then the two perpendicular sides (nearest the other entity first); opposite side last. */
function sideCandidates(preferred: Side, self: Rect, other: Rect): Side[] {
  const perp: Side[] =
    preferred === 'top' || preferred === 'bottom'
      ? cx(other) >= cx(self)
        ? ['right', 'left']
        : ['left', 'right']
      : cy(other) >= cy(self)
        ? ['bottom', 'top']
        : ['top', 'bottom'];
  return [preferred, ...perp, OPPOSITE[preferred]];
}

function pickSide(preferred: Side, self: Rect, other: Rect, blockers: Rect[]): Side {
  return sideCandidates(preferred, self, other).find((s) => !sideBlocked(self, s, blockers)) ?? preferred;
}

/** How far from the corner a self-reference loop leaves and enters its entity. */
const SELF_INSET = 32;

/** Minimum distance between two lines on one side, so their crow's foot symbols don't touch. */
const MIN_PORT_GAP = 20;

const padX = (r: Rect) => Math.min(14, r.w / 4);
const padY = (r: Rect) => Math.min(10, r.h / 4);
const horizontal = (side: Side) => side === 'top' || side === 'bottom';

/** How many lines fit on a side with at least MIN_PORT_GAP between them (ports sit at i / (n + 1)). */
export function sideCapacity(r: Rect, side: Side): number {
  const length = horizontal(side) ? r.w - 2 * padX(r) : r.h - 2 * padY(r);
  return Math.max(1, Math.floor(length / MIN_PORT_GAP - 1));
}

/**
 * Assign every relationship end a port so that lines sharing an entity side are spread
 * evenly along it, ordered by the position of the entity at the other end (avoids crossings).
 * When a side gets more lines than fit, the outermost ones move round the corner to the
 * neighbouring side, toward the entity they lead to.
 */
export function computePorts(rects: Map<string, Rect>, relationships: Relationship[]): Map<string, { source: Port; target: Port }> {
  type Slot = { relId: string; end: 'source' | 'target'; key: number; tie: number; other?: string };
  const groups = new Map<string, Slot[]>();
  const sides = new Map<string, { source: Side; target: Side }>();
  const add = (entityId: string, side: Side, slot: Slot) => {
    const k = `${entityId}|${side}`;
    const g = groups.get(k);
    if (g) g.push(slot);
    else groups.set(k, [slot]);
  };

  const along = (side: Side, other: Rect) => (horizontal(side) ? cx(other) : cy(other));

  relationships.forEach((rel, index) => {
    const a = rects.get(rel.source.entityId);
    const b = rects.get(rel.target.entityId);
    if (!a || !b) return;
    if (rel.source.entityId === rel.target.entityId) {
      // Self-reference: from the top side (right end) to the right side (top end).
      sides.set(rel.id, { source: 'top', target: 'right' });
      add(rel.source.entityId, 'top', { relId: rel.id, end: 'source', key: Infinity, tie: index });
      add(rel.source.entityId, 'right', { relId: rel.id, end: 'target', key: -Infinity, tie: -index });
      return;
    }
    const blockers = [...rects].filter(([id]) => id !== rel.source.entityId && id !== rel.target.entityId).map(([, r]) => r);
    const [fa, fb] = facingSides(a, b);
    // Avoid sides with another entity right in front of them.
    const sa = pickSide(fa, a, b, blockers);
    const sb = pickSide(fb, b, a, blockers);
    sides.set(rel.id, { source: sa, target: sb });
    add(rel.source.entityId, sa, { relId: rel.id, end: 'source', key: along(sa, b), tie: index, other: rel.target.entityId });
    add(rel.target.entityId, sb, { relId: rel.id, end: 'target', key: along(sb, a), tie: index, other: rel.source.entityId });
  });

  // Move overflow from crowded sides to the neighbouring sides, fullest sides first.
  const keys = [...groups.keys()].sort((p, q) => groups.get(q)!.length - groups.get(p)!.length);
  for (const k of keys) {
    const [entityId, side] = k.split('|') as [string, Side];
    const self = rects.get(entityId)!;
    const slots = groups.get(k)!;
    const cap = sideCapacity(self, side);
    if (slots.length <= cap) continue;
    slots.sort((p, q) => p.key - q.key || p.tie - q.tie);
    // Low end of a left/right side turns to the top; low end of a top/bottom side turns to the left.
    const [lowSide, highSide]: [Side, Side] = horizontal(side) ? ['left', 'right'] : ['top', 'bottom'];
    const centre = horizontal(side) ? cx(self) : cy(self);
    const canTake = (slot: Slot, to: Side, towardLow: boolean) => {
      if (slot.other === undefined) return false; // self-reference keeps its fixed sides
      // Only turn toward the side the other entity is on (either side when it's level).
      if (towardLow ? slot.key > centre : slot.key < centre) return false;
      const blockers = [...rects].filter(([id]) => id !== entityId && id !== slot.other).map(([, r]) => r);
      if (sideBlocked(self, to, blockers)) return false;
      return (groups.get(`${entityId}|${to}`)?.length ?? 0) < sideCapacity(self, to);
    };
    // Lines moved first lead furthest away, so they take the spots furthest from the corner (no crossings).
    const cornerAtHighEnd = side === 'right' || side === 'bottom';
    let moved = 0;
    const move = (slot: Slot, to: Side) => {
      moved++;
      add(entityId, to, { ...slot, key: along(to, rects.get(slot.other!)!), tie: cornerAtHighEnd ? moved - 1e6 : 1e6 - moved });
      const s = sides.get(slot.relId)!;
      sides.set(slot.relId, { ...s, [slot.end]: to });
    };
    while (slots.length > cap) {
      const low = slots[0];
      const high = slots[slots.length - 1];
      // Move whichever end is further from the middle first.
      const order: [Slot, Side, boolean][] =
        centre - low.key >= high.key - centre ? [[low, lowSide, true], [high, highSide, false]] : [[high, highSide, false], [low, lowSide, true]];
      const pick = order.find(([slot, to, towardLow]) => canTake(slot, to, towardLow));
      if (!pick) break;
      slots.splice(slots.indexOf(pick[0]), 1);
      move(pick[0], pick[1]);
    }
  }

  const fractions = new Map<string, number>(); // `${relId}|${end}` -> f
  for (const slots of groups.values()) {
    slots.sort((p, q) => p.key - q.key || p.tie - q.tie);
    slots.forEach((s, i) => fractions.set(`${s.relId}|${s.end}`, (i + 1) / (slots.length + 1)));
  }

  const out = new Map<string, { source: Port; target: Port }>();
  for (const [relId, s] of sides) {
    let f1 = fractions.get(`${relId}|source`) ?? 0.5;
    let f2 = fractions.get(`${relId}|target`) ?? 0.5;
    const rel = relationships.find((r) => r.id === relId);
    const rect = rel && rel.source.entityId === rel.target.entityId ? rects.get(rel.source.entityId) : undefined;
    if (rect) {
      // A self-reference loop stays tucked into the top-right corner (it is already the
      // outermost line on both sides, so moving it toward the corner keeps the order).
      f1 = Math.max(f1, 1 - SELF_INSET / (rect.w - 2 * padX(rect)));
      f2 = Math.min(f2, SELF_INSET / (rect.h - 2 * padY(rect)));
    }
    out.set(relId, { source: { side: s.source, f: Math.min(1, f1) }, target: { side: s.target, f: Math.max(0, f2) } });
  }
  return out;
}

/** Absolute point and outward normal for a port on a rectangle. */
export function portPoint(r: Rect, port: Port): { p: { x: number; y: number }; u: { x: number; y: number } } {
  const fx = r.x + padX(r) + (r.w - 2 * padX(r)) * port.f;
  const fy = r.y + padY(r) + (r.h - 2 * padY(r)) * port.f;
  switch (port.side) {
    case 'top':
      return { p: { x: fx, y: r.y }, u: { x: 0, y: -1 } };
    case 'bottom':
      return { p: { x: fx, y: r.y + r.h }, u: { x: 0, y: 1 } };
    case 'left':
      return { p: { x: r.x, y: fy }, u: { x: -1, y: 0 } };
    case 'right':
      return { p: { x: r.x + r.w, y: fy }, u: { x: 1, y: 0 } };
  }
}
