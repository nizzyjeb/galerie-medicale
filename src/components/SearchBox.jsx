// Champ de recherche avec loupe, utilisé sur les pages Factures et Pro Forma

const normaliser = (v) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

// Un document correspond si TOUS les mots tapés se retrouvent dans au moins un de ses champs
// (n°, client, objet, vendeur, NIF, dates, montants avec ou sans espaces).
export function correspond(doc, recherche, fmtDate) {
  const q = normaliser(recherche)
  if (!q) return true
  const montants = [doc.total_ttc, doc.base_ht].filter(m => m != null).flatMap(m => {
    const n = Math.round(Number(m) || 0)
    return [String(n), n.toLocaleString('fr-FR')]
  })
  const texte = normaliser([
    doc.numero, doc.client_nom, doc.objet, doc.client_nif, doc.client_adresse,
    doc.vendeur, doc.vendeur_nom, doc.commercial_nom, doc.notes,
    fmtDate ? fmtDate(doc.date_emission) : doc.date_emission,
    fmtDate ? fmtDate(doc.date_echeance) : doc.date_echeance,
    ...montants,
  ].join(' | '))
  return q.split(' ').every(mot => texte.includes(mot))
}

export default function SearchBox({ value, onChange, placeholder = 'Rechercher…', total, trouves }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 320, maxWidth: '100%' }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
          style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}>
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3.5 3.5" />
        </svg>
        <input
          type="search"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onChange('')}
          placeholder={placeholder}
          aria-label="Rechercher"
          style={{
            width: '100%', padding: '8px 32px 8px 34px', fontSize: 13,
            border: '1px solid var(--border)', borderRadius: 8, background: '#fff', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--teal)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            title="Effacer la recherche"
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: 14, padding: 4 }}
          >✕</button>
        )}
      </div>
      {value && total != null && (
        <span style={{ fontSize: 12, color: 'var(--gray)' }}>{trouves} résultat{trouves > 1 ? 's' : ''} sur {total}</span>
      )}
    </div>
  )
}
