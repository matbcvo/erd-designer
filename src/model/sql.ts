import type { Attribute, Entity, Model, Relationship } from './types';
import { parentChild } from './ops';

export type Dialect = 'postgresql' | 'mysql' | 'sqlite' | 'mssql';

export const DIALECTS: { id: Dialect; label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL / MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'mssql', label: 'SQL Server' },
];

/** Types offered in the attribute type picker. Friendly aliases (int, string, …) are also accepted. */
export const COMMON_TYPES = [
  'SERIAL',
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'DECIMAL(10,2)',
  'NUMERIC',
  'REAL',
  'DOUBLE PRECISION',
  'BOOLEAN',
  'CHAR(1)',
  'VARCHAR(50)',
  'VARCHAR(100)',
  'VARCHAR(255)',
  'TEXT',
  'DATE',
  'TIME',
  'TIMESTAMP',
  'DATETIME',
  'UUID',
  'BLOB',
  'JSON',
];

const RESERVED = new Set(
  (
    'all alter and any as asc between by case check column constraint create cross current_date current_time ' +
    'current_timestamp current_user database default delete desc distinct drop else end except exists false fetch ' +
    'for foreign from full grant group having in index inner insert intersect into is join key left like limit not ' +
    'null offset on or order outer primary references right rows select session_user set table then to true union ' +
    'unique update user using values view when where with'
  ).split(' '),
);

function quote(name: string, dialect: Dialect): string {
  const simple = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED.has(name.toLowerCase());
  if (simple) return name;
  if (dialect === 'mysql') return '`' + name.replace(/`/g, '``') + '`';
  if (dialect === 'mssql') return '[' + name.replace(/]/g, ']]') + ']';
  return '"' + name.replace(/"/g, '""') + '"';
}

function ident(name: string): string {
  return name.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '').toLowerCase() || 'x';
}

interface MappedType {
  sql: string;
  autoIncrement: boolean;
}

/** Map a user-entered type (incl. aliases like "string", "int", "datetime") to the dialect. */
export function mapType(raw: string, dialect: Dialect): MappedType {
  const input = raw.trim();
  const m = /^([A-Za-z ]+?)\s*(\(.*\))?$/.exec(input);
  const base = (m ? m[1] : input).trim().toUpperCase();
  const args = m?.[2] ?? '';
  const ai = (sql: string): MappedType => ({ sql, autoIncrement: true });
  const t = (sql: string): MappedType => ({ sql, autoIncrement: false });

  switch (base) {
    case '':
      return t(dialect === 'sqlite' ? 'TEXT' : 'VARCHAR(255)');
    case 'SERIAL':
    case 'AUTO_INCREMENT':
    case 'AUTOINCREMENT':
    case 'IDENTITY':
      if (dialect === 'postgresql') return t('SERIAL');
      if (dialect === 'mysql') return ai('INT');
      if (dialect === 'mssql') return ai('INT');
      return ai('INTEGER');
    case 'BIGSERIAL':
      if (dialect === 'postgresql') return t('BIGSERIAL');
      return ai(dialect === 'sqlite' ? 'INTEGER' : 'BIGINT');
    case 'INT':
    case 'INTEGER':
    case 'INT4':
    case 'NUMBER':
      if (base === 'NUMBER' && args) return t(`DECIMAL${args}`);
      return t(dialect === 'mysql' || dialect === 'mssql' ? 'INT' : 'INTEGER');
    case 'LONG':
    case 'BIGINT':
    case 'INT8':
      return t(dialect === 'sqlite' ? 'INTEGER' : 'BIGINT');
    case 'SHORT':
    case 'SMALLINT':
    case 'INT2':
      return t(dialect === 'sqlite' ? 'INTEGER' : 'SMALLINT');
    case 'TINYINT':
      return t(dialect === 'postgresql' ? 'SMALLINT' : dialect === 'sqlite' ? 'INTEGER' : 'TINYINT');
    case 'DECIMAL':
    case 'NUMERIC':
    case 'MONEY':
    case 'CURRENCY':
      if (base === 'MONEY' || base === 'CURRENCY') return t(dialect === 'sqlite' ? 'NUMERIC' : 'DECIMAL(19,4)');
      return t(dialect === 'sqlite' ? 'NUMERIC' : `${base}${args}`);
    case 'FLOAT':
    case 'REAL':
      return t(dialect === 'mysql' ? 'FLOAT' : 'REAL');
    case 'DOUBLE':
    case 'DOUBLE PRECISION':
      if (dialect === 'mysql') return t('DOUBLE');
      if (dialect === 'mssql') return t('FLOAT');
      if (dialect === 'sqlite') return t('REAL');
      return t('DOUBLE PRECISION');
    case 'BOOL':
    case 'BOOLEAN':
    case 'BIT':
      if (dialect === 'mssql') return t('BIT');
      if (dialect === 'sqlite') return t('INTEGER');
      return t('BOOLEAN');
    case 'STRING':
    case 'VARCHAR':
    case 'VARCHAR2':
    case 'NVARCHAR':
    case 'CHARACTER VARYING': {
      if (dialect === 'sqlite') return t('TEXT');
      const len = args || '(255)';
      return t(dialect === 'mssql' ? `NVARCHAR${len}` : `VARCHAR${len}`);
    }
    case 'CHAR':
    case 'CHARACTER':
    case 'NCHAR':
      return t(dialect === 'sqlite' ? 'TEXT' : `${dialect === 'mssql' && base === 'NCHAR' ? 'NCHAR' : 'CHAR'}${args || '(1)'}`);
    case 'TEXT':
    case 'CLOB':
    case 'LONGTEXT':
      if (dialect === 'mssql') return t('NVARCHAR(MAX)');
      return t(base === 'LONGTEXT' && dialect === 'mysql' ? 'LONGTEXT' : 'TEXT');
    case 'DATE':
      return t(dialect === 'sqlite' ? 'TEXT' : 'DATE');
    case 'TIME':
      return t(dialect === 'sqlite' ? 'TEXT' : 'TIME');
    case 'DATETIME':
    case 'TIMESTAMP':
    case 'TIMESTAMPTZ':
      if (dialect === 'postgresql') return t(base === 'TIMESTAMPTZ' ? 'TIMESTAMPTZ' : 'TIMESTAMP');
      if (dialect === 'mysql') return t('DATETIME');
      if (dialect === 'mssql') return t('DATETIME2');
      return t('TEXT');
    case 'UUID':
    case 'GUID':
      if (dialect === 'postgresql') return t('UUID');
      if (dialect === 'mssql') return t('UNIQUEIDENTIFIER');
      if (dialect === 'mysql') return t('CHAR(36)');
      return t('TEXT');
    case 'BLOB':
    case 'BYTEA':
    case 'BINARY':
    case 'VARBINARY':
      if (dialect === 'postgresql') return t('BYTEA');
      if (dialect === 'mssql') return t('VARBINARY(MAX)');
      return t('BLOB');
    case 'JSON':
    case 'JSONB':
      if (dialect === 'postgresql') return t(base);
      if (dialect === 'mysql') return t('JSON');
      if (dialect === 'mssql') return t('NVARCHAR(MAX)');
      return t('TEXT');
    default:
      return t(input);
  }
}

