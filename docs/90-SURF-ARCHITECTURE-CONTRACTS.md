# 90 — SURF : architecture moteur, vagues, physique et contrats

**Statut : SPECIFIED / non implémenté.** Étude du 18 novembre 2026 sur \`main\`. Ce document est un plan technique, ni une PR moteur ni une preuve de performance. Voir [91 — île, Studio et activités](91-SURF-ISLAND-STUDIO-ACTIVITIES.md) et [92 — roadmap détaillée](92-SURF-IMPLEMENTATION-ROADMAP.md).

## 0. Objectifs, non-objectifs, interfaces avec l'existant

- **Objectif jouable V1** : une zone d'eau de mer avec des fronts de vagues se déplaçant vers la côte ; le hamster équipé d'une planche peut ramer, prendre une vague, gagner de l'énergie en descendant sa face, pomper, tourner, freiner, sauter, atterrir, tomber et retourner à la nage. La mer reste utilisable hors activité surf.
- **Objectif de livraison** : solo local / GitHub Pages, 30 Hz de simulation indépendant de 30/20 FPS de rendu ; une île de démonstration indépendante ; scènes lisibles sur PC anciens 4–8 Go à vérifier sur GPU physique.
- **Réutiliser** : \`src/player.ts\`, \`src/physics/motion.ts\`, \`src/physics/movement-state.ts\`, \`src/boat.ts\`, \`src/terrain.ts\`, \`src/horizon-view.ts\`, \`src/world.ts\`, \`src/environment/climate.ts\`, \`src/gameplay/races.ts\`, \`src/studio-core/types.ts\`, \`src/world-compiler/*\`, \`src/gameplay/player-loadout.ts\`, \`src/ui/inventory/*\`, \`src/audio/*\`.
- **Non-objectifs bêta** : Navier–Stokes / fluide 3D, FFT de tout l'océan, déformation persistante de la mer par plusieurs joueurs, calcul d'écume particule par particule, vrais tubes volumétriques, réseau actif, WebGPU obligatoire, météo maritime réaliste.
- **Compatibilité** : conserver \`waterSurface(x,z)\` comme niveau **hydrographique stable** pour nage, plongée, caméra immergée, pêche et bateau tant qu'un consommateur n'a pas explicitement opté pour un **support dynamique**. Aucun LOD ne change les décisions physiques. Ne pas utiliser une animation de mesh comme oracle de collision.
- **Contraintes amont** : [21 — eau LOW-RESOURCE](21-WATER-HYDROLOGY-LOW-RESOURCE.md), [22 — budget](22-RESOURCE-BUDGET-MANAGER.md), [80 — PC anciens](80-OLD-PC-HARDWARE-AUTO-QUALITY.md), [81 — audit rendu](81-RENDER-PERFORMANCE-CODE-AUDIT.md), [54 — locomotion](54-DYNAMIC-MOVEMENT.md), [89 — ski](89-SNOW-ISLAND-SLIDE-PISTES-LIFT.md).

### Audit code : état constaté sur main

| Existant | Fait vérifié | Conséquence surf |
| --- | --- | --- |
| \`src/terrain.ts\` | Eau logique \`waterSurface\`, niveau marin constant sur cartes générées | Ajouter une requête surf **distincte**, ne pas rendre toute l'eau mobile |
| \`src/horizon-view.ts\` | \`OceanRing\` opaque lointain et \`NearSea\` quasi plan sur tuiles | Une couche surf proche doit **remplacer** les quads concernés, pas les superposer |
| \`src/world.ts\` | Rubans de rivières, \`refreshWater\`, géométries décoratives séparées | Ne pas rendre les vagues dans le moteur des rubans de rivière |
| \`src/player.ts\` | Modes \`ground/air/glide/swim/dive/climb/roll/snow\` et transitions automatiques en eau | Ajouter \`surf\`, contourner la nage uniquement quand planche/support valide |
| \`src/snow/snow-slide.ts\` | Noyau 30 Hz de glisse avec pente, inertie, friction, virages | Réutiliser les concepts, **pas** brancher directement un terrain fixe |
| \`src/physics/movement-state.ts\` | Snapshot/replay whitelist stricts, commandes 30 Hz | Versionner l'état surf et tester replay/corrections |
| \`src/gameplay/races.ts\` | Genres \`flight/roll/mixed\`, portes physiques, record au tick | Ajouter \`surf\`, autoriser \`air\` et \`surf\`, ne pas dupliquer la course |
| \`src/studio-core/types.ts\` | \`libraries.races\`, \`libraries.water\` optionnelles/éditables | Ajouter bibliothèque déclarative \`surfZones\` **optionnelle** |
| \`src/world-compiler/compile.ts\` | \`logic.json\` exporte les \`libraries\` ; monde compilé basé sur descripteurs | Réutiliser le transport de bibliothèque après validateurs source/compilé |
| \`src/archipelago/registry.ts\` | Catalogue statique d'îles publiées | Publier une île surf comme manifeste autonome |

## 1. Architecture de responsabilité

\`\`\`text
Studio SurfZoneDefinition / SurfFeatureDefinition  (sources auteur V3)
    │  parse/validate + préflight bathymétrie + compilation de zones
    ├──► SurfRuntimeDefinition / SurfSpatialIndex (données légères)
    │         │
    │         ├──► WaveField.sample(x,z,tick) (pur, CPU, phase déterministe)
    │         │         └──► SurfController 30 Hz : modes, énergie, contacts, sauts
    │         ├──► SurfFeatureRuntime : rampes, boosts, checkpoints, dangers
    │         └──► SurfWaterRenderer : vertex shader, LOD, masque rive, écume
    │                     └──► raccord explicite avec NearSea + OceanRing
    ├──► RaceDefinition commun : départ/checkpoints/chrono/records
    └──► Audio / hamster / inventaire / HUD : présentation et équipement
\`\`\`

- Pas d'ECS parallèle, pas de deuxième horloge, pas de deuxième système de courses, pas de deuxième ResourceBudgetManager.
- Monde/Studio/compilateur/jeu ne doivent pas chacun avoir une version des équations de vagues : un module pure TS canonique et un shader GLSL dérivé des mêmes coefficients versionnés, vérifiés par échantillons CPU/rendu.
- Ne jamais utiliser \`Date.now()\`, \`performance.now()\` ni un nombre aléatoire non seedé dans le calcul de vague ou les collisions.
- Les effets (mousse/sillage/couleur) sont **strictement cosmétiques** et désactivables, jamais synchronisés en réseau.

## 2. WaveField : modèle de référence

### 2.1 Équation et API

La V1 utilise une **surface de hauteur univoque** Y=f(X,Z,t) ; elle peut être inclinée et asymétrique mais ne peut pas contenir de tube replié ou de surplomb. C'est un choix volontaire pour le contact fiable sur PC ancien. Les petites ondulations peuvent être une somme de 2–4 sinusoïdes ou Gerstner **visuelles**. Si un décalage horizontal Gerstner est introduit au point de contact, il faut inverser sa paramétrisation de façon bornée, ou garder une hauteur univoque canonique : ne pas prétendre que \`height(x,z)\` donne la hauteur d'une surface qui se recouvre.

Prototype mathématique :
- Direction normalisée \`d=(dx,dz)\` orientée vers la côte ; \`s = dot(d,(x,z))\`.
- Crêtes périodiques \`phase = k * (s - c*t) + phase0\`, avec \`k=2π/L\`, \`c\` vitesse de propagation.
- Hauteur \`h = seaLevel + Σ envelope(depth,zone) * A_i * waveShape(phase_i)\`, \`waveShape\` périodique, continûment dérivable et asymétrique (face plus raide que le dos) ; clamp amplitude et pentes dans les règles de jeu.
- \`depth = max(0,seaLevel - bathymetry(x,z))\`; atténuation lissée à la plage ; coefficient \`breaking\` progressif basé sur profondeur relative, pente et paramètres stylisés. Ne jamais faire monter la mer au-dessus de la terre sans règle de rivage.
- Normale \`normalize(-∂h/∂x,1,-∂h/∂z)\` ; calcul analytique si possible, différence finie bornée sinon ; vitesse verticale de la surface \`∂h/∂t\`.
- Paramètres d'exemple **non calibrés** : amplitude 0,4–2 m, longueur 12–45 m, vitesse de front 3–12 m/s, intervalle 4–15 s, fronts jouables actifs 3–6 par voisinage ; l'éditeur n'expose pas toutes ces valeurs tant que les presets ne sont pas validés.

\`\`\`ts
type SurfQuality='economy'|'balanced'|'high';   // RENDU SEULEMENT
interface WaveSample {
  height:number; nx:number; ny:number; nz:number;
  dhdt:number; propagationX:number; propagationZ:number;
  phaseSpeed:number; crest:number; breaking:number;
  waveId:string; zoneId:string;
}
interface SurfWaveField {
  sample(x:number,z:number,tick:number,out?:WaveSample):WaveSample|null;
  bathymetry(x:number,z:number):number; // précompilée / issue du terrain
}
\`\`\`

Évaluer à \`t = (tick - epochTick) / 30\`. Le \`waveId\` identifie une crête via sa famille et son numéro d'onde (pas un objet créé chaque frame). Toutes les requêtes CPU utilisent le même espace monde et la même seed; l'époque de la zone est persistée/partagée. Une phase absolue doit être bornée/modulée pour limiter la perte de précision après longues sessions; garder une définition reproductible au tick et interdire les dérives entre chunks.

### 2.2 Géométrie, LOD et côte

1. Patch de mer proche **opaque de préférence**, vertex displacement léger, couleurs profondeur/éclairage et écume par masque. Tester un mélange stylisé translucide seulement si meilleur résultat mesuré.
2. Tuiles subdivisées uniquement là où la silhouette de vague à l'écran l'exige; transitions avec skirts/morphing si nécessaire, coordonnées monde stables. Aucune allocation de position ou normale par vertex et par frame CPU.
3. Intégrer à \`horizon-view.ts\` la propriété des surfaces : une tuile NearSea marquée \`surf-covered\` **n'est plus rendue** sous le patch surf; \`OceanRing\` reste horizon. Raccord progressif sans lignes, trous, z-fighting, écume hors eau ni visibilité d'océan à travers l'île.
4. Profils LOD : immédiat (forme + écume), proche (forme), moyen (houle simplifiée), lointain (proxy). La **physique** ne lit jamais ces profils.
5. Vague trop haute près de la plage : \`breaking\` croît puis la hauteur est dissipée; le surf peut finir dans une zone de mousse peu rapide, sans géométrie repliée.
6. La taille du patch dépend de caméra, vitesse du joueur et projection; pendant les déplacements rapides, préchauffer devant la trajectoire avec quota de streaming.

### 2.3 Météo et bathymétrie

- La météo \`src/environment/climate.ts\` expose actuellement \`wind\` scalaire, sans direction de houle. Ajouter à la zone un **swellDirection** de référence, \`swellStrength\`, \`period\`; météo module l'intensité sur une transition lente, **sans réinitialiser la phase**.
- Pour la V1, bathymétrie source = terrain sous le niveau marin, éventuellement surchargé par un profil marin auteur. **Une vraie étendue d'eau jouable doit être à l'intérieur des bounds de la carte**; \`OceanRing\` au-delà est décoratif.
- Précompiler/mettre en cache pente du fond, largeur d'approche, brisants, obstacles, profondeur minimale, distances au rivage. L'éditeur refuse une zone surf recouvrant terre, port actif, hauts-fonds dangereux non déclarés ou limites du monde.
- Rivières et lacs continuent d'utiliser \`waterSurface\`; activer surf uniquement sur volumes de mer marqués.

## 3. SurfController : modes, physique et sécurité

États logiques conseillés : \`idle/swim/paddle/catch/ride/air/wipeout/recover\`; \`Player.mode\` reste \`surf\` pour paddle/catch/ride et \`air\` pendant le saut, avec \`surfAirborne\` ou \`surfState\` stable pour gérer la réception. **Ne pas choisir un second \`Player.mode='air'\` ambigu sans marquer le type de saut**.

- Entrée : équipement porté, eau assez profonde, zone active, hors bateau/mine/interactions incompatibles; \`E\` ou commande d'équipement explicite. Sortie : plage, retrait planche, chute prolongée, téléportation, changement d'île, embarquement.
- Contact planche : centre + échantillons avant/arrière/latéraux; support \`surfaceY\`, normale, vitesse verticale locale; flottabilité simplifiée et hystérésis de contact. Interdire l'effet « sous l'eau / re-snap / sous l'eau » lors des crêtes.
- Mouvement : vitesse tangentielle persistante, gravité projetée sur la pente, advection/portance de la vague, traînée, virage avec pertes, pumping contrôlé et impulsions de rame bornées (stamina facultative non punitive).
- **Distinguer** vitesse du front \`c\`, vitesse de déplacement horizontal du surfeur \`v\` et vitesse relative \`v-c*d\`; ne jamais imposer \`v=c\` à chaque tick et créer de l'énergie gratuitement.
- En creux : le joueur gagne de la vitesse surtout en **descendant la face**, conserve son inertie dans le bas, puis exploite un pumping rythmé ou un virage en remontant; une cuvette plate n'accélère pas passivement.
- Rame des mains : pulsations avec cooldown et courbe d'accélération; efficace en eau calme / avant prise, atténuée à haute vitesse; pas de spam donnant une vitesse infinie.
- Boost : classer **rame**, **vague**, **zone boost fixe**, **consommable joueur**, chacun avec sa source, durée/impulsion, cooldown et plafond gameplay explicites; les boosts autorisés en compétition entrent dans la signature du parcours.
- Saut : impulsion sur la normale/crête/tremplin si contact valide + vitesse conservée; conduite aérienne bornée; réception contrôlée par pente, inclinaison, vitesse normale, profondeur, planche; eau peu profonde/sol/obstacles sécurisés; en cas d'échec retour \`swim\` et planche récupérable.
- Ne pas permettre l'ouverture involontaire du planeur au saut surf : action explicite de transition/autorisation de course si mode mixte futur.
- Collision : le sol reste \`WorldCollisionQuery\`, la surface de vague n'est **pas** un collider mondial; \`SurfSurfaceQuery\` ne sert que les acteurs sur planche. Structures/ramps utilisent les colliders existants ou un proxy explicite. Les hautes vitesses doivent utiliser sweeping et tester la traversée de petits obstacles.
- Si \`dt\`/données invalides : pas de NaN, vitesse bornée, récupération en \`swim\` ou téléportation de secours validée.

### Contrat d'intégration joueur

Ajouter un contexte optionnel au contrôleur \`simulatePlayer(..., surfContext?)\` ou un adaptateur pur appelé pendant l'étape 30 Hz, **sans coupler au renderer**. Centraliser le changement de mode, ne pas traiter surf dans \`main.ts\` puis laisser \`simulatePlayer\` le remplacer par nage le même tick. Revoir les transitions d'entrée et de sortie d'eau, l'intégration verticale, les collisions avant/après déplacement et la caméra.

Ajouts \`Controls\` facultatifs pour rétrocompatibilité : \`surfPaddlePressed\`, \`surfPump\`, \`surfTrick\`, \`surfEquipment\`; remapper selon le mode dans \`src/input/gameplay-input.ts\`, \`main.ts\`, mobile. La touche Espace reste le saut en surf, Shift pour la rame/poussée si vitesse faible, S/Ctrl pour freinage, ZQSD pour cap. Protéger les raccourcis HTML/navigateur comme aujourd'hui.

\`src/physics/movement-state.ts\` : ajouter tous les champs déterminants \`surfZoneId\`, \`surfWaveId\`, \`surfHeading\`, \`surfLean\`, \`surfPaddleCooldown\`, \`surfAirborne\`, \`surfBoardId\`, \`surfTrickState\`, \`surfBoostState\`, etc. Versionner en préservant lecture V1 ; whitelist stricte, bornes et tests de replay. Les états de présentation (mousse/animation) ne sont pas persistés.

## 4. Données, compilation et compatibilité

**Proposition V3 optionnelle** (contrat à finaliser avant PR de schéma) : \`ProjectLibraries.surfZones?: Record<string,SurfZoneDefinition>\`. Au départ une dizaine de petites zones globales suffit, sans créer un \`ChunkSourceV3.surfRefs\` tant que la taille/streaming n'exige pas de références sectorisées.

\`\`\`ts
interface SurfZoneDefinition {
  schemaVersion:1; id:string; name:string; enabled:boolean;
  polygon:{x:number;z:number}[];  // limites dans le monde
  shoreDirection:{x:number;z:number}; // unitaire, vers côte
  seed:number; wavePreset:'gentle'|'rolling'|'power'|'arcade';
  amplitudeM:number; wavelengthM:number; phaseSpeedMps:number;
  periodS:number; breakingDepthM:number; shoreFadeM:number;
  bathymetryMode:'terrain'|'authored';
  authoredDepth?:{x:number;z:number;depthM:number}[];
  qualityHint?:'auto'|'economy'|'high'; // requête graphique facultative, jamais physique
}
interface SurfFeatureDefinition {
  schemaVersion:1; id:string; zoneId:string;
  kind:'ramp'|'boost'|'slalom'|'ring'|'current'|'platform'|'hazard';
  position:{x:number;y:number;z:number}; heading:number;
  params:Record<string,number|string|boolean>; // validé selon kind, pas de script libre
}
\`\`\`

- Préférer une bibliothèque \`surfFeatures?\` ou des entités V3 avec composants déclaratifs, selon besoin de placements/Undo/Redo; **ne pas mélanger les deux** pour un même objet. Pour la V1, un objet \`SurfFeatureDefinition\` stable avec rendu prefab et collision proxy commun est acceptable.
- Chemin source : \`studio-core/types.ts\` → \`studio-core/schema.ts\` parseLibraries + validate → \`world-compiler/validate.ts\` préflight bathymétrie/placements → \`compile.ts\` \`logic.libraries\` → \`world-compiler/load.ts\` validateur de la bibliothèque → \`runtime/compiled-world.ts\` → \`gameplay/playable.ts\` → \`main.ts\`.
- Ne jamais seulement ajouter un champ TypeScript sans l'inscrire aux **listes de clés autorisées** des validateurs stricts du dépôt.
- Sources d'auteur, données compilées et sauvegardes joueur séparées. SourceHash/buildVersion et layoutKey des courses intègrent paramètres de vagues/physique. Anciennes sauvegardes (sans planche/surf) et anciens projets V3 doivent rester ouvrables.
- **Références stables** : \`zoneId\`/feature IDs, dépendances de courses, phases et seed; l'édition d'une zone invalide les courses liées et leurs records comparables; ne pas toucher aux autres îles.
- **Import/export Studio** : roundtrip ZIP, migrations pures/non destructives, Undo/Redo transactionnel, prévisualisation locale puis publication statique. Validation d'identité et sécurité sur données externes (bornes, tailles, unités, intersections, contenus arbitraires interdits).

## 5. Performance, mesures et repli

- Base : 30 Hz logique, 30 FPS cible rendu, secours 20 ; ne pas changer la fréquence logique avec le réglage de qualité.
- Budgets **hypothétiques à mesurer** : sur iGPU ancien 720p tenter +0,1–0,2 ms CPU simulation/rendu de préparation, et +0,5–1 ms GPU pour le shader d'eau; pas de garantie ni de chiffres revendiqués sans matériel physique. La pleine mer plein écran peut être **fill-rate-bound** même à très faible nombre de triangles.
- Profils \`economy/balanced/high\` pilotés par le budget global existant (\`PresentationBudget\` puis \`ResourceBudgetManager\`). Désactiver d'abord mousse/sillages, puis shader fragment riche, puis densité géométrique **sans jamais toucher à WaveField côté jeu**. Hystérésis LOD; shader variants stables/précompilés.
- Pas de grandes surfaces transparentes superposées, pas de refraction/reflection avec seconde caméra, pas d'allocations par sommet CPU, pas de shaders compilés/recréés par tick.
- Mesures : CPU \`waveSample/surfStep/surfStream\`, GPU eau si timer WebGL2 disponible, p50/p95/p99 frametime, long frames, draw calls, triangles, octets textures/buffers, allocations, latence de chargement; sinon GPU \`unavailable\`.
- Cas : caméra plage, derrière une vague, sur la crête, vue planage très haut, port, pluie, récupération après chute, île A→Surf→A, 30 min de jeu, workers on/off, slow iGPU 4/8 Go; A/B eau surf activée/désactivée.
- Repli : si shader échoue sur WebGL2, surface économique avec couleur correcte, **même physique**; si données de zone invalides, échec de publication ou désactivation **locale de la zone** avec diagnostic, jamais corruption d'état.

## 6. Contrats de tests non négociables

1. Déterminisme : mêmes paramètres + seed + tick ⇒ mêmes samples CPU, indépendants du FPS et du LOD ; pas de décalage de phase aux bordures de tuiles, après pause/rafraîchissement ou transition.
2. Signes : direction vers côte, crête mobile, normale et dérivées cohérentes; pentes et hauteurs bornées; disparition douce près du rivage.
3. Physique : rame accélère puis sature, descente face de vague accélère, remontée coûte de l'énergie, virage/frein dissipent; boost uniquement explicite; saut conserve l'inertie.
4. Transitions : nage ↔ paddle ↔ ride ↔ air ↔ ride/wipeout; 100 entrées/sorties sans oscillation ni téléportation dans l'eau; collisions avec port et objets.
5. Compatibilité : ancienne île/ancienne sauvegarde/ancien ZIP, bateau/pêche/nage/plongée, commandes mobile et PC, caméra sous-marine, ski/planeur et courses existantes.
6. Studio : export/import sans perte de zone, erreur de profondeur et chevauchement bloquantes, Undo/Redo, playtest, publication statique.
7. Courses : passage checkpoint au tick même à grande vitesse, mode surf autorisé, réception correcte en air, records invalidés si vagues/boosts changent, pas de deuxième chronomètre.
8. Benchmarks réels avant fusion des niveaux graphiques améliorés. Status par lot : \`SPECIFIED\` → \`IMPLEMENTED\` → \`TESTED\` → \`QUALIFIED\` → \`RELEASED\`.

### Sources de conception complémentaires

- [NVIDIA GPU Gems — Effective Water Simulation from Physical Models](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models) : ondes paramétriques et normales.
- [Three.js ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html), [Three.js Material](https://threejs.org/docs/pages/Material.html) : variantes de shader, cycle de vie des matériaux.
- [TxDOT — Waves and currents](https://www.txdot.gov/manuals/des/hyd/chapter-15--coastal-hydraulic-design/section-4--waves---currents.html) : transformation et déferlement de la houle à proximité des côtes.
