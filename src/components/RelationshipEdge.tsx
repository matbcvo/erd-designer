import { BaseEdge, EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react';
import type { MaxCardinality, MinCardinality, Relationship } from '../model/types';
import { portPoint, type Port } from './ports';
import { elbow, polylineMidpoint, polylinePath } from './routing';

export type RelationshipEdgeData = {
  relationship: Relationship;
  /** Attachment points, spread along entity sides so lines never share a spot. */
  ports?: { source: Port; target: Port };
  /** Right-angle route around other entities. */
  route?: Pt[];
};
export type RelationshipEdgeType = Edge<RelationshipEdgeData, 'relationship'>;

interface Pt {
  x: number;
  y: number;
}

function rectOf(node: InternalNode) {
  const { x, y } = node.internals.positionAbsolute;
  const w = node.measured.width ?? 200;
  const h = node.measured.height ?? 100;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/**
 * Crow's foot symbol at point p on an entity border. u points away from the entity along the line.
 * Nearest the entity: maximum (bar = one, fork = many). Further out: minimum (bar = 1, circle = 0).
 */
function symbol(p: Pt, u: Pt, max: MaxCardinality, min: MinCardinality) {
  const n = { x: -u.y, y: u.x };
  const at = (d: number, s = 0) => ({ x: p.x + u.x * d + n.x * s, y: p.y + u.y * d + n.y * s });
  const seg = (a: Pt, b: Pt) => `M${a.x},${a.y} L${b.x},${b.y}`;
  const parts: string[] = [];
  if (max === 'many') {
    parts.push(seg(at(0, 9), at(15)), seg(at(0, -9), at(15)));
  } else {
    parts.push(seg(at(9, 7), at(9, -7)));
  }
  let circle: Pt | null = null;
  if (min === 1) {
    parts.push(seg(at(20, 7), at(20, -7)));
  } else {
    circle = at(26);
  }
  return { d: parts.join(' '), circle };
}

/** Bends are slightly rounded. */
const CORNER_RADIUS = 10;

export function RelationshipEdge({ id, source, target, data, selected, markerEnd, style }: EdgeProps<RelationshipEdgeType>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t || !data) return null;
  const rel = data.relationship;
  const sr = rectOf(s);
  const tr = rectOf(t);

  const ports = data.ports ?? { source: { side: 'right' as const, f: 0.5 }, target: { side: 'left' as const, f: 0.5 } };
  const A = portPoint(sr, ports.source);
  const B = portPoint(tr, ports.target);
  const route = data.route;
  const p1 = { ...(route ? route[0] : A.p) };
  const p2 = { ...(route ? route[route.length - 1] : B.p) };
  const u1: Pt = A.u;
  const u2: Pt = B.u;
  let path: string;
  let label: Pt;

  if (source === target) {
    // Self-reference: a compact loop around the top-right corner.
    const inset = Math.min(32, sr.w / 3, sr.h / 3);
    const reach = 46;
    const a0 = { x: sr.x + sr.w - inset, y: sr.y };
    const b0 = { x: sr.x + sr.w, y: sr.y + inset };
    p1.x = a0.x;
    p1.y = a0.y;
    p2.x = b0.x;
    p2.y = b0.y;
    const top = a0.y - reach;
    const right = b0.x + reach;
    const pts = [a0, { x: a0.x, y: top }, { x: right, y: top }, { x: right, y: b0.y }, b0];
    path = polylinePath(pts, CORNER_RADIUS);
    label = { x: right, y: top };
  } else {
    // Routes are computed for the whole diagram (see App); fall back to a simple elbow.
    const pts = route ?? elbow(p1, u1, p2, u2);
    path = polylinePath(pts, CORNER_RADIUS);
    label = polylineMidpoint(pts);
  }

  const a = symbol(p1, u1, rel.source.max, rel.source.min);
  const b = symbol(p2, u2, rel.target.max, rel.target.min);
  const color = selected ? 'var(--accent)' : 'var(--edge)';
  const lineStyle = { ...style, stroke: color, strokeWidth: selected ? 2 : 1.5, strokeDasharray: rel.identifying ? undefined : '6 4' };
  const symStyle = { stroke: color, strokeWidth: selected ? 2 : 1.5, fill: 'none' };

  return (
    <>
      <BaseEdge id={id} path={path} style={lineStyle} markerEnd={markerEnd} interactionWidth={18} />
      <path d={a.d} style={symStyle} />
      <path d={b.d} style={symStyle} />
      {a.circle && <circle cx={a.circle.x} cy={a.circle.y} r={5} style={{ ...symStyle, fill: 'var(--canvas)' }} />}
      {b.circle && <circle cx={b.circle.x} cy={b.circle.y} r={5} style={{ ...symStyle, fill: 'var(--canvas)' }} />}
      {rel.name && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label${selected ? ' selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
          >
            {rel.name}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
