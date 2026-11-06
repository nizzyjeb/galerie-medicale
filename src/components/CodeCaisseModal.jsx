import { useState } from 'react'

// Fenêtre de saisie du code de caisse (ouverture / clôture / réouverture).
// onValider(code) doit renvoyer true si le code a été accepté.
export default function CodeCaisseModal({ titre, description, onValider, onClose }) {
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const valider = async (e) => {
    e?.preventDefault()
    if (!code) return
    setEnvoi(true)
    const ok = await onValider(code)
    setEnvoi(false)
    if (!ok) setCode('')
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <form className="card" onClick={(e) => e.stopPropagation()} onSubmit={valider} style={{ width: 'min(380px, 92vw)', textAlign: 'center' }}>
        <div style={{ fontSize: 34, marginBottom: 6 }}>🔐</div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{titre}</h2>
        <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 16 }}>{description}</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          placeholder="••••••"
          style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box', fontSize: 22, letterSpacing: 8, textAlign: 'center' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={envoi || !code}>
            {envoi ? 'Vérification…' : 'Valider'}
          </button>
        </div>
      </form>
    </div>
  )
}
