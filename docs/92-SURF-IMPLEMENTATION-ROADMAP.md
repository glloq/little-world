# 92 — SURF : roadmap d'implémentation complète, dépendances, gates et validation

**Statut initial : ROADMAP / SPECIFIED, aucun code surf livré par ce dossier.** Référence au `main` du 18 novembre 2026. Toute ligne passe successivement `TODO → IMPLEMENTED → TESTED → QUALIFIED → RELEASED` avec lien de branche/PR, preuves de tests, limites. Ne pas cocher une étape à partir d'un document ou de sa simple CI verte. Voir [90 — architecture](90-SURF-ARCHITECTURE-CONTRACTS.md), [91 — île / activités](91-SURF-ISLAND-STUDIO-ACTIVITIES.md).

## 0. Cible et chemin critique

**Release V1 : SOLO STATIQUE (GitHub Pages)**. Une île de surf navigable et trois zones jouables (apprentissage, vitesse, parc), avec rame, prise de vague, inertie, virage, saut, chute, planche équipée et au moins **trois défis**, un record local, Studio rééditable, ocean LOD acceptable sur PC ancien, aucune régression sur eau/nage/bateaux/vol/ski et îles existantes.

**Chemin critique** : SURF-00 → SURF-01 → SURF-02 → SURF-03 → SURF-04 → SURF-05 → SURF-06 → SURF-07 → SURF-08 → SURF-09 → SURF-10 → SURF-12 → SURF-13.

**Flux parallélisables** après contrats validés : assets/sons/animations SURF-11 à partir de SURF-04 ; préparation d'île SURF-08 après définition du modèle et outils compilateurs ; système de course SURF-09 après échantillonnage et moteur jouable. Ne jamais fusionner plusieurs moteurs dépendants d'une API instable. Un agent/PR = un périmètre testable avec interface figée.

### Contrats gelés avant la première PR gameplay

- [ ] Coordonnées et unités (mètres, Y positif, X/Z), `tick` fixe 30 Hz, phase et seed de vague, caps par zone.
- [ ] Surface hydrographique stable vs `SurfWaveField` dynamique, règles pour caméra sous l'eau, nage, bateaux et ports.
- [ ] Version de `SurfZoneDefinition`, identifiants stables, migrations et persistences.
- [ ] États du hamster et du saut surf, commande Espace/Shift/Ctrl/E, recovery; séparation physique/rendu.
- [ ] Cas de rupture : frontière de carte, eau peu profonde, port, collision, saut trop rapide, déconnexion future.
- [ ] Profils de qualité **uniquement graphiques**, sur budget global existant.

## 1. Backlog ordonné (une PR recommandée par lot ou sous-lot)

| Phase | Priorité | Dépend | Complexité relative | Livrable / gate |
| --- | --- | --- | --- | --- |
| SURF-00 — inventaire/baseline | P0 | aucune | S | Tests existants et mesures comparables sur main |
| SURF-01 — données Studio/compilateur | P0 | 00 | M | Définition surf facultative, source→ZIP→build→runtime sans casse |
| SURF-02 — WaveField logique | P0 | 01 | M | Hauteur/gradient/vitesse au tick, fronts côte, mêmes échantillons |
| SURF-03 — support dynamique | P0 | 02 | L | Contact planche stable, nage/bateau intacts |
| SURF-04 — contrôleur paddle/ride | P0 | 03 | L | Rame, prise de vague, vitesse, virage/pump/frein, physique testée |
| SURF-05 — saut/réception | P0 | 04 | L | Crêtes, `air`, impact et wipeout, transitions robustes |
| SURF-06 — rendu mer proche + LOD | P0 | 02,03 | L | Vagues visibles, raccord océan, perf A/B, sans surdraw |
| SURF-07 — équipement/commandes | P0 | 04,05 | M | Planche du sac, PC/mobile, animations provisoires |
| SURF-08 — île showcase A/B | P0 | 01,06,07 | L | Une île autonome avec deux zones + port calme |
| SURF-09 — modules de courses | P1 | 05,08 | L | Rampes, bouées, boosts, checkpoints surf, records |
| SURF-10 — Studio UX/intelligence | P1 | 01,02,08,09 | L | Zone dessinée + presets, édition, playtest, placement sûr |
| SURF-11 — audiovisuel & polissage | P1 | 04,05,06 | M | Hamster, effets de glisse, audio V2 et HUD |
| SURF-12 — activités complètes/démo C | P1 | 09,10,11 | M | 3 parcours, école/tutorial, libre, figures V1, progression |
| SURF-13 — qualification/publication | P0 | 08–12 | L | PC 4–8 Go, non-régressions, voyage A→Surf→A, publication |
| SURF-14 — extensions | P2/P3 | 13 | variable | Grandes vagues, figures avancées, fantômes, autres sports |
| SURF-15 — multi ultérieur | FUTUR | 13 + serveur | XL | autorité, validation, synchronisation, sécurité (non requis en solo) |

