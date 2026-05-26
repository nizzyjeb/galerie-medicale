import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { exportPresencesExcel } from '../lib/exportExcel'
import toast from 'react-hot-toast'

const HEURE_STANDARD = '08:00'

const fmtHeure = (d) => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'
const fmtJour = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

function calcHeuresTravaillees(arrivee, depart) {
  if (!arrivee || !depart) return null
  const ms = new Date(depart.heure) - new Date(arrivee.heure)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${String(m).padStart(2, '0')}`
}

export default function Presences() {
  const { isAdmin } = useAuth()
  const [dateSelectionnee, setDateSelectionnee] = useState(new Date().toISOString().split('T')[0])
  const [tousProfils, setTousProfils] = useState([])
  const [pointages, setPointages] = useState([])
  const [loading, setLoading] = useState(true)
  const [vue, setVue] = useState('jour') // 'jour' | 'mois'
  const [moisSelectionne, setMoisSelectionne] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => {
    if (!isAdmin) return
    if (vue === 'jour') chargerJour()
    else chargerMois()
  }, [dateSelectionnee, moisSelectionne, vue, isAdmin])

  const chargerJour = async () => {
    setLoading(true)
    const [{ data: profs }, { data: pts }] = await Promise.all([
      supabase.from('profiles').select('id, nom, email, role').order('nom'),
      supabase.from('pointages').select('*').eq('date_jour', dateSelectionnee).order('heure')
    ])
    setTousProfils(profs || [])
    setPointages(pts || [])
    setLoading(false)
  }

  const chargerMois = async () => {
    setLoading(true)
    const debut = `${moisSelectionne}-01`
    const finDate = new Date(moisSelectionne + '-01')
    finDate.setMonth(finDate.getMonth() + 1)
    const fin = finDate.toISOString().split('T')[0]

    const [{ data: profs }, { data: pts }] = await Promise.all([
      supabase.from('profiles').select('id, nom, email, role').order('nom'),
      supabase.from('pointages').select('*').gte('date_jour', debut).lt('date_jour', fin).order('date_jour, heure')
    ])
    setTousProfils(profs || [])
    setPointages(pts || [])
    setLoading(false)
  }

  if (!isAdmin) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 10 }}>⛔ Accès refusé</h2>
        <p style={{ color: 'var(--gray)' }}>Cette page est réservée aux administrateurs.</p>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // VUE JOUR
  // ═══════════════════════════════════════════════════════════════
  const renderJour = () => {
    const parUser = {}
    pointages.forEach(p => {
      if (!parUser[p.user_id]) parUser[p.user_id] = { arrivee: null, depart: null }
      parUser[p.user_id][p.type] = p
    })

    const present = tousProfils.filter(p => parUser[p.id]?.arrivee).length
    const parti = tousProfils.filter(p => parUser[p.id]?.depart).length
    const absent = tousProfils.length - present
    const retardataires = tousProfils.filter(p => (parUser[p.id]?.arrivee?.retard_minutes || 0) > 0).length

    return (
      <>
        {/* STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center', borderTop: '3px solid #16a34a' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{present}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>Présents</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center', borderTop: '3px solid #dc2626' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>{absent}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>Absents</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center', borderTop: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{retardataires}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>Retards</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center', borderTop: '3px solid #6b7280' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#6b7280' }}>{parti}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>Déjà partis</div>
          </div>
        </div>

        {/* TABLEAU */}
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employé</th>
                  <th>Rôle</th>
                  <th>Arrivée</th>
                  <th>Retard</th>
                  <th>Départ</th>
                  <th>Heures travaillées</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>Chargement...</td></tr>
                ) : tousProfils.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>Aucun employé</td></tr>
                ) : tousProfils.map(prof => {
                  const data = parUser[prof.id] || {}
                  const a = data.arrivee
                  const d = data.depart
                  return (
                    <tr key={prof.id}>
                      <td style={{ fontWeight: 500 }}>{prof.nom || prof.email}</td>
                      <td style={{ color: 'var(--gray)', textTransform: 'capitalize' }}>{prof.role}</td>
                      <td className="font-mono">{a ? fmtHeure(a.heure) : '—'}</td>
                      <td>
                        {a?.retard_minutes > 0 ? (
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>{a.retard_minutes} min</span>
                        ) : a ? (
                          <span style={{ color: '#16a34a' }}>À l'heure</span>
                        ) : '—'}
                      </td>
                      <td className="font-mono">{d ? fmtHeure(d.heure) : '—'}</td>
                      <td className="font-mono">{calcHeuresTravaillees(a, d) || '—'}</td>
                      <td>
                        {!a ? (
                          <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>Absent</span>
                        ) : d ? (
                          <span className="badge" style={{ background: '#e5e7eb', color: '#374151' }}>Parti</span>
                        ) : (
                          <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>Présent</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // VUE MOIS
  // ═══════════════════════════════════════════════════════════════
  const renderMois = () => {
    // Regrouper par user puis par date
    const recap = {}
    tousProfils.forEach(prof => {
      recap[prof.id] = {
        profil: prof,
        jours: {},
        totalJoursPresents: 0,
        totalRetards: 0,
        totalMinutesRetard: 0
      }
    })

    pointages.forEach(p => {
      if (!recap[p.user_id]) return
      if (!recap[p.user_id].jours[p.date_jour]) {
        recap[p.user_id].jours[p.date_jour] = { arrivee: null, depart: null }
      }
      recap[p.user_id].jours[p.date_jour][p.type] = p
    })

    // Calculer totaux
    Object.values(recap).forEach(r => {
      Object.values(r.jours).forEach(j => {
        if (j.arrivee) {
          r.totalJoursPresents++
          if (j.arrivee.retard_minutes > 0) {
            r.totalRetards++
            r.totalMinutesRetard += j.arrivee.retard_minutes
          }
        }
      })
    })

    return (
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th>Rôle</th>
                <th style={{ textAlign: 'center' }}>Jours présents</th>
                <th style={{ textAlign: 'center' }}>Retards</th>
                <th style={{ textAlign: 'center' }}>Total retards</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>Chargement...</td></tr>
              ) : Object.values(recap).map(r => (
                <tr key={r.profil.id}>
                  <td style={{ fontWeight: 500 }}>{r.profil.nom || r.profil.email}</td>
                  <td style={{ color: 'var(--gray)', textTransform: 'capitalize' }}>{r.profil.role}</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.totalJoursPresents}</td>
                  <td style={{ textAlign: 'center' }}>
                    {r.totalRetards > 0 ? (
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>{r.totalRetards}</span>
                    ) : '0'}
                  </td>
                  <td style={{ textAlign: 'center', color: r.totalMinutesRetard > 0 ? '#dc2626' : 'inherit' }}>
                    {r.totalMinutesRetard > 0 ? `${r.totalMinutesRetard} min` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const exportExcel = () => {
    try {
      if (vue === 'jour') {
        exportPresencesExcel(tousProfils, pointages, dateSelectionnee, 'jour')
      } else {
        exportPresencesExcel(tousProfils, pointages, moisSelectionne, 'mois')
      }
      toast.success('Export Excel généré')
    } catch (e) {
      toast.error('Erreur export : ' + e.message)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>👥 Présences</h1>
        <button className="btn btn-ghost" onClick={exportExcel}>📥 Export Excel</button>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--lgray)', padding: 4, borderRadius: 10, marginBottom: 20, width: 'fit-content' }}>
        {[['jour', '📅 Vue journée'], ['mois', '📊 Vue mois']].map(([val, label]) => (
          <button key={val} onClick={() => setVue(val)} style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: vue === val ? '#fff' : 'transparent',
            color: vue === val ? 'var(--text)' : 'var(--gray)',
            boxShadow: vue === val ? 'var(--shadow-sm)' : 'none'
          }}>{label}</button>
        ))}
      </div>

      {/* Sélecteur date */}
      <div className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        {vue === 'jour' ? (
          <>
            <label style={{ fontWeight: 500 }}>Date :</label>
            <input
              type="date"
              value={dateSelectionnee}
              onChange={e => setDateSelectionnee(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6 }}
            />
            <span style={{ color: 'var(--gray)', textTransform: 'capitalize', marginLeft: 'auto' }}>
              {fmtJour(dateSelectionnee)}
            </span>
          </>
        ) : (
          <>
            <label style={{ fontWeight: 500 }}>Mois :</label>
            <input
              type="month"
              value={moisSelectionne}
              onChange={e => setMoisSelectionne(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6 }}
            />
          </>
        )}
      </div>

      {vue === 'jour' ? renderJour() : renderMois()}
    </div>
  )
}
