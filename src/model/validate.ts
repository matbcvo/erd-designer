import type { Model, Selection } from './types';
import type { IssueCode, IssueParams } from '../i18n';

export interface Issue {
  level: 'error' | 'warning';
  code: IssueCode;
  params: IssueParams;
  target: Selection;
}

export function validate(model: Model): Issue[] {
  const issues: Issue[] = [];
  const push = (level: Issue['level'], code: IssueCode, params: IssueParams, target: Selection) => issues.push({ level, code, params, target });
  const names = new Map<string, number>();
  for (const e of model.entities) names.set(e.name.trim().toLowerCase(), (names.get(e.name.trim().toLowerCase()) ?? 0) + 1);

  for (const e of model.entities) {
    const target: Selection = { kind: 'entity', id: e.id };
    const entity = e.name || '?';
    if (!e.name.trim()) push('error', 'entityNoName', {}, target);
    else if ((names.get(e.name.trim().toLowerCase()) ?? 0) > 1) push('error', 'entityDuplicate', { entity }, target);
    if (!e.attributes.length) push('warning', 'entityNoAttributes', { entity }, target);
    else if (!e.attributes.some((a) => a.pk)) push('warning', 'entityNoPk', { entity }, target);

    const attrNames = new Set<string>();
    for (const a of e.attributes) {
      const n = a.name.trim().toLowerCase();
      if (!n) push('error', 'attrNoName', { entity }, target);
      else if (attrNames.has(n)) push('error', 'attrDuplicate', { entity, attr: a.name }, target);
      attrNames.add(n);
      if (!a.type.trim()) push('warning', 'attrNoType', { entity, attr: a.name }, target);
    }
  }

  for (const r of model.relationships) {
    const target: Selection = { kind: 'relationship', id: r.id };
    const a = model.entities.find((e) => e.id === r.source.entityId)?.name ?? '?';
    const b = model.entities.find((e) => e.id === r.target.entityId)?.name ?? '?';
    const s = r.source;
    const t = r.target;
    if (s.entityId === t.entityId) {
      // A recursive relationship can only be "zero or one – zero, one or many" (course rule).
      const ok =
        (s.min === 0 && s.max === 'one' && t.min === 0 && t.max === 'many') || (t.min === 0 && t.max === 'one' && s.min === 0 && s.max === 'many');
      if (!ok) push('warning', 'recursiveCardinality', { entity: a }, target);
      continue;
    }
    if (s.max === 'many' && t.max === 'many') push('warning', 'manyToMany', { a, b }, target);
    if (s.min === 1 && t.min === 1 && s.max === 'one' && t.max === 'one') push('warning', 'oneToOneMandatory', { a, b }, target);
  }
  return issues;
}
