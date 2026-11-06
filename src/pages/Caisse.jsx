import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import LOGO_BASE64 from '../lib/logo.js'
import CodeCaisseModal from '../components/CodeCaisseModal.jsx'

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

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

// Numéro de pièce lisible à partir de l'ID du mouvement, ex: PC-20260602-A1B2
const numeroPiece = (m) => {
  const d = (m.date_mouvement || '').replace(/-/g, '')
  const suffix = String(m.id || '').replace(/-/g, '').slice(0, 4).toUpperCase()
  return `PC-${d}-${suffix}`
}

const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', boxSizing: 'border-box' }

export default function Caisse() {
  const { user, profile, isAdmin, isManager } = useAuth()
  const isComptable = profile?.role === 'comptable'

  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [mouvements, setMouvements] = useState([])
  const [ouverture, setOuverture] = useState(null)
  const [cloture, setCloture] = useState(null)
  const [profils, setProfils] = useState({})
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

  // Demande de code : { action: 'ouvrir' | 'cloturer' | 'rouvrir', payload }
  const [codeDemande, setCodeDemande] = useState(null)

  // Le comptable travaille toujours sur la journée du jour
  const dateActive = isManager ? selectedDate : todayStr()
  const isOpen = !!ouverture
  const isClosed = !!cloture
  const soldeOuverture = Number(cloture?.solde_ouverture ?? ouverture?.solde_ouverture ?? 0)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [mv, ouv, clo, prof] = await Promise.all([
        supabase.from('caisse_mouvements').select('*').eq('date_mouvement', dateActive).order('created_at', { ascending: true }),
        supabase.from('caisse_ouvertures').select('*').eq('date_ouverture', dateActive).maybeSingle(),
        supabase.from('caisse_clotures').select('*').eq('date_cloture', dateActive).maybeSingle(),
        supabase.from('profiles').select('id, nom'),
      ])
      if (mv.error) throw mv.error
      if (ouv.error) throw ouv.error
      if (clo.error) throw clo.error
      setMouvements(mv.data || [])
      setOuverture(ouv.data || null)
      setCloture(clo.data || null)
      const map = {}
      for (const p of (prof.data || [])) map[p.id] = p.nom
      setProfils(map)
    } catch (err) {
      toast.error('Erreur : ' + (err.message || 'chargement'))
    } finally {
      setLoading(false)
    }
  }, [dateActive])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    setFCategorie(fType === 'entree' ? CATEGORIES_ENTREE[0] : CATEGORIES_SORTIE[0])
  }, [fType])

  const { totalEntrees, totalSorties, soldeTheorique, nonValides } = useMemo(() => {
    let te = 0, ts = 0, nv = 0
    for (const m of mouvements) {
      if (m.type === 'entree') te += Number(m.montant)
      else ts += Number(m.montant)
      if (!m.valide) nv++
    }
    return { totalEntrees: te, totalSorties: ts, soldeTheorique: soldeOuverture + te - ts, nonValides: nv }
  }, [mouvements, soldeOuverture])

  /* ---------- Actions protégées par le code ---------- */
  const executerAvecCode = async (code) => {
    const { action, payload } = codeDemande
    try {
      if (action === 'ouvrir') {
        const { error } = await supabase.rpc('fn_caisse_ouvrir', { p_code: code, p_date: dateActive })
        if (error) throw error
        toast.success('Caisse ouverte')
      } else if (action === 'cloturer') {
        const { error } = await supabase.rpc('fn_caisse_cloturer', {
          p_code: code, p_date: dateActive, p_solde_reel: payload.reel, p_commentaire: payload.commentaire || null,
        })
        if (error) throw error
        setShowCloture(false)
        setSoldeReel('')
        setCommentaireCloture('')
        toast.success('Journée clôturée')
      } else if (action === 'rouvrir') {
        const { error } = await supabase.rpc('fn_caisse_rouvrir', { p_code: code, p_date: dateActive })
        if (error) throw error
        toast.success('Journée rouverte')
      }
      setCodeDemande(null)
      await loadData()
      return true
    } catch (err) {
      toast.error(err.message || 'Erreur')
      return false
    }
  }

  const ouvrirCaisse = () => setCodeDemande({ action: 'ouvrir' })

  const demanderCloture = () => {
    const reel = parseFloat(String(soldeReel).replace(',', '.'))
    if (isNaN(reel)) { toast.error('Saisis le solde réel (espèces comptées)'); return }
    if (nonValides > 0) { toast.error(`${nonValides} mouvement(s) en attente de validation`); return }
    setCodeDemande({ action: 'cloturer', payload: { reel, commentaire: commentaireCloture.trim() } })
  }

  const rouvrirJournee = () => {
    if (!window.confirm('Rouvrir cette journée ? La clôture sera supprimée et les mouvements pourront à nouveau être modifiés.')) return
    setCodeDemande({ action: 'rouvrir' })
  }

  /* ---------- Mouvements ---------- */
  const ajouterMouvement = async () => {
    const montant = parseFloat(String(fMontant).replace(',', '.'))
    if (!montant || montant <= 0) { toast.error('Le montant doit être supérieur à 0'); return }
    if (!fMotif.trim()) { toast.error('Le motif est obligatoire'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('caisse_mouvements').insert({
        date_mouvement: dateActive,
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
      toast.success(isManager ? 'Mouvement enregistré et validé' : 'Mouvement enregistré (en attente de validation)')
      await loadData()
    } catch (err) {
      toast.error('Erreur : ' + (err.message || 'enregistrement'))
    } finally {
      setSaving(false)
    }
  }

  const validerMouvement = async (m) => {
    const { error } = await supabase.rpc('fn_caisse_valider_mouvement', { p_id: m.id })
    if (error) { toast.error(error.message); return }
    toast.success('Mouvement validé')
    await loadData()
  }

  const peutSupprimer = (m) => {
    if (isClosed) return false
    if (isAdmin) return true
    if (m.valide) return false
    if (profile?.role === 'gerant') return true
    return m.created_by === user?.id
  }

  const supprimerMouvement = async (m) => {
    const msg = m.valide
      ? 'Ce mouvement est validé. Le supprimer définitivement ?'
      : 'Supprimer ce mouvement ?'
    if (!window.confirm(msg)) return
    try {
      const { error, count } = await supabase.from('caisse_mouvements').delete({ count: 'exact' }).eq('id', m.id)
      if (error) throw error
      if (!count) throw new Error("Suppression refusée : seul l'administrateur peut effacer une saisie validée.")
      toast.success('Mouvement supprimé')
      await loadData()
    } catch (err) {
      toast.error(err.message || 'Erreur de suppression')
    }
  }

  const exportCSV = () => {
    const lignes = [
      ['Date', 'Type', 'Catégorie', 'Motif', 'Montant', 'Saisi par', 'Validé'],
      ...mouvements.map((m) => [
        frDate(m.date_mouvement),
        m.type === 'entree' ? 'Entrée' : 'Sortie',
        m.categorie || '',
        m.motif || '',
        String(m.montant),
        profils[m.created_by] || '',
        m.valide ? 'Oui' : 'Non',
      ]),
      [],
      ['Solde ouverture', '', '', '', String(soldeOuverture)],
      ['Total entrées', '', '', '', String(totalEntrees)],
      ['Total sorties', '', '', '', String(totalSorties)],
      ['Solde théorique', '', '', '', String(soldeTheorique)],
    ]
    const csv = lignes.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `caisse_${dateActive}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const imprimerRecu = (m) => {
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) { toast.error('Autorise les fenêtres pop-up pour imprimer'); return }
    const estEntree = m.type === 'entree'
    const titre = estEntree ? 'REÇU DE CAISSE' : 'PIÈCE DE DÉPENSE'
    const heure = m.created_at ? new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
    const teal = '#1A9E8F'
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(numeroPiece(m))}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; }
  .page { width: 210mm; min-height: 297mm; padding: 22mm 20mm; margin: 0 auto; position: relative; }
  .entete { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid ${teal}; padding-bottom: 16px; }
  .entete img { width: 80px; height: 80px; object-fit: contain; }
  .soc-nom { font-size: 22px; font-weight: 700; color: ${teal}; }
  .soc-info { font-size: 12px; color: #4b5563; line-height: 1.5; margin-top: 4px; }
  .titre-bloc { text-align: center; margin: 34px 0 10px; }
  .titre { display: inline-block; font-size: 20px; font-weight: 700; letter-spacing: 2px; color: #fff; background: ${teal}; padding: 8px 26px; border-radius: 6px; }
  .num { text-align: center; font-size: 13px; color: #6b7280; margin-bottom: 28px; }
  table.det { width: 100%; border-collapse: collapse; margin-top: 10px; }
  table.det td { padding: 11px 14px; border: 1px solid #e5e7eb; font-size: 14px; }
  table.det td.lbl { background: #f9fafb; font-weight: 600; width: 35%; color: #374151; }
  .montant-bloc { margin-top: 30px; text-align: center; border: 2px solid ${teal}; border-radius: 10px; padding: 18px; background: #f0fdfa; }
  .montant-lbl { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; }
  .montant-val { font-size: 32px; font-weight: 800; color: ${teal}; margin-top: 6px; }
  .sign { margin-top: 60px; display: flex; justify-content: flex-end; }
  .sign-box { width: 70mm; text-align: center; }
  .sign-line { border-top: 1px solid #374151; margin-bottom: 6px; }
  .sign-lbl { font-size: 13px; color: #374151; font-style: italic; }
  .footer { position: absolute; bottom: 16mm; left: 20mm; right: 20mm; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style></head>
<body>
  <div class="page">
    <div class="entete">
      <img src="${LOGO_BASE64}" alt="logo"/>
      <div>
        <div class="soc-nom">SAJ GROUPE</div>
        <div class="soc-info">
          Galerie Médicale &middot; Libreville, Gabon<br/>
          RCCM&nbsp;: GA-LBV-01-2020-B12-00179
        </div>
      </div>
    </div>
    <div class="titre-bloc"><span class="titre">${titre}</span></div>
    <div class="num">N° de pièce : ${esc(numeroPiece(m))}</div>
    <table class="det">
      <tr><td class="lbl">Date</td><td>${frDate(m.date_mouvement)}${heure ? ' à ' + heure : ''}</td></tr>
      <tr><td class="lbl">Nature de l'opération</td><td>${estEntree ? 'Entrée de caisse' : 'Sortie de caisse'}</td></tr>
      <tr><td class="lbl">Catégorie</td><td>${esc(m.categorie) || '-'}</td></tr>
      <tr><td class="lbl">Motif / Désignation</td><td>${esc(m.motif) || '-'}</td></tr>
      <tr><td class="lbl">Saisi par</td><td>${esc(profils[m.created_by] || '-')}</td></tr>
    </table>
    <div class="montant-bloc">
      <div class="montant-lbl">Montant ${estEntree ? 'reçu' : 'décaissé'}</div>
      <div class="montant-val">${fmtCaisse(m.montant)}</div>
    </div>
    <div class="sign">
      <div class="sign-box">
        <div class="sign-line"></div>
        <div class="sign-lbl">Signature & cachet</div>
      </div>
    </div>
    <div class="footer">
      Pièce générée le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} — SAJ Groupe, Galerie Médicale
    </div>
  </div>
  <script>window.onload = function(){ window.print(); }</script>
</body></html>`
    w.document.write(html)
    w.document.close()
  }

  if (!isManager && !isComptable) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray)' }}>Accès non autorisé.</div>
  }

  const badgeValidation = (m) => m.valide
    ? <span className="badge" style={{ background: '#dcfce7', color: '#166534' }} title={m.valide_par ? `Validé par ${profils[m.valide_par] || '—'}` : ''}>✓ Validé</span>
    : <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>⏳ À valider</span>

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>{isManager ? 'Gestion de Caisse' : 'Saisie de Caisse'}</h1>
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
            {isOpen
              ? <>Ouverte le {frDate(dateActive)}{ouverture.ouvert_par ? ` par ${profils[ouverture.ouvert_par] || '—'}` : ''} · solde d'ouverture {fmtCaisse(soldeOuverture)}</>
              : isClosed ? 'Journée clôturée' : 'Caisse fermée — ouverture requise'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isManager ? (
            <>
              <label style={{ fontSize: 13, color: 'var(--gray)' }}>Journée :</label>
              <input type="date" value={selectedDate} max={todayStr()} onChange={(e) => setSelectedDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--gray)' }}>Journée du {frDate(todayStr())}</span>
          )}
        </div>
      </div>

      {/* Bandeaux d'état */}
      {!isOpen && !isClosed && (
        <div style={{ padding: '14px 16px', marginBottom: 16, borderRadius: 8, background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span>🔐 La caisse du {frDate(dateActive)} n'est pas ouverte. Aucune saisie n'est possible tant que la caisse n'a pas été ouverte avec le code.</span>
          <button className="btn btn-primary" onClick={ouvrirCaisse}>🔓 Ouvrir la caisse</button>
        </div>
      )}
      {isClosed && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#f0fdfa', border: '1px solid var(--teal)', color: '#147f73', fontSize: 13, fontWeight: 600 }}>
          🔒 Journée clôturée — solde réel {fmtCaisse(cloture.solde_reel)}
          {Number(cloture.ecart) !== 0 && <span style={{ color: 'var(--danger)' }}> (écart : {fmtCaisse(cloture.ecart)})</span>}
          {cloture.commentaire && <span style={{ fontWeight: 400 }}> — {cloture.commentaire}</span>}
        </div>
      )}
      {isComptable && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 13 }}>
          ℹ️ Vous voyez uniquement vos propres saisies du jour. Chaque saisie doit être validée par le gérant ou l'administrateur ; une saisie validée ne peut être supprimée que par l'administrateur.
        </div>
      )}

      {/* Cartes récap (gérant / admin) */}
      {isManager && (
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
            {nonValides > 0 && <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>{nonValides} saisie(s) à valider</div>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {isOpen && !isClosed && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nouveau mouvement</button>
        )}
        {isManager && <button className="btn btn-ghost" onClick={exportCSV}>📥 Export CSV</button>}
        {isManager && isOpen && !isClosed && (
          <button className="btn btn-ghost" onClick={() => { setShowCloture(true); setSoldeReel(String(Math.round(soldeTheorique))) }}>
            🔒 Clôturer la journée
          </button>
        )}
        {isAdmin && isClosed && (
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
                {isManager && <th>Saisi par</th>}
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th>Validation</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Chargement...</td></tr>
              ) : mouvements.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Aucun mouvement pour cette journée</td></tr>
              ) : mouvements.map((m) => (
                <tr key={m.id}>
                  <td style={{ color: 'var(--gray)' }}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <span className="badge" style={m.type === 'entree' ? { background: '#dcfce7', color: '#166534' } : { background: '#fee2e2', color: '#991b1b' }}>
                      {m.type === 'entree' ? 'Entrée' : 'Sortie'}
                    </span>
                  </td>
                  <td>{m.categorie}</td>
                  <td>{m.motif}{m.recette_id && <span className="badge" style={{ marginLeft: 6, background: '#ede9fe', color: '#5b21b6' }}>Recette</span>}</td>
                  {isManager && <td style={{ color: 'var(--gray)', fontSize: 12 }}>{profils[m.created_by] || '—'}</td>}
                  <td className="font-mono" style={{ textAlign: 'right', fontWeight: 600, color: m.type === 'entree' ? '#16a34a' : 'var(--danger)' }}>
                    {m.type === 'entree' ? '+ ' : '- '}{fmtCaisse(m.montant)}
                  </td>
                  <td>{badgeValidation(m)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => imprimerRecu(m)} title="Imprimer la pièce">🖨</button>
                      {isManager && !m.valide && !isClosed && (
                        <button className="btn btn-sm" style={{ background: '#16a34a', color: '#fff', border: 'none' }} onClick={() => validerMouvement(m)} title="Valider cette saisie">✓</button>
                      )}
                      {peutSupprimer(m) && (
                        <button className="btn btn-danger btn-sm" onClick={() => supprimerMouvement(m)} title={m.valide ? 'Supprimer (saisie validée — admin)' : 'Supprimer'}>🗑</button>
                      )}
                    </div>
                  </td>
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
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Nouveau mouvement — {frDate(dateActive)}</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className="btn" style={{ flex: 1, background: fType === 'entree' ? '#16a34a' : 'var(--lgray)', color: fType === 'entree' ? '#fff' : 'var(--text)' }} onClick={() => setFType('entree')}>Entrée</button>
              <button className="btn" style={{ flex: 1, background: fType === 'sortie' ? 'var(--danger)' : 'var(--lgray)', color: fType === 'sortie' ? '#fff' : 'var(--text)' }} onClick={() => setFType('sortie')}>Sortie</button>
            </div>
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Montant (FCFA)</label>
            <input type="number" value={fMontant} onChange={(e) => setFMontant(e.target.value)} placeholder="0" autoFocus style={{ ...inputStyle, marginBottom: 14 }} />
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Catégorie</label>
            <select value={fCategorie} onChange={(e) => setFCategorie(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
              {(fType === 'entree' ? CATEGORIES_ENTREE : CATEGORIES_SORTIE).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Motif / description</label>
            <input type="text" value={fMotif} onChange={(e) => setFMotif(e.target.value)} placeholder="Ex: Vente consommables comptant" style={inputStyle} />
            {fType === 'entree' && fCategorie === 'Règlement client' && (
              <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8 }}>
                💡 Pour un règlement de facture, préférez l'onglet <b>Recettes</b> : l'encaissement sera lié à la facture et inscrit automatiquement en caisse.
              </div>
            )}
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
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Clôture du {frDate(dateActive)}</h2>
            <div style={{ background: 'var(--lgray)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>Solde d'ouverture</span><strong>{fmtCaisse(soldeOuverture)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#16a34a' }}><span>Total entrées</span><strong>+ {fmtCaisse(totalEntrees)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--danger)' }}><span>Total sorties</span><strong>- {fmtCaisse(totalSorties)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '1px solid var(--border)', marginTop: 6, color: '#147f73' }}><strong>Solde théorique</strong><strong>{fmtCaisse(soldeTheorique)}</strong></div>
            </div>
            {nonValides > 0 && (
              <div className="alert alert-warn" style={{ fontSize: 12, marginBottom: 12 }}>⚠️ {nonValides} saisie(s) en attente de validation : validez-les ou supprimez-les avant de clôturer.</div>
            )}
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Solde réel (espèces comptées)</label>
            <input type="number" value={soldeReel} onChange={(e) => setSoldeReel(e.target.value)} autoFocus style={inputStyle} />
            {soldeReel !== '' && !isNaN(parseFloat(soldeReel)) && (
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: parseFloat(soldeReel) - soldeTheorique === 0 ? '#16a34a' : 'var(--danger)' }}>
                Écart : {fmtCaisse(parseFloat(soldeReel) - soldeTheorique)}
              </div>
            )}
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', margin: '14px 0 6px' }}>Commentaire (optionnel)</label>
            <input type="text" value={commentaireCloture} onChange={(e) => setCommentaireCloture(e.target.value)} placeholder="Ex: écart dû à monnaie rendue" style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowCloture(false)}>Annuler</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={demanderCloture} disabled={nonValides > 0}>
                🔐 Clôturer (code requis)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL code de caisse */}
      {codeDemande && (
        <CodeCaisseModal
          titre={codeDemande.action === 'ouvrir' ? 'Ouverture de la caisse' : codeDemande.action === 'cloturer' ? 'Clôture de la caisse' : 'Réouverture de la journée'}
          description={codeDemande.action === 'ouvrir'
            ? `Saisissez le code de caisse pour ouvrir la journée du ${frDate(dateActive)}.`
            : codeDemande.action === 'cloturer'
              ? `Saisissez le code de caisse pour confirmer la clôture du ${frDate(dateActive)}.`
              : `Saisissez le code de caisse pour rouvrir la journée du ${frDate(dateActive)}.`}
          onValider={executerAvecCode}
          onClose={() => setCodeDemande(null)}
        />
      )}
    </div>
  )
}
