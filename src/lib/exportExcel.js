// Export Excel sans dépendance externe — génère un fichier CSV lisible par Excel
// avec séparateur point-virgule (standard Europe/Afrique francophone)

const fmtNum = (n) => Math.round(n || 0).toLocaleString('fr-FR')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : ''
const fmtHeure = (d) => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''

function downloadCSV(filename, rows) {
  const BOM = '\uFEFF' // BOM UTF-8 pour Excel
  const csv = BOM + rows.map(r => r.map(cell => {
    const s = String(cell ?? '').replace(/"/g, '""')
    return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
  }).join(';')).join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportFacturesExcel(factures, type = 'facture') {
  const label = type === 'facture' ? 'Factures' : 'ProFormas'
  const filename = `${label}_GalerieMedicale_${new Date().toISOString().split('T')[0]}.csv`

  const header = [
    'N° Document', 'Type', 'Client', 'NIF Client', 'Objet',
    "Date d'émission", "Date d'échéance", 'Remise (%)',
    'Sous-total HT (FCFA)', 'Montant remise (FCFA)', 'Base HT (FCFA)',
    'TVA 18% (FCFA)', 'CSS 1% (FCFA)', 'TOTAL TTC (FCFA)', 'Statut'
  ]

  const rows = factures.map(f => [
    f.numero,
    f.type === 'facture' ? 'Facture' : 'Pro Forma',
    f.client_nom,
    f.client_nif || '',
    f.objet || '',
    fmtDate(f.date_emission),
    fmtDate(f.date_echeance),
    f.remise_pct || 0,
    fmtNum(f.sous_total_ht),
    fmtNum(f.montant_remise),
    fmtNum(f.base_ht),
    fmtNum(f.tva),
    fmtNum(f.css),
    fmtNum(f.total_ttc),
    f.statut === 'payee' ? 'Payée' :
    f.statut === 'attente' ? 'En attente' :
    f.statut === 'retard' ? 'En retard' :
    f.statut === 'en_cours' ? 'En cours' : f.statut
  ])

  // Totaux en bas
  const totalHT   = factures.reduce((s,f) => s + (f.base_ht||0), 0)
  const totalTVA  = factures.reduce((s,f) => s + (f.tva||0), 0)
  const totalCSS  = factures.reduce((s,f) => s + (f.css||0), 0)
  const totalTTC  = factures.reduce((s,f) => s + (f.total_ttc||0), 0)

  rows.push([]) // ligne vide
  rows.push(['TOTAUX', '', '', '', '', '', '', '',
    '', '', fmtNum(totalHT), fmtNum(totalTVA), fmtNum(totalCSS), fmtNum(totalTTC), ''
  ])
  rows.push([`Exporté le ${new Date().toLocaleDateString('fr-FR')} — Galerie Médicale SAJ Groupe`])

  downloadCSV(filename, [header, ...rows])
}

export function exportRegistreExcel(factures) {
  const filename = `Registre_Factures_GalerieMedicale_${new Date().toISOString().split('T')[0]}.csv`

  const header = [
    'N°', 'N° Document', 'Type', 'Client', 'Objet',
    "Date d'émission", "Date d'échéance",
    'HT (FCFA)', 'TVA (FCFA)', 'CSS (FCFA)', 'TTC (FCFA)', 'Statut'
  ]

  const rows = factures.map((f, i) => [
    i + 1,
    f.numero,
    f.type === 'facture' ? 'Facture' : 'Pro Forma',
    f.client_nom,
    f.objet || '',
    fmtDate(f.date_emission),
    fmtDate(f.date_echeance),
    fmtNum(f.base_ht),
    fmtNum(f.tva),
    fmtNum(f.css),
    fmtNum(f.total_ttc),
    f.statut === 'payee' ? 'Payée' :
    f.statut === 'attente' ? 'En attente' :
    f.statut === 'retard' ? 'En retard' :
    f.statut === 'en_cours' ? 'En cours' : f.statut
  ])

  // Stats par statut
  const payees  = factures.filter(f => f.statut === 'payee')
  const attente = factures.filter(f => f.statut === 'attente')
  const retard  = factures.filter(f => f.statut === 'retard')

  rows.push([])
  rows.push(['=== RÉCAPITULATIF ==='])
  rows.push(['Total documents', factures.length])
  rows.push(['Factures payées', payees.length, '', '', '', '', '', '', '', '', fmtNum(payees.reduce((s,f) => s+(f.total_ttc||0),0))])
  rows.push(['En attente', attente.length, '', '', '', '', '', '', '', '', fmtNum(attente.reduce((s,f) => s+(f.total_ttc||0),0))])
  rows.push(['En retard', retard.length, '', '', '', '', '', '', '', '', fmtNum(retard.reduce((s,f) => s+(f.total_ttc||0),0))])
  rows.push([])
  rows.push([`Registre exporté le ${new Date().toLocaleDateString('fr-FR')} — Galerie Médicale SAJ Groupe`])

  downloadCSV(filename, [header, ...rows])
}

// ═══════════════════════════════════════════════════════════════
// EXPORT PRÉSENCES (Pointage employés)
// ═══════════════════════════════════════════════════════════════
export function exportPresencesExcel(profils, pointages, periode, vue) {
  const filename = `Presences_${periode}_${new Date().toISOString().split('T')[0]}.csv`

  if (vue === 'jour') {
    // Vue d'un jour : une ligne par employé
    const parUser = {}
    pointages.forEach(p => {
      if (!parUser[p.user_id]) parUser[p.user_id] = {}
      parUser[p.user_id][p.type] = p
    })

    const header = [
      'Employé', 'Rôle', 'Arrivée', 'Retard (min)',
      'Départ', 'Heures travaillées', 'Statut', 'Distance (m)'
    ]

    const rows = profils.map(prof => {
      const a = parUser[prof.id]?.arrivee
      const d = parUser[prof.id]?.depart
      let heures = ''
      if (a && d) {
        const ms = new Date(d.heure) - new Date(a.heure)
        const h = Math.floor(ms / 3600000)
        const m = Math.floor((ms % 3600000) / 60000)
        heures = `${h}h ${String(m).padStart(2, '0')}`
      }
      return [
        prof.full_name || prof.email,
        prof.role,
        fmtHeure(a?.heure),
        a?.retard_minutes || 0,
        fmtHeure(d?.heure),
        heures,
        !a ? 'Absent' : d ? 'Parti' : 'Présent',
        a?.distance_metres || ''
      ]
    })

    // Stats
    const present = profils.filter(p => parUser[p.id]?.arrivee).length
    const absent = profils.length - present
    const retards = profils.filter(p => (parUser[p.id]?.arrivee?.retard_minutes || 0) > 0).length

    rows.push([])
    rows.push(['=== RÉCAPITULATIF ==='])
    rows.push(['Date', fmtDate(periode)])
    rows.push(['Total employés', profils.length])
    rows.push(['Présents', present])
    rows.push(['Absents', absent])
    rows.push(['Retards', retards])
    rows.push([])
    rows.push([`Exporté le ${new Date().toLocaleDateString('fr-FR')} — Galerie Médicale SAJ Groupe`])

    downloadCSV(filename, [header, ...rows])
  } else {
    // Vue mois : récap par employé + détail jour par jour
    const recap = {}
    profils.forEach(prof => {
      recap[prof.id] = { profil: prof, jours: {}, presents: 0, retards: 0, minutesRetard: 0 }
    })
    pointages.forEach(p => {
      if (!recap[p.user_id]) return
      if (!recap[p.user_id].jours[p.date_jour]) recap[p.user_id].jours[p.date_jour] = {}
      recap[p.user_id].jours[p.date_jour][p.type] = p
    })
    Object.values(recap).forEach(r => {
      Object.values(r.jours).forEach(j => {
        if (j.arrivee) {
          r.presents++
          if (j.arrivee.retard_minutes > 0) {
            r.retards++
            r.minutesRetard += j.arrivee.retard_minutes
          }
        }
      })
    })

    // En-tête récap
    const headerRecap = ['Employé', 'Rôle', 'Jours présents', 'Retards', 'Total minutes retard']
    const rowsRecap = Object.values(recap).map(r => [
      r.profil.full_name || r.profil.email,
      r.profil.role,
      r.presents,
      r.retards,
      r.minutesRetard
    ])

    // Détail jour par jour
    const headerDetail = ['Date', 'Employé', 'Arrivée', 'Retard (min)', 'Départ']
    const rowsDetail = []
    Object.values(recap).forEach(r => {
      Object.entries(r.jours).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, j]) => {
        rowsDetail.push([
          fmtDate(date),
          r.profil.full_name || r.profil.email,
          fmtHeure(j.arrivee?.heure),
          j.arrivee?.retard_minutes || 0,
          fmtHeure(j.depart?.heure)
        ])
      })
    })

    const allRows = [
      [`=== RÉCAPITULATIF DU MOIS ${periode} ===`],
      [],
      headerRecap,
      ...rowsRecap,
      [],
      [],
      ['=== DÉTAIL JOUR PAR JOUR ==='],
      [],
      headerDetail,
      ...rowsDetail,
      [],
      [`Exporté le ${new Date().toLocaleDateString('fr-FR')} — Galerie Médicale SAJ Groupe`]
    ]

    downloadCSV(filename, allRows)
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT LIVRE DE PAIE (module Paie)
// ═══════════════════════════════════════════════════════════════
export function exportLivrePaieExcel(bulletins, periode) {
  const filename = `Livre_de_paie_${periode}_${new Date().toISOString().split('T')[0]}.csv`
  const header = [
    'N° Bulletin', 'Matricule', 'Employé', 'Poste', 'Jours travaillés', 'Jours absence',
    'Salaire de base', 'Heures sup.', 'Primes', 'BRUT',
    'CNSS salarié', 'CNAMGS salarié', 'Base imposable', 'IRPP', 'TCS', 'Autres retenues', 'Total retenues',
    'NET À PAYER', 'CNSS employeur', 'CNAMGS employeur', 'FNH', 'Charges patronales', 'COÛT TOTAL', 'Statut', 'Date paiement'
  ]
  const sum = (arr) => (arr || []).reduce((s, x) => s + (Number(x.montant) || 0), 0)
  const rows = bulletins.map(b => [
    b.numero, b.employe_matricule || '', b.employe_nom, b.employe_poste || '',
    b.jours_travailles, b.jours_absence,
    fmtNum(b.salaire_base_calcule), fmtNum(b.heures_sup_montant), fmtNum(sum(b.primes)), fmtNum(b.brut),
    fmtNum(b.cnss_salarie), fmtNum(b.cnamgs_salarie), fmtNum(b.base_imposable), fmtNum(b.irpp), fmtNum(b.tcs), fmtNum(b.autres_retenues), fmtNum(b.total_retenues),
    fmtNum(b.net_a_payer), fmtNum(b.cnss_employeur), fmtNum(b.cnamgs_employeur), fmtNum(b.fnh_employeur), fmtNum(b.total_charges_employeur), fmtNum(b.cout_total),
    b.statut === 'paye' ? 'Payé' : b.statut === 'valide' ? 'Validé' : 'Brouillon', fmtDate(b.date_paiement)
  ])
  const tot = (k) => fmtNum(bulletins.reduce((s, b) => s + (Number(b[k]) || 0), 0))
  rows.push([])
  rows.push(['TOTAUX', '', '', '', '', '',
    tot('salaire_base_calcule'), tot('heures_sup_montant'), fmtNum(bulletins.reduce((s, b) => s + sum(b.primes), 0)), tot('brut'),
    tot('cnss_salarie'), tot('cnamgs_salarie'), tot('base_imposable'), tot('irpp'), tot('tcs'), tot('autres_retenues'), tot('total_retenues'),
    tot('net_a_payer'), tot('cnss_employeur'), tot('cnamgs_employeur'), tot('fnh_employeur'), tot('total_charges_employeur'), tot('cout_total'), '', ''
  ])
  rows.push([`Livre de paie ${periode} — exporté le ${new Date().toLocaleDateString('fr-FR')} — Galerie Médicale SAJ Groupe`])
  downloadCSV(filename, [header, ...rows])
}

// ═══════════════════════════════════════════════════════════════
// EXPORT DÉPENSES & FACTURES FOURNISSEURS
// ═══════════════════════════════════════════════════════════════
export function exportDepensesExcel(depenses, libellePeriode = '') {
  const filename = `Depenses_${libellePeriode || 'export'}_${new Date().toISOString().split('T')[0]}.csv`
  const STATUTS = { brouillon: 'Brouillon', validee: 'Validée', payee: 'Payée', rejetee: 'Rejetée' }
  const MODES = { especes: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte' }
  const header = [
    'N°', 'Type', 'Date', 'Fournisseur', 'Réf. facture fournisseur', 'Catégorie', 'Libellé',
    'HT (FCFA)', 'TVA (FCFA)', 'CSS (FCFA)', 'TTC (FCFA)', 'Mode de paiement', 'Échéance', 'Date paiement', 'Statut', 'Saisi par', 'Justificatif'
  ]
  const rows = depenses.map(d => [
    d.numero, d.type === 'facture_fournisseur' ? 'Facture fournisseur' : 'Dépense', fmtDate(d.date_depense),
    d.fournisseur_nom || '', d.reference_fournisseur || '', d.categorie || '', d.libelle || '',
    fmtNum(d.montant_ht), fmtNum(d.tva), fmtNum(d.css), fmtNum(d.montant_ttc),
    MODES[d.mode_paiement] || d.mode_paiement || '', fmtDate(d.date_echeance), fmtDate(d.date_paiement),
    STATUTS[d.statut] || d.statut, d.created_by_nom || '', d.justificatif_nom ? 'Oui' : 'Non'
  ])
  const tot = (k) => fmtNum(depenses.reduce((s, d) => s + (Number(d[k]) || 0), 0))
  rows.push([])
  rows.push(['TOTAUX', '', '', '', '', '', '', tot('montant_ht'), tot('tva'), tot('css'), tot('montant_ttc'), '', '', '', '', '', ''])
  rows.push([`Exporté le ${new Date().toLocaleDateString('fr-FR')} — Galerie Médicale SAJ Groupe`])
  downloadCSV(filename, [header, ...rows])
}