L/S/M = taille relative **sans estimation de temps ni engagement de performance**. Le chemin critique peut être raccourci pour une **démo intermédiaire** après SURF-06 : zone d'essai pure, planche provisoire et entrée directe debug, sans île publiée ni courses.

## 2. Détail exécutable par phase

### SURF-00 — baseline et contrats (P0)

- [ ] Relever commit exact, état réel des PR course/ski/eau/archipel, tests qui passent, cible WebGL2; éviter de baser le plan sur une branche non fusionnée.
- [ ] Établir fixtures reproductibles : étendue de mer calme, bande plage à pente douce, eau profonde, port, seuil d'immersion, panneau de vagues; cartes semées identiquement.
- [ ] Capturer tests de non-régression `npm test`, `npm run typecheck`, `npm run build`, `npm run test:water`, `npm run test:boats` (si script disponible), `npm run test:motion` (si script disponible).
- [ ] Mesurer A/B sur 720p et navigateur GPU réel **avant tout shader**, p50/p95/p99, draw calls, allocations, CPU sim/rendu, GPU si disponible; conserver seed, parcours, caméra, qualité fixe.
- [ ] Décider explicitement quel temps de jeu alimente la phase lors des pauses et transitions d'île; définir valeur epoch persistable et version pour replays.
- [ ] Livrable : `docs/benchmarks/surf/baseline.json` et document de décisions / limitations.

**Gate G0** : baseline lisible, tests initiaux connus, aucune promesse de FPS non mesurée.

### SURF-01 — contrats, validations et transport des sources (P0)

- [ ] Créer `src/surf/surf-schema.ts`, parseurs stricts `SurfZoneDefinition`, `SurfFeatureDefinition`, version et bounds.
- [ ] Étendre `src/studio-core/types.ts` avec `libraries.surfZones?` et, si nécessaire, `surfFeatures?`; ajouter au `schema.ts` les clés acceptées et la validation.
- [ ] Ajouter préflight `src/world-compiler/validate.ts` : profondeur/geometry/rives/ports, chevauchement, nombre, paramètres. Échec propre sur source invalide.
- [ ] Vérifier sérialisation dans `src/world-compiler/compile.ts`, lecture/validation dans `world-compiler/load.ts`, exposition par `runtime/compiled-world.ts` et `gameplay/playable.ts`.
- [ ] Compatibilité des V3 anciens, V1/V2 importés, sauvegardes, ZIP et projets sans surf; source vide = **strictement aucun surcoût surf au lancement**.
- [ ] Tests : roundtrip JSON/ZIP, sourceHash stable, changement de paramètre = nouvelle version, projet corrompu refusé, absence de bris du catalogue.

**G1** : écrire une zone surf déclarative puis la retrouver identiquement au runtime compilé; ancienne île inchangée.

### SURF-02 — WaveField mathématique pur (P0)

