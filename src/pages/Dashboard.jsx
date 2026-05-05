import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, fmtDate, STATUTS_FACTURE, STATUTS_BL } from '../lib/utils'
import { useAuth } from '../hooks/useAuth'

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ factures: 0, ca: 0, bls: 0, produits: 0 })
  const [dernFact, setDernFact] = useState([])
  const [dernBL, setDernBL] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    const [{ data: factures }, { data: bls }, { count: prodCount }] = await Promise.all([
      supabase.from('factures').select('*').order('created_at', { ascending: false }),
      supabase.from('bons_livraison').select('*').order('created_at', { ascending: false }).limit(5),
      supabase.from('produits').select('*', { count: 'exact', head: true }),
    ])

    const facturesReel = (factures || []).filter(f => f.type === 'facture')
    const ca = facturesReel.filter(f => f.statut === 'payee').reduce((s, f) => s + (f.total_ttc || 0), 0)

    setStats({
      factures: facturesReel.length,
      ca,
      bls: (bls || []).filter(b => b.statut !== 'complet').length,
      produits: prodCount || 0,
    })
    setDernFact((factures || []).slice(0, 6))
    setDernBL(bls || [])
    setLoading(false)
  }

  if (loading) return <div style={{ color:'var(--gray)', padding:40, textAlign:'center' }}>Chargement...</div>

  const greet = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bonjour'
    if (h < 18) return 'Bon après-midi'
    return 'Bonsoir'
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize:20, fontWeight:600, marginBottom:4 }}>{greet()}, {profile?.nom?.split(' ')[0]} 👋</h1>
        <p style={{ color:'var(--gray)', fontSize:13 }}>Voici un aperçu de l'activité de la Galerie Médicale</p>
      </div>

      <div className="stats-grid">
        {[
          { label:'Factures émises', value: stats.factures, sub:'total', fill: 70 },
          { label:'CA encaissé (FCFA)', value: stats.ca >= 1e6 ? (stats.ca/1e6).toFixed(1)+'M' : Math.round(stats.ca).toLocaleString('fr-FR'), sub:'factures payées', fill: 55 },
          { label:'Livraisons en cours', value: stats.bls, sub:'à traiter', fill: 40, warn: stats.bls > 0 },
          { label:'Références catalogue', value: stats.produits, sub:'produits actifs', fill: 30 },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.warn ? 'var(--warn)' : 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize:11, color:'var(--gray)', marginTop:4 }}>{s.sub}</div>
            <div className="stat-bar">
              <div className="stat-bar-fill" style={{ width:`${s.fill}%`, background: s.warn ? 'var(--warn)' : 'var(--teal)' }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Dernières factures</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/factures')}>Voir tout</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>N°</th><th>Client</th><th>Date</th><th>TTC</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {dernFact.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign:'center', padding:32, color:'var(--gray)' }}>Aucune facture</td></tr>
                ) : dernFact.map(f => {
                  const st = STATUTS_FACTURE[f.statut] || STATUTS_FACTURE.attente
                  return (
                    <tr key={f.id}>
                      <td className="font-mono" style={{ color:'var(--teal)', fontWeight:600 }}>{f.numero}</td>
                      <td>{f.client_nom}</td>
                      <td style={{ color:'var(--gray)' }}>{fmtDate(f.date_emission)}</td>
                      <td className="font-mono" style={{ fontWeight:600 }}>{fmt(f.total_ttc)}</td>
                      <td><span className="badge" style={{ background:st.bg, color:st.color }}>{st.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Livraisons récentes</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/livraison')}>Voir tout</button>
          </div>
          <div style={{ padding:'8px 0' }}>
            {dernBL.length === 0 ? (
              <div style={{ padding:'24px 20px', color:'var(--gray)', fontSize:13, textAlign:'center' }}>Aucune livraison</div>
            ) : dernBL.map(b => {
              const st = STATUTS_BL[b.statut] || STATUTS_BL.attente
              return (
                <div key={b.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px', borderBottom:'1px solid #f3f4f6' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:12, color:'var(--teal)', fontFamily:'var(--mono)' }}>{b.numero}</div>
                    <div style={{ fontSize:12, color:'var(--gray)', marginTop:2 }}>{b.client_nom}</div>
                  </div>
                  <span className="badge" style={{ background:st.bg, color:st.color }}>{st.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
