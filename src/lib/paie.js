// Moteur de calcul de la paie — modèle du bulletin SAJ GROUPE (Gabon)
//
// Enchaînement (identique au bulletin papier) :
//   399 Salaire brut CNSS     = somme des rubriques soumises (salaire de base, ancienneté, primes…)
//   420 Retenue CNSS          = taux × min(brut, plafond CNSS)
//   425 Retenue CNAMGS        = taux × min(brut − CNSS, plafond CNAMGS)
//   450 Précompte TCS         = taux × (brut − CNSS − CNAMGS − abattement)
//   460 Précompte IRPP        = barème annuel par part, sur (brut − CNSS − CNAMGS − TCS) après abattement frais pro
//   599 Salaire net           = brut − CNSS − CNAMGS − TCS − IRPP
//   + indemnités non soumises (entretien véhicule, panier…) − autres retenues (avances…)
//   994 Reprise de l'arrondi du mois précédent, 996 arrondi de paie (net arrondi à la centaine supérieure)
//
// Tous les taux, plafonds et le barème proviennent de la table parametres_paie.

export const PARAMS_DEFAUT = {
  cnss_taux_salarie: 5,
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
    { jusqua: 2700000, taux: 10 },
    { jusqua: 3600000, taux: 15 },
    { jusqua: 5160000, taux: 20 },
    { jusqua: 7500000, taux: 25 },
    { jusqua: 11000000, taux: 30 },
    { jusqua: null, taux: 35 },
  ],
  parts_max: 6,
  jours_base: 30,
  arrondi_paie: 100,
  anciennete_debut_annees: 2,
  anciennete_taux_annuel: 1,
  anciennete_max: 30,
  employeur_nom: 'SAJ GROUPE',
  employeur_bp: 'BP 3403',
  employeur_ville: 'LIBREVILLE',
  employeur_stat: '049761 L',
  employeur_cnss: '014-0202406-V',
}

// Catalogue des rubriques. type : S = gain soumis (CNSS/impôts), N = gain non soumis, R = retenue.
// mode : jours = base × nombre de jours / jours de base (prorata), fixe = montant saisi tel quel.
export const RUBRIQUES = {
  '100': { libelle: 'SALAIRE DE BASE', type: 'S', mode: 'jours', auto: true },
  '200': { libelle: 'ANCIENNETE', type: 'S', mode: 'taux', auto: true },
  '205': { libelle: 'PRIME DE RENDEMENT', type: 'S', mode: 'jours' },
  '210': { libelle: 'HEURES SUPPLEMENTAIRES', type: 'S', mode: 'fixe' },
  '215': { libelle: 'PRIME DE RESPONSABILITE', type: 'S', mode: 'jours' },
  '220': { libelle: 'PRIME D ASSIDUITE', type: 'S', mode: 'jours' },
  '225': { libelle: 'PRIME DE LOGEMENT', type: 'S', mode: 'jours' },
  '230': { libelle: 'PRIME DE FONCTION', type: 'S', mode: 'jours' },
  '235': { libelle: 'PRIME DE TRANSPORT', type: 'S', mode: 'jours' },
  '240': { libelle: 'PRIME EXCEPTIONNELLE', type: 'S', mode: 'fixe' },
  '250': { libelle: 'GRATIFICATION', type: 'S', mode: 'fixe' },
  '260': { libelle: 'AUTRE PRIME IMPOSABLE', type: 'S', mode: 'jours' },
  '611': { libelle: 'INDEMNITE ENTRET VEHICULE', type: 'N', mode: 'jours' },
  '620': { libelle: 'INDEMNITE DE TRANSPORT', type: 'N', mode: 'jours' },
  '630': { libelle: 'INDEMNITE DE REPRESENTATION', type: 'N', mode: 'jours' },
  '648': { libelle: 'PRIME DE PANIER', type: 'N', mode: 'jours' },
  '650': { libelle: 'AUTRE INDEMNITE NON SOUMISE', type: 'N', mode: 'fixe' },
  '700': { libelle: 'AVANCE SUR SALAIRE', type: 'R', mode: 'fixe' },
  '710': { libelle: 'REMBOURSEMENT PRET', type: 'R', mode: 'fixe' },
  '730': { libelle: 'AUTRE RETENUE', type: 'R', mode: 'fixe' },
}

