import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Champ "Nom / Raison sociale" avec liste déroulante des clients déjà existants.
// La liste est construite à partir de la table `clients` et des clients déjà
// utilisés sur les factures / pro forma. Choisir un client remplit aussi son
// adresse et son NIF. On peut toujours taper librement le nom d'un nouveau client.

const normaliser = (v) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

let cacheClients = null

async function chargerClients() {
  const [{ data: fiches }, { data: docs }] = await Promise.all([
    supabase.from('clients').select('nom, adresse, ville, nif').order('nom'),
    supabase.from('factures').select('client_nom, client_adresse, client_nif, created_at')
      .order('created_at', { ascending: false }).limit(5000),
  ])
  const parCle = new Map()
  const ajouter = (nom, adresse, nif) => {
    const propre = String(nom ?? '').replace(/\s+/g, ' ').trim()
    const cle = normaliser(propre)
    if (!cle) return
    const existant = parCle.get(cle)
    if (!existant) {
      parCle.set(cle, { nom: propre, adresse: (adresse || '').trim(), nif: (nif || '').trim() })
    } else {
      if (!existant.adresse && adresse) existant.adresse = adresse.trim()
      if (!existant.nif && nif) existant.nif = nif.trim()
    }
  }
  for (const c of (fiches || [])) ajouter(c.nom, [c.adresse, c.ville].filter(Boolean).join(', '), c.nif)
  for (const d of (docs || [])) ajouter(d.client_nom, d.client_adresse, d.client_nif)
  return [...parCle.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))
}

export default function ClientPicker({ value, onChange, onSelect, placeholder = 'Choisir ou saisir un client' }) {
  const [clients, setClients] = useState(cacheClients || [])
  const [ouvert, setOuvert] = useState(false)
  const [filtrer, setFiltrer] = useState(false)
  const [actif, setActif] = useState(-1)
  const boite = useRef(null)
  const liste = useRef(null)

  useEffect(() => {
    let annule = false
    chargerClients().then(l => { cacheClients = l; if (!annule) setClients(l) }).catch(() => {})
    return () => { annule = true }
  }, [])

  useEffect(() => {
    const dehors = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false) }
    document.addEventListener('mousedown', dehors)
    return () => document.removeEventListener('mousedown', dehors)
  }, [])

  const q = normaliser(value)
  const visibles = filtrer && q
    ? clients.filter(c => q.split(' ').every(mot => normaliser(`${c.nom} ${c.nif}`).includes(mot)))
    : clients

  useEffect(() => {
    if (!ouvert || actif < 0 || !liste.current) return
    liste.current.children[actif]?.scrollIntoView({ block: 'nearest' })
  }, [actif, ouvert])

  const choisir = (c) => {
    onSelect(c)
    setOuvert(false)
    setFiltrer(false)
    setActif(-1)
  }

  const auClavier = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!ouvert) { setOuvert(true); return }
      setActif(i => Math.min(i + 1, visibles.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActif(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && ouvert && actif >= 0 && visibles[actif]) {
      e.preventDefault()
      choisir(visibles[actif])
    } else if (e.key === 'Escape' && ouvert) {
      e.stopPropagation()
      setOuvert(false)
    }
  }

  return (
    <div ref={boite} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOuvert(true); setFiltrer(true); setActif(-1) }}
        onFocus={() => { setOuvert(true); setFiltrer(false) }}
        onKeyDown={auClavier}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert}
        aria-autocomplete="list"
        style={{ paddingRight: 34 }}
      />
      <button
        type="button"
        tabIndex={-1}
        title="Afficher la liste des clients"
        onMouseDown={e => { e.preventDefault(); setFiltrer(false); setOuvert(o => !o) }}
        style={{
          position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', padding: '6px 8px', lineHeight: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </button>

      {ouvert && (
        <div
          ref={liste}
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
            background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 240, overflowY: 'auto',
          }}
        >
          {visibles.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray)' }}>
              {clients.length === 0
                ? 'Aucun client enregistré pour le moment.'
                : 'Aucun client existant ne correspond — il sera créé comme nouveau client.'}
            </div>
          ) : visibles.map((c, i) => (
            <div
              key={c.nom}
              role="option"
              aria-selected={i === actif}
              onMouseDown={e => { e.preventDefault(); choisir(c) }}
              onMouseEnter={() => setActif(i)}
              style={{
                padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                background: i === actif ? 'var(--lgray)' : '#fff',
                borderBottom: '1px solid var(--lgray)',
              }}
            >
              <div style={{ fontWeight: 500 }}>{c.nom}</div>
              {(c.nif || c.adresse) && (
                <div style={{ fontSize: 11, color: 'var(--gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[c.nif && `NIF ${c.nif}`, c.adresse].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
