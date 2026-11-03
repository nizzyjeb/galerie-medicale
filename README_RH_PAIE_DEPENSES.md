# Galerie Médicale — Modules Ressources Humaines (Employés, Paie) et Dépenses & factures

Livraison : 3 nouveaux modules, 1 migration SQL, 2 fichiers de navigation mis à jour.
Les fichiers sont pré-validés (`vite build` OK).

## 1. Contenu du ZIP

| Fichier | Action | Rôle |
|---|---|---|
| `supabase_migration_rh_paie_depenses.sql` | **Exécuter dans Supabase** (1 seule fois) | Tables `employes`, `parametres_paie`, `bulletins_paie`, `categories_depenses`, `depenses`, bucket Storage `justificatifs`, politiques RLS |
| `src/lib/paie.js` | Nouveau | Moteur de calcul de la paie (CNSS, CNAMGS, IRPP, TCS) |
| `src/pages/Employes.jsx` | Nouveau | Fiches employés (poste, contrat, salaire, primes fixes, situation familiale, CNSS/CNAMGS, paiement) |
| `src/pages/Paie.jsx` | Nouveau | Génération mensuelle des bulletins, édition (absences, primes, retenues), validation, impression, livre de paie, récapitulatif déclarations, paramètres de paie |
| `src/components/BulletinPrint.jsx` | Nouveau | Bulletin de paie A4 imprimable (un ou tous) |
| `src/pages/Depenses.jsx` | Nouveau | Saisie des dépenses et factures fournisseurs, justificatif joint, circuit de validation, catégories, export Excel |
| `src/lib/exportExcel.js` | **Remplacer** | Ajout de `exportLivrePaieExcel` et `exportDepensesExcel` (le reste est inchangé) |
| `src/App.jsx` | **Remplacer** | Routes `/employes`, `/paie`, `/depenses` |
| `src/components/Layout.jsx` | **Remplacer** | Menu : « Dépenses & factures » (section Facturation), « Employés » et « Paie » (section Ressources Humaines) + 3 icônes |

## 2. Installation (dans l'ordre)

### Étape 1 — Base de données Supabase
1. Ouvrir **Supabase → SQL Editor → New query**.
2. Coller tout le contenu de `supabase_migration_rh_paie_depenses.sql` (aucune ligne de commentaire, il se colle tel quel).
3. **Run**. Le script est ré-exécutable sans risque (`if not exists`, `on conflict do nothing`).
4. Vérifier dans **Storage** qu'un bucket privé `justificatifs` apparaît.

### Étape 2 — Fichiers (dans VS Code, dossier `C:\Users\nizzy\Documents\galerie-medicale`)
Copier les fichiers du ZIP en respectant exactement les chemins :
```
src/lib/paie.js
src/lib/exportExcel.js            (remplace l'existant)
src/pages/Employes.jsx
src/pages/Paie.jsx
src/pages/Depenses.jsx
src/components/BulletinPrint.jsx
src/components/Layout.jsx         (remplace l'existant)
src/App.jsx                       (remplace l'existant)
```
Attention à OneDrive : vérifier que le ZIP a bien été extrait dans `Documents\galerie-medicale` et non dans `OneDrive\...`.

### Étape 3 — Déploiement (PowerShell)
```
cd C:\Users\nizzy\Documents\galerie-medicale
git add .
git commit -m "Modules RH : employés, paie, dépenses et factures fournisseurs"
git push
```
Vercel redéploie en ~2 minutes → recharger avec **Ctrl+Shift+R**.

## 3. Mode d'emploi

### Employés (admin : création/modification ; comptable : lecture)
- Matricule proposé automatiquement (`EMP-001`, …).
- Le **salaire de base** et les **primes fixes** (transport, logement, autres) sont repris automatiquement sur chaque bulletin.
- **Situation familiale + enfants** → nombre de parts IRPP (1 part célibataire, 2 parts marié, +0,5 par enfant, max 6).
- Un employé peut être lié à un **compte utilisateur** de l'application : il pourra alors voir ses propres bulletins (lecture seule via RLS).
- « Désactiver » retire l'employé de la génération de paie sans supprimer son historique.

