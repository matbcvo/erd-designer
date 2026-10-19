import { describe, expect, it } from 'vitest';
import { exampleModel } from './example';
import { newEntity, newRelationship, resolveManyToMany, syncForeignKeys, deleteRelationships, emptyModel } from './ops';
import { generateSql, mapType } from './sql';
import { parseModel, serializeModel } from './io';
import { validate } from './validate';

describe('foreign key sync', () => {
  it('adds FK columns to the many side', () => {
    const m = exampleModel();
    const order = m.entities.find((e) => e.name === 'Order')!;
    const fk = order.attributes.find((a) => a.fk);
    expect(fk?.name).toBe('customer_id');
    expect(fk?.type).toBe('INTEGER');
    expect(fk?.nullable).toBe(false);
    expect(fk?.pk).toBe(false);
  });

  it('identifying relationships put FKs into the primary key', () => {
    const m = exampleModel();
    const line = m.entities.find((e) => e.name === 'Order_line')!;
    expect(line.attributes.filter((a) => a.pk).map((a) => a.name)).toEqual(['order_id', 'product_id']);
  });

  it('removes FK columns when the relationship is deleted', () => {
    const m = deleteRelationships(exampleModel(), new Set(['r_places']));
    const order = m.entities.find((e) => e.name === 'Order')!;
    expect(order.attributes.some((a) => a.fk)).toBe(false);
  });

  it('keeps user-renamed FK columns and is idempotent', () => {
    let m = exampleModel();
    m = {
      ...m,
      entities: m.entities.map((e) =>
        e.name === 'Order' ? { ...e, attributes: e.attributes.map((a) => (a.fk ? { ...a, name: 'buyer_id' } : a)) } : e,
      ),
    };
    const synced = syncForeignKeys(m);
    expect(synced).toBe(m);
    expect(synced.entities.find((e) => e.name === 'Order')!.attributes.some((a) => a.name === 'buyer_id')).toBe(true);
  });

  it('propagates through identifying chains', () => {
    let m = emptyModel();
    const a = newEntity(m, 0, 0, 'A');
    m = { ...m, entities: [a] };
    const b = { ...newEntity(m, 0, 0, 'B'), attributes: [] };
    m = { ...m, entities: [a, b] };
    const c = { ...newEntity(m, 0, 0, 'C'), attributes: [] };
    m = { ...m, entities: [a, b, c] };
    const r1 = { ...newRelationship(a.id, b.id), identifying: true };
    const r2 = { ...newRelationship(b.id, c.id), identifying: true };
    m = syncForeignKeys({ ...m, relationships: [r2, r1] });
    const cc = m.entities.find((e) => e.name === 'C')!;
    expect(cc.attributes.filter((x) => x.pk)).toHaveLength(1);
  });

  it('handles self-referencing relationships without making them PK', () => {
    let m = emptyModel();
    const emp = newEntity(m, 0, 0, 'Employee');
    m = { ...m, entities: [emp] };
    const r = { ...newRelationship(emp.id, emp.id), name: 'manager', identifying: true, source: { entityId: emp.id, min: 0 as const, max: 'one' as const } };
    m = syncForeignKeys({ ...m, relationships: [r] });
    const fk = m.entities[0].attributes.find((a) => a.fk)!;
    expect(fk.name).toBe('manager_id');
    expect(fk.pk).toBe(false);
  });
});

describe('many-to-many', () => {
  it('converts to a junction table', () => {
    let m = emptyModel();
    const s = newEntity(m, 0, 0, 'Student');
    m = { ...m, entities: [s] };
    const c = newEntity(m, 300, 0, 'Course');
    const rel = { ...newRelationship(s.id, c.id), source: { entityId: s.id, min: 0 as const, max: 'many' as const } };
    m = { ...m, entities: [s, c], relationships: [rel] };
    expect(validate(m).some((i) => i.code === 'manyToMany')).toBe(true);
    const res = resolveManyToMany(m, rel.id)!;
    const j = res.model.entities.find((e) => e.id === res.junctionId)!;
    expect(j.name).toBe('Student_Course');
    expect(j.attributes.map((a) => [a.name, a.pk])).toEqual([
      ['student_id', true],
      ['course_id', true],
    ]);
  });
});

describe('checks', () => {
  it('flags a recursive relationship that is not zero-or-one to zero-or-many', () => {
    let m = emptyModel();
    const emp = newEntity(m, 0, 0, 'Employee');
    m = { ...m, entities: [emp] };
    const bad = { ...newRelationship(emp.id, emp.id) }; // 1..1 – 0..many
    expect(validate(syncForeignKeys({ ...m, relationships: [bad] })).some((i) => i.code === 'recursiveCardinality')).toBe(true);
    const good = { ...bad, source: { ...bad.source, min: 0 as const } };
    expect(validate(syncForeignKeys({ ...m, relationships: [good] })).some((i) => i.code === 'recursiveCardinality')).toBe(false);
  });

  it('localises the example model', () => {
    const et = exampleModel('et');
    expect(et.entities.map((e) => e.name)).toEqual(['Klient', 'Tellimus', 'Toode', 'Tellimuse_rida']);
    expect(et.entities.find((e) => e.name === 'Tellimus')!.attributes.some((a) => a.name === 'klient_id')).toBe(true);
  });
});

describe('SQL', () => {
  it('maps friendly aliases', () => {
    expect(mapType('string', 'postgresql').sql).toBe('VARCHAR(255)');
    expect(mapType('int', 'mysql').sql).toBe('INT');
    expect(mapType('datetime', 'postgresql').sql).toBe('TIMESTAMP');
    expect(mapType('varchar(40)', 'mssql').sql).toBe('NVARCHAR(40)');
  });

  it('generates PostgreSQL in dependency order', () => {
    const sql = generateSql(exampleModel(), { dialect: 'postgresql' });
    expect(sql.indexOf('CREATE TABLE Customer')).toBeLessThan(sql.indexOf('CREATE TABLE "Order"'));
    expect(sql).toContain('CONSTRAINT pk_order_line PRIMARY KEY (order_id, product_id)');
    expect(sql).toContain('FOREIGN KEY (customer_id) REFERENCES Customer (id) ON DELETE RESTRICT');
    expect(sql).toContain("status VARCHAR(20) NOT NULL DEFAULT 'new'");
    expect(sql).not.toContain('ALTER TABLE');
  });

  it('generates MySQL and SQLite', () => {
    const my = generateSql(exampleModel(), { dialect: 'mysql' });
    expect(my).toContain('id INT NOT NULL AUTO_INCREMENT');
    expect(my).toContain('CREATE TABLE `Order`');
    const lite = generateSql(exampleModel(), { dialect: 'sqlite' });
    expect(lite).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
  });

  it('uses ALTER TABLE for FK cycles', () => {
    let m = emptyModel();
    const a = newEntity(m, 0, 0, 'A');
    m = { ...m, entities: [a] };
    const b = newEntity(m, 0, 0, 'B');
    m = syncForeignKeys({
      ...m,
      entities: [a, b],
      relationships: [newRelationship(a.id, b.id), newRelationship(b.id, a.id)],
    });
    const sql = generateSql(m, { dialect: 'postgresql' });
    expect(sql).toContain('ALTER TABLE A ADD CONSTRAINT');
  });
});

describe('io', () => {
  it('round-trips', () => {
    const m = exampleModel();
    expect(parseModel(serializeModel(m))).toEqual(m);
  });
  it('rejects non-models', () => {
    expect(() => parseModel('{"foo":1}')).toThrow();
  });
});
