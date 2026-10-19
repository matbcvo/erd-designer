import type { Attribute, Entity, Model, Relationship, RelationshipEnd } from './types';

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

export function emptyModel(name = 'Untitled model'): Model {
  return { version: 1, name, entities: [], relationships: [] };
}

export function newAttribute(partial: Partial<Attribute> = {}): Attribute {
  return {
    id: uid('a'),
    name: 'attribute',
    type: 'VARCHAR(255)',
    pk: false,
    nullable: true,
    unique: false,
    ...partial,
  };
}

export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((n) => n.toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
}

export function newEntity(model: Model, x: number, y: number, name?: string, baseName = 'Entity'): Entity {
  const entityName = uniqueName(name ?? baseName, model.entities.map((e) => e.name));
  return {
    id: uid('e'),
    name: entityName,
    x,
    y,
    attributes: [newAttribute({ name: 'id', type: 'SERIAL', pk: true, nullable: false })],
  };
}

export function newRelationship(sourceId: string, targetId: string): Relationship {
  return {
    id: uid('r'),
    name: '',
    // Default: one (mandatory) source has zero-or-many targets.
    source: { entityId: sourceId, min: 1, max: 'one' },
    target: { entityId: targetId, min: 0, max: 'many' },
    identifying: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  };
}

export function entityById(model: Model, id: string): Entity | undefined {
  return model.entities.find((e) => e.id === id);
}

/**
 * Which end is the parent (referenced) and which is the child (holds the FK).
 * Returns null for many-to-many relationships, which need a junction table.
 */
export function parentChild(rel: Relationship): { parent: RelationshipEnd; child: RelationshipEnd } | null {
  const s = rel.source;
  const t = rel.target;
  if (s.max === 'many' && t.max === 'many') return null;
  if (s.max === 'one' && t.max === 'many') return { parent: s, child: t };
  if (s.max === 'many' && t.max === 'one') return { parent: t, child: s };
  // One-to-one: the optional side holds the FK; otherwise the target does.
  if (s.min === 0 && t.min === 1) return { parent: t, child: s };
  return { parent: s, child: t };
}

/** Type a foreign key column should have for a given primary key type. */
export function fkTypeFor(pkType: string): string {
  const t = pkType.trim().toUpperCase();
  if (t === 'SERIAL' || t === 'AUTO_INCREMENT' || t === 'AUTOINCREMENT') return 'INTEGER';
  if (t === 'BIGSERIAL') return 'BIGINT';
  if (t === 'SMALLSERIAL') return 'SMALLINT';
  return pkType;
}

function defaultFkName(parent: Entity, pk: Attribute, rel: Relationship): string {
  const base = parent.name.replace(/\s+/g, '_').toLowerCase();
  if (rel.name && rel.source.entityId === rel.target.entityId) {
    // Self reference: name after the role, e.g. "manager_id".
    return `${rel.name.replace(/\s+/g, '_').toLowerCase()}_${pk.name}`;
  }
  if (pk.name.toLowerCase() === 'id') return `${base}_id`;
  if (pk.name.toLowerCase().startsWith(base)) return pk.name;
  return `${base}_${pk.name}`;
}

/**
 * Bring every foreign key column in line with the relationships:
 * creates missing FK columns, updates their type / nullability / PK flag,
 * and removes FK columns whose relationship or referenced key no longer exists.
 * User-chosen FK column names are preserved.
 */
