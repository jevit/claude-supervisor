import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Combobox réutilisable avec historique localStorage.
 * Props:
 *   value, onChange        — champ contrôlé
 *   placeholder            — placeholder input
 *   storageKey             — clé localStorage (ex: 'cs:dir-history')
 *   maxItems               — taille max de l'historique (défaut 15)
 *   itemIcon               — icône affichée devant chaque entrée (ex: '📁')
 *   inputStyle             — style supplémentaire pour l'input
 *   inputClassName         — classe CSS supplémentaire pour l'input
 *   onSelect               — appelé quand une entrée est sélectionnée (optionnel, sinon onChange suffit)
 */
export function useComboHistory(storageKey, maxItems = 15) {
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });

  const save = useCallback((value) => {
    if (!value?.trim()) return;
    setHistory((prev) => {
      const next = [value.trim(), ...prev.filter((x) => x !== value.trim())].slice(0, maxItems);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey, maxItems]);

  const remove = useCallback((value) => {
    setHistory((prev) => {
      const next = prev.filter((x) => x !== value);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  return { history, save, remove };
}

export default function ComboBox({
  value,
  onChange,
  placeholder = '',
  storageKey,
  maxItems = 15,
  itemIcon = null,
  inputStyle = {},
  inputClassName = 'form-input',
  onSelect,
}) {
  const { history, remove } = useComboHistory(storageKey, maxItems);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Fermer sur clic extérieur
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = (value || '').toLowerCase();
  const filtered = history.filter((item) => !q || item.toLowerCase().includes(q));

  const handleSelect = (item) => {
    onChange(item);
    onSelect?.(item);
    setOpen(false);
  };

  const hasHistory = history.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => hasHistory && setOpen(true)}
          placeholder={placeholder}
          className={inputClassName}
          style={{ paddingRight: hasHistory ? 26 : undefined, ...inputStyle }}
        />
        {hasHistory && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              position: 'absolute', right: 6, background: 'none', border: 'none',
              color: '#565f89', cursor: 'pointer', padding: '0 2px', fontSize: 10, lineHeight: 1,
            }}
          >
            {open ? '▲' : '▼'}
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#1f2335', border: '1px solid #3b4261', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 2,
          maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #2a2b3d' }}>
              <button
                type="button"
                onClick={() => handleSelect(item)}
                title={item}
                style={{
                  flex: 1, background: 'none', border: 'none', color: '#c0caf5',
                  cursor: 'pointer', padding: '7px 10px', textAlign: 'left',
                  fontSize: 12, fontFamily: 'monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {itemIcon && <span style={{ color: '#565f89', marginRight: 5 }}>{itemIcon}</span>}
                {item}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(item); }}
                title="Retirer de l'historique"
                style={{
                  background: 'none', border: 'none', color: '#565f89',
                  cursor: 'pointer', padding: '7px 8px', fontSize: 11, flexShrink: 0,
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
