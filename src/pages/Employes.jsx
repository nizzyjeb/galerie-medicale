import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { fmt, fmtDate } from '../lib/utils'
import { MODES_PAIEMENT, RUBRIQUES, RUBRIQUES_SAISISSABLES, TYPES_RUBRIQUE, SITUATIONS, calculerParts, tauxAnciennete, periodeCourante, PARAMS_DEFAUT } from '../lib/paie'
import toast from 'react-hot-toast'

const TYPES_CONTRAT = ['CDI', 'CDD', 'Stage', 'Prestataire', 'Journalier']

const vide = {
  matricule: '', nom: '', prenom: '', poste: '', departement: '', section: '', service: '',
  classification: '', categorie: '', date_naissance: '', sexe: 'M', nationalite: 'GAB',
  regime: 'G', statut_salarie: 'E',
  type_contrat: 'CDI', date_embauche: '', date_fin: '',
  salaire_base: '', rubriques: [], cumuls_reprise: null,
  situation_familiale: 'celibataire', nb_enfants: 0, nb_parts_force: '',
  cnss_numero: '', cnamgs_numero: '', nif: '',
  telephone: '', email: '', adresse: '',
  banque: '', compte_bancaire: '', mode_paiement: 'virement',
  user_id: '', actif: true, notes: '',
}

const num = (v) => v === '' || v == null ? 0 : Number(v)

