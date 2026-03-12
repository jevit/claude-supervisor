import React, { useState, useEffect } from 'react';

const CATEGORY_LABELS = {
  context_loss: 'Perte de contexte',
  coordination: 'Coordination',
  visibility: 'Visibilite',
  conflict: 'Conflits',
  cognitive_load: 'Charge cognitive',
  communication: 'Communication',
  state_management: 'Gestion d\'etat',
  error_propagation: 'Propagation d\'erreurs',
};

const IMPACT_COLORS = {
  5: '#ef4444',
  4: '#f97316',
  3: '#eab308',
  2: '#22c55e',
  1: '#6b7280',
};

export default function Irritants() {
  const [irritants, setIrritants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [analyzing, setAnalyzing] = useState(false);

  const fetchIrritants = async () => {
    try {
      const res = await fetch('/api/irritants');
      const data = await res.json();
      setIrritants(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => { fetchIrritants(); }, []);

  const loadKnown = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/irritants/load-known', { method: 'POST' });
      const data = await res.json();
      setIrritants(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  };

  const analyzeWithAI = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/irritants/analyze', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        alert('Erreur: ' + data.error);
      } else {
        await fetchIrritants();
      }
    } catch (err) {
      alert('API Anthropic non disponible');
    }
    setAnalyzing(false);
  };

  const categories = ['all', ...Object.keys(CATEGORY_LABELS)];
  const filtered = filter === 'all' ? irritants : irritants.filter((i) => i.category === filter);

  return (
    <div>
      <div className="page-header">
        <h2>Irritants & Points de Friction</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={loadKnown} disabled={loading}>
            {loading ? 'Chargement...' : 'Charger irritants connus'}
          </button>
          <button className="btn btn-secondary" onClick={analyzeWithAI} disabled={analyzing}>
            {analyzing ? 'Analyse IA...' : 'Analyser avec IA'}
          </button>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`btn ${filter === cat ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(cat)}
            style={{ fontSize: 12, padding: '4px 10px' }}
          >
            {cat === 'all' ? 'Tous' : CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
          Aucun irritant. Cliquez "Charger irritants connus" pour commencer.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.sort((a, b) => b.impact - a.impact).map((irritant, i) => (
            <div key={i} className="card" style={{ borderLeft: `4px solid ${IMPACT_COLORS[irritant.impact] || '#6b7280'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="status-badge" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent)', fontSize: 11 }}>
                  {CATEGORY_LABELS[irritant.category] || irritant.category}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: IMPACT_COLORS[irritant.impact] }}>
                  Impact: {irritant.impact}/5
                </span>
              </div>
              <p style={{ margin: '8px 0', fontSize: 14 }}>{irritant.description}</p>
              {irritant.solution && (
                <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: 6, fontSize: 13 }}>
                  <strong>Solution:</strong> {irritant.solution}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); }
      `}</style>
    </div>
  );
}
