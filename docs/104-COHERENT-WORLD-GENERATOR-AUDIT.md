# 104 — Générateur de mondes cohérent : audit et éléments à incorporer

Statut : **SPECIFIED** (audit + architecture cible). Rien n’est implémenté par ce document.
Base auditée : `main` à `05de8e1` (merge #106, domaine skiable des Cimes).
Complète [92 — mondes complets](92-COMPLETE-WORLDS-STUDIO-AUDIT.md) §6 (`ContentPlan`, jamais implémenté) et [73 — terrain/établissements](73-TERRAIN-SETTLEMENTS-ALIGNMENT.md).

## 0. Conclusion

Les briques sont nombreuses et souvent de bonne qualité (planificateur de station de ski, quartiers organiques, population de PNJ ancrée sur de vrais lieux, directeur de quêtes idempotent, houle analytique). **Ce qui manque est la colonne vertébrale qui les relie** :

1. le terrain ne s’adapte presque jamais au contenu : chaque élément *cherche* un endroit qui lui convient déjà, puis est refusé si la pente dépasse son seuil ;
2. il n’existe pas de registre commun d’occupation du sol : l’ordre des appels fait office de priorité ;
3. le « thème » est un ensemble d’énumérations fermées, et 3 des 5 mondes livrés sont produits par des scripts propres à l’île ;
4. activités, PNJ et quêtes ne partagent ni contrat de site, ni index de capacités, ni bus d’événements typé ;
5. le fond marin est une simple pente vers un fond plat : aucun relief sous-marin ne prépare la plongée.

Il faut donc **sept contrats transversaux** (§2), introduits par lots (§4), plutôt que de nouvelles îles ou de nouveaux moteurs par activité.

## 1. État réel constaté

### 1.1 Pipeline de génération

- Orchestrateur unique : `composeWorld` (`src/studio-core/world-composition.ts:23`). Il reçoit `MapRequirements` et mute directement un `ProjectDocument` (le même schéma que la source éditable).
- Ordre : relief (`planWorldTerrain`, V3/V4/V5) → plateaux `planTerrainSites` (port/ferme/lac) → hydro avec « réservations sèches » → `planTerrainAccess` → `generateBirthPort` → `generateWelcomeVillage` → `generateWorldActivities` → biomes (`planWorldBiomes`, `applyRegionBatch`, `align*Biomes`) → diagnostics → `parseProject`.
- Le corps est truffé de branches `compositionVersion`/`islandStyle`. Les versions terrain legacy, v2, v3, v4 et v5, les biomes legacy, planner et v4, et l’hydro planner et v4 sont toutes vivantes.
- Mondes livrés :

| Monde | Production | Passe par `composeWorld` |
|---|---|---|
| Volcan | `tools/generate-island.mjs`, coordonnées et 34 presets codés en dur | non |
| Val forestier | fixture legacy copiée (`stage-archipelago.mjs`) | non |
| Trois vagues | `studio-core/surf-island.ts`, atoll fait main | non |
| Cimes | `composeWorld`, puis suppression de la piste, `summitShaping`, `resort-planner` et une quête codée | partiellement |
| Moissons | `composeWorld` et une quête codée | oui |

- Validation : diagnostics de demande, `validateTerrainAccess`, `validateBirthPort`, `validateWorldActivities`, couverture et qualité naturelle. `auditPlayability` et `world-audit` existent mais **ne bloquent pas la génération**. Il n’y a pas de graphe de connectivité global, pas de contrôle de chevauchement entre usages ni de faisabilité des quêtes.

### 1.2 Adaptation du terrain

| Élément | Mécanisme actuel |
|---|---|
| Port, ferme, lac (sites) | feature `plateau` injectée (`terrain-site-planner.ts`) : **seul « aplanir pour accueillir » générique** |
| Maisons et services (`settlements/`) | refus si le relief varie de plus de 0,35 m sous l’emprise, puis maison posée au point le plus haut sans socle (`planner.ts:152-161`) |
| Champs | refus si la variation dépasse 0,7 m (`surroundings.ts`) |
| Rues et chemins | refus si la pente dépasse 0,35 (`inspectGroundSegment`), jamais de déblai/remblai |
| Presets de paysage (générateur B) | plateau « terrace » à l’aveugle |
| Pistes de ski | feature `piste` `groomedProfile` (±10 m) : **le meilleur modèle existant** |
| Courses roulade | recherche seulement, chaussée en surcouche |
| Surf | lecture du relief comme bathymétrie, `portShield` codé en dur |
| Eau | `carveWaterBeds` creuse son lit |

Contraintes structurelles :

- `ARCHIPELAGO_LIMITS.features = 64` (`archipelago-params.ts:15`) : on ne peut pas exprimer un terrassement par maison avec des features d’archipel.
- `terrainEdits` (raise/lower/flatten) existe mais les générateurs ne l’écrivent jamais.
- `terrain-impact.ts` ne revalide ni les courses, ni les pistes, ni les zones de surf après une retouche.

### 1.3 Villes, villages, accessoires, fermes, forêts, routes

- **Deux générateurs de villages disjoints** :
  - A, `src/settlements/` : validé, éditable, motifs organic/street/mountain/river/fishing/network, mais une seule boîte 6×7×3,5 m avec 3 matériaux ;
  - B, `world-production/landscape-presets.ts` : vrais GLB, lampadaires, clôtures et accessoires, mais ni validation ni même politique de terrain.
- Aucun catalogue de styles d’architecture (alpin, pêcheurs, tropical, médiéval…). « Fortifié » ne génère pas d’enceinte, et `layout.poi` est validé mais ignoré par le planificateur.
- Accessoires de A à décalages fixes autour de la place, sans règle de densité ni de hiérarchie de rue.
- Champs : petites parcelles dispersées, sans ceinture agricole, haies ni ferme isolée.
- Végétation : `occupancy()` connaît les zones, chemins (0,8 m), maisons. **L’emprise d’un village n’est pas une occupation** : des arbres poussent entre maisons et services, et il n’existe ni lisière ni clairière liée à un établissement.
- Routes : 5 producteurs différents qui partagent seulement le type `PathDefinition`. Aucun graphe à l’échelle de l’île, et les routes interurbaines de la carte officielle sont tracées à la main.
- **Un seul établissement généré par île composée.**

### 1.4 Activités

| Activité | Placement | Terrain | Accroche quêtes |
|---|---|---|---|
| Ski, station (`snow/resort-planner.ts`) | planificateur générique (Dijkstra, remontées), mais 8 spécifications de pistes codées et appelé seulement par `alpine-island.ts` | oui (piste damée, `summitShaping`) | quête Cimes codée ; aucun événement piste ni remontée |
| Ski, prototype composé | générique | non | aucune |
| Courses roulade (`race-terrain-planner.ts`) | générique (ancres × sites × caps) | non, eau interdite | `race.finished` sans type de course |
| Courses de vol / mixtes | gabarits fixes autour d’une ancre | non | succès du parcours de vol non émis |
| Surf (`surf-island-planner.ts`) | transects côtiers génériques, câblé seulement dans `surf-island.ts`, absent de `world-activities` | non (`bathymetryMode:'authored'` spécifié, non codé) | quête codée, aucun événement vague/figure |
| Pêche | partout où il y a de l’eau, sans poste | non | `fishing.caught` |
| Mines | polygone auteur, pas de planificateur | souterrain seulement | `mine.extracted` |

Il n’existe aucun type `ActivitySite` commun. Le seul partage est `occupation(x,z)` (`race-terrain-context.ts`). Les forêts ne sont jamais une contrainte : les couloirs les déboisent silencieusement.

### 1.5 PNJ, dialogues, quêtes

- **Implémenté** :
  - population par établissement (`npc-life/capabilities.ts`, `assignments.ts`, `settlements/population.ts`) : domicile, métier issu d’un vrai équipement, horaires, routes vérifiées ;
  - directeur de quêtes (`src/quests/`) : réclamation idempotente, suspension si le PNJ disparaît.
- **Minimal** : `quests/generator.ts` produit deux familles (rencontrer un voisin, visiter un lieu de travail) à l’exécution, dans `main.ts`. Ces quêtes n’apparaissent ni dans le Studio ni dans l’audit.
- Les quêtes d’activité sont écrites à la main par île (`alpine-island.ts`, `harvest-island.ts`, `surf-island.ts`).
- Un ancien système d’objectifs tourne en parallèle (`npc-life/quest-director.ts` `planResidentVillageQuest`, `surf-shore-quest.ts`).
- `QuestTemplateV1` et `QuestOfferConfigV1` sont parsés mais rien ne les instancie, et `IslandCapabilityIndexV1` (doc 94) n’existe pas.
- Événements : chaînes libres (`recordQuestCommit(type:string,…)`), sans union typée. Manquent :
  - vol réussi, surf (vague, figure, score), ski (piste, remontée) ;
  - vente au marché, musique ;
  - le type de course dans `race.finished`.
- Rôles déclarés mais jamais produits : `instructor`, `guard`, `courier`, `sailor`, `traveler`. Aucun PNJ ne tient une activité (moniteur de ski, loueur de planches, starter de course).
- Dialogues :
  - arbres de 2 répliques par rôle, plus un sujet contextuel (heure, météo, activité du PNJ) ;
  - rien sur la progression du joueur ni les activités voisines, pas de répliques d’ambiance ;
  - **aucune localisation** (tout le français est en dur).

### 1.6 Sous l’eau

- **Existe** :
  - modes `swim` et `dive` (`player.ts`), oxygène 90 s qui force la remontée sans pénalité, jauge HUD ;
  - animations, son `underwater` ;
  - varech conique et poissons décoratifs (8 au plus par secteur de 48 m).
- **Fond marin** : `sea-1 - seabedDepthM*smooth(0,320,-coast)` (`geography/archipelago.ts:188`), soit une pente unique vers un fond plat. `coastalReliefFadeM` ramène tout point en mer à cette base (`archipelago.ts:214`) et efface donc toute feature au large.
- **Rendu** : un voile CSS `rgba(32,117,129,.15)` (`style.css:56`), une seule couleur de fond (`SEABED_COLOR`). Le `dressing` ignore le sous-marin. Le doc 21 §6 (palette et visibilité selon la profondeur) n’est pas livré.
- **Manquent** : zones de profondeur dans `GeoSample` (seulement un booléen), sites de plongée, poissons liés aux tables de pêche, étape de quête sous-marine.

## 2. Les sept contrats à incorporer

### C1 — `WorldBrief` : intention et thème déclaratifs (remplace les énumérations et les scripts par île)

C’est la mise en œuvre concrète du `ContentPlan` du doc 92. Données auteur pures, sans code :

- **climat et palette** : tempéré, alpin, tropical, aride, boréal ; ligne de neige ; saisons ;
- **forme** : modèle de relief, silhouette, nombre d’îles, **types de côtes** (plage, falaise, récif, lagon, mangrove, fjord) ;
- **pôles** : liste typée (`port-town`, `market-town`, `hamlet`, `mountain-village`, `fishing-village`, `ski-station`, `farmstead`, `mine-camp`…) avec rôle, taille, style architectural et priorité ;
- **activités** : obligatoires ou souhaitées, avec paramètres (nombre de pistes, difficulté, type de course…) ;
- **densité, rythme, zones calmes assumées** et budget de ressources (doc 22) ;
- **sous-marin** : profondeur maximale, plateau continental, récifs, sites profonds souhaités.

Les 5 mondes deviennent **5 fichiers de brief** et non 5 générateurs. Volcan et Trois vagues doivent être reproductibles depuis un brief. Un écart reste admis s’il est conservé comme retouches verrouillées.

### C2 — `WorldPlan` : un pipeline unique à étapes typées

Chaque étape lit le plan, ajoute sa couche et émet des diagnostics. Elle ne réécrit pas les couches précédentes, sauf par le terrassement :

```
Brief → Forme/silhouette → Macro-relief → Bathymétrie → Hydrographie
      → Plan d’occupation (C3) → Terrassement (C4) → Réseau de circulation (C5)
      → Établissements + Activités (C6) → Biomes / végétation (respect de l’occupation)
      → PNJ (population + hôtes d’activités) → Index de capacités → Quêtes (C7)
      → Audit bloquant → Projection vers ProjectDocument V3 → Compilation
```

- **Geler les versions** V1–V4 terrain et biomes : elles ne servent plus qu’à rejouer les mondes stockés. Le chemin vivant n’a qu’une version.
- La sortie reste le `ProjectDocument` V3 actuel : schémas, retouches/verrous et `world-recomposition` (empreintes de propriété) conservés.
- Déterminisme : sous-graine par étape et par pôle, pour qu’une modification locale ne rebatte pas toute l’île.

### C3 — `LandRegistry` : registre d’occupation et réservations

Un registre unique, persistant dans le plan, consulté par **tous** les producteurs (sites, villages, champs, pistes, courses, spots de surf, sites de plongée, ports, mines, forêts protégées). Chaque réservation porte :

- une **emprise** (polygone ou couloir) ;
- un **usage** : bâti, rue, champ, piste, couloir de course, zone de vagues, site de plongée, forêt, réserve calme ;
- une **priorité**, une **flexibilité** (déplaçable, redimensionnable) et la **marge** à respecter ;
- une **fenêtre de terrain** acceptable : altitude, pente, profondeur, et un **budget de terrassement** en m³ ou en hauteur maximale ;
- ses **ancres** d’accès, et sa provenance avec son verrou.

Le registre détecte les conflits et applique **retour arrière et site suivant** au lieu de l’ordre d’appel. L’occupation est **stockée** : la végétation lit l’emprise des villages et les lisières, et cesse de déboiser silencieusement les couloirs. Le doc 73 décrit déjà ce contrat, non implémenté.

### C4 — `Earthworks` : une primitive de terrassement commune

C’est l’inversion attendue : **choisir un site « assez bon », puis adapter le terrain** dans le budget de la réservation.

- **Opérations** :
  - plateforme (pad) avec talus ;
  - terrasses étagées avec soutènement visible ;
  - rampe ;
  - déblai/remblai de route ;
  - nivellement de champ ;
  - dragage de port ;
  - piste damée (reprendre `groomedProfile`) ;
  - côté sous-marin : récif, banc de sable, tombant.
- **Couche dédiée** compilée dans le heightfield par chunk, **hors** des 64 features d’archipel, avec ordre et priorité explicites. Elle peut s’appuyer sur `terrainEdits`, déjà parsés mais jamais écrits par les générateurs.
- Après application :
  - recompiler l’eau (WATER) ;
  - revalider toutes les réservations touchées ;
  - étendre `terrain-impact.ts` aux courses, pistes et zones de surf.
- Les maisons de A obtiennent enfin un socle et des terrasses : les villages tiennent sur des pentes de volcan au lieu d’être refusés.

### C5 — `CirculationGraph` : un réseau unique

Graphe à l’échelle de l’île reliant ports, pôles, sites d’activité, points de vue et entrées de mine. Il est hiérarchisé (route, chemin, sentier, ponton) et routé en A* sur le terrain avec un **coût de terrassement** et un coût de pont. Rues de village, accès aux sites et approche du port s’y raccrochent. Les 5 producteurs actuels deviennent des clients du graphe. Il sert aussi à l’audit de connectivité et aux itinéraires des PNJ.

### C6 — Établissements et activités sur un même contrat de site

**Établissements**

- Fusionner A (planificateur validé et éditable) et B (GLB, accessoires).
- Un **catalogue `ArchitectureStyle`** décrit pour chaque style : modules de maison, toits, matériaux, pilotis ou socle, accessoires, clôtures et éclairage. Exemples : alpin, pêcheurs, tropical sur pilotis, médiéval, rural tempéré.
- **Règles d’accessoires** par hiérarchie : place et centre denses, rues secondaires, cours, lisière.
- **Ceinture agricole** avec haies et fermes isolées.
- **Plusieurs pôles par île** avec rôles complémentaires.
- Enceinte réelle pour le profil fortifié, plus tard.

**`ActivitySite` commun**

Champs : `kind`, emprise ou couloir, réservation C3, terrassement C4, accès C5, **capacités de quête** et **événements émis**. Un planificateur par type derrière une seule interface :

| Type | Ce qu’il faut faire |
|---|---|
| Ski | rendre `resort-planner` paramétrable par le brief (nombre et niveau des pistes) et appelable par `composeWorld` |
| Roulade | ajouter le terrassement léger (dévers, bosses) via C4 |
| Vol | placement guidé par le relief (vallées, crêtes, cols) au lieu de gabarits fixes |
| Surf | à brancher dans `world-activities`, avec bathymétrie auteur (récif, banc) via C4 |
| Pêche | postes de rive et pontons explicites |
| Mine | entrée raccordée au réseau |
| Plongée | voir §3 |

### C7 — Index de capacités, événements typés, quêtes et dialogues générés

- **`IslandCapabilityIndex`** construit depuis le monde compilé : courses par type, pistes, remontées, spots de surf, eaux de pêche, sites de plongée, mines, parcelles, ateliers, comptoirs, ferries.
- **Bus d’événements typé** : union discriminée et registre, validés à la compilation. Ajouter :
  - `flight.completed` ;
  - `surf.wave-ridden` et `surf.trick` ;
  - `ski.piste-completed` et `ski.lift-ridden` ;
  - `market.sold`, `music.played` ;
  - `dive.depth-reached` et `underwater.discovered` ;
  - `race.finished` enrichi du type, du record personnel et de la médaille.
- **Quêtes par gabarits** : instancier `QuestTemplateV1` selon l’index (filtre de faisabilité réel, liaison des paramètres, donneur choisi par rôle), avec des profils de récompense selon la difficulté.
  - Les générer **dans le plan**, donc visibles et éditables dans le Studio et vérifiées par l’audit, et non dans `main.ts`.
  - Migrer `planResidentVillageQuest` et `surf-shore-quest` vers le directeur unique.
- **Hôtes d’activité** : `capabilities.ts` crée un métier par `ActivitySite` (moniteur, loueur, starter, maître-nageur, guide de plongée). Ces PNJ sont les donneurs naturels de quêtes.
- **Dialogues composés** :
  - répliques construites à partir du rôle, de l’activité voisine, de l’état des quêtes et de la progression (premier poisson, record) ;
  - répliques d’ambiance ;
  - **clés i18n** et tables FR/EN pour tout texte généré.

## 3. Objectif secondaire : découverte sous-marine (préparer maintenant, livrer plus tard)

À préparer **dès les lots C1–C4**, sinon il faudra recomposer les îles plus tard.

1. **Bathymétrie auteur dans le brief et le plan**. Nouvelles formes sous-marines :
   - plateau continental, tombant, fosse ou trou bleu ;
   - récif, banc de sable ;
   - grotte marine (via le mécanisme des mines ou des structures naturelles, pas de voxels globaux) ;
   - épave (GLB).

   Elles s’appliquent **après** `coastalReliefFadeM`. La même couche sert au surf (ISURF-R) et aux ports dragués.
2. **Zones de profondeur** dans `GeoSample` (bord, lagon, récif, tombant, profond, abysse) à la place du booléen `underwater`. Matériaux de fond par zone (sable, roche, corail, vase).
3. **Sites de plongée = `ActivitySite`**, réservés dans C3 avec une fenêtre de profondeur. Le brief peut exiger « au moins un site profond de 30 m ou plus » : `seabedDepthM` vaut aujourd’hui 35–40 m, à paramétrer par zone.
4. **Habillage sous-marin** par le même pipeline `dressing`, avec des habitats de profondeur (varech, coraux, roches, éponges) instanciés et sans ombres (doc 18/22). Lier la faune aux tables de pêche et aux biomes marins.
5. **Rendu immergé** conforme au doc 21 §6 : palette et visibilité selon le volume de la caméra et la profondeur, atténuation du soleil, hystérésis. Ce brouillard est un **état physique réel**, donc autorisé, et non un cache de distance.
6. **Gameplay futur** :
   - améliorations d’oxygène (équipement acheté, comme pour le ski) ;
   - objets à découvrir ;
   - étape de quête `dive` / `visit` avec profondeur ;
   - événements `dive.depth-reached` et `underwater.discovered` ;
   - PNJ guide de plongée.

## 4. Ordre de livraison recommandé

| Lot | Contenu | Critère de sortie |
|---|---|---|
| G0 | `WorldPlan` typé, gel des versions legacy (rejeu seulement), `composeWorld` découpé en étapes | les 2 mondes composés sont bit-identiques avant/après |
| G1 | `LandRegistry` et occupation stockée ; végétation respectant villages et lisières | aucun chevauchement d’usages sur les 5 mondes ; diagnostics navigables |
| G2 | `Earthworks` (pad, terrasse, rampe, route, champ, piste) et revalidation étendue | village sur pente de volcan accepté ; eau recompilée sans erreur |
| G3 | `CirculationGraph` unique | audit de connectivité port → pôles → activités bloquant |
| G4 | `ActivitySite` et migration ski, roulade, surf, pêche, mine ; vol guidé par le relief | Cimes et Trois vagues produits par `composeWorld` |
| G5 | fusion des générateurs de villages et `ArchitectureStyle` ; plusieurs pôles ; ceinture agricole | 3 styles sur une même île, accessoires selon la hiérarchie |
| G6 | index de capacités, événements typés, gabarits de quêtes, hôtes d’activité, dialogues composés, i18n | chaque activité a au moins une quête générée vérifiée par l’audit |
| G7 | `WorldBrief` complet ; les 5 mondes en briefs ; un brief « archipel tropical, ville portuaire, récifs » sans code nouveau | génération et compilation sans écriture de code |
| G8 | bathymétrie auteur, zones de profondeur, sites de plongée, rendu immergé, habillage sous-marin | site profond atteignable ; coût GPU mesuré |

Le schéma de bathymétrie (G8) doit être **réservé dès G1/G2** dans le registre et la couche de terrassement.

Chaque lot conserve les retouches et verrous, la lecture V1/V2 et les sauvegardes existantes. Pour chacun, noter séparément SPECIFIED, IMPLEMENTED, TESTED et RELEASED. Aucune performance n’est annoncée sans mesure sur GPU intégré.