export const RUBRIQUES_SAISISSABLES = Object.entries(RUBRIQUES).filter(([, r]) => !r.auto)

export const TYPES_RUBRIQUE = { S: 'Gain soumis', N: 'Indemnité non soumise', R: 'Retenue' }

export const MODES_PAIEMENT = {
  especes: 'Espèces',
  virement: 'Virement bancaire',
  cheque: 'Chèque',
  mobile_money: 'Mobile Money',
  carte: 'Carte bancaire',
}

export const STATUTS_BULLETIN = {
  brouillon: { label: 'Brouillon', bg: '#f9fafb', color: '#6b7280' },
  valide:    { label: 'Validé',    bg: '#eff6ff', color: '#1e40af' },
  paye:      { label: 'Payé',      bg: '#f0fdf4', color: '#166534' },
}

export const SITUATIONS = { celibataire: 'Célibataire', marie: 'Marié(e)', divorce: 'Divorcé(e)', veuf: 'Veuf(ve)' }
export const SITUATIONS_COURT = { celibataire: 'C', marie: 'M', divorce: 'D', veuf: 'V' }

const n = (v) => Number(v) || 0
const r = (v) => Math.round(v)

export const parametresComplets = (params) => {
  const p = { ...PARAMS_DEFAUT, ...(params || {}) }
  for (const k of Object.keys(PARAMS_DEFAUT)) if (p[k] === null || p[k] === undefined) p[k] = PARAMS_DEFAUT[k]
  if (!Array.isArray(p.irpp_bareme) || !p.irpp_bareme.length) p.irpp_bareme = PARAMS_DEFAUT.irpp_bareme
  return p
}

// Nombre de parts : 1 (célibataire) ou 2 (marié, veuf avec enfants), + 0,5 par enfant, plafonné.
// Une valeur forcée sur la fiche salarié est prioritaire.
export function calculerParts(employe, params = PARAMS_DEFAUT) {
  if (n(employe?.nb_parts_force) > 0) return n(employe.nb_parts_force)
  const sit = employe?.situation_familiale
  let parts = sit === 'marie' || (sit === 'veuf' && n(employe?.nb_enfants) > 0) ? 2 : 1
  parts += 0.5 * n(employe?.nb_enfants)
  return Math.min(parts, n(params.parts_max) || 6)
}

// IRPP annuel pour un revenu annuel par part, selon le barème progressif.
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

// Dernier jour du mois d'une période 'AAAA-MM'
export const finDePeriode = (periode) => {
  const [y, m] = (periode || '').split('-').map(Number)
  if (!y || !m) return new Date()
  return new Date(y, m, 0)
}

export const debutDePeriode = (periode) => {
  const [y, m] = (periode || '').split('-').map(Number)
  return new Date(y, (m || 1) - 1, 1)
}

// Années complètes d'ancienneté à la fin de la période
export function anneesAnciennete(dateEmbauche, periode) {
  if (!dateEmbauche) return 0
  const d = new Date(dateEmbauche)
  const f = finDePeriode(periode)
  let ans = f.getFullYear() - d.getFullYear()
  if (f.getMonth() < d.getMonth() || (f.getMonth() === d.getMonth() && f.getDate() < d.getDate())) ans--
  return Math.max(0, ans)
}

// Taux de prime d'ancienneté : 1 % par année complète à partir de 2 ans (paramétrable), plafonné
export function tauxAnciennete(dateEmbauche, periode, params = PARAMS_DEFAUT) {
  const ans = anneesAnciennete(dateEmbauche, periode)
  if (ans < n(params.anciennete_debut_annees)) return 0
  return Math.min(ans * n(params.anciennete_taux_annuel), n(params.anciennete_max) || 100)
}

