import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { fmt, fmtDate, today } from '../lib/utils'
import {
  calculerBulletin, rubriquesDepuisEmploye, snapshotEmploye, calculerCumuls, libellePeriode, periodeCourante, periodePrecedente,
  tauxAnciennete, parametresComplets, MODES_PAIEMENT, STATUTS_BULLETIN, PARAMS_DEFAUT, RUBRIQUES, RUBRIQUES_SAISISSABLES, TYPES_RUBRIQUE,
} from '../lib/paie'
import { imprimerBulletin, imprimerBulletins } from '../components/BulletinPrint'
import { exportLivrePaieExcel } from '../lib/exportExcel'
import toast from 'react-hot-toast'

const num = (v) => Number(v) || 0
const fp = (v) => Math.round(num(v)).toLocaleString('fr-FR')

// Champs du calcul enregistrés en base
const champsCalcul = (calc) => {
  const { lignes, rubriques, anciennete_taux, jours_travailles, jours_absence, salaire_base, salaire_base_calcule, heures_sup_montant,
    brut, brut_cotisable, base_cnss, base_cnamgs, base_tcs, base_irpp, base_imposable, cnss_salarie, cnamgs_salarie, tcs, irpp, nb_parts,
    salaire_net_imposable, indemnites_non_soumises, autres_retenues, reprise_arrondi, arrondi, total_gains, total_retenues, net_a_payer,
    billetage, cnss_employeur, cnamgs_employeur, fnh_employeur, total_charges_employeur, cout_total } = calc
  return { lignes, rubriques, anciennete_taux, jours_travailles, jours_absence, salaire_base, salaire_base_calcule, heures_sup_montant,
    brut, brut_cotisable, base_cnss, base_cnamgs, base_tcs, base_irpp, base_imposable, cnss_salarie, cnamgs_salarie, tcs, irpp, nb_parts,
    salaire_net_imposable, indemnites_non_soumises, autres_retenues, reprise_arrondi, arrondi, total_gains, total_retenues, net_a_payer,
    billetage, cnss_employeur, cnamgs_employeur, fnh_employeur, total_charges_employeur, cout_total }
}

