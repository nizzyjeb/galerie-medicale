import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, fmtDate, STATUTS_FACTURE } from '../lib/utils'

// ─── Traçabilité : qui a créé / modifié / validé, et quand ──────────────────

let profilsCache = null
let profilsPromise = null

export function useProfils() {
  const [profils, setProfils] = useState(profilsCache || {})
  useEffect(() => {
    if (profilsCache) return
    if (!profilsPromise) {
      profilsPromise = supabase.from('profiles').select('id, nom').then(({ data }) => {
        profilsCache = Object.fromEntries((data || []).map(p => [p.id, p.nom]))
        return profilsCache
      })
    }
    profilsPromise.then(setProfils)
  }, [])
  return profils
}

export const fmtDateHeure = (d) => {
  if (!d) return '—'
  const x = new Date(d)
  return x.toLocaleDateString('fr-FR') + ' à ' + x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const nomDe = (profils, id) => (id ? (profils[id] || 'Utilisateur inconnu') : null)

export const ACTIONS = {
  creation:          { label: 'Création',            icon: '🆕', color: '#1e40af', bg: '#eff6ff' },
  modification:      { label: 'Modification',        icon: '✏️', color: '#92400e', bg: '#fff7ed' },
  lignes:            { label: 'Lignes modifiées',    icon: '📝', color: '#92400e', bg: '#fff7ed' },
  lignes_ajoutees:   { label: 'Lignes ajoutées',     icon: '➕', color: '#92400e', bg: '#fff7ed' },
  lignes_supprimees: { label: 'Lignes supprimées',   icon: '➖', color: '#92400e', bg: '#fff7ed' },
  validation:        { label: 'Validation',          icon: '✅', color: '#166534', bg: '#dcfce7' },
  devalidation:      { label: 'Validation annulée',  icon: '↩️', color: '#991b1b', bg: '#fef2f2' },
  statut:            { label: 'Changement de statut', icon: '🔁', color: '#5b21b6', bg: '#f5f3ff' },
  suppression:       { label: 'Suppression',         icon: '🗑', color: '#991b1b', bg: '#fef2f2' },
}

const CHAMPS = {
  numero: 'N°', client_nom: 'Client', client_adresse: 'Adresse client', client_nif: 'NIF client',
  client_id: 'Fiche client', objet: 'Objet', date_emission: "Date d'émission", date_echeance: "Date d'échéance",
  remise_pct: 'Remise (%)', sous_total_ht: 'Sous-total HT', montant_remise: 'Montant remise', base_ht: 'Base HT',
  tva: 'TVA', css: 'CSS', total_ttc: 'Total TTC', statut: 'Statut', notes: 'Notes', type: 'Type',
  commercial_nom: 'Commercial', commercial_tel: 'Tél. commercial', commercial_email: 'Email commercial',
}
const MONTANTS = ['sous_total_ht', 'montant_remise', 'base_ht', 'tva', 'css', 'total_ttc']

const valeur = (cle, v) => {
  if (v === null || v === undefined || v === '') return '—'
  if (MONTANTS.includes(cle)) return fmt(v)
  if (cle === 'statut') return STATUTS_FACTURE[v]?.label || v
  if (cle === 'type') return v === 'facture' ? 'Facture' : 'Pro Forma'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return fmtDate(v)
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  return String(v)
}

const ligneTexte = (l) => `${l.designation} — ${Number(l.quantite)} × ${fmt(l.prix_unitaire)}`

// Regroupe les événements techniques en événements lisibles :
// - lignes ajoutées juste après la création → intégrées à la création
// - suppression + ajout de lignes (enregistrement d'une modification) → « Lignes modifiées » avec le détail
export function regrouperEvenements(evts) {
  const out = []
  const proche = (a, b) => a && b && a.utilisateur_id === b.utilisateur_id && a.document_id === b.document_id &&
    Math.abs(new Date(a.created_at) - new Date(b.created_at)) < 120000
  for (const e of evts) {
    const prec = out[out.length - 1]
    if (e.action === 'lignes_ajoutees' && prec && prec.action === 'creation' && proche(prec, e)) {
      prec.lignesCreation = [...(prec.lignesCreation || []), ...(e.details?.lignes || [])]
      continue
    }
    if (e.action === 'lignes_ajoutees' && prec && prec.action === 'lignes' && proche(prec, e)) {
      prec.apres = [...prec.apres, ...(e.details?.lignes || [])]
      continue
    }
    if (e.action === 'lignes_supprimees') {
      out.push({ ...e, action: 'lignes', avant: e.details?.lignes || [], apres: [] })
      continue
    }
    out.push({ ...e })
  }
  return out
    .map(e => {
      if (e.action !== 'lignes') return e
      const cle = l => ligneTexte(l)
      const restants = [...e.apres.map(cle)]
      const retirees = []
      for (const l of e.avant) {
        const i = restants.indexOf(cle(l))
        if (i >= 0) restants.splice(i, 1)
        else retirees.push(cle(l))
      }
      const ajouteesRest = [...e.apres.map(cle)]
      for (const l of e.avant) {
        const i = ajouteesRest.indexOf(cle(l))
        if (i >= 0) ajouteesRest.splice(i, 1)
      }
      return { ...e, retirees, ajoutees: ajouteesRest }
    })
    .filter(e => e.action !== 'lignes' || e.retirees.length || e.ajoutees.length)
}

export function DetailEvenement({ e }) {
  const s = { fontSize: 12, color: 'var(--gray)', marginTop: 4, lineHeight: 1.6 }
  if (e.action === 'creation') {
    return (
      <div style={s}>
        Client : {e.details?.client || '—'} · Total TTC : {fmt(e.details?.total_ttc)}
        {e.lignesCreation?.length > 0 && <div>{e.lignesCreation.length} ligne(s) : {e.lignesCreation.map(ligneTexte).join(' ; ')}</div>}
      </div>
    )
  }
  if (e.action === 'suppression') {
    return <div style={s}>Client : {e.details?.client || '—'} · Total TTC : {fmt(e.details?.total_ttc)}{e.details?.valide ? ' · document validé' : ''}</div>
  }
  if (e.action === 'modification' || e.action === 'statut') {
    const champs = Object.entries(e.details || {}).filter(([k]) => CHAMPS[k] || !['id', 'created_at', 'created_by'].includes(k))
    return (
      <div style={s}>
        {champs.map(([k, v]) => (
          <div key={k}>
            <b style={{ color: 'var(--text)' }}>{CHAMPS[k] || k}</b> : {valeur(k, v?.avant)} → <b style={{ color: 'var(--text)' }}>{valeur(k, v?.apres)}</b>
          </div>
        ))}
      </div>
    )
  }
  if (e.action === 'lignes') {
    return (
      <div style={s}>
        {e.retirees.map((t, i) => <div key={'r' + i} style={{ color: '#991b1b' }}>− {t}</div>)}
        {e.ajoutees.map((t, i) => <div key={'a' + i} style={{ color: '#166534' }}>+ {t}</div>)}
      </div>
    )
  }
  if (e.action === 'lignes_ajoutees') {
    return <div style={s}>{(e.details?.lignes || []).map((l, i) => <div key={i} style={{ color: '#166534' }}>+ {ligneTexte(l)}</div>)}</div>
  }
  return null
}

// Cellule compacte affichée dans les tableaux
export function TraceCell({ doc, profils, onHistorique }) {
  const lignes = []
  const cree = nomDe(profils, doc.created_by)
  if (cree || doc.created_at) lignes.push(['Créé', cree || '—', doc.created_at])
  if (doc.modifie_le) lignes.push(['Modifié', nomDe(profils, doc.modifie_par) || '—', doc.modifie_le])
  if (doc.valide && doc.date_validation) lignes.push(['Validé', nomDe(profils, doc.valide_par) || '—', doc.date_validation])
  const court = (d) => {
    if (!d) return ''
    const x = new Date(d)
    return x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  return (
    <button
      onClick={onHistorique}
      title="Voir l'historique complet"
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontSize: 11, lineHeight: 1.5, color: 'var(--gray)', whiteSpace: 'nowrap' }}
    >
      {lignes.map(([lbl, nom, d]) => (
        <div key={lbl}><span style={{ color: 'var(--text)', fontWeight: 500 }}>{lbl}</span> · {nom} · {court(d)}</div>
      ))}
      <div style={{ color: 'var(--teal)', fontWeight: 500 }}>🕘 Historique</div>
    </button>
  )
}

