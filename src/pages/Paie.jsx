import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { fmt, fmtDate, today } from '../lib/utils'
import { calculerBulletin, primesFixesEmploye, libellePeriode, periodeCourante, MODES_PAIEMENT, STATUTS_BULLETIN, PARAMS_DEFAUT } from '../lib/paie'
import { imprimerBulletin, imprimerBulletins } from '../components/BulletinPrint'
import { exportLivrePaieExcel } from '../lib/exportExcel'
import toast from 'react-hot-toast'

const num = (v) => Number(v) || 0

export default function Paie() {
  const { user, profile, isAdmin } = useAuth()
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
    if (prm) setParams({ ...PARAMS_DEFAUT, ...prm })
    setSociete(soc || null)
  }

  const chargerBulletins = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('bulletins_paie')
      .select('*')
      .eq('periode', periode)
      .order('employe_nom')
    if (error) toast.error('Erreur de chargement des bulletins')
    setBulletins(data || [])
    setLoading(false)
  }

  useEffect(() => { chargerRef() }, [])
  useEffect(() => { chargerBulletins() }, [periode])

  const employeDe = (b) => employes.find(e => e.id === b.employe_id) || {}

  const prochainNumero = async (prefix) => {
    const { data } = await supabase.from('bulletins_paie').select('numero').like('numero', `${prefix}%`).order('numero', { ascending: false }).limit(1)
    const dernier = data?.[0]?.numero
    const n = dernier ? parseInt(dernier.split('-').pop(), 10) + 1 : 1
    return n
  }

  // Génère un brouillon pour chaque employé actif sans bulletin sur la période
  const genererPaie = async () => {
    const actifs = employes.filter(e => e.actif !== false)
    const deja = new Set(bulletins.map(b => b.employe_id))
    const aCreer = actifs.filter(e => !deja.has(e.id))
    if (!aCreer.length) { toast('Tous les employés actifs ont déjà un bulletin sur cette période'); return }
    if (!window.confirm(`Générer ${aCreer.length} bulletin(s) de paie pour ${libellePeriode(periode)} ?`)) return
    setGeneration(true)
    const prefix = `BP-${periode.replace('-', '')}-`
    let seq = await prochainNumero(prefix)
    const rows = aCreer.map(e => {
      const primes = primesFixesEmploye(e)
      const calc = calculerBulletin({ employe: e, params, primes })
      return {
        numero: prefix + String(seq++).padStart(3, '0'),
        employe_id: e.id,
        employe_nom: `${e.nom} ${e.prenom || ''}`.trim(),
        employe_poste: e.poste,
        employe_matricule: e.matricule,
        periode,
        primes,
        retenues: [],
        mode_paiement: e.mode_paiement,
        statut: 'brouillon',
        created_by: user?.id,
        ...calc,
      }
    })
    const { error } = await supabase.from('bulletins_paie').insert(rows)
    setGeneration(false)
    if (error) { toast.error('Erreur lors de la génération : ' + error.message); return }
    toast.success(`${rows.length} bulletin(s) généré(s)`)
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

  const totaux = useMemo(() => ({
    brut: bulletins.reduce((s, b) => s + num(b.brut), 0),
    net: bulletins.reduce((s, b) => s + num(b.net_a_payer), 0),
    retenues: bulletins.reduce((s, b) => s + num(b.total_retenues), 0),
    charges: bulletins.reduce((s, b) => s + num(b.total_charges_employeur), 0),
    cout: bulletins.reduce((s, b) => s + num(b.cout_total), 0),
    cnss: bulletins.reduce((s, b) => s + num(b.cnss_salarie) + num(b.cnss_employeur), 0),
    cnamgs: bulletins.reduce((s, b) => s + num(b.cnamgs_salarie) + num(b.cnamgs_employeur), 0),
    irpp: bulletins.reduce((s, b) => s + num(b.irpp) + num(b.tcs), 0),
  }), [bulletins])

  const actifsSansBulletin = employes.filter(e => e.actif !== false && !bulletins.some(b => b.employe_id === e.id)).length

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
            <Stat label="Masse salariale brute" value={fmt(totaux.brut)} />
            <Stat label="Net à payer" value={fmt(totaux.net)} color="var(--teal)" />
            <Stat label="Charges patronales" value={fmt(totaux.charges)} />
            <Stat label="Coût total employeur" value={fmt(totaux.cout)} />
          </div>

          <div className="card" style={{ marginBottom: 16, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Rechercher un employé…" value={recherche} onChange={e => setRecherche(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} style={{ width: 160 }}>
              <option value="">Tous les statuts</option>
              {Object.entries(STATUTS_BULLETIN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="btn btn-ghost" disabled={!filtres.length} onClick={() => imprimerBulletins(filtres.map(b => ({ bulletin: b, employe: employeDe(b) })), societe, params, `Bulletins ${libellePeriode(periode)}`)}>🖨 Imprimer tout</button>
            <button className="btn btn-ghost" disabled={!bulletins.length} onClick={() => exportLivrePaieExcel(bulletins, periode)}>⬇ Livre de paie (Excel)</button>
            {isAdmin && <button className="btn btn-success" disabled={!bulletins.some(b => b.statut === 'brouillon')} onClick={validerTous}>✓ Valider tous les brouillons</button>}
          </div>

          <div className="card">
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
            ) : filtres.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray)' }}>
                Aucun bulletin pour {libellePeriode(periode)}.<br />
                <span className="text-sm">Cliquez sur « Générer la paie » pour créer les bulletins des employés actifs.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Employé</th>
                      <th style={{ textAlign: 'right' }}>Brut</th>
                      <th style={{ textAlign: 'right' }}>Retenues</th>
                      <th style={{ textAlign: 'right' }}>Net à payer</th>
                      <th style={{ textAlign: 'right' }}>Coût total</th>
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
                            <div className="text-xs text-gray">{b.employe_poste} · {num(b.jours_travailles)} j{num(b.jours_absence) > 0 ? ` · ${num(b.jours_absence)} j abs.` : ''}</div>
                          </td>
                          <td className="font-mono text-right">{fmt(b.brut)}</td>
                          <td className="font-mono text-right" style={{ color: 'var(--danger)' }}>− {fmt(b.total_retenues)}</td>
                          <td className="font-mono text-right" style={{ fontWeight: 700, color: 'var(--teal-dark)' }}>{fmt(b.net_a_payer)}</td>
                          <td className="font-mono text-right text-gray">{fmt(b.cout_total)}</td>
                          <td>
                            <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                            {b.statut === 'paye' && b.date_paiement && <div className="text-xs text-gray">{fmtDate(b.date_paiement)}</div>}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEdition(b)}>{modifiable ? 'Modifier' : 'Détail'}</button>{' '}
                            <button className="btn btn-ghost btn-sm" onClick={() => imprimerBulletin(b, employeDe(b), societe, params)}>🖨</button>{' '}
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
                      <td className="font-mono text-right">{fmt(filtres.reduce((s, b) => s + num(b.brut), 0))}</td>
                      <td className="font-mono text-right" style={{ color: 'var(--danger)' }}>− {fmt(filtres.reduce((s, b) => s + num(b.total_retenues), 0))}</td>
                      <td className="font-mono text-right" style={{ color: 'var(--teal-dark)' }}>{fmt(filtres.reduce((s, b) => s + num(b.net_a_payer), 0))}</td>
                      <td className="font-mono text-right">{fmt(filtres.reduce((s, b) => s + num(b.cout_total), 0))}</td>
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
        <div className="card">
          <div className="card-header"><div className="card-title">Récapitulatif {libellePeriode(periode)} — montants à déclarer / reverser</div></div>
          <div className="card-body">
            {bulletins.length === 0 ? <div className="text-gray">Aucun bulletin sur la période.</div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Rubrique</th><th style={{ textAlign: 'right' }}>Part salariale</th><th style={{ textAlign: 'right' }}>Part patronale</th><th style={{ textAlign: 'right' }}>Total à reverser</th></tr></thead>
                  <tbody>
                    <Ligne l="CNSS" a={bulletins.reduce((s, b) => s + num(b.cnss_salarie), 0)} b={bulletins.reduce((s, b) => s + num(b.cnss_employeur), 0)} />
                    <Ligne l="CNAMGS" a={bulletins.reduce((s, b) => s + num(b.cnamgs_salarie), 0)} b={bulletins.reduce((s, b) => s + num(b.cnamgs_employeur), 0)} />
                    <Ligne l="FNH" a={0} b={bulletins.reduce((s, b) => s + num(b.fnh_employeur), 0)} />
                    <Ligne l="IRPP (DGI)" a={bulletins.reduce((s, b) => s + num(b.irpp), 0)} b={0} />
                    <Ligne l="TCS (DGI)" a={bulletins.reduce((s, b) => s + num(b.tcs), 0)} b={0} />
                    <Ligne l="Autres retenues (avances, prêts…)" a={bulletins.reduce((s, b) => s + num(b.autres_retenues), 0)} b={0} />
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--lgray)', fontWeight: 700 }}>
                      <td>Masse salariale brute : {fmt(totaux.brut)} · Net versé aux salariés : {fmt(totaux.net)}</td>
                      <td className="font-mono text-right">{fmt(totaux.retenues)}</td>
                      <td className="font-mono text-right">{fmt(totaux.charges)}</td>
                      <td className="font-mono text-right">{fmt(totaux.retenues + totaux.charges)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div className="alert alert-warn" style={{ marginTop: 16, marginBottom: 0 }}>
              Les taux, plafonds et le barème IRPP sont paramétrables dans l'onglet « Paramètres de paie ». Faites-les vérifier par votre comptable avant la première déclaration.
            </div>
          </div>
        </div>
      )}

      {onglet === 'parametres' && isAdmin && (
        <ParametresPaie params={params} onSaved={(p) => { setParams({ ...PARAMS_DEFAUT, ...p }); toast.success('Paramètres enregistrés') }} />
      )}

      {edition && (
        <ModalBulletin
          bulletin={edition}
          employe={employeDe(edition)}
          params={params}
          lectureSeule={edition.statut !== 'brouillon' && !isAdmin}
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

function Ligne({ l, a, b }) {
  return (
    <tr>
      <td>{l}</td>
      <td className="font-mono text-right">{fmt(a)}</td>
      <td className="font-mono text-right">{fmt(b)}</td>
      <td className="font-mono text-right" style={{ fontWeight: 600 }}>{fmt(a + b)}</td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────
// Modal d'édition d'un bulletin
// ─────────────────────────────────────────────────────────────
function ModalBulletin({ bulletin, employe, params, lectureSeule, onClose, onSaved }) {
  const [absence, setAbsence] = useState(num(bulletin.jours_absence))
  const [hs, setHs] = useState(num(bulletin.heures_sup_montant))
  const [primes, setPrimes] = useState(Array.isArray(bulletin.primes) ? bulletin.primes : [])
  const [retenues, setRetenues] = useState(Array.isArray(bulletin.retenues) ? bulletin.retenues : [])
  const [datePaiement, setDatePaiement] = useState(bulletin.date_paiement || '')
  const [mode, setMode] = useState(bulletin.mode_paiement || employe.mode_paiement || 'virement')
  const [notes, setNotes] = useState(bulletin.notes || '')
  const [saving, setSaving] = useState(false)

  const emp = { ...employe, salaire_base: employe.salaire_base ?? bulletin.salaire_base }
  const calc = useMemo(() => calculerBulletin({ employe: emp, params, joursAbsence: absence, heuresSupMontant: hs, primes, retenues }), [emp.salaire_base, emp.situation_familiale, emp.nb_enfants, params, absence, hs, primes, retenues])

  const majPrime = (i, k, v) => setPrimes(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const majRetenue = (i, k, v) => setRetenues(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const enregistrer = async () => {
    setSaving(true)
    const payload = {
      primes: primes.filter(p => (p.libelle || '').trim()).map(p => ({ libelle: p.libelle.trim(), montant: num(p.montant), imposable: p.imposable !== false })),
      retenues: retenues.filter(r => (r.libelle || '').trim()).map(r => ({ libelle: r.libelle.trim(), montant: num(r.montant) })),
      date_paiement: datePaiement || null,
      mode_paiement: mode,
      notes,
      updated_at: new Date().toISOString(),
      ...calc,
    }
    const { error } = await supabase.from('bulletins_paie').update(payload).eq('id', bulletin.id)
    setSaving(false)
    if (error) { toast.error("Erreur lors de l'enregistrement"); return }
    toast.success('Bulletin enregistré')
    onSaved()
  }

  const R = ({ l, v, strong, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: strong ? 700 : 400, color: color || 'inherit', borderTop: strong ? '1px solid var(--border)' : 'none' }}>
      <span>{l}</span><span className="font-mono">{fmt(v)}</span>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 900 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="card-title">{bulletin.numero} — {bulletin.employe_nom}</div>
            <div className="text-xs text-gray">{libellePeriode(bulletin.periode)} · {bulletin.employe_poste} · salaire de base {fmt(emp.salaire_base)}{lectureSeule ? ' · lecture seule' : ''}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <fieldset disabled={lectureSeule} style={{ border: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="form-grid form-grid-3">
                <div className="form-group"><label>Jours d'absence (base {params.jours_base || 30} j)</label><input type="number" min="0" max={params.jours_base || 30} step="0.5" value={absence} onChange={e => setAbsence(e.target.value)} /></div>
                <div className="form-group"><label>Heures supplémentaires (montant FCFA)</label><input type="number" min="0" value={hs} onChange={e => setHs(e.target.value)} /></div>
                <div className="form-group"><label>Date de paiement</label><input type="date" value={datePaiement} onChange={e => setDatePaiement(e.target.value)} /></div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontWeight: 600, color: 'var(--teal)' }}>Primes & indemnités</label>
                  {!lectureSeule && <button className="btn btn-ghost btn-sm" onClick={() => setPrimes(p => [...p, { libelle: '', montant: 0, imposable: true }])}>+ Ajouter</button>}
                </div>
                {primes.length === 0 && <div className="text-sm text-gray">Aucune prime ce mois.</div>}
                {primes.map((p, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 110px 32px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <input placeholder="Libellé (ex : prime de rendement)" value={p.libelle} onChange={e => majPrime(i, 'libelle', e.target.value)} />
                    <input type="number" min="0" value={p.montant} onChange={e => majPrime(i, 'montant', e.target.value)} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><input type="checkbox" checked={p.imposable !== false} onChange={e => majPrime(i, 'imposable', e.target.checked)} style={{ width: 'auto' }} />Imposable</label>
                    {!lectureSeule && <button className="btn btn-danger btn-sm" onClick={() => setPrimes(x => x.filter((_, j) => j !== i))}>✕</button>}
                  </div>
                ))}
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontWeight: 600, color: 'var(--danger)' }}>Autres retenues (avances, prêts, sanctions…)</label>
                  {!lectureSeule && <button className="btn btn-ghost btn-sm" onClick={() => setRetenues(p => [...p, { libelle: '', montant: 0 }])}>+ Ajouter</button>}
                </div>
                {retenues.length === 0 && <div className="text-sm text-gray">Aucune retenue supplémentaire.</div>}
                {retenues.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 32px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <input placeholder="Libellé (ex : avance sur salaire)" value={r.libelle} onChange={e => majRetenue(i, 'libelle', e.target.value)} />
                    <input type="number" min="0" value={r.montant} onChange={e => majRetenue(i, 'montant', e.target.value)} />
                    {!lectureSeule && <button className="btn btn-danger btn-sm" onClick={() => setRetenues(x => x.filter((_, j) => j !== i))}>✕</button>}
                  </div>
                ))}
              </div>

              <div className="form-grid form-grid-2">
                <div className="form-group"><label>Mode de paiement</label>
                  <select value={mode} onChange={e => setMode(e.target.value)}>
                    {['virement', 'especes', 'cheque', 'mobile_money'].map(m => <option key={m} value={m}>{MODES_PAIEMENT[m]}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Observations (imprimées sur le bulletin)</label><input value={notes} onChange={e => setNotes(e.target.value)} /></div>
              </div>
            </fieldset>
          </div>

          <div className="card" style={{ padding: 14, background: '#fafffe', alignSelf: 'start', position: 'sticky', top: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 8 }}>Calcul en direct</div>
            <R l={`Salaire de base (${calc.jours_travailles} j)`} v={calc.salaire_base_calcule} />
            {calc.heures_sup_montant > 0 && <R l="Heures sup." v={calc.heures_sup_montant} />}
            {calc.primes_imposables > 0 && <R l="Primes imposables" v={calc.primes_imposables} />}
            {calc.primes_non_imposables > 0 && <R l="Primes non imposables" v={calc.primes_non_imposables} />}
            <R l="SALAIRE BRUT" v={calc.brut} strong />
            <R l={`CNSS ${params.cnss_taux_salarie} %`} v={-calc.cnss_salarie} color="var(--danger)" />
            <R l={`CNAMGS ${params.cnamgs_taux_salarie} %`} v={-calc.cnamgs_salarie} color="var(--danger)" />
            <R l={`IRPP (${calc.nb_parts} part${calc.nb_parts > 1 ? 's' : ''})`} v={-calc.irpp} color="var(--danger)" />
            <R l={`TCS ${params.tcs_taux} %`} v={-calc.tcs} color="var(--danger)" />
            {calc.autres_retenues > 0 && <R l="Autres retenues" v={-calc.autres_retenues} color="var(--danger)" />}
            <R l="NET À PAYER" v={calc.net_a_payer} strong color="var(--teal-dark)" />
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border)', fontSize: 12, color: 'var(--gray)' }}>
              <R l="CNSS patronale" v={calc.cnss_employeur} />
              <R l="CNAMGS patronale" v={calc.cnamgs_employeur} />
              {calc.fnh_employeur > 0 && <R l="FNH" v={calc.fnh_employeur} />}
              <R l="Coût total employeur" v={calc.cout_total} strong />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
          {!lectureSeule && <button className="btn btn-primary" disabled={saving} onClick={enregistrer}>{saving ? 'Enregistrement…' : 'Enregistrer le bulletin'}</button>}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Paramètres de paie (admin)
// ─────────────────────────────────────────────────────────────
function ParametresPaie({ params, onSaved }) {
  const [f, setF] = useState({ ...params, irpp_bareme: Array.isArray(params.irpp_bareme) ? params.irpp_bareme : PARAMS_DEFAUT.irpp_bareme })
  const [saving, setSaving] = useState(false)
  useEffect(() => { setF({ ...params, irpp_bareme: Array.isArray(params.irpp_bareme) ? params.irpp_bareme : PARAMS_DEFAUT.irpp_bareme }) }, [params])

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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <div className="card">
        <div className="card-header"><div className="card-title">Cotisations sociales</div></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grid form-grid-3">
            {champNum('cnss_taux_salarie', "CNSS salarié (%)")}
            {champNum('cnss_taux_employeur', "CNSS employeur (%)")}
            {champNum('cnss_plafond', "Plafond CNSS (FCFA/mois)", '1000')}
            {champNum('cnamgs_taux_salarie', "CNAMGS salarié (%)")}
            {champNum('cnamgs_taux_employeur', "CNAMGS employeur (%)")}
            {champNum('cnamgs_plafond', "Plafond CNAMGS (FCFA/mois)", '1000')}
            {champNum('fnh_taux_employeur', "FNH employeur (%) — 0 si non applicable")}
            {champNum('jours_base', "Jours de base par mois", '1')}
            {champNum('parts_max', "Nombre de parts maximum", '0.5')}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Impôts sur salaire (IRPP & TCS)</div></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grid form-grid-3">
            {champNum('frais_pro_pct', "Abattement frais professionnels (%)")}
            {champNum('tcs_taux', "TCS (%)")}
            {champNum('tcs_seuil_exoneration', "Seuil d'exonération TCS (FCFA/mois)", '1000')}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={f.irpp_actif !== false} onChange={e => set('irpp_actif', e.target.checked)} style={{ width: 'auto' }} />
            Appliquer l'IRPP (retenue à la source)
          </label>
          <div>
            <label style={{ display: 'block', marginBottom: 6 }}>Barème IRPP annuel par part (revenu imposable annuel ÷ nombre de parts)</label>
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