export default function Paie() {
  const { user, isAdmin } = useAuth()
  const [onglet, setOnglet] = useState('bulletins')
  const [periode, setPeriode] = useState(periodeCourante())
  const [bulletins, setBulletins] = useState([])
  const [employes, setEmployes] = useState([])
  const [params, setParams] = useState(PARAMS_DEFAUT)
  const [societe, setSociete] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generation, setGeneration] = useState(false)
  const [edition, setEdition] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')

  const chargerRef = async () => {
    const [{ data: emp }, { data: prm }, { data: soc }] = await Promise.all([
      supabase.from('employes').select('*').order('nom'),
      supabase.from('parametres_paie').select('*').limit(1).maybeSingle(),
      supabase.from('parametres').select('*').limit(1).maybeSingle(),
    ])
    setEmployes(emp || [])
    if (prm) setParams(parametresComplets(prm))
    setSociete(soc || null)
  }

  const chargerBulletins = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('bulletins_paie').select('*').eq('periode', periode).order('employe_nom')
    if (error) toast.error('Erreur de chargement des bulletins')
    setBulletins(data || [])
    setLoading(false)
  }

  useEffect(() => { chargerRef() }, [])
  useEffect(() => { chargerBulletins() }, [periode])

  const employeDe = (b) => employes.find(e => e.id === b.employe_id) || null

  // Arrondi du mois précédent, repris en retenue (rubrique 994)
  const arrondisPrecedents = async (ids) => {
    if (!ids.length) return {}
    const { data } = await supabase.from('bulletins_paie').select('employe_id, arrondi').eq('periode', periodePrecedente(periode)).in('employe_id', ids)
    return Object.fromEntries((data || []).map(x => [x.employe_id, num(x.arrondi)]))
  }

  // Cumuls de l'année pour l'impression
  const cumulsPour = async (liste) => {
    const ids = [...new Set(liste.map(b => b.employe_id).filter(Boolean))]
    if (!ids.length) return {}
    const annee = periode.slice(0, 4)
    const { data } = await supabase.from('bulletins_paie')
      .select('id, employe_id, periode, brut_cotisable, jours_travailles, cnss_salarie, cnamgs_salarie, tcs, irpp, net_a_payer')
      .in('employe_id', ids).gte('periode', `${annee}-01`).lte('periode', periode)
    const out = {}
    for (const b of liste) out[b.id] = calculerCumuls(b, (data || []).filter(x => x.employe_id === b.employe_id), employeDe(b))
    return out
  }

  const imprimerUn = async (b) => {
    const c = await cumulsPour([b])
    if (!imprimerBulletin(b, employeDe(b), societe, params, c[b.id])) toast.error('Autorisez les fenêtres pop-up pour imprimer')
  }

  const imprimerTout = async (liste) => {
    const c = await cumulsPour(liste)
    if (!imprimerBulletins(liste.map(b => ({ bulletin: b, employe: employeDe(b), cumuls: c[b.id] })), societe, params, `Bulletins ${libellePeriode(periode)}`)) toast.error('Autorisez les fenêtres pop-up pour imprimer')
  }

  const prochainNumero = async (prefix) => {
    const { data } = await supabase.from('bulletins_paie').select('numero').like('numero', `${prefix}%`).order('numero', { ascending: false }).limit(1)
    const dernier = data?.[0]?.numero
    return dernier ? parseInt(dernier.split('-').pop(), 10) + 1 : 1
  }

  // Génère un brouillon pour chaque employé actif sans bulletin sur la période
  const genererPaie = async () => {
    const actifs = employes.filter(e => e.actif !== false)
    const deja = new Set(bulletins.map(b => b.employe_id))
    const aCreer = actifs.filter(e => !deja.has(e.id))
    if (!aCreer.length) { toast('Tous les employés actifs ont déjà un bulletin sur cette période'); return }
    if (!window.confirm(`Générer ${aCreer.length} bulletin(s) de paie pour ${libellePeriode(periode)} ?`)) return
    setGeneration(true)
    const reprises = await arrondisPrecedents(aCreer.map(e => e.id))
    const prefix = `BP-${periode.replace('-', '')}-`
    let seq = await prochainNumero(prefix)
    const rows = aCreer.map(e => {
      const calc = calculerBulletin({ employe: e, params, periode, rubriques: rubriquesDepuisEmploye(e, params), repriseArrondi: reprises[e.id] || 0 })
      return {
        numero: prefix + String(seq++).padStart(3, '0'),
        employe_id: e.id,
        employe_nom: `${e.nom} ${e.prenom || ''}`.trim(),
        employe_poste: e.poste,
        employe_matricule: e.matricule,
        employe_snapshot: snapshotEmploye(e),
        periode,
        primes: [],
        retenues: [],
        mode_paiement: e.mode_paiement || 'especes',
        statut: 'brouillon',
        created_by: user?.id,
        ...champsCalcul(calc),
      }
    })
    const { error } = await supabase.from('bulletins_paie').insert(rows)
    setGeneration(false)
    if (error) { toast.error('Erreur lors de la génération : ' + error.message); return }
    toast.success(`${rows.length} bulletin(s) généré(s)`)
    chargerBulletins()
  }

  // Recalcule les brouillons avec les fiches salariés et paramètres actuels
  const recalculerBrouillons = async () => {
    const brouillons = bulletins.filter(b => b.statut === 'brouillon')
    if (!brouillons.length) { toast('Aucun brouillon à recalculer'); return }
    if (!window.confirm(`Recalculer ${brouillons.length} brouillon(s) avec les fiches salariés et les paramètres actuels ?\nLes rubriques saisies sur chaque bulletin sont conservées.`)) return
    let ok = 0
    for (const b of brouillons) {
      const e = employeDe(b)
      if (!e) continue
      const calc = calculerBulletin({ employe: e, params, periode: b.periode, jours: b.jours_travailles, rubriques: b.rubriques || [], ancienneteTaux: b.anciennete_taux, repriseArrondi: b.reprise_arrondi })
      const { error } = await supabase.from('bulletins_paie').update({ ...champsCalcul(calc), employe_snapshot: snapshotEmploye(e), updated_at: new Date().toISOString() }).eq('id', b.id)
      if (!error) ok++
    }
    toast.success(`${ok} brouillon(s) recalculé(s)`)
    chargerBulletins()
  }

  const changerStatut = async (b, statut) => {
    const libelle = { valide: 'valider', paye: 'marquer comme payé', brouillon: 'repasser en brouillon' }[statut]
    if (!window.confirm(`Voulez-vous ${libelle} le bulletin ${b.numero} (${b.employe_nom}) ?`)) return
    const patch = { statut, updated_at: new Date().toISOString() }
    if (statut === 'valide') { patch.validated_by = user?.id; patch.validated_at = new Date().toISOString() }
    if (statut === 'paye') { patch.paid_at = new Date().toISOString(); if (!b.date_paiement) patch.date_paiement = today() }
    const { error } = await supabase.from('bulletins_paie').update(patch).eq('id', b.id)
    if (error) { toast.error('Modification impossible'); return }
    toast.success('Bulletin mis à jour')
    chargerBulletins()
  }

  const validerTous = async () => {
    const brouillons = bulletins.filter(b => b.statut === 'brouillon')
    if (!brouillons.length) { toast('Aucun brouillon à valider'); return }
    if (!window.confirm(`Valider les ${brouillons.length} bulletin(s) en brouillon de ${libellePeriode(periode)} ?`)) return
    const { error } = await supabase.from('bulletins_paie')
      .update({ statut: 'valide', validated_by: user?.id, validated_at: new Date().toISOString() })
      .eq('periode', periode).eq('statut', 'brouillon')
    if (error) { toast.error('Validation impossible'); return }
    toast.success('Bulletins validés')
    chargerBulletins()
  }

  const supprimer = async (b) => {
    if (!window.confirm(`Supprimer le bulletin ${b.numero} (${b.employe_nom}) ?`)) return
    const { error } = await supabase.from('bulletins_paie').delete().eq('id', b.id)
    if (error) { toast.error('Suppression impossible'); return }
    toast.success('Bulletin supprimé')
    chargerBulletins()
  }

  const filtres = useMemo(() => bulletins.filter(b => {
    if (filtreStatut && b.statut !== filtreStatut) return false
    const t = recherche.toLowerCase()
    return !t || (b.employe_nom || '').toLowerCase().includes(t) || (b.numero || '').toLowerCase().includes(t)
  }), [bulletins, recherche, filtreStatut])

  const somme = (liste, k) => liste.reduce((s, b) => s + num(b[k]), 0)
  const totaux = useMemo(() => ({
    brut: somme(bulletins, 'brut_cotisable'),
    indemnites: somme(bulletins, 'indemnites_non_soumises'),
    net: somme(bulletins, 'net_a_payer'),
    retenues: somme(bulletins, 'total_retenues'),
    charges: somme(bulletins, 'total_charges_employeur'),
    cout: somme(bulletins, 'cout_total'),
  }), [bulletins])

  const actifsSansBulletin = employes.filter(e => e.actif !== false && !bulletins.some(b => b.employe_id === e.id)).length
  const especes = bulletins.filter(b => (b.mode_paiement || 'especes') === 'especes')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Gestion de la paie</h1>
          <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4 }}>
            {libellePeriode(periode)} · {bulletins.length} bulletin{bulletins.length > 1 ? 's' : ''}
            {actifsSansBulletin > 0 && <span style={{ color: 'var(--warn)' }}> · {actifsSansBulletin} employé(s) actif(s) sans bulletin</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={periode} onChange={e => e.target.value && setPeriode(e.target.value)} style={{ width: 170 }} />
          <button className="btn btn-primary" onClick={genererPaie} disabled={generation || actifsSansBulletin === 0}>
            {generation ? 'Génération…' : `Générer la paie (${actifsSansBulletin})`}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {[['bulletins', 'Bulletins du mois'], ['recap', 'Récapitulatif & déclarations'], ...(isAdmin ? [['parametres', 'Paramètres de paie']] : [])].map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)} className="btn" style={{
            background: 'transparent', borderRadius: 0, padding: '10px 14px',
            borderBottom: onglet === k ? '2px solid var(--teal)' : '2px solid transparent',
            color: onglet === k ? 'var(--teal)' : 'var(--gray)', fontWeight: onglet === k ? 600 : 500,
          }}>{l}</button>
        ))}
      </div>

      {onglet === 'bulletins' && (
        <>
          <div className="stats-grid">
            <Stat label="Salaires bruts CNSS" value={fmt(totaux.brut)} />
            <Stat label="Indemnités non soumises" value={fmt(totaux.indemnites)} />
            <Stat label="Net à payer" value={fmt(totaux.net)} color="var(--teal)" />
            <Stat label="Coût total employeur" value={fmt(totaux.cout)} />
          </div>

          <div className="card" style={{ marginBottom: 16, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Rechercher un employé…" value={recherche} onChange={e => setRecherche(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} style={{ width: 160 }}>
              <option value="">Tous les statuts</option>
              {Object.entries(STATUTS_BULLETIN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="btn btn-ghost" disabled={!filtres.length} onClick={() => imprimerTout(filtres)}>🖨 Imprimer tout</button>
            <button className="btn btn-ghost" disabled={!bulletins.length} onClick={() => exportLivrePaieExcel(bulletins, periode)}>⬇ Livre de paie (Excel)</button>
            <button className="btn btn-ghost" disabled={!bulletins.some(b => b.statut === 'brouillon')} onClick={recalculerBrouillons}>↻ Recalculer les brouillons</button>
            {isAdmin && <button className="btn btn-success" disabled={!bulletins.some(b => b.statut === 'brouillon')} onClick={validerTous}>✓ Valider tous les brouillons</button>}
          </div>

          <div className="card">
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
            ) : filtres.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray)' }}>
                Aucun bulletin pour {libellePeriode(periode)}.<br />
                <span className="text-sm">Renseignez les salariés dans « Employés » (salaire de base et rubriques fixes), puis cliquez sur « Générer la paie ».</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Employé</th>
                      <th style={{ textAlign: 'right' }}>Brut CNSS</th>
                      <th style={{ textAlign: 'right' }}>Indemnités</th>
                      <th style={{ textAlign: 'right' }}>Retenues</th>
                      <th style={{ textAlign: 'right' }}>Net à payer</th>
                      <th>Statut</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtres.map(b => {
                      const st = STATUTS_BULLETIN[b.statut] || STATUTS_BULLETIN.brouillon
                      const modifiable = b.statut === 'brouillon' || isAdmin
                      return (
                        <tr key={b.id}>
                          <td className="font-mono text-sm">{b.numero}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{b.employe_nom}</div>
                            <div className="text-xs text-gray">{b.employe_poste} · {num(b.jours_travailles)} j · {MODES_PAIEMENT[b.mode_paiement] || b.mode_paiement}</div>
                          </td>
                          <td className="font-mono text-right">{fmt(b.brut_cotisable)}</td>
                          <td className="font-mono text-right">{fmt(b.indemnites_non_soumises)}</td>
                          <td className="font-mono text-right" style={{ color: 'var(--danger)' }}>− {fmt(b.total_retenues)}</td>
                          <td className="font-mono text-right" style={{ fontWeight: 700, color: 'var(--teal-dark)' }}>{fmt(b.net_a_payer)}</td>
                          <td>
                            <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                            {b.statut === 'paye' && b.date_paiement && <div className="text-xs text-gray">{fmtDate(b.date_paiement)}</div>}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEdition(b)}>{modifiable ? 'Modifier' : 'Détail'}</button>{' '}
                            <button className="btn btn-ghost btn-sm" onClick={() => imprimerUn(b)}>🖨</button>{' '}
                            {isAdmin && b.statut === 'brouillon' && <><button className="btn btn-success btn-sm" onClick={() => changerStatut(b, 'valide')}>Valider</button>{' '}</>}
                            {isAdmin && b.statut === 'valide' && <><button className="btn btn-success btn-sm" onClick={() => changerStatut(b, 'paye')}>Payé</button>{' '}</>}
                            {isAdmin && b.statut !== 'brouillon' && <><button className="btn btn-ghost btn-sm" title="Repasser en brouillon" onClick={() => changerStatut(b, 'brouillon')}>↩</button>{' '}</>}
                            {(b.statut === 'brouillon' || isAdmin) && <button className="btn btn-danger btn-sm" onClick={() => supprimer(b)}>✕</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--lgray)', fontWeight: 700 }}>
                      <td colSpan={2}>TOTAL ({filtres.length})</td>
                      <td className="font-mono text-right">{fmt(somme(filtres, 'brut_cotisable'))}</td>
                      <td className="font-mono text-right">{fmt(somme(filtres, 'indemnites_non_soumises'))}</td>
                      <td className="font-mono text-right" style={{ color: 'var(--danger)' }}>− {fmt(somme(filtres, 'total_retenues'))}</td>
                      <td className="font-mono text-right" style={{ color: 'var(--teal-dark)' }}>{fmt(somme(filtres, 'net_a_payer'))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {onglet === 'recap' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Récapitulatif {libellePeriode(periode)} — montants à déclarer / reverser</div></div>
            <div className="card-body">
              {bulletins.length === 0 ? <div className="text-gray">Aucun bulletin sur la période.</div> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Rubrique</th><th style={{ textAlign: 'right' }}>Base</th><th style={{ textAlign: 'right' }}>Part salariale</th><th style={{ textAlign: 'right' }}>Part patronale</th><th style={{ textAlign: 'right' }}>Total à reverser</th></tr></thead>
                    <tbody>
                      <Ligne l={`CNSS (${params.cnss_taux_salarie} % + ${params.cnss_taux_employeur} %)`} base={somme(bulletins, 'base_cnss')} a={somme(bulletins, 'cnss_salarie')} b={somme(bulletins, 'cnss_employeur')} />
                      <Ligne l={`CNAMGS (${params.cnamgs_taux_salarie} % + ${params.cnamgs_taux_employeur} %)`} base={somme(bulletins, 'base_cnamgs')} a={somme(bulletins, 'cnamgs_salarie')} b={somme(bulletins, 'cnamgs_employeur')} />
                      <Ligne l="FNH" base={somme(bulletins, 'brut_cotisable')} a={0} b={somme(bulletins, 'fnh_employeur')} />
                      <Ligne l="TCS (DGI)" base={somme(bulletins, 'base_tcs')} a={somme(bulletins, 'tcs')} b={0} />
                      <Ligne l="IRPP (DGI)" base={somme(bulletins, 'base_irpp')} a={somme(bulletins, 'irpp')} b={0} />
                      <Ligne l="Autres retenues (avances, prêts…)" a={somme(bulletins, 'autres_retenues')} b={0} />
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--lgray)', fontWeight: 700 }}>
                        <td colSpan={2}>Brut CNSS : {fmt(totaux.brut)} · Net versé : {fmt(totaux.net)}</td>
                        <td className="font-mono text-right">{fmt(somme(bulletins, 'cnss_salarie') + somme(bulletins, 'cnamgs_salarie') + somme(bulletins, 'tcs') + somme(bulletins, 'irpp'))}</td>
                        <td className="font-mono text-right">{fmt(totaux.charges)}</td>
                        <td className="font-mono text-right">{fmt(somme(bulletins, 'cnss_salarie') + somme(bulletins, 'cnamgs_salarie') + somme(bulletins, 'tcs') + somme(bulletins, 'irpp') + totaux.charges)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>

          {especes.length > 0 && (
            <div className="card">
              <div className="card-header"><div className="card-title">Billetage — salaires payés en espèces ({especes.length})</div></div>
              <div className="card-body">
                <BilletageGlobal bulletins={especes} />
              </div>
            </div>
          )}
        </div>
      )}

      {onglet === 'parametres' && isAdmin && (
        <ParametresPaie params={params} onSaved={(p) => { setParams(parametresComplets(p)); toast.success('Paramètres enregistrés') }} />
      )}

      {edition && (
        <ModalBulletin
          bulletin={edition}
          employe={employeDe(edition)}
          params={params}
          lectureSeule={edition.statut !== 'brouillon' && !isAdmin}
          onImprimer={imprimerUn}
          onClose={() => setEdition(null)}
          onSaved={() => { setEdition(null); chargerBulletins() }}
        />
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

function Ligne({ l, base, a, b }) {
  return (
    <tr>
      <td>{l}</td>
      <td className="font-mono text-right text-gray">{base === undefined ? '' : fmt(base)}</td>
      <td className="font-mono text-right">{fmt(a)}</td>
      <td className="font-mono text-right">{fmt(b)}</td>
      <td className="font-mono text-right" style={{ fontWeight: 600 }}>{fmt(a + b)}</td>
    </tr>
  )
}

function BilletageGlobal({ bulletins }) {
  const totaux = {}
  for (const b of bulletins) for (const x of (b.billetage || [])) totaux[x.coupure] = (totaux[x.coupure] || 0) + num(x.nombre)
  const coupures = Object.keys(totaux).map(Number).sort((a, b) => b - a).filter(c => totaux[c] > 0)
  const total = coupures.reduce((s, c) => s + c * totaux[c], 0)
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Coupure</th><th style={{ textAlign: 'right' }}>Nombre</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
        <tbody>{coupures.map(c => <tr key={c}><td className="font-mono">{fp(c)}</td><td className="font-mono text-right">{totaux[c]}</td><td className="font-mono text-right">{fmt(c * totaux[c])}</td></tr>)}</tbody>
        <tfoot><tr style={{ background: 'var(--lgray)', fontWeight: 700 }}><td colSpan={2}>Total à retirer en espèces</td><td className="font-mono text-right">{fmt(total)}</td></tr></tfoot>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Modal d'édition d'un bulletin (rubriques + aperçu au format du bulletin)
// ─────────────────────────────────────────────────────────────
function ModalBulletin({ bulletin, employe, params, lectureSeule, onImprimer, onClose, onSaved }) {
  const emp = employe || { ...(bulletin.employe_snapshot || {}), salaire_base: bulletin.salaire_base }
  const [jours, setJours] = useState(bulletin.jours_travailles ?? params.jours_base ?? 30)
  const [rubriques, setRubriques] = useState(Array.isArray(bulletin.rubriques) ? bulletin.rubriques.map(r => ({ ...r })) : [])
  const [ancForce, setAncForce] = useState(bulletin.anciennete_taux ?? '')
  const [reprise, setReprise] = useState(num(bulletin.reprise_arrondi))
  const [datePaiement, setDatePaiement] = useState(bulletin.date_paiement || '')
  const [mode, setMode] = useState(bulletin.mode_paiement || emp.mode_paiement || 'especes')
  const [notes, setNotes] = useState(bulletin.notes || '')
  const [saving, setSaving] = useState(false)

  const ancAuto = tauxAnciennete(emp.date_embauche, bulletin.periode, params)
  const calc = useMemo(() => calculerBulletin({
    employe: emp, params, periode: bulletin.periode, jours, rubriques, ancienneteTaux: ancForce === '' ? null : ancForce, repriseArrondi: reprise,
  }), [emp, params, bulletin.periode, jours, rubriques, ancForce, reprise])

  const maj = (i, k, v) => setRubriques(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const ajouter = (code) => setRubriques(p => [...p, { code, libelle: RUBRIQUES[code].libelle, base: '', nombre: RUBRIQUES[code].mode === 'jours' ? null : null }])

  const enregistrer = async (imprimer = false) => {
    setSaving(true)
    const payload = {
      ...champsCalcul(calc),
      employe_snapshot: employe ? snapshotEmploye(employe) : bulletin.employe_snapshot,
      date_paiement: datePaiement || null,
      mode_paiement: mode,
      billetage: mode === 'especes' ? calc.billetage : null,
      notes,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('bulletins_paie').update(payload).eq('id', bulletin.id).select().single()
    setSaving(false)
    if (error) { toast.error("Erreur lors de l'enregistrement"); return }
    toast.success('Bulletin enregistré')
    if (imprimer && data) await onImprimer(data)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 1040, maxWidth: '96vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="card-title">{bulletin.numero} — {bulletin.employe_nom}</div>
            <div className="text-xs text-gray">{libellePeriode(bulletin.periode)} · {emp.poste || bulletin.employe_poste} · salaire de base {fmt(emp.salaire_base)} · {calc.nb_parts} part(s){lectureSeule ? ' · lecture seule' : ''}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)', gap: 20 }}>
          <fieldset disabled={lectureSeule} style={{ border: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div className="form-grid form-grid-3">
              <div className="form-group"><label>Jours payés (sur {params.jours_base || 30})</label><input type="number" min="0" max={params.jours_base || 30} step="0.5" value={jours} onChange={e => setJours(e.target.value)} /></div>
              <div className="form-group"><label>Ancienneté % (auto : {ancAuto})</label><input type="number" step="0.5" min="0" value={ancForce} onChange={e => setAncForce(e.target.value)} placeholder={`${ancAuto}`} /></div>
              <div className="form-group"><label>Reprise arrondi (994)</label><input type="number" value={reprise} onChange={e => setReprise(e.target.value)} /></div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                <label style={{ fontWeight: 600, color: 'var(--teal)' }}>Rubriques du mois</label>
                {!lectureSeule && (
                  <select value="" onChange={e => { if (e.target.value) ajouter(e.target.value) }} style={{ width: 'auto', maxWidth: 260 }}>
                    <option value="">+ Ajouter une rubrique…</option>
                    {['S', 'N', 'R'].map(t => (
                      <optgroup key={t} label={TYPES_RUBRIQUE[t]}>
                        {RUBRIQUES_SAISISSABLES.filter(([, d]) => d.type === t).map(([c, d]) => <option key={c} value={c}>{c} · {d.libelle}</option>)}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 110px 56px 28px', gap: 6, fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>
                <span>Code</span><span>Libellé</span><span>Base / montant</span><span>Jours</span><span></span>
              </div>
              {rubriques.length === 0 && <div className="text-sm text-gray">Aucune prime, indemnité ou retenue ce mois.</div>}
              {rubriques.map((r, i) => {
                const d = RUBRIQUES[r.code] || {}
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 110px 56px 28px', gap: 6, marginBottom: 5, alignItems: 'center' }}>
                    <span className="font-mono text-sm" style={{ color: d.type === 'R' ? 'var(--danger)' : d.type === 'N' ? '#166534' : 'inherit' }}>{r.code}</span>
                    <input value={r.libelle ?? d.libelle} onChange={e => maj(i, 'libelle', e.target.value.toUpperCase())} />
                    <input type="number" min="0" value={r.base ?? ''} onChange={e => maj(i, 'base', e.target.value)} />
                    {d.mode === 'jours'
                      ? <input type="number" min="0" step="0.5" value={r.nombre ?? ''} placeholder={String(jours)} onChange={e => maj(i, 'nombre', e.target.value === '' ? null : e.target.value)} />
                      : <span className="text-xs text-gray" style={{ textAlign: 'center' }}>fixe</span>}
                    {!lectureSeule ? <button className="btn btn-danger btn-sm" onClick={() => setRubriques(x => x.filter((_, j) => j !== i))}>✕</button> : <span />}
                  </div>
                )
              })}
              <div className="text-xs text-gray" style={{ marginTop: 6 }}>Rubriques « jours » : montant = base × jours / {params.jours_base || 30} (vide = jours payés). Bleu = soumis, vert = non soumis, rouge = retenue.</div>
            </div>

            <div className="form-grid form-grid-2">
              <div className="form-group"><label>Mode de paiement</label>
                <select value={mode} onChange={e => setMode(e.target.value)}>
                  {['especes', 'virement', 'cheque', 'mobile_money'].map(m => <option key={m} value={m}>{MODES_PAIEMENT[m]}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Date de paiement</label><input type="date" value={datePaiement} onChange={e => setDatePaiement(e.target.value)} /></div>
            </div>
            <div className="form-group"><label>Observations (imprimées sous le bulletin)</label><input value={notes} onChange={e => setNotes(e.target.value)} /></div>
          </fieldset>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 6 }}>Aperçu du bulletin</div>
            <div style={{ border: '1px solid var(--teal)', borderRadius: 4, overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--teal)', color: '#fff' }}>
                    {['Code', 'Libellé', 'Base', 'Taux', 'Gains', 'Retenues'].map((h, i) => <th key={h} style={{ padding: '4px 6px', fontSize: 10, textAlign: i > 1 ? 'right' : 'left', color: '#fff' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {calc.lignes.map((l, i) => (
                    <tr key={i} style={{ fontFamily: 'Courier New, monospace', background: l.total ? '#f0fdfa' : 'transparent' }}>
                      <td style={{ padding: '2px 6px' }}>{l.code}</td>
                      <td style={{ padding: '2px 6px', whiteSpace: 'nowrap', fontWeight: l.total ? 700 : 400 }}>{l.libelle}</td>
                      <td style={{ padding: '2px 6px', textAlign: 'right' }}>{l.base != null ? fp(l.base) : ''}</td>
                      <td style={{ padding: '2px 6px', textAlign: 'right' }}>{l.nombre != null ? String(l.nombre).replace('.', ',') : ''}</td>
                      <td style={{ padding: '2px 6px', textAlign: 'right' }}>{l.gain ? fp(l.gain) : ''}</td>
                      <td style={{ padding: '2px 6px', textAlign: 'right', color: 'var(--danger)' }}>{l.retenue ? fp(l.retenue) : ''}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid var(--teal)', fontWeight: 700, fontFamily: 'Courier New, monospace' }}>
                    <td colSpan={4} style={{ padding: '4px 6px' }}>TOTAUX</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fp(calc.total_gains)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--danger)' }}>{fp(calc.total_retenues)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, padding: '10px 12px', background: 'var(--teal)', color: '#fff', borderRadius: 6 }}>
              <span style={{ fontWeight: 700 }}>NET À PAYER</span>
              <span className="font-mono" style={{ fontSize: 18, fontWeight: 800 }}>{fmt(calc.net_a_payer)}</span>
            </div>
            {mode === 'especes' && (
              <div className="text-xs text-gray" style={{ marginTop: 6 }}>
                Billetage : {calc.billetage.filter(x => x.nombre > 0).map(x => `${fp(x.coupure)} × ${x.nombre}`).join(' · ')}
              </div>
            )}
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border)', fontSize: 12, color: 'var(--gray)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px' }}>
              <span>CNSS patronale ({params.cnss_taux_employeur} %)</span><span className="font-mono">{fmt(calc.cnss_employeur)}</span>
              <span>CNAMGS patronale ({params.cnamgs_taux_employeur} %)</span><span className="font-mono">{fmt(calc.cnamgs_employeur)}</span>
              {calc.fnh_employeur > 0 && <><span>FNH ({params.fnh_taux_employeur} %)</span><span className="font-mono">{fmt(calc.fnh_employeur)}</span></>}
              <strong>Coût total employeur</strong><strong className="font-mono">{fmt(calc.cout_total)}</strong>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
          {lectureSeule
            ? <button className="btn btn-primary" onClick={() => onImprimer(bulletin)}>🖨 Imprimer</button>
            : <>
                <button className="btn btn-ghost" disabled={saving} onClick={() => enregistrer(true)}>🖨 Enregistrer et imprimer</button>
                <button className="btn btn-primary" disabled={saving} onClick={() => enregistrer(false)}>{saving ? 'Enregistrement…' : 'Enregistrer le bulletin'}</button>
              </>}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Paramètres de paie (admin)
// ─────────────────────────────────────────────────────────────
function ParametresPaie({ params, onSaved }) {
  const init = (p) => ({ ...parametresComplets(p) })
  const [f, setF] = useState(init(params))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setF(init(params)) }, [params])

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const majTranche = (i, k, v) => set('irpp_bareme', f.irpp_bareme.map((t, j) => j === i ? { ...t, [k]: v === '' ? null : Number(v) } : t))

  const enregistrer = async () => {
    setSaving(true)
    const payload = {
      cnss_taux_salarie: num(f.cnss_taux_salarie), cnss_taux_employeur: num(f.cnss_taux_employeur), cnss_plafond: num(f.cnss_plafond),
      cnamgs_taux_salarie: num(f.cnamgs_taux_salarie), cnamgs_taux_employeur: num(f.cnamgs_taux_employeur), cnamgs_plafond: num(f.cnamgs_plafond),
      fnh_taux_employeur: num(f.fnh_taux_employeur), frais_pro_pct: num(f.frais_pro_pct),
      tcs_taux: num(f.tcs_taux), tcs_seuil_exoneration: num(f.tcs_seuil_exoneration),
      irpp_actif: f.irpp_actif !== false, irpp_bareme: f.irpp_bareme, parts_max: num(f.parts_max) || 6, jours_base: parseInt(f.jours_base, 10) || 30,
      arrondi_paie: parseInt(f.arrondi_paie, 10) || 0,
      anciennete_debut_annees: num(f.anciennete_debut_annees), anciennete_taux_annuel: num(f.anciennete_taux_annuel), anciennete_max: num(f.anciennete_max),
      employeur_nom: f.employeur_nom, employeur_bp: f.employeur_bp, employeur_ville: f.employeur_ville, employeur_stat: f.employeur_stat, employeur_cnss: f.employeur_cnss,
      updated_at: new Date().toISOString(),
    }
    const { data: existant } = await supabase.from('parametres_paie').select('id').limit(1).maybeSingle()
    const q = existant ? supabase.from('parametres_paie').update(payload).eq('id', existant.id) : supabase.from('parametres_paie').insert(payload)
    const { error } = await q
    setSaving(false)
    if (error) { toast.error("Erreur d'enregistrement : " + error.message); return }
    onSaved(payload)
  }

  const champNum = (k, label, step = '0.1') => (
    <div className="form-group" key={k}><label>{label}</label><input type="number" step={step} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} /></div>
  )
  const champTxt = (k, label) => (
    <div className="form-group" key={k}><label>{label}</label><input value={f[k] ?? ''} onChange={e => set(k, e.target.value)} /></div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <div className="card">
        <div className="card-header"><div className="card-title">En-tête du bulletin (employeur)</div></div>
        <div className="card-body">
          <div className="form-grid form-grid-2">
            {champTxt('employeur_nom', 'Raison sociale')}
            {champTxt('employeur_bp', 'Boîte postale')}
            {champTxt('employeur_ville', 'Ville')}
            {champTxt('employeur_stat', 'N° statistique')}
            {champTxt('employeur_cnss', 'N° employeur CNSS')}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Ancienneté, jours & arrondi</div></div>
        <div className="card-body">
          <div className="form-grid form-grid-3">
            {champNum('anciennete_debut_annees', "Ancienneté : à partir de (années)", '1')}
            {champNum('anciennete_taux_annuel', "% par année d'ancienneté")}
            {champNum('anciennete_max', "Plafond ancienneté (%)")}
            {champNum('jours_base', "Jours de base par mois", '1')}
            {champNum('arrondi_paie', "Arrondi du net (FCFA, 0 = aucun)", '100')}
            {champNum('parts_max', "Nombre de parts maximum", '0.5')}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Cotisations sociales</div></div>
        <div className="card-body">
          <div className="form-grid form-grid-3">
            {champNum('cnss_taux_salarie', "CNSS salarié (%)")}
            {champNum('cnss_taux_employeur', "CNSS employeur (%)")}
            {champNum('cnss_plafond', "Plafond CNSS (FCFA/mois)", '1000')}
            {champNum('cnamgs_taux_salarie', "CNAMGS salarié (%)")}
            {champNum('cnamgs_taux_employeur', "CNAMGS employeur (%)")}
            {champNum('cnamgs_plafond', "Plafond CNAMGS (FCFA/mois)", '1000')}
            {champNum('fnh_taux_employeur', "FNH employeur (%) — 0 si non applicable")}
          </div>
          <div className="text-xs text-gray" style={{ marginTop: 8 }}>Base CNAMGS = brut − retenue CNSS (comme sur le bulletin).</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Impôts sur salaire (TCS & IRPP)</div></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grid form-grid-3">
            {champNum('tcs_taux', "TCS (%)")}
            {champNum('tcs_seuil_exoneration', "Abattement TCS (FCFA/mois)", '1000')}
            {champNum('frais_pro_pct', "Abattement frais pro IRPP (%)")}
          </div>
          <div className="text-xs text-gray">TCS = taux × (brut − CNSS − CNAMGS − abattement). Base IRPP = brut − CNSS − CNAMGS − TCS.</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={f.irpp_actif !== false} onChange={e => set('irpp_actif', e.target.checked)} style={{ width: 'auto' }} />
            Appliquer l'IRPP (retenue à la source)
          </label>
          <div>
            <label style={{ display: 'block', marginBottom: 6 }}>Barème IRPP annuel par part</label>
            {f.irpp_bareme.map((t, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 32px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span className="text-sm text-gray">Jusqu'à</span>
                <input type="number" step="1000" placeholder="∞ (dernière tranche)" value={t.jusqua ?? ''} onChange={e => majTranche(i, 'jusqua', e.target.value)} />
                <input type="number" step="0.5" value={t.taux ?? 0} onChange={e => majTranche(i, 'taux', e.target.value)} placeholder="%" />
                <button className="btn btn-danger btn-sm" onClick={() => set('irpp_bareme', f.irpp_bareme.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => set('irpp_bareme', [...f.irpp_bareme, { jusqua: null, taux: 0 }])}>+ Ajouter une tranche</button>
          </div>
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-ghost" onClick={() => setF({ ...PARAMS_DEFAUT })}>Rétablir les valeurs par défaut</button>
        <button className="btn btn-primary" disabled={saving} onClick={enregistrer}>{saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button>
      </div>
    </div>
  )
}