- [ ] Créer `src/surf/wave-field.ts`, `src/surf/wave-zones.ts`, `src/surf/surf-bathymetry.ts` ; API `sample(x,z,tick)` pure et sans Three.js/DOM.
- [ ] Définir une surface de hauteur univoque, profils `gentle/rolling/power/arcade`, directions vers côte, phases et seeds déterministes. Crêtes asymétriques stylisées, 3–6 fronts locaux; pas de surplomb volumétrique.
- [ ] Calculer hauteur, gradient/normal, vitesse verticale, direction, vitesse de phase, indicateur de crête/brisant; normaliser/borner toutes valeurs.
- [ ] Faire varier l'enveloppe près du rivage et selon profondeur **sans recomputer le relief** à chaque tick; cache/index géographique précompilé et invalidation locale après édition.
- [ ] Exposer l'horloge de vague au rendu, au joueur et aux futures courses; empêcher drift à grand tick et frontières de tuiles.
- [ ] Tests sur 1, 10 000, 1 000 000 ticks ; échantillons fixes, absence NaN, stabilité de crête après pause/saut de tick, continuité des bords, direction réelle vers la côte.

**G2** : une crête se déplace sur plusieurs centaines de mètres avec mêmes valeurs aux mêmes ticks, même si rendu off.

### SURF-03 — support surf dynamique, hydrographie inchangée (P0)

- [ ] Créer `src/surf/surf-support.ts`, `SurfSurfaceQuery` à partir de `WaveField`, indépendant de `WorldCollisionQuery`.
- [ ] Contact centre, avant/arrière/gauche/droite de planche, normale/pitch/bank, hystérésis attach/detach et interpolation verticale; vérifier pente maxi/contact sur vague abrupte.
- [ ] Introduire `surf` et état de contact dans `src/player.ts`, ajouter optionnellement contexte surf à `simulatePlayer`. **Ne pas laisser le contrôle nage reclasser l'acteur en `swim` le même tick.**
- [ ] Respecter terrain, collisions du quai, eaux peu profondes, limites et plafond physique; transition vers nage si support perdu.
- [ ] Conserver `waterSurface` fixe pour bateau/pêche/caméra/volume; ajouter requête dynamique **opt-in** pour flotteurs visuels uniquement (bateau : léger bob décoratif P2 séparé).
- [ ] Tests : 100 cycles entrée-sortie, crêtes faibles/fortes, changement LOD, bateau côte à côte, caméra au seuil, fallback renderer off.

**G3** : planche suit une vague sans vibrer/téléporter ni enfoncer le hamster, même avec eau simple.

### SURF-04 — locomotion de surf : rame, vitesse et virages (P0)

- [ ] `src/surf/surf-controller.ts` avec `paddle/catch/ride`, énergie source par source, vitesse relative au front, friction, stabilité et virages.
- [ ] Rame et accélération des mains à impulsions bornées avec cooldown; possibilité de maintenir une commande accessible; pas de spam FPS.
- [ ] Descente/creux/remontée : projetter gravité sur pente mobile, préserver élan, pertes en virage, pumping rythmé avec plafond; mesurer gain sans boost.
- [ ] Freinage normal/fort, survirage, sortie de vague, transfert d'une vague à l'autre; assistance de capture facultative qui ne crée pas de score ni énergie gratuite.
- [ ] Fixer valeurs expérimentales : vitesse paddle de quelques m/s, ride naturel à mesurer, arcade avec boost séparé; ne pas viser vitesse max avant pilotage correct.
- [ ] Tests numériques `tests/surf-controller.test.mjs` : rame, drag, énergie, capture, perte vague, virages, boost absent, pas d'allocations excessives; scénario reproductible avec input tape.

**G4** : ramer puis attraper une vague et gagner de la vitesse en descendant **sans aucun boost**; direction contrôlable.

### SURF-05 — crêtes, sauts, airborne, réception et wipeout (P0)