export function syncForeignKeys(model: Model): Model {
  // Desired FK columns per child entity, keyed by relationshipId + refAttributeId.
  type Want = { rel: Relationship; parent: Entity; pk: Attribute; nullable: boolean; pkFlag: boolean };
  const wanted = new Map<string, Map<string, Want>>();

  // Resolve in a stable order and support chains (an FK that is itself part of a PK).
  // Iterate a few times so identifying chains propagate (A -> B -> C).
  let current = model;
  for (let pass = 0; pass < 8; pass++) {
    wanted.clear();
    for (const rel of current.relationships) {
      const pc = parentChild(rel);
      if (!pc) continue;
      const parent = entityById(current, pc.parent.entityId);
      const child = entityById(current, pc.child.entityId);
      if (!parent || !child) continue;
      const nullable = pc.parent.min === 0 && !rel.identifying;
      for (const pk of parent.attributes.filter((a) => a.pk)) {
        // A self-referencing FK can never be part of the PK it references.
        const pkFlag = rel.identifying && parent.id !== child.id;
        let m = wanted.get(child.id);
        if (!m) wanted.set(child.id, (m = new Map()));
        m.set(`${rel.id}:${pk.id}`, { rel, parent, pk, nullable, pkFlag });
      }
    }

    let changed = false;
    const entities = current.entities.map((entity) => {
      const want = wanted.get(entity.id) ?? new Map<string, Want>();
      const seen = new Set<string>();
      let entityChanged = false;
      const attrs: Attribute[] = [];
      for (const a of entity.attributes) {
        if (!a.fk) {
          attrs.push(a);
          continue;
        }
        const key = `${a.fk.relationshipId}:${a.fk.refAttributeId}`;
        const w = want.get(key);
        if (!w || seen.has(key)) {
          entityChanged = true; // stale FK column -> drop
          continue;
        }
        seen.add(key);
        const type = fkTypeFor(w.pk.type);
        if (a.type !== type || a.nullable !== w.nullable || a.pk !== w.pkFlag) {
          entityChanged = true;
          attrs.push({ ...a, type, nullable: w.nullable, pk: w.pkFlag });
        } else {
          attrs.push(a);
        }
      }
      for (const [key, w] of want) {
        if (seen.has(key)) continue;
        entityChanged = true;
        const name = uniqueName(defaultFkName(w.parent, w.pk, w.rel), attrs.map((x) => x.name));
        const col = newAttribute({
          name,
          type: fkTypeFor(w.pk.type),
          pk: w.pkFlag,
          nullable: w.nullable,
          fk: { relationshipId: w.rel.id, refAttributeId: w.pk.id },
        });
        // Put new FK columns after the existing primary key columns.
        const lastPk = attrs.reduce((idx, x, i) => (x.pk ? i : idx), -1);
        if (w.pkFlag) attrs.splice(lastPk + 1, 0, col);
        else attrs.push(col);
      }
      if (!entityChanged) return entity;
      changed = true;
      return { ...entity, attributes: attrs };
    });
    if (!changed) return current;
    current = { ...current, entities };
  }
  return current;
}

/** Replace a many-to-many relationship with a junction entity and two one-to-many relationships. */
export function resolveManyToMany(model: Model, relId: string): { model: Model; junctionId: string } | null {
  const rel = model.relationships.find((r) => r.id === relId);
  if (!rel || rel.source.max !== 'many' || rel.target.max !== 'many') return null;
  const a = entityById(model, rel.source.entityId);
  const b = entityById(model, rel.target.entityId);
  if (!a || !b) return null;
  const junction: Entity = {
    id: uid('e'),
    name: uniqueName(rel.name ? rel.name.replace(/\s+/g, '_') : `${a.name}_${b.name}`, model.entities.map((e) => e.name)),
    x: Math.round((a.x + b.x) / 2),
    y: Math.round((a.y + b.y) / 2) + 140,
    attributes: [],
  };
  const r1: Relationship = {
    ...newRelationship(a.id, junction.id),
    identifying: true,
    source: { entityId: a.id, min: 1, max: 'one' },
    target: { entityId: junction.id, min: rel.target.min, max: 'many' },
    onDelete: 'CASCADE',
  };
  const r2: Relationship = {
    ...newRelationship(b.id, junction.id),
    identifying: true,
    source: { entityId: b.id, min: 1, max: 'one' },
    target: { entityId: junction.id, min: rel.source.min, max: 'many' },
    onDelete: 'CASCADE',
  };
  const next: Model = {
    ...model,
    entities: [...model.entities, junction],
    relationships: [...model.relationships.filter((r) => r.id !== relId), r1, r2],
  };
  return { model: syncForeignKeys(next), junctionId: junction.id };
}

export function deleteEntities(model: Model, ids: Set<string>): Model {
  return syncForeignKeys({
    ...model,
    entities: model.entities.filter((e) => !ids.has(e.id)),
    relationships: model.relationships.filter((r) => !ids.has(r.source.entityId) && !ids.has(r.target.entityId)),
  });
}

export function deleteRelationships(model: Model, ids: Set<string>): Model {
  return syncForeignKeys({ ...model, relationships: model.relationships.filter((r) => !ids.has(r.id)) });
}
