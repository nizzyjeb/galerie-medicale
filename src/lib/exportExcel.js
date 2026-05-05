// Export Excel sans dépendance externe — génère un fichier CSV lisible par Excel
// avec séparateur point-virgule (standard Europe/Afrique francophone)

const fmtNum = (n) => Math.round(n || 0).toLocaleString('fr-FR')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : ''

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
