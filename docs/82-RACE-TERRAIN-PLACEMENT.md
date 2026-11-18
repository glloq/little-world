# 82 — Recherche de circuits sur le relief réel de l’île

**État : phase implémentée sur `feat/races-flight-roll-demo` / PR #81 brouillon, non fusionnée ; vérifications de terrain et navigateur requises.**

## Pourquoi

Au lieu de déposer des checkpoints et des tremplins au hasard, Studio propose des pistes praticables dans les données géographiques du projet V3 : hauteur réelle, relief façonné par les retouches, berges et zones d’activité, emprise des bâtiments, voies et courses existantes. Le choix reste contrôlé par le créateur, jamais automatique et irréversible.

## Utilisation

1. Dans **Studio → Courses → Implantation intelligente sur le relief**, placer la caméra au-dessus du secteur à prospecter.
2. Choisir **Descente** ou **Terrain relativement plat**, longueur cible (90–360 m), largeur (5–12 m), rayon local (60–450 m).
3. Cliquer **Analyser le relief autour de la vue**. Jusqu’à trois propositions sont classées et consultables en 3D avec **Voir sur le terrain**.
4. Examiner score, dénivelé, pente max et modules proposés. **Créer cette piste** effectue une transaction Studio (Annuler/Refaire). Aucun changement n'est enregistré par la simple analyse.
5. Utiliser **Jouer ici** pour vérifier le pilotage et la réception de chaque tremplin avant publication.

## Planification déterministe

- 12 origines locales et 6 variantes de direction/courbure = **72 tracés maximum** par analyse ; aucun scan global des 12 km², aucune IA/LLM, aucune donnée réseau.
- Génération d’un tracé 2D lissé via les mêmes courbes `centerline` que les chemins natifs.
- Échantillonnage de **la trajectoire complète et des deux bords à 5 m**, avec marge de 2 m, pas seulement des points de contrôle.
- Rejet des pistes hors carte, inondées, trop proches de la mer, traversant bâtiments, zones réservées, autres routes et courses, ayant des pentes ou des dévers excessifs.
- Descentes : dénivelé positif suffisant ; circuits plats : faible variation globale d’altitude. Tri déterministe par note et déduplication de variantes quasi identiques.
- Préparation de quelques modules si les zones adéquates existent : virage relevé sur une vraie courbe, bosses, tremplin avec zone de réception, et pont **au-dessus d’un creux sec uniquement**. Pas de pont automatique sur une rivière sans vérification du tirant d’air.
- Des checkpoints fixes orientés sont calculés **le long de la nouvelle piste**. Le départ lance le chronomètre au franchissement ; la piste et les portes sont ensuite éditables indépendamment.

## Géographie et performances

- `src/studio-core/race-terrain-context.ts` utilise `projectGeography(project)` sur le document **entièrement hydraté**, jamais les chunks partiellement affichés ou une heightmap approximative.
- `src/studio-core/race-terrain-planner.ts` est pur, sans Three.js ni horloge, réseau ou génération aléatoire non reproductible.
- `src/gameplay/race-corridors.ts` indexe les emprises dans des cellules de 32 m avec un LOD de 6 m, et `GeographySources.races` les marque comme routes. Le moteur écologique supprime arbres, buissons et rochers procéduraux sur les courses ; zones extérieures inchangées.
- Le runtime compilé et le Studio reprennent les mêmes réservations. Aucun mesh ou hauteur de sol n'est recomputé à chaque image, et la physique existante du hamster est réutilisée.
- Un nouveau circuit invalide la comparaison de chronos si l’empreinte des checkpoints, des modules ou de la version du monde change.

## Vérifications disponibles

`npm test` : recherche répétable et bornée, pente/largeur, eau/occupation, création V3, empreintes, exclusion de la végétation.

`node --experimental-strip-types tools/report-race-terrain.mjs` : **rapport en lecture seule** sur `maps/island.project.json` 4 × 3 km. Affiche les sites candidats, les rejets et les coordonnées de départ et arrivée ; aucune modification de la carte.

`node --experimental-strip-types tools/test-races-browser.mjs` : navigateur Studio → recherche de relief → édition de portes → Jouer ici → panneau de course.

## Limites à ne pas masquer

- La vérification géométrique n’est **pas encore une simulation complète de trajectoire**. L’adhérence, les variations météorologiques, la vitesse d’entrée, le boost et la réception demandent toujours un playtest.
- Les cours d’eau sont interdits à la planification initiale : une passerelle au-dessus d’un fleuve exige un solveur de garde au sol et des culées adaptées.
- Les tunnels et deux tabliers superposés au même (X,Z) nécessitent des surfaces multi-couches, hors de cette itération 2,5D.
- Les foules/PNJ, objets mobiles et les collisions propres à des assets complexes restent à traiter par une validation dédiée. Aucun circuit n’est injecté automatiquement dans la carte publiée.
