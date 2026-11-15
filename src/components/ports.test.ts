import { describe, expect, it } from 'vitest';
import { computePorts, sideCapacity, type Rect } from './ports';
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

  it('moves lines that do not fit on a side to the neighbouring sides', () => {
    const hub: Rect = { x: 0, y: 260, w: 230, h: 90 };
    const rects = new Map<string, Rect>([['hub', hub]]);
    const rels = [0, 1, 2, 3, 4].map((i) => {
      rects.set(`c${i}`, { x: 480, y: i * 150, w: 220, h: 80 });
      return { ...newRelationship('hub', `c${i}`), id: `r${i}` };
    });
    const ports = computePorts(rects, rels);
    const hubSides = rels.map((r) => ports.get(r.id)!.source.side);
    expect(hubSides.filter((s) => s === 'right').length).toBe(sideCapacity(hub, 'right'));
    // The highest child turns to the top, the lowest to the bottom; the middle one goes straight across.
    expect(hubSides[0]).toBe('top');
    expect(hubSides[4]).toBe('bottom');
    expect(hubSides[2]).toBe('right');
    // Of the two turned to the bottom, the one going further down is further from the corner.
    expect(ports.get('r4')!.source.f).toBeLessThan(ports.get('r3')!.source.f);
    // No two lines share a side position.
    const spots = rels.map((r) => `${ports.get(r.id)!.source.side}:${ports.get(r.id)!.source.f}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('also spreads several lines to a level entity on a short side', () => {
    const rects = new Map<string, Rect>([
      ['a', { x: 0, y: 0, w: 160, h: 30 }],
      ['b', { x: 600, y: 0, w: 160, h: 30 }],
    ]);
    const rels = [{ ...newRelationship('a', 'b'), id: 'r1' }, { ...newRelationship('b', 'a'), id: 'r2' }];
    const ports = computePorts(rects, rels);
    const aSides = [ports.get('r1')!.source.side, ports.get('r2')!.target.side];
    expect(new Set(aSides).size).toBe(2);
  });
});
