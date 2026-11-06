import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'
import BonCommandeModal from '../components/BonCommandeModal.jsx'
import { imprimerBonCommande } from '../components/BonCommandePrint.jsx'
import SuiviCommande, { ETAPES } from '../components/SuiviCommande.jsx'

const fmt = (n, devise = 'FCFA') => (Math.round(Number(n) || 0)).toLocaleString('fr-FR') + ' ' + (devise || 'FCFA')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

const COULEURS = {
  brouillon: '#94a3b8', envoye: '#3b82f6', confirme: '#6366f1', expedie: '#0ea5e9',
  arrive: '#f59e0b', dedouane: '#8b5cf6', recu: '#1A9E8F', annule: '#ef4444',
}
const libelleStatut = (s) => s === 'annule' ? 'Annulé' : (ETAPES.find((e) => e.k === s)?.l || s)

const statutPaiement = (p) => {
  if (!p || Number(p.nb_factures) === 0) return { k: 'aucune', l: 'Pas de facture', bg: '#f1f5f9', c: '#64748b' }
  const reste = Number(p.total_factures) - Number(p.total_paye)
  if (reste <= 0.5) return { k: 'payee', l: 'Soldée', bg: '#dcfce7', c: '#166534' }
  if (Number(p.total_paye) > 0) return { k: 'partielle', l: `Partielle (${p.nb_payees}/${p.nb_factures})`, bg: '#fef3c7', c: '#92400e' }
  return { k: 'impayee', l: 'Non payée', bg: '#fee2e2', c: '#991b1b' }
}

