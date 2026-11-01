import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { Note } from '../model/types';
import { useI18n } from '../i18n';

export type NoteNodeType = Node<{ note: Note }, 'note'>;

function NoteNodeImpl({ data, selected }: NodeProps<NoteNodeType>) {
  const { t } = useI18n();
  const { text, fontSize, bold, italic, underline } = data.note;
  const style: React.CSSProperties = {
    fontSize,
    fontWeight: bold ? 700 : undefined,
    fontStyle: italic ? 'italic' : undefined,
    textDecoration: underline ? 'underline' : undefined,
  };
  return (
    <div className={`note${selected ? ' selected' : ''}${text.trim() ? '' : ' empty'}`} style={style}>
      {text.trim() ? text : <em>{t.emptyNote}</em>}
    </div>
  );
}

export const NoteNode = memo(NoteNodeImpl);
