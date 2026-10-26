import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfils } from '../components/Tracabilite'
import toast from 'react-hot-toast'

// ─── Gestion de stock ───────────────────────────────────────────────────────
// 1. Stock initial : saisi par l'admin, le comptable / secrétaire ou le responsable logistique,
//    modifiable tant qu'il n'est pas validé. Un administrateur le valide → il est verrouillé.
// 2. Ensuite, le stock n'évolue que par des mouvements (entrées / sorties) enregistrés et non modifiables.
//    Les corrections sont réservées à l'administrateur, avec motif obligatoire.
// Toutes ces règles sont aussi imposées par la base de données (supabase_migration_stock_initial.sql).

const fmtDateHeure = (d) => d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const num = (n) => (Number(n) || 0).toLocaleString('fr-FR')
const msgErreur = (e) => (e?.message || 'Erreur').replace(/^.*?ERROR:\s*/, '')

const TYPE_LABEL = {
  initial:    { label: 'Stock initial', color: '#3b82f6' },
  validation: { label: 'Validation',    color: '#166534' },
  entree:     { label: 'Entrée',        color: '#1A9E8F' },
  sortie:     { label: 'Sortie',        color: '#ef4444' },
  ajustement: { label: 'Correction',    color: '#f59e0b' },
}

const etatInitial = (p) => p.stock_initial_valide ? 'valide' : p.stock_initial_saisi_le ? 'attente' : 'a_saisir'

