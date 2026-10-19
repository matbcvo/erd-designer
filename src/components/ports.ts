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

/**
 * Assign every relationship end a port so that lines sharing an entity side are spread
 * evenly along it, ordered by the position of the entity at the other end (avoids crossings).
 */
export function computePorts(rects: Map<string, Rect>, relationships: Relationship[]): Map<string, { source: Port; target: Port }> {
  type Slot = { relId: string; end: 'source' | 'target'; key: number; tie: number };
  const groups = new Map<string, Slot[]>();
  const sides = new Map<string, { source: Side; target: Side }>();
  const add = (entityId: string, side: Side, slot: Slot) => {
    const k = `${entityId}|${side}`;
    const g = groups.get(k);
    if (g) g.push(slot);
    else groups.set(k, [slot]);
  };

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
    const along = (side: Side, other: Rect) => (side === 'top' || side === 'bottom' ? cx(other) : cy(other));
    add(rel.source.entityId, sa, { relId: rel.id, end: 'source', key: along(sa, b), tie: index });
    add(rel.target.entityId, sb, { relId: rel.id, end: 'target', key: along(sb, a), tie: index });
  });

  const fractions = new Map<string, number>(); // `${relId}|${end}` -> f
  for (const slots of groups.values()) {
    slots.sort((p, q) => p.key - q.key || p.tie - q.tie);
    slots.forEach((s, i) => fractions.set(`${s.relId}|${s.end}`, (i + 1) / (slots.length + 1)));
  }

  const out = new Map<string, { source: Port; target: Port }>();
  for (const [relId, s] of sides) {
    out.set(relId, {
      source: { side: s.source, f: fractions.get(`${relId}|source`) ?? 0.5 },
      target: { side: s.target, f: fractions.get(`${relId}|target`) ?? 0.5 },
    });
  }
  return out;
}

/** Absolute point and outward normal for a port on a rectangle. */
export function portPoint(r: Rect, port: Port): { p: { x: number; y: number }; u: { x: number; y: number } } {
  const padX = Math.min(14, r.w / 4);
  const padY = Math.min(10, r.h / 4);
  const fx = r.x + padX + (r.w - 2 * padX) * port.f;
  const fy = r.y + padY + (r.h - 2 * padY) * port.f;
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