### Paie
1. Choisir le **mois** → bouton **« Générer la paie (n) »** : crée un bulletin brouillon par employé actif (numéros `BP-AAAAMM-001`…).
2. **Modifier** un bulletin : jours d'absence, heures sup (montant), primes du mois (imposables ou non), retenues (avance, prêt…), date/mode de paiement. Le calcul se met à jour en direct.
3. **Valider** (admin) → **Payé** (admin). Un bulletin validé ne peut plus être modifié par un comptable ; l'admin peut le repasser en brouillon (↩).
4. **🖨** imprime le bulletin ; **« Imprimer tout »** imprime tous les bulletins affichés (un par page).
5. **« Livre de paie (Excel) »** exporte le mois complet ; l'onglet **« Récapitulatif & déclarations »** donne les montants CNSS / CNAMGS / FNH / IRPP / TCS à reverser.
6. Onglet **« Paramètres de paie »** (admin) : taux, plafonds, abattement frais pro, TCS, barème IRPP par tranche.

Chrome : cocher « Graphiques d'arrière-plan », décocher « En-têtes et pieds de page » lors de l'impression.

### Valeurs par défaut du calcul (à faire vérifier par votre comptable avant la première paie)
| Rubrique | Défaut | Base |
|---|---|---|
| CNSS salarié / employeur | 2,5 % / 16 % | brut cotisable plafonné à 1 500 000 FCFA/mois |
| CNAMGS salarié / employeur | 2 % / 4,1 % | brut cotisable plafonné à 2 500 000 FCFA/mois |
| FNH employeur | 2 % | brut cotisable (mettre 0 si non applicable) |
| Abattement frais professionnels | 20 % | (brut − CNSS − CNAMGS) |
| IRPP | barème annuel progressif 0 → 35 % | base imposable × 12 ÷ parts |
| TCS | 5 % | salaire après cotisations, exonéré si ≤ 150 000 FCFA/mois |

Tout est modifiable dans l'application sans toucher au code.

### Dépenses & factures fournisseurs (admin + comptable)
- **« + Nouvelle saisie »** : type (dépense ou facture fournisseur), date, catégorie, fournisseur (de la base ou saisie libre), n° de facture fournisseur, montant **HT ou TTC** (TVA 18 % et CSS 1 % calculées automatiquement, case « Exonéré de TVA »), mode de paiement, échéance, **justificatif** (photo ou PDF, max 10 Mo).
- Circuit : **À valider** (saisie comptable) → **Validée** (admin) → **Payée** (admin). L'admin peut **Rejeter** avec un motif. Numérotation `DEP-AAAAMM-001`.
- Un comptable ne peut modifier/supprimer que ses saisies encore « À valider » (règle appliquée aussi par la base de données).
- Filtres par mois / type / statut / catégorie, recherche, totaux, répartition par catégorie, **export Excel**, 📎 ouvre le justificatif (lien sécurisé 10 min).
- **« Catégories »** (admin) : ajouter / désactiver des catégories.

## 4. Rôles
| Page | admin | comptable | autres |
|---|---|---|---|
| Employés | tout | lecture | — |
| Paie | tout (validation, paiement, paramètres) | générer, éditer les brouillons, imprimer | — |
| Dépenses | tout (validation, rejet, paiement, catégories) | saisir, modifier ses brouillons | — |

## 5. Points d'attention
- Les bulletins stockent une **copie figée** des montants : modifier un employé ou un paramètre n'affecte que les bulletins générés après coup (ré-enregistrer un bulletin brouillon le recalcule).
- Supprimer un employé conserve ses bulletins (lien mis à `null`), conformément à la règle déjà appliquée aux factures.
- Les justificatifs sont dans un bucket **privé** : seuls admin et comptable peuvent les consulter.
