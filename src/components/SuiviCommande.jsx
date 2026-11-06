import { useEffect, useState, useCallback } from 'react'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'
import { htmlBonCommande } from './BonCommandePrint.jsx'

const fmt = (n, devise = 'FCFA') => (Math.round(Number(n) || 0)).toLocaleString('fr-FR') + ' ' + (devise || 'FCFA')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
const todayStr = () => new Date().toISOString().slice(0, 10)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export const ETAPES = [
  { k: 'brouillon', l: 'Commande créée', champ: 'date_emission' },
  { k: 'envoye', l: 'Envoyée au fournisseur', champ: 'date_envoi' },
  { k: 'confirme', l: 'Confirmée par le fournisseur', champ: 'date_confirmation' },
  { k: 'expedie', l: 'Expédiée', champ: 'date_expedition' },
  { k: 'arrive', l: 'Arrivée (port / aéroport)', champ: 'date_arrivee' },
  { k: 'dedouane', l: 'Dédouanée', champ: 'date_dedouanement' },
  { k: 'recu', l: 'Réceptionnée en stock', champ: 'recu_le' },
]

export const TYPES_DOCS = {
  facture_fournisseur: { l: 'Facture fournisseur', facture: true },
  preuve_paiement: { l: 'Preuve de paiement (swift, reçu)' },
  bill_of_lading: { l: 'Bill of Lading (B/L)' },
  lta: { l: 'LTA (lettre de transport aérien)' },
  packing_list: { l: 'Packing list' },
  certificat: { l: "Certificat (origine, conformité…)" },
  declaration_douane: { l: 'Déclaration en douane' },
  facture_douane: { l: 'Facture / quittance douane', facture: true },
  facture_transit: { l: 'Facture transitaire', facture: true },
  facture_transport: { l: 'Facture transport / fret', facture: true },
  autre: { l: 'Autre document' },
}

const MODES = { virement: 'Virement', especes: 'Espèces', cheque: 'Chèque', mobile_money: 'Mobile money', carte: 'Carte', lettre_credit: 'Lettre de crédit' }

const nomFichierSur = (n) => String(n || 'document').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)

