// Moteur de calcul de la paie — barème Gabon (CNSS, CNAMGS, IRPP, TCS)
// Tous les taux et plafonds proviennent de la table parametres_paie (modifiables dans l'onglet Paie → Paramètres).

export const PARAMS_DEFAUT = {
  cnss_taux_salarie: 2.5,
  cnss_taux_employeur: 16,
  cnss_plafond: 1500000,
  cnamgs_taux_salarie: 2,
  cnamgs_taux_employeur: 4.1,
  cnamgs_plafond: 2500000,
  fnh_taux_employeur: 2,
  frais_pro_pct: 20,
  tcs_taux: 5,
  tcs_seuil_exoneration: 150000,
  irpp_actif: true,
  irpp_bareme: [
    { jusqua: 1500000, taux: 0 },
    { jusqua: 1920000, taux: 5 },
    { jusqua: 2500000, taux: 10 },
    { jusqua: 3500000, taux: 15 },
    { jusqua: 5000000, taux: 20 },
    { jusqua: 7500000, taux: 25 },
    { jusqua: 10000000, taux: 30 },
    { jusqua: null, taux: 35 },
  ],
  parts_max: 6,
  jours_base: 30,
}

export const MODES_PAIEMENT = {
  virement: 'Virement bancaire',
  especes: 'Espèces',
  cheque: 'Chèque',
  mobile_money: 'Mobile Money',
  carte: 'Carte bancaire',
}

export const STATUTS_BULLETIN = {
  brouillon: { label: 'Brouillon', bg: '#f9fafb', color: '#6b7280' },
  valide:    { label: 'Validé',    bg: '#eff6ff', color: '#1e40af' },
  paye:      { label: 'Payé',      bg: '#f0fdf4', color: '#166534' },
}

const n = (v) => Number(v) || 0
const r = (v) => Math.round(v)

// Nombre de parts fiscales : 1 (célibataire) ou 2 (marié), + 0,5 par enfant à charge, plafonné.
export function calculerParts(employe, params = PARAMS_DEFAUT) {
  let parts = employe?.situation_familiale === 'marie' ? 2 : 1
  parts += 0.5 * n(employe?.nb_enfants)
  return Math.min(parts, n(params.parts_max) || 6)
}

// IRPP annuel sur une base annuelle par part, selon le barème progressif.
export function irppAnnuelParPart(baseParPart, bareme) {
  let impot = 0
  let precedent = 0
  for (const tranche of bareme || []) {
    const plafond = tranche.jusqua == null ? Infinity : n(tranche.jusqua)
    if (baseParPart <= precedent) break
    const portion = Math.min(baseParPart, plafond) - precedent
    if (portion > 0) impot += portion * n(tranche.taux) / 100
    precedent = plafond
    if (plafond === Infinity) break
  }
  return impot
}

// Calcul complet d'un bulletin mensuel.
export function calculerBulletin({ employe, params, joursAbsence = 0, heuresSupMontant = 0, primes = [], retenues = [] }) {
  const p = { ...PARAMS_DEFAUT, ...(params || {}) }
  if (!Array.isArray(p.irpp_bareme) || !p.irpp_bareme.length) p.irpp_bareme = PARAMS_DEFAUT.irpp_bareme
  const joursBase = n(p.jours_base) || 30
  const absence = Math.min(Math.max(n(joursAbsence), 0), joursBase)
  const joursTravailles = joursBase - absence

  const salaireBase = n(employe?.salaire_base)
  const salaireBaseCalcule = r(salaireBase * joursTravailles / joursBase)
  const hs = n(heuresSupMontant)

  const primesImposables = (primes || []).filter(x => x.imposable !== false).reduce((s, x) => s + n(x.montant), 0)
  const primesNonImposables = (primes || []).filter(x => x.imposable === false).reduce((s, x) => s + n(x.montant), 0)

  const brutCotisable = salaireBaseCalcule + hs + primesImposables
  const brut = brutCotisable + primesNonImposables

  const cnssSalarie = r(Math.min(brutCotisable, n(p.cnss_plafond) || Infinity) * n(p.cnss_taux_salarie) / 100)
  const cnamgsSalarie = r(Math.min(brutCotisable, n(p.cnamgs_plafond) || Infinity) * n(p.cnamgs_taux_salarie) / 100)

  const salaireImposableApresCotis = brutCotisable - cnssSalarie - cnamgsSalarie
  const baseImposable = r(salaireImposableApresCotis * (1 - n(p.frais_pro_pct) / 100))

  const nbParts = calculerParts(employe, p)
  let irpp = 0
  if (p.irpp_actif !== false) {
    const baseAnnuelleParPart = (baseImposable * 12) / nbParts
    irpp = r(irppAnnuelParPart(baseAnnuelleParPart, p.irpp_bareme) * nbParts / 12)
  }

  const tcs = salaireImposableApresCotis > n(p.tcs_seuil_exoneration)
    ? r(salaireImposableApresCotis * n(p.tcs_taux) / 100)
    : 0

  const autresRetenues = (retenues || []).reduce((s, x) => s + n(x.montant), 0)
  const totalRetenues = cnssSalarie + cnamgsSalarie + irpp + tcs + autresRetenues
  const netAPayer = r(brut - totalRetenues)

  const cnssEmployeur = r(Math.min(brutCotisable, n(p.cnss_plafond) || Infinity) * n(p.cnss_taux_employeur) / 100)
  const cnamgsEmployeur = r(Math.min(brutCotisable, n(p.cnamgs_plafond) || Infinity) * n(p.cnamgs_taux_employeur) / 100)
  const fnhEmployeur = r(brutCotisable * n(p.fnh_taux_employeur) / 100)
  const totalChargesEmployeur = cnssEmployeur + cnamgsEmployeur + fnhEmployeur
  const coutTotal = brut + totalChargesEmployeur

  return {
    jours_travailles: joursTravailles,
    jours_absence: absence,
    salaire_base: salaireBase,
    salaire_base_calcule: salaireBaseCalcule,
    heures_sup_montant: hs,
    primes_imposables: primesImposables,
    primes_non_imposables: primesNonImposables,
    brut,
    brut_cotisable: brutCotisable,
    cnss_salarie: cnssSalarie,
    cnamgs_salarie: cnamgsSalarie,
    base_imposable: baseImposable,
    nb_parts: nbParts,
    irpp,
    tcs,
    autres_retenues: autresRetenues,
    total_retenues: totalRetenues,
    net_a_payer: netAPayer,
    cnss_employeur: cnssEmployeur,
    cnamgs_employeur: cnamgsEmployeur,
    fnh_employeur: fnhEmployeur,
    total_charges_employeur: totalChargesEmployeur,
    cout_total: coutTotal,
  }
}

// Primes fixes définies sur la fiche employé → lignes de primes du bulletin
export function primesFixesEmploye(employe) {
  const out = []
  if (n(employe?.prime_transport) > 0) out.push({ libelle: 'Prime de transport', montant: n(employe.prime_transport), imposable: true })
  if (n(employe?.prime_logement) > 0) out.push({ libelle: 'Indemnité de logement', montant: n(employe.prime_logement), imposable: true })
  if (n(employe?.prime_autres) > 0) out.push({ libelle: 'Autres primes', montant: n(employe.prime_autres), imposable: true })
  return out
}

export const libellePeriode = (periode) => {
  if (!periode) return '—'
  const [y, m] = periode.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  const t = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const periodeCourante = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
