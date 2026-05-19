import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION GALERIE MÉDICALE
// Modifiez ces valeurs si la zone change
// ═══════════════════════════════════════════════════════════════
const GALERIE_LAT = 0.44040310295785134
const GALERIE_LNG = 9.417844746414207
const RAYON_AUTORISE_M = 100      // 100 mètres autour de la Galerie
const HEURE_STANDARD = '08:00'    // Au-delà = retard

// ═══════════════════════════════════════════════════════════════
// Calcul distance entre 2 coordonnées GPS (formule de Haversine)
// ═══════════════════════════════════════════════════════════════
function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000  // rayon terrestre en mètres
  const toRad = (d) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

// ═══════════════════════════════════════════════════════════════
// Récupération position GPS
// ═══════════════════════════════════════════════════════════════
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Géolocalisation non supportée par ce navigateur'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      }),
      (err) => {
        const messages = {
          1: 'Vous avez refusé la géolocalisation. Activez-la dans les paramètres du navigateur.',
          2: 'Position indisponible. Vérifiez votre connexion / GPS.',
          3: 'La géolocalisation a pris trop de temps. Réessayez.'
        }
        reject(new Error(messages[err.code] || err.message))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}

// ═══════════════════════════════════════════════════════════════
// Calcul retard en minutes
// ═══════════════════════════════════════════════════════════════
function calcRetardMinutes(heurePointage) {
  const [h, m] = HEURE_STANDARD.split(':').map(Number)
  const standard = new Date(heurePointage)
  standard.setHours(h, m, 0, 0)
  const diff = Math.floor((new Date(heurePointage) - standard) / 60000)
  return Math.max(0, diff)
}

// ═══════════════════════════════════════════════════════════════
// Formatage heure et date
// ═══════════════════════════════════════════════════════════════
const fmtHeure = (d) => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
const fmtJour = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

