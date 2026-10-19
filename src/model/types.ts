export type MaxCardinality = 'one' | 'many';
export type MinCardinality = 0 | 1;

/** Referential action used for ON DELETE / ON UPDATE. */
export type RefAction = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL';

export interface ForeignKeyRef {
  /** Relationship that produced this column. */
  relationshipId: string;
  /** Primary key attribute of the parent entity this column references. */
  refAttributeId: string;
}

export interface Attribute {
  id: string;
  name: string;
  /** Logical or physical type as typed by the user, e.g. INTEGER, VARCHAR(100), string, datetime. */
  type: string;
  pk: boolean;
  /** true = NULL allowed. */
  nullable: boolean;
  unique: boolean;
  defaultValue?: string;
  comment?: string;
  /** Set for columns that are maintained automatically from relationships. */
  fk?: ForeignKeyRef;
}

export interface Entity {
  id: string;
  name: string;
  x: number;
  y: number;
  color?: string;
  comment?: string;
  attributes: Attribute[];
}

/**
 * One end of a relationship. min/max describe how many instances of THIS entity
 * relate to one instance of the entity at the other end — exactly what the
 * crow's foot symbol drawn next to this entity shows.
 */
export interface RelationshipEnd {
  entityId: string;
  min: MinCardinality;
  max: MaxCardinality;
}

export interface Relationship {
  id: string;
  name: string;
  source: RelationshipEnd;
  target: RelationshipEnd;
  /** Identifying relationship: foreign key becomes part of the child's primary key (drawn solid). */
  identifying: boolean;
  onDelete: RefAction;
  onUpdate: RefAction;
}

export interface Model {
  version: 1;
  name: string;
  entities: Entity[];
  relationships: Relationship[];
}

export type Selection =
  | { kind: 'entity'; id: string }
  | { kind: 'relationship'; id: string }
  | null;
