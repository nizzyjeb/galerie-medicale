import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

/* -------- Catégories (modifiables librement) -------- */
const CATEGORIES_ENTREE = [
  'Vente comptant',
  'Règlement client',
  'Apport en caisse',
  'Remboursement reçu',
  'Autre',
]
const CATEGORIES_SORTIE = [
  'Achat fournisseur',
  'Salaire / Avance',
  'Frais généraux',
  'Transport',
  'Carburant',
  'Autre',
]

/* -------- Helpers -------- */
const fmtCaisse = (n) =>
  new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0)) + ' FCFA'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

const frDate = (s) => {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export default function Caisse() {
  const { user, isAdmin } = useAuth()

  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [mouvements, setMouvements] = useState([])
  const [cloture, setCloture] = useState(null)
  const [soldeOuverture, setSoldeOuverture] = useState(0)
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [fType, setFType] = useState('entree')
  const [fMontant, setFMontant] = useState('')
  const [fCategorie, setFCategorie] = useState(CATEGORIES_ENTREE[0])
  const [fMotif, setFMotif] = useState('')
  const [saving, setSaving] = useState(false)

  const [showCloture, setShowCloture] = useState(false)
  const [soldeReel, setSoldeReel] = useState('')
  const [commentaireCloture, setCommentaireCloture] = useState('')

  const isClosed = !!cloture

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: mvts, error: e1 } = await supabase
        .from('caisse_mouvements')
        .select('*')
        .eq('date_mouvement', selectedDate)
        .order('created_at', { ascending: true })
      if (e1) throw e1

      const { data: clo, error: e2 } = await supabase
        .from('caisse_clotures')
        .select('*')
        .eq('date_cloture', selectedDate)
        .maybeSingle()
      if (e2) throw e2

      const { data: prev, error: e3 } = await supabase
        .from('caisse_clotures')
        .select('solde_reel, solde_theorique, date_cloture')
        .lt('date_cloture', selectedDate)
        .order('date_cloture', { ascending: false })
        .limit(1)
      if (e3) throw e3

      let ouverture = 0
      if (prev && prev.length > 0) {
        const p = prev[0]
        ouverture =
          p.solde_reel !== null && p.solde_reel !== undefined
            ? Number(p.solde_reel)
            : Number(p.solde_theorique)
      }

      setMouvements(mvts || [])
      setCloture(clo || null)
      setSoldeOuverture(ouverture)
    } catch (err) {
      toast.error('Erreur : ' + (err.message || 'chargement'))
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    setFCategorie(fType === 'entree' ? CATEGORIES_ENTREE[0] : CATEGORIES_SORTIE[0])
  }, [fType])

  const { totalEntrees, totalSorties, soldeTheorique } = useMemo(() => {
    let te = 0
    let ts = 0
    for (const m of mouvements) {
      if (m.type === 'entree') te += Number(m.montant)
      else ts += Number(m.montant)
    }
    return {
      totalEntrees: te,
      totalSorties: ts,
      soldeTheorique: soldeOuverture + te - ts,
    }
  }, [mouvements, soldeOuverture])

  const ajouterMouvement = async () => {
    const montant = parseFloat(String(fMontant).replace(',', '.'))
    if (!montant || montant <= 0) {
      toast.error('Le montant doit être supérieur à 0')
      return
    }
    if (!fMotif.trim()) {
      toast.error('Le motif est obligatoire')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('caisse_mouvements').insert({
        date_mouvement: selectedDate,
        type: fType,
        montant,
        categorie: fCategorie,
        motif: fMotif.trim(),
        created_by: user?.id ?? null,
      })
      if (error) throw error
      setFMontant('')
      setFMotif('')
      setShowForm(false)
      toast.success('Mouvement enregistré')
      await loadData()
    } catch (err) {
      toast.error('Erreur : ' + (err.message || 'enregistrement'))
    } finally {
      setSaving(false)
    }
  }

  const supprimerMouvement = async (id) => {
    if (!window.confirm('Supprimer ce mouvement ?')) return
    try {
      const { error } = await supabase.from('caisse_mouvements').delete().eq('id', id)
      if (error) throw error
      toast.success('Mouvement supprimé')
      await loadData()
    } catch (err) {
      toast.error('Erreur : ' + (err.message || 'suppression'))
    }
  }

  const cloturerJournee = async () => {
    const reel = parseFloat(String(soldeReel).replace(',', '.'))
    if (isNaN(reel)) {
      toast.error('Saisis le solde réel (espèces comptées)')
      return
    }
    setSaving(true)
    try {
      const ecart = reel - soldeTheorique
      const { error } = await supabase.from('caisse_clotures').insert({
        date_cloture: selectedDate,
        solde_ouverture: soldeOuverture,
        total_entrees: totalEntrees,
        total_sorties: totalSorties,
        solde_theorique: soldeTheorique,
        solde_reel: reel,
        ecart,
        commentaire: commentaireCloture.trim() || null,
        cloture_par: user?.id ?? null,
      })
      if (error) throw error
      setShowCloture(false)
      setSoldeReel('')
      setCommentaireCloture('')
      toast.success('Journée clôturée')
      await loadData()
    } catch (err) {
      toast.error('Erreur : ' + (err.message || 'clôture'))
    } finally {
      setSaving(false)
    }
  }

  const rouvrirJournee = async () => {
    if (
      !window.confirm(
        'Rouvrir cette journée ? La clôture sera supprimée et tu pourras à nouveau modifier les mouvements.'
      )
    )
      return
    try {
      const { error } = await supabase
        .from('caisse_clotures')
        .delete()
        .eq('date_cloture', selectedDate)
      if (error) throw error
      toast.success('Journée rouverte')
      await loadData()
    } catch (err) {
      toast.error('Erreur : ' + (err.message || 'réouverture'))
    }
  }

  const exportCSV = () => {
    const lignes = [
      ['Date', 'Type', 'Catégorie', 'Motif', 'Montant'],
      ...mouvements.map((m) => [
        frDate(m.date_mouvement),
        m.type === 'entree' ? 'Entrée' : 'Sortie',
        m.categorie || '',
        m.motif || '',
        String(m.montant),
      ]),
      [],
      ['Solde ouverture', '', '', '', String(soldeOuverture)],
      ['Total entrées', '', '', '', String(totalEntrees)],
      ['Total sorties', '', '', '', String(totalSorties)],
      ['Solde théorique', '', '', '', String(soldeTheorique)],
    ]
    const csv = lignes
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `caisse_${selectedDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* -------- Accès admin uniquement -------- */
  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray)' }}>
        Accès réservé à l'administrateur.
      </div>
    )
  }

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Gestion de Caisse</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: 'var(--gray)' }}>Journée :</label>
          <input
            type="date"
            value={selectedDate}
            max={todayStr()}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
          />
        </div>
      </div>

      {isClosed && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#f0fdfa', border: '1px solid var(--teal)', color: '#147f73', fontSize: 13, fontWeight: 600 }}>
          🔒 Journée clôturée — solde réel {fmtCaisse(cloture.solde_reel)}
          {Number(cloture.ecart) !== 0 && (
            <span style={{ color: 'var(--danger)' }}> (écart : {fmtCaisse(cloture.ecart)})</span>
          )}
        </div>
      )}

      {/* Cartes récap */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>Solde d'ouverture</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtCaisse(soldeOuverture)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>Total entrées</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>+ {fmtCaisse(totalEntrees)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>Total sorties</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>- {fmtCaisse(totalSorties)}</div>
        </div>
        <div className="card" style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}>
          <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>Solde théorique</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#147f73' }}>{fmtCaisse(soldeTheorique)}</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {!isClosed && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nouveau mouvement</button>
        )}
        <button className="btn btn-ghost" onClick={exportCSV}>📥 Export CSV</button>
        {!isClosed ? (
          <button className="btn btn-ghost" onClick={() => { setShowCloture(true); setSoldeReel(String(Math.round(soldeTheorique))) }}>
            🔒 Clôturer la journée
          </button>
        ) : (
          <button className="btn btn-danger" onClick={rouvrirJournee}>🔓 Rouvrir la journée</button>
        )}
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Heure</th><th>Type</th><th>Catégorie</th><th>Motif</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                {!isClosed && <th style={{ textAlign: 'center' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Chargement...</td></tr>
              ) : mouvements.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Aucun mouvement pour cette journée</td></tr>
              ) : mouvements.map((m) => (
                <tr key={m.id}>
                  <td style={{ color: 'var(--gray)' }}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <span className="badge" style={m.type === 'entree'
                      ? { background: '#dcfce7', color: '#166534' }
                      : { background: '#fee2e2', color: '#991b1b' }}>
                      {m.type === 'entree' ? 'Entrée' : 'Sortie'}
                    </span>
                  </td>
                  <td>{m.categorie}</td>
                  <td>{m.motif}</td>
                  <td className="font-mono" style={{ textAlign: 'right', fontWeight: 600, color: m.type === 'entree' ? '#16a34a' : 'var(--danger)' }}>
                    {m.type === 'entree' ? '+ ' : '- '}{fmtCaisse(m.montant)}
                  </td>
                  {!isClosed && (
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-danger btn-sm" onClick={() => supprimerMouvement(m.id)}>🗑</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL nouveau mouvement */}
      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 92vw)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Nouveau mouvement</h2>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className="btn" style={{ flex: 1, background: fType === 'entree' ? '#16a34a' : 'var(--lgray)', color: fType === 'entree' ? '#fff' : 'var(--text)' }} onClick={() => setFType('entree')}>Entrée</button>
              <button className="btn" style={{ flex: 1, background: fType === 'sortie' ? 'var(--danger)' : 'var(--lgray)', color: fType === 'sortie' ? '#fff' : 'var(--text)' }} onClick={() => setFType('sortie')}>Sortie</button>
            </div>

            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Montant (FCFA)</label>
            <input type="number" value={fMontant} onChange={(e) => setFMontant(e.target.value)} placeholder="0" autoFocus
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', boxSizing: 'border-box', marginBottom: 14 }} />

            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Catégorie</label>
            <select value={fCategorie} onChange={(e) => setFCategorie(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', boxSizing: 'border-box', marginBottom: 14 }}>
              {(fType === 'entree' ? CATEGORIES_ENTREE : CATEGORIES_SORTIE).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Motif / description</label>
            <input type="text" value={fMotif} onChange={(e) => setFMotif(e.target.value)} placeholder="Ex: Vente consommables comptant"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', boxSizing: 'border-box' }} />

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Annuler</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={ajouterMouvement} disabled={saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL clôture */}
      {showCloture && (
        <div onClick={() => setShowCloture(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 92vw)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Clôture du {frDate(selectedDate)}</h2>

            <div style={{ background: 'var(--lgray)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>Solde d'ouverture</span><strong>{fmtCaisse(soldeOuverture)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#16a34a' }}><span>Total entrées</span><strong>+ {fmtCaisse(totalEntrees)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--danger)' }}><span>Total sorties</span><strong>- {fmtCaisse(totalSorties)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '1px solid var(--border)', marginTop: 6, color: '#147f73' }}><strong>Solde théorique</strong><strong>{fmtCaisse(soldeTheorique)}</strong></div>
            </div>

            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Solde réel (espèces comptées)</label>
            <input type="number" value={soldeReel} onChange={(e) => setSoldeReel(e.target.value)} autoFocus
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', boxSizing: 'border-box' }} />

            {soldeReel !== '' && !isNaN(parseFloat(soldeReel)) && (
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: parseFloat(soldeReel) - soldeTheorique === 0 ? '#16a34a' : 'var(--danger)' }}>
                Écart : {fmtCaisse(parseFloat(soldeReel) - soldeTheorique)}
              </div>
            )}

            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', margin: '14px 0 6px' }}>Commentaire (optionnel)</label>
            <input type="text" value={commentaireCloture} onChange={(e) => setCommentaireCloture(e.target.value)} placeholder="Ex: écart dû à monnaie rendue"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', boxSizing: 'border-box' }} />

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowCloture(false)}>Annuler</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={cloturerJournee} disabled={saving}>
                {saving ? 'Clôture...' : 'Confirmer la clôture'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
