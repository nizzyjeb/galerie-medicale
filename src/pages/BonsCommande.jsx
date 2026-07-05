import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'
import BonCommandeModal from '../components/BonCommandeModal.jsx'
import { imprimerBonCommande } from '../components/BonCommandePrint.jsx'

const fmt = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' FCFA'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

const STATUTS = {
  brouillon: { label: 'Brouillon', color: '#94a3b8' },
  envoye: { label: 'Envoyé', color: '#3b82f6' },
  recu: { label: 'Reçu', color: '#1A9E8F' },
  annule: { label: 'Annulé', color: '#ef4444' },
}

export default function BonsCommande() {
  const { user, isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState(null)
  const [filtreStatut, setFiltreStatut] = useState('tous')

  const charger = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('bons_commande').select('*')
      .order('created_at', { ascending: false })
    if (error) toast.error('Erreur de chargement')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { charger() }, [])

  const nouveau = () => { setEdit(null); setModal(true) }
  const modifier = (b) => { setEdit(b); setModal(true) }

  const imprimer = async (b) => {
    const { data } = await supabase.from('bon_commande_lignes')
      .select('*').eq('bon_commande_id', b.id).order('ordre')
    imprimerBonCommande(b, data || [])
  }

  const changerStatut = async (b, statut) => {
    const { error } = await supabase.from('bons_commande')
      .update({ statut, updated_at: new Date().toISOString() }).eq('id', b.id)
    if (error) { toast.error('Erreur'); return }
    toast.success('Statut mis à jour')
    charger()
  }

  const receptionner = async (b) => {
    if (b.statut === 'recu') return
    if (!window.confirm(`Marquer ${b.numero} comme reçu ?\nLe stock des produits suivis sera automatiquement augmenté.`)) return

    const { data: lignes } = await supabase.from('bon_commande_lignes')
      .select('*, produits(id, stock_gere, designation)')
      .eq('bon_commande_id', b.id)

    let entrees = 0
    for (const l of (lignes || [])) {
      if (l.produit_id && l.produits && l.produits.stock_gere) {
        const { error } = await supabase.rpc('fn_appliquer_mouvement', {
          p_produit_id: l.produit_id,
          p_type: 'entree',
          p_delta: Math.abs(Number(l.quantite)),
          p_motif: 'Réception commande fournisseur',
          p_ref: b.numero,
          p_user: user?.id || null,
        })
        if (!error) entrees++
      }
    }

    const { error } = await supabase.from('bons_commande').update({
      statut: 'recu', recu_le: new Date().toISOString(), recu_par: user?.id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', b.id)
    if (error) { toast.error('Erreur lors de la réception'); return }

    toast.success(entrees > 0
      ? `Commande reçue — stock mis à jour (${entrees} produit${entrees > 1 ? 's' : ''})`
      : 'Commande reçue')
    charger()
  }

  const supprimer = async (b) => {
    if (!window.confirm(`Supprimer le bon ${b.numero} ?`)) return
    const { error } = await supabase.from('bons_commande').delete().eq('id', b.id)
    if (error) { toast.error('Suppression impossible'); return }
    toast.success('Bon supprimé')
    charger()
  }

  const filtres = filtreStatut === 'tous' ? items : items.filter(b => b.statut === filtreStatut)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Bons de commande</h1>
          <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4 }}>Commandes fournisseurs · Achats</div>
        </div>
        <button className="btn btn-primary" onClick={nouveau}>+ Nouveau bon de commande</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['tous', 'brouillon', 'envoye', 'recu', 'annule'].map(s => (
          <button key={s} className="btn"
            onClick={() => setFiltreStatut(s)}
            style={{
              background: filtreStatut === s ? 'var(--teal)' : '#fff',
              color: filtreStatut === s ? '#fff' : 'var(--gray)',
              border: '1px solid #e2e8f0', textTransform: 'capitalize',
            }}>
            {s === 'tous' ? 'Tous' : STATUTS[s].label}
          </button>
        ))}
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
                  <th style={{ padding: 10 }}>Total TTC</th>
                  <th style={{ padding: 10 }}>Statut</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map(b => {
                  const st = STATUTS[b.statut] || STATUTS.brouillon
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 10, fontWeight: 700 }}>{b.numero}</td>
                      <td style={{ padding: 10 }}>{b.fournisseur_nom}</td>
                      <td style={{ padding: 10 }}>{fmtDate(b.date_emission)}</td>
                      <td style={{ padding: 10 }}>{fmt(b.total_ttc)}</td>
                      <td style={{ padding: 10 }}>
                        <span className="badge" style={{ background: st.color, color: '#fff' }}>{st.label}</span>
                      </td>
                      <td style={{ padding: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn" onClick={() => imprimer(b)} style={btnMini}>Imprimer</button>
                        {b.statut !== 'recu' && b.statut !== 'annule' && (
                          <button className="btn" onClick={() => modifier(b)} style={btnMini}>Modifier</button>
                        )}
                        {b.statut === 'brouillon' && (
                          <button className="btn" onClick={() => changerStatut(b, 'envoye')} style={btnMini}>Envoyer</button>
                        )}
                        {(b.statut === 'brouillon' || b.statut === 'envoye') && (
                          <button className="btn btn-primary" onClick={() => receptionner(b)} style={btnMini}>Réceptionner</button>
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

      {modal && (
        <BonCommandeModal bon={edit} onClose={() => setModal(false)} onSaved={charger} />
      )}
    </div>
  )
}

const btnMini = { marginLeft: 6, padding: '4px 10px', fontSize: 13 }