export default function Stock() {
  const { user, isAdmin, profile } = useAuth()
  const peutSaisir = ['admin', 'comptable', 'logistique'].includes(profile?.role)
  const profils = useProfils()
  const nom = (id) => (id ? (profils[id] || '—') : '—')

  const [produits, setProduits] = useState([])
  const [mouvements, setMouvements] = useState([])
  const [loading, setLoading] = useState(true)
  const [onglet, setOnglet] = useState('niveaux')
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState('tous')
  const [selection, setSelection] = useState([])
  const [migrationOk, setMigrationOk] = useState(true)

  const [initModal, setInitModal] = useState(null)
  const [mvtModal, setMvtModal] = useState(null)
  const [cfgModal, setCfgModal] = useState(null)

  const charger = async () => {
    setLoading(true)
    const [p, m] = await Promise.all([
      supabase.from('produits').select('*').eq('actif', true).order('designation'),
      supabase.from('mouvements_stock').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    const liste = p.data || []
    setProduits(liste)
    setMouvements(m.data || [])
    setMigrationOk(liste.length === 0 || 'stock_initial_valide' in liste[0])
    setSelection([])
    setLoading(false)
  }

  useEffect(() => { charger() }, [])

  const suivis = produits.filter(p => p.stock_gere)
  const alertes = suivis.filter(p => p.stock_initial_valide && Number(p.seuil_alerte) > 0 && Number(p.stock_actuel) <= Number(p.seuil_alerte))
  const enAttente = produits.filter(p => etatInitial(p) === 'attente')
  const valides = produits.filter(p => etatInitial(p) === 'valide')

  const t = recherche.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const filtres = produits.filter(p => {
    const txt = `${p.designation || ''} ${p.reference || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (t && !t.split(/\s+/).every(m => txt.includes(m))) return false
    if (filtre === 'a_saisir') return etatInitial(p) === 'a_saisir'
    if (filtre === 'attente') return etatInitial(p) === 'attente'
    if (filtre === 'valide') return etatInitial(p) === 'valide'
    if (filtre === 'bas') return alertes.includes(p)
    return true
  })

  const valider = async (ids) => {
    const prods = produits.filter(p => ids.includes(p.id))
    const liste = prods.map(p => `• ${p.designation} : ${num(p.stock_initial)} ${p.unite || ''}`).join('\n')
    if (!window.confirm(`Valider et verrouiller ${prods.length} stock(s) initial(aux) ?\n\n${liste}\n\nUne fois validés, ils ne pourront plus être modifiés. Le stock n'évoluera ensuite que par des entrées et sorties.`)) return
    const { data, error } = await supabase.rpc('fn_stock_valider_initial', { p_ids: ids })
    if (error) { toast.error(msgErreur(error)); return }
    toast.success(`${data} stock(s) initial(aux) validé(s) et verrouillé(s)`)
    charger()
  }

  const toutCocher = (on) => setSelection(on ? filtres.filter(p => etatInitial(p) === 'attente').map(p => p.id) : [])
  const selectionnables = filtres.filter(p => etatInitial(p) === 'attente')

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Gestion de stock</h1>
        <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4 }}>Stock initial, niveaux, alertes et mouvements</div>
      </div>

      {!migrationOk && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #ef4444', background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
          La mise à jour de la base de données « stock initial » n'a pas encore été appliquée dans Supabase. La saisie du stock ne fonctionnera qu'après son exécution.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard titre="Stocks initiaux à saisir" valeur={produits.length - enAttente.length - valides.length} couleur="#94a3b8" onClick={() => { setOnglet('niveaux'); setFiltre('a_saisir') }} />
        <StatCard titre="En attente de validation" valeur={enAttente.length} couleur="#f59e0b" onClick={() => { setOnglet('niveaux'); setFiltre('attente') }} />
        <StatCard titre="Stocks validés" valeur={valides.length} couleur="var(--teal)" onClick={() => { setOnglet('niveaux'); setFiltre('valide') }} />
        <StatCard titre="Alertes stock bas" valeur={alertes.length} couleur={alertes.length ? '#ef4444' : '#94a3b8'} onClick={() => { setOnglet('niveaux'); setFiltre('bas') }} />
      </div>

      {isAdmin && enAttente.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #f59e0b', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#92400e' }}>
            <b>{enAttente.length} stock(s) initial(aux)</b> saisi(s) attendent votre validation.
          </div>
          <button className="btn btn-primary" onClick={() => valider(enAttente.map(p => p.id))}>✓ Tout valider</button>
        </div>
      )}

      {alertes.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #ef4444', background: '#fef2f2' }}>
          <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>⚠ {alertes.length} produit{alertes.length > 1 ? 's' : ''} sous le seuil d'alerte</div>
          <div style={{ fontSize: 13, color: '#7f1d1d' }}>
            {alertes.map(p => `${p.designation} (${num(p.stock_actuel)}/${num(p.seuil_alerte)})`).join(' · ')}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['niveaux', 'Niveaux de stock'], ['historique', 'Historique des mouvements']].map(([k, lbl]) => (
          <button key={k} className="btn" onClick={() => setOnglet(k)}
            style={{ background: onglet === k ? 'var(--teal)' : '#fff', color: onglet === k ? '#fff' : 'var(--gray)', border: '1px solid #e2e8f0' }}>
            {lbl}
          </button>
        ))}
      </div>

      {onglet === 'niveaux' && (
        <>
          <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 260px' }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)' }}>
                <circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" />
              </svg>
              <input placeholder="Rechercher un produit (désignation, référence)…" value={recherche} onChange={e => setRecherche(e.target.value)}
                style={{ width: '100%', padding: '9px 10px 9px 34px', border: '1px solid #e2e8f0', borderRadius: 8 }} />
            </div>
            <select value={filtre} onChange={e => setFiltre(e.target.value)} style={{ padding: 9, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
              <option value="tous">Tous les produits</option>
              <option value="a_saisir">Stock initial à saisir</option>
              <option value="attente">En attente de validation</option>
              <option value="valide">Stock validé</option>
              <option value="bas">Stock bas</option>
            </select>
            {isAdmin && selection.length > 0 && (
              <button className="btn btn-primary" onClick={() => valider(selection)}>✓ Valider la sélection ({selection.length})</button>
            )}
          </div>

          <div className="card">
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
            ) : (
              <div className="table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #eef2f5' }}>
                      {isAdmin && (
                        <th style={{ padding: 10, width: 30 }}>
                          <input type="checkbox" title="Sélectionner les stocks en attente de validation"
                            disabled={selectionnables.length === 0}
                            checked={selectionnables.length > 0 && selection.length === selectionnables.length}
                            onChange={e => toutCocher(e.target.checked)} />
                        </th>
                      )}
                      <th style={{ padding: 10 }}>Réf.</th>
                      <th style={{ padding: 10 }}>Désignation</th>
                      <th style={{ padding: 10 }}>Stock initial</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Stock actuel</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Seuil</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtres.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Aucun produit</td></tr>
                    )}
                    {filtres.map(p => {
                      const etat = etatInitial(p)
                      const bas = alertes.includes(p)
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: bas ? '#fef2f2' : 'transparent' }}>
                          {isAdmin && (
                            <td style={{ padding: 10 }}>
                              {etat === 'attente' && (
                                <input type="checkbox" checked={selection.includes(p.id)}
                                  onChange={e => setSelection(s => e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id))} />
                              )}
                            </td>
                          )}
                          <td style={{ padding: 10 }}>{p.reference}</td>
                          <td style={{ padding: 10, fontWeight: 600 }}>{p.designation}</td>
                          <td style={{ padding: 10, fontSize: 12 }}>
                            {etat === 'a_saisir' && <span className="badge" style={{ background: '#f1f5f9', color: '#64748b' }}>À saisir</span>}
                            {etat === 'attente' && (
                              <>
                                <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>⏳ {num(p.stock_initial)} — à valider</span>
                                <div style={{ color: 'var(--gray)', marginTop: 3 }}>Saisi par {nom(p.stock_initial_saisi_par)} · {fmtDateHeure(p.stock_initial_saisi_le)}</div>
                              </>
                            )}
                            {etat === 'valide' && (
                              <>
                                <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>🔒 {num(p.stock_initial)} — validé</span>
                                <div style={{ color: 'var(--gray)', marginTop: 3 }}>Par {nom(p.stock_initial_valide_par)} · {fmtDateHeure(p.stock_initial_valide_le)}</div>
                              </>
                            )}
                          </td>
                          <td style={{ padding: 10, textAlign: 'right', fontWeight: 700, color: bas ? '#b91c1c' : 'inherit' }}>
                            {p.stock_gere ? num(p.stock_actuel) : '—'} <span style={{ fontWeight: 400, color: 'var(--gray)', fontSize: 12 }}>{p.unite}</span>
                          </td>
                          <td style={{ padding: 10, textAlign: 'right', color: 'var(--gray)' }}>
                            {p.stock_gere ? num(p.seuil_alerte) : '—'}
                          </td>
                          <td style={{ padding: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {peutSaisir && etat !== 'valide' && (
                              <button className="btn btn-primary" onClick={() => setInitModal(p)} style={btnSm}>
                                {etat === 'a_saisir' ? 'Saisir stock initial' : 'Modifier la saisie'}
                              </button>
                            )}
                            {isAdmin && etat === 'attente' && (
                              <button className="btn" onClick={() => valider([p.id])}
                                style={{ ...btnSm, background: '#16a34a', color: '#fff', border: 'none' }}>✓ Valider</button>
                            )}
                            {peutSaisir && etat === 'valide' && p.stock_gere && (
                              <button className="btn btn-primary" onClick={() => setMvtModal(p)} style={btnSm}>Entrée / Sortie</button>
                            )}
                            {peutSaisir && (
                              <button className="btn" onClick={() => setCfgModal(p)} style={btnSm}>Seuil</button>
                            )}
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
                    <th style={{ padding: 10 }}>Date et heure</th>
                    <th style={{ padding: 10 }}>Produit</th>
                    <th style={{ padding: 10 }}>Type</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Quantité</th>
                    <th style={{ padding: 10 }}>Motif</th>
                    <th style={{ padding: 10 }}>Référence</th>
                    <th style={{ padding: 10 }}>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {mouvements.map(m => {
                    const ty = TYPE_LABEL[m.type] || TYPE_LABEL.ajustement
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 10, color: 'var(--gray)', fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDateHeure(m.created_at)}</td>
                        <td style={{ padding: 10 }}>{m.produit_designation || '—'}</td>
                        <td style={{ padding: 10 }}>
                          <span className="badge" style={{ background: ty.color, color: '#fff' }}>{ty.label}</span>
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', fontWeight: 700, color: Number(m.quantite) < 0 ? '#ef4444' : '#1A9E8F' }}>
                          {m.type === 'validation' ? '—' : <>{Number(m.quantite) > 0 ? '+' : ''}{num(m.quantite)}</>}
                        </td>
                        <td style={{ padding: 10, fontSize: 13 }}>{m.motif || '—'}</td>
                        <td style={{ padding: 10, fontSize: 13, color: 'var(--gray)' }}>{m.reference_doc || '—'}</td>
                        <td style={{ padding: 10, fontSize: 13 }}>{nom(m.created_by)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray)', borderTop: '1px solid #eef2f5' }}>
            🔒 Les mouvements enregistrés ne peuvent être ni modifiés ni supprimés.
          </div>
        </div>
      )}

      {initModal && <InitialModal produit={initModal} onClose={() => setInitModal(null)} onSaved={charger} />}
      {mvtModal && <MouvementModal produit={mvtModal} isAdmin={isAdmin} onClose={() => setMvtModal(null)} onSaved={charger} />}
      {cfgModal && <ConfigModal produit={cfgModal} isAdmin={isAdmin} onClose={() => setCfgModal(null)} onSaved={charger} />}
    </div>
  )
}

function StatCard({ titre, valeur, couleur, onClick }) {
  return (
    <div className="card" style={{ textAlign: 'center', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{ fontSize: 28, fontWeight: 800, color: couleur }}>{valeur}</div>
      <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>{titre}</div>
    </div>
  )
}

function Modal({ titre, onClose, children, footer, maxWidth = 440 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-header">
          <div className="card-title">{titre}</div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>{children}</div>
        <div style={{ padding: 16, borderTop: '1px solid #eef2f5', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>{footer}</div>
      </div>
    </div>
  )
}

function InitialModal({ produit, onClose, onSaved }) {
  const [valeur, setValeur] = useState(produit.stock_initial_saisi_le ? String(Number(produit.stock_initial)) : '')
  const [saving, setSaving] = useState(false)

  const enregistrer = async () => {
    const v = Number(valeur)
    if (valeur === '' || isNaN(v) || v < 0) { toast.error('Saisissez une quantité (0 ou plus)'); return }
    setSaving(true)
    const { error } = await supabase.rpc('fn_stock_saisir_initial', { p_produit_id: produit.id, p_quantite: v })
    setSaving(false)
    if (error) { toast.error(msgErreur(error)); return }
    toast.success('Stock initial enregistré — en attente de validation par un administrateur')
    onSaved?.()
    onClose()
  }

  return (
    <Modal titre={`Stock initial — ${produit.designation}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={enregistrer} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button></>}>
      <div>
        <label style={labelStyle}>Quantité comptée en stock ({produit.unite || 'unités'})</label>
        <input type="number" min="0" value={valeur} onChange={e => setValeur(e.target.value)} style={inputStyle} autoFocus
          onKeyDown={e => e.key === 'Enter' && enregistrer()} />
      </div>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
        Cette saisie reste modifiable tant qu'un administrateur ne l'a pas validée.
        Une fois validée, elle est <b>verrouillée</b> : le stock n'évoluera plus que par des entrées et des sorties.
      </div>
    </Modal>
  )
}

function MouvementModal({ produit, isAdmin, onClose, onSaved }) {
  const [mode, setMode] = useState('entree')
  const [valeur, setValeur] = useState('')
  const [motif, setMotif] = useState('')
  const [saving, setSaving] = useState(false)

  const modes = [['entree', 'Entrée'], ['sortie', 'Sortie'], ...(isAdmin ? [['ajustement', 'Correction']] : [])]

  const enregistrer = async () => {
    const v = Number(valeur)
    if (valeur === '' || isNaN(v) || v < 0 || (mode !== 'ajustement' && v === 0)) { toast.error('Saisissez une quantité valide'); return }
    if (mode === 'ajustement' && !motif.trim()) { toast.error('Le motif est obligatoire pour une correction'); return }
    const resultat = mode === 'entree' ? Number(produit.stock_actuel) + v : mode === 'sortie' ? Number(produit.stock_actuel) - v : v
    if (!window.confirm(`Confirmer ce mouvement ?\n\n${produit.designation}\nStock : ${num(produit.stock_actuel)} → ${num(resultat)}\n\nUne fois enregistré, il ne pourra plus être modifié ni supprimé.`)) return
    setSaving(true)
    const { error } = await supabase.rpc('fn_stock_mouvement', {
      p_produit_id: produit.id, p_type: mode, p_quantite: v, p_motif: motif.trim() || null, p_ref: null,
    })
    setSaving(false)
    if (error) { toast.error(msgErreur(error)); return }
    toast.success('Mouvement enregistré')
    onSaved?.()
    onClose()
  }

  return (
    <Modal titre={`Mouvement — ${produit.designation}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={enregistrer} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button></>}>
      <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, fontSize: 13 }}>
        Stock actuel : <strong>{num(produit.stock_actuel)} {produit.unite}</strong>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {modes.map(([k, lbl]) => (
          <button key={k} className="btn" onClick={() => setMode(k)}
            style={{ flex: 1, background: mode === k ? 'var(--teal)' : '#fff', color: mode === k ? '#fff' : 'var(--gray)', border: '1px solid #e2e8f0' }}>
            {lbl}
          </button>
        ))}
      </div>
      <div>
        <label style={labelStyle}>{mode === 'ajustement' ? 'Nouveau stock (valeur exacte)' : 'Quantité'}</label>
        <input type="number" min="0" value={valeur} onChange={e => setValeur(e.target.value)} style={inputStyle} autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Motif{mode === 'ajustement' ? ' *' : ''}</label>
        <input value={motif} onChange={e => setMotif(e.target.value)} style={inputStyle}
          placeholder={mode === 'sortie' ? 'Ex : casse, péremption, don…' : mode === 'ajustement' ? 'Ex : inventaire physique du 31/10' : 'Ex : livraison fournisseur'} />
      </div>
      {mode === 'ajustement' && (
        <div style={{ fontSize: 12, color: '#92400e' }}>Correction réservée à l'administrateur. Elle est tracée avec votre nom et l'heure.</div>
      )}
    </Modal>
  )
}

function ConfigModal({ produit, isAdmin, onClose, onSaved }) {
  const [seuil, setSeuil] = useState(produit.seuil_alerte ?? 0)
  const [gere, setGere] = useState(!!produit.stock_gere)
  const [saving, setSaving] = useState(false)

  const enregistrer = async () => {
    setSaving(true)
    const { error } = await supabase.rpc('fn_stock_config', {
      p_produit_id: produit.id, p_seuil: Number(seuil) || 0, p_gere: isAdmin && gere !== !!produit.stock_gere ? gere : null,
    })
    setSaving(false)
    if (error) { toast.error(msgErreur(error)); return }
    toast.success('Enregistré')
    onSaved?.()
    onClose()
  }

  return (
    <Modal titre={`Seuil d'alerte — ${produit.designation}`} onClose={onClose} maxWidth={420}
      footer={<><button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={enregistrer} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button></>}>
      <div>
        <label style={labelStyle}>Seuil d'alerte (stock bas)</label>
        <input type="number" min="0" value={seuil} onChange={e => setSeuil(e.target.value)} style={inputStyle} />
        <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>Une alerte s'affiche lorsque le stock passe à ce niveau ou en dessous.</div>
      </div>
      {isAdmin && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={gere} onChange={e => setGere(e.target.checked)} />
          Suivre le stock de ce produit
        </label>
      )}
    </Modal>
  )
}

const btnSm = { padding: '4px 10px', fontSize: 13, marginLeft: 6 }
const labelStyle = { display: 'block', fontSize: 12, color: 'var(--gray)', marginBottom: 4, fontWeight: 600 }
const inputStyle = { width: '100%', padding: 9, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }
