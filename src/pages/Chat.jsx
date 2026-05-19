import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'

// ═══════════════════════════════════════════════════════════════
// Son de notification (court bip, encodé en base64 - aucune dép.)
// ═══════════════════════════════════════════════════════════════
const NOTIFICATION_SOUND = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' +
  'pvT19kYXRhVAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'

// Fonction pour jouer un son
function playNotificationSound() {
  try {
    const audio = new Audio(NOTIFICATION_SOUND)
    audio.volume = 0.3
    audio.play().catch(() => {})
  } catch (e) {}
}

// Formatage de l'heure (intelligent : aujourd'hui = heure seule, sinon date + heure)
function fmtHeureMessage(dateStr) {
  const d = new Date(dateStr)
  const auj = new Date()
  const memeJour = d.toDateString() === auj.toDateString()

  if (memeJour) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  const hier = new Date(auj)
  hier.setDate(hier.getDate() - 1)
  if (d.toDateString() === hier.toDateString()) {
    return `Hier ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' +
         d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// Initiales pour avatar
function getInitiales(nom) {
  if (!nom) return '?'
  return nom.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Couleur d'avatar déterministe d'après l'ID
function couleurAvatar(userId) {
  const couleurs = ['#1A9E8F', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#6366f1']
  let hash = 0
  for (let i = 0; i < (userId || '').length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  return couleurs[Math.abs(hash) % couleurs.length]
}

// Détecter une URL et la rendre cliquable
function renderContenu(texte) {
  const parts = texte.split(/(https?:\/\/\S+)/g)
  return parts.map((p, i) =>
    p.match(/^https?:\/\//)
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: '#1A9E8F', textDecoration: 'underline' }}>{p}</a>
      : p
  )
}

// ═══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function Chat() {
  const { user, profile, isAdmin } = useAuth()
  const [messages, setMessages] = useState([])
  const [profils, setProfils] = useState({})  // map { user_id: profile }
  const [nouveauMessage, setNouveauMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [showEmojis, setShowEmojis] = useState(false)
  const [sonActif, setSonActif] = useState(() => {
    return localStorage.getItem('chat_son') !== 'off'
  })

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const channelRef = useRef(null)

  // Liste d'emojis fréquents
  const EMOJIS = ['😀', '😂', '😊', '😍', '🤔', '👍', '👎', '❤️', '🔥', '🎉', '👏', '🙏', '💪', '✅', '❌', '⚠️', '📌', '💡', '🚀', '⏰', '📞', '📧', '✏️', '🎯']

  // Scroll en bas auto
  const scrollEnBas = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // ═══════════════════════════════════════════════════════════════
  // Charger messages + profils au démarrage
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return
    chargerInitial()
    marquerCommeLu()

    // Demander permission notifications navigateur
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [user])

  const chargerInitial = async () => {
    setLoading(true)

    // Charger profils
    const { data: profsData } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, nom')

    const profsMap = {}
    ;(profsData || []).forEach(p => { profsMap[p.id] = p })
    setProfils(profsMap)

    // Charger messages (200 derniers, ordre chronologique pour affichage)
    const { data: msgsData } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    setMessages((msgsData || []).reverse())
    setLoading(false)

    // Scroll en bas après rendu
    setTimeout(() => scrollEnBas(false), 50)
  }

  // ═══════════════════════════════════════════════════════════════
  // Realtime : écouter les nouveaux messages
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('chat-messages-channel')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const newMsg = payload.new

          // Si auteur inconnu (nouvel utilisateur), recharger les profils
          if (!profils[newMsg.user_id]) {
            const { data: p } = await supabase
              .from('profiles')
              .select('id, full_name, email, role, nom')
              .eq('id', newMsg.user_id)
              .single()
            if (p) setProfils(prev => ({ ...prev, [p.id]: p }))
          }

          // Ajouter le message
          setMessages(prev => {
            // Éviter doublon (si message envoyé localement déjà inséré)
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })

          // Notifier seulement si ce n'est pas mon propre message
          if (newMsg.user_id !== user.id) {
            notifierNouveauMessage(newMsg)
          }

          setTimeout(() => scrollEnBas(true), 50)
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id))
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, profils])

  // ═══════════════════════════════════════════════════════════════
  // Notifier nouveau message (son + notification navigateur + toast)
  // ═══════════════════════════════════════════════════════════════
  const notifierNouveauMessage = (msg) => {
    const auteur = profils[msg.user_id]?.full_name || profils[msg.user_id]?.nom || profils[msg.user_id]?.email || 'Quelqu\'un'

    // Son
    if (sonActif) playNotificationSound()

    // Notification système (si onglet pas actif)
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const notif = new Notification(`💬 ${auteur}`, {
        body: msg.contenu.slice(0, 100),
        icon: '/favicon.ico',
        tag: 'chat'
      })
      notif.onclick = () => { window.focus(); notif.close() }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Marquer comme lu
  // ═══════════════════════════════════════════════════════════════
  const marquerCommeLu = async () => {
    if (!user) return
    await supabase.from('chat_lectures').upsert({
      user_id: user.id,
      derniere_lecture: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }

  // Marquer comme lu quand on revient sur l'onglet
  useEffect(() => {
    const handler = () => { if (!document.hidden) marquerCommeLu() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [user])

  // ═══════════════════════════════════════════════════════════════
  // Envoyer un message
  // ═══════════════════════════════════════════════════════════════
  const envoyer = async (e) => {
    e?.preventDefault()
    const contenu = nouveauMessage.trim()
    if (!contenu || envoiEnCours) return
    if (contenu.length > 2000) {
      toast.error('Message trop long (max 2000 caractères)')
      return
    }

    setEnvoiEnCours(true)
    const { error } = await supabase.from('chat_messages').insert({
      user_id: user.id,
      contenu
    })

    if (error) {
      toast.error('Erreur : ' + error.message)
    } else {
      setNouveauMessage('')
      setShowEmojis(false)
      inputRef.current?.focus()
    }
    setEnvoiEnCours(false)
  }

  // Envoyer avec Entrée (Shift+Entrée = nouvelle ligne)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      envoyer()
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Supprimer un message
  // ═══════════════════════════════════════════════════════════════
  const supprimer = async (id) => {
    if (!window.confirm('Supprimer ce message ?')) return
    const { error } = await supabase.from('chat_messages').delete().eq('id', id)
    if (error) toast.error('Erreur : ' + error.message)
    else toast.success('Message supprimé')
  }

  // ═══════════════════════════════════════════════════════════════
  // Toggle son
  // ═══════════════════════════════════════════════════════════════
  const toggleSon = () => {
    const nouveau = !sonActif
    setSonActif(nouveau)
    localStorage.setItem('chat_son', nouveau ? 'on' : 'off')
    toast.success(nouveau ? '🔔 Sons activés' : '🔕 Sons désactivés')
  }

  // ═══════════════════════════════════════════════════════════════
  // Insérer emoji dans le message
  // ═══════════════════════════════════════════════════════════════
  const insererEmoji = (emoji) => {
    setNouveauMessage(prev => prev + emoji)
    inputRef.current?.focus()
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDU
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 130px)',
      maxWidth: 900, margin: '0 auto',
      background: 'white',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden'
    }}>
      {/* HEADER */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(135deg, #1A9E8F 0%, #0f6e56 100%)',
        color: 'white',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}># général</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Discussion de l'équipe Galerie Médicale
          </div>
        </div>
        <button
          onClick={toggleSon}
          style={{
            background: 'rgba(255,255,255,0.15)', border: 'none',
            color: 'white', padding: '6px 12px', borderRadius: 6,
            cursor: 'pointer', fontSize: 13
          }}
          title={sonActif ? 'Désactiver les sons' : 'Activer les sons'}
        >
          {sonActif ? '🔔' : '🔕'}
        </button>
      </div>

      {/* MESSAGES */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px 20px',
        background: '#fafafa'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>
            Chargement des messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray)' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Aucun message</div>
            <div style={{ fontSize: 13 }}>Soyez le premier à dire bonjour à l'équipe !</div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const auteur = profils[msg.user_id]
            const estMoi = msg.user_id === user.id
            const peutSupprimer = estMoi || isAdmin
            const nomAuteur = auteur?.full_name || auteur?.nom || auteur?.email || 'Inconnu'
            const memeAuteurPrecedent = i > 0 && messages[i - 1].user_id === msg.user_id &&
              (new Date(msg.created_at) - new Date(messages[i - 1].created_at)) < 5 * 60 * 1000

            return (
              <div key={msg.id} style={{
                display: 'flex', gap: 10,
                marginTop: memeAuteurPrecedent ? 2 : 14,
                marginBottom: 2,
                alignItems: 'flex-start'
              }}>
                {/* Avatar */}
                {!memeAuteurPrecedent ? (
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: couleurAvatar(msg.user_id),
                    color: 'white', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, flexShrink: 0
                  }}>
                    {getInitiales(nomAuteur)}
                  </div>
                ) : (
                  <div style={{ width: 36, flexShrink: 0 }}></div>
                )}

                {/* Bulle */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!memeAuteurPrecedent && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                        {nomAuteur} {estMoi && <span style={{ color: 'var(--gray)', fontWeight: 400, fontSize: 11 }}>(moi)</span>}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--gray)' }}>
                        {fmtHeureMessage(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <div style={{
                    display: 'flex', gap: 6, alignItems: 'flex-start',
                    position: 'relative'
                  }}
                    className="message-row"
                  >
                    <div style={{
                      padding: '8px 12px',
                      background: 'white',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 14, lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxWidth: '85%'
                    }}>
                      {renderContenu(msg.contenu)}
                    </div>
                    {peutSupprimer && (
                      <button
                        onClick={() => supprimer(msg.id)}
                        style={{
                          background: 'transparent', border: 'none',
                          color: 'var(--gray)', cursor: 'pointer',
                          fontSize: 14, padding: 4, opacity: 0.4
                        }}
                        onMouseEnter={e => e.target.style.opacity = 1}
                        onMouseLeave={e => e.target.style.opacity = 0.4}
                        title="Supprimer"
                      >🗑</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef}></div>
      </div>

      {/* PICKER EMOJIS */}
      {showEmojis && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          background: '#f9fafb',
          display: 'flex', flexWrap: 'wrap', gap: 4
        }}>
          {EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => insererEmoji(e)}
              style={{
                width: 32, height: 32, fontSize: 18,
                background: 'white', border: '1px solid var(--border)',
                borderRadius: 6, cursor: 'pointer'
              }}
            >{e}</button>
          ))}
        </div>
      )}

      {/* COMPOSER */}
      <form onSubmit={envoyer} style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        background: 'white',
        display: 'flex', gap: 8, alignItems: 'flex-end'
      }}>
        <button
          type="button"
          onClick={() => setShowEmojis(s => !s)}
          style={{
            background: showEmojis ? '#E8F5F3' : '#f3f4f6',
            border: '1px solid var(--border)',
            borderRadius: 6, padding: '8px 10px',
            cursor: 'pointer', fontSize: 18, lineHeight: 1
          }}
          title="Insérer un emoji"
        >😀</button>

        <textarea
          ref={inputRef}
          value={nouveauMessage}
          onChange={e => setNouveauMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écrivez un message... (Entrée pour envoyer, Shift+Entrée = nouvelle ligne)"
          rows={1}
          style={{
            flex: 1, padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 14,
            resize: 'none', fontFamily: 'inherit',
            maxHeight: 120, minHeight: 38
          }}
          disabled={envoiEnCours}
        />

        <button
          type="submit"
          disabled={!nouveauMessage.trim() || envoiEnCours}
          style={{
            background: nouveauMessage.trim() ? '#1A9E8F' : '#e5e7eb',
            color: nouveauMessage.trim() ? 'white' : '#9ca3af',
            border: 'none', borderRadius: 8,
            padding: '8px 18px', fontSize: 14, fontWeight: 600,
            cursor: nouveauMessage.trim() ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s'
          }}
        >
          {envoiEnCours ? '...' : 'Envoyer'}
        </button>
      </form>

      <div style={{
        padding: '6px 16px', fontSize: 11, color: 'var(--gray)',
        background: 'white', borderTop: '1px solid var(--border)',
        textAlign: 'center'
      }}>
        💡 {nouveauMessage.length}/2000 caractères • Astuce : utilisez 😀 pour insérer un emoji
      </div>
    </div>
  )
}
