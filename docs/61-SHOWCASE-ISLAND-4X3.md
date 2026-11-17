# Little World — île vitrine unique 4 × 3 km

## Source de vérité

La seule carte exemple proposée au joueur et à l'auteur est **Île du volcan**
(4 000 × 3 000 m). Les autres dimensions et formes restent disponibles dans
l'assistant de création pour concevoir des mondes personnels.

| Usage | Fichier / accès |
| --- | --- |
| Génération déterministe | `tools/generate-island.mjs` (`npm run generate:island`) |
| Source éditable V3 | `maps/island.project.json` |
| Monde jouable compilé | `public/maps/island/manifest.json` + chunks |
| Source servie au Studio | `/little-world/maps/island.project.json` (via Vite, sans copie suivie) |
| Jeu | `/little-world/` |
| Studio | `/little-world/studio/` → Explorer un monde prêt → Île du volcan |
| Anciennes cartes techniques | `tests/fixtures/legacy-maps/` (non publiées) |

Ne pas modifier directement les JSON générés. Développer les sources du
générateur et les fonctions de composition, puis régénérer et comparer.

**Attention :** une modification de l'île depuis le Studio reste locale
(IndexedDB / export ZIP). Elle n'altère pas la carte publiée tant que les
données ne sont pas réintégrées au générateur ou au pipeline de publication.

## Cartes techniques conservées

Les six scènes historiquement distribuées (bêta, B1, falaises, mouvements,
géographie, production) servent toujours aux tests précis de géométrie,
collisions, hydrologie, activités, reproduction et performances. Elles sont
isolées sous `tests/fixtures/legacy-maps/authoring/` (sources) et
`tests/fixtures/legacy-maps/published/` (sorties de compilation).

Ces données ne sont jamais incluses dans le site public. La CI construit
d'abord un artefact contenant **uniquement l'île**, puis ajoute les fixtures
au répertoire de prévisualisation à l'aide de
`node tools/stage-test-maps.mjs dist/maps`. Les contrôles du Studio y accèdent
avec `studio/?testFixtures=1` ; la publication GitHub Pages ne réalise
jamais cette opération.

Les projets utilisateur existants dans le navigateur et les archives JSON/ZIP
restent indépendants et ne sont pas supprimés.

## Prochaines améliorations de l'île 4 × 3 km

| Priorité | Domaine | Critères de validation |
| --- | --- | --- |
| P0 | Falaises, cols, massifs, strates et éboulis | Continuité heightfield / faces rocheuses ; aucun trou |
| P0 | Bassins, rivières, lacs, cascades, sources thermales | Continuité des réseaux et navigation |
| P0 | Forêts, plaines, marais, littoraux, plantes et herbes | Densité, exclusion, variation et culling |
| P1 | Village lacustre, port, ponts, mine, fermes, moulins | Placement, collisions, édition et persistance |
| P1 | Déplacements marche/roulade, nage, bateau, vol | Parcours reproductibles, contrôles PC/mobile |
| P1 | PNJ, récolte, outils, interactions, quête et énigme | États persistants, reprise de partie |
| P1 | Jour/nuit, météo, éclairages, audio | Budgets GPU/CPU et qualité réduite |
| P2 | Points de vue scénarisés et benchmark intégré | Captures et métriques comparables |

Les éléments destinés à montrer les possibilités du moteur doivent être
présents dans **la même carte**, plutôt que de générer une nouvelle scène
publique pour chaque fonction. Les tests internes peuvent conserver leurs
fixtures ciblées lorsqu'elles sont nécessaires pour une régression précise.

## Validation et publication

```bash
npm ci
npm test
npm run generate:island
git diff --exit-code -- maps/island.project.json public/maps/island
npm run build
node tools/verify-static-build.mjs
# Uniquement dans la CI de validation, jamais dans Pages :
node tools/stage-test-maps.mjs dist/maps
```
