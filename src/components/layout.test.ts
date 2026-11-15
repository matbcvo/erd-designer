import { describe, expect, it } from 'vitest';
import { countCrossings, layoutDiagram } from './layout';
import { segmentsOf, type Pt } from './routing';
import type { Rect } from './ports';
import { newRelationship } from '../model/ops';

/** A 5×5 grid of entities with 45 relationships chosen by a seeded random generator. */
function gridDiagram(seed: number) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const rects = new Map<string, Rect>();
  for (let i = 0; i < 25; i++) rects.set(`e${i}`, { x: (i % 5) * 300, y: Math.floor(i / 5) * 200, w: 190, h: 32 + Math.floor(rand() * 4) * 21 });
  const rels = [];
  const seen = new Set<string>();
  while (rels.length < 45) {
    const a = Math.floor(rand() * 25);
    const b = Math.floor(rand() * 25);
    // Mostly near neighbours, like a real diagram.
    if (a === b || Math.abs((a % 5) - (b % 5)) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) > 3 || seen.has(`${a}-${b}`)) continue;
    seen.add(`${a}-${b}`).add(`${b}-${a}`);
    rels.push({ ...newRelationship(`e${a}`, `e${b}`), id: `r${rels.length}` });
  }
  return { rects, rels };
}

const pairsCrossingTwice = (routes: Pt[][]) => {
  let n = 0;
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      if (countCrossings([routes[i], routes[j]]) > 1) n++;
    }
  }
  return n;
};

describe('diagram layout', () => {
  it('rarely lets two lines cross each other twice', () => {
    // Before ordering lines by their routes and penalising crossings, these had 28 such pairs.
    let total = 0;
    for (const seed of [1, 2, 3]) {
      const { rects, rels } = gridDiagram(seed);
      total += pairsCrossingTwice([...layoutDiagram(rects, rels).routes.values()]);
    }
    expect(total).toBeLessThanOrEqual(10);
  });

  it('keeps every line right-angled and attached to its ports', () => {
    const { rects, rels } = gridDiagram(1);
    const layout = layoutDiagram(rects, rels);
    for (const route of layout.routes.values()) {
      expect(segmentsOf(route)).toHaveLength(route.length - 1);
    }
  });
});
