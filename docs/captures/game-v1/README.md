# Captures — Jeu complet V1 (doc 42)

Chromium + SwiftShader (rendu logiciel) : preuves de reproductibilité et de contenu, **pas** de performance GPU.

| Fichier | Contenu | Produit par |
| --- | --- | --- |
| `castle-town.jpg` | Ville au château v2 : remparts circulaires, tours, cathédrale, maisons depuis la place, champs clos | `tools/capture-world-views.mjs` (île, x −80, z −1640, pitch 0,42, dist 120) |
| `climb.png` | Écureuil en escalade sur une falaise de l’île (jauge d’endurance) | `tools/test-climb-browser.mjs` |
| `mine-organic.png` | Galerie de mine au relief déplacé dans la roche (voûte, parois irrégulières) | `tools/test-b1-browser.mjs` (niveau 3) |
| `../island-density.png` | Carte de densité de l’île (végétation / 64 m, paysages, PNJ en rouge, comptoirs en bleu) | `tools/render-density-map.mjs` |
