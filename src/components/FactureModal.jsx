import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, today, addDays, calcTotals } from '../lib/utils'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'

export default function FactureModal({ type = 'facture', onClose, onSaved }) {
  const { user, profile, isAdmin } = useAuth()
  const [produits, setProduits] = useState([])
  const [loading, setSaving] = useState(false)
  const [form, setForm] = useState({
    client_nom: '', client_adresse: '', client_nif: '', objet: '',
    date_emission: today(), remise_pct: 0,
  })
  const [lignes, setLignes] = useState([
    { designation: '', quantite: 1, prix_unitaire: '', produit_id: null, exonere_tva: false },
    { designation: '', quantite: 1, prix_unitaire: '', produit_id: null, exonere_tva: false },
    { designation: '', quantite: 1, prix_unitaire: '', produit_id: null, exonere_tva: false },
  ])

  useEffect(() => {
    supabase.from('produits').select('*').eq('actif', true).order('designation')
      .then(({ data }) => setProduits(data || []))
  }, [])

  const setLigne = (i, key, val) => {
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l))
  }

  const applyProduit = (i, produitId) => {
    const p = produits.find(p => p.id === parseInt(produitId))
    if (p) {
      setLignes(prev => prev.map((l, idx) => idx === i
        ? { ...l, designation: p.designation, prix_unitaire: p.prix_ht, produit_id: p.id, exonere_tva: !!p.exonere_tva }
        : l))
    } else {
      setLigne(i, 'produit_id', null)
    }
  }

  const addLigne = () => setLignes(prev => [...prev, { designation: '', quantite: 1, prix_unitaire: '', produit_id: null, exonere_tva: false }])
  const removeLigne = (i) => setLignes(prev => prev.filter((_, idx) => idx !== i))

  const lignesValides = lignes.filter(l => l.designation && l.quantite > 0 && parseFloat(l.prix_unitaire) > 0)
  const totaux = calcTotals(
    lignesValides.map(l => ({ quantite: parseFloat(l.quantite), prix_unitaire: parseFloat(l.prix_unitaire), exonere_tva: !!l.exonere_tva })),
    form.remise_pct
  )

  const handleSave = async () => {
    if (!form.client_nom.trim()) { toast.error('Nom du client requis'); return }
    if (!form.objet.trim()) { toast.error('Objet requis'); return }
    if (lignesValides.length === 0) { toast.error('Ajoutez au moins une prestation'); return }
    setSaving(true)

    const prefix = type === 'facture' ? 'FACT' : 'PF'
    const annee = new Date().getFullYear()

    // ★ CORRECTIF : calcule le prochain numéro à partir du PLUS GRAND numéro
    // réellement existant (et non du nombre de lignes). Robuste aux suppressions.
    const prochainNumero = async () => {
      const { data: existants } = await supabase
        .from('factures')
        .select('numero')
        .eq('type', type)
        .like('numero', `${prefix}-%-${annee}`)
      let maxSeq = 0
      const regex = new RegExp(`^${prefix}-(\\d+)-${annee}$`)
      for (const row of (existants || [])) {
        const m = row.numero?.match(regex)
        if (m) {
          const n = parseInt(m[1], 10)
          if (n > maxSeq) maxSeq = n
        }
      }
      return `${prefix}-${String(maxSeq + 1).padStart(3, '0')}-${annee}`
    }

    // ★ Logique de validation selon le rôle
    // - Pro forma : jamais validée (valide = false)
    // - Facture créée par admin : automatiquement validée
    // - Facture créée par comptable : en attente de validation
    const estFactureValidee = type === 'facture' && isAdmin

    const construireData = (numero) => ({
      numero, type,
      client_nom: form.client_nom,
      client_adresse: form.client_adresse,
      client_nif: form.client_nif,
      objet: form.objet,
      date_emission: form.date_emission,
      date_echeance: addDays(form.date_emission, 30),
      remise_pct: parseFloat(form.remise_pct) || 0,
      sous_total_ht: totaux.sousTotal,
      montant_remise: totaux.remise,
      base_ht: totaux.base,
      tva: totaux.tva,
      css: totaux.css,
      total_ttc: totaux.ttc,
      statut: type === 'facture' ? 'attente' : 'en_cours',
      created_by: user.id,
      valide: estFactureValidee,
      valide_par: estFactureValidee ? user.id : null,
      date_validation: estFactureValidee ? new Date().toISOString() : null,
    })

    // ★ CORRECTIF : insertion avec jusqu'à 5 tentatives en cas de collision de
    // numéro (code 23505) — utile si deux personnes créent un document en même temps.
    let facture = null
    let derniereErreur = null
    for (let essai = 0; essai < 5; essai++) {
      const numero = await prochainNumero()
      const { data, error } = await supabase.from('factures').insert(construireData(numero)).select().single()
      if (!error) { facture = data; break }
      derniereErreur = error
      if (error.code !== '23505') break // autre erreur que doublon → on arrête
      // sinon : numéro pris entre-temps, on recalcule et on réessaie
    }

    if (!facture) {
      console.error('Erreur sauvegarde facture :', derniereErreur)
      toast.error('Erreur lors de la sauvegarde')
      setSaving(false)
      return
    }

    const lignesData = lignesValides.map((l, i) => ({
      facture_id: facture.id,
      produit_id: l.produit_id || null,
      designation: l.designation,
      quantite: parseFloat(l.quantite),
      prix_unitaire: parseFloat(l.prix_unitaire),
      exonere_tva: !!l.exonere_tva,
      ordre: i,
    }))

    await supabase.from('facture_lignes').insert(lignesData)

    // Message adapté selon validation
    if (type === 'facture' && !isAdmin) {
      toast.success(`Facture ${facture.numero} créée ! En attente de validation par un administrateur.`)
    } else {
      toast.success(`${type === 'facture' ? 'Facture' : 'Pro Forma'} ${facture.numero} créée !`)
    }
    
    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="card-title">{type === 'facture' ? 'Nouvelle facture' : 'Nouvelle pro forma'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--gray)' }}>✕</button>
        </div>
        <div className="modal-body">
          {/* ★ NOUVEAU : Bandeau d'avertissement pour le comptable créant une facture */}
          {type === 'facture' && !isAdmin && profile?.role === 'comptable' && (
            <div style={{
              padding: '10px 14px', marginBottom: 16, borderRadius: 8,
              background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412',
              fontSize: 13
            }}>
              ⚠️ Cette facture sera créée <strong>en attente de validation</strong>. Seul un administrateur peut la valider définitivement.
            </div>
          )}

          <div className="form-grid form-grid-2 mb-4">
            <div className="form-group">
              <label>Nom / Raison sociale *</label>
              <input value={form.client_nom} onChange={e => setForm(f=>({...f,client_nom:e.target.value}))} placeholder="CHU de Libreville" />
            </div>
            <div className="form-group">
              <label>NIF client</label>
              <input value={form.client_nif} onChange={e => setForm(f=>({...f,client_nif:e.target.value}))} placeholder="N° NIF" />
            </div>
            <div className="form-group">
              <label>Adresse</label>
              <input value={form.client_adresse} onChange={e => setForm(f=>({...f,client_adresse:e.target.value}))} placeholder="Adresse, Libreville, Gabon" />
            </div>
            <div className="form-group">
              <label>Date d'émission</label>
              <input type="date" value={form.date_emission} onChange={e => setForm(f=>({...f,date_emission:e.target.value}))} />
            </div>
          </div>
          <div className="form-group mb-4">
            <label>Objet / Commande *</label>
            <input value={form.objet} onChange={e => setForm(f=>({...f,objet:e.target.value}))} placeholder="Fourniture de consommables médicaux" />
          </div>

          <div className="divider" />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div className="card-title">Prestations</div>
            <button className="btn btn-ghost btn-sm" onClick={addLigne}>+ Ajouter ligne</button>
          </div>

          <div style={{ overflowX:'auto' }}>
            <table style={{ minWidth:600 }}>
              <thead>
                <tr>
                  <th style={{ width:30 }}>#</th>
                  <th>Désignation</th>
                  <th style={{ width:70 }}>Qté</th>
                  <th style={{ width:130, textAlign:'right' }}>P.U. (FCFA)</th>
                  <th style={{ width:130, textAlign:'right' }}>Total HT</th>
                  <th style={{ width:70, textAlign:'center' }} title="Exonéré de TVA">Exo. TVA</th>
                  <th style={{ width:30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} style={{ background: i%2===0 ? 'var(--lgray)' : '#fff' }}>
                    <td style={{ textAlign:'center', color:'var(--gray)', fontSize:11 }}>{i+1}</td>
                    <td>
                      <select style={{ border:'none', background:'transparent', width:'100%', fontSize:12 }}
                        value={l.produit_id || ''} onChange={e => applyProduit(i, e.target.value)}>
                        <option value="">-- Choisir un produit --</option>
                        {produits.map(p => <option key={p.id} value={p.id}>{p.designation}{p.exonere_tva ? ' (exonéré)' : ''}</option>)}
                      </select>
                      {l.designation && <div style={{ fontSize:11, color:'var(--gray)', padding:'0 8px' }}>{l.designation}</div>}
                    </td>
                    <td>
                      <input style={{ border:'none', background:'transparent', textAlign:'center', width:60 }}
                        type="number" min="1" value={l.quantite} onChange={e => setLigne(i,'quantite',e.target.value)} />
                    </td>
                    <td>
                      <input style={{ border:'none', background:'transparent', textAlign:'right', width:'100%', fontFamily:'var(--mono)' }}
                        type="number" min="0" value={l.prix_unitaire} onChange={e => setLigne(i,'prix_unitaire',e.target.value)} placeholder="0" />
                    </td>
                    <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:12 }}>
                      {l.designation && parseFloat(l.prix_unitaire) > 0
                        ? fmt(parseFloat(l.quantite) * parseFloat(l.prix_unitaire))
                        : '—'}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <input
                        type="checkbox"
                        checked={!!l.exonere_tva}
                        onChange={e => setLigne(i, 'exonere_tva', e.target.checked)}
                        title="Cette ligne est exonérée de TVA"
                        style={{ cursor:'pointer' }}
                      />
                    </td>
                    <td>
                      <button onClick={() => removeLigne(i)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', padding:'2px 6px' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divider" />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:20 }}>
            <div className="form-group" style={{ maxWidth:180 }}>
              <label>Remise (%)</label>
              <input type="number" min="0" max="100" value={form.remise_pct}
                onChange={e => setForm(f=>({...f,remise_pct:e.target.value}))} />
            </div>
            <div style={{ minWidth:260 }}>
              {[
                ['Sous-total HT', totaux.sousTotal, true],
                ['Remise', -totaux.remise, true],
                ['Base HT après remise', totaux.base, true],
                ['TVA 18%', totaux.tva, totaux.tva > 0],
                ['CSS 1%', totaux.css, true],
              ].filter(([,,show]) => show).map(([label, val]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
                  <span style={{ color:'var(--gray)' }}>{label}</span>
                  <span className="font-mono">{fmt(Math.abs(val))}</span>
                </div>
              ))}
              {totaux.tvaExoneree && (
                <div style={{ fontSize:11, color:'#92400e', background:'#fef3c7', padding:'6px 10px', borderRadius:6, marginBottom:6, fontStyle:'italic' }}>
                  Toutes les lignes sont exonérées de TVA. La CSS (1%) reste due.
                </div>
              )}
              <div style={{ background:'var(--teal)', borderRadius:8, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                <span style={{ color:'#fff', fontSize:13, fontWeight:500 }}>TOTAL TTC</span>
                <span style={{ color:'#fff', fontFamily:'var(--mono)', fontSize:17, fontWeight:600 }}>{fmt(totaux.ttc)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Enregistrement...' : `Créer ${type === 'facture' ? 'la facture' : 'la pro forma'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
