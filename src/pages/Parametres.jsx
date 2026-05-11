import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const DEFAULT_PARAMS = {
  societe_nom: 'Galerie Médicale',
  societe_soustitre: 'BY SAJ GROUPE',
  adresse: 'Gallerie Océane, Libreville, Gabon',
  telephone: '(00241) 60202900',
  email: 'acceuil@sajgroupe.com',
  site_web: 'www.sajgroupe.com',
  nif: '49761L',
  rccm: 'GA-LBV-01-2020-B12-00179',
  capital: '10 000 000',
  banque_nom: 'ORABANK',
  banque_compte: '40021 01000 21953600201 25',
  tva_taux: '18',
  css_taux: '1',
  delai_paiement: '30',
  penalites: '1,5',
  mention_proforma: 'Document non fiscal – Valable 30 jours – Ne vaut pas engagement de paiement',
  mention_facture: 'Toute facture non contestée dans 8 jours est réputée acceptée.',
}

export default function Parametres() {
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('societe')

  useEffect(() => { fetchParams() }, [])

  const fetchParams = async () => {
    const { data, error } = await supabase.from('parametres').select('*').limit(1).maybeSingle()
    if (error && error.code !== 'PGRST116') {
      console.error('Erreur chargement parametres:', error)
      toast.error('Impossible de charger les paramètres : ' + (error.message || error.hint || 'erreur inconnue'))
    }
    if (data) setParams({ ...DEFAULT_PARAMS, ...data })
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const { data: existing, error: selErr } = await supabase.from('parametres').select('id').limit(1).maybeSingle()
    if (selErr && selErr.code !== 'PGRST116') {
      toast.error('Erreur lecture : ' + (selErr.message || selErr.hint || 'erreur inconnue'))
      console.error(selErr)
      setSaving(false)
      return
    }
    const payload = { ...params }
    delete payload.id
    let result
    if (existing) {
      result = await supabase.from('parametres').update(payload).eq('id', existing.id)
    } else {
      result = await supabase.from('parametres').insert(payload)
    }
    if (result.error) {
      toast.error('Échec de la sauvegarde : ' + (result.error.message || result.error.hint || 'la table parametres existe-t-elle ?'))
      console.error('Erreur sauvegarde parametres:', result.error)
    } else {
      toast.success('Paramètres enregistrés !')
    }
    setSaving(false)
  }

  const set = (key, val) => setParams(p => ({ ...p, [key]: val }))

  const tabs = [
    { id: 'societe', label: '🏢 Société', icon: '🏢' },
    { id: 'coordonnees', label: '📞 Coordonnées', icon: '📞' },
    { id: 'juridique', label: '⚖️ Juridique', icon: '⚖️' },
    { id: 'bancaire', label: '🏦 Bancaire', icon: '🏦' },
    { id: 'fiscalite', label: '💰 Fiscalité', icon: '💰' },
    { id: 'documents', label: '📄 Documents', icon: '📄' },
  ]

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'var(--gray)' }}>Chargement...</div>

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:600 }}>Paramètres</h1>
          <p style={{ color:'var(--gray)', fontSize:13, marginTop:2 }}>
            Ces informations apparaissent sur toutes vos factures et bons de livraison.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement...' : '💾 Enregistrer les modifications'}
        </button>
      </div>

      <div style={{ display:'flex', gap:20 }}>
        {/* Onglets verticaux */}
        <div style={{ width:180, flexShrink:0 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                width:'100%', textAlign:'left', padding:'10px 14px',
                border:'none', borderRadius:8, cursor:'pointer',
                fontSize:13, fontWeight:activeTab===tab.id ? 600 : 400,
                background: activeTab===tab.id ? 'var(--teal-light)' : 'transparent',
                color: activeTab===tab.id ? 'var(--teal)' : 'var(--gray)',
                marginBottom:4, display:'flex', alignItems:'center', gap:8,
                borderLeft: activeTab===tab.id ? '3px solid var(--teal)' : '3px solid transparent',
                transition:'all .15s'
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="card" style={{ flex:1 }}>
          <div className="card-body">

            {/* SOCIÉTÉ */}
            {activeTab === 'societe' && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--teal)', marginBottom:16 }}>Informations sur la société</div>
                <div className="form-grid" style={{ gap:16 }}>
                  <div className="form-group">
                    <label>Nom de la société *</label>
                    <input value={params.societe_nom} onChange={e => set('societe_nom', e.target.value)} placeholder="Galerie Médicale" />
                  </div>
                  <div className="form-group">
                    <label>Sous-titre / Groupe</label>
                    <input value={params.societe_soustitre} onChange={e => set('societe_soustitre', e.target.value)} placeholder="BY SAJ GROUPE" />
                  </div>
                  <div className="form-group">
                    <label>Adresse complète *</label>
                    <input value={params.adresse} onChange={e => set('adresse', e.target.value)} placeholder="Gallerie Océane, Libreville, Gabon" />
                  </div>
                </div>
                <div className="alert alert-info mt-4" style={{ fontSize:12 }}>
                  Ces informations apparaissent dans le bloc ÉMETTEUR de toutes vos factures et bons de livraison.
                </div>
              </div>
            )}

            {/* COORDONNÉES */}
            {activeTab === 'coordonnees' && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--teal)', marginBottom:16 }}>Coordonnées de contact</div>
                <div className="form-grid" style={{ gap:16 }}>
                  <div className="form-group">
                    <label>Téléphone *</label>
                    <input value={params.telephone} onChange={e => set('telephone', e.target.value)} placeholder="(00241) 60202900" />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input type="email" value={params.email} onChange={e => set('email', e.target.value)} placeholder="acceuil@sajgroupe.com" />
                  </div>
                  <div className="form-group">
                    <label>Site web</label>
                    <input value={params.site_web} onChange={e => set('site_web', e.target.value)} placeholder="www.sajgroupe.com" />
                  </div>
                </div>
              </div>
            )}

            {/* JURIDIQUE */}
            {activeTab === 'juridique' && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--teal)', marginBottom:16 }}>Informations juridiques</div>
                <div className="form-grid" style={{ gap:16 }}>
                  <div className="form-group">
                    <label>NIF *</label>
                    <input value={params.nif} onChange={e => set('nif', e.target.value)} placeholder="49761L" />
                  </div>
                  <div className="form-group">
                    <label>RCCM *</label>
                    <input value={params.rccm} onChange={e => set('rccm', e.target.value)} placeholder="GA-LBV-01-2020-B12-00179" />
                    <span style={{ fontSize:11, color:'var(--gray)', marginTop:4 }}>Registre du Commerce et du Crédit Mobilier</span>
                  </div>
                  <div className="form-group">
                    <label>Capital social (FCFA)</label>
                    <input value={params.capital} onChange={e => set('capital', e.target.value)} placeholder="10 000 000" />
                  </div>
                </div>
                {/* Aperçu pied de page */}
                <div style={{ marginTop:20, padding:14, background:'var(--lgray)', borderRadius:8 }}>
                  <div style={{ fontSize:11, color:'var(--gray)', marginBottom:8, textTransform:'uppercase', letterSpacing:.5 }}>Aperçu pied de page facture</div>
                  <div style={{ fontFamily:'Arial, sans-serif', fontSize:10, color:'#6D6D6D', textAlign:'center', lineHeight:1.8 }}>
                    Société à Responsabilité Limitée au Capital de {params.capital} FCFA | NIF : {params.nif} | RCCM : {params.rccm}
                    <br/>✆ {params.telephone} | ✉ {params.email} | 🌐 {params.site_web}
                  </div>
                </div>
              </div>
            )}

            {/* BANCAIRE */}
            {activeTab === 'bancaire' && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--teal)', marginBottom:16 }}>Informations bancaires</div>
                <div className="form-grid" style={{ gap:16 }}>
                  <div className="form-group">
                    <label>Nom de la banque</label>
                    <input value={params.banque_nom} onChange={e => set('banque_nom', e.target.value)} placeholder="ORABANK" />
                  </div>
                  <div className="form-group">
                    <label>Numéro de compte</label>
                    <input value={params.banque_compte} onChange={e => set('banque_compte', e.target.value)} placeholder="40021 01000 21953600201 25" />
                  </div>
                </div>
                <div className="alert alert-info mt-4" style={{ fontSize:12 }}>
                  Ces informations apparaissent dans la section "Modalités de paiement" de vos factures.
                </div>
              </div>
            )}

            {/* FISCALITÉ */}
            {activeTab === 'fiscalite' && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--teal)', marginBottom:16 }}>Paramètres fiscaux</div>
                <div className="form-grid form-grid-3" style={{ gap:16 }}>
                  <div className="form-group">
                    <label>Taux TVA (%)</label>
                    <input type="number" value={params.tva_taux} onChange={e => set('tva_taux', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Taux CSS (%)</label>
                    <input type="number" value={params.css_taux} onChange={e => set('css_taux', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Délai de paiement (jours)</label>
                    <input type="number" value={params.delai_paiement} onChange={e => set('delai_paiement', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Pénalités de retard (%/mois)</label>
                    <input value={params.penalites} onChange={e => set('penalites', e.target.value)} placeholder="1,5" />
                  </div>
                </div>
                <div className="alert alert-warn mt-4" style={{ fontSize:12 }}>
                  ⚠️ Attention : modifier les taux TVA/CSS n'affecte pas les factures déjà créées, uniquement les nouvelles.
                </div>
              </div>
            )}

            {/* DOCUMENTS */}
            {activeTab === 'documents' && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--teal)', marginBottom:16 }}>Mentions légales sur les documents</div>
                <div className="form-grid" style={{ gap:16 }}>
                  <div className="form-group">
                    <label>Mention pro forma</label>
                    <textarea value={params.mention_proforma} onChange={e => set('mention_proforma', e.target.value)} style={{ minHeight:80 }} />
                  </div>
                  <div className="form-group">
                    <label>Mention facture (conditions générales)</label>
                    <textarea value={params.mention_facture} onChange={e => set('mention_facture', e.target.value)} style={{ minHeight:80 }} />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