- [ ] `src/surf/surf-air.ts` : calcul normal d'impulsion, saut depuis crête ou module, conservation vitesse horizontale, contrôle aérien limité.
- [ ] Intégrer avec `player.ts` `air/glide/swim` : marqueur `surfAirborne` obligatoire et règles Espace non conflictuelles avec planeur/double saut.
- [ ] Détection de touchdown par trajectoire balayée et échantillons de hauteur dynamique; landing bon/mauvais selon angle, énergie verticale, fond et obstacle.
- [ ] Wipeout : annuler compétition ou appliquer pénalité suivant défi, état de nage, récupération de planche sûre; jamais de téléportation silencieuse ni perte d'inventaire.
- [ ] Étendre `movement-state.ts` snapshot V1 compatible + état surf whitelist, replay déterministe et compteurs événements; pas de score piloté par animation.
- [ ] Tests : saut immobile interdit si hors crête, bonne réception, réception latérale, plage trop peu profonde, boucle saut/nage, replay 30 Hz, 20 FPS de présentation, contact collider.

**G5** : trois sauts successifs reproductibles, réception stable; une chute retourne en nage et le joueur peut ressurfer.

### SURF-06 — rendu low-poly performant (P0, parallèle après G2)

- [ ] `src/render/surf-water-view.ts` : maillage local subdivisé près joueur, vertex shader GLSL avec mêmes paramètres de vague, normales/teintes stylisées; aucun rebuild global par frame.
- [ ] `src/render/surf-foam-view.ts` : crêtes et brisants via masque léger; éclaboussures locales facultatives, budget particules borné.
- [ ] Couvrir/masquer les quads de `NearSea` correspondants dans `horizon-view.ts`; `OceanRing` reste lointain, pas de couches transparentes doubles, pas de trou, pas de popping de côte.
- [ ] LOD proches/moyens/lointains selon projection et vitesse, transition/skirts si besoin, coordonnées monde, mêmes courbes en qualité economy/high.
- [ ] WebGL2, performance GPU iGPU; timing via timer GPU seulement si disponible. Pas de seconde caméra, pas de FFT ni simulation fluide.
- [ ] Tests `tests/surf-render.test.mjs` et navigateur `tools/test-surf-browser.mjs` : cadrages dessus/dessous, plage/port/horizon, seam, perte de contexte WebGL, comparaison A/B pixel/frametime, dispose.

**G6** : vague identifiable et accord contact-graphisme à la crête, scène mer stable, coût GPU documenté; low conserve gameplay.

### SURF-07 — équipements, commandes, visibilité du hamster (P0)

- [ ] Ajouter `tool:surfboard` au catalogue d'objets gameplay et équipement existant; option prototype mains puis adapter un emplacement surf si nécessaire.
- [ ] Brancher `Controls` sur ZQSD/Shift/Ctrl/Espace/E, tests menus/Space/droite-gauche PC/mobile; priorité au mode surf vs roll/snow/glide.
- [ ] Planche procédurale/GLB low-poly avec collider séparé, animation paddle/ride rudimentaire; le sac et planeur ne sont pas modifiés hors prise/fin surf.
- [ ] Sauvegarde de l'équipement, migration ancienne sauvegarde et ferry; pas de planche perdue lors du voyage/refresh.
- [ ] Tests inventaire + navigateur + retour à terre + embarquement bateau et pêche.

**G7** : le joueur peut équiper la planche depuis son sac et réaliser le cycle complet sans raccourci debug.

### SURF-08 — île de démonstration, zones A et B (P0)

- [ ] Créer source V3 **nouvelle**, exemple 2×2 km majoritairement maritime, plage, bathymétrie maîtrisée, deux zones manuelles et port calme; ne pas écraser `maps/island.project.json`.
- [ ] Générer/conserver un fichier auteur reproductible; compiler avec pipeline existant; chargement GitHub Pages statique.
- [ ] Définir points d'entrée/sortie, zone de récupération/limites, orientation front et quai; tests bateau/ferry.
- [ ] Traversée A→île surf→A avec sauvegarde et démontage des ressources; ne référencer dans le catalogue publié qu'après qualification.
- [ ] Jouer 10 minutes dans chaque baie avec planche, sans scripts debug et sans charger toute la carte en détail.

