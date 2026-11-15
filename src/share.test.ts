import { describe, expect, it } from 'vitest';
import { decodeModel, encodeModel } from './share';
import { exampleModel } from './model/example';

describe('share links', () => {
  it('round-trip a model through the link text', async () => {
    const model = { ...exampleModel(), notes: [{ id: 'n1', text: 'Author: Jane\nDate: today', x: 0, y: 0, bold: true }] };
    const data = await encodeModel(model);
    expect(data).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeModel(data)).toEqual(model);
  });

  it('reject broken links', async () => {
    await expect(decodeModel('not-a-model')).rejects.toThrow();
  });
});
