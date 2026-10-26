export const fmt = (n) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n ?? 0) + ' FCFA'

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('fr-FR') : '—'

export const pad = (n, l = 3) => String(n).padStart(l, '0')

export const today = () => new Date().toISOString().split('T')[0]

export const addDays = (d, days) => {
  const date = new Date(d)
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

export const calcTotals = (lignes, remisePct = 0) => {
  const sousTotal = lignes.reduce((s, l) => s + (l.quantite || 0) * (l.prix_unitaire || 0), 0)
  // Sous-total des lignes soumises à TVA uniquement (les lignes exonérées sont exclues UNIQUEMENT du calcul TVA, pas du CSS)
  const sousTotalTaxableTVA = lignes.reduce(
    (s, l) => s + (l.exonere_tva ? 0 : (l.quantite || 0) * (l.prix_unitaire || 0)),
    0
  )
  const ratioTVA = sousTotal > 0 ? sousTotalTaxableTVA / sousTotal : 0
  const remise = sousTotal * (remisePct / 100)
  const base = sousTotal - remise
  // La remise s'applique au prorata sur la part soumise à TVA
  const baseTVA = sousTotalTaxableTVA - (remise * ratioTVA)
  const tva = baseTVA * 0.18
  // Le CSS (1%) reste applique sur l'integralite de la base, y compris les items exoneres de TVA
  const css = base * 0.01
  const ttc = base + tva + css
  const tvaExoneree = sousTotal > 0 && sousTotalTaxableTVA === 0
  return { sousTotal, remise, base, baseTVA, tva, css, ttc, tvaExoneree }
}

export const ROLES = {
  admin: { label: 'Administrateur', color: '#1A9E8F' },
  comptable: { label: 'Comptable / Secrétaire', color: '#E67E22' },
  livreur: { label: 'Livreur / Commercial', color: '#6D6D6D' },
  logistique: { label: 'Responsable logistique', color: '#2563EB' },
}

export const STATUTS_FACTURE = {
  attente: { label: 'En attente', bg: '#fff7ed', color: '#92400e' },
  payee:   { label: 'Payée',      bg: '#f0fdf4', color: '#166534' },
  retard:  { label: 'En retard',  bg: '#fef2f2', color: '#991b1b' },
  en_cours:{ label: 'En cours',   bg: '#eff6ff', color: '#1e40af' },
  expiree: { label: 'Expirée',    bg: '#f9fafb', color: '#6b7280' },
}

export const STATUTS_BL = {
  attente: { label: 'En attente', bg: '#fff7ed', color: '#92400e' },
  partiel: { label: 'Partiel',    bg: '#eff6ff', color: '#1e40af' },
  complet: { label: 'Complet',    bg: '#f0fdf4', color: '#166534' },
}

// Montant en toutes lettres (français, règles traditionnelles) : 113193 → « cent treize mille cent quatre-vingt-treize »
const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

const moinsDeCent = (n, final) => {
  if (n < 20) return UNITES[n]
  const d = Math.floor(n / 10), u = n % 10
  if (d === 7 || d === 9) {
    const reste = 10 + u
    return DIZAINES[d] + (d === 7 && u === 1 ? ' et ' : '-') + UNITES[reste]
  }
  if (u === 0) return DIZAINES[d] + (d === 8 && final ? 's' : '')
  if (u === 1 && d !== 8) return DIZAINES[d] + ' et un'
  return DIZAINES[d] + '-' + UNITES[u]
}

const moinsDeMille = (n, final) => {
  const c = Math.floor(n / 100), r = n % 100
  let txt = ''
  if (c > 0) txt = (c > 1 ? UNITES[c] + ' ' : '') + 'cent' + (c > 1 && r === 0 && final ? 's' : '')
  if (r > 0) txt += (txt ? ' ' : '') + moinsDeCent(r, final)
  return txt
}

export const nombreEnLettres = (valeur) => {
  let n = Math.round(Math.abs(Number(valeur) || 0))
  if (n === 0) return 'zéro'
  const parts = []
  const milliards = Math.floor(n / 1e9); n %= 1e9
  const millions = Math.floor(n / 1e6); n %= 1e6
  const milliers = Math.floor(n / 1e3); n %= 1e3
  if (milliards) parts.push(moinsDeMille(milliards, true) + (milliards > 1 ? ' milliards' : ' milliard'))
  if (millions) parts.push(moinsDeMille(millions, true) + (millions > 1 ? ' millions' : ' million'))
  if (milliers) parts.push(milliers === 1 ? 'mille' : moinsDeMille(milliers, false) + ' mille')
  if (n) parts.push(moinsDeMille(n, true))
  return parts.join(' ')
}

export const montantEnLettres = (valeur) => {
  const txt = nombreEnLettres(valeur)
  const n = Math.round(Math.abs(Number(valeur) || 0))
  const deFrancs = n >= 1e6 && n % 1e6 === 0 ? ' de francs CFA' : ' francs CFA'
  return txt.charAt(0).toUpperCase() + txt.slice(1) + deFrancs
}
