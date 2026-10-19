import type { Attribute, Entity, Model, RefAction, Relationship, RelationshipEnd } from './types';
import { syncForeignKeys, uid } from './ops';

const ACTIONS: RefAction[] = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL'];

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function parseEnd(v: unknown): RelationshipEnd {
  const o = obj(v);
  return { entityId: str(o.entityId), min: o.min === 0 ? 0 : 1, max: o.max === 'many' ? 'many' : 'one' };
}

/** Parse and sanitise a model loaded from a file or localStorage. Throws on input that isn't a model. */
export function parseModel(text: string): Model {
  const raw = obj(JSON.parse(text));
  if (!Array.isArray(raw.entities)) throw new Error('This file is not an ERD Designer model (missing "entities").');

  const entities: Entity[] = raw.entities.map((ev): Entity => {
    const e = obj(ev);
    const attributes: Attribute[] = (Array.isArray(e.attributes) ? e.attributes : []).map((av): Attribute => {
      const a = obj(av);
      const fk = obj(a.fk);
      return {
        id: str(a.id) || uid('a'),
        name: str(a.name),
        type: str(a.type),
        pk: a.pk === true,
        nullable: a.nullable !== false,
        unique: a.unique === true,
        defaultValue: str(a.defaultValue) || undefined,
        comment: str(a.comment) || undefined,
        fk: a.fk ? { relationshipId: str(fk.relationshipId), refAttributeId: str(fk.refAttributeId) } : undefined,
      };
    });
    return {
      id: str(e.id) || uid('e'),
      name: str(e.name),
      x: num(e.x),
      y: num(e.y),
      color: str(e.color) || undefined,
      comment: str(e.comment) || undefined,
      attributes,
    };
  });
  const ids = new Set(entities.map((e) => e.id));

  const relationships: Relationship[] = (Array.isArray(raw.relationships) ? raw.relationships : [])
    .map((rv): Relationship => {
      const r = obj(rv);
      return {
        id: str(r.id) || uid('r'),
        name: str(r.name),
        source: parseEnd(r.source),
        target: parseEnd(r.target),
        identifying: r.identifying === true,
        onDelete: ACTIONS.includes(r.onDelete as RefAction) ? (r.onDelete as RefAction) : 'NO ACTION',
        onUpdate: ACTIONS.includes(r.onUpdate as RefAction) ? (r.onUpdate as RefAction) : 'NO ACTION',
      };
    })
    .filter((r) => ids.has(r.source.entityId) && ids.has(r.target.entityId));

  return syncForeignKeys({ version: 1, name: str(raw.name, 'Untitled model'), entities, relationships });
}

export function serializeModel(model: Model): string {
  return JSON.stringify(model, null, 2);
}
