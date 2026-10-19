import { useEffect, useMemo, useState } from 'react';
import type { Model } from '../model/types';
import { DIALECTS, generateSql, type Dialect } from '../model/sql';
import { downloadText, slug } from '../export';
import { useI18n } from '../i18n';

const PREF_KEY = 'erd-modeler:sql-dialect';

function savedDialect(): Dialect {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v && DIALECTS.some((d) => d.id === v)) return v as Dialect;
  } catch {
    /* ignore */
  }
  return 'postgresql';
}

export function SqlDialog({ model, onClose }: { model: Model; onClose: () => void }) {
  const { t } = useI18n();
  const [dialect, setDialect] = useState<Dialect>(savedDialect);
  const [dropTables, setDropTables] = useState(false);
  const [copied, setCopied] = useState(false);
  const sql = useMemo(() => generateSql(model, { dialect, dropTables }), [model, dialect, dropTables]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, dialect);
    } catch {
      /* ignore */
    }
  }, [dialect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: user can still select the text */
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={t.sqlTitle}>
        <div className="modal-head">
          <h2>{t.sqlTitle}</h2>
          <button className="icon" onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </div>
        <div className="modal-controls">
          <label>
            {t.database}{' '}
            <select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
              {DIALECTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={dropTables} onChange={(e) => setDropTables(e.target.checked)} />
            <span>{t.dropTables}</span>
          </label>
          <span className="spacer" />
          <button onClick={copy}>{copied ? t.copied : t.copy}</button>
          <button className="primary" onClick={() => downloadText(sql, `${slug(model.name)}.sql`, 'application/sql')}>
            {t.downloadSql}
          </button>
        </div>
        <textarea className="sql-output" readOnly value={sql} spellCheck={false} />
      </div>
    </div>
  );
}