export default function Employes() {
  const { isManager: isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [profils, setProfils] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(vide)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [voirInactifs, setVoirInactifs] = useState(false)

  const charger = async () => {
    setLoading(true)
    const [{ data, error }, { data: prof }] = await Promise.all([
      supabase.from('employes').select('*').order('nom', { ascending: true }),
      supabase.from('profiles').select('id, nom, email').order('nom'),
    ])
    if (error) toast.error('Erreur de chargement des employés')
    setItems(data || [])
    setProfils(prof || [])
    setLoading(false)
  }

  useEffect(() => { charger() }, [])

  const prochainMatricule = () => {
    const nums = items.map(e => parseInt(String(e.matricule || '').replace(/\D/g, ''), 10)).filter(x => !isNaN(x))
    const max = nums.length ? Math.max(...nums) : 0
    return 'EMP-' + String(max + 1).padStart(3, '0')
  }

  const ouvrirCreation = () => { setForm({ ...vide, matricule: prochainMatricule() }); setEditId(null); setModal(true) }
  const ouvrirEdition = (e) => {
    const f = { ...vide }
    Object.keys(vide).forEach(k => { f[k] = e[k] ?? vide[k] })
    f.rubriques = Array.isArray(e.rubriques) ? e.rubriques.map(r => ({ ...r })) : []
    if (!f.rubriques.length) {
      if (num(e.prime_transport) > 0) f.rubriques.push({ code: '620', montant: num(e.prime_transport) })
      if (num(e.prime_logement) > 0) f.rubriques.push({ code: '225', montant: num(e.prime_logement) })
      if (num(e.prime_autres) > 0) f.rubriques.push({ code: '260', montant: num(e.prime_autres) })
    }
    f.nb_parts_force = e.nb_parts_force ?? ''
    f.user_id = e.user_id || ''
    f.actif = e.actif !== false
    setForm(f); setEditId(e.id); setModal(true)
  }

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const enregistrer = async () => {
    if (!form.nom.trim()) { toast.error("Le nom de l'employé est requis"); return }
    if (!form.poste.trim()) { toast.error('Le poste est requis'); return }
    setSaving(true)
    const payload = {
      ...form,
      matricule: form.matricule.trim() || null,
      date_embauche: form.date_embauche || null,
      date_fin: form.date_fin || null,
      salaire_base: num(form.salaire_base),
      date_naissance: form.date_naissance || null,
      rubriques: (form.rubriques || []).filter(r => r.code && num(r.montant) > 0).map(r => ({ code: r.code, montant: num(r.montant), ...(r.libelle && r.libelle !== RUBRIQUES[r.code]?.libelle ? { libelle: r.libelle } : {}) })),
      nb_parts_force: form.nb_parts_force === '' || form.nb_parts_force == null ? null : num(form.nb_parts_force),
      cumuls_reprise: form.cumuls_reprise && Object.entries(form.cumuls_reprise).some(([k, v]) => !['annee', 'jusqua'].includes(k) && num(v) > 0)
        ? Object.fromEntries(Object.entries(form.cumuls_reprise).map(([k, v]) => [k, ['annee', 'jusqua'].includes(k) ? v : num(v)]))
        : null,
      nb_enfants: parseInt(form.nb_enfants || 0, 10),
      user_id: form.user_id || null,
      updated_at: new Date().toISOString(),
    }
    let error
    if (editId) ({ error } = await supabase.from('employes').update(payload).eq('id', editId))
    else ({ error } = await supabase.from('employes').insert(payload))
    setSaving(false)
    if (error) { toast.error(error.message?.includes('matricule') ? 'Ce matricule existe déjà' : "Erreur lors de l'enregistrement"); return }
    toast.success(editId ? 'Employé modifié' : 'Employé créé')
    setModal(false)
    charger()
  }

  const basculerActif = async (e) => {
    const { error } = await supabase.from('employes').update({ actif: !e.actif, updated_at: new Date().toISOString() }).eq('id', e.id)
    if (error) { toast.error('Modification impossible'); return }
    toast.success(e.actif ? 'Employé désactivé' : 'Employé réactivé')
    charger()
  }

  const supprimer = async (e) => {
    if (!window.confirm(`Supprimer définitivement « ${e.nom} ${e.prenom || ''} » ?\nLes bulletins de paie existants seront conservés.`)) return
    const { error } = await supabase.from('employes').delete().eq('id', e.id)
    if (error) { toast.error('Suppression impossible'); return }
    toast.success('Employé supprimé')
    charger()
  }

  const filtres = useMemo(() => items.filter(e => {
    if (!voirInactifs && e.actif === false) return false
    const t = recherche.toLowerCase()
    return !t || [e.nom, e.prenom, e.poste, e.departement, e.matricule].some(x => (x || '').toLowerCase().includes(t))
  }), [items, recherche, voirInactifs])

  const actifs = items.filter(e => e.actif !== false)
  const totalRubriques = (e) => (Array.isArray(e.rubriques) ? e.rubriques : []).filter(r => RUBRIQUES[r.code]?.type !== 'R').reduce((s, r) => s + num(r.montant), 0)
  const masseSalariale = actifs.reduce((s, e) => s + num(e.salaire_base) + totalRubriques(e), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Employés</h1>
          <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4 }}>
            {actifs.length} employé{actifs.length > 1 ? 's' : ''} actif{actifs.length > 1 ? 's' : ''} · masse salariale brute mensuelle : <strong>{fmt(masseSalariale)}</strong>
          </div>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={ouvrirCreation}>+ Nouvel employé</button>}
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input placeholder="Rechercher (nom, poste, matricule…)" value={recherche} onChange={e => setRecherche(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={voirInactifs} onChange={e => setVoirInactifs(e.target.checked)} style={{ width: 'auto' }} />
          Afficher les inactifs
        </label>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>
        ) : filtres.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Aucun employé.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Employé</th>
                  <th>Poste</th>
                  <th>Contrat</th>
                  <th>Embauche</th>
                  <th style={{ textAlign: 'right' }}>Salaire de base</th>
                  <th>Paiement</th>
                  <th>Statut</th>
                  {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtres.map(e => (
                  <tr key={e.id} style={{ opacity: e.actif === false ? .55 : 1 }}>
                    <td className="font-mono text-sm">{e.matricule || '—'}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{e.nom} {e.prenom}</div>
                      <div className="text-xs text-gray">{e.telephone || e.email || ''}</div>
                    </td>
                    <td>
                      <div>{e.poste}</div>
                      <div className="text-xs text-gray">{e.departement || ''}</div>
                    </td>
                    <td>{e.type_contrat}</td>
                    <td>{fmtDate(e.date_embauche)}</td>
                    <td className="font-mono text-right">{fmt(e.salaire_base)}</td>
                    <td className="text-sm">{MODES_PAIEMENT[e.mode_paiement] || e.mode_paiement}</td>
                    <td>
                      <span className="badge" style={{ background: e.actif === false ? '#f9fafb' : '#f0fdf4', color: e.actif === false ? '#6b7280' : '#166534' }}>
                        {e.actif === false ? 'Inactif' : 'Actif'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => ouvrirEdition(e)}>Modifier</button>{' '}
                        <button className="btn btn-ghost btn-sm" onClick={() => basculerActif(e)}>{e.actif === false ? 'Réactiver' : 'Désactiver'}</button>{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => supprimer(e)}>Supprimer</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" style={{ width: 760 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="card-title">{editId ? "Modifier l'employé" : 'Nouvel employé'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              <Section titre="Identité & poste">
                <div className="form-grid form-grid-3">
                  <Champ label="Matricule"><input value={form.matricule} onChange={e => set('matricule', e.target.value)} /></Champ>
                  <Champ label="Nom *"><input value={form.nom} onChange={e => set('nom', e.target.value)} /></Champ>
                  <Champ label="Prénom"><input value={form.prenom} onChange={e => set('prenom', e.target.value)} /></Champ>
                  <Champ label="Date de naissance"><input type="date" value={form.date_naissance || ''} onChange={e => set('date_naissance', e.target.value)} /></Champ>
                  <Champ label="Sexe">
                    <select value={form.sexe || 'M'} onChange={e => set('sexe', e.target.value)}><option value="M">Masculin</option><option value="F">Féminin</option></select>
                  </Champ>
                  <Champ label="Nationalité (code)"><input value={form.nationalite || ''} onChange={e => set('nationalite', e.target.value.toUpperCase())} placeholder="GAB" /></Champ>
                  <Champ label="Emploi / poste *"><input value={form.poste} onChange={e => set('poste', e.target.value)} placeholder="Ex : Directeur admin et fin" /></Champ>
                  <Champ label="Classification"><input value={form.classification || ''} onChange={e => set('classification', e.target.value)} placeholder="Ex : 900 1" /></Champ>
                  <Champ label="Catégorie"><input value={form.categorie || ''} onChange={e => set('categorie', e.target.value)} /></Champ>
                  <Champ label="Département"><input value={form.departement} onChange={e => set('departement', e.target.value)} /></Champ>
                  <Champ label="Section"><input value={form.section || ''} onChange={e => set('section', e.target.value)} /></Champ>
                  <Champ label="Service"><input value={form.service || ''} onChange={e => set('service', e.target.value)} /></Champ>
                  <Champ label="Type de contrat">
                    <select value={form.type_contrat} onChange={e => set('type_contrat', e.target.value)}>
                      {TYPES_CONTRAT.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Champ>
                  <Champ label="Date d'entrée"><input type="date" value={form.date_embauche || ''} onChange={e => set('date_embauche', e.target.value)} /></Champ>
                  <Champ label="Fin de contrat (si CDD)"><input type="date" value={form.date_fin || ''} onChange={e => set('date_fin', e.target.value)} /></Champ>
                  <Champ label="Régime"><input value={form.regime || ''} onChange={e => set('regime', e.target.value.toUpperCase())} placeholder="G (général)" /></Champ>
                  <Champ label="Statut"><input value={form.statut_salarie || ''} onChange={e => set('statut_salarie', e.target.value.toUpperCase())} placeholder="E (employé), C (cadre)…" /></Champ>
                  <Champ label="Compte utilisateur lié">
                    <select value={form.user_id} onChange={e => set('user_id', e.target.value)}>
                      <option value="">— Aucun —</option>
                      {profils.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.email})</option>)}
                    </select>
                  </Champ>
                </div>
              </Section>

              <Section titre="Rémunération mensuelle (FCFA) — rubriques du bulletin">
                <RubriquesFixes form={form} set={set} />
              </Section>

              <Section titre="Situation fiscale & sociale">
                <div className="form-grid form-grid-3">
                  <Champ label="Situation familiale">
                    <select value={form.situation_familiale} onChange={e => set('situation_familiale', e.target.value)}>
                      {Object.entries(SITUATIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </Champ>
                  <Champ label="Enfants à charge"><input type="number" min="0" max="12" value={form.nb_enfants} onChange={e => set('nb_enfants', e.target.value)} /></Champ>
                  <Champ label={`Nombre de parts IRPP (auto : ${calculerParts({ ...form, nb_parts_force: null }, PARAMS_DEFAUT)})`}>
                    <input type="number" step="0.5" min="1" max="6" value={form.nb_parts_force ?? ''} onChange={e => set('nb_parts_force', e.target.value)} placeholder="Laisser vide = automatique" />
                  </Champ>
                  <Champ label="N° CNSS"><input value={form.cnss_numero} onChange={e => set('cnss_numero', e.target.value)} /></Champ>
                  <Champ label="N° CNAMGS"><input value={form.cnamgs_numero} onChange={e => set('cnamgs_numero', e.target.value)} /></Champ>
                  <Champ label="NIF"><input value={form.nif} onChange={e => set('nif', e.target.value)} /></Champ>
                </div>
              </Section>

              <Section titre="Cumuls antérieurs (reprise d'un ancien logiciel de paie)">
                <CumulsReprise form={form} set={set} />
              </Section>

              <Section titre="Contact & paiement">
                <div className="form-grid form-grid-3">
                  <Champ label="Téléphone"><input value={form.telephone} onChange={e => set('telephone', e.target.value)} /></Champ>
                  <Champ label="Email"><input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Champ>
                  <Champ label="Mode de paiement">
                    <select value={form.mode_paiement} onChange={e => set('mode_paiement', e.target.value)}>
                      {['especes', 'virement', 'cheque', 'mobile_money'].map(m => <option key={m} value={m}>{MODES_PAIEMENT[m]}</option>)}
                    </select>
                  </Champ>
                  <Champ label="Banque"><input value={form.banque} onChange={e => set('banque', e.target.value)} /></Champ>
                  <Champ label="N° de compte / IBAN / Mobile Money"><input value={form.compte_bancaire} onChange={e => set('compte_bancaire', e.target.value)} /></Champ>
                  <Champ label="Adresse"><input value={form.adresse} onChange={e => set('adresse', e.target.value)} /></Champ>
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <input type="checkbox" checked={form.actif} onChange={e => set('actif', e.target.checked)} style={{ width: 'auto' }} />
                  Employé actif (inclus dans la génération de la paie)
                </label>
              </Section>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Annuler</button>
              <button className="btn btn-primary" disabled={saving} onClick={enregistrer}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RubriquesFixes({ form, set }) {
  const rubriques = form.rubriques || []
  const maj = (i, k, v) => set('rubriques', rubriques.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const anc = tauxAnciennete(form.date_embauche, periodeCourante(), PARAMS_DEFAUT)
  const soumis = num(form.salaire_base) * (1 + anc / 100) + rubriques.filter(r => RUBRIQUES[r.code]?.type === 'S').reduce((s, r) => s + num(r.montant), 0)
  const nonSoumis = rubriques.filter(r => RUBRIQUES[r.code]?.type === 'N').reduce((s, r) => s + num(r.montant), 0)
  return (
    <div>
      <div className="form-grid form-grid-3" style={{ marginBottom: 10 }}>
        <Champ label="100 · Salaire de base (pour 30 jours)"><input type="number" min="0" value={form.salaire_base} onChange={e => set('salaire_base', e.target.value)} /></Champ>
        <Champ label="200 · Ancienneté (automatique)"><input disabled value={form.date_embauche ? `${anc} % ce mois-ci` : 'Renseignez la date d\'entrée'} /></Champ>
      </div>
      <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 6 }}>Primes et indemnités fixes, reprises automatiquement sur chaque bulletin (ajustables mois par mois) :</div>
      {rubriques.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 130px 32px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <select value={r.code} onChange={e => maj(i, 'code', e.target.value)}>
            {RUBRIQUES_SAISISSABLES.map(([code, d]) => <option key={code} value={code}>{code} · {d.libelle}</option>)}
          </select>
          <input type="number" min="0" placeholder="Montant mensuel" value={r.montant ?? ''} onChange={e => maj(i, 'montant', e.target.value)} />
          <span className="badge" style={{ textAlign: 'center', background: RUBRIQUES[r.code]?.type === 'S' ? '#eff6ff' : RUBRIQUES[r.code]?.type === 'N' ? '#f0fdf4' : '#fef2f2', color: RUBRIQUES[r.code]?.type === 'S' ? '#1e40af' : RUBRIQUES[r.code]?.type === 'N' ? '#166534' : '#991b1b' }}>
            {TYPES_RUBRIQUE[RUBRIQUES[r.code]?.type] || ''}
          </span>
          <button className="btn btn-danger btn-sm" onClick={() => set('rubriques', rubriques.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => set('rubriques', [...rubriques, { code: '205', montant: '' }])}>+ Ajouter une prime / indemnité</button>
      <div className="alert alert-info" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
        Brut soumis estimé : <strong>{fmt(soumis)}</strong> · indemnités non soumises : <strong>{fmt(nonSoumis)}</strong>. Les « gains soumis » entrent dans la base CNSS, CNAMGS, TCS et IRPP ; les « indemnités non soumises » (entretien véhicule, panier…) s'ajoutent au net sans cotisations.
      </div>
    </div>
  )
}

function CumulsReprise({ form, set }) {
  const c = form.cumuls_reprise || { annee: new Date().getFullYear(), jusqua: '', brut: '', jours: '', cnss: '', cnamgs: '', tcs: '', irpp: '', net: '' }
  const maj = (k, v) => set('cumuls_reprise', { ...c, [k]: v })
  const champs = [['brut', 'Salaire brut'], ['jours', 'Jours CNSS'], ['cnss', 'Retenue CNSS'], ['cnamgs', 'Retenue CNAMGS'], ['tcs', 'Retenue TCS'], ['irpp', 'Retenue IRPP'], ['net', 'Net payé']]
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 8 }}>
        Facultatif : si ce salarié était payé avec un autre logiciel en début d'année, saisissez ici les cumuls figurant sur son dernier bulletin (bloc « CUMULS »). Ils seront ajoutés aux cumuls imprimés sur les bulletins de la même année.
      </div>
      <div className="form-grid form-grid-3">
        <Champ label="Année"><input type="number" value={c.annee ?? ''} onChange={e => maj('annee', e.target.value)} /></Champ>
        <Champ label="Jusqu'au mois inclus"><input type="month" value={c.jusqua || ''} onChange={e => maj('jusqua', e.target.value)} /></Champ>
        {champs.map(([k, l]) => <Champ key={k} label={l}><input type="number" min="0" value={c[k] ?? ''} onChange={e => maj(k, e.target.value)} /></Champ>)}
      </div>
    </div>
  )
}

function Section({ titre, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>{titre}</div>
      {children}
    </div>
  )
}

function Champ({ label, children }) {
  return <div className="form-group"><label>{label}</label>{children}</div>
}