export default function BonsCommande() {
  const { user, isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [paiements, setPaiements] = useState({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState(null)
  const [suivi, setSuivi] = useState(null)
  const [filtreStatut, setFiltreStatut] = useState('en_cours')
  const [filtrePaiement, setFiltrePaiement] = useState('tous')
  const [recherche, setRecherche] = useState('')

  const charger = async () => {
    setLoading(true)
    const [b, p] = await Promise.all([
      supabase.from('bons_commande').select('*').order('created_at', { ascending: false }),
      supabase.from('v_bons_commande_paiement').select('*'),
    ])
    if (b.error) toast.error('Erreur de chargement')
    setItems(b.data || [])
    setPaiements(Object.fromEntries((p.data || []).map((x) => [x.bon_commande_id, x])))
    setLoading(false)
  }

  useEffect(() => { charger() }, [])

  const nouveau = () => { setEdit(null); setModal(true) }
  const modifier = (b) => { setEdit(b); setModal(true) }

  const imprimer = async (b) => {
    const { data } = await supabase.from('bon_commande_lignes').select('*').eq('bon_commande_id', b.id).order('ordre')
    imprimerBonCommande(b, data || [])
  }

  // Réception en stock — renvoie true si la commande a été réceptionnée
  const receptionner = async (b) => {
    if (b.statut === 'recu') return false
    if (!window.confirm(`Marquer ${b.numero} comme reçu ?\nLe stock des produits suivis sera automatiquement augmenté.`)) return false

    const { data: lignes } = await supabase.from('bon_commande_lignes')
      .select('*, produits(id, stock_gere, designation)')
      .eq('bon_commande_id', b.id)

    let entrees = 0
    for (const l of (lignes || [])) {
      if (l.produit_id && l.produits && l.produits.stock_gere) {
        const { error } = await supabase.rpc('fn_stock_mouvement', {
          p_produit_id: l.produit_id, p_type: 'entree', p_quantite: Math.abs(Number(l.quantite)),
          p_motif: 'Réception commande fournisseur', p_ref: b.numero,
        })
        if (!error) entrees++
        else toast.error(`${l.designation} : ${error.message}`)
      }
    }

    const { error } = await supabase.from('bons_commande').update({
      statut: 'recu', recu_le: new Date().toISOString(), recu_par: user?.id || null, updated_at: new Date().toISOString(),
    }).eq('id', b.id)
    if (error) { toast.error('Erreur lors de la réception'); return false }

    toast.success(entrees > 0 ? `Commande reçue — stock mis à jour (${entrees} produit${entrees > 1 ? 's' : ''})` : 'Commande reçue')
    charger()
    return true
  }

  const annuler = async (b) => {
    if (!window.confirm(`Annuler la commande ${b.numero} ?`)) return
    const { error } = await supabase.from('bons_commande').update({ statut: 'annule', updated_at: new Date().toISOString() }).eq('id', b.id)
    if (error) { toast.error(error.message); return }
    await supabase.from('bon_commande_etapes').insert({ bon_commande_id: b.id, etape: 'annule', commentaire: 'Commande annulée', created_by: user?.id })
    toast.success('Commande annulée')
    charger()
  }

  const supprimer = async (b) => {
    const p = paiements[b.id]
    if (!window.confirm(`Supprimer le bon ${b.numero} ?${p?.nb_documents ? `\n${p.nb_documents} document(s) attaché(s) seront aussi supprimés.` : ''}`)) return
    const { data: docs } = await supabase.from('bon_commande_documents').select('path').eq('bon_commande_id', b.id)
    const { error } = await supabase.from('bons_commande').delete().eq('id', b.id)
    if (error) { toast.error('Suppression impossible'); return }
    if (docs?.length) await supabase.storage.from('commandes').remove(docs.map((d) => d.path))
    toast.success('Bon supprimé')
    charger()
  }

  const filtres = items
    .filter((b) => filtreStatut === 'tous' ? true : filtreStatut === 'en_cours' ? !['recu', 'annule'].includes(b.statut) : b.statut === filtreStatut)
    .filter((b) => filtrePaiement === 'tous' ? true : statutPaiement(paiements[b.id]).k === filtrePaiement)
    .filter((b) => !recherche || `${b.numero} ${b.fournisseur_nom} ${b.objet || ''} ${b.numero_bl || ''}`.toLowerCase().includes(recherche.toLowerCase()))

  // Synthèse des dettes fournisseurs
  const synthese = Object.values(paiements).reduce((s, p) => {
    s.total += Number(p.total_factures); s.paye += Number(p.total_paye)
    s.nbImpayees += Number(p.nb_factures) - Number(p.nb_payees)
    return s
  }, { total: 0, paye: 0, nbImpayees: 0 })
  const enTransit = items.filter((b) => ['expedie', 'arrive', 'dedouane'].includes(b.statut)).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Bons de commande</h1>
          <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4 }}>Commandes fournisseurs · suivi jusqu'au dédouanement · paiements</div>
        </div>
        <button className="btn btn-primary" onClick={nouveau}>+ Nouveau bon de commande</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase' }}>Commandes en cours</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{items.filter((b) => !['recu', 'annule'].includes(b.statut)).length}</div>
          <div style={{ fontSize: 11, color: 'var(--gray)' }}>dont {enTransit} en transit / douane</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase' }}>Factures fournisseurs & frais</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(synthese.total)}</div>
          <div style={{ fontSize: 11, color: '#16a34a' }}>payé {fmt(synthese.paye)}</div>
        </div>
        <div className="card" style={{ borderColor: synthese.total - synthese.paye > 0 ? 'var(--danger)' : undefined }}>
          <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase' }}>Reste dû aux fournisseurs</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{fmt(synthese.total - synthese.paye)}</div>
          <div style={{ fontSize: 11, color: 'var(--gray)' }}>{synthese.nbImpayees} facture(s) non payée(s)</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['en_cours', 'En cours'], ['tous', 'Tous'], ...ETAPES.map((e) => [e.k, e.l]), ['annule', 'Annulés']].map(([k, l]) => (
          <button key={k} className="btn btn-sm" onClick={() => setFiltreStatut(k)}
            style={{ background: filtreStatut === k ? 'var(--teal)' : '#fff', color: filtreStatut === k ? '#fff' : 'var(--gray)', border: '1px solid #e2e8f0' }}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--gray)' }}>Paiement :</span>
        {[['tous', 'Tous'], ['impayee', 'Non payées'], ['partielle', 'Partielles'], ['payee', 'Soldées'], ['aucune', 'Sans facture']].map(([k, l]) => (
          <button key={k} className="btn btn-sm" onClick={() => setFiltrePaiement(k)}
            style={{ background: filtrePaiement === k ? '#334155' : '#fff', color: filtrePaiement === k ? '#fff' : 'var(--gray)', border: '1px solid #e2e8f0' }}>{l}</button>
        ))}
        <input placeholder="Rechercher n°, fournisseur, B/L…" value={recherche} onChange={(e) => setRecherche(e.target.value)}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, minWidth: 220 }} />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
        ) : filtres.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Aucun bon de commande.</div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #eef2f5' }}>
                  <th style={{ padding: 10 }}>N°</th>
                  <th style={{ padding: 10 }}>Fournisseur</th>
                  <th style={{ padding: 10 }}>Émission</th>
                  <th style={{ padding: 10 }}>Total</th>
                  <th style={{ padding: 10 }}>Étape</th>
                  <th style={{ padding: 10 }}>Paiement</th>
                  <th style={{ padding: 10 }}>Docs</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((b) => {
                  const sp = statutPaiement(paiements[b.id])
                  const p = paiements[b.id]
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 10, fontWeight: 700, cursor: 'pointer', color: 'var(--teal)' }} onClick={() => setSuivi(b)}>{b.numero}</td>
                      <td style={{ padding: 10 }}>{b.fournisseur_nom}</td>
                      <td style={{ padding: 10 }}>{fmtDate(b.date_emission)}</td>
                      <td style={{ padding: 10 }}>{fmt(b.total_ttc, b.devise)}</td>
                      <td style={{ padding: 10 }}>
                        <span className="badge" style={{ background: COULEURS[b.statut] || '#94a3b8', color: '#fff' }}>{libelleStatut(b.statut)}</span>
                      </td>
                      <td style={{ padding: 10 }}>
                        <span className="badge" style={{ background: sp.bg, color: sp.c }}>{sp.l}</span>
                        {p && Number(p.total_factures) > Number(p.total_paye) && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>reste {fmt(Number(p.total_factures) - Number(p.total_paye), b.devise)}</div>}
                      </td>
                      <td style={{ padding: 10, color: 'var(--gray)' }}>📎 {p?.nb_documents || 0}</td>
                      <td style={{ padding: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-primary" onClick={() => setSuivi(b)} style={btnMini}>Suivi & dossier</button>
                        <button className="btn" onClick={() => imprimer(b)} style={btnMini}>Imprimer</button>
                        {!['recu', 'annule'].includes(b.statut) && (
                          <button className="btn" onClick={() => modifier(b)} style={btnMini}>Modifier</button>
                        )}
                        {!['recu', 'annule'].includes(b.statut) && (
                          <button className="btn" onClick={() => annuler(b)} style={{ ...btnMini, color: '#b45309' }}>Annuler</button>
                        )}
                        {isAdmin && (
                          <button className="btn" onClick={() => supprimer(b)} style={{ ...btnMini, color: 'var(--danger)' }}>Suppr.</button>
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

      {modal && <BonCommandeModal bon={edit} onClose={() => setModal(false)} onSaved={charger} />}
      {suivi && <SuiviCommande bon={suivi} onClose={() => setSuivi(null)} onChanged={charger} onReceptionner={receptionner} />}
    </div>
  )
}

const btnMini = { marginLeft: 6, padding: '4px 10px', fontSize: 13 }
