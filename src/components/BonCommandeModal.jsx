import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'

const ligneVide = () => ({ produit_id: null, designation: '', reference: '', quantite: 1, prix_unitaire: '' })

const fmt = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' FCFA'

export default function BonCommandeModal({ bon, onClose, onSaved }) {
  const { user } = useAuth()
  const isEdit = !!bon
  const [fournisseurs, setFournisseurs] = useState([])
  const [produits, setProduits] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    fournisseur_id: '', fournisseur_nom: '', fournisseur_adresse: '',
    objet: '', date_emission: new Date().toISOString().slice(0, 10),
    date_livraison_prevue: '', tva_applicable: true, notes: '',
  })
  const [lignes, setLignes] = useState([ligneVide(), ligneVide(), ligneVide()])

  useEffect(() => {
    (async () => {
      const [f, p] = await Promise.all([
        supabase.from('fournisseurs').select('*').eq('actif', true).order('nom'),
        supabase.from('produits').select('*').eq('actif', true).order('designation'),
      ])
      setFournisseurs(f.data || [])
      setProduits(p.data || [])

      if (isEdit) {
        setForm({
          fournisseur_id: bon.fournisseur_id || '',
          fournisseur_nom: bon.fournisseur_nom || '',
          fournisseur_adresse: bon.fournisseur_adresse || '',
          objet: bon.objet || '',
          date_emission: bon.date_emission || new Date().toISOString().slice(0, 10),
          date_livraison_prevue: bon.date_livraison_prevue || '',
          tva_applicable: bon.tva_applicable !== false,
          notes: bon.notes || '',
        })
        const { data } = await supabase.from('bon_commande_lignes')
          .select('*').eq('bon_commande_id', bon.id).order('ordre')
        if (data && data.length) {
          setLignes(data.map(l => ({
            produit_id: l.produit_id, designation: l.designation, reference: l.reference || '',
            quantite: l.quantite, prix_unitaire: l.prix_unitaire,
          })))
        }
      }
      setLoading(false)
    })()
  }, [])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const choisirFournisseur = (id) => {
    const f = fournisseurs.find(x => String(x.id) === String(id))
    if (f) {
      setForm(prev => ({ ...prev, fournisseur_id: f.id, fournisseur_nom: f.nom, fournisseur_adresse: f.adresse || '' }))
    } else {
      setForm(prev => ({ ...prev, fournisseur_id: '' }))
    }
  }

  const setLigne = (i, k, v) => setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l))

  const choisirProduit = (i, produitId) => {
    const p = produits.find(x => String(x.id) === String(produitId))
    if (p) {
      setLignes(prev => prev.map((l, idx) => idx === i
        ? { ...l, produit_id: p.id, designation: p.designation, reference: p.reference || '', prix_unitaire: l.prix_unitaire || p.prix_ht }
        : l))
    } else {
      setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, produit_id: null } : l))
    }
  }

  const ajouterLigne = () => setLignes(prev => [...prev, ligneVide()])
  const retirerLigne = (i) => setLignes(prev => prev.filter((_, idx) => idx !== i))

  const lignesValides = lignes.filter(l => l.designation.trim() && Number(l.quantite) > 0)
  const sousTotal = lignesValides.reduce((s, l) => s + (Number(l.quantite) * (Number(l.prix_unitaire) || 0)), 0)
  const tva = form.tva_applicable ? sousTotal * 0.18 : 0
  const totalTTC = sousTotal + tva

  const prochainNumero = async () => {
    const annee = new Date().getFullYear()
    const prefixe = `BC-${annee}-`
    const { data } = await supabase.from('bons_commande')
      .select('numero').like('numero', `${prefixe}%`)
      .order('numero', { ascending: false }).limit(1)
    let max = 0
    if (data && data.length) {
      const n = parseInt(String(data[0].numero).split('-').pop(), 10)
      if (!isNaN(n)) max = n
    }
    return prefixe + String(max + 1).padStart(4, '0')
  }

  const enregistrer = async () => {
    if (!form.fournisseur_nom.trim()) { toast.error('Sélectionnez ou saisissez un fournisseur'); return }
    if (lignesValides.length === 0) { toast.error('Ajoutez au moins un article'); return }
    setSaving(true)

    const entete = {
      fournisseur_id: form.fournisseur_id || null,
      fournisseur_nom: form.fournisseur_nom,
      fournisseur_adresse: form.fournisseur_adresse,
      objet: form.objet,
      date_emission: form.date_emission,
      date_livraison_prevue: form.date_livraison_prevue || null,
      tva_applicable: form.tva_applicable,
      sous_total_ht: sousTotal, tva, total_ttc: totalTTC,
      notes: form.notes, updated_at: new Date().toISOString(),
    }

    try {
      let bonId = bon?.id
      if (isEdit) {
        const { error } = await supabase.from('bons_commande').update(entete).eq('id', bonId)
        if (error) throw error
        await supabase.from('bon_commande_lignes').delete().eq('bon_commande_id', bonId)
      } else {
        let insere = null
        for (let essai = 0; essai < 6 && !insere; essai++) {
          const numero = await prochainNumero()
          const { data, error } = await supabase.from('bons_commande')
            .insert({ ...entete, numero, statut: 'brouillon', created_by: user?.id || null })
            .select().single()
          if (error) {
            if (error.code === '23505') continue
            throw error
          }
          insere = data
        }
        if (!insere) throw new Error('Numérotation')
        bonId = insere.id
      }

      const rows = lignesValides.map((l, i) => ({
        bon_commande_id: bonId,
        produit_id: l.produit_id || null,
        designation: l.designation,
        reference: l.reference || null,
        quantite: Number(l.quantite),
        prix_unitaire: Number(l.prix_unitaire) || 0,
        ordre: i,
      }))
      const { error: e2 } = await supabase.from('bon_commande_lignes').insert(rows)
      if (e2) throw e2

      toast.success(isEdit ? 'Bon de commande modifié' : 'Bon de commande créé')
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error('Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 400, padding: 40, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div className="card-title">{isEdit ? `Modifier ${bon.numero}` : 'Nouveau bon de commande'}</div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Fournisseur *</label>
              <select className="input" style={inputStyle} value={form.fournisseur_id}
                onChange={e => choisirFournisseur(e.target.value)}>
                <option value="">— Saisie libre —</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Nom fournisseur (si saisie libre)</label>
              <input className="input" style={inputStyle} value={form.fournisseur_nom}
                onChange={e => set('fournisseur_nom', e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Objet de la commande</label>
            <input className="input" style={inputStyle} value={form.objet}
              onChange={e => set('objet', e.target.value)} placeholder="Ex : Réapprovisionnement consommables dialyse" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Date d'émission</label>
              <input type="date" className="input" style={inputStyle} value={form.date_emission}
                onChange={e => set('date_emission', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Livraison prévue</label>
              <input type="date" className="input" style={inputStyle} value={form.date_livraison_prevue}
                onChange={e => set('date_livraison_prevue', e.target.value)} />
            </div>
          </div>

          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Articles commandés</div>
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #eef2f5' }}>
                  <th style={{ padding: 6 }}>Produit</th>
                  <th style={{ padding: 6 }}>Désignation</th>
                  <th style={{ padding: 6, width: 80 }}>Qté</th>
                  <th style={{ padding: 6, width: 120 }}>P.U. HT</th>
                  <th style={{ padding: 6, width: 110 }}>Total</th>
                  <th style={{ padding: 6, width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 4 }}>
                      <select style={{ ...inputStyle, padding: 6 }} value={l.produit_id || ''}
                        onChange={e => choisirProduit(i, e.target.value)}>
                        <option value="">— Libre —</option>
                        {produits.map(p => <option key={p.id} value={p.id}>{p.reference} · {p.designation}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: 4 }}>
                      <input style={{ ...inputStyle, padding: 6 }} value={l.designation}
                        onChange={e => setLigne(i, 'designation', e.target.value)} />
                    </td>
                    <td style={{ padding: 4 }}>
                      <input type="number" min="0" style={{ ...inputStyle, padding: 6 }} value={l.quantite}
                        onChange={e => setLigne(i, 'quantite', e.target.value)} />
                    </td>
                    <td style={{ padding: 4 }}>
                      <input type="number" min="0" style={{ ...inputStyle, padding: 6 }} value={l.prix_unitaire}
                        onChange={e => setLigne(i, 'prix_unitaire', e.target.value)} />
                    </td>
                    <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                      {(Number(l.quantite) * (Number(l.prix_unitaire) || 0)).toLocaleString('fr-FR')}
                    </td>
                    <td style={{ padding: 4, textAlign: 'center' }}>
                      {lignes.length > 1 && (
                        <button className="btn" style={{ padding: '2px 8px', color: 'var(--danger)' }}
                          onClick={() => retirerLigne(i)}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn" onClick={ajouterLigne} style={{ marginTop: 8 }}>+ Ajouter une ligne</button>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={labelStyle}>Notes internes</label>
              <textarea className="input" style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.notes}
                onChange={e => set('notes', e.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 8 }}>
                <input type="checkbox" checked={form.tva_applicable}
                  onChange={e => set('tva_applicable', e.target.checked)} />
                Appliquer la TVA 18 %
              </label>
            </div>
            <div style={{ minWidth: 220, background: '#f8fafc', borderRadius: 8, padding: 12 }}>
              <Ligne label="Sous-total HT" val={fmt(sousTotal)} />
              <Ligne label="TVA 18 %" val={fmt(tva)} />
              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 6, paddingTop: 6 }}>
                <Ligne label="Total TTC" val={fmt(totalTTC)} bold />
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 16, borderTop: '1px solid #eef2f5', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={enregistrer} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 12, color: 'var(--gray)', marginBottom: 4, fontWeight: 600 }
const inputStyle = { width: '100%', padding: 9, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }

function Ligne({ label, val, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? 'inherit' : 'var(--gray)' }}>{label}</span>
      <span>{val}</span>
    </div>
  )
}
