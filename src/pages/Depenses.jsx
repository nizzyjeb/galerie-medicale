import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { fmt, fmtDate, today } from '../lib/utils'
import { exportDepensesExcel } from '../lib/exportExcel'
import toast from 'react-hot-toast'

const STATUTS = {
  brouillon: { label: 'À valider', bg: '#fff7ed', color: '#92400e' },
  validee:   { label: 'Validée',   bg: '#eff6ff', color: '#1e40af' },
  payee:     { label: 'Payée',     bg: '#f0fdf4', color: '#166534' },
  rejetee:   { label: 'Rejetée',   bg: '#fef2f2', color: '#991b1b' },
}
const MODES = { especes: 'Espèces', virement: 'Virement bancaire', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte bancaire' }
const TYPES = { depense: 'Dépense', facture_fournisseur: 'Facture fournisseur' }

const num = (v) => Number(v) || 0
const periodeCourante = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

const vide = {
  type: 'depense', date_depense: today(), fournisseur_id: '', fournisseur_nom: '', reference_fournisseur: '',
  categorie: '', libelle: '', montant_ht: '', exonere_tva: false, date_echeance: '',
  mode_paiement: 'especes', date_paiement: '', notes: '',
}

// TVA 18 % et CSS 1 % (identiques aux factures clients) — saisie HT ou TTC au choix
const calcMontants = (ht, exonere, tauxTva, tauxCss) => {
  const base = num(ht)
  const tva = exonere ? 0 : Math.round(base * tauxTva / 100)
  const css = Math.round(base * tauxCss / 100)
  return { montant_ht: base, tva, css, montant_ttc: base + tva + css }
}

export default function Depenses() {
  const { user, profile, isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [categories, setCategories] = useState([])
  const [taux, setTaux] = useState({ tva: 18, css: 1 })
  const [loading, setLoading] = useState(true)
  const [periode, setPeriode] = useState(periodeCourante())
  const [toutesPeriodes, setToutesPeriodes] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [fType, setFType] = useState('')
  const [fStatut, setFStatut] = useState('')
  const [fCategorie, setFCategorie] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(vide)
  const [editId, setEditId] = useState(null)
  const [fichier, setFichier] = useState(null)
  const [saisieTTC, setSaisieTTC] = useState(false)
  const [montantTTCSaisi, setMontantTTCSaisi] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalCategories, setModalCategories] = useState(false)
  const [nouvelleCat, setNouvelleCat] = useState('')
  const [rejet, setRejet] = useState(null)
  const [motifRejet, setMotifRejet] = useState('')

  const chargerRef = async () => {
    const [{ data: f }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('fournisseurs').select('id, nom').eq('actif', true).order('nom'),
      supabase.from('categories_depenses').select('*').order('nom'),
      supabase.from('parametres').select('tva_taux, css_taux').limit(1).maybeSingle(),
    ])
    setFournisseurs(f || [])
    setCategories(c || [])
    if (p) setTaux({ tva: num(p.tva_taux) || 18, css: num(p.css_taux) || 1 })
  }

  const charger = async () => {
    setLoading(true)
    let q = supabase.from('depenses').select('*').order('date_depense', { ascending: false }).order('id', { ascending: false })
    if (!toutesPeriodes) {
      const [y, m] = periode.split('-').map(Number)
      const debut = `${periode}-01`
      const fin = new Date(y, m, 1).toISOString().split('T')[0]
      q = q.gte('date_depense', debut).lt('date_depense', fin)
    }
    const { data, error } = await q.limit(2000)
    if (error) toast.error('Erreur de chargement des dépenses')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { chargerRef() }, [])
  useEffect(() => { charger() }, [periode, toutesPeriodes])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const ouvrirCreation = () => {
    setForm({ ...vide, date_depense: today(), categorie: categories[0]?.nom || '' })
    setEditId(null); setFichier(null); setSaisieTTC(false); setMontantTTCSaisi(''); setModal(true)
  }
  const ouvrirEdition = (d) => {
    const f = { ...vide }
    Object.keys(vide).forEach(k => { f[k] = d[k] ?? vide[k] })
    f.fournisseur_id = d.fournisseur_id || ''
    f.date_echeance = d.date_echeance || ''
    f.date_paiement = d.date_paiement || ''
    setForm(f); setEditId(d.id); setFichier(null); setSaisieTTC(false); setMontantTTCSaisi(''); setModal(true)
  }

  // Si saisie TTC : on recalcule le HT à partir du TTC
  const htEffectif = useMemo(() => {
    if (!saisieTTC) return num(form.montant_ht)
    const diviseur = 1 + (form.exonere_tva ? 0 : taux.tva / 100) + taux.css / 100
    return Math.round(num(montantTTCSaisi) / diviseur)
  }, [saisieTTC, form.montant_ht, montantTTCSaisi, form.exonere_tva, taux])
  const montants = useMemo(() => calcMontants(htEffectif, form.exonere_tva, taux.tva, taux.css), [htEffectif, form.exonere_tva, taux])

  const prochainNumero = async () => {
    const prefix = `DEP-${form.date_depense.slice(0, 7).replace('-', '')}-`
    const { data } = await supabase.from('depenses').select('numero').like('numero', `${prefix}%`).order('numero', { ascending: false }).limit(1)
    const dernier = data?.[0]?.numero
    const n = dernier ? parseInt(dernier.split('-').pop(), 10) + 1 : 1
    return prefix + String(n).padStart(3, '0')
  }

  const televerser = async (numero) => {
    if (!fichier) return null
    if (fichier.size > 10 * 1024 * 1024) { toast.error('Fichier trop volumineux (max 10 Mo)'); return null }
    const ext = fichier.name.split('.').pop().toLowerCase()
    const path = `${form.date_depense.slice(0, 7)}/${numero}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('justificatifs').upload(path, fichier, { upsert: true, contentType: fichier.type || undefined })
    if (error) { toast.error('Échec du téléversement du justificatif : ' + error.message); return null }
    return { justificatif_path: path, justificatif_nom: fichier.name }
  }

  const enregistrer = async () => {
    if (!form.libelle.trim()) { toast.error('Le libellé est requis'); return }
    if (!form.date_depense) { toast.error('La date est requise'); return }
    if (htEffectif <= 0) { toast.error('Le montant doit être supérieur à 0'); return }
    if (form.type === 'facture_fournisseur' && !form.fournisseur_nom.trim() && !form.fournisseur_id) { toast.error('Indiquez le fournisseur'); return }
    setSaving(true)
    const fournisseurNom = form.fournisseur_id
      ? (fournisseurs.find(f => String(f.id) === String(form.fournisseur_id))?.nom || form.fournisseur_nom)
      : form.fournisseur_nom
    let numero = null
    if (!editId) numero = await prochainNumero()
    const pj = await televerser(numero || items.find(i => i.id === editId)?.numero || 'DEP')
    if (fichier && !pj) { setSaving(false); return }

    const payload = {
      type: form.type,
      date_depense: form.date_depense,
      fournisseur_id: form.fournisseur_id ? String(form.fournisseur_id) : null,
      fournisseur_nom: fournisseurNom || null,
      reference_fournisseur: form.reference_fournisseur || null,
      categorie: form.categorie || null,
      libelle: form.libelle.trim(),
      exonere_tva: !!form.exonere_tva,
      ...montants,
      date_echeance: form.date_echeance || null,
      mode_paiement: form.mode_paiement,
      date_paiement: form.date_paiement || null,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
      ...(pj || {}),
    }
    let error
    if (editId) {
      ({ error } = await supabase.from('depenses').update(payload).eq('id', editId))
    } else {
      ({ error } = await supabase.from('depenses').insert({
        ...payload, numero, statut: 'brouillon',
        created_by: user?.id, created_by_nom: profile?.nom || null,
      }))
    }
    setSaving(false)
    if (error) { toast.error("Erreur lors de l'enregistrement : " + error.message); return }
    toast.success(editId ? 'Dépense modifiée' : `Dépense ${numero} enregistrée — en attente de validation`)
    setModal(false)
    charger()
  }

  const changerStatut = async (d, statut, extra = {}) => {
    const patch = { statut, updated_at: new Date().toISOString(), ...extra }
    if (statut === 'validee') { patch.validated_by = user?.id; patch.validated_at = new Date().toISOString() }
    if (statut === 'payee' && !d.date_paiement && !extra.date_paiement) patch.date_paiement = today()
    const { error } = await supabase.from('depenses').update(patch).eq('id', d.id)
    if (error) { toast.error('Modification impossible'); return }
    toast.success(`Dépense ${d.numero} : ${STATUTS[statut].label.toLowerCase()}`)
    charger()
  }

  const validerToutes = async () => {
    const brouillons = filtres.filter(d => d.statut === 'brouillon')
    if (!brouillons.length) return
    if (!window.confirm(`Valider les ${brouillons.length} dépense(s) en attente affichée(s) ?`)) return
    const { error } = await supabase.from('depenses')
      .update({ statut: 'validee', validated_by: user?.id, validated_at: new Date().toISOString() })
      .in('id', brouillons.map(d => d.id))
    if (error) { toast.error('Validation impossible'); return }
    toast.success('Dépenses validées')
    charger()
  }

  const supprimer = async (d) => {
    if (!window.confirm(`Supprimer la dépense ${d.numero} « ${d.libelle} » ?`)) return
    if (d.justificatif_path) await supabase.storage.from('justificatifs').remove([d.justificatif_path])
    const { error } = await supabase.from('depenses').delete().eq('id', d.id)
    if (error) { toast.error('Suppression impossible'); return }
    toast.success('Dépense supprimée')
    charger()
  }

  const voirJustificatif = async (d) => {
    const { data, error } = await supabase.storage.from('justificatifs').createSignedUrl(d.justificatif_path, 600)
    if (error || !data?.signedUrl) { toast.error("Impossible d'ouvrir le justificatif"); return }
    window.open(data.signedUrl, '_blank')
  }

  const ajouterCategorie = async () => {
    const nom = nouvelleCat.trim()
    if (!nom) return
    const { error } = await supabase.from('categories_depenses').insert({ nom })
    if (error) { toast.error('Catégorie déjà existante ou erreur'); return }
    setNouvelleCat(''); chargerRef(); toast.success('Catégorie ajoutée')
  }
  const basculerCategorie = async (c) => {
    await supabase.from('categories_depenses').update({ actif: !c.actif }).eq('id', c.id)
    chargerRef()
  }

  const filtres = useMemo(() => items.filter(d => {
    if (fType && d.type !== fType) return false
    if (fStatut && d.statut !== fStatut) return false
    if (fCategorie && d.categorie !== fCategorie) return false
    const t = recherche.toLowerCase()
    return !t || [d.numero, d.libelle, d.fournisseur_nom, d.reference_fournisseur, d.categorie, d.notes].some(x => (x || '').toLowerCase().includes(t))
  }), [items, fType, fStatut, fCategorie, recherche])

  const totalTTC = (arr) => arr.reduce((s, d) => s + num(d.montant_ttc), 0)
  const stats = {
    total: totalTTC(items.filter(d => d.statut !== 'rejetee')),
    attente: totalTTC(items.filter(d => d.statut === 'brouillon')),
    aPayer: totalTTC(items.filter(d => d.statut === 'validee')),
    payees: totalTTC(items.filter(d => d.statut === 'payee')),
  }
  const parCategorie = useMemo(() => {
    const m = {}
    items.filter(d => d.statut !== 'rejetee').forEach(d => { const k = d.categorie || 'Sans catégorie'; m[k] = (m[k] || 0) + num(d.montant_ttc) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [items])

  const libellePeriode = toutesPeriodes ? 'Toutes périodes' : (() => { const [y, m] = periode.split('-'); const t = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1) })()
  const peutModifier = (d) => isAdmin || (d.statut === 'brouillon')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Dépenses & factures fournisseurs</h1>
          <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4 }}>{libellePeriode} · {items.length} écriture{items.length > 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={periode} disabled={toutesPeriodes} onChange={e => e.target.value && setPeriode(e.target.value)} style={{ width: 170 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={toutesPeriodes} onChange={e => setToutesPeriodes(e.target.checked)} style={{ width: 'auto' }} /> Tout
          </label>
          <button className="btn btn-primary" onClick={ouvrirCreation}>+ Nouvelle saisie</button>
        </div>
      </div>

      <div className="stats-grid">
        <Stat label="Total dépenses TTC" value={fmt(stats.total)} />
        <Stat label="En attente de validation" value={fmt(stats.attente)} color="var(--warn)" />
        <Stat label="Validées — à payer" value={fmt(stats.aPayer)} color="#1e40af" />
        <Stat label="Payées" value={fmt(stats.payees)} color="var(--success)" />
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input placeholder="Rechercher (n°, libellé, fournisseur, référence…)" value={recherche} onChange={e => setRecherche(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <select value={fType} onChange={e => setFType(e.target.value)} style={{ width: 170 }}>
          <option value="">Tous les types</option>
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fStatut} onChange={e => setFStatut(e.target.value)} style={{ width: 150 }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={fCategorie} onChange={e => setFCategorie(e.target.value)} style={{ width: 190 }}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
        </select>
        <button className="btn btn-ghost" disabled={!filtres.length} onClick={() => exportDepensesExcel(filtres, toutesPeriodes ? 'toutes' : periode)}>⬇ Excel</button>
        {isAdmin && <button className="btn btn-ghost" onClick={() => setModalCategories(true)}>Catégories</button>}
        {isAdmin && filtres.some(d => d.statut === 'brouillon') && <button className="btn btn-success" onClick={validerToutes}>✓ Valider les {filtres.filter(d => d.statut === 'brouillon').length} en attente</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: parCategorie.length ? '1fr 260px' : '1fr', gap: 16, alignItems: 'start' }}>
        <div className="card">
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
          ) : filtres.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray)' }}>Aucune dépense sur cette période.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>N° / Date</th>
                    <th>Libellé</th>
                    <th>Fournisseur</th>
                    <th>Catégorie</th>
                    <th style={{ textAlign: 'right' }}>HT</th>
                    <th style={{ textAlign: 'right' }}>TTC</th>
                    <th>Statut</th>
                    <th>PJ</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtres.map(d => {
                    const st = STATUTS[d.statut] || STATUTS.brouillon
                    return (
                      <tr key={d.id}>
                        <td>
                          <div className="font-mono text-sm">{d.numero}</div>
                          <div className="text-xs text-gray">{fmtDate(d.date_depense)}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{d.libelle}</div>
                          <div className="text-xs text-gray">{TYPES[d.type]}{d.reference_fournisseur ? ` · réf. ${d.reference_fournisseur}` : ''}{d.created_by_nom ? ` · ${d.created_by_nom}` : ''}</div>
                        </td>
                        <td>{d.fournisseur_nom || <span className="text-gray">—</span>}</td>
                        <td className="text-sm">{d.categorie || '—'}</td>
                        <td className="font-mono text-right">{fmt(d.montant_ht)}</td>
                        <td className="font-mono text-right" style={{ fontWeight: 700 }}>{fmt(d.montant_ttc)}</td>
                        <td>
                          <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                          {d.statut === 'payee' && d.date_paiement && <div className="text-xs text-gray">{MODES[d.mode_paiement]} · {fmtDate(d.date_paiement)}</div>}
                          {d.statut === 'validee' && d.date_echeance && <div className="text-xs text-gray">Éch. {fmtDate(d.date_echeance)}</div>}
                          {d.statut === 'rejetee' && d.motif_rejet && <div className="text-xs" style={{ color: '#991b1b' }}>{d.motif_rejet}</div>}
                        </td>
                        <td>
                          {d.justificatif_path
                            ? <button className="btn btn-ghost btn-sm" title={d.justificatif_nom} onClick={() => voirJustificatif(d)}>📎</button>
                            : <span className="text-gray text-xs">—</span>}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {peutModifier(d) && <><button className="btn btn-ghost btn-sm" onClick={() => ouvrirEdition(d)}>Modifier</button>{' '}</>}
                          {isAdmin && d.statut === 'brouillon' && <>
                            <button className="btn btn-success btn-sm" onClick={() => changerStatut(d, 'validee')}>Valider</button>{' '}
                            <button className="btn btn-danger btn-sm" onClick={() => { setRejet(d); setMotifRejet('') }}>Rejeter</button>{' '}
                          </>}
                          {isAdmin && d.statut === 'validee' && <><button className="btn btn-success btn-sm" onClick={() => changerStatut(d, 'payee')}>Payée</button>{' '}</>}
                          {isAdmin && (d.statut === 'payee' || d.statut === 'rejetee') && <><button className="btn btn-ghost btn-sm" title="Remettre en attente" onClick={() => changerStatut(d, 'brouillon', { motif_rejet: null })}>↩</button>{' '}</>}
                          {(isAdmin || (d.statut === 'brouillon' && d.created_by === user?.id)) && <button className="btn btn-danger btn-sm" onClick={() => supprimer(d)}>✕</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--lgray)', fontWeight: 700 }}>
                    <td colSpan={4}>TOTAL ({filtres.length})</td>
                    <td className="font-mono text-right">{fmt(filtres.reduce((s, d) => s + num(d.montant_ht), 0))}</td>
                    <td className="font-mono text-right">{fmt(totalTTC(filtres))}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {parCategorie.length > 0 && (
          <div className="card">
            <div className="card-header"><div className="card-title">Par catégorie</div></div>
            <div style={{ padding: '8px 16px 12px' }}>
              {parCategorie.map(([cat, v]) => (
                <div key={cat} style={{ padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{cat}</span><span className="font-mono">{fmt(v)}</span>
                  </div>
                  <div className="stat-bar" style={{ marginTop: 5 }}><div className="stat-bar-fill" style={{ width: `${stats.total ? Math.round(v / stats.total * 100) : 0}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="card-title">{editId ? 'Modifier la saisie' : 'Nouvelle dépense / facture fournisseur'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(TYPES).map(([k, v]) => (
                  <button key={k} className={`btn ${form.type === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => set('type', k)}>{v}</button>
                ))}
              </div>

              <div className="form-grid form-grid-3">
                <Champ label="Date *"><input type="date" value={form.date_depense} onChange={e => set('date_depense', e.target.value)} /></Champ>
                <Champ label="Catégorie">
                  <select value={form.categorie} onChange={e => set('categorie', e.target.value)}>
                    <option value="">— Choisir —</option>
                    {categories.filter(c => c.actif !== false || c.nom === form.categorie).map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                  </select>
                </Champ>
                <Champ label="Mode de paiement">
                  <select value={form.mode_paiement} onChange={e => set('mode_paiement', e.target.value)}>
                    {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Champ>
              </div>

              <Champ label="Libellé *"><input value={form.libelle} onChange={e => set('libelle', e.target.value)} placeholder="Ex : Carburant véhicule de livraison, Facture loyer novembre…" /></Champ>

              <div className="form-grid form-grid-3">
                <Champ label={form.type === 'facture_fournisseur' ? 'Fournisseur (base) *' : 'Fournisseur (base)'}>
                  <select value={form.fournisseur_id} onChange={e => { set('fournisseur_id', e.target.value); if (e.target.value) set('fournisseur_nom', '') }}>
                    <option value="">— Hors base / saisie libre —</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </Champ>
                <Champ label="Ou fournisseur / bénéficiaire (libre)"><input value={form.fournisseur_nom} disabled={!!form.fournisseur_id} onChange={e => set('fournisseur_nom', e.target.value)} placeholder="Nom du commerce, prestataire…" /></Champ>
                <Champ label="N° facture fournisseur"><input value={form.reference_fournisseur} onChange={e => set('reference_fournisseur', e.target.value)} /></Champ>
              </div>

              <div className="card" style={{ padding: 14, background: '#fafffe' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="radio" checked={!saisieTTC} onChange={() => setSaisieTTC(false)} style={{ width: 'auto' }} /> Je saisis le montant HT</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="radio" checked={saisieTTC} onChange={() => { setSaisieTTC(true); setMontantTTCSaisi(montants.montant_ttc || '') }} style={{ width: 'auto' }} /> Je saisis le montant TTC (ticket de caisse)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}><input type="checkbox" checked={form.exonere_tva} onChange={e => set('exonere_tva', e.target.checked)} style={{ width: 'auto' }} /> Exonéré de TVA</label>
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1.2fr' }}>
                  {saisieTTC
                    ? <Champ label="Montant TTC *"><input type="number" min="0" value={montantTTCSaisi} onChange={e => setMontantTTCSaisi(e.target.value)} autoFocus /></Champ>
                    : <Champ label="Montant HT *"><input type="number" min="0" value={form.montant_ht} onChange={e => set('montant_ht', e.target.value)} autoFocus /></Champ>}
                  <Champ label={`TVA ${form.exonere_tva ? '(exonérée)' : taux.tva + ' %'}`}><input value={fmt(montants.tva)} disabled /></Champ>
                  <Champ label={`CSS ${taux.css} %`}><input value={fmt(montants.css)} disabled /></Champ>
                  <Champ label={saisieTTC ? 'HT calculé' : 'Total TTC'}><input value={fmt(saisieTTC ? montants.montant_ht : montants.montant_ttc)} disabled style={{ fontWeight: 700, color: 'var(--teal-dark)' }} /></Champ>
                </div>
              </div>

              <div className="form-grid form-grid-3">
                <Champ label="Échéance (facture fournisseur)"><input type="date" value={form.date_echeance} onChange={e => set('date_echeance', e.target.value)} /></Champ>
                <Champ label="Date de paiement (si déjà réglée)"><input type="date" value={form.date_paiement} onChange={e => set('date_paiement', e.target.value)} /></Champ>
                <Champ label="Justificatif (photo, PDF — max 10 Mo)">
                  <input type="file" accept="image/*,application/pdf" onChange={e => setFichier(e.target.files?.[0] || null)} style={{ padding: 6 }} />
                  {editId && items.find(i => i.id === editId)?.justificatif_nom && !fichier && <span className="text-xs text-gray">Actuel : {items.find(i => i.id === editId).justificatif_nom}</span>}
                </Champ>
              </div>
              <Champ label="Notes"><textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ minHeight: 50 }} /></Champ>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Annuler</button>
              <button className="btn btn-primary" disabled={saving} onClick={enregistrer}>{saving ? 'Enregistrement…' : (editId ? 'Enregistrer' : 'Enregistrer la saisie')}</button>
            </div>
          </div>
        </div>
      )}

      {rejet && (
        <div className="modal-overlay" onClick={() => setRejet(null)}>
          <div className="modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="card-title">Rejeter {rejet.numero}</div><button className="btn btn-ghost btn-sm" onClick={() => setRejet(null)}>✕</button></div>
            <div className="modal-body">
              <Champ label="Motif du rejet"><textarea value={motifRejet} onChange={e => setMotifRejet(e.target.value)} placeholder="Ex : justificatif illisible, montant incorrect…" /></Champ>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRejet(null)}>Annuler</button>
              <button className="btn btn-danger" onClick={() => { changerStatut(rejet, 'rejetee', { motif_rejet: motifRejet || null }); setRejet(null) }}>Rejeter</button>
            </div>
          </div>
        </div>
      )}

      {modalCategories && (
        <div className="modal-overlay" onClick={() => setModalCategories(false)}>
          <div className="modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="card-title">Catégories de dépenses</div><button className="btn btn-ghost btn-sm" onClick={() => setModalCategories(false)}>✕</button></div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input value={nouvelleCat} onChange={e => setNouvelleCat(e.target.value)} placeholder="Nouvelle catégorie" onKeyDown={e => e.key === 'Enter' && ajouterCategorie()} />
                <button className="btn btn-primary" onClick={ajouterCategorie}>Ajouter</button>
              </div>
              {categories.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6', opacity: c.actif === false ? .5 : 1 }}>
                  <span>{c.nom}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => basculerCategorie(c)}>{c.actif === false ? 'Réactiver' : 'Désactiver'}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color || 'inherit', fontSize: 18 }}>{value}</div>
    </div>
  )
}

function Champ({ label, children }) {
  return <div className="form-group"><label>{label}</label>{children}</div>
}
