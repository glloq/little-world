# Captures — Jeu complet V1 (doc 42)

Chromium + SwiftShader (rendu logiciel) : preuves de reproductibilité et de contenu, **pas** de performance GPU.

| Fichier | Contenu | Produit par |
| --- | --- | --- |
| `castle-town.jpg` | Ville au château v2 : remparts circulaires, tours, cathédrale, maisons depuis la place, champs clos | `tools/capture-world-views.mjs` (île, x −80, z −1640, pitch 0,42, dist 120) |
| `climb.png` | Écureuil en escalade sur une falaise de l’île (jauge d’endurance) | `tools/test-climb-browser.mjs` |
| `mine-organic.png` | Galerie de mine au relief déplacé dans la roche (voûte, parois irrégulières) | `tools/test-b1-browser.mjs` (niveau 3) |
| `forests-far.jpg` | Vue aérienne (niveau 2) : forêts visibles jusqu’au pied du volcan (silhouettes + canopée lointaine) | `tools/capture-world-views.mjs` (x 0, z −900, pitch 0,55, dist 450) |
| `forest-edge.jpg` | Lisière de la vallée forestière : arbres prioritaires, petits éléments réduits | sonde de développement (même vue) |
| `../island-density.png` | Carte de densité de l’île (végétation / 64 m, paysages, PNJ en rouge, comptoirs en bleu) | `tools/render-density-map.mjs` |