// ═══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function Pointage() {
  const { user, profile } = useAuth()
  const [maintenant, setMaintenant] = useState(new Date())
  const [pointagesJour, setPointagesJour] = useState([])
  const [historique, setHistorique] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)

  // Horloge en temps réel
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Chargement des pointages
  useEffect(() => { if (user) chargerPointages() }, [user])

  const chargerPointages = async () => {
    setLoadingData(true)
    const aujourdhui = new Date().toISOString().split('T')[0]

    // Pointages du jour
    const { data: today } = await supabase
      .from('pointages')
      .select('*')
      .eq('user_id', user.id)
      .eq('date_jour', aujourdhui)
      .order('heure', { ascending: true })

    // Historique 7 derniers jours
    const il_y_a_7j = new Date()
    il_y_a_7j.setDate(il_y_a_7j.getDate() - 7)
    const { data: hist } = await supabase
      .from('pointages')
      .select('*')
      .eq('user_id', user.id)
      .gte('date_jour', il_y_a_7j.toISOString().split('T')[0])
      .order('heure', { ascending: false })

    setPointagesJour(today || [])
    setHistorique(hist || [])
    setLoadingData(false)
  }

  const arrivee = pointagesJour.find(p => p.type === 'arrivee')
  const depart = pointagesJour.find(p => p.type === 'depart')

  // ═══════════════════════════════════════════════════════════════
  // ACTION : POINTER
  // ═══════════════════════════════════════════════════════════════
  const pointer = async (type) => {
    if (loading) return
    setLoading(true)

    try {
      toast.loading('📍 Récupération de votre position...', { id: 'gps' })

      const pos = await getPosition()
      const distance = distanceMetres(pos.latitude, pos.longitude, GALERIE_LAT, GALERIE_LNG)

      toast.dismiss('gps')

      if (distance > RAYON_AUTORISE_M) {
        toast.error(
          `❌ Vous êtes à ${distance} m de la Galerie. ` +
          `Vous devez être à moins de ${RAYON_AUTORISE_M} m pour pointer.`,
          { duration: 6000 }
        )
        setLoading(false)
        return
      }

      const heure = new Date().toISOString()
      const retard = type === 'arrivee' ? calcRetardMinutes(heure) : 0

      const { error } = await supabase.from('pointages').insert({
        user_id: user.id,
        type,
        heure,
        date_jour: new Date().toISOString().split('T')[0],
        latitude: pos.latitude,
        longitude: pos.longitude,
        distance_metres: distance,
        retard_minutes: retard
      })

      if (error) {
        toast.error('Erreur : ' + error.message)
      } else {
        if (type === 'arrivee') {
          if (retard > 0) {
            toast.success(`✓ Arrivée enregistrée (retard : ${retard} min)`, { duration: 5000 })
          } else {
            toast.success(`✓ Arrivée enregistrée à l'heure 👍`, { duration: 4000 })
          }
        } else {
          toast.success('✓ Départ enregistré — bonne fin de journée !', { duration: 4000 })
        }
        chargerPointages()
      }
    } catch (err) {
      toast.dismiss('gps')
      toast.error(err.message, { duration: 6000 })
    } finally {
      setLoading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDU
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>📍 Pointage</h1>
      <p style={{ color: 'var(--gray)', marginBottom: 24, textTransform: 'capitalize' }}>
        {fmtJour(maintenant)}
      </p>

      {/* HORLOGE */}
      <div className="card" style={{
        textAlign: 'center', padding: '30px 20px', marginBottom: 20,
        background: 'linear-gradient(135deg, #1A9E8F 0%, #0f6e56 100%)',
        color: 'white'
      }}>
        <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 6 }}>HEURE ACTUELLE</div>
        <div style={{ fontSize: 48, fontWeight: 700, fontFamily: 'DM Mono, monospace', letterSpacing: 2 }}>
          {fmtHeure(maintenant)}
        </div>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>
          Bonjour {profile?.full_name || profile?.email || 'collaborateur'}
        </div>
      </div>

      {/* BOUTONS DE POINTAGE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Bouton ARRIVÉE */}
        <button
          onClick={() => pointer('arrivee')}
          disabled={loading || arrivee}
          style={{
            padding: '24px 20px', borderRadius: 12, border: 'none',
            background: arrivee ? '#e5e7eb' : '#16a34a',
            color: arrivee ? '#6b7280' : 'white',
            cursor: arrivee || loading ? 'not-allowed' : 'pointer',
            fontSize: 16, fontWeight: 700,
            boxShadow: arrivee ? 'none' : '0 4px 14px rgba(22,163,74,0.35)',
            transition: 'all 0.2s',
            opacity: loading && !arrivee ? 0.6 : 1
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🟢</div>
          <div>POINTER ARRIVÉE</div>
          {arrivee && (
            <div style={{ fontSize: 13, marginTop: 8, fontWeight: 500 }}>
              ✓ Pointé à {fmtHeure(arrivee.heure)}
              {arrivee.retard_minutes > 0 && (
                <div style={{ color: '#dc2626', fontSize: 12 }}>
                  Retard : {arrivee.retard_minutes} min
                </div>
              )}
            </div>
          )}
        </button>

        {/* Bouton DÉPART */}
        <button
          onClick={() => pointer('depart')}
          disabled={loading || !arrivee || depart}
          style={{
            padding: '24px 20px', borderRadius: 12, border: 'none',
            background: depart ? '#e5e7eb' : (!arrivee ? '#fef3c7' : '#dc2626'),
            color: depart ? '#6b7280' : (!arrivee ? '#92400e' : 'white'),
            cursor: depart || !arrivee || loading ? 'not-allowed' : 'pointer',
            fontSize: 16, fontWeight: 700,
            boxShadow: depart || !arrivee ? 'none' : '0 4px 14px rgba(220,38,38,0.35)',
            transition: 'all 0.2s',
            opacity: loading && arrivee && !depart ? 0.6 : 1
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔴</div>
          <div>POINTER DÉPART</div>
          {depart ? (
            <div style={{ fontSize: 13, marginTop: 8, fontWeight: 500 }}>
              ✓ Pointé à {fmtHeure(depart.heure)}
            </div>
          ) : !arrivee ? (
            <div style={{ fontSize: 12, marginTop: 8, fontWeight: 500 }}>
              Pointez d'abord votre arrivée
            </div>
          ) : null}
        </button>
      </div>

      {/* INFO ZONE AUTORISÉE */}
      <div style={{
        padding: 12, borderRadius: 8, background: '#f0f9ff',
        border: '1px solid #bae6fd', color: '#0c4a6e', fontSize: 13,
        marginBottom: 24
      }}>
        ℹ️ Le pointage nécessite votre position GPS et que vous soyez à moins de <b>{RAYON_AUTORISE_M} m</b> de la Galerie Médicale.
        L'heure standard d'arrivée est <b>{HEURE_STANDARD}</b>.
      </div>

      {/* RÉSUMÉ DU JOUR */}
      {(arrivee || depart) && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>📋 Résumé du jour</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>Arrivée</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'DM Mono, monospace' }}>
                {arrivee ? fmtHeure(arrivee.heure) : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>Départ</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'DM Mono, monospace' }}>
                {depart ? fmtHeure(depart.heure) : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>Heures travaillées</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'DM Mono, monospace' }}>
                {arrivee && depart ? (
                  (() => {
                    const ms = new Date(depart.heure) - new Date(arrivee.heure)
                    const h = Math.floor(ms / 3600000)
                    const m = Math.floor((ms % 3600000) / 60000)
                    return `${h}h ${String(m).padStart(2, '0')}`
                  })()
                ) : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HISTORIQUE */}
      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>📅 7 derniers jours</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Heure</th><th>Retard</th><th>Distance</th></tr>
            </thead>
            <tbody>
              {loadingData ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>Chargement...</td></tr>
              ) : historique.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>Aucun pointage récent</td></tr>
              ) : historique.map(p => (
                <tr key={p.id}>
                  <td style={{ textTransform: 'capitalize' }}>
                    {new Date(p.date_jour).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </td>
                  <td>
                    <span className="badge" style={{
                      background: p.type === 'arrivee' ? '#dcfce7' : '#fee2e2',
                      color: p.type === 'arrivee' ? '#166534' : '#991b1b'
                    }}>
                      {p.type === 'arrivee' ? '🟢 Arrivée' : '🔴 Départ'}
                    </span>
                  </td>
                  <td className="font-mono">{fmtHeure(p.heure)}</td>
                  <td>
                    {p.retard_minutes > 0 ? (
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>{p.retard_minutes} min</span>
                    ) : p.type === 'arrivee' ? (
                      <span style={{ color: '#16a34a' }}>À l'heure</span>
                    ) : '—'}
                  </td>
                  <td style={{ color: 'var(--gray)', fontSize: 12 }}>{p.distance_metres ? `${p.distance_metres} m` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
