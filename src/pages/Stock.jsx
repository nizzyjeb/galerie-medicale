import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'

const fmtDate = (d) => d ? new Date(d).toLocaleString('fr-FR') : '—'
const num = (n) => (Number(n) || 0).toLocaleString('fr-FR')

const TYPE_LABEL = {
  entree: { label: 'Entrée', color: '#1A9E8F' },
  sortie: { label: 'Sortie', color: '#ef4444' },
  ajustement: { label: 'Ajustement', color: '#f59e0b' },
}

export default function Stock() {
  const { user, isAdmin } = useAuth()
  const [produits, setProduits] = useState([])
  const [mouvements, setMouvements] = useState([])
  const [loading, setLoading] = useState(true)
  const [onglet, setOnglet] = useState('niveaux')
  const [recherche, setRecherche] = useState('')

  const [mvtModal, setMvtModal] = useState(null)
  const [cfgModal, setCfgModal] = useState(null)

  const charger = async () => {
    setLoading(true)
    const [p, m] = await Promise.all([
      supabase.from('produits').select('*').eq('actif', true).order('designation'),
      supabase.from('mouvements_stock').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    setProduits(p.data || [])
    setMouvements(m.data || [])
    setLoading(false)
  }

  useEffect(() => { charger() }, [])

  const suivis = produits.filter(p => p.stock_gere)
  const alertes = suivis.filter(p => Number(p.stock_actuel) <= Number(p.seuil_alerte) && Number(p.seuil_alerte) > 0)

  const filtres = produits.filter(p => {
    const t = recherche.toLowerCase()
    return !t || (p.designation || '').toLowerCase().includes(t) || (p.reference || '').toLowerCase().includes(t)
  })

  const basculerSuivi = async (p) => {
    const { error } = await supabase.from('produits')
      .update({ stock_gere: !p.stock_gere, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (error) { toast.error('Erreur'); return }
    charger()
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Gestion de stock</h1>
        <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4 }}>Niveaux, alertes et mouvements</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard titre="Produits suivis" valeur={suivis.length} couleur="var(--teal)" />
        <StatCard titre="Alertes stock bas" valeur={alertes.length} couleur={alertes.length ? '#ef4444' : '#94a3b8'} />
        <StatCard titre="Mouvements (100 derniers)" valeur={mouvements.length} couleur="#3b82f6" />
      </div>

      {alertes.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #ef4444', background: '#fef2f2' }}>
          <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>⚠ {alertes.length} produit{alertes.length > 1 ? 's' : ''} sous le seuil d'alerte</div>
          <div style={{ fontSize: 13, color: '#7f1d1d' }}>
            {alertes.map(p => `${p.designation} (${num(p.stock_actuel)}/${num(p.seuil_alerte)})`).join(' · ')}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={() => setOnglet('niveaux')}
          style={{ background: onglet === 'niveaux' ? 'var(--teal)' : '#fff', color: onglet === 'niveaux' ? '#fff' : 'var(--gray)', border: '1px solid #e2e8f0' }}>
          Niveaux de stock
        </button>
        <button className="btn" onClick={() => setOnglet('historique')}
          style={{ background: onglet === 'historique' ? 'var(--teal)' : '#fff', color: onglet === 'historique' ? '#fff' : 'var(--gray)', border: '1px solid #e2e8f0' }}>
          Historique des mouvements
        </button>
      </div>

      {onglet === 'niveaux' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <input placeholder="Rechercher un produit…" value={recherche} onChange={e => setRecherche(e.target.value)}
              style={{ width: '100%', padding: 10, border: '1px solid #e2e8f0', borderRadius: 8 }} />
          </div>
          <div className="card">
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
            ) : (
              <div className="table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #eef2f5' }}>
                      <th style={{ padding: 10 }}>Réf.</th>
                      <th style={{ padding: 10 }}>Désignation</th>
                      <th style={{ padding: 10 }}>Suivi</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Stock</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Seuil</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtres.map(p => {
                      const bas = p.stock_gere && Number(p.seuil_alerte) > 0 && Number(p.stock_actuel) <= Number(p.seuil_alerte)
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: bas ? '#fef2f2' : 'transparent' }}>
                          <td style={{ padding: 10 }}>{p.reference}</td>
                          <td style={{ padding: 10, fontWeight: 600 }}>{p.designation}</td>
                          <td style={{ padding: 10 }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                              <input type="checkbox" checked={!!p.stock_gere} onChange={() => basculerSuivi(p)} />
                              {p.stock_gere ? 'Oui' : 'Non'}
                            </label>
                          </td>
                          <td style={{ padding: 10, textAlign: 'right', fontWeight: 700, color: bas ? '#b91c1c' : 'inherit' }}>
                            {p.stock_gere ? num(p.stock_actuel) : '—'} <span style={{ fontWeight: 400, color: 'var(--gray)', fontSize: 12 }}>{p.unite}</span>
                          </td>
                          <td style={{ padding: 10, textAlign: 'right', color: 'var(--gray)' }}>
                            {p.stock_gere ? num(p.seuil_alerte) : '—'}
                          </td>
                          <td style={{ padding: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {p.stock_gere && (
                              <button className="btn btn-primary" onClick={() => setMvtModal(p)} style={{ padding: '4px 10px', fontSize: 13, marginRight: 6 }}>Mouvement</button>
                            )}
                            <button className="btn" onClick={() => setCfgModal(p)} style={{ padding: '4px 10px', fontSize: 13 }}>Config</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {onglet === 'historique' && (
        <div className="card">
          {mouvements.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Aucun mouvement enregistré.</div>
          ) : (
            <div className="table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid #eef2f5' }}>
                    <th style={{ padding: 10 }}>Date</th>
                    <th style={{ padding: 10 }}>Produit</th>
                    <th style={{ padding: 10 }}>Type</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Quantité</th>
                    <th style={{ padding: 10 }}>Motif</th>
                    <th style={{ padding: 10 }}>Référence</th>
                  </tr>
                </thead>
                <tbody>
                  {mouvements.map(m => {
                    const t = TYPE_LABEL[m.type] || TYPE_LABEL.ajustement
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 10, color: 'var(--gray)', fontSize: 13 }}>{fmtDate(m.created_at)}</td>
                        <td style={{ padding: 10 }}>{m.produit_designation || '—'}</td>
                        <td style={{ padding: 10 }}>
                          <span className="badge" style={{ background: t.color, color: '#fff' }}>{t.label}</span>
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', fontWeight: 700, color: Number(m.quantite) < 0 ? '#ef4444' : '#1A9E8F' }}>
                          {Number(m.quantite) > 0 ? '+' : ''}{num(m.quantite)}
                        </td>
                        <td style={{ padding: 10, fontSize: 13 }}>{m.motif || '—'}</td>
                        <td style={{ padding: 10, fontSize: 13, color: 'var(--gray)' }}>{m.reference_doc || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mvtModal && (
        <MouvementModal produit={mvtModal} user={user} onClose={() => setMvtModal(null)} onSaved={charger} />
      )}
      {cfgModal && (
        <ConfigModal produit={cfgModal} onClose={() => setCfgModal(null)} onSaved={charger} />
      )}
    </div>
  )
}

function StatCard({ titre, valeur, couleur }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: couleur }}>{valeur}</div>
      <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>{titre}</div>
    </div>
  )
}

function MouvementModal({ produit, user, onClose, onSaved }) {
  const [mode, setMode] = useState('entree')
  const [valeur, setValeur] = useState('')
  const [motif, setMotif] = useState('')
  const [saving, setSaving] = useState(false)

  const enregistrer = async () => {
    const v = Number(valeur)
    if (isNaN(v)) { toast.error('Saisissez une quantité'); return }
    let delta, type
    if (mode === 'entree') { delta = Math.abs(v); type = 'entree' }
    else if (mode === 'sortie') { delta = -Math.abs(v); type = 'sortie' }
    else { delta = v - Number(produit.stock_actuel || 0); type = 'ajustement' }

    if (delta === 0) { toast.error('Aucun changement'); return }
    setSaving(true)
    const { error } = await supabase.rpc('fn_appliquer_mouvement', {
      p_produit_id: produit.id, p_type: type, p_delta: delta,
      p_motif: motif || (mode === 'entree' ? 'Entrée manuelle' : mode === 'sortie' ? 'Sortie manuelle' : 'Correction de stock'),
      p_ref: null, p_user: user?.id || null,
    })
    setSaving(false)
    if (error) { toast.error('Erreur lors du mouvement'); return }
    toast.success('Mouvement enregistré')
    onSaved?.()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="card-title">Mouvement — {produit.designation}</div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, fontSize: 13 }}>
            Stock actuel : <strong>{num(produit.stock_actuel)} {produit.unite}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['entree', 'Entrée'], ['sortie', 'Sortie'], ['ajustement', 'Correction']].map(([k, lbl]) => (
              <button key={k} className="btn" onClick={() => setMode(k)}
                style={{ flex: 1, background: mode === k ? 'var(--teal)' : '#fff', color: mode === k ? '#fff' : 'var(--gray)', border: '1px solid #e2e8f0' }}>
                {lbl}
              </button>
            ))}
          </div>
          <div>
            <label style={labelStyle}>{mode === 'ajustement' ? 'Nouveau stock (valeur exacte)' : 'Quantité'}</label>
            <input type="number" value={valeur} onChange={e => setValeur(e.target.value)} style={inputStyle} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Motif</label>
            <input value={motif} onChange={e => setMotif(e.target.value)} style={inputStyle}
              placeholder={mode === 'sortie' ? 'Ex : casse, péremption…' : 'Optionnel'} />
          </div>
        </div>
        <div style={{ padding: 16, borderTop: '1px solid #eef2f5', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={enregistrer} disabled={saving}>
            {saving ? '…' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfigModal({ produit, onClose, onSaved }) {
  const [gere, setGere] = useState(!!produit.stock_gere)
  const [seuil, setSeuil] = useState(produit.seuil_alerte ?? 0)
  const [saving, setSaving] = useState(false)

  const enregistrer = async () => {
    setSaving(true)
    const { error } = await supabase.from('produits').update({
      stock_gere: gere, seuil_alerte: Number(seuil) || 0, updated_at: new Date().toISOString(),
    }).eq('id', produit.id)
    setSaving(false)
    if (error) { toast.error('Erreur'); return }
    toast.success('Configuration enregistrée')
    onSaved?.()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="card-title">Configuration — {produit.designation}</div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={gere} onChange={e => setGere(e.target.checked)} />
            Suivre le stock de ce produit
          </label>
          <div>
            <label style={labelStyle}>Seuil d'alerte (stock bas)</label>
            <input type="number" value={seuil} onChange={e => setSeuil(e.target.value)} style={inputStyle} disabled={!gere} />
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
              Une alerte s'affiche lorsque le stock passe à ce niveau ou en dessous.
            </div>
          </div>
        </div>
        <div style={{ padding: 16, borderTop: '1px solid #eef2f5', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={enregistrer} disabled={saving}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 12, color: 'var(--gray)', marginBottom: 4, fontWeight: 600 }
const inputStyle = { width: '100%', padding: 9, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }
