import { useState } from 'react';
import type { Attribute, Entity, MaxCardinality, MinCardinality, Model, RefAction, Relationship, Selection } from '../model/types';
import { newAttribute, parentChild, syncForeignKeys, uniqueName } from '../model/ops';
import { COMMON_TYPES } from '../model/sql';
import type { Issue } from '../model/validate';
import { cardKey, useI18n, type CardKey } from '../i18n';

type Update = (fn: (m: Model) => Model, coalesceKey?: string) => void;

interface Props {
  model: Model;
  selection: Selection;
  issues: Issue[];
  update: Update;
  onSelect: (s: Selection) => void;
  onDeleteEntity: (id: string) => void;
  onDeleteRelationship: (id: string) => void;
  onResolveManyToMany: (id: string) => void;
}

const COLORS = ['', '#2563eb', '#0f766e', '#7c3aed', '#c2410c', '#be123c', '#4d7c0f', '#475569'];
const ACTIONS: RefAction[] = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL'];

export function Inspector(props: Props) {
  const { model, selection } = props;
  if (selection?.kind === 'entity') {
    const entity = model.entities.find((e) => e.id === selection.id);
    if (entity) return <EntityEditor key={entity.id} entity={entity} {...props} />;
  }
  if (selection?.kind === 'relationship') {
    const rel = model.relationships.find((r) => r.id === selection.id);
    if (rel) return <RelationshipEditor key={rel.id} rel={rel} {...props} />;
  }
  return <Overview {...props} />;
}

/* ---------------------------------------------------------------- overview */