const inputStyle = { width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', boxSizing: 'border-box', fontSize: 13 }
const lbl = { fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4, color: '#374151' }

export function resumePaiement(docs) {
  const factures = docs.filter((d) => TYPES_DOCS[d.type]?.facture)
  const total = factures.reduce((s, d) => s + Number(d.montant || 0), 0)
  const paye = factures.filter((d) => d.paye).reduce((s, d) => s + Number(d.montant || 0), 0)
  return { factures, total, paye, reste: total - paye, nbPayees: factures.filter((d) => d.paye).length }
}

export default function SuiviCommande({ bon: bonInitial, onClose, onChanged, onReceptionner }) {
  const { user, isAdmin, isManager, profile } = useAuth()
  const peutEcrire = ['admin', 'gerant', 'comptable'].includes(profile?.role)
  const [bon, setBon] = useState(bonInitial)
  const [docs, setDocs] = useState([])
  const [etapes, setEtapes] = useState([])
  const [lignes, setLignes] = useState([])
  const [profils, setProfils] = useState({})
  const [onglet, setOnglet] = useState('suivi')
  const [logi, setLogi] = useState({})
  const [upload, setUpload] = useState(null)
  const [paiement, setPaiement] = useState(null)
  const [avance, setAvance] = useState(null)
  const [zipEnCours, setZipEnCours] = useState(false)

  const charger = useCallback(async () => {
    const [b, d, e, l, p] = await Promise.all([
      supabase.from('bons_commande').select('*').eq('id', bonInitial.id).single(),
      supabase.from('bon_commande_documents').select('*').eq('bon_commande_id', bonInitial.id).order('created_at'),
      supabase.from('bon_commande_etapes').select('*').eq('bon_commande_id', bonInitial.id).order('created_at'),
      supabase.from('bon_commande_lignes').select('*').eq('bon_commande_id', bonInitial.id).order('ordre'),
      supabase.from('profiles').select('id, nom'),
    ])
    if (b.data) {
      setBon(b.data)
      setLogi({
        transporteur: b.data.transporteur || '', incoterm: b.data.incoterm || '', numero_bl: b.data.numero_bl || '',
        numero_tracking: b.data.numero_tracking || '', transitaire: b.data.transitaire || '',
        numero_declaration_douane: b.data.numero_declaration_douane || '', devise: b.data.devise || 'FCFA',
        commentaire_suivi: b.data.commentaire_suivi || '',
      })
    }
    setDocs(d.data || [])
    setEtapes(e.data || [])
    setLignes(l.data || [])
    setProfils(Object.fromEntries((p.data || []).map((x) => [x.id, x.nom])))
  }, [bonInitial.id])

  useEffect(() => { charger() }, [charger])

  const idxActuel = bon.statut === 'annule' ? -1 : ETAPES.findIndex((e) => e.k === bon.statut)
  const prochaine = idxActuel >= 0 && idxActuel < ETAPES.length - 1 ? ETAPES[idxActuel + 1] : null
  const pay = resumePaiement(docs)

  /* ---------- Étapes ---------- */
  const avancerEtape = async ({ etape, date, commentaire }) => {
    if (etape.k === 'recu') {
      setAvance(null)
      const ok = await onReceptionner(bon)
      if (ok) {
        await supabase.from('bon_commande_etapes').insert({ bon_commande_id: bon.id, etape: 'recu', date_etape: date, commentaire: commentaire || null, created_by: user?.id })
      }
      await charger(); onChanged?.()
      return
    }
    const maj = { statut: etape.k, updated_at: new Date().toISOString() }
    maj[etape.champ] = date
    const { error } = await supabase.from('bons_commande').update(maj).eq('id', bon.id)
    if (error) { toast.error(error.message); return }
    await supabase.from('bon_commande_etapes').insert({ bon_commande_id: bon.id, etape: etape.k, date_etape: date, commentaire: commentaire || null, created_by: user?.id })
    toast.success(`Étape « ${etape.l} » enregistrée`)
    setAvance(null)
    await charger(); onChanged?.()
  }

  const ajouterNote = async (commentaire) => {
    if (!commentaire.trim()) return
    await supabase.from('bon_commande_etapes').insert({ bon_commande_id: bon.id, etape: 'note', date_etape: todayStr(), commentaire: commentaire.trim(), created_by: user?.id })
    charger()
  }

  const enregistrerLogistique = async () => {
    const { error } = await supabase.from('bons_commande').update({ ...logi, updated_at: new Date().toISOString() }).eq('id', bon.id)
    if (error) { toast.error(error.message); return }
    toast.success('Informations logistiques enregistrées')
    charger(); onChanged?.()
  }

  /* ---------- Documents ---------- */
  const telecharger = async (d) => {
    const { data, error } = await supabase.storage.from('commandes').createSignedUrl(d.path, 120, { download: d.nom })
    if (error) { toast.error('Téléchargement impossible : ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const apercu = async (d) => {
    const { data, error } = await supabase.storage.from('commandes').createSignedUrl(d.path, 300)
    if (error) { toast.error(error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const supprimerDoc = async (d) => {
    if (!window.confirm(`Supprimer le document « ${d.nom} » ?`)) return
    const { error, count } = await supabase.from('bon_commande_documents').delete({ count: 'exact' }).eq('id', d.id)
    if (error || !count) { toast.error(error?.message || 'Suppression refusée'); return }
    await supabase.storage.from('commandes').remove([d.path])
    toast.success('Document supprimé')
    charger(); onChanged?.()
  }

  const marquerPaye = async (d, infos) => {
    const maj = infos
      ? { paye: true, date_paiement: infos.date, mode_paiement: infos.mode, notes: infos.notes ? [d.notes, infos.notes].filter(Boolean).join(' · ') : d.notes }
      : { paye: false, date_paiement: null, mode_paiement: null }
    const { error } = await supabase.from('bon_commande_documents').update(maj).eq('id', d.id)
    if (error) { toast.error(error.message); return }
    toast.success(infos ? 'Facture marquée payée' : 'Facture remise en « non payée »')
    setPaiement(null)
    charger(); onChanged?.()
  }

  /* ---------- Dossier ZIP ---------- */
  const telechargerDossier = async () => {
    setZipEnCours(true)
    try {
      const zip = new JSZip()
      const racine = zip.folder(nomFichierSur(`${bon.numero}_${bon.fournisseur_nom || ''}`))
      racine.file(`00_Bon_de_commande_${nomFichierSur(bon.numero)}.html`, htmlBonCommande(bon, lignes))
      racine.file('01_Recapitulatif_suivi_et_paiements.html', htmlRecap(bon, etapes, docs, profils))
      let manquants = 0
      for (const d of docs) {
        const { data, error } = await supabase.storage.from('commandes').download(d.path)
        if (error || !data) { manquants++; continue }
        const dossier = racine.folder(nomFichierSur(TYPES_DOCS[d.type]?.l || d.type))
        dossier.file(nomFichierSur(d.nom), data)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Dossier_${nomFichierSur(bon.numero)}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(manquants ? `Dossier téléchargé (${manquants} fichier(s) introuvable(s))` : 'Dossier complet téléchargé')
    } catch (e) {
      toast.error('Erreur lors de la création du dossier : ' + e.message)
    } finally {
      setZipEnCours(false)
    }
  }

  const statutPaiement = pay.factures.length === 0
    ? { l: 'Aucune facture', bg: '#f1f5f9', c: '#475569' }
    : pay.reste <= 0.5 ? { l: 'Soldée', bg: '#dcfce7', c: '#166534' }
      : pay.paye > 0 ? { l: 'Partiellement payée', bg: '#fef3c7', c: '#92400e' }
        : { l: 'Non payée', bg: '#fee2e2', c: '#991b1b' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(920px, 100vw)', height: '100vh', background: '#f8fafc', overflowY: 'auto', boxShadow: '-6px 0 24px rgba(0,0,0,.15)' }}>
        {/* En-tête */}
        <div style={{ background: '#fff', padding: '16px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{bon.numero} <span style={{ fontWeight: 400, color: 'var(--gray)', fontSize: 14 }}>· {bon.fournisseur_nom}</span></div>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 3 }}>
                Émis le {fmtDate(bon.date_emission)} · Montant {fmt(bon.total_ttc)}{bon.objet ? ` · ${bon.objet}` : ''}
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="badge" style={{ background: 'var(--teal)', color: '#fff' }}>{bon.statut === 'annule' ? 'Annulée' : ETAPES[idxActuel]?.l}</span>
                <span className="badge" style={{ background: statutPaiement.bg, color: statutPaiement.c }}>💳 {statutPaiement.l}</span>
                <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>📎 {docs.length} document(s)</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={telechargerDossier} disabled={zipEnCours}>{zipEnCours ? 'Préparation…' : '📦 Télécharger le dossier'}</button>
              <button className="btn btn-ghost" onClick={onClose}>✕</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
            {[['suivi', '🧭 Suivi'], ['documents', `📎 Documents (${docs.length})`], ['paiements', `💳 Paiements (${pay.nbPayees}/${pay.factures.length})`], ['logistique', '🚢 Transport & douane']].map(([k, l]) => (
              <button key={k} onClick={() => setOnglet(k)} style={{ background: onglet === k ? 'var(--teal)' : 'transparent', color: onglet === k ? '#fff' : 'var(--gray)', border: 'none', padding: '7px 12px', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: 22 }}>
          {/* ===== SUIVI ===== */}
          {onglet === 'suivi' && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 6 }}>
                  {ETAPES.map((e, i) => {
                    const fait = idxActuel >= i
                    const dateE = bon[e.champ]
                    return (
                      <div key={e.k} style={{ flex: 1, minWidth: 105, textAlign: 'center', position: 'relative' }}>
                        {i > 0 && <div style={{ position: 'absolute', top: 13, right: '50%', width: '100%', height: 3, background: fait ? 'var(--teal)' : '#e2e8f0', zIndex: 0 }} />}
                        <div style={{ position: 'relative', zIndex: 1, width: 28, height: 28, borderRadius: '50%', margin: '0 auto', background: fait ? 'var(--teal)' : '#fff', border: `3px solid ${fait ? 'var(--teal)' : '#cbd5e1'}`, color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                          {fait ? '✓' : ''}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: idxActuel === i ? 700 : 500, marginTop: 6, color: fait ? '#0f172a' : '#94a3b8' }}>{e.l}</div>
                        <div style={{ fontSize: 10, color: 'var(--gray)' }}>{fait && dateE ? fmtDate(dateE) : ''}</div>
                      </div>
                    )
                  })}
                </div>
                {bon.statut === 'annule' && <div className="alert alert-warn" style={{ marginTop: 12, fontSize: 12 }}>Cette commande a été annulée.</div>}
                {peutEcrire && prochaine && (
                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={() => setAvance({ etape: prochaine, date: todayStr(), commentaire: '' })}>
                      ➜ Passer à l'étape : {prochaine.l}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
                <div className="card">
                  <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>Paiement fournisseur & frais</div>
                  <div style={{ fontSize: 13 }}>Factures : <b>{fmt(pay.total, bon.devise)}</b></div>
                  <div style={{ fontSize: 13, color: '#16a34a' }}>Payé : <b>{fmt(pay.paye, bon.devise)}</b></div>
                  <div style={{ fontSize: 13, color: pay.reste > 0 ? 'var(--danger)' : '#16a34a' }}>Reste dû : <b>{fmt(pay.reste, bon.devise)}</b></div>
                </div>
                <div className="card">
                  <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>Transport</div>
                  <div style={{ fontSize: 13 }}>Transporteur : <b>{bon.transporteur || '—'}</b></div>
                  <div style={{ fontSize: 13 }}>N° B/L / LTA : <b>{bon.numero_bl || '—'}</b></div>
                  <div style={{ fontSize: 13 }}>Tracking : <b>{bon.numero_tracking || '—'}</b></div>
                </div>
                <div className="card">
                  <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>Douane</div>
                  <div style={{ fontSize: 13 }}>Transitaire : <b>{bon.transitaire || '—'}</b></div>
                  <div style={{ fontSize: 13 }}>N° déclaration : <b>{bon.numero_declaration_douane || '—'}</b></div>
                  <div style={{ fontSize: 13 }}>Dédouanée le : <b>{fmtDate(bon.date_dedouanement)}</b></div>
                </div>
              </div>

              <div className="card">
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Historique</div>
                {etapes.length === 0 && <div style={{ fontSize: 13, color: 'var(--gray)' }}>Aucun événement enregistré.</div>}
                {etapes.slice().reverse().map((e) => (
                  <div key={e.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <div style={{ width: 82, color: 'var(--gray)' }}>{fmtDate(e.date_etape)}</div>
                    <div style={{ flex: 1 }}>
                      <b>{e.etape === 'note' ? '📝 Note' : e.etape === 'annule' ? '✖ Annulée' : ETAPES.find((x) => x.k === e.etape)?.l || e.etape}</b>
                      {e.commentaire && <span> — {e.commentaire}</span>}
                      <div style={{ fontSize: 11, color: 'var(--gray)' }}>{profils[e.created_by] || ''}</div>
                    </div>
                  </div>
                ))}
                {peutEcrire && <NoteRapide onAjouter={ajouterNote} />}
              </div>
            </>
          )}

          {/* ===== DOCUMENTS ===== */}
          {onglet === 'documents' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Pièces du dossier</div>
                {peutEcrire && <button className="btn btn-primary btn-sm" onClick={() => setUpload({ type: 'facture_fournisseur' })}>+ Ajouter un document</button>}
              </div>
              {docs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--gray)', fontSize: 13 }}>
                  Aucun document. Ajoutez la facture fournisseur, les preuves de paiement, le Bill of Lading, les factures de douane et de transit…
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Type</th><th>Document</th><th>Réf.</th><th>Date</th><th style={{ textAlign: 'right' }}>Montant</th><th>Paiement</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                    <tbody>
                      {docs.map((d) => (
                        <tr key={d.id}>
                          <td style={{ fontSize: 12 }}>{TYPES_DOCS[d.type]?.l || d.type}</td>
                          <td style={{ fontSize: 13 }}>{d.nom}</td>
                          <td style={{ fontSize: 12, color: 'var(--gray)' }}>{d.reference || ''}</td>
                          <td style={{ fontSize: 12 }}>{fmtDate(d.date_document)}</td>
                          <td className="font-mono" style={{ textAlign: 'right' }}>{d.montant != null ? fmt(d.montant, d.devise) : ''}</td>
                          <td>{TYPES_DOCS[d.type]?.facture ? (d.paye
                            ? <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>✓ Payée {fmtDate(d.date_paiement)}</span>
                            : <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>Non payée</span>) : ''}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => apercu(d)} title="Ouvrir">👁</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => telecharger(d)} title="Télécharger" style={{ marginLeft: 4 }}>⬇</button>
                            {(isManager || (d.uploaded_by === user?.id)) && <button className="btn btn-danger btn-sm" onClick={() => supprimerDoc(d)} style={{ marginLeft: 4 }}>🗑</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ===== PAIEMENTS ===== */}
          {onglet === 'paiements' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
                <div className="card"><div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase' }}>Total facturé</div><div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(pay.total, bon.devise)}</div></div>
                <div className="card"><div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase' }}>Payé</div><div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{fmt(pay.paye, bon.devise)}</div></div>
                <div className="card" style={{ borderColor: pay.reste > 0 ? 'var(--danger)' : 'var(--teal)' }}><div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase' }}>Reste à payer</div><div style={{ fontSize: 20, fontWeight: 700, color: pay.reste > 0 ? 'var(--danger)' : '#16a34a' }}>{fmt(pay.reste, bon.devise)}</div></div>
              </div>
              {docs.some((d) => TYPES_DOCS[d.type]?.facture && d.devise && d.devise !== bon.devise) && (
                <div className="alert alert-warn" style={{ fontSize: 12, marginBottom: 12 }}>⚠️ Certaines factures sont dans une autre devise que la commande ({bon.devise}) : les totaux additionnent les montants tels quels.</div>
              )}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Factures liées à la commande</div>
                  {peutEcrire && <button className="btn btn-primary btn-sm" onClick={() => setUpload({ type: 'facture_fournisseur' })}>+ Ajouter une facture</button>}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Type</th><th>Réf.</th><th>Date</th><th>Échéance</th><th style={{ textAlign: 'right' }}>Montant</th><th>Statut</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                    <tbody>
                      {pay.factures.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--gray)' }}>Aucune facture enregistrée pour cette commande.</td></tr>
                      ) : pay.factures.map((d) => {
                        const enRetard = !d.paye && d.date_echeance && d.date_echeance < todayStr()
                        return (
                          <tr key={d.id}>
                            <td style={{ fontSize: 12 }}>{TYPES_DOCS[d.type].l}</td>
                            <td>{d.reference || d.nom}</td>
                            <td style={{ fontSize: 12 }}>{fmtDate(d.date_document)}</td>
                            <td style={{ fontSize: 12, color: enRetard ? 'var(--danger)' : undefined, fontWeight: enRetard ? 600 : 400 }}>{fmtDate(d.date_echeance)}{enRetard ? ' ⚠' : ''}</td>
                            <td className="font-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(d.montant, d.devise)}</td>
                            <td>{d.paye
                              ? <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>✓ Payée le {fmtDate(d.date_paiement)}{d.mode_paiement ? ` · ${MODES[d.mode_paiement] || d.mode_paiement}` : ''}</span>
                              : <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>Non payée</span>}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => apercu(d)}>👁</button>
                              {isManager && !d.paye && <button className="btn btn-sm" style={{ marginLeft: 4, background: '#16a34a', color: '#fff', border: 'none' }} onClick={() => setPaiement({ doc: d, date: todayStr(), mode: 'virement', notes: '' })}>Marquer payée</button>}
                              {isAdmin && d.paye && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => { if (window.confirm('Remettre cette facture en « non payée » ?')) marquerPaye(d, null) }}>↩</button>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {!isManager && <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 10 }}>Le marquage « payée » est réservé au gérant et à l'administrateur.</div>}
              </div>
            </>
          )}

          {/* ===== LOGISTIQUE ===== */}
          {onglet === 'logistique' && (
            <div className="card">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {[
                  ['transporteur', 'Transporteur / compagnie', 'Ex : CMA CGM, Ethiopian Cargo…'],
                  ['incoterm', 'Incoterm', 'Ex : FOB, CIF, EXW…'],
                  ['numero_bl', 'N° Bill of Lading / LTA', ''],
                  ['numero_tracking', 'N° conteneur / tracking', ''],
                  ['transitaire', 'Transitaire', ''],
                  ['numero_declaration_douane', 'N° déclaration en douane', ''],
                ].map(([k, l, ph]) => (
                  <div key={k}>
                    <label style={lbl}>{l}</label>
                    <input value={logi[k] || ''} onChange={(e) => setLogi((x) => ({ ...x, [k]: e.target.value }))} placeholder={ph} style={inputStyle} disabled={!peutEcrire} />
                  </div>
                ))}
                <div>
                  <label style={lbl}>Devise de la commande</label>
                  <select value={logi.devise || 'FCFA'} onChange={(e) => setLogi((x) => ({ ...x, devise: e.target.value }))} style={inputStyle} disabled={!peutEcrire}>
                    {['FCFA', 'EUR', 'USD', 'CNY', 'AED'].map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <label style={{ ...lbl, marginTop: 14 }}>Commentaire de suivi</label>
              <textarea value={logi.commentaire_suivi || ''} onChange={(e) => setLogi((x) => ({ ...x, commentaire_suivi: e.target.value }))} style={{ ...inputStyle, minHeight: 70 }} disabled={!peutEcrire} />
              {peutEcrire && <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={enregistrerLogistique}>💾 Enregistrer</button>}
            </div>
          )}
        </div>
      </div>

      {avance && (
        <MiniModal titre={`Étape : ${avance.etape.l}`} onClose={() => setAvance(null)} onValider={() => avancerEtape(avance)} libelle={avance.etape.k === 'recu' ? 'Réceptionner (met à jour le stock)' : 'Enregistrer'}>
          <label style={lbl}>Date</label>
          <input type="date" value={avance.date} onChange={(e) => setAvance((x) => ({ ...x, date: e.target.value }))} style={inputStyle} />
          <label style={{ ...lbl, marginTop: 10 }}>Commentaire (optionnel)</label>
          <input value={avance.commentaire} onChange={(e) => setAvance((x) => ({ ...x, commentaire: e.target.value }))} style={inputStyle} placeholder="Ex : départ du port de Shanghai, ETA 12/12" />
        </MiniModal>
      )}

      {paiement && (
        <MiniModal titre={`Paiement — ${paiement.doc.reference || paiement.doc.nom}`} onClose={() => setPaiement(null)} onValider={() => marquerPaye(paiement.doc, paiement)} libelle="Marquer payée">
          <div style={{ fontSize: 13, marginBottom: 10 }}>Montant : <b>{fmt(paiement.doc.montant, paiement.doc.devise)}</b></div>
          <label style={lbl}>Date de paiement</label>
          <input type="date" value={paiement.date} onChange={(e) => setPaiement((x) => ({ ...x, date: e.target.value }))} style={inputStyle} />
          <label style={{ ...lbl, marginTop: 10 }}>Mode</label>
          <select value={paiement.mode} onChange={(e) => setPaiement((x) => ({ ...x, mode: e.target.value }))} style={inputStyle}>
            {Object.entries(MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label style={{ ...lbl, marginTop: 10 }}>Référence / note</label>
          <input value={paiement.notes} onChange={(e) => setPaiement((x) => ({ ...x, notes: e.target.value }))} style={inputStyle} placeholder="Ex : swift du 05/11, réf. 12345" />
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8 }}>💡 Pensez à ajouter la preuve de paiement dans les documents.</div>
        </MiniModal>
      )}

      {upload && <UploadModal bon={bon} init={upload} onClose={() => setUpload(null)} onSaved={() => { setUpload(null); charger(); onChanged?.() }} />}
    </div>
  )
}

function NoteRapide({ onAjouter }) {
  const [t, setT] = useState('')
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Ajouter une note de suivi…" style={inputStyle} onKeyDown={(e) => { if (e.key === 'Enter') { onAjouter(t); setT('') } }} />
      <button className="btn btn-ghost btn-sm" onClick={() => { onAjouter(t); setT('') }}>Ajouter</button>
    </div>
  )
}

function MiniModal({ titre, children, onClose, onValider, libelle }) {
  const [envoi, setEnvoi] = useState(false)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 92vw)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{titre}</h3>
        {children}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={envoi} onClick={async () => { setEnvoi(true); await onValider(); setEnvoi(false) }}>{envoi ? '…' : libelle}</button>
        </div>
      </div>
    </div>
  )
}

function UploadModal({ bon, init, onClose, onSaved }) {
  const { user } = useAuth()
  const [type, setType] = useState(init.type)
  const [fichiers, setFichiers] = useState([])
  const [reference, setReference] = useState('')
  const [montant, setMontant] = useState('')
  const [devise, setDevise] = useState(bon.devise || 'FCFA')
  const [dateDoc, setDateDoc] = useState(todayStr())
  const [echeance, setEcheance] = useState('')
  const [paye, setPaye] = useState(false)
  const [notes, setNotes] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const estFacture = TYPES_DOCS[type]?.facture

  const enregistrer = async () => {
    if (!fichiers.length) { toast.error('Choisissez au moins un fichier'); return }
    if (estFacture && !(Number(montant) > 0)) { toast.error('Indiquez le montant de la facture'); return }
    if (fichiers.some((f) => f.size > 25 * 1024 * 1024)) { toast.error('Fichier trop volumineux (25 Mo max)'); return }
    setEnvoi(true)
    try {
      for (const [i, f] of fichiers.entries()) {
        const path = `${nomFichierSur(bon.numero)}/${type}/${Date.now()}_${nomFichierSur(f.name)}`
        const { error: e1 } = await supabase.storage.from('commandes').upload(path, f, { contentType: f.type || undefined, upsert: false })
        if (e1) throw e1
        const { error: e2 } = await supabase.from('bon_commande_documents').insert({
          bon_commande_id: bon.id, type, nom: f.name, path, taille: f.size, mime: f.type || null,
          reference: reference.trim() || null,
          montant: estFacture && i === 0 ? Number(montant) : null,
          devise, date_document: dateDoc || null, date_echeance: estFacture ? (echeance || null) : null,
          paye: estFacture ? paye : false, date_paiement: estFacture && paye ? todayStr() : null,
          notes: notes.trim() || null, uploaded_by: user?.id,
        })
        if (e2) { await supabase.storage.from('commandes').remove([path]); throw e2 }
      }
      toast.success(fichiers.length > 1 ? `${fichiers.length} documents ajoutés` : 'Document ajouté')
      onSaved()
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(500px, 94vw)', maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Ajouter un document — {bon.numero}</h3>
        <label style={lbl}>Type de document</label>
        <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
          {Object.entries(TYPES_DOCS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
        </select>
        <label style={{ ...lbl, marginTop: 10 }}>Fichier(s) (PDF, image, Excel…)</label>
        <input type="file" multiple onChange={(e) => setFichiers(Array.from(e.target.files || []))} style={{ fontSize: 13 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <label style={lbl}>Référence / n°</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={lbl}>Date du document</label>
            <input type="date" value={dateDoc} onChange={(e) => setDateDoc(e.target.value)} style={inputStyle} />
          </div>
        </div>
        {estFacture && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 10 }}>
              <div>
                <label style={lbl}>Montant de la facture</label>
                <input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={lbl}>Devise</label>
                <select value={devise} onChange={(e) => setDevise(e.target.value)} style={inputStyle}>
                  {['FCFA', 'EUR', 'USD', 'CNY', 'AED'].map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, alignItems: 'end' }}>
              <div>
                <label style={lbl}>Échéance de paiement</label>
                <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} style={inputStyle} />
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, paddingBottom: 8 }}>
                <input type="checkbox" checked={paye} onChange={(e) => setPaye(e.target.checked)} /> Déjà payée
              </label>
            </div>
          </>
        )}
        <label style={{ ...lbl, marginTop: 10 }}>Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={enregistrer} disabled={envoi}>{envoi ? 'Envoi…' : 'Ajouter'}</button>
        </div>
      </div>
    </div>
  )
}

function htmlRecap(bon, etapes, docs, profils) {
  const pay = resumePaiement(docs)
  const ligneEtape = ETAPES.map((e) => `<tr><td>${esc(e.l)}</td><td>${bon[e.champ] ? fmtDate(bon[e.champ]) : '—'}</td></tr>`).join('')
  const ligneDocs = docs.map((d) => `<tr><td>${esc(TYPES_DOCS[d.type]?.l || d.type)}</td><td>${esc(d.nom)}</td><td>${esc(d.reference || '')}</td><td>${fmtDate(d.date_document)}</td><td style="text-align:right">${d.montant != null ? fmt(d.montant, d.devise) : ''}</td><td>${TYPES_DOCS[d.type]?.facture ? (d.paye ? 'Payée le ' + fmtDate(d.date_paiement) : '<b style="color:#b91c1c">NON PAYÉE</b>') : ''}</td></tr>`).join('')
  const histo = etapes.map((e) => `<tr><td>${fmtDate(e.date_etape)}</td><td>${esc(e.etape === 'note' ? 'Note' : (ETAPES.find((x) => x.k === e.etape)?.l || e.etape))}</td><td>${esc(e.commentaire || '')}</td><td>${esc(profils[e.created_by] || '')}</td></tr>`).join('')
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Dossier ${esc(bon.numero)}</title>
<style>body{font-family:Arial,sans-serif;color:#1f2937;max-width:900px;margin:24px auto;padding:0 16px}h1{color:#1A9E8F}h2{color:#1A9E8F;font-size:16px;margin-top:28px;border-bottom:2px solid #1A9E8F;padding-bottom:4px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{border:1px solid #e5e7eb;padding:6px 8px;text-align:left}th{background:#f0fdfa}.kpi{display:inline-block;margin-right:24px}</style></head><body>
<h1>Dossier de commande ${esc(bon.numero)}</h1>
<p><b>Fournisseur :</b> ${esc(bon.fournisseur_nom)}<br><b>Objet :</b> ${esc(bon.objet || '—')}<br><b>Émis le :</b> ${fmtDate(bon.date_emission)} · <b>Montant commande :</b> ${fmt(bon.total_ttc)}<br><b>Statut :</b> ${esc(ETAPES.find((e) => e.k === bon.statut)?.l || bon.statut)}</p>
<h2>Paiements</h2>
<p><span class="kpi"><b>Total facturé :</b> ${fmt(pay.total, bon.devise)}</span><span class="kpi"><b>Payé :</b> ${fmt(pay.paye, bon.devise)}</span><span class="kpi"><b>Reste dû :</b> ${fmt(pay.reste, bon.devise)}</span></p>
<h2>Étapes</h2><table><tr><th>Étape</th><th>Date</th></tr>${ligneEtape}</table>
<h2>Transport & douane</h2><table>
<tr><th>Transporteur</th><td>${esc(bon.transporteur || '—')}</td><th>Incoterm</th><td>${esc(bon.incoterm || '—')}</td></tr>
<tr><th>N° B/L / LTA</th><td>${esc(bon.numero_bl || '—')}</td><th>Tracking</th><td>${esc(bon.numero_tracking || '—')}</td></tr>
<tr><th>Transitaire</th><td>${esc(bon.transitaire || '—')}</td><th>N° déclaration</th><td>${esc(bon.numero_declaration_douane || '—')}</td></tr></table>
<h2>Documents (${docs.length})</h2><table><tr><th>Type</th><th>Fichier</th><th>Réf.</th><th>Date</th><th>Montant</th><th>Paiement</th></tr>${ligneDocs || '<tr><td colspan="6">Aucun document</td></tr>'}</table>
<h2>Historique</h2><table><tr><th>Date</th><th>Événement</th><th>Commentaire</th><th>Par</th></tr>${histo || '<tr><td colspan="4">—</td></tr>'}</table>
<p style="color:#9ca3af;font-size:11px;margin-top:30px">Galerie Médicale — SAJ Groupe · dossier généré le ${new Date().toLocaleDateString('fr-FR')}</p>
</body></html>`
}
