import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { ACTIONS, DetailEvenement, fmtDateHeure, regrouperEvenements } from '../components/Tracabilite'

// Journal d'activité : toutes les créations, modifications, validations et suppressions
// de factures et pro formas, avec l'auteur et l'heure exacte.

const isoJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Journal() {
  const [evts, setEvts] = useState([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [du, setDu] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return isoJour(d) })
  const [au, setAu] = useState(() => isoJour(new Date()))
  const [utilisateur, setUtilisateur] = useState('')
  const [action, setAction] = useState('')
  const [recherche, setRecherche] = useState('')

  useEffect(() => {
    setLoading(true)
    const fin = new Date(au + 'T00:00:00'); fin.setDate(fin.getDate() + 1)
    supabase.from('document_historique')
      .select('*')
      .gte('created_at', new Date(du + 'T00:00:00').toISOString())
      .lt('created_at', fin.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(2000)
      .then(({ data, error }) => {
        if (error) setErreur(error.message)
        else { setErreur(null); setEvts(regrouperEvenements(data || []).reverse()) }
        setLoading(false)
      })
  }, [du, au])

  const utilisateurs = useMemo(() => [...new Set(evts.map(e => e.utilisateur_nom).filter(Boolean))].sort(), [evts])

  const filtres = evts.filter(e =>
    (!utilisateur || e.utilisateur_nom === utilisateur) &&
    (!action || e.action === action || (action === 'lignes' && e.action.startsWith('lignes'))) &&
    (!recherche || (e.numero || '').toLowerCase().includes(recherche.toLowerCase()))
  )

  const champ = { fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff' }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Journal d'activité</h1>
        <div style={{ fontSize: 13, color: 'var(--gray)', marginTop: 4 }}>
          Qui a créé, modifié, validé ou supprimé une facture ou une pro forma, et à quelle heure.
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: 'var(--gray)' }}>Du <input type="date" value={du} onChange={e => setDu(e.target.value)} style={champ} /></label>
        <label style={{ fontSize: 12, color: 'var(--gray)' }}>au <input type="date" value={au} onChange={e => setAu(e.target.value)} style={champ} /></label>
        <select value={utilisateur} onChange={e => setUtilisateur(e.target.value)} style={champ}>
          <option value="">Tous les utilisateurs</option>
          {utilisateurs.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={action} onChange={e => setAction(e.target.value)} style={champ}>
          <option value="">Toutes les actions</option>
          <option value="creation">Créations</option>
          <option value="modification">Modifications</option>
          <option value="lignes">Lignes modifiées</option>
          <option value="validation">Validations</option>
          <option value="statut">Changements de statut</option>
          <option value="suppression">Suppressions</option>
        </select>
        <input placeholder="N° de document" value={recherche} onChange={e => setRecherche(e.target.value)} style={{ ...champ, width: 160 }} />
        <span style={{ fontSize: 12, color: 'var(--gray)', marginLeft: 'auto' }}>{filtres.length} événement(s)</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date et heure</th><th>Utilisateur</th><th>Action</th><th>Document</th><th>Détail</th></tr>
            </thead>
            <tbody>
              {erreur ? (
                <tr><td colSpan={5} style={{ padding: 30, color: '#991b1b' }}>
                  Journal indisponible : la mise à jour de la base de données (traçabilité) n'a pas encore été appliquée.
                </td></tr>
              ) : loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Chargement...</td></tr>
              ) : filtres.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>Aucun événement sur cette période</td></tr>
              ) : filtres.map(e => {
                const a = ACTIONS[e.action] || { label: e.action, icon: '•', color: 'var(--gray)', bg: 'var(--lgray)' }
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateHeure(e.created_at)}</td>
                    <td style={{ fontWeight: 500 }}>{e.utilisateur_nom || '—'}</td>
                    <td><span className="badge" style={{ background: a.bg, color: a.color, whiteSpace: 'nowrap' }}>{a.icon} {a.label}</span></td>
                    <td>
                      <div className="font-mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{e.numero || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray)' }}>{e.type_document === 'proforma' ? 'Pro Forma' : 'Facture'}</div>
                    </td>
                    <td style={{ maxWidth: 420 }}><DetailEvenement e={e} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