function Overview({ model, issues, onSelect }: Props) {
  const { t } = useI18n();
  return (
    <div className="inspector-body">
      <h2>{t.model}</h2>
      <p className="muted">{t.counts(model.entities.length, model.relationships.length)}</p>

      <h3>{t.checks}</h3>
      {issues.length === 0 ? (
        <p className="ok">{t.noProblems}</p>
      ) : (
        <ul className="issues">
          {issues.map((i, n) => (
            <li key={n} className={i.level}>
              <button className="link" onClick={() => onSelect(i.target)}>
                {t.issues[i.code](i.params)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>{t.howTo}</h3>
      <ul className="help">
        {t.help.map(([head, rest]) => (
          <li key={head}>
            <b>{head}</b> {rest}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ entity */

function EntityEditor({ entity, model, update, onDeleteEntity }: Props & { entity: Entity }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  const setEntity = (fn: (e: Entity) => Entity, key?: string) =>
    update((m) => syncForeignKeys({ ...m, entities: m.entities.map((e) => (e.id === entity.id ? fn(e) : e)) }), key);
  const setAttr = (id: string, patch: Partial<Attribute>, key?: string) =>
    setEntity((e) => ({ ...e, attributes: e.attributes.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), key);
  const move = (index: number, dir: -1 | 1) =>
    setEntity((e) => {
      const attrs = [...e.attributes];
      const j = index + dir;
      if (j < 0 || j >= attrs.length) return e;
      [attrs[index], attrs[j]] = [attrs[j], attrs[index]];
      return { ...e, attributes: attrs };
    });
  const addAttr = () => {
    const a = newAttribute({ name: uniqueName(t.defaultAttributeName, entity.attributes.map((x) => x.name)) });
    setEntity((e) => ({ ...e, attributes: [...e.attributes, a] }));
    // Focus the new row's name field after render.
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-attr-name="${a.id}"]`);
      el?.focus();
      el?.select();
    });
  };

  const parentName = (a: Attribute) => {
    if (!a.fk) return '';
    const rel = model.relationships.find((r) => r.id === a.fk!.relationshipId);
    const pc = rel && parentChild(rel);
    const parent = pc && model.entities.find((e) => e.id === pc.parent.entityId);
    const col = parent?.attributes.find((x) => x.id === a.fk!.refAttributeId);
    return parent ? `${parent.name}.${col?.name ?? '?'}` : '';
  };

  return (
    <div className="inspector-body">
      <div className="inspector-title">
        <h2>{t.entity}</h2>
        <button className="danger small" onClick={() => onDeleteEntity(entity.id)}>
          {t.delete}
        </button>
      </div>

      <label className="field">
        <span>{t.name}</span>
        <input
          value={entity.name}
          autoFocus={entity.name.startsWith(t.defaultEntityName)}
          onChange={(ev) => setEntity((e) => ({ ...e, name: ev.target.value }), `ename:${entity.id}`)}
        />
      </label>

      <label className="field">
        <span>{t.description}</span>
        <textarea
          rows={2}
          value={entity.comment ?? ''}
          placeholder={t.descriptionPlaceholder}
          onChange={(ev) => setEntity((e) => ({ ...e, comment: ev.target.value || undefined }), `ecomment:${entity.id}`)}
        />
      </label>

      <div className="field">
        <span>{t.colour}</span>
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              key={c || 'default'}
              className={`swatch${(entity.color ?? '') === c ? ' active' : ''}`}
              style={{ background: c || 'var(--header)' }}
              title={c || t.defaultColour}
              onClick={() => setEntity((e) => ({ ...e, color: c || undefined }))}
            />
          ))}
        </div>
      </div>

      <h3>{t.attributes}</h3>
      <datalist id="type-options">
        {COMMON_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="attr-grid-head">
        <span>{t.colName}</span>
        <span>{t.colType}</span>
        <span title={t.colPkTitle}>PK</span>
        <span title={t.colNnTitle}>NN</span>
        <span title={t.colUqTitle}>UQ</span>
        <span />
      </div>
      {entity.attributes.map((a, i) => (
        <div key={a.id} className={`attr-row${a.fk ? ' is-fk' : ''}`}>
          <div className="attr-grid">
            <input
              data-attr-name={a.id}
              value={a.name}
              placeholder={t.namePlaceholder}
              onChange={(ev) => setAttr(a.id, { name: ev.target.value }, `aname:${a.id}`)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && i === entity.attributes.length - 1) addAttr();
              }}
            />
            <input
              list="type-options"
              value={a.type}
              placeholder={t.typePlaceholder}
              disabled={!!a.fk}
              title={a.fk ? t.fkTypeTitle : undefined}
              onChange={(ev) => setAttr(a.id, { type: ev.target.value }, `atype:${a.id}`)}
            />
            <input
              type="checkbox"
              checked={a.pk}
              disabled={!!a.fk}
              title={a.fk ? t.fkPkTitle : t.colPkTitle}
              onChange={(ev) => setAttr(a.id, { pk: ev.target.checked, nullable: ev.target.checked ? false : a.nullable })}
            />
            <input
              type="checkbox"
              checked={!a.nullable || a.pk}
              disabled={a.pk || !!a.fk}
              title={a.fk ? t.fkNnTitle : t.colNnTitle}
              onChange={(ev) => setAttr(a.id, { nullable: !ev.target.checked })}
            />
            <input type="checkbox" checked={a.unique} disabled={a.pk} title={t.colUqTitle} onChange={(ev) => setAttr(a.id, { unique: ev.target.checked })} />
            <div className="row-actions">
              <button className="icon" title={t.more} onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                {expanded === a.id ? '▴' : '▾'}
              </button>
            </div>
          </div>
          {a.fk && <div className="fk-note">FK → {parentName(a)}</div>}
          {expanded === a.id && (
            <div className="attr-more">
              <label className="field">
                <span>{t.defaultValue}</span>
                <input
                  value={a.defaultValue ?? ''}
                  placeholder={t.defaultPlaceholder}
                  onChange={(ev) => setAttr(a.id, { defaultValue: ev.target.value || undefined }, `adef:${a.id}`)}
                />
              </label>
              <label className="field">
                <span>{t.comment}</span>
                <input value={a.comment ?? ''} onChange={(ev) => setAttr(a.id, { comment: ev.target.value || undefined }, `acom:${a.id}`)} />
              </label>
              <div className="btn-row">
                <button className="small" disabled={i === 0} onClick={() => move(i, -1)}>
                  {t.up}
                </button>
                <button className="small" disabled={i === entity.attributes.length - 1} onClick={() => move(i, 1)}>
                  {t.down}
                </button>
                {!a.fk && (
                  <button className="small danger" onClick={() => setEntity((e) => ({ ...e, attributes: e.attributes.filter((x) => x.id !== a.id) }))}>
                    {t.remove}
                  </button>
                )}
              </div>
              {a.fk && <p className="muted small">{t.fkRemoveNote}</p>}
            </div>
          )}
        </div>
      ))}
      <button className="add-attr" onClick={addAttr}>
        {t.addAttribute}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ relationship */

const CARD_KEYS: CardKey[] = ['1-one', '0-one', '1-many', '0-many'];
const parseCard = (k: CardKey): { min: MinCardinality; max: MaxCardinality } => {
  const [min, max] = k.split('-');
  return { min: min === '0' ? 0 : 1, max: max as MaxCardinality };
};

function RelationshipEditor({ rel, model, update, onDeleteRelationship, onResolveManyToMany, onSelect }: Props & { rel: Relationship }) {
  const { t, lang } = useI18n();
  const setRel = (patch: Partial<Relationship> | ((r: Relationship) => Relationship), key?: string) =>
    update(
      (m) =>
        syncForeignKeys({
          ...m,
          relationships: m.relationships.map((r) => (r.id === rel.id ? (typeof patch === 'function' ? patch(r) : { ...r, ...patch }) : r)),
        }),
      key,
    );
  const name = (id: string) => model.entities.find((e) => e.id === id)?.name || '?';
  const src = name(rel.source.entityId);
  const tgt = name(rel.target.entityId);
  const phrase = (min: MinCardinality, max: MaxCardinality) => t.phrases[cardKey(min, max)];
  const manyToMany = rel.source.max === 'many' && rel.target.max === 'many';
  const pc = parentChild(rel);

  const endEditor = (which: 'source' | 'target', label: string) => {
    const end = rel[which];
    return (
      <fieldset className="rel-end">
        <legend>{label}</legend>
        <select value={end.entityId} onChange={(ev) => setRel((r) => ({ ...r, [which]: { ...r[which], entityId: ev.target.value } }))}>
          {model.entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name || t.unnamed}
            </option>
          ))}
        </select>
        <select value={cardKey(end.min, end.max)} onChange={(ev) => setRel((r) => ({ ...r, [which]: { ...r[which], ...parseCard(ev.target.value as CardKey) } }))}>
          {CARD_KEYS.map((k) => (
            <option key={k} value={k}>
              {t.cards[k]}
            </option>
          ))}
        </select>
      </fieldset>
    );
  };

  return (
    <div className="inspector-body">
      <div className="inspector-title">
        <h2>{t.relationship}</h2>
        <button className="danger small" onClick={() => onDeleteRelationship(rel.id)}>
          {t.delete}
        </button>
      </div>

      <label className="field">
        <span>{t.relName}</span>
        <input value={rel.name} placeholder={t.relNamePlaceholder} onChange={(ev) => setRel({ name: ev.target.value }, `rname:${rel.id}`)} />
      </label>

      {endEditor('source', t.endA)}
      {endEditor('target', t.endB)}

      <button
        className="small"
        onClick={() => setRel((r) => ({ ...r, source: r.target, target: r.source }))}
        title={t.swapEndsTitle}
      >
        {t.swapEnds}
      </button>

      <div className="reading">
        {lang === 'et' ? (
          <>
            <p>
              <b>{src}</b> {rel.name && <i>({rel.name})</i>} → <b>{tgt}</b>: {phrase(rel.target.min, rel.target.max)}
            </p>
            <p>
              <b>{tgt}</b> → <b>{src}</b>: {phrase(rel.source.min, rel.source.max)}
            </p>
          </>
        ) : (
          <>
            <p>
              Each <b>{src}</b> {rel.name ? <i>{rel.name}</i> : t.relatedTo} {phrase(rel.target.min, rel.target.max)} <b>{tgt}</b>.
            </p>
            <p>
              Each <b>{tgt}</b> {t.relatedTo} {phrase(rel.source.min, rel.source.max)} <b>{src}</b>.
            </p>
          </>
        )}
      </div>

      {manyToMany ? (
        <div className="callout">
          <p>{t.m2mText}</p>
          <button className="primary" onClick={() => onResolveManyToMany(rel.id)}>
            {t.m2mButton}
          </button>
        </div>
      ) : (
        <>
          <label className="check">
            <input type="checkbox" checked={rel.identifying} onChange={(ev) => setRel({ identifying: ev.target.checked })} />
            <span>
              {(() => {
                const [pre, child, post] = t.identifying(pc ? name(pc.child.entityId) : '');
                return (
                  <>
                    {pre}
                    <b>{child}</b>
                    {post}
                  </>
                );
              })()}
            </span>
          </label>
          {pc && (
            <p className="muted small">
              {t.fkGoesInto('', '')[0]}
              <button className="link" onClick={() => onSelect({ kind: 'entity', id: pc.child.entityId })}>
                {name(pc.child.entityId)}
              </button>
              {t.fkGoesInto(name(pc.child.entityId), name(pc.parent.entityId))[2]}
            </p>
          )}
          <div className="two-col">
            <label className="field">
              <span>ON DELETE</span>
              <select value={rel.onDelete} onChange={(ev) => setRel({ onDelete: ev.target.value as RefAction })}>
                {ACTIONS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>ON UPDATE</span>
              <select value={rel.onUpdate} onChange={(ev) => setRel({ onUpdate: ev.target.value as RefAction })}>
                {ACTIONS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