const COUPURES = [10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5, 1]
export function calculerBilletage(montant) {
  let reste = Math.max(0, r(montant))
  const out = []
  for (const c of COUPURES) {
    const q = Math.floor(reste / c)
    reste -= q * c
    if (c >= 100 || q > 0) out.push({ coupure: c, nombre: q })
  }
  return out
}

// Rubriques fixes de la fiche salarié → lignes de saisie du bulletin
export function rubriquesDepuisEmploye(employe, params = PARAMS_DEFAUT) {
  const jours = n(params.jours_base) || 30
  return (Array.isArray(employe?.rubriques) ? employe.rubriques : [])
    .filter((x) => x && x.code && RUBRIQUES[x.code] && n(x.montant) > 0)
    .map((x) => ({
      code: x.code,
      libelle: x.libelle || RUBRIQUES[x.code].libelle,
      base: n(x.montant),
      nombre: RUBRIQUES[x.code].mode === 'jours' ? jours : null,
    }))
}

/**
 * Calcul complet d'un bulletin.
 * @param employe     fiche salarié (salaire_base, date_embauche, situation, enfants…)
 * @param params      paramètres de paie
 * @param periode     'AAAA-MM'
 * @param jours       jours payés (par défaut jours de base, 30)
 * @param rubriques   lignes saisies [{ code, libelle, base, nombre }]
 * @param ancienneteTaux  taux forcé (sinon calcul automatique depuis la date d'embauche)
 * @param repriseArrondi  arrondi du bulletin précédent, repris en retenue (994)
 */
