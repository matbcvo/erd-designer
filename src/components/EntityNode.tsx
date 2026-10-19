import { memo } from 'react';
import { Handle, Position, useConnection, type Node, type NodeProps } from '@xyflow/react';
import type { Entity } from '../model/types';
import { useI18n } from '../i18n';

export type EntityNodeData = {
  entity: Entity;
  /** attribute id -> "Parent.column" for FK columns */
  fkTargets: Record<string, string>;
  showTypes: boolean;
};
const SIDES = [
  [Position.Top, 'top'],
  [Position.Right, 'right'],
  [Position.Bottom, 'bottom'],
  [Position.Left, 'left'],
] as const;

export type EntityNodeType = Node<EntityNodeData, 'entity'>;

function EntityNodeImpl({ id, data, selected }: NodeProps<EntityNodeType>) {
  const { t } = useI18n();
  const connection = useConnection();
  const isConnecting = connection.inProgress;
  const { entity, fkTargets, showTypes } = data;

  return (
    <div
      className={`entity${selected ? ' selected' : ''}${entity.attributes.length === 0 ? ' no-attrs' : ''}`}
      style={entity.color ? ({ '--entity-color': entity.color } as React.CSSProperties) : undefined}
      title={entity.comment}
    >
      <div className="entity-header">{entity.name || <em>{t.unnamed}</em>}</div>
      {entity.attributes.length > 0 && (
        <table className="entity-attrs">
          <tbody>
            {entity.attributes.map((a, i) => {
              const lastPk = a.pk && !entity.attributes[i + 1]?.pk;
              return (
                <tr key={a.id} className={lastPk ? 'pk-divider' : undefined} title={a.fk ? `→ ${fkTargets[a.id] ?? ''}` : a.comment}>
                  <td className="attr-keys">
                    {a.pk && <span className="badge pk">PK</span>}
                    {a.fk && <span className="badge fk">FK</span>}
                    {a.unique && !a.pk && <span className="badge uq">U</span>}
                  </td>
                  <td className={`attr-name${a.pk ? ' is-pk' : ''}${!a.nullable || a.pk ? ' not-null' : ''}`}>
                    {a.name || <em>{t.unnamed}</em>}
                  </td>
                  {showTypes && <td className="attr-type">{a.type}</td>}
                  {showTypes && <td className="attr-null">{a.nullable && !a.pk ? 'NULL' : ''}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {/* Drag from any of these dots to another entity to create a relationship. */}
      {SIDES.map(([pos, side]) => (
        <Handle key={side} type="source" position={pos} id={`out-${side}`} className={`connect-handle ${side}`} title={t.dragToConnect} />
      ))}
      {/* Whole-node drop target, active only while a connection is being dragged. */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="drop-target"
        style={{ pointerEvents: isConnecting ? 'all' : 'none' }}
        isConnectableStart={false}
        data-node={id}
      />
    </div>
  );
}

export const EntityNode = memo(EntityNodeImpl);
