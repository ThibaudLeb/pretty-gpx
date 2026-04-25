# Route Art Poster Forge

Génère de beaux posters A4 depuis vos traces GPX — 100% client-side, zéro serveur.

## Fonctionnalités

- **Upload GPX** — drag & drop ou sélection fichier, un ou plusieurs fichiers simultanément
- **Aperçu en temps réel** — rendu Canvas natif, mise à jour instantanée
- **Édition du titre** — personnalisez le titre du poster
- **Export PNG haute résolution** — 2480 × 3508 px (A4 @ 300 dpi)
- **100% client-side** — aucun serveur, aucune API externe, aucune donnée envoyée

## Stack technique

- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Canvas API natif pour le rendu du poster
- DOMParser natif pour le parsing GPX (zéro dépendance externe)

## Déploiement sur Vercel

**En un clic :** connectez votre repo GitHub à Vercel et déployez.

```
Framework Preset : Vite
Build Command    : npm run build
Output Directory : dist
```

Aucune variable d'environnement requise.

## Développement local

```bash
npm install
npm run dev
```

Ouvrez [http://localhost:5173](http://localhost:5173).

## Build de production

```bash
npm run build
npm run preview
```

## Structure du projet

```
src/
  pages/Index.tsx          # Page principale (upload, preview, export)
  utils/
    gpxParser.ts           # Parser GPX + calcul distance/dénivelé (Haversine)
    posterRenderer.ts      # Moteur de rendu Canvas (carte + profil altimétrique)
  components/ui/           # Composants shadcn/ui (button, card, input, label…)
  App.tsx                  # Racine React
```

## Format du poster

| Zone           | Hauteur relative | Contenu                                       |
|----------------|-----------------|-----------------------------------------------|
| Titre          | 15 %            | Texte cursive bleu marine centré              |
| Carte          | 55 %            | Projection équirectangulaire de la trace GPX  |
| Profil + stats | 30 %            | Silhouette du dénivelé + distance et D+       |

Résolution interne : **2480 × 3508 px** (A4 portrait @ 300 dpi).

## Utilisation

1. Glissez un ou plusieurs fichiers `.gpx` dans la zone d'upload
2. Modifiez le titre si besoin
3. Cliquez sur **Télécharger le poster PNG**

Le fichier PNG est généré entièrement dans votre navigateur.