export function calculerBulletin({ employe, params, periode, jours, rubriques = [], ancienneteTaux = null, repriseArrondi = 0 }) {
  const p = parametresComplets(params)
  const joursBase = n(p.jours_base) || 30
  const joursPayes = jours === undefined || jours === null || jours === '' ? joursBase : Math.min(Math.max(n(jours), 0), joursBase)
  const lignes = []
  const prorata = (base, nb) => r(n(base) * n(nb) / joursBase)

  // 100 — salaire de base
  const salaireBase = n(employe?.salaire_base)
  const salaireBaseCalcule = prorata(salaireBase, joursPayes)
  lignes.push({ code: '100', libelle: RUBRIQUES['100'].libelle, base: salaireBase, nombre: joursPayes, gain: salaireBaseCalcule, type: 'S' })

  // 200 — ancienneté
  const tauxAnc = ancienneteTaux !== null && ancienneteTaux !== undefined && ancienneteTaux !== ''
    ? n(ancienneteTaux)
    : tauxAnciennete(employe?.date_embauche, periode, p)
  const anciennete = r(salaireBaseCalcule * tauxAnc / 100)
  if (anciennete > 0) lignes.push({ code: '200', libelle: RUBRIQUES['200'].libelle, base: salaireBaseCalcule, nombre: tauxAnc, gain: anciennete, type: 'S' })

  // Rubriques saisies
  const saisies = (rubriques || [])
    .filter((x) => x && x.code && RUBRIQUES[x.code] && !RUBRIQUES[x.code].auto)
    .map((x) => {
      const def = RUBRIQUES[x.code]
      const nombre = def.mode === 'jours' ? (x.nombre === null || x.nombre === undefined || x.nombre === '' ? joursPayes : n(x.nombre)) : null
      const montant = def.mode === 'jours' ? prorata(x.base, nombre) : r(n(x.base))
      return { code: x.code, libelle: (x.libelle || def.libelle).toUpperCase(), base: n(x.base), nombre, montant, type: def.type }
    })
    .filter((x) => x.montant !== 0)
    .sort((a, b) => a.code.localeCompare(b.code))

  const gainsSoumis = saisies.filter((x) => x.type === 'S')
  const gainsNonSoumis = saisies.filter((x) => x.type === 'N')
  const autres = saisies.filter((x) => x.type === 'R')

  for (const g of gainsSoumis) lignes.push({ code: g.code, libelle: g.libelle, base: g.base, nombre: g.nombre, gain: g.montant, type: 'S' })

  // 399 — brut CNSS
  const brutCotisable = salaireBaseCalcule + anciennete + gainsSoumis.reduce((s, x) => s + x.montant, 0)
  lignes.push({ code: '399', libelle: '*** SALAIRE BRUT CNSS ***', base: brutCotisable, total: true })

  // 420 — CNSS
  const baseCnss = Math.min(brutCotisable, n(p.cnss_plafond) || Infinity)
  const cnss = r(baseCnss * n(p.cnss_taux_salarie) / 100)
  lignes.push({ code: '420', libelle: 'RETENUE CNSS', base: baseCnss, nombre: n(p.cnss_taux_salarie), retenue: cnss })

  // 425 — CNAMGS
  const baseCnamgs = Math.max(0, Math.min(brutCotisable - cnss, n(p.cnamgs_plafond) || Infinity))
  const cnamgs = r(baseCnamgs * n(p.cnamgs_taux_salarie) / 100)
  lignes.push({ code: '425', libelle: 'RETENUE CNAMGS', base: baseCnamgs, nombre: n(p.cnamgs_taux_salarie), retenue: cnamgs })

  // 450 — TCS
  const baseTcs = Math.max(0, brutCotisable - cnss - cnamgs)
  const tcs = r(Math.max(0, baseTcs - n(p.tcs_seuil_exoneration)) * n(p.tcs_taux) / 100)
  lignes.push({ code: '450', libelle: 'PRECOMPTE T C S', base: baseTcs, retenue: tcs })

  // 460 — IRPP
  const baseIrpp = Math.max(0, baseTcs - tcs)
  const nbParts = calculerParts(employe, p)
  let irpp = 0
  if (p.irpp_actif !== false && baseIrpp > 0) {
    const imposableAnnuel = baseIrpp * 12 * (1 - n(p.frais_pro_pct) / 100)
    irpp = r(irppAnnuelParPart(imposableAnnuel / nbParts, p.irpp_bareme) * nbParts / 12)
  }
  lignes.push({ code: '460', libelle: 'PRECOMPTE I R P P', base: baseIrpp, retenue: irpp })

  // 599 — salaire net (après cotisations et impôts)
  const salaireNet = brutCotisable - cnss - cnamgs - tcs - irpp
  lignes.push({ code: '599', libelle: '*** Salaire net *********', base: salaireNet, total: true })

  for (const g of gainsNonSoumis) lignes.push({ code: g.code, libelle: g.libelle, base: g.base, nombre: g.nombre, gain: g.montant, type: 'N' })
  for (const g of autres) lignes.push({ code: g.code, libelle: g.libelle, retenue: g.montant, type: 'R' })

  const indemnites = gainsNonSoumis.reduce((s, x) => s + x.montant, 0)
  const autresRetenues = autres.reduce((s, x) => s + x.montant, 0)
  const reprise = r(n(repriseArrondi))

  // 994 / 996 — arrondi de paie
  const netAvantArrondi = salaireNet + indemnites - autresRetenues - reprise
  const pas = n(p.arrondi_paie)
  const arrondi = pas > 0 && netAvantArrondi > 0 ? Math.ceil(netAvantArrondi / pas) * pas - netAvantArrondi : 0
  if (reprise) lignes.push({ code: '994', libelle: 'REPRISE ARRONDI', retenue: reprise })
  if (arrondi) lignes.push({ code: '996', libelle: 'ARRONDI DE PAIE', gain: arrondi })

  const netAPayer = netAvantArrondi + arrondi
  const totalGains = brutCotisable + indemnites + arrondi
  const totalRetenues = cnss + cnamgs + tcs + irpp + autresRetenues + reprise

  // Charges patronales (information, coût employeur)
  const cnssEmployeur = r(baseCnss * n(p.cnss_taux_employeur) / 100)
  const cnamgsEmployeur = r(Math.min(brutCotisable, n(p.cnamgs_plafond) || Infinity) * n(p.cnamgs_taux_employeur) / 100)
  const fnhEmployeur = r(brutCotisable * n(p.fnh_taux_employeur) / 100)
  const totalChargesEmployeur = cnssEmployeur + cnamgsEmployeur + fnhEmployeur
  const brut = brutCotisable + indemnites

  return {
    lignes,
    rubriques: (rubriques || []).filter((x) => x && x.code && RUBRIQUES[x.code]).map((x) => ({ code: x.code, libelle: x.libelle || RUBRIQUES[x.code].libelle, base: n(x.base), nombre: x.nombre === '' ? null : x.nombre ?? null })),
    anciennete_taux: ancienneteTaux !== null && ancienneteTaux !== undefined && ancienneteTaux !== '' ? n(ancienneteTaux) : null,
    jours_travailles: joursPayes,
    jours_absence: joursBase - joursPayes,
    salaire_base: salaireBase,
    salaire_base_calcule: salaireBaseCalcule,
    heures_sup_montant: gainsSoumis.filter((x) => x.code === '210').reduce((s, x) => s + x.montant, 0),
    brut,
    brut_cotisable: brutCotisable,
    base_cnss: baseCnss,
    base_cnamgs: baseCnamgs,
    base_tcs: baseTcs,
    base_irpp: baseIrpp,
    base_imposable: baseIrpp,
    cnss_salarie: cnss,
    cnamgs_salarie: cnamgs,
    tcs,
    irpp,
    nb_parts: nbParts,
    salaire_net_imposable: salaireNet,
    indemnites_non_soumises: indemnites,
    autres_retenues: autresRetenues,
    reprise_arrondi: reprise,
    arrondi,
    total_gains: totalGains,
    total_retenues: totalRetenues,
    net_a_payer: netAPayer,
    billetage: calculerBilletage(netAPayer),
    cnss_employeur: cnssEmployeur,
    cnamgs_employeur: cnamgsEmployeur,
    fnh_employeur: fnhEmployeur,
    total_charges_employeur: totalChargesEmployeur,
    cout_total: brut + totalChargesEmployeur,
  }
}

