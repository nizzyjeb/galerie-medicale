import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, calcTotals } from '../lib/utils'
import toast from 'react-hot-toast'

export default function EditFactureModal({ doc, onClose, onSaved }) {
  const [produits, setProduits] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    client_nom: doc.client_nom || '',
    client_adresse: doc.client_adresse || '',
    client_nif: doc.client_nif || '',
    objet: doc.objet || '',
    date_emission: doc.date_emission || '',
    remise_pct: doc.remise_pct || 0,
  })
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('produits').select('*').eq('actif', true).order('designation'),
      supabase.from('facture_lignes').select('*').eq('facture_id', doc.id).order('ordre')
    ]).then(([{ data: prods }, { data: ligs }]) => {
      setProduits(prods || [])
      setLignes((ligs || []).map(l => ({
        id: l.id,
        designation: l.designation,
        quantite: l.quantite,
        prix_unitaire: l.prix_unitaire,
        produit_id: l.produit_id,
        exonere_tva: !!l.exonere_tva,
        isNew: false
      })))
      setLoading(false)
    })
  }, [])

  const setLigne = (i, key, val) =>
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l))

  const applyProduit = (i, produitId) => {
    const p = produits.find(p => p.id === parseInt(produitId))
    if (p) setLignes(prev => prev.map((l, idx) => idx === i
      ? { ...l, designation: p.designation, prix_unitaire: p.prix_ht, produit_id: p.id, exonere_tva: !!p.exonere_tva }
      : l))
  }

  const addLigne = () => setLignes(prev => [...prev, {
    id: null, designation: '', quantite: 1, prix_unitaire: '', produit_id: null, exonere_tva: false, isNew: true
  }])

  const removeLigne = (i) => setLignes(prev => prev.filter((_, idx) => idx !== i))

  const lignesValides = lignes.filter(l => l.designation && parseFloat(l.quantite) > 0 && parseFloat(l.prix_unitaire) > 0)
  const totaux = calcTotals(
    lignesValides.map(l => ({ quantite: parseFloat(l.quantite), prix_unitaire: parseFloat(l.prix_unitaire), exonere_tva: !!l.exonere_tva })),
    parseFloat(form.remise_pct) || 0
  )

  const handleSave = async () => {
    if (!form.client_nom.trim()) { toast.error('Nom du client requis'); return }
    if (lignesValides.length === 0) { toast.error('Ajoutez au moins une prestation'); return }
    setSaving(true)

    // Mettre à jour la facture
    const { error } = await supabase.from('factures').update({
      client_nom: form.client_nom,
      client_adresse: form.client_adresse,
      client_nif: form.client_nif,
      objet: form.objet,
      date_emission: form.date_emission,
      remise_pct: parseFloat(form.remise_pct) || 0,
      sous_total_ht: totaux.sousTotal,
      montant_remise: totaux.remise,
      base_ht: totaux.base,
      tva: totaux.tva,
      css: totaux.css,
      total_ttc: totaux.ttc,
      updated_at: new Date().toISOString()
    }).eq('id', doc.id)

    if (error) { toast.error('Erreur lors de la sauvegarde'); setSaving(false); return }

    // Supprimer toutes les anciennes lignes et réinsérer
    await supabase.from('facture_lignes').delete().eq('facture_id', doc.id)
    await supabase.from('facture_lignes').insert(
      lignesValides.map((l, i) => ({
        facture_id: doc.id,
        produit_id: l.produit_id || null,
        designation: l.designation,
        quantite: parseFloat(l.quantite),
        prix_unitaire: parseFloat(l.prix_unitaire),
        exonere_tva: !!l.exonere_tva,
        ordre: i
      }))
    )

    toast.success('Document mis à jour !')
    setSaving(false)
    onSaved?.()
    onClose()
  }

  if (loading) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:12, padding:40, color:'var(--gray)' }}>Chargement...</div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <div>
            <div className="card-title">Modifier — {doc.numero}</div>
            <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
              {doc.type === 'facture' ? 'Facture' : 'Pro Forma'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--gray)' }}>✕</button>
        </div>

        <div className="modal-body">
          {/* Infos client */}
          <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: .5 }}>
            Informations client
          </div>
          <div className="form-grid form-grid-2 mb-4">
            <div className="form-group">
              <label>Nom / Raison sociale *</label>
              <input value={form.client_nom} onChange={e => setForm(f => ({ ...f, client_nom: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>NIF client</label>
              <input value={form.client_nif} onChange={e => setForm(f => ({ ...f, client_nif: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Adresse</label>
              <input value={form.client_adresse} onChange={e => setForm(f => ({ ...f, client_adresse: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Date d'émission</label>
              <input type="date" value={form.date_emission} onChange={e => setForm(f => ({ ...f, date_emission: e.target.value }))} />
            </div>
          </div>
          <div className="form-group mb-4">
            <label>Objet</label>
            <input value={form.objet} onChange={e => setForm(f => ({ ...f, objet: e.target.value }))} />
          </div>

          <div className="divider" />

          {/* Lignes */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: .5 }}>
              Prestations ({lignes.length})
            </div>
            <button className="btn btn-ghost btn-sm" onClick={addLigne}>+ Ajouter ligne</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th>Désignation</th>
                  <th style={{ width: 70 }}>Qté</th>
                  <th style={{ width: 140, textAlign: 'right' }}>P.U. (FCFA)</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Total HT</th>
                  <th style={{ width: 70, textAlign: 'center' }} title="Exonéré de TVA">Exo. TVA</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'var(--lgray)' : '#fff' }}>
                    <td style={{ textAlign: 'center', color: 'var(--gray)', fontSize: 11 }}>{i + 1}</td>
                    <td>
                      <select
                        style={{ border: 'none', background: 'transparent', width: '100%', fontSize: 12, marginBottom: 2 }}
                        value={l.produit_id || ''}
                        onChange={e => applyProduit(i, e.target.value)}
                      >
                        <option value="">-- Choisir un produit --</option>
                        {produits.map(p => <option key={p.id} value={p.id}>{p.designation}{p.exonere_tva ? ' (exonéré)' : ''}</option>)}
                      </select>
                      <input
                        style={{ border: 'none', background: 'transparent', width: '100%', fontSize: 12, color: 'var(--gray)' }}
                        placeholder="Ou saisir manuellement..."
                        value={l.designation}
                        onChange={e => setLigne(i, 'designation', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        style={{ border: 'none', background: 'transparent', textAlign: 'center', width: 60, fontSize: 12 }}
                        type="number" min="1"
                        value={l.quantite}
                        onChange={e => setLigne(i, 'quantite', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        style={{ border: 'none', background: 'transparent', textAlign: 'right', width: '100%', fontFamily: 'var(--mono)', fontSize: 12 }}
                        type="number" min="0"
                        value={l.prix_unitaire}
                        onChange={e => setLigne(i, 'prix_unitaire', e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>
                      {l.designation && parseFloat(l.prix_unitaire) > 0
                        ? fmt(parseFloat(l.quantite) * parseFloat(l.prix_unitaire))
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!l.exonere_tva}
                        onChange={e => setLigne(i, 'exonere_tva', e.target.checked)}
                        title="Cette ligne est exonérée de TVA"
                        style={{ cursor:'pointer' }}
                      />
                    </td>
                    <td>
                      <button onClick={() => removeLigne(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px 6px', fontSize: 14 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divider" />

          {/* Remise + totaux */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
            <div className="form-group" style={{ maxWidth: 180 }}>
              <label>Remise (%)</label>
              <input type="number" min="0" max="100"
                value={form.remise_pct}
                onChange={e => setForm(f => ({ ...f, remise_pct: e.target.value }))}
              />
            </div>
            <div style={{ minWidth: 280 }}>
              {[
                ['Sous-total HT', totaux.sousTotal, true],
                ['Remise', -totaux.remise, true],
                ['Base HT après remise', totaux.base, true],
                ['TVA 18%', totaux.tva, totaux.tva > 0],
                ['CSS 1%', totaux.css, totaux.css > 0],
              ].filter(([,,show]) => show).map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--gray)' }}>{label}</span>
                  <span className="font-mono">{fmt(Math.abs(val))}</span>
                </div>
              ))}
              {totaux.toutExonere && (
                <div style={{ fontSize:11, color:'#92400e', background:'#fef3c7', padding:'6px 10px', borderRadius:6, marginBottom:6, fontStyle:'italic' }}>
                  Toutes les lignes sont exonérées — pas de TVA ni CSS appliquée.
                </div>
              )}
              <div style={{ background: 'var(--teal)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>TOTAL TTC</span>
                <span style={{ color: '#fff', fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 600 }}>{fmt(totaux.ttc)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </div>
      </div>
    </div>
  )
}