// Fenêtre d'historique complet d'un document
export function HistoriqueModal({ doc, onClose }) {
  const [evts, setEvts] = useState(null)
  const [erreur, setErreur] = useState(null)
  const profils = useProfils()

  useEffect(() => {
    supabase.from('document_historique')
      .select('*')
      .eq('table_nom', 'factures')
      .eq('document_id', doc.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .then(({ data, error }) => {
        if (error) setErreur(error.message)
        else setEvts(regrouperEvenements(data || []))
      })
  }, [doc.id])

  const resume = [
    ['Créé par', nomDe(profils, doc.created_by) || '—', doc.created_at],
    ['Dernière modification', doc.modifie_le ? (nomDe(profils, doc.modifie_par) || '—') : 'Aucune', doc.modifie_le],
    ['Validé par', doc.valide ? (nomDe(profils, doc.valide_par) || '—') : 'Non validé', doc.valide ? doc.date_validation : null],
  ]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <div className="card-title">Historique — {doc.numero}</div>
            <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
              {doc.type === 'facture' ? 'Facture' : 'Pro Forma'} · {doc.client_nom}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--gray)' }}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 20 }}>
            {resume.map(([lbl, nom, d]) => (
              <div key={lbl} style={{ background: 'var(--lgray)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--gray)' }}>{lbl}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{nom}</div>
                {d && <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>{fmtDateHeure(d)}</div>}
              </div>
            ))}
          </div>

          {erreur ? (
            <div style={{ padding: 14, borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
              Historique indisponible : la mise à jour de la base de données (traçabilité) n'a pas encore été appliquée.
            </div>
          ) : evts === null ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>Chargement...</div>
          ) : evts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--gray)', fontSize: 13 }}>
              Aucun événement enregistré pour ce document.<br />
              L'historique détaillé commence à partir de l'activation de la traçabilité.
            </div>
          ) : (
            <div style={{ borderLeft: '2px solid var(--border)', marginLeft: 8, paddingLeft: 18 }}>
              {evts.map(e => {
                const a = ACTIONS[e.action] || { label: e.action, icon: '•', color: 'var(--gray)', bg: 'var(--lgray)' }
                return (
                  <div key={e.id} style={{ position: 'relative', marginBottom: 16 }}>
                    <div style={{ position: 'absolute', left: -27, top: 2, width: 16, height: 16, borderRadius: 8, background: a.bg, border: `2px solid ${a.color}` }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span className="badge" style={{ background: a.bg, color: a.color }}>{a.icon} {a.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{e.utilisateur_nom || '—'}</span>
                      <span style={{ fontSize: 12, color: 'var(--gray)' }}>{fmtDateHeure(e.created_at)}</span>
                    </div>
                    <DetailEvenement e={e} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
