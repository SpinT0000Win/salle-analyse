# Salle d'analyse — V1

Application web installable (PWA) pour analyser ses parties d'échecs chess.com et Lichess avec Stockfish 19 lite, directement sur le téléphone.

## Mettre l'appli en ligne avec GitHub Pages (gratuit, une dizaine de minutes)

1. Crée un compte sur https://github.com si tu n'en as pas.
2. Clique sur **New repository** (bouton « + » en haut à droite).
   - Nom : `salle-analyse`
   - Visibilité : **Public** (obligatoire pour GitHub Pages gratuit)
   - Clique sur **Create repository**.
3. Sur la page du dépôt vide, clique sur **uploading an existing file**.
4. Dézippe l'archive sur ton ordinateur, ouvre le dossier `salle-analyse-app`, sélectionne **tout son contenu** (pas le dossier lui-même) et glisse-le dans la page.
   - `index.html` doit se retrouver à la racine du dépôt, à côté des dossiers `js`, `engine`, `assets` et `icons`.
5. Clique sur **Commit changes**.
6. Va dans **Settings → Pages**.
   - Source : **Deploy from a branch**
   - Branch : **main**, dossier **/ (root)**, puis **Save**.
7. Attends une à deux minutes. L'adresse s'affiche en haut de la page Pages, sous la forme :
   `https://TON-PSEUDO-GITHUB.github.io/salle-analyse/`

C'est ce lien que tu ouvres sur ton téléphone et que tu envoies à tes amis.

## Installer l'appli sur Android

1. Ouvre le lien dans **Chrome**.
2. Menu ⋮ → **Ajouter à l'écran d'accueil** (ou **Installer l'application**).
3. L'icône « Salle d'analyse » apparaît avec tes autres applis.

## Mettre à jour l'appli plus tard

1. Dépose les nouveaux fichiers dans le dépôt GitHub (même méthode qu'à l'étape 4 ; GitHub remplace les anciens).
2. Dans `sw.js`, change le numéro de version (par exemple `sa-v1.0.0` → `sa-v1.0.1`). Sans ça, les téléphones gardent l'ancienne version en cache.
3. Sur le téléphone, ferme et rouvre l'appli : la nouvelle version se charge.

Les pseudos et les analyses déjà faites ne sont pas touchés par une mise à jour.

## Ce qu'il faut savoir

- **Garde l'appli ouverte pendant une analyse.** Android met en pause une appli web fermée ou écran éteint. L'appli empêche l'écran de se mettre en veille pendant le calcul.
- **Durée :** environ 2 à 3 minutes par partie à profondeur 16 sur un téléphone récent.
- **Parties récupérées :** les 3 derniers mois sur chess.com, les 100 dernières parties sur Lichess, selon les cadences choisies. Seules les parties publiques sont accessibles.
- **Données :** tout reste dans le navigateur du téléphone. Pense à **Réglages → Exporter** avant de changer de téléphone ou de vider les données de Chrome.
- **Hors connexion :** l'analyse libre fonctionne sans réseau ; l'import des parties a besoin d'Internet.

## Licences

- Stockfish 19 lite (stockfish.js, Nathan Rugg / Chess.com) : GPLv3, texte dans `engine/LICENCE-Stockfish-GPLv3.txt`, source : https://github.com/nmrugg/stockfish.js
- Pièces : Cburnett (Wikimedia Commons), CC BY-SA 3.0, via cm-chessboard.
- chess.js 0.10.3 (Jeff Hlywa) : licence BSD 2 clauses.
