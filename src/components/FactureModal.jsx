import { useState, useEffect } from 'react'
import PrintDocument from '../components/PrintDocument'
import ContextMenu from '../components/ContextMenu'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import { fmt, fmtDate, today, addDays, STATUTS_FACTURE } from '../lib/utils'
import FactureModal from '../components/FactureModal'
import { exportFacturesExcel } from '../lib/exportExcel'
import EditFactureModal from '../components/EditFactureModal'
import toast from 'react-hot-toast'

export default function ProForma() {
  const { isAdmin } = useAuth()
  const [proformas, setProformas] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [editDoc, setEditDoc] = useState(null)

  useEffect(() => { fetchPF() }, [])

  const fetchPF = async () => {
    const { data } = await supabase.from('factures').select('*')
      .eq('type', 'proforma').order('created_at', { ascending: false })
    setProformas(data || [])
    setLoading(false)
  }

  const openPreview = async (pf) => {
    const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', pf.id).order('ordre')
    setPreviewDoc({ ...pf, lignes: lignes || [] })
  }

  const convertirEnFacture = async (pf) => {
    if (!window.confirm(`Convertir ${pf.numero} en facture définitive ?`)) return

    const year = new Date().getFullYear()
    // Numérotation basée sur le dernier numéro réellement utilisé (évite les collisions avec la contrainte UNIQUE sur numero)
    const { data: last } = await supabase
      .from('factures')
      .select('numero')
      .eq('type', 'facture')
      .like('numero', `FACT-%-${year}`)
      .order('numero', { ascending: false })
      .limit(1)

    const lastSeq = last?.[0] ? parseInt(last[0].numero.split('-')[1], 10) : 0
    const numero = `FACT-${String(lastSeq + 1).padStart(3, '0')}-${year}`

    const { data: newFact, error } = await supabase.from('factures').insert({
      ...pf, id: undefined, numero, type: 'facture',
      statut: 'attente', date_emission: today(),
      date_echeance: addDays(today(), 30), created_at: undefined, updated_at: undefined
    }).select().single()

    if (error || !newFact) {
      toast.error(`Échec de la conversion : ${error?.message || 'erreur inconnue'}`)
      return
    }

    const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', pf.id).order('ordre')
    if (lignes?.length) {
      // ★ CORRECTIF : on ne recopie QUE les colonnes insérables.
      // Ne jamais réinsérer `id` ni `total_ht` (colonne générée) : Postgres
      // rejette toute écriture dans une colonne générée, ce qui faisait
      // échouer silencieusement la copie → facture sans lignes (désignations vides).
      const { error: lignesError } = await supabase.from('facture_lignes').insert(
        lignes.map(l => ({
          facture_id: newFact.id,
          produit_id: l.produit_id ?? null,
          designation: l.designation,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
          exonere_tva: !!l.exonere_tva,
          ordre: l.ordre ?? 0,
        }))
      )
      if (lignesError) {
        toast.error(`Facture créée mais copie des lignes échouée : ${lignesError.message}`)
      }
    }
    await supabase.from('factures').update({ statut: 'en_cours' }).eq('id', pf.id)
    toast.success(`Facture ${numero} créée depuis ${pf.numero}`)
    fetchPF()
  }


  const deleteProforma = async (id, numero) => {
    if (!window.confirm(`Supprimer définitivement la pro forma ${numero} ? Cette action est irréversible.`)) return
    await supabase.from('facture_lignes').delete().eq('facture_id', id)
    await supabase.from('factures').delete().eq('id', id)
    toast.success(`Pro forma ${numero} supprimée`)
    fetchPF()
  }

  const handleContextMenu = (e, p) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: '👁', label: 'Aperçu / Imprimer', action: () => openPreview(p) },
        { icon: '✏️', label: 'Modifier', action: () => setEditDoc(p) },
        { icon: '📄', label: 'Convertir en facture', action: () => convertirEnFacture(p) },
        ...(isAdmin ? [
          'divider',
          { icon: '🗑', label: 'Supprimer la pro forma', action: () => deleteProforma(p.id, p.numero), danger: true }
        ] : [])
      ]
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Pro Forma</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => exportFacturesExcel(proformas, 'proforma')} title="Exporter les pro formas">
            📥 Export Excel
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouvelle pro forma</button>
        </div>
      </div>

      <div className="alert alert-info mb-4">
        La pro forma est un document de devis non fiscal. Elle peut être convertie en facture définitive en un clic.
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>N°</th><th>Client</th><th>Objet</th><th>Date</th><th>Validité</th><th>Montant TTC</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Chargement...</td></tr>
              ) : proformas.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Aucune pro forma</td></tr>
              ) : proformas.map(p => {
                const st = STATUTS_FACTURE[p.statut] || STATUTS_FACTURE.en_cours
                return (
                  <tr key={p.id} onContextMenu={e => handleContextMenu(e, p)} style={{ cursor:'context-menu' }}>
                    <td className="font-mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{p.numero}</td>
                    <td style={{ fontWeight: 500 }}>{p.client_nom}</td>
                    <td style={{ color: 'var(--gray)' }}>{p.objet}</td>
                    <td style={{ color: 'var(--gray)' }}>{fmtDate(p.date_emission)}</td>
                    <td style={{ color: 'var(--gray)' }}>{fmtDate(p.date_echeance)}</td>
                    <td className="font-mono" style={{ fontWeight: 600 }}>{fmt(p.total_ttc)}</td>
                    <td><span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditDoc(p)}>✏️ Modifier</button>
                        {isAdmin && (
                          <button className="btn btn-danger btn-sm" onClick={() => deleteProforma(p.id, p.numero)}>🗑 Suppr.</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => openPreview(p)}>
                          👁 Aperçu
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => convertirEnFacture(p)} style={{ whiteSpace: 'nowrap' }}>
                          → Facture
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editDoc && <EditFactureModal doc={editDoc} onClose={() => setEditDoc(null)} onSaved={fetchPF} />}
      {showModal && <FactureModal type="proforma" onClose={() => setShowModal(false)} onSaved={fetchPF} />}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
      {previewDoc && <PrintDocument doc={previewDoc} type="proforma" onClose={() => setPreviewDoc(null)} />}
    </div>
  )
}
