# 21 — Eau LOW-RESOURCE : réseau hydrographique, relief, cascades, mer et LOD

**Décision validée le 12 novembre 2026.** Little World doit représenter **rivières, ruisseaux, lacs, étangs, rapides, cascades, embouchures, mer et océan**, avec tracé éditable dans le Studio, **adaptation aux dénivelés** et rendu correct depuis la rive, un bateau, le planage, la nage ou **sous l'eau**. L'animation est **uniquement locale lorsque visible/utile** ; les grandes étendues restent visibles jusqu'à l'horizon sans être simulées en détail.

**Statut : spécification d'architecture et budgets à tester, non code livré.** Conserver la nage, plongée, bateau, vallée, rivière/mer et volumes V2 existants pendant la migration. Les distances de LOD et budgets numériques sont des **hypothèses expérimentales**.

Références : [03 — Génération](03-WORLD-GENERATION.md), [04 — Studio](04-EDITOR-INTERACTIONS.md), [05 — Architecture](05-TECHNICAL-ARCHITECTURE.md), [07 — Roadmap](07-ROADMAP.md), [09 — Tests](09-BROWSER-TEST-PLAN.md), [10 — Performance](10-PERFORMANCE-ROADMAP.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [14 — Choix](14-TECHNICAL-CHOICES.md), [15 — V3](15-STUDIO-DATA-SCHEMAS-V3.md), [17 — Horizon sans brouillard-cache](17-DISTANT-VIEW-RENDERING.md), [19 — Environnement et météo](19-ENVIRONMENT-WEATHER-SKY.md) et [20 — Blender](20-BLENDER-STUDIO-INTERCHANGE.md).

## 1. Invariants de conception

1. **Une seule définition hydrographique auteur**, indépendante de la géométrie rendue : source, tracés, jonctions, lacs, niveaux, profondeur, débit/courants stylisés, chutes et contraintes de navigation.
2. **Séparer le réseau d'eau, les volumes gameplay et le rendu.** Les vagues sont décoratives : aucune modification du niveau logique, des collisions ou de la flottabilité lorsqu'un LOD change.
3. **Aucune simulation Navier–Stokes, particules fluides, FFT d'océan ni reflexion/réfraction exigeant un second rendu de scène** dans les profils de base.
4. **Tracé de rivières depuis le Studio** : l'auteur place source et points de passage X/Z ; le compilateur suit la pente, propose un profil d'altitude, creuse localement lit/berges, détecte ruptures et demande validation aux cas ambigus.
5. **Les lacs/étangs ont des niveaux d'eau constants par plan**, les cours d'eau utilisent un profil longitudinal cohérent, les cascades possèdent explicitement un niveau haut et un niveau bas : éviter un ruban de rivière qui « remonte » ou traverse verticalement une chute.
6. **LOD de l'eau comme terrain/végétation : détails près et visibles, simplification au loin ; eau lointaine et horizon toujours visibles**, sans fog de masquage et sans coupure apparente. Distances non contractuelles : priorité à l'importance à l'écran, à l'altitude et au budget global.
7. **Une même logique de surface/volume** sert nage, plongée, bateau et point de caméra ; sous l'eau, appliquer visibilité/couleur et lumière adaptées **sans second moteur de scène ni caméra de réfraction**.
8. **Pas d'animation CPU individuelle par triangle/particule** : temps, courant, vent et masques dans shaders simples ; quelques effets de surface locaux si visibles, totalement désactivables.
9. **Compilation spatiale et invalidation locale** : le Studio conserve des sources versionnées/IDs stables ; les maillages, écumes, bordures, LOD et proxies sont **dérivés** et peuvent être recalculés par secteurs.
10. **Bêta et Studio testables**, à faible budget GPU intégré : sources d'eau, profil de pente, vue dessus/dessous, LOD, caméra, nage, bateau, profil qualité et mesures vérifiables.

## 2. Architecture et responsabilités

```text
Studio : WaterNetworkDefinition (nœuds, tracés, lacs, ruptures, options)
                              │
                      HydroProfileCompiler
          pente · niveaux · raccords · lit · jonctions · erreurs
                              │
                 WaterRuntime / WaterSpatialIndex
                     /                       \
          WaterVolumes                 WaterGeometryCompiler
        nage/bateau/courants            rubans, bassins, chutes
             gameplay                            │
                                               WaterLODManager
                                     LOD0 / LOD1 / LOD2 / LOD3
                                                │
                                            WaterRenderer
                                  surface / écume / sous-marin
```

**Modules logiques, pas obligation de créer 7 fichiers immédiatement.** Réutiliser `src/terrain.ts` (`waterSurface`, `waterDepth`, `cameraSubmerged`), `src/world.ts` (ribbons), `src/player.ts` et `src/boat.ts` puis découpler progressivement leurs responsabilités. **Ne pas dupliquer les résultats du compilateur dans chaque scène ou contrôler la nage à partir des meshes Three.js.**

### Tracé, graphes et contraintes

- `WaterNode` : source, jonction, arrivée lac, exutoire, entrée de cascade, sortie de cascade, embouchure.
- `WaterReach` : section orientée du cours d'eau (amont → aval) avec `pointsXZ`, largeur/profondeur éventuellement variables, pente/altitudes calculées, niveau de priorité, navigation, débit/courant stylisés, attributs de rapides et `authorOverrides`.
- `WaterBasin` : lac, étang, réservoir, zone marine, polygone/limite et **niveau horizontal** ; fond et zone d'immersion indépendants.
- `WaterDrop` : seuil/chute avec deux altitudes, position, géométrie de cascade et bassin de réception.
- Réseau connecté, **orientation déterministe**, jonctions validées ; niveaux aux raccords cohérents à une tolérance explicite ; signaler amont/aval inversés, pentes ascendantes, cuvettes impossibles, trous et connexions à la mer non plausibles.
- Les **rivières peuvent se joindre**, se diviser uniquement si explicitement admis, et alimenter un lac ; définir l'ordre de priorité des overrides auteur. Un exemple « source → rapide → cascade → lac → rivière → mer » doit se compiler sans intervention de code spécial.

**Important :** le graphe hydraulique n'est **pas** un simulateur de débits conservatifs réel. L'architecture pourra porter des valeurs de débit plus tard, mais en V1 l'objectif est une **géographie convaincante et des valeurs de courant cohérentes**, à faible coût.

## 3. Algorithme de génération du cours d'eau par relief

**Workflow auteur** : tracer à la souris la rivière X/Z, éventuellement indiquer la source et la cible (lac/mer), puis régler *largeur*, *profondeur*, *force du courant*, *adaptation au terrain*, *rapides/cascade manuels*. La méthode automatique propose un **profil calculé avec aperçu modifiable**.

**Pipeline à la compilation ou après édition**, jamais à chaque frame :
1. **Échantillonner la source de relief** le long de la spline avec une résolution adaptée à la courbure et aux ruptures de pente. Le relief source **ne doit pas déjà inclure** la modification de lit issue de cette même rivière (éviter boucle de rétroaction).
2. **Déterminer le sens amont → aval**, niveaux de départ et d'arrivée, conditions aux limites (mer/lac). En cas d'absence de sortie valide, signaler un bassin/une pente impossible plutôt que créer silencieusement de l'eau ascendante.
3. Calculer un **profil longitudinal par contrainte de pente non ascendante**, ajuster quelques sections/radiers, respecter les **niveaux verrouillés** et marquer les tronçons non satisfaisables comme **conflit à résoudre**. Ne pas lisser une cascade imposée en simple pente.
4. Classer localement les segments par **pente**, éventuelle courbure/roches, largeur et overrides. Classes artistiques : calme, courant, rapides, cascade ; **seuils configurables** et overrides manuels gagnants.
5. Construire le **lit** et les berges comme modification de terrain dérivée, avec pente latérale et profondeur graduelles, compatible routes/ponts/objets et corrections locales.
6. Construire rubans ou surfaces à peu de segments, **géométrie des chutes indépendante**, écume/masques de jonction pré-calculés, volumes et courant logique, puis LOD/proxies.
7. Mettre à jour **uniquement les secteurs traversés** (et dépendances nécessaires : végétation, navigation, collisions, relief d'horizon), enregistrer les alertes et permettre Undo/Redo.

**Formule de classification illustrative** : `slope = max(0,(H_up - H_down)/horizontalDistance)`. **Ne pas utiliser une pente seuil fixe pour toutes les échelles sans tests**. Sur des noeuds très proches, traiter le cas `distance≈0` comme conflit. Une cascade exige une structure `WaterDrop` ou une confirmation de rupture, surtout si un barrage, une écluse ou une retenue intervient.

### Lacs, rivières et mer

- Un **lac** a un niveau horizontal stable pour son plan (sauf variation globale explicite), avec rive/polygone, profondeur/volume et entrée/sortie connectées.
- Le **débit visuel** d'entrée et de sortie peut être représenté sans mouvement interne de toutes les eaux du lac.
- **Estuaire** : transition progressive des niveaux, couleurs et vitesses avec la mer ; pas de surface qui se chevauche et scintille en z-fighting.
- **Océan** : niveau de référence et limites géographiques cohérentes avec les îles ; éviter une énorme surface plane qui recouvre des terres. Surface rendue en patches/tuiles et **masques de côte**, non une multitude de surfaces translucides superposées.
- **Berges** : couleur/profondeur variant avec le fond, raccords géométriques stables même entre chunks, pas de « trous » à la traversée de secteurs.

## 4. Rendu extérieur : très peu de matériaux et presque aucune animation CPU

| Catégorie | Géométrie stylisée | Shader/effet recommandé |
| --- | --- | --- |
| Ruisseau et rivière | Ruban le long de la spline (largeur variable) | Teinte, vitesse des UV/onde très faible, profondeur via masque |
| Rapides | Même ruban + petites bandes de mousse/écume aux sections sélectionnées | Masque d'écume précalculé, UV plus rapides, **pas** de collisions de gouttes |
| Cascade | **Un ou quelques rubans verticaux/inclinés** raccordés aux niveaux haut et bas | UV défilants, bande blanche, mousse au pied, sprites très proches et facultatifs |
| Lac | Polygone / surface très peu maillée et fond séparé | Couleur selon profondeur, ondulation analytique légère |
| Mer/océan | Patches de surface et **anneaux/résolutions décroissantes** là où géographie le permet | Déformations vertex très légères près, ciel approximé loin |
| Sous-marin | **Même monde et surfaces**, volume logique à la caméra | Changement d'uniformes/couleurs/visibilité sans passe de réflexion supplémentaire |

**Approche prioritaire :**
- Pas de **réflexion planaire avec caméra secondaire**, pas de SSR/SSR-like multi-passes, pas de réfraction coûteuse ni de FFT/simulation des vagues.
- Préférer un **matériau opaque stylisé** partout où le style le permet : coloration des eaux peu profondes à partir de la profondeur/fond déjà compilés. Si transparence nécessaire, **locale, bornée et benchmarkée** : l'alpha blending sur une mer plein écran peut coûter cher.
- Partager matériaux et ressources ; utiliser **vertex colors, petit atlas/masque** et uniformes `time/wind/flow`, éviter de multiplier les shaders selon chaque rivière.
- Faire suivre au niveau d'eau **la géométrie des rivières**, sans déformer visuellement les volumes de jeu avec les vagues ; éviter les doubles surfaces au niveau des connexions.
- Vent météo global du [document 19](19-ENVIRONMENT-WEATHER-SKY.md) ; courant hydrographique distinct du vent (surtout en rivière).
- Reflets **artistiques** à faible coût en combinant couleur du ciel/soleil, angle et teinte du matériau ; pas d'ombres de chaque vague.

## 5. WaterLODManager : priorité absolue aux grandes étendues

**Même politique que le terrain et l'herbe** : une mer doit rester visible jusqu'à l'horizon, mais **sa géométrie et ses calculs shader sont simplifiés avec la distance et l'importance écran**.

| Profil local **illustratif** | Distance de départ à tester | Effets visuels actifs | Surface |
| --- | --- | --- | --- |
| **LOD0 — Immédiat** | ≈ **0–15 m** | Petites vagues, sillages/ondulations, mousse et éclaboussures locales | Surface avec détails proches très limités |
| **LOD1 — Proche** | ≈ **15–60 m** | Ondulations faibles, variations de couleur ; détails sélectionnés | Géométrie moins fine |
| **LOD2 — Moyen** | ≈ **60–250 m** | Pratiquement pas d'animation ; grands motifs de couleur seulement | Surface quasi plane très simplifiée |
| **LOD3 — Lointain/horizon** | **>250 m** | Couleur du ciel/profondeur et lumière globale, **aucun détail animé** sauf grand repère artistique justifié | Quelques faces/tuiles/proxy d'horizon |

Ces distances **ne sont pas des seuils imposés**, ni des preuves de performance. La sélection doit utiliser **distance projetée, taille écran, altitude de la caméra, angle de vue, visibilité réelle, profil matériel et importance des silhouettes**, avec **hystérésis**. En planage, préserver l'étendue de l'océan sans maintenir les petites vagues sur plusieurs kilomètres.

**Ne pas seulement diminuer le nombre de triangles en laissant un shader compliqué** : un océan plein écran peut être **fill-rate/fragment bound** avec 2 triangles. Les LOD doivent **réellement désactiver** lectures de textures, transparence superposée, calculs de vagues/écume et autres opérations GPU inutiles. Prévoir quelques **variantes stables précompilées** ou uniformes seulement si elles n'entraînent pas encore le même coût shader.

**Océan et tuiles** :
- En terrain ouvert, une **surface camera-relative en anneaux** peut réduire la géométrie, mais doit **respecter masques des côtes/îles, profondeur et secteur** : pas d'eau visible au travers des terres.
- Conserver **coordonnées monde stables** pour phases de vagues et masques, même quand le maillage camera-relative se déplace. **Pas de glissement** des motifs visuels sous la caméra.
- La bande de bord et la jonction des LOD ne doivent **ni fissurer ni faire apparaître de lignes nettes** ; skirts/morphing/hystérésis **seulement si nécessaires et benchmarkés**. Ne pas créer plusieurs surfaces coplanaires transparentes qui provoquent z-fighting ou surcoût d'overdraw.
- Le très lointain peut utiliser un **proxy d'océan stable géographiquement** ou une représentation de surface basse résolution cohérente avec les îles ; **ne pas masquer la portée par fog**.
- Réduire écume et animations de rivières/rapides/cascades au loin, **mais garder leur silhouette** : une cascade visible depuis une falaise peut devenir une bande claire quasi statique.

**Systèmes exclus du LOD graphique :** `WaterNetwork`, `WaterVolume`, `waterSurface`, profondeur, courant, bateau et nage. Ils restent corrects même si **LOD3 est statique** et même si la caméra ne regarde pas l'eau. La géométrie de jeu n'est pas « désactivée par la distance visuelle » ; les requêtes distantes sont évaluées à la demande, et une éventuelle autorité serveur logique est indépendante du rendu.

## 6. Nage/plongée : même scène, deux états caméra

**Point de départ existant** : `src/terrain.ts::cameraSubmerged(x,y,z)` regarde déjà **la caméra**, pas seulement l'état `swim/dive` du joueur. Conserver ce contrat.

- Remplacer à terme la seule interrogation de hauteur `waterSurface(x,z)` par une **requête de volume d'eau spatialement indexée** adaptée aux zones complexes ; trouver le **volume actif** et la hauteur de surface à l'endroit de la caméra. **Une cascade verticale n'est pas un volume de nage ordinaire** ; un bassin, oui.
- **Hystérésis** entrée/sortie du seuil sous la surface pour éviter flickering lorsque les vagues/caméra se déplacent. Ne pas mélanger **position du joueur** et **position de la caméra**.
- **Au-dessus** : surface colorée selon fond/profondeur, rivage et éclairage ; vague légère proche, reflets du ciel approximés.
- **Sous l'eau** : palette bleu/vert/turquoise selon eau/biome/profondeur, visibilité décroissant avec la **distance parcourue dans l'eau**, lumière solaire diminuée, fonds/faune visibles à courte portée, très peu de particules facultatives.
- Le fog sous-marin représente **une atténuation réelle dans l'eau**, compatible avec l'interdiction de fog-cache terrestre. Si la vue traverse une surface vers l'air, une solution simple peut atténuer **approximativement** tout le plan ; pour la qualité élevée seulement, tester une correction locale plutôt qu'un second rendu complet.
- Dessus/dessous de surface visible ; gérer backface/culling sans payer deux grands matériaux translucides. **Pas de seconde caméra de réfraction**, pas de post-process obligatoire. Les rendus sous-marins ne doivent pas animer la mer entière.
- **Mêmes collisions/profondeur/volume** en profil LOW, medium et high ; seules couleurs et détails changent.
- Éclairages soleil/lunes et météo neige/pluie du document 19 affectent surface et teinte de l'eau **avec uniformes communs** ; pas de runtime météo séparé pour l'eau.

## 7. Courants, nage, bateau, faune et cascades

**Logique très légère, côté simulation** :
- Interroger le `WaterSpatialIndex` pour récupérer un tronçon/volume local, sa direction (tangente de spline) et une intensité de courant.
- Force proposée : `currentXZ = tangentXZ * strength`, avec une transition bornée à la zone de rivière et un traitement approprié des jonctions/bassins.
- Le courant du joueur/bateau est évalué **au pas fixe** seulement pour les agents concernés ; aucun déplacement CPU des « particules d'eau ».
- Marquer tronçons **navigables**, peu profonds, interdits bateau, zones dangereuses/cascades (sans ajouter une simulation punitive). Une embarcation ne doit jamais traverser une chute comme une surface d'eau plate.
- Poissons et faune aquatique utilisent **les volumes et zones de densité** existants, avec LOD/suspension à distance, pas de simulation fluide.
- Ondulations de nage/sillage : **1–2 effets locaux** optionnels auprès de la caméra et des acteurs pertinents, pas une carte de vagues partagée pour toute la mer.
- Les futures règles multijoueurs (position bateau/joueur, événements gameplay) peuvent être autoritaires serveur ; **aucun trafic réseau de vague/écume/goutte individuelle**.

## 8. Éditeur Studio — interface simple avant réglages avancés

**Outils visibles** :
1. **Cours d'eau** : tracer une spline sur la carte 2D/3D (source → points → destination) ; largeur, profondeur, vitesse de courant et adaptation au relief automatiques.
2. **Lac/étang/bassin** : dessiner polygone/rive ; niveau d'eau stable, profondeur et point d'entrée/sortie.
3. **Cascade** : placer un marqueur de chute ou confirmer la rupture détectée ; niveaux haut/bas et style du ruban.
4. **Rapides** : marquer une portion de spline ou laisser la pente proposer des rapides ; aperçu et correction.
5. **Mer/océan** : niveau marin, limites/côtes, paramètres visuels communs.
6. **Propriétés** : presets eau claire/turbide, courants, navigation et volumes immersion ; aucune interface de shader obligatoire.

**Aperçu de profil longitudinal** **indispensable** dans l'outil cours d'eau : abscisse le long de la rivière, altitude du terrain source, niveau d'eau proposé, positions de rapides/chutes, seuils verrouillés. Signaler tronçons qui **remontent**, conflits d'exutoire, jonctions incohérentes, berges impossibles et objets/ponts touchés. L'auteur peut placer des contraintes manuelles, annuler ou accepter le creusement et prévisualiser les secteurs affectés.

**Menu bêta de test eau** : couleur/type de rivière, niveau de mer/lac, vitesse du courant, jouer nage/plongée/bateau, position caméra sous l'eau, effets d'écume, cascades, visualisation des volumes, niveau de LOD/qualité, distance, CPU/GPU et vue de planage. Les **overrides de test** ne deviennent pas automatiquement des modifications auteur ; utiliser la transaction Studio pour l'édition réelle.

**Échange Blender (document 20)** : un GLB peut représenter une falaise/cascade décorative, une arche ou un pont, **mais ne définit pas à lui seul l'hydrographie, les niveaux d'eau, un volume de nage ou un courant**. Les sources `WaterNetwork` sont des JSON V3 dans les **archives de carte portable**, avec IDs/références/hashes. Des marqueurs Blender peuvent renseigner des points d'ancrage **si validés**.

## 9. Données V3 illustratives et migration

**Contrats indicatifs, à figer pendant l'implémentation** :

```ts
type WaterNodeKind =
  | "source" | "junction" | "lakeInlet" | "lakeOutlet"
  | "dropTop" | "dropBottom" | "estuary";

interface WaterNodeV3 {
  id: string;
  kind: WaterNodeKind;
  positionXZ: [number, number];
  elevationM?: number;   // verrou auteur facultatif
}

interface WaterReachV3 {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  controlPointsXZ: [number, number][];
  widthProfileM: number[];      // échantillonné/interpolé, > 0
  depthProfileM: number[];
  currentScale: number;         // pas une vitesse physique de fluide complète
  style: "calm" | "flow" | "rapids";
  navigation: "swim" | "boat" | "both" | "none";
  heightMode: "autoTerrain" | "authorConstrained";
}

interface WaterDropV3 {
  id: string;
  topNodeId: string;
  bottomNodeId: string;
  style: "waterfall" | "weir" | "smallDrop";
  effectPresetId?: string;     // rendu cosmétique facultatif
}

interface WaterBasinV3 {
  id: string;
  kind: "lake" | "pond" | "reservoir" | "sea";
  outlineXZ: [number, number][];
  levelM: number;              // stable dans une même zone
  depthProfileRef?: string;    // fond éditable/dérivé
}

interface WaterNetworkDefinitionV3 {
  schemaVersion: 1;
  nodes: WaterNodeV3[];
  reaches: WaterReachV3[];
  drops: WaterDropV3[];
  basins: WaterBasinV3[];
  seed: number;
}
```

**Le réseau et les champs auteur sont des sources persistantes.** Profil d'altitude calculé, maillage, écume, LOD, eau de mer en patches, proxy et index spatiaux sont **dérivés** et recompilables. Les IDs restent stables lorsque l'utilisateur déplace un point, passe de la rivière à la cascade, ou échange un groupe dans Blender ; invalider les dépendances concernées.

**Migration V2 non destructive :** `src/world-data.ts::WaterBody` utilise aujourd'hui `pointsXZ/width/level/depth` simplifiés ; le convertir **en segment ou bassin selon son type d'auteur ou sa géométrie**, en conservant sa surface/niveau actuel si ambigu. **Ne pas inventer des cascades ou réécrire les altitudes V2 sans validation**. Les rivières de démonstration codées en dur et les volumes `waterSurface` continuent de fonctionner tant qu'une migration n'est pas qualifiée.

**Validation V3** : tous nombres finis, largeurs/profondeurs positives, géométrie dans le monde, points distincts, IDs uniques, bornes d'altitude, pentes/continuités, jonctions et références résolues. Erreurs de niveau ou de raccordement **bloquantes** si gameplay impossible ; avertissements artistiques configurables sinon. Pas de scripts arbitraires importés.

## 10. Politique LOW-RESOURCE et budgets à qualifier

**Dégradations par priorité** :
1. Désactiver éclaboussures, mousse particulaire et petites ondulations/sillages décoratifs.
2. Supprimer l'animation fragmentaire hors proche, réduire les détails de vagues/UV, qualité de transparence locale et le nombre de variations d'écume.
3. Abaisser la géométrie LOD1/LOD2/LOD3, réduire matériaux et draw calls, garder **l'océan visible à l'horizon** avec couleur cohérente.
4. En forte charge : **surface essentiellement colorée et presque statique** hors proximité immédiate ; sous l'eau, conserver teinte/visibilité essentielles et gameplay.
5. Remonter la qualité **avec hystérésis**, sans popping visible ou recompilation shader à chaque déplacement de caméra.

**Cibles de test initiales non démontrées** : animation GPU de l'eau **< 0,5–1 ms additionnel** en scène représentative *si possible*, CPU de mise à jour récurrent **< 0,1–0,2 ms/frame** hors compilation, petite quantité de draw calls additionnels (dépend des rivières/chunks). **Ces chiffres ne sont ni un budget contractuel ni une mesure réelle**, et **une mer plein écran doit être mesurée à sa résolution réelle**. Pas de limite fixe de triangles utilisée seule comme preuve d'économie.

**Observabilité** : `WaterLODManager` expose nombre de surfaces par niveau, triangles, draw calls, matériaux, surfaces transparentes, pixels couverts approximatifs, uploads GPU, temps CPU compilation/streaming, temps GPU si instrumentation, p50/p95/p99 du frametime. Mesurer **avec et sans eau**, vue rive, vue plongeur, bateau, planage face à l'horizon, embouchures et cascades. Comparer les effets shader par variante ; **ne pas supposer qu'un `uniform enable=false` évite tous les calculs fragmentaires** si le code shader coûteux est toujours évalué.

## Budget de l'eau intégré à PERF, pas de deuxième régulateur

La [spécification PERF](22-RESOURCE-BUDGET-MANAGER.md) fournit le **budget global** et le `WaterLODManager` réalise son adaptation **locale** :

- Les variantes `minimal/balanced/enhanced`, résolution des vagues, écume et transparence sont **plafonnées par ResourceBudgetManager** ; **aucune boucle concurrente** de qualité indépendante de l'eau.
- La **surface projetée** d'une mer plein écran prime souvent sur le nombre de triangles : les LOD doivent simplifier **les opérations en shader et l'overdraw** au loin et préserver la couleur de l'horizon.
- Le `WorkScheduler` prépare géométrie/chunks/LOD aquatiques **près de la caméra ou devant un bateau en déplacement**, avec quota CPU/upload et fallback visuel sans trou de côte.
- Le `ResourceRegistry` comptabilise textures/buffers/maillages d'eau et masques **une fois par ressource partagée** ; cache par secteur et éviction des objets non actifs.
- Vue sous-marine, profondeur, niveaux de lacs, volumes/courants, bateau/nage **ne varient jamais** avec une décision de budget graphique.
- Benchmarks identiques rive/planage/plongée/mer entière avec effet eau coupé puis activé, contrôle p95/p99/frametimes, GPU optionnel, oscillation LOD/hystérésis et intégration météo/herbe/ombres.

## Audio de l'eau : bruitages locaux et budget AUD/PERF

Le [document 23 — Audio MIDI et échantillons](23-MIDI-AUDIO-LOW-RESOURCE.md) décrit l'ambiance sonore **distincte de la géométrie d'eau et des notes MIDI musicales**.

- Rivière/cascade/rapides/mer = **émetteurs logiques** reliés à `WaterNetwork` ou aux volumes, mais seulement **quelques sources audio proches et audibles**. Ne pas créer un synthétiseur ou nœud audio par tronçon/triangle.
- Cascade et rivière : 1 boucle/échantillon court partagé (ou bruit filtré si benchmark avantageux), gain/pitch liés à proximité/intensité/importance, atténuation `equalpower` simple.
- En immersion : adapter la **teinte sonore/filtrage léger** si pertinent, sans gros moteur d'occlusion ou reverb par volume. Nage/bateau restent logiquement identiques si le son est coupé.
- Les LOD graphiques d'océan/rapides **ne définissent pas** les événements sonores ou l'accessibilité ; culling audio par proximité et budget propre sous `ResourceBudgetManager`.
- Ne pas synthétiser les remous et gouttelettes en notes MIDI ou en milliers de petites sources ; priorité au coût CPU, à l'empreinte PCM et à la lisibilité du mixage.

## Compatibilité des mines et des volumes d'eau

La [spécification MINE 24](24-MINES-MULTILEVEL-LOW-RESOURCE.md) autorise un creusement **localisé** avec plusieurs étages sous le heightfield, mais **ne crée pas** de simulation d'inondation.

- Le compilateur/validateur de mine utilise les **niveaux d'eau de rivières, lacs et mer** et les **volumes 3D** pour détecter les entrées, chambres et galeries en conflit avec l'eau.
- En MINE-V1, soit bloquer l'excavation dans une zone incompatible, soit déclarer **un volume immergé intentionnel** avec règles de gameplay distinctes ; **ne pas déduire automatiquement des écoulements hydrauliques en 3D**.
- La logique de nage/plongée est indépendante de l'apparence des roches ; une cascade GLB voisine d'une mine ne remplace pas l'état du réseau hydrographique.
- Les données de mine et eau partagent un **index spatial** et des **invalidation locales** lors d'une modification autorisée ; aucune recompilation intégrale du monde 100 km².
- Sous l'eau, les galeries accessibles doivent être validées pour caméra et collisions par volumes explicites, sans créer de physics fluides globales.

## Irrigation des parcelles : consommation d'eau sans hydrodynamique par champ

La [spécification AGRI 25](25-AGRICULTURE-PARCELS-LOW-RESOURCE.md) relie les parcelles au réseau d'eau **comme une ressource logique de gameplay**, pas une simulation d'écoulement à chaque plant.

- Une parcelle/sous-zone `FarmPlotDefinitionV3` peut référencer un **point d'irrigation, puits, réservoir ou canal**, avec disponibilité, droits et stock/capacité **abstraits et contrôlés**.
- L'action `Irrigate` valide quantité disponible/portée/propriétaire puis augmente **l'humidité agrégée** et consomme l'eau de façon transactionnelle (local solo, serveur futur).
- **La météo historique** complète l'humidité des cultures : **pluie passée**, chaleur/évaporation, sécheresse/gels, pas seulement le shader d'eau ou les gouttes présentes à l'écran.
- La croissance/le rendement ne dépendent **jamais** de `WaterLODManager` : eau visuellement immobile et océan sans vagues n'affectent pas les ressources logiques d'irrigation.
- Les **parcelles en bord de rivière/lac/mer** doivent être validées contre zones inondées, berges et contraintes d'eau/pente, sans créer un solveur d'inondation agricole.

## 11. Phases, tests et gates

| Phase | Livrable / validation |
| --- | --- |
| **WAT-0** | Inventaire de l'eau V2, tests de nage/plongée/bateau, baseline CPU/GPU scène rivière/mer |
| **WAT-1** | `WaterNetworkDefinitionV3` + tracé éditable, lacs, jonctions, ID stable, profil longitudinal lisible |
| **WAT-2** | Compilation pente/niveaux, creusement local, contrôles de non-remontée, respect des chutes/overrides |
| **WAT-3** | Rapides, cascades, bassins, jonctions et embouchures sans fissure/z-fighting ; volumes séparés |
| **WAT-4** | Rendu extérieur low-poly, matériaux simples, écume proche, paramètres pluie/vent/ciel |
| **WAT-5** | Vue immergée, caméra au seuil, volumes indexés et sous-face de surface, nage sans régression |
| **WAT-6** | Courants légers, navigation bateau/PNJ/faune aquatique, cascades non navigables, profil logique constant selon LOD |
| **WAT-7** | **WaterLODManager** : océan en patches/anneaux ou équivalent, LOD0–3, horizon conservé, benchmark GPU intégré, profils adaptatifs |

**Scénarios d'acceptation obligatoires :**
1. Rivière tracée sur pente irrégulière → eau **non ascendante**, lit/berges lisibles et vallées traversables, correction manuelle possible.
2. Rivière → cascade (niveaux haut/bas) → lac horizontal → exutoire → mer : **continuité visuelle et logique**, jonctions et hauteur d'immersion exactes.
3. Erreur volontaire de raccordement ou rivière contre-pente → **diagnostic clair, aucun silence ni creusement destructif**.
4. Sauvegarder/réimporter ZIP V3 : **réseau, IDs, niveaux, overrides, volumes et styles** préservés ; annuler/refaire d'une chute fonctionne sans toucher le reste du monde.
5. Nage au rivage, plongée, transition caméra 100 fois autour de la surface : **pas de clignotement**, même si état joueur différent de caméra.
6. Bateau traverse calme/rapides navigables, refuse cascade et zone trop peu profonde ; **identique** avec water shader LOD0 puis LOD3 désactivé/simulé.
7. Caméra haute en planage au-dessus d'une mer de grande taille : **horizon visible, aucune animation inutile au loin, aucune mer traversant les îles**.
8. Changement LOD caméra fixe/mouvante : pas de bandes d'eau, fissures, pop évident, déplacement de motifs en coordonnées monde ni surdessin transparent excessif.
9. Cascade lointaine : silhouette et couleur reconnaissables, **sans particules ni animation lourde**.
10. Water + herbes + météo/neige + étoiles/soleil + grosses constructions : budget **global**, sans casser la simulation ou l'horizon.

**Règle de livraison** : `specifié` ≠ `codé` ≠ `testé` ≠ `déployé`. Aucune phase WAT-1…WAT-7 n'est acquise du seul fait de la publication de ce document.

## 12. Diagnostic de la base actuelle, avant développement

**Vérification du code `main` au 12 novembre 2026** :
- `src/terrain.ts` définit une rivière de démonstration `riverX(z)`, `riverLevel(z)` et `waterSurface(x,z)` ; les volumes additionnels `WaterBody` possèdent `points`, `width`, `level`, `depth` (une altitude constante par tracé).
- `src/world.ts::createRiver` construit un ruban et un plan de mer avec `MeshLambertMaterial` **transparent** (`opacity≈0,8`) ; les rubans ajoutés depuis l'éditeur sont à hauteur `water.level` constante. Aucun LOD0–3 d'eau n'est établi.
- `src/player.ts` et `src/boat.ts` utilisent les surfaces/profondeurs **logiques**, pas une simulation fluide ; `cameraSubmerged` s'appuie sur les coordonnées de la caméra, ce qui est à préserver.
- **Non livrés** : outil de tracé hydrographique avec profil de pente et cascade, classification des rapides, matériaux eau simples dégradés par distance, océan en LOD, réseau V3 et volumes 3D adaptés à des cascades complexes.
- Migrer progressivement, sans sacrifier le prototype ni réintroduire de brouillard pour cacher la portée.

**Décision finale :** *l'eau est un réseau logique stable et une surface visuelle facultativement animée ; le rendu ne dépense des ressources que pour la portion proche et perceptible, et l'océan demeure visible jusqu'à l'horizon.*
