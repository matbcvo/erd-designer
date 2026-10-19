import { describe, expect, it } from 'vitest';
import { computePorts, type Rect } from './ports';
import { newRelationship } from '../model/ops';

describe('ports', () => {
  it('spreads lines sharing a side and orders them by the other end', () => {
    const rects = new Map<string, Rect>([
      ['a', { x: 0, y: 0, w: 200, h: 100 }],
      ['b', { x: 400, y: -200, w: 200, h: 100 }], // up-right
      ['c', { x: 400, y: 200, w: 200, h: 100 }], // down-right
    ]);
    const r1 = { ...newRelationship('a', 'c'), id: 'r1' };
    const r2 = { ...newRelationship('a', 'b'), id: 'r2' };
    const ports = computePorts(rects, [r1, r2]);
    expect(ports.get('r1')!.source.side).toBe('right');
    expect(ports.get('r2')!.source.side).toBe('right');
    // b is higher, so its line attaches above c's line.
    expect(ports.get('r2')!.source.f).toBeLessThan(ports.get('r1')!.source.f);
    expect(ports.get('r1')!.target).toEqual({ side: 'left', f: 0.5 });
  });

  it('uses top and bottom when entities are stacked', () => {
    const rects = new Map<string, Rect>([
      ['a', { x: 0, y: 0, w: 200, h: 100 }],
      ['b', { x: 20, y: 300, w: 200, h: 100 }],
    ]);
    const p = computePorts(rects, [{ ...newRelationship('a', 'b'), id: 'r' }]).get('r')!;
    expect([p.source.side, p.target.side]).toEqual(['bottom', 'top']);
  });
});