**G8** : île séparée accessible localement, navigation surf complète, port praticable, retour sûr.

### SURF-09 — obstacles, boosts, courses réutilisées (P1)

- [ ] `src/surf/surf-features.ts` : data + runtime pour `ramp/boost/buoy/ring/current/platform/hazard`; params par type, ID stable, limites et collisions explicites.
- [ ] Rampes fixes d'abord; impulsion au départ validée par position/vitesse/angle, zone de réception vérifiée, pas de collisions avec quads décoratifs.
- [ ] Boosts directionnels et zones courant avec règles déterministes/cooldown, anti-repeat, compatibilité boosters joueur.
- [ ] Étendre `RaceKind/RaceMotionMode` à surf, gates physiques, départ/chrono/records, anciens genres inchangés; accepter `air` seulement issu du surf.
- [ ] Intégrer signatures wave/physics/boost dans record, classification `practice/natural/arcade` si nécessaire avec migration documentée.
- [ ] Tests `tests/surf-features.test.mjs`, `tests/surf-races.test.mjs` : passage rapide, anti-teleport, classement valide, saut à travers anneau, ancien circuit ski/roll/flight.

**G9** : 1 parcours slalom + 1 parcours saut/boost terminables dans une même île, records locaux fiables.

### SURF-10 — Studio surf complet et implantation intelligente (P1)

- [ ] `src/studio/surf-panel.ts` étape-guidée; zones dessinables, presets, preview mouvement sans simulation de monde, réglages essentiels visibles et avancés repliés.
- [ ] `src/studio-core/surf-authoring.ts` : CommandBus, création/édition/suppression/IDs, Undo/Redo, import/export ZIP, validations.
- [ ] `src/studio-core/surf-zone-planner.ts` : étudier côte/profondeur/direction/port/obstacles, max N candidats, suggestion expliquée, **aucun placement implicite**.
- [ ] Planificateur parcours sur l'eau : vérifier ligne de surf, boosts, rampes, réception, limites et collision de course; conserver outil Course terrestre.
- [ ] Jouer ici / retour Studio / modifier et recompiler secteur; ne pas recalculer tous les patches pour un déplacement de bouée.
- [ ] Browser test auteur→playtest→Undo→export→import→playtest ; anciens projets intact.

**G10** : utilisateur non développeur crée zone+parcours et les teste sans éditer de JSON.

### SURF-11 — graphismes, sons, interface et accessibilité (P1, en parallèle)

- [ ] `src/surf/surf-animations.ts` ou `surf-character-view.ts` : paddle, pop-up, lean, pump, frein, saut, réception, wipeout; réutiliser hamster rig.
- [ ] Sons événementiels intégrés à `audio` V2 ; une émission par transition, WAV partagés, petits budgets de voix, aucun son indispensable pour la physique.
- [ ] HUD : vague/prise, vitesse, contact, état rame, boost, checkpoints/chrono/score, aide au saut, mode réduit effets.
- [ ] Différencier visuellement eau calme/brisant/boost, donner repère de direction au large; pas de dizaines de particules persistantes.
- [ ] Tests mobiles et clavier, caméra, accessibilité, son coupé, animations réduites, absence de désynchronisation.

**G11** : silhouette et retour visuel/sonore clairs, pas de perte notable sur PC 4–8 Go selon mesures.

### SURF-12 — activités, parcours de démonstration et progression (P1)

