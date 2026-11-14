# Captures de contrôle — World Production V1

Chromium headless + **SwiftShader** (logiciel), 960 × 540, qualité « élevée » demandée (le gestionnaire de budget peut la réduire sous SwiftShader). Points de vue définis dans [tools/world-views.json](../../tools/world-views.json), reproductibles avec `npm run capture:views -- <url> <dossier>` (`FORMAT=jpeg`). **Preuve de reproductibilité, pas une approbation artistique.**

« Avant » = `main` `b2d2b9d` (île preset sans contenu) avec le seul ajout des paramètres de caméra `pitch`/`dist` ; « Après » = cette branche.

| Vue | Avant | Après | Appels avant → après | Triangles avant → après | Instances GLB LOD0 / LOD1 |
| --- | --- | --- | --- | --- | --- |
| Panorama depuis les hauteurs (sommet nord) (`ref-panorama`) | — | ![après](after/ref-panorama.jpg) | 109 | 71.2 k | 8 / 16 |
| Forêt dense de la vallée (`ref-forest`) | — | ![après](after/ref-forest.jpg) | 89 | 48.9 k | 65 / 193 |
| Vallée forestière (`ref-valley`) | — | ![après](after/ref-valley.jpg) | 103 | 56.9 k | 35 / 106 |
| Rivière, berges et pont (`ref-river`) | — | ![après](after/ref-river.jpg) | 100 | 50.1 k | 11 / 69 |
| Gorge et cascade (`ref-falls`) | — | ![après](after/ref-falls.jpg) | 90 | 41.5 k | 11 / 51 |
| Falaise depuis sa base (`ref-cliff`) | — | ![après](after/ref-cliff.jpg) | 80 | 34.0 k | 8 / 18 |
| Littoral sableux et ponton (`ref-coast`) | — | ![après](after/ref-coast.jpg) | 81 | 27.4 k | 2 / 56 |
| Village, champ et moulin (`ref-village`) | — | ![après](after/ref-village.jpg) | 138 | 71.1 k | 1 / 11 |
| Vue en planage au-dessus de plusieurs biotopes (`ref-flight`) | — | ![après](after/ref-flight.jpg) | 154 | 74.7 k | 1 / 4 |
| Panorama depuis le volcan (`island-volcano`) | ![avant](before/island-volcano.jpg) | ![après](after/island-volcano.jpg) | 94 → 119 | 71.9 k → 73.6 k | 1 / 1 |
| Forêt dense (vallée ouest) (`island-forest`) | ![avant](before/island-forest.jpg) | ![après](after/island-forest.jpg) | 83 → 101 | 49.3 k → 58.9 k | 62 / 51 |
| Vallée forestière ouest (`island-valley`) | ![avant](before/island-valley.jpg) | ![après](after/island-valley.jpg) | 87 → 110 | 61.1 k → 69.5 k | 34 / 95 |
| Rivière et berges (`island-river`) | ![avant](before/island-river.jpg) | ![après](after/island-river.jpg) | 77 → 91 | 39.3 k → 43.5 k | 7 / 65 |
| Gorge et cascade (`island-falls`) | ![avant](before/island-falls.jpg) | ![après](after/island-falls.jpg) | 80 → 82 | 43.7 k → 43.5 k | 14 / 41 |
| Falaise est depuis sa base (`island-cliff`) | ![avant](before/island-cliff.jpg) | ![après](after/island-cliff.jpg) | 70 → 71 | 24.9 k → 29.3 k | 7 / 17 |
| Littoral sud et port (`island-coast`) | ![avant](before/island-coast.jpg) | ![après](after/island-coast.jpg) | 70 → 75 | 26.2 k → 25.7 k | 1 / 3 |
| Village principal (`island-village`) | ![avant](before/island-village.jpg) | ![après](after/island-village.jpg) | 94 → 142 | 51.9 k → 66.5 k | 3 / 10 |
| Planage au-dessus de plusieurs biotopes (`island-flight`) | ![avant](before/island-flight.jpg) | ![après](after/island-flight.jpg) | 108 → 129 | 53.9 k → 70.0 k | 46 / 104 |
