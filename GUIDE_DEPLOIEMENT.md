# 🚀 Guide de déploiement — Galerie Médicale
## Application en ligne avec Supabase + Vercel

---

## ÉTAPE 1 — Créer votre base de données Supabase (10 min)

1. Allez sur **https://supabase.com** → cliquez "Start your project"
2. Inscrivez-vous avec votre email (ou Google)
3. Cliquez **"New project"**
   - Nom du projet : `galerie-medicale`
   - Mot de passe base de données : choisissez un mot de passe fort (notez-le !)
   - Région : choisissez **Europe (Frankfurt)** — la plus proche du Gabon
4. Attendez ~2 minutes que le projet se crée
5. Dans le menu gauche, cliquez **"SQL Editor"** → **"New query"**
6. Copiez-collez le contenu du fichier `supabase_schema.sql` et cliquez **"Run"**
7. ✅ Votre base de données est prête !

---

## ÉTAPE 2 — Récupérer vos clés Supabase

1. Dans Supabase, allez dans **Settings** (icône engrenage) → **API**
2. Copiez :
   - **Project URL** → ex: `https://abcdefgh.supabase.co`
   - **anon public key** → longue chaîne de caractères
3. Gardez ces deux valeurs sous la main pour l'étape 4

---

## ÉTAPE 3 — Mettre le code sur GitHub (5 min)

1. Allez sur **https://github.com** → créez un compte si vous n'en avez pas
2. Cliquez le **"+"** en haut à droite → **"New repository"**
   - Nom : `galerie-medicale`
   - Visibilité : **Private** (privé)
   - Cliquez "Create repository"
3. Sur votre ordinateur, ouvrez le terminal (ou PowerShell) dans le dossier `galerie-medicale`
4. Tapez ces commandes :
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/VOTRE_USERNAME/galerie-medicale.git
   git push -u origin main
   ```

---

## ÉTAPE 4 — Déployer sur Vercel (5 min)

1. Allez sur **https://vercel.com** → "Sign Up" → connectez-vous avec **GitHub**
2. Cliquez **"Add New Project"** → sélectionnez votre repo `galerie-medicale`
3. Avant de cliquer "Deploy", cliquez sur **"Environment Variables"** et ajoutez :

   | Nom | Valeur |
   |-----|--------|
   | `VITE_SUPABASE_URL` | votre Project URL (ex: https://abcdefgh.supabase.co) |
   | `VITE_SUPABASE_ANON_KEY` | votre anon public key |

4. Cliquez **"Deploy"** et attendez ~2 minutes
5. ✅ Votre application est en ligne ! Vercel vous donne un lien comme :
   `https://galerie-medicale-xyz.vercel.app`

---

## ÉTAPE 5 — Créer votre compte administrateur

1. Dans Supabase, allez dans **Authentication** → **Users** → **"Add user"**
2. Entrez votre email et un mot de passe
3. Dans **SQL Editor**, tapez :
   ```sql
   UPDATE public.profiles 
   SET role = 'admin' 
   WHERE email = 'VOTRE@EMAIL.COM';
   ```
4. Connectez-vous sur votre lien Vercel avec cet email et ce mot de passe
5. ✅ Vous êtes administrateur !

---

## ÉTAPE 6 — Personnaliser votre domaine (optionnel)

Si vous souhaitez une URL personnalisée comme `factures.galeriemedicale.ga` :
1. Dans Vercel → votre projet → **Settings** → **Domains**
2. Ajoutez votre domaine et suivez les instructions DNS

---

## ÉTAPE 7 — Ajouter vos utilisateurs

1. Connectez-vous à l'application avec votre compte admin
2. Allez dans **Utilisateurs** → **"+ Ajouter utilisateur"**
3. Remplissez le nom, email, mot de passe provisoire et rôle
4. Communiquez les identifiants à chaque membre de l'équipe

---

## Récapitulatif des accès

| Rôle | Accès |
|------|-------|
| **Administrateur** | Tout (factures, produits, utilisateurs, dashboard) |
| **Comptable / Secrétaire** | Factures, pro formas, produits, dashboard |
| **Livreur / Commercial** | Bons de livraison, dashboard limité |

---

## En cas de problème

- **L'application ne se charge pas** : vérifiez les variables d'environnement dans Vercel
- **Erreur de connexion** : vérifiez que l'email existe dans Supabase Authentication
- **Les données n'apparaissent pas** : vérifiez que le schéma SQL a bien été exécuté
- **Besoin d'aide** : Claude peut vous aider à déboguer !

---

*Application développée pour Galerie Médicale – SAJ Groupe, Libreville, Gabon*