- [ ] Parcours A : tutoriel rame→prise→virage→saut→récupération.
- [ ] Parcours B : vitesse/longue vague et slalom sans boost obligatoire.
- [ ] Parcours C : 3–5 obstacles, 1–2 rampes, 1 boost, anneaux aériens et zone atterrissage.
- [ ] Surf libre (distance, durée d'une vague), figures de base (180/360, landing propre) et score calculé au tick; progression locale/records.
- [ ] 1 PNJ animal moniteur, 1 boutique/stand simple optionnel utilisant les mécanismes d'inventaire/commerce existants, déblocages cosmétiques non bloquants.
- [ ] Test de chaque activité sans assistance, avec assistance et en économie graphique; replays comparables.

**G12** : 3 circuits finissables au moins une fois, parcours de découverte agréable, aucun blocage lié à achat/skin/PNJ.

### SURF-13 — qualification, intégration et publication (P0)

- [ ] Mesures comparables fixed quality 720p PC 4 Go expérimental + 8 Go référence, Firefox/Chromium WebGL2, GPU réel identifié ; cible 30 FPS/20 secours seulement **si observée**.
- [ ] Stress test : 30 min surf, 100 sauts/chutes, changement de qualité, pause/reprise, A→Surf→A×10, entrée/sortie Studio, workers 0/1, perte contexte WebGL, aucun leak persistant.
- [ ] Non-régression : nage, plongée, caméra immergée, pêche, bateau/flotte/port, neige, planeur, roll, inventaire, audio, courses, sauvegardes anciennes, île 4×3.
- [ ] Sécurité statique source: 10 zones invalides, polygones géants, NaN, ID dupliqué, port bloqué, front vers limite, champs inconnus, asset absent; refus propre.
- [ ] Bilan CPU/GPU/RAM/download, p95/p99 et images longue >50/100 ms, matériel/résolution/révision documentés; aucune revendication marketing non testée.
- [ ] Fusionner en `main` **uniquement PRs validées**; compiler, publier manifeste et ajouter `surf-island` au catalogue statique ; gate Pages OK.
- [ ] Documenter contrôles, retour à l'île source, limites, backlog futurs.

**G13 = RELEASED** : 3 zones + 3 défis jouables sur Pages, tests et rapports; aucune régression critique; pilote iGPU acceptable avec profil économique.

### SURF-14 — extensions post-V1 (P2/P3)

- [ ] Plus grandes vagues, déferlantes stylisées, vagues croisées; **tube 3D** exige autre représentation/collision et une étude séparée.
- [ ] Figures enrichies, chaînes de vagues, fantômes/replays solo, tournois locaux, défis météo versionnés.
- [ ] Planche rapide/longue/trick, skins, sons cosmétiques, location et atelier.
- [ ] Nouveaux modules (arche, plateforme mobile, tourniquet, raccourci) + validation placement.
- [ ] Bodyboard/paddle/skimboard, puis sports à voile ou remorquage **comme contrôleurs distincts**.
- [ ] Bateau avec léger tangage lié à vagues en option, jamais en changeant le niveau logique de navigation par LOD.
- [ ] Génération automatique de **plusieurs** îles surf aux côtes et fonds différents, après qualification de la première.

### SURF-15 — préparation multijoueur, sans activation (FUTUR)

- [ ] Définir protocol versionné : zone/seed/waveRevision/epochTick, PlayerSnapshot et inputs avec numéros de tick, résultats de course signés côté serveur.
- [ ] Conserver moteur WaveField pur et déterministe, prévoir drift correction et replay; limiter divergence JS/GPU.
- [ ] Autorité sur boosts, points, collisions, départ/fin; anti-teleport et anti-spam.
- [ ] Simulation partagée de vagues par **paramètres**, pas maillage ni gouttes ; joueurs distants interpolés.
- [ ] Aucun WebSocket/serveur ajouté à la bêta Pages par ces travaux.

## 3. Organisation PR optimale

**Petites PR alignées sur les gates**, pas une branche géante. Exemple de séquence :
```text
PR-01  source-schema + compilation                        G1
PR-02  WaveField pur + tests mathématiques                G2
PR-03  surf support / collision adapters                 G3
PR-04  paddle, catch, ride, turning, pumping              G4
PR-05  air, landing, wipeout + replay                     G5
PR-06  shader water / LOD / NearSea seam                  G6
PR-07  équipement / controls / hamster temporaire         G7
PR-08  île statique A/B de démonstration                  G8
PR-09  features + boosts + races                          G9
PR-10  Studio UI + placement intelligent                  G10
PR-11  animations / audio / HUD                           G11
PR-12  tutoriel / 3 défis / scoring                        G12
PR-13  benchmarks, corrections, publication               G13
```

Chaque PR contient : but unique, fichiers touchés, tests automatiques, scénario navigateur reproductible, métriques A/B si moteur/rendu, retour arrière/feature flag, changement de schéma/migration si requis. Mettre en place `SURF_ENABLED=false` ou absence de zone comme repli **sans code mort** sur les îles historiques. Ne pas réécrire simultanément `world.ts`, `main.ts`, terrain, eau, inventaire et courses dans la même PR.

### Taille de lot et dépendance

- PR-02 et design de la géométrie peuvent avancer en parallèle **après gel du champ**; le shader ne doit pas introduire sa propre équation incompatible.
- PR-07 (planche) peut utiliser une version debug du contrôleur pendant PR-05, mais pas déclarée finalisée avant tests d'entrée/sortie.
- PR-08 création d'une île prototype sans circuits peut être faite après G6; **catalogue public** interdit avant G13.
- PR-09 courses d'abord sur des zones manuelles (2 vagues/une rampe), puis auto-placement en PR-10.
- PR-11 peut être développé sur captures de trajectoires, mais toutes les animations sont purement visuelles.
- Plan de merge : rebase régulier de `main`, aucun cherry-pick de régressions, tests sur head récent, `AGENTS.md` modifié seulement si nouveaux invariants sont validés et nécessitent un rappel.

## 4. Tests proposés, intégration CI et instrumentation

Nouveaux tests **à créer** :
- `tests/surf-schema.test.mjs` : schéma, legacy, import/export, limites, source hash.
- `tests/surf-wave-field.test.mjs` : phase, pente, dérivées, normal, shore fade, déterminisme.
- `tests/surf-support.test.mjs` : contact, hystérésis, séparation de l'eau logique, transitions.
- `tests/surf-controller.test.mjs` : rame, énergie, capture, pumping, virage, freinage.
- `tests/surf-air.test.mjs` : décollage/atterrissage/impact, chute, no teleport.
- `tests/surf-races.test.mjs` : gates, boost, replay, record signature, anti-exploit.
- `tests/surf-studio.test.mjs` : transactions, placement, invalidations et compile.
- `tools/test-surf-browser.mjs` : plage, vagues visuelles, planche, HUD, courses, ancien navigateur/qualité.
- `tools/bench-surf.mjs` : CPU direct `wave.sample`, `surf.step`, allocations, p95; **ne pas confondre avec GPU**.
- `docs/benchmarks/surf/*.json` : matériels, WebGL2, révision, FPS, mémoire, draws, triangles, scénario.

Conserver `npm test`, `npm run typecheck`, `npm run build`, `npm run test:water`, `npm run test:boats` (vérifier que script existe), `npm run test:motion` (idem), `npm run test:ui`, `npm run test:island`. Les tests navigateur nécessitent un serveur de preview stable et des scénarios documentés. Pour `npm run build`, valider le staging de l'archipel et toutes les routes de ressources sous `BASE_URL` Pages.

### Seuils de départ à benchmarker, **non garantis**

| Mesure | Hypothèse de départ | Action si dépassement |
| --- | --- | --- |
| CPU surf par frame sim | viser <0,1–0,2 ms | profiler échantillonnages, cache bathymétrie, réduire allocations |
| GPU eau surf 720p | viser <0,5–1 ms additionnel | réduire shader fragment/overdraw; profils stable |
| Rendu | 30 FPS nominal; 20 FPS secours | corriger goulot GPU/CPU, streaming, LOD visuel |
| Mémoire / charge | rester dans budgets 4–8 Go du doc 80 | plafonner caches et ressources d'île non active |
| Franchissement courses | même résultat à 20 et 30 FPS de présentation | rejouer input tape et vérifier tick |
| Rendu mer | aucune fissure/popping eau/terrain/oceanRing | test de couture LOD/côte et couverture |
| Physique | aucun contact avec NaN / snap / vitesse illimitée | test de bornes, énergie, dt, états |
| Chargement archipel | aucune fuite répétée A→Surf→A | disposer zones/assets/audio/meshes à unload |

## 5. Risques majeurs et décisions d'arbitrage

| Risque | Symptôme | Prévention / alternative |
| --- | --- | --- |
| Surface Gerstner avec déplacement horizontal non inversé | CPU et GPU ne voient pas la même hauteur | **V1 univoque** ; tubes et recouvrement P3 |
| Double mer `NearSea + surf` | z-fighting, fill-rate, artefacts | propriété exclusive par tuile et LOD |
| Nage remplace surf chaque tick | planche sous l'eau / téléportation | branchement d'état dans simulation 30 Hz, pas dans présentation |
| Vague trop forte dans port | ferry/bateau instables | masque d'exclusion et attenuation en zone port |
| Boost + pumping illimités | vitesses extrêmes / résultats non fiables | compteur énergie et dissipations, règles de course |
| Vagues qui changent avec météo | records non comparables / replay divergent | météo versionnée et phase canonique; modes compétitifs figés |
| Surf hors bounds | rebond caméra / coupure de mer | zone surf interne et large marge sécurisée |
| Édition V3 incomplète | zone visible dans Studio mais absente du build | gate schema→compiler→runtime→playtest→ZIP |
| Refonte monolithique | conflits et bugs anciens systèmes | micro-PRs, adaptateurs, feature flag |
| FPS iGPU bas | vagues saccadées / mer floue | shader opaque simplifié, LOD, hystérésis, logs |
| Spécifications prises pour du code livré | fausse progression | statut et preuve par gate, pas de saut d'étapes |

## 6. Tableau de suivi à maintenir

| ID | Statut initial | Preuve requise pour TESTED | Preuve requise pour QUALIFIED |
| --- | --- | --- | --- |
| SURF-00 | TODO | commandes + baseline JSON | matériel/ressources documentés |
| SURF-01 | TODO | tests schémas/compile + roundtrip | vieux projets sans régression |
| SURF-02 | TODO | tests WaveField/ticks | continuité longue durée + GPU agreement |
| SURF-03 | TODO | tests support/transitions | 100 entrées-sorties sans snap |
| SURF-04 | TODO | essais rame/catch/ride | trajectoire jouable et mesure énergie |
| SURF-05 | TODO | sauts + replay | retombées/chutes à toutes vitesses utiles |
| SURF-06 | TODO | tests navigateur + A/B | iGPU réel + rendu/LOD validés |
| SURF-07 | TODO | sac, UI, contrôles | mobile/PC, anciens equip et saves |
| SURF-08 | TODO | carte compilée, 2 zones | ferry/port/streaming/retour |
| SURF-09 | TODO | courses et features | 2 parcours terminés et records justes |
| SURF-10 | TODO | create/edit/undo/export/playtest | auteur non technicien autonome |
| SURF-11 | TODO | son/hamster/HUD | polish et accessibilité |
| SURF-12 | TODO | 3 démos et scoring | plaisir/contrôle après playtests |
| SURF-13 | TODO | matrice CI/Pages et benchmarks | validation pour fusion/publication |
| SURF-14 | BACKLOG | PR optionnelle propre | compatibilité V1 |
| SURF-15 | FUTURE | tests protocoles/replay | backend autoritaire qualifié |

### Priorité de la **prochaine action effective**

Démarrer **SURF-00** (baseline instrumentée et fixtures) et **SURF-01** (schéma facultatif) en conservant `main` intact. Ne pas produire une grande île ou des assets définitifs avant G2/G4 (WaveField et sensation de glisse); ne pas entamer multi avant RELEASE V1.