function sqlString(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

function defaultClause(a: Attribute): string {
  const v = a.defaultValue?.trim();
  if (!v) return '';
  // Numbers, booleans, NULL, function calls and already-quoted strings pass through unchanged.
  const passthrough = /^(-?\d+(\.\d+)?|true|false|null|current_(date|time|timestamp)|[A-Za-z_]+\(.*\)|'.*')$/i;
  return ` DEFAULT ${passthrough.test(v) ? v : sqlString(v)}`;
}

/** Order entities so referenced tables come first; tables in FK cycles keep model order. */
function orderEntities(model: Model): { ordered: Entity[]; deferred: Set<string> } {
  const deps = new Map<string, Set<string>>();
  for (const e of model.entities) deps.set(e.id, new Set());
  for (const r of model.relationships) {
    const pc = parentChild(r);
    if (!pc || pc.parent.entityId === pc.child.entityId) continue;
    deps.get(pc.child.entityId)?.add(pc.parent.entityId);
  }
  const ordered: Entity[] = [];
  const done = new Set<string>();
  const deferred = new Set<string>();
  let remaining = [...model.entities];
  while (remaining.length) {
    const ready = remaining.filter((e) => [...(deps.get(e.id) ?? [])].every((d) => done.has(d)));
    if (!ready.length) {
      // Cycle: emit the first remaining table; its unresolved FKs go to ALTER TABLE.
      const e = remaining[0];
      deferred.add(e.id);
      ready.push(e);
    }
    for (const e of ready) {
      ordered.push(e);
      done.add(e.id);
    }
    remaining = remaining.filter((e) => !done.has(e.id));
  }
  return { ordered, deferred };
}

export interface SqlOptions {
  dialect: Dialect;
  dropTables?: boolean;
}

export function generateSql(model: Model, opts: SqlOptions): string {
  const { dialect } = opts;
  const q = (n: string) => quote(n, dialect);
  const out: string[] = [];
  out.push(`-- ${model.name || 'ERD model'}`);
  out.push(`-- Generated by ERD Designer for ${DIALECTS.find((d) => d.id === dialect)?.label ?? dialect}`);
  out.push('');
  if (dialect === 'sqlite') {
    out.push('PRAGMA foreign_keys = ON;', '');
  }

  const { ordered } = orderEntities(model);
  const created = new Set<string>();
  const alters: string[] = [];

  const unresolved = model.relationships.filter((r) => !parentChild(r));
  for (const r of unresolved) {
    const a = model.entities.find((e) => e.id === r.source.entityId)?.name ?? '?';
    const b = model.entities.find((e) => e.id === r.target.entityId)?.name ?? '?';
    out.push(`-- NOTE: many-to-many relationship ${r.name ? `"${r.name}" ` : ''}between ${a} and ${b}`);
    out.push('--       is not resolved. Convert it to a junction table to generate its foreign keys.');
  }
  if (unresolved.length) out.push('');

  if (opts.dropTables) {
    for (const e of [...ordered].reverse()) {
      out.push(dialect === 'mssql' ? `DROP TABLE IF EXISTS ${q(e.name)};` : `DROP TABLE IF EXISTS ${q(e.name)}${dialect === 'postgresql' ? ' CASCADE' : ''};`);
    }
    out.push('');
  }

  for (const entity of ordered) {
    const lines: string[] = [];
    const pks = entity.attributes.filter((a) => a.pk);
    const singleAutoPk = pks.length === 1 && mapType(pks[0].type, dialect).autoIncrement;

    for (const a of entity.attributes) {
      const mt = mapType(a.type, dialect);
      let line = `  ${q(a.name)} ${mt.sql}`;
      if (dialect === 'sqlite' && a.pk && singleAutoPk) {
        line += ' PRIMARY KEY AUTOINCREMENT';
      } else {
        if (!a.nullable || a.pk) line += ' NOT NULL';
        if (mt.autoIncrement) line += dialect === 'mssql' ? ' IDENTITY(1,1)' : dialect === 'mysql' ? ' AUTO_INCREMENT' : '';
      }
      if (a.unique && !a.pk) line += ' UNIQUE';
      line += defaultClause(a);
      if (a.comment && dialect === 'mysql') line += ` COMMENT ${sqlString(a.comment)}`;
      lines.push(line);
    }

    if (pks.length && !(dialect === 'sqlite' && singleAutoPk)) {
      lines.push(`  CONSTRAINT ${q(`pk_${ident(entity.name)}`)} PRIMARY KEY (${pks.map((a) => q(a.name)).join(', ')})`);
    }

    // Foreign keys: one constraint per relationship where this entity is the child.
    for (const rel of model.relationships) {
      const fkCols = entity.attributes.filter((a) => a.fk?.relationshipId === rel.id);
      if (!fkCols.length) continue;
      const pc = parentChild(rel);
      const parent = pc && model.entities.find((e) => e.id === pc.parent.entityId);
      if (!parent) continue;
      const refCols = fkCols.map((c) => parent.attributes.find((p) => p.id === c.fk!.refAttributeId)?.name ?? '?');
      const cname = q(`fk_${ident(entity.name)}_${ident(fkCols.map((c) => c.name).join('_'))}`);
      let clause = `FOREIGN KEY (${fkCols.map((c) => q(c.name)).join(', ')}) REFERENCES ${q(parent.name)} (${refCols.map(q).join(', ')})`;
      if (rel.onDelete !== 'NO ACTION') clause += ` ON DELETE ${rel.onDelete}`;
      if (rel.onUpdate !== 'NO ACTION') clause += ` ON UPDATE ${rel.onUpdate}`;
      const parentReady = created.has(parent.id) || parent.id === entity.id;
      if (parentReady || dialect === 'sqlite') {
        lines.push(`  CONSTRAINT ${cname} ${clause}`);
      } else {
        alters.push(`ALTER TABLE ${q(entity.name)} ADD CONSTRAINT ${cname} ${clause};`);
      }
    }

    if (entity.comment) out.push(`-- ${entity.comment.replace(/\n/g, '\n-- ')}`);
    const tableComment = entity.comment && dialect === 'mysql' ? ` COMMENT=${sqlString(entity.comment)}` : '';
    out.push(`CREATE TABLE ${q(entity.name)} (`);
    out.push(lines.join(',\n'));
    out.push(`)${tableComment};`);
    out.push('');
    created.add(entity.id);

    if (dialect === 'postgresql') {
      if (entity.comment) out.push(`COMMENT ON TABLE ${q(entity.name)} IS ${sqlString(entity.comment)};`);
      for (const a of entity.attributes) {
        if (a.comment) out.push(`COMMENT ON COLUMN ${q(entity.name)}.${q(a.name)} IS ${sqlString(a.comment)};`);
      }
      if (entity.comment || entity.attributes.some((a) => a.comment)) out.push('');
    }
  }

  if (alters.length) {
    out.push(...alters, '');
  }
  return out.join('\n').trimEnd() + '\n';
}

export type { Relationship };
