# 98 — Routines des PNJ V1 : implémentation, architecture et qualification

**Statut : IMPLEMENTED (sur la branche `feat/npc-life-routines-v1`), QUALIFICATION EN COURS.**  
Branche démarrée sur `main@f84c16cd`, après PR #75 (villages et îles guidées). Voir les décisions dans les PR de documentation #84 : [PR documentaire #84](https://github.com/glloq/little-world/pull/84) (documents 96 — audit des besoins et 97 — roadmap complète). Ce fichier accompagne **la PR de code #85** ; les documents 96 et 97 seront disponibles dans main après le merge de la PR #84.

## 1. Ce qui est effectivement développé

- `src/npc-life/schedule.ts` : profils versionnés `Resident`, rôles agriculteur, pêcheur, commerçant, bûcheron, mineur, meunier, artisan, aubergiste, enfant, villageois ; horaires jour/nuit à partir du `WorldClock` et de `ClimateState.dayPhase` ; interpolation analytique sur route, sans simulation en l'absence du joueur. Les enfants peuvent parcourir le dernier tronçon sûr vers la place en aller-retour pendant la journée.
- `src/npc-life/routes.ts` : graphe de chemins partagés, nœuds et index spatial 32 m ; A* borné uniquement lors de l'affectation de domicile/poste ; validation des raccordements et portions contre les fonctions de marche/collision ; refus du pont surélevé sans support de navigation qualifié.
- `src/npc-life/dialogue.ts` : ajout d'un thème contextuel « Que faites-vous dans la journée ? » selon heure, profession et déplacement, conservant les choix et effets auteurs existants.
- `src/npc.ts` et `npc-view.ts` : option `NPCDefinition.routine` et échelle visuelle, projection du déplacement sur l'horloge mondiale, 10 Hz proches / 2 Hz intermédiaires pour PNJ classiques, résidents loin sans trajet pas-à-pas ; pause de la routine pendant les interactions et refus d'une route trop longue. Les PNJ classiques restent inchangés quand aucun `Resident` n'est fourni.
- `src/main.ts` : un seul état d'horloge, routes natives, collision broadphase partagée, métriques `littleWorldMetrics.npcLife` en mode métrique.
- `src/studio-core/{types,schema,migration}.ts` : composant optionnel `Resident` sur un personnage V3, validation stricte des rôles et positions, projection source→runtime ; ancien Studio/projet compatible.
- `src/settlements/{local-life,population,planner,schema,services}.ts` : hôte du village affecté à une vraie maison et une activité compatible ; un à deux enfants suivant le nombre de maisons, avec limite globale de 100 personnages ; préservation des changements auteurs et dialogues lors des recompositions.
- `src/studio-core/welcome-village.ts` : activer les routines pour les villages créés **avec les nouvelles générations guidées**. `src/studio/settlements-view.ts` : option éditable « Routines jour/nuit » pour les villages nouveaux. Les recettes existantes sans `residentRoutines` ne changent pas.

## 2. Contrat de rendu optimisé

Les PNJ sans routine restent sur leur modèle historique. Pour les résidents :
1. Le graphe de routes se construit une fois si au moins un résident existe, avec limite de nœuds.
2. Le trajet domicile→poste est calculé à l'initialisation, avec cache intrinsèque du résultat par résident ; aucun A* par frame.
3. À proximité du joueur, la position courante est la projection de l'heure logique sur le trajet et l'animation correspondante.
4. Au-delà de 160 m, projection au plus 2 fois par seconde logique ; aucun rattrapage de centaines de ticks après pause, chargement ou voyage.
5. Silhouettes et rigs existants sont réutilisés ; l'échelle des enfants est une transformation du rig standard, pas un nouvel asset.

La publication doit encore mesurer le temps de création du graphe, le nombre de `roadNodes` et la présence de `roadTruncated`, les draw calls, les FPS et le chargement des villages sur PC 4–8 Go.

## 3. Limites conscientes de cette verticale

- Le système compose actuellement **un hôte professionnel et au maximum deux enfants par village équipé**, et non une population complète par maison. L'ajout d'autres métiers/populations est prévu aux phases NPC-7/8.
- Les champs PNJ, quais et points de service doivent être de vrais ancrages ; un trajet impraticable laisse le PNJ sur son comportement précédent. Les ponts à plusieurs niveaux, portes complexes, grottes, ascenseurs et navigation intérieure demandent une extension de l'adaptateur de navigation.
- Le retour à la maison signifie arrivée **au seuil**, sans scène intérieure de sommeil, apparition/disparition ni nouvelle animation de lit.
- Les enfants effectuent un jeu de va-et-vient le long d'un segment de chemin connu, pas encore une poursuite de groupe avec évitement mutuel.
- Les animations `work` restent génériques ; le pêcheur ne lance pas réellement une ligne, l'agriculteur ne sème pas de ressources, les commerces ne sont pas fermés selon l'horaire (les transactions restent gouvernées par l'économie).
- Les PNJ n'exécutent pas de transactions de production en arrière-plan. Le joueur continue à récolter/pêcher/miner avec les moteurs existants.
- Les quêtes automatiques, le routage des effets `moveNPCTo`, les dialogues sociaux multi-PNJ, les emplois du temps des anciennes cartes historiques et la sauvegarde de changements d'horaire sont **hors scope V1**.
- Cette branche ne modifie pas les maps officielles, les assets 3D ni les fichiers générés de référence.

## 4. Tests et suivi de CI

Tests ajoutés :
- `tests/npc-life.test.mjs` : profil, journée/commutes, position déterministe, jeu des enfants, refus des ponts non qualifiés, protection contre parcours bloqués, conversations auteurs et index spatial en coordonnées négatives.
- `tests/npc-life-settlement.test.mjs` : génération d'hôte et enfants, maisons/ancrages valides, conservation des dialogues, projection dans `runtimeContent`, ancienne recette inchangée, recomposition non destructive.

Validation attendue par la CI existante : `npm test`, `npm run build` (TypeScript + Vite), régénération des fixtures, tests browser (Studio, gameplay, villages, ferry, etc.). **Ne déclarer QUALIFIED que si les étapes pertinentes passent et si une vérification pratique des trajets dans un monde généré est réalisée.**

En cas de refus de chemin, le fallback ne détruit pas le PNJ. Les métriques sont accessibles en mode debug via `littleWorldMetrics.npcLife` : `assigned`, `routed`, `roadNodes` et `roadTruncated`.

## 5. Suite de la roadmap

1. Navigation plus avancée : supports de pont, traversées multi-niveaux, éviter les collisions dans les rues denses et replanification des itinéraires.
2. Scènes sociales, marche en groupe, animation pêche/semis/arrosage/repose ; vrais enfants qui jouent avec pauses, sons et rencontres.
3. Studio : tableau de résidents, affectations manuelles, aperçu horaire et diagnostic d'accessibilité, quotas locaux et global.
4. Couplage à `QuestDirector` et aux objets régionaux : donneurs mobiles, lieux réels, retour de missions sans attente bloquante.
5. Qualifier 4×3 km historique, nouvelle île portuaire, village agricole, village sans pont, traversées, parcelles et prévisions de performances.