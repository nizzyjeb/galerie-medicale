import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { fmt, fmtDate } from '../lib/utils'
import { MODES_PAIEMENT } from '../lib/paie'
import toast from 'react-hot-toast'

const TYPES_CONTRAT = ['CDI', 'CDD', 'Stage', 'Prestataire', 'Journalier']

const vide = {
  matricule: '', nom: '', prenom: '', poste: '', departement: '',
  type_contrat: 'CDI', date_embauche: '', date_fin: '',
  salaire_base: '', prime_transport: '', prime_logement: '', prime_autres: '',
  situation_familiale: 'celibataire', nb_enfants: 0,
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
      prime_transport: num(form.prime_transport),
      prime_logement: num(form.prime_logement),
      prime_autres: num(form.prime_autres),
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
  const masseSalariale = actifs.reduce((s, e) => s + num(e.salaire_base) + num(e.prime_transport) + num(e.prime_logement) + num(e.prime_autres), 0)

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
                  <Champ label="Poste *"><input value={form.poste} onChange={e => set('poste', e.target.value)} placeholder="Ex : Commercial, Comptable…" /></Champ>
                  <Champ label="Département"><input value={form.departement} onChange={e => set('departement', e.target.value)} placeholder="Ex : Ventes, Logistique…" /></Champ>
                  <Champ label="Type de contrat">
                    <select value={form.type_contrat} onChange={e => set('type_contrat', e.target.value)}>
                      {TYPES_CONTRAT.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Champ>
                  <Champ label="Date d'embauche"><input type="date" value={form.date_embauche || ''} onChange={e => set('date_embauche', e.target.value)} /></Champ>
                  <Champ label="Fin de contrat (si CDD)"><input type="date" value={form.date_fin || ''} onChange={e => set('date_fin', e.target.value)} /></Champ>
                  <Champ label="Compte utilisateur lié">
                    <select value={form.user_id} onChange={e => set('user_id', e.target.value)}>
                      <option value="">— Aucun —</option>
                      {profils.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.email})</option>)}
                    </select>
                  </Champ>
                </div>
              </Section>

              <Section titre="Rémunération mensuelle (FCFA)">
                <div className="form-grid form-grid-2">
                  <Champ label="Salaire de base"><input type="number" min="0" value={form.salaire_base} onChange={e => set('salaire_base', e.target.value)} /></Champ>
                  <Champ label="Prime de transport"><input type="number" min="0" value={form.prime_transport} onChange={e => set('prime_transport', e.target.value)} /></Champ>
                  <Champ label="Indemnité de logement"><input type="number" min="0" value={form.prime_logement} onChange={e => set('prime_logement', e.target.value)} /></Champ>
                  <Champ label="Autres primes fixes"><input type="number" min="0" value={form.prime_autres} onChange={e => set('prime_autres', e.target.value)} /></Champ>
                </div>
                <div className="alert alert-info" style={{ marginTop: 12, marginBottom: 0 }}>
                  Brut mensuel estimé : <strong>{fmt(num(form.salaire_base) + num(form.prime_transport) + num(form.prime_logement) + num(form.prime_autres))}</strong>. Les primes fixes sont reprises automatiquement sur chaque bulletin et peuvent être ajustées mois par mois.
                </div>
              </Section>

              <Section titre="Situation fiscale & sociale">
                <div className="form-grid form-grid-3">
                  <Champ label="Situation familiale">
                    <select value={form.situation_familiale} onChange={e => set('situation_familiale', e.target.value)}>
                      <option value="celibataire">Célibataire</option>
                      <option value="marie">Marié(e)</option>
                    </select>
                  </Champ>
                  <Champ label="Enfants à charge"><input type="number" min="0" max="12" value={form.nb_enfants} onChange={e => set('nb_enfants', e.target.value)} /></Champ>
                  <Champ label="NIF"><input value={form.nif} onChange={e => set('nif', e.target.value)} /></Champ>
                  <Champ label="N° CNSS"><input value={form.cnss_numero} onChange={e => set('cnss_numero', e.target.value)} /></Champ>
                  <Champ label="N° CNAMGS"><input value={form.cnamgs_numero} onChange={e => set('cnamgs_numero', e.target.value)} /></Champ>
                </div>
              </Section>

              <Section titre="Contact & paiement">
                <div className="form-grid form-grid-3">
                  <Champ label="Téléphone"><input value={form.telephone} onChange={e => set('telephone', e.target.value)} /></Champ>
                  <Champ label="Email"><input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Champ>
                  <Champ label="Mode de paiement">
                    <select value={form.mode_paiement} onChange={e => set('mode_paiement', e.target.value)}>
                      {['virement', 'especes', 'cheque', 'mobile_money'].map(m => <option key={m} value={m}>{MODES_PAIEMENT[m]}</option>)}
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