// Instantané des informations salarié imprimées sur le bulletin
export function snapshotEmploye(e) {
  if (!e) return null
  const keys = ['matricule', 'nom', 'prenom', 'poste', 'classification', 'categorie', 'date_naissance', 'sexe', 'nationalite',
    'situation_familiale', 'nb_enfants', 'cnss_numero', 'cnamgs_numero', 'date_embauche', 'departement', 'section', 'service',
    'regime', 'statut_salarie', 'mode_paiement', 'banque', 'compte_bancaire']
  return Object.fromEntries(keys.map((k) => [k, e[k] ?? null]))
}

// Cumuls annuels (janvier → période du bulletin) : bulletins de l'année + reprise d'un ancien logiciel
export function calculerCumuls(bulletin, bulletinsAnnee = [], employe = null) {
  const annee = (bulletin.periode || '').slice(0, 4)
  const liste = bulletinsAnnee.filter((b) => (b.periode || '').startsWith(annee) && b.periode <= bulletin.periode && b.id !== bulletin.id)
  liste.push(bulletin)
  const somme = (k) => liste.reduce((s, b) => s + n(b[k]), 0)
  const c = {
    brut: somme('brut_cotisable'),
    jours: somme('jours_travailles'),
    cnss: somme('cnss_salarie'),
    cnamgs: somme('cnamgs_salarie'),
    tcs: somme('tcs'),
    irpp: somme('irpp'),
    net: somme('net_a_payer'),
  }
  const rep = employe?.cumuls_reprise
  const premiere = liste.map((b) => b.periode).sort()[0]
  if (rep && String(rep.annee) === annee && (!rep.jusqua || rep.jusqua < premiere)) {
    for (const k of Object.keys(c)) c[k] += n(rep[k])
  }
  return c
}

export const libellePeriode = (periode) => {
  if (!periode) return '—'
  const [y, m] = periode.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  const t = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const periodePrecedente = (periode) => {
  const [y, m] = periode.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const periodeCourante = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
