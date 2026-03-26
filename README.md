# 🏫 Lycée Professionnel Jules Verne — Kiosque Interactif

## Structure du projet

```
lycee-jules-verne/
├── index.html          ← Page d'accueil (20s puis redirect)
├── formations.html     ← Grille des 6 formations
├── f1.html             ← Électricité (image + vidéo)
├── f2.html             ← Menuiserie (grille 4 images)
├── f21.html            ← CAP Menuisier Installateur
├── f22.html            ← CAP Menuiserie Alu Verre
├── f23.html            ← BAC PRO Menuisier Agenceur
├── f24.html            ← BAC PRO Menuiserie Alu Verre
├── f3.html             ← Bâtiment Gros Œuvre (grille 4)
├── f31.html            ← CAP Maçon
├── f32.html            ← CAP Peintre Revêtement
├── f33.html            ← BAC PRO Aménagement Finition
├── f34.html            ← Titre Pro Peintre Façadier
├── f4.html             ← 3ème Prépa-Métiers
├── f5.html             ← CAP Maintenance Bâtiment
├── f6.html             ← CDI (image cliquable)
├── pages.json          ← Configuration centralisée
├── css/
│   └── styles.css      ← Tous les styles
├── js/
│   ├── pageBuilder.js  ← Moteur de rendu dynamique
│   └── handTracker.js  ← Module reconnaissance mains (MediaPipe)
└── images/             ← Placez vos images PNG ici
```

## Images à fournir (dossier `images/`)

| Fichier      | Page          | Description                    |
|-------------|---------------|--------------------------------|
| home.png    | index         | Photo de fond accueil          |
| 1.png–6.png | formations    | Vignettes des 6 filières       |
| f11.png     | f1            | Électricité                    |
| f21–f24.png | f2            | Vignettes menuiserie           |
| f211.png    | f21           | CAP Menuisier                  |
| f221.png    | f22           | CAP Alu Verre                  |
| f231.png    | f23           | BAC PRO Agenceur               |
| f241.png    | f24           | BAC PRO Alu Verre              |
| f31–f34.png | f3            | Vignettes bâtiment             |
| f311.png    | f31           | CAP Maçon                      |
| f321.png    | f32           | CAP Peintre                    |
| f331.png    | f33           | BAC PRO Aménagement            |
| f341.png    | f34           | Peintre façadier               |
| f411.png    | f4            | Prépa métiers                  |
| f511.png    | f5            | Maintenance bâtiment           |
| f51.png     | f6            | CDI                            |

## Lancement

⚠️ **Le projet nécessite un serveur HTTP local** (les modules ES et la webcam ne fonctionnent pas en `file://`).

### Option 1 — Python (recommandé)
```bash
cd lycee-jules-verne
python3 -m http.server 8080
# Ouvrir : http://localhost:8080
```

### Option 2 — Node.js / npx
```bash
npx serve lycee-jules-verne
```

### Option 3 — VS Code
Installer l'extension **Live Server** puis clic droit → "Open with Live Server" sur `index.html`.

## Affichage plein écran
- Appuyer sur **F11** pour le mode kiosque
- Ou démarrer Chrome en mode kiosque :
  ```
  chrome --kiosk http://localhost:8080
  ```

## Gestes reconnus

| Geste | Action |
|-------|--------|
| ☝️ Index seul levé | Affiche le curseur à l'écran |
| 🤏 Pouce + Index (main droite) sur une image | Ouvre le lien |
| 🤏🤏 Deux mains qui s'écartent (pinch bilatéral) | Zoom proportionnel |
| 🤏🤏 Deux mains qui se rapprochent | Retour zoom initial |
| ✊ Poing fermé | Page précédente |

## Technologies utilisées

- **MediaPipe Tasks Vision** (HandLandmarker) via CDN — bibliothèque la plus rapide et fiable pour la détection de mains en JavaScript
- HTML5 / CSS3 / JavaScript ES Modules
- API YouTube IFrame
- Architecture modulaire : JSON config → pageBuilder → handTracker

## Personnalisation via `pages.json`

Pour modifier les liens YouTube ou ajouter/retirer des formations, éditez uniquement `pages.json`. Le reste du code s'adapte automatiquement.
