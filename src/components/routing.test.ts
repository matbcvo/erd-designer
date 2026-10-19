import { describe, expect, it } from 'vitest';
import { nudgeOverlaps, routeAround, type Pt } from './routing';
import type { Rect } from './ports';

const hits = (a: Pt, b: Pt, r: Rect) => {
  // Orthogonal segment strictly inside rectangle?
  if (Math.abs(a.y - b.y) < 0.5) return a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w;
  return a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h;
};

describe('router', () => {
  const left: Rect = { x: 0, y: 0, w: 150, h: 100 };
  const middle: Rect = { x: 300, y: -20, w: 150, h: 140 };
  const right: Rect = { x: 600, y: 0, w: 150, h: 100 };
  const p1 = { x: 150, y: 50 };
  const p2 = { x: 600, y: 50 };
  const u1 = { x: 1, y: 0 };
  const u2 = { x: -1, y: 0 };

  it('routes around an entity with right angles only', () => {
    const route = routeAround(p1, u1, p2, u2, [left, middle, right])!;
    expect(route).not.toBeNull();
    expect(route[0]).toEqual(p1);
    expect(route[route.length - 1]).toEqual(p2);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      expect(Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5).toBe(true);
      expect(hits(a, b, middle)).toBe(false);
    }
  });

  it('nudges overlapping segments apart', () => {
    const r1 = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 50 }, { x: 110, y: 50 }];
    const r2 = [{ x: 20, y: 0 }, { x: 20, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 60 }, { x: 110, y: 60 }];
    nudgeOverlaps([r1, r2]);
    expect(r1[2].y).not.toBe(r2[2].y);
  });
});

describe('router with entities close together', () => {
  it('still routes around an entity sitting just above the target', () => {
    // Source on the left; target below-right; a blocker sits right on top of the target (8px gap).
    const src: Rect = { x: 0, y: 300, w: 150, h: 100 };
    const target: Rect = { x: 400, y: 300, w: 150, h: 100 };
    const blocker: Rect = { x: 380, y: 192, w: 190, h: 100 };
    // Line leaves the source's top and enters the target's top, right under the blocker.
    const p1 = { x: 75, y: 300 };
    const p2 = { x: 475, y: 300 };
    const route = routeAround(p1, { x: 0, y: -1 }, p2, { x: 0, y: -1 }, [src, target, blocker])!;
    expect(route).not.toBeNull();
    for (let i = 1; i < route.length; i++) expect(hits(route[i - 1], route[i], blocker)).toBe(false);
  });
});
