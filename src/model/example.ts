import type { Model } from './types';
import { syncForeignKeys } from './ops';
import type { Lang } from '../i18n';

/** Estonian names for the example (ASCII-only identifiers so the SQL works everywhere). */
const ET_NAMES: Record<string, string> = {
  'Example: web shop': 'Näide: e-pood',
  Customer: 'Klient',
  Order: 'Tellimus',
  Product: 'Toode',
  Order_line: 'Tellimuse_rida',
  email: 'email',
  full_name: 'nimi',
  created_at: 'loodud',
  ordered_at: 'tellitud',
  status: 'staatus',
  sku: 'kood',
  name: 'nimetus',
  price: 'hind',
  quantity: 'kogus',
  unit_price: 'uhikuhind',
  places: 'esitab',
  contains: 'sisaldab',
  'appears in': 'esineb',
};

/** A small shop model shown on first launch. */
export function exampleModel(lang: Lang = 'en'): Model {
  const m = baseExample();
  if (lang !== 'et') return syncForeignKeys(m);
  const tr = (n: string) => ET_NAMES[n] ?? n;
  return syncForeignKeys({
    ...m,
    name: tr(m.name),
    entities: m.entities.map((e) => ({
      ...e,
      name: tr(e.name),
      attributes: e.attributes.map((a) => ({ ...a, name: tr(a.name), defaultValue: a.defaultValue === 'new' ? 'uus' : a.defaultValue })),
    })),
    relationships: m.relationships.map((r) => ({ ...r, name: tr(r.name) })),
  });
}

function baseExample(): Model {
  const m: Model = {
    version: 1,
    name: 'Example: web shop',
    entities: [
      {
        id: 'e_customer',
        name: 'Customer',
        x: 40,
        y: 60,
        attributes: [
          { id: 'a_c_id', name: 'id', type: 'SERIAL', pk: true, nullable: false, unique: false },
          { id: 'a_c_email', name: 'email', type: 'VARCHAR(255)', pk: false, nullable: false, unique: true },
          { id: 'a_c_name', name: 'full_name', type: 'VARCHAR(100)', pk: false, nullable: false, unique: false },
          { id: 'a_c_created', name: 'created_at', type: 'TIMESTAMP', pk: false, nullable: false, unique: false, defaultValue: 'CURRENT_TIMESTAMP' },
        ],
      },
      {
        id: 'e_order',
        name: 'Order',
        x: 420,
        y: 60,
        attributes: [
          { id: 'a_o_id', name: 'id', type: 'SERIAL', pk: true, nullable: false, unique: false },
          { id: 'a_o_date', name: 'ordered_at', type: 'TIMESTAMP', pk: false, nullable: false, unique: false },
          { id: 'a_o_status', name: 'status', type: 'VARCHAR(20)', pk: false, nullable: false, unique: false, defaultValue: 'new' },
        ],
      },
      {
        id: 'e_product',
        name: 'Product',
        x: 800,
        y: 300,
        attributes: [
          { id: 'a_p_id', name: 'id', type: 'SERIAL', pk: true, nullable: false, unique: false },
          { id: 'a_p_sku', name: 'sku', type: 'VARCHAR(50)', pk: false, nullable: false, unique: true },
          { id: 'a_p_name', name: 'name', type: 'VARCHAR(255)', pk: false, nullable: false, unique: false },
          { id: 'a_p_price', name: 'price', type: 'DECIMAL(10,2)', pk: false, nullable: false, unique: false },
        ],
      },
      {
        id: 'e_line',
        name: 'Order_line',
        x: 420,
        y: 330,
        attributes: [
          { id: 'a_l_qty', name: 'quantity', type: 'INTEGER', pk: false, nullable: false, unique: false, defaultValue: '1' },
          { id: 'a_l_price', name: 'unit_price', type: 'DECIMAL(10,2)', pk: false, nullable: false, unique: false },
        ],
      },
    ],
    relationships: [
      {
        id: 'r_places',
        name: 'places',
        source: { entityId: 'e_customer', min: 1, max: 'one' },
        target: { entityId: 'e_order', min: 0, max: 'many' },
        identifying: false,
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION',
      },
      {
        id: 'r_contains',
        name: 'contains',
        source: { entityId: 'e_order', min: 1, max: 'one' },
        target: { entityId: 'e_line', min: 1, max: 'many' },
        identifying: true,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      {
        id: 'r_ordered',
        name: 'appears in',
        source: { entityId: 'e_product', min: 1, max: 'one' },
        target: { entityId: 'e_line', min: 0, max: 'many' },
        identifying: true,
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION',
      },
    ],
  };
  return m;
}
