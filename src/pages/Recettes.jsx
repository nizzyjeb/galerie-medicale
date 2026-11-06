import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'
import PrintDocument from '../components/PrintDocument'
import { fmt, fmtDate } from '../lib/utils'

const MODES = {
  especes: 'Espèces',
  virement: 'Virement',
  cheque: 'Chèque',
  mobile_money: 'Mobile money',
  carte: 'Carte',
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const debutMois = () => todayStr().slice(0, 8) + '01'
const r0 = (v) => Math.round(Number(v) || 0)

const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', boxSizing: 'border-box' }

const telechargerCSV = (nom, lignes) => {
  const csv = lignes.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  URL.revokeObjectURL(url)
}

export default function Recettes() {
  const { isAdmin, isManager } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [onglet, setOnglet] = useState('encaissements')
  const [du, setDu] = useState(debutMois())
  const [au, setAu] = useState(todayStr())
  const [recettes, setRecettes] = useState([])
  const [factures, setFactures] = useState([])
  const [mouvements, setMouvements] = useState([])
  const [clotures, setClotures] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [rattacher, setRattacher] = useState(null)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [filtreMode, setFiltreMode] = useState('tous')

  const charger = useCallback(async () => {
    setLoading(true)
    const reqs = [
      supabase.from('recettes').select('*').gte('date_recette', du).lte('date_recette', au).order('date_recette', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('factures').select('id, numero, client_nom, objet, date_emission, date_echeance, total_ttc, statut, valide').eq('type', 'facture').order('date_emission', { ascending: false }),
    ]
    if (isManager) {
      reqs.push(supabase.from('caisse_mouvements').select('*').gte('date_mouvement', du).lte('date_mouvement', au).order('date_mouvement'))
      reqs.push(supabase.from('caisse_clotures').select('*').gte('date_cloture', du).lte('date_cloture', au))
    }
    const [rec, fac, mvt, clo] = await Promise.all(reqs)
    if (rec.error) toast.error('Recettes : ' + rec.error.message)
    setRecettes(rec.data || [])
    setFactures(fac.data || [])
    setMouvements(mvt?.data || [])
    setClotures(clo?.data || [])
    setLoading(false)
  }, [du, au, isManager])

  useEffect(() => { charger() }, [charger])

  // Total encaissé par facture (toutes périodes confondues)
  const [encaisseParFacture, setEncaisseParFacture] = useState({})
  const chargerEncaisse = useCallback(async () => {
    const { data } = await supabase.from('recettes').select('facture_id, montant').not('facture_id', 'is', null)
    const map = {}
    for (const r of (data || [])) map[r.facture_id] = (map[r.facture_id] || 0) + Number(r.montant)
    setEncaisseParFacture(map)
  }, [])
  useEffect(() => { chargerEncaisse() }, [chargerEncaisse, recettes])

  // Ouverture directe depuis la page Factures (?facture=ID)
  useEffect(() => {
    const id = searchParams.get('facture')
    if (id && factures.length) {
      const f = factures.find((x) => String(x.id) === id)
      if (f) setModal({ facture: f })
      searchParams.delete('facture')
      setSearchParams(searchParams, { replace: true })
    }
  }, [factures, searchParams, setSearchParams])

  const resteAPayer = (f) => Math.max(0, r0(f.total_ttc) - r0(encaisseParFacture[f.id]))

  const ouvrirFacture = async (factureId) => {
    const [{ data: f }, { data: lignes }] = await Promise.all([
      supabase.from('factures').select('*').eq('id', factureId).single(),
      supabase.from('facture_lignes').select('*').eq('facture_id', factureId).order('ordre'),
    ])
    if (!f) { toast.error('Facture introuvable'); return }
    setPreviewDoc({ ...f, lignes: lignes || [] })
  }

  const supprimerRecette = async (r) => {
    if (!window.confirm(`Supprimer l'encaissement ${r.numero} (${fmt(r.montant)}) ?${r.caisse_mouvement_id ? '\nL\'entrée de caisse liée sera aussi supprimée.' : ''}`)) return
    const { error } = await supabase.rpc('fn_recette_supprimer', { p_id: r.id })
    if (error) { toast.error(error.message); return }
    toast.success('Encaissement supprimé')
    charger()
  }

  /* ---------- Données dérivées ---------- */
  const recettesFiltrees = filtreMode === 'tous' ? recettes : recettes.filter((r) => r.mode_paiement === filtreMode)
  const totalParMode = useMemo(() => {
    const t = {}
    for (const r of recettes) t[r.mode_paiement] = (t[r.mode_paiement] || 0) + Number(r.montant)
    return t
  }, [recettes])
  const totalPeriode = recettes.reduce((s, r) => s + Number(r.montant), 0)

  const facturesAEncaisser = factures.filter((f) => f.valide && resteAPayer(f) > 0 && !(f.statut === 'payee' && !encaisseParFacture[f.id]))

  // Rapprochement jour par jour
  const rapprochement = useMemo(() => {
    const jours = {}
    const j = (d) => (jours[d] = jours[d] || { date: d, recEspeces: 0, recAutres: 0, caisseLiee: 0, caisseNonLiee: 0, nonLiees: [] })
    for (const r of recettes) {
      if (r.mode_paiement === 'especes') j(r.date_recette).recEspeces += Number(r.montant)
      else j(r.date_recette).recAutres += Number(r.montant)
    }
    for (const m of mouvements) {
      if (m.type !== 'entree') continue
      const x = j(m.date_mouvement)
      if (m.recette_id) x.caisseLiee += Number(m.montant)
      else { x.caisseNonLiee += Number(m.montant); x.nonLiees.push(m) }
    }
    const clo = Object.fromEntries(clotures.map((c) => [c.date_cloture, c]))
    return Object.values(jours)
      .map((x) => ({ ...x, cloture: clo[x.date], ecart: r0(x.recEspeces) - r0(x.caisseLiee) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [recettes, mouvements, clotures])

  const entreesNonLiees = rapprochement.flatMap((x) => x.nonLiees)

  const exporterRecettes = () => {
    telechargerCSV(`recettes_${du}_${au}.csv`, [
      ['N° recette', 'Date', 'Client', 'Facture', 'Mode', 'Référence', 'Montant', 'Inscrit en caisse'],
      ...recettesFiltrees.map((r) => [r.numero, fmtDate(r.date_recette), r.client_nom, r.facture_numero, MODES[r.mode_paiement], r.reference, r0(r.montant), r.caisse_mouvement_id ? 'Oui' : 'Non']),
      [],
      ['Total', '', '', '', '', '', r0(recettesFiltrees.reduce((s, r) => s + Number(r.montant), 0))],
    ])
  }

  const exporterRapprochement = () => {
    telechargerCSV(`rapprochement_caisse_${du}_${au}.csv`, [
      ['Date', 'Recettes espèces', 'Entrées caisse liées', 'Entrées caisse sans recette', 'Recettes banque/mobile', 'Écart', 'Caisse clôturée', 'Solde réel clôture'],
      ...rapprochement.map((x) => [fmtDate(x.date), r0(x.recEspeces), r0(x.caisseLiee), r0(x.caisseNonLiee), r0(x.recAutres), x.ecart, x.cloture ? 'Oui' : 'Non', x.cloture ? r0(x.cloture.solde_reel) : '']),
    ])
  }

  const onglets = [
    ['encaissements', 'Encaissements'],
    ['factures', `Factures à encaisser (${facturesAEncaisser.length})`],
    ...(isManager ? [['rapprochement', `Rapprochement caisse${entreesNonLiees.length ? ` (${entreesNonLiees.length} à rapprocher)` : ''}`]] : []),
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Recettes</h1>
          <div style={{ fontSize: 13, color: 'var(--gray)', marginTop: 2 }}>Encaissements clients · rapprochement avec la caisse</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: 'var(--gray)' }}>Du</label>
          <input type="date" value={du} onChange={(e) => setDu(e.target.value)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
          <label style={{ fontSize: 13, color: 'var(--gray)' }}>au</label>
          <input type="date" value={au} onChange={(e) => setAu(e.target.value)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
          <button className="btn btn-primary" onClick={() => setModal({ facture: null })}>+ Nouvel encaissement</button>
        </div>
      </div>

      {/* Cartes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div className="card" style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}>
          <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>Total encaissé</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#147f73' }}>{fmt(totalPeriode)}</div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>{recettes.length} encaissement(s)</div>
        </div>
        {Object.entries(MODES).filter(([k]) => totalParMode[k]).map(([k, l]) => (
          <div className="card" key={k}>
            <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(totalParMode[k])}</div>
          </div>
        ))}
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 6 }}>Reste à encaisser</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>{fmt(facturesAEncaisser.reduce((s, f) => s + resteAPayer(f), 0))}</div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>{facturesAEncaisser.length} facture(s) validée(s)</div>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {onglets.map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)}
            style={{ background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: onglet === k ? 600 : 400,
              color: onglet === k ? 'var(--teal)' : 'var(--gray)', borderBottom: onglet === k ? '2px solid var(--teal)' : '2px solid transparent', marginBottom: -1 }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
      ) : onglet === 'encaissements' ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['tous', 'Tous'], ...Object.entries(MODES)].map(([k, l]) => (
                <button key={k} className="btn btn-sm" onClick={() => setFiltreMode(k)}
                  style={{ background: filtreMode === k ? 'var(--teal)' : '#fff', color: filtreMode === k ? '#fff' : 'var(--gray)', border: '1px solid var(--border)' }}>{l}</button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={exporterRecettes}>📥 Export Excel</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N°</th><th>Date</th><th>Client</th><th>Facture</th><th>Mode</th><th>Réf.</th>
                  <th style={{ textAlign: 'right' }}>Montant</th><th>Caisse</th><th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recettesFiltrees.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>Aucun encaissement sur la période.</td></tr>
                ) : recettesFiltrees.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.numero}</td>
                    <td>{fmtDate(r.date_recette)}</td>
                    <td>{r.client_nom || '—'}</td>
                    <td>{r.facture_numero || <span style={{ color: 'var(--gray)' }}>Sans facture</span>}</td>
                    <td>{MODES[r.mode_paiement]}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray)' }}>{r.reference || ''}</td>
                    <td className="font-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.montant)}</td>
                    <td>
                      {r.mode_paiement === 'especes'
                        ? (r.caisse_mouvement_id ? <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>✓ En caisse</span> : <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>Hors caisse</span>)
                        : <span className="badge" style={{ background: '#e0f2fe', color: '#075985' }}>Banque</span>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.facture_id && <button className="btn btn-ghost btn-sm" onClick={() => ouvrirFacture(r.facture_id)} title="Voir / télécharger la facture">📄 Facture</button>}
                      {isAdmin && <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => supprimerRecette(r)}>🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : onglet === 'factures' ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Facture</th><th>Client</th><th>Émission</th><th>Échéance</th>
                  <th style={{ textAlign: 'right' }}>Total TTC</th><th style={{ textAlign: 'right' }}>Encaissé</th><th style={{ textAlign: 'right' }}>Reste</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {facturesAEncaisser.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>Toutes les factures validées sont encaissées.</td></tr>
                ) : facturesAEncaisser.map((f) => {
                  const enRetard = f.date_echeance && f.date_echeance < todayStr()
                  return (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>{f.numero}</td>
                      <td>{f.client_nom}</td>
                      <td>{fmtDate(f.date_emission)}</td>
                      <td style={{ color: enRetard ? 'var(--danger)' : undefined, fontWeight: enRetard ? 600 : 400 }}>{fmtDate(f.date_echeance)}{enRetard ? ' ⚠' : ''}</td>
                      <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(f.total_ttc)}</td>
                      <td className="font-mono" style={{ textAlign: 'right', color: '#16a34a' }}>{fmt(encaisseParFacture[f.id] || 0)}</td>
                      <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{fmt(resteAPayer(f))}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => ouvrirFacture(f.id)}>📄 Télécharger</button>
                        <button className="btn btn-primary btn-sm" style={{ marginLeft: 6 }} onClick={() => setModal({ facture: f })}>💰 Encaisser</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <div className="alert alert-info" style={{ fontSize: 12, marginBottom: 14 }}>
            Chaque encaissement en espèces saisi dans <b>Recettes</b> crée automatiquement l'entrée correspondante en caisse. Le rapprochement compare, jour par jour, les recettes en espèces et les entrées de caisse, et liste les entrées de caisse qui ne sont rattachées à aucune recette (à rapprocher d'une facture).
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Rapprochement journalier</div>
              <button className="btn btn-ghost btn-sm" onClick={exporterRapprochement}>📥 Export Excel</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Recettes espèces</th>
                    <th style={{ textAlign: 'right' }}>Entrées caisse liées</th>
                    <th style={{ textAlign: 'right' }}>Entrées caisse sans recette</th>
                    <th style={{ textAlign: 'right' }}>Recettes banque</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {rapprochement.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>Aucune donnée sur la période.</td></tr>
                  ) : rapprochement.map((x) => {
                    const ok = x.ecart === 0 && x.caisseNonLiee === 0
                    return (
                      <tr key={x.date}>
                        <td style={{ fontWeight: 600 }}>{fmtDate(x.date)}</td>
                        <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(x.recEspeces)}</td>
                        <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(x.caisseLiee)}</td>
                        <td className="font-mono" style={{ textAlign: 'right', color: x.caisseNonLiee ? '#b45309' : undefined, fontWeight: x.caisseNonLiee ? 600 : 400 }}>{fmt(x.caisseNonLiee)}</td>
                        <td className="font-mono" style={{ textAlign: 'right', color: 'var(--gray)' }}>{fmt(x.recAutres)}</td>
                        <td>
                          {ok
                            ? <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>✓ Rapproché</span>
                            : x.ecart !== 0
                              ? <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>Écart {fmt(x.ecart)}</span>
                              : <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>À rapprocher</span>}
                          {x.cloture && <span className="badge" style={{ marginLeft: 6, background: '#f1f5f9', color: '#475569' }}>🔒 Clôturée</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Entrées de caisse non rattachées à une recette ({entreesNonLiees.length})</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Catégorie</th><th>Motif</th><th style={{ textAlign: 'right' }}>Montant</th><th style={{ textAlign: 'right' }}>Action</th></tr>
                </thead>
                <tbody>
                  {entreesNonLiees.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--gray)' }}>Toutes les entrées de caisse sont rattachées.</td></tr>
                  ) : entreesNonLiees.map((m) => (
                    <tr key={m.id}>
                      <td>{fmtDate(m.date_mouvement)}</td>
                      <td>{m.categorie}</td>
                      <td>{m.motif}</td>
                      <td className="font-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(m.montant)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setRattacher(m)}>🔗 Rattacher</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <EncaissementModal
          factureInitiale={modal.facture}
          factures={factures.filter((f) => f.valide && resteAPayer(f) > 0)}
          resteAPayer={resteAPayer}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); charger() }}
        />
      )}
      {rattacher && (
        <RattacherModal
          mouvement={rattacher}
          factures={factures.filter((f) => f.valide && resteAPayer(f) > 0)}
          resteAPayer={resteAPayer}
          onClose={() => setRattacher(null)}
          onSaved={() => { setRattacher(null); charger() }}
        />
      )}
      {previewDoc && <PrintDocument doc={previewDoc} type="facture" onClose={() => setPreviewDoc(null)} />}
    </div>
  )
}

function ChoixFacture({ factures, valeur, onChange, resteAPayer }) {
  const [q, setQ] = useState('')
  const liste = factures.filter((f) => !q || `${f.numero} ${f.client_nom}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50)
  return (
    <div>
      <input placeholder="Rechercher n° ou client…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
      <select value={valeur || ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} style={inputStyle}>
        <option value="">— Sans facture (vente comptant) —</option>
        {liste.map((f) => <option key={f.id} value={f.id}>{f.numero} · {f.client_nom} · reste {fmt(resteAPayer(f))}</option>)}
      </select>
    </div>
  )
}

function EncaissementModal({ factureInitiale, factures, resteAPayer, onClose, onSaved }) {
  const [factureId, setFactureId] = useState(factureInitiale?.id || null)
  const facture = factures.find((f) => f.id === factureId) || (factureInitiale?.id === factureId ? factureInitiale : null)
  const [montant, setMontant] = useState(factureInitiale ? String(resteAPayer(factureInitiale)) : '')
  const [mode, setMode] = useState('especes')
  const [date, setDate] = useState(todayStr())
  const [reference, setReference] = useState('')
  const [client, setClient] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const choisir = (id) => {
    setFactureId(id)
    const f = factures.find((x) => x.id === id)
    if (f) setMontant(String(resteAPayer(f)))
  }

  const enregistrer = async () => {
    const m = r0(String(montant).replace(/\s/g, '').replace(',', '.'))
    if (!m || m <= 0) { toast.error('Montant invalide'); return }
    if (!facture && !client.trim()) { toast.error('Indiquez le client (ou choisissez une facture)'); return }
    if (facture && m > resteAPayer(facture) + 1 && !window.confirm(`Le montant dépasse le reste à payer (${fmt(resteAPayer(facture))}). Continuer ?`)) return
    if (mode !== 'especes' && !reference.trim() && !window.confirm('Aucune référence (n° de virement / chèque). Continuer ?')) return
    setSaving(true)
    const { data, error } = await supabase.rpc('fn_recette_enregistrer', {
      p_facture_id: facture?.id || null,
      p_date: date,
      p_montant: m,
      p_mode: mode,
      p_reference: reference.trim() || null,
      p_notes: notes.trim() || null,
      p_client_nom: facture ? null : client.trim(),
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(`Encaissement ${data?.numero || ''} enregistré${mode === 'especes' ? ' et inscrit en caisse' : ''}`)
    onSaved()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(500px, 94vw)', maxHeight: '92vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Nouvel encaissement</h2>

        <label style={lbl}>Facture</label>
        <ChoixFacture factures={factures} valeur={factureId} onChange={choisir} resteAPayer={resteAPayer} />
        {facture && (
          <div style={{ background: 'var(--lgray)', borderRadius: 8, padding: 10, fontSize: 12, margin: '8px 0 0' }}>
            {facture.client_nom} · Total {fmt(facture.total_ttc)} · <b>Reste {fmt(resteAPayer(facture))}</b>
          </div>
        )}
        {!facture && (
          <>
            <label style={{ ...lbl, marginTop: 12 }}>Client</label>
            <input value={client} onChange={(e) => setClient(e.target.value)} style={inputStyle} placeholder="Nom du client" />
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div>
            <label style={lbl}>Montant (FCFA)</label>
            <input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={lbl}>Date</label>
            <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <label style={{ ...lbl, marginTop: 12 }}>Mode de paiement</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(MODES).map(([k, l]) => (
            <button key={k} type="button" className="btn btn-sm" onClick={() => setMode(k)}
              style={{ background: mode === k ? 'var(--teal)' : '#fff', color: mode === k ? '#fff' : 'var(--gray)', border: '1px solid var(--border)' }}>{l}</button>
          ))}
        </div>
        {mode === 'especes'
          ? <div style={{ fontSize: 12, color: '#166534', marginTop: 6 }}>✓ L'entrée sera inscrite automatiquement dans la caisse du {date.split('-').reverse().join('/')} (la caisse doit être ouverte).</div>
          : <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6 }}>Paiement hors caisse (banque / mobile money) : rien n'est inscrit en caisse.</div>}

        {mode !== 'especes' && (
          <>
            <label style={{ ...lbl, marginTop: 12 }}>Référence (n° virement, chèque, transaction)</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} style={inputStyle} />
          </>
        )}
        <label style={{ ...lbl, marginTop: 12 }}>Notes (optionnel)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={enregistrer} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

function RattacherModal({ mouvement, factures, resteAPayer, onClose, onSaved }) {
  const [factureId, setFactureId] = useState(null)
  const [saving, setSaving] = useState(false)
  const valider = async () => {
    setSaving(true)
    const { error } = await supabase.rpc('fn_recette_rattacher', { p_mouvement_id: mouvement.id, p_facture_id: factureId })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Entrée de caisse rattachée')
    onSaved()
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 94vw)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Rattacher une entrée de caisse</h2>
        <div style={{ background: 'var(--lgray)', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 14 }}>
          {fmtDate(mouvement.date_mouvement)} · {mouvement.categorie} · <b>{fmt(mouvement.montant)}</b><br />
          <span style={{ color: 'var(--gray)' }}>{mouvement.motif}</span>
        </div>
        <label style={lbl}>Facture correspondante</label>
        <ChoixFacture factures={factures} valeur={factureId} onChange={setFactureId} resteAPayer={resteAPayer} />
        <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8 }}>Sans facture, l'entrée est enregistrée comme recette « vente comptant ».</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={valider} disabled={saving}>{saving ? '…' : 'Rattacher'}</button>
        </div>
      </div>
    </div>
  )
}

const lbl = { fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }
