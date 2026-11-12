# 25 — AGRI : agriculture par parcelles, simulation différée et LOD LOW-RESOURCE

**Décision retenue le 13 novembre 2026.** Little World pourra proposer une **gestion agricole riche mais facultative**, dans des **parcelles explicitement définies** sur la carte. Le moteur conserve une **simulation persistante par parcelle** (ou quelques sous-zones), sans créer un objet logique ni lancer un tick de croissance pour chaque plante. **L'agriculteur dispose de détails et d'actions ; le passant reçoit une représentation compacte**, et le **rendu 3D dépend de la caméra/importance**, pas du rôle de l'observateur à distance identique.

**Statut : SPECIFIED seulement** : pas de système agricole complet codé ni de serveur de fermes déployé dans le prototype. **Les valeurs de cadence, nombre de parcelles, taille d'état, nombre d'espèces et seuils LOD sont des hypothèses à benchmarker.** L'agriculture approfondie est un **module optionnel de gameplay**, non une obligation imposée à tous les joueurs. Elle n'implique **pas de simulation biologique continue** ni une ferme pleine d'entités physiques.

Références : [02 — Gameplay](02-GAMEPLAY.md), [03 — Monde](03-WORLD-GENERATION.md), [04 — Studio](04-EDITOR-INTERACTIONS.md), [05 — Architecture](05-TECHNICAL-ARCHITECTURE.md), [06 — Assets](06-ASSET-PIPELINE.md), [07 — Roadmap](07-ROADMAP.md), [08 — Pages](08-GITHUB-PAGES.md), [09 — Tests](09-BROWSER-TEST-PLAN.md), [10 — Performance](10-PERFORMANCE-ROADMAP.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [12 — Périmètre](12-PROJECT-SCOPE.md), [13 — Studio UX](13-STUDIO-UX-ARCHITECTURE.md), [14 — Choix](14-TECHNICAL-CHOICES.md), [15 — V3](15-STUDIO-DATA-SCHEMAS-V3.md), [16 — Multijoueur futur](16-FUTURE-MULTIPLAYER.md), [17 — Horizon](17-DISTANT-VIEW-RENDERING.md), [18 — Herbe](18-GRASS-LOW-RESOURCE.md), [19 — Climat](19-ENVIRONMENT-WEATHER-SKY.md), [21 — Eau](21-WATER-HYDROLOGY-LOW-RESOURCE.md), [22 — PERF](22-RESOURCE-BUDGET-MANAGER.md), [23 — Audio](23-MIDI-AUDIO-LOW-RESOURCE.md), [24 — Mines](24-MINES-MULTILEVEL-LOW-RESOURCE.md).

## 1. Décision et invariants

1. **Parcelle = unité principale de simulation et d'autorité** : une parcelle polygonale, un sol initial, une espèce/un ensemble de zones cultivées, un historique agricole compact et un état daté. Si la parcelle a des variations significatives, autoriser **quelques sous-zones**, pas plusieurs milliers d'entités plantes.
2. **Agriculture riche = règles, pas milliers de ticks** : semis, croissance, saisons/température, humidité, fertilité, irrigation, maladies/parasites, rotation, outils, traitements, maturité, rendement, qualité, stockage/récolte. **Pas** de photosynthèse/écoulement hydrique/biologie individuelle en simulation lourde.
3. **Évaluation temporelle différée (lazy)** : `FarmSimulation` intègre un intervalle depuis `lastEvaluatedWorldTime` **sur action, échéance, requête fiable ou chargement nécessaire** ; aucune mise à jour de toutes les parcelles par frame.
4. **Météo sur la période**, pas météo instantanée de retour : agrégation climatique **versionnée, quantifiée et reproductible** par période et zone, plus événements d'irrigation/traitement datés. Le résultat d'une même série temporelle doit être indépendant de la présence d'un joueur.
5. **Deux vues de données, une vérité** : agriculteur/propriétaire autorisé reçoit **détails + commandes**, autres joueurs voient **état visuel minimal** (espèce si publique, stade, couleur, récoltée, effets évidents) ; le même moteur ne recalcule pas des plantes supplémentaires « pour l'agriculteur ». Le LOD de rendu est choisi **selon la caméra, taille écran, distance, matériel et besoins immédiats**, pas uniquement un rôle réseau.
6. **Séparer source auteur, état de partie, vue synchronisée et géométrie GPU** : `FarmPlotDefinitionV3` dans Studio/ZIP, `FarmPlotState` dans sauvegarde/serveur futur, `FarmPlotVisualState` pour les passants, meshes/instances purement dérivés.
7. **Serveur autoritaire seulement dans une future phase multijoueur** : actions `Plant/Irrigate/Fertilize/Treat/Harvest` validées, coûts + inventaire + parcelle atomiques/idempotents. **Solo d'abord** avec même contrat sur repository local.
8. **Budget PERF central** : culling de parcelles, mises à jour de simulation et génération de géométrie par file/échéance, textures/couleurs/instancing réutilisés, pas d'un `Mesh`, `Collider` ou `AudioNode` par culture.
9. **Données public/privé délimitées** : une personne passant près d'une ferme n'a pas nécessairement accès à sa fertilité, à ses stocks, à ses rendements ou à son calendrier interne. Les permissions sont contrôlées **par le serveur futur**, pas simplement par un panneau d'UI masqué.
10. **Pas de champs plantés partout** : toute agriculture permanente **reste à l'intérieur de parcelles/biotopes autorisés**, respectant eau/chemins/bâtiments/pentes et éventuellement mines.

## 2. Architecture proposée

```text
WorldDefinitionV3 / FarmPlotDefinitionV3 (Studio, source)
                           │
         CropCatalog + SoilRules + PlotGeometry
                           │
    EnvironmentTimeline / ClimateSummary (météo + saisons)
                           │
            FarmSimulation (lazy + événements)
                           │
     FarmStateStore (save partie / futur serveur)
                           │
          ┌────────────────┼───────────────────┐
          ▼                ▼                   ▼
 FarmerDetailView    FarmPublicVisualState   Event/Inventory
 UI/commandes         stades/rendement visuel  actions transactionnelles
                           │
                FarmLODRenderer / Instancing
                           │
                  ResourceBudgetManager
```

**Responsabilités sans monolithe** :
- `FarmPlotDefinitionV3` : `plotId`, polygone/bounds, owner/zone autorisée, sol initial, irrigation disponible, catalogue de cultures compatibles, sous-zones optionnelles, placement des rangs, contraintes de terrain et version de règles.
- `CropCatalog` : profils d'espèces config (données), besoins température/eau/nutriments, degrés-jours, stades, saisons, délai maturité, perte/qualité, rendement de base et assets visuels. **Un code moteur commun**, pas une fonction spécifique par espèce.
- `FarmSimulation` : intervalle, intégration déterministe des stades/ressources/rendements, conversion des actions en événements. Pas de tick 30 Hz agricole.
- `FarmStateStore` : culture active, dernier temps évalué, humidité/nutriments/santé, stades, actions historiques utiles, rendement/récolte, révisions et échéances. Pas de `InstancedMesh` ni buffers WebGL.
- `FarmEventScheduler` : file de **prochaines échéances significatives** (ex. maturité, dégradation, effet d'un traitement, tâche agricole), **pas une minuterie JS par parcelle**. Gestion par lot et quota.
- `FarmQuery` : recherche par `plotId` et index spatial `worldChunkIds`, état au temps cible, autorisation du demandeur, requêtes propriétaire vs passant.
- `FarmLODRenderer` : représentation par **polygone/texture/couleur, rangs simplifiés et instances proches**, avec buffers partagés par espèce/stade, phase d'animation visuelle de vent facultative.
- `FarmSyncAdapter` : solo `LocalFarmRepository`, puis serveur futur via intentions/revisions/deltas. **Ne pas écrire un backend dans la campagne solo au seul motif qu'une interface est définie.**

## 3. Parcelles, sous-zones et propriétés agronomiques

**Géométrie** :
- Parcelle = **polygone X/Z avec ID stable** (et position Y dérivée du heightfield), délimitation propriétaire et dimensions. Validateur : auto-intersection, contours trop petits, pentes non praticables, recoupement d'eau/route, emprises de bâtiment ou mine, zones protégées, orientation de rangs.
- Une parcelle peut être découpée en **petit nombre de zones agricoles**, notamment pour cultures différentes, irrigation partielle ou sols distincts. **Les sous-zones ne sont pas des plantes** ; leur nombre et granularité seront contraints d'après tests (par exemple 1–16, hypothèse, pas contrat dur).
- **État unique par zone** : espèce, date de semis, stade, progression thermique, humidité, nutriments quantifiés, santé, stress hydrique, parasites/maladies agrégés, rendement/qualité et historique des dernières cultures. Pas de coordonnées persistantes de chaque plant.
- **Rotation des cultures** : quelques précédents `cropId`, dates, indicateurs de nutriment/pression maladie ; éviter de conserver sans borne chaque croissance quotidienne.
- **Irrigation** : capacité/accès à une source ou canal sous [21 — Eau](21-WATER-HYDROLOGY-LOW-RESOURCE.md), contrôle de débit **abstrait à l'échelle de la zone** et éventuel stock d'eau ; **aucun solveur hydrologique** dans chaque rang. Les contraintes d'accès et d'eau prélevée sont des règles de gameplay, pas une animation des molécules.
- **Fertilité** : 1–3 réservoirs simplifiés et bornés, éventuellement nutrition N/P/K si besoin confirmé, mais **pas** de chimie détaillée par m². `soilHealth`/risques modifiés par historique, outils et saisons.
- **Maladie/parasites** : indicateurs agrégés par parcelle/zone ; événements/risques déterministes par période/seed, influence du climat, rotation, voisinage **résumé**, traitements et protection. Pas de PNJ insecte simulé par parasite.
- **Qualité/rendement** : score et quantité dérivés des conditions cumulées, surfaces et actions valides ; formule versionnée, bornée, reproductible, sans calcul par plante.

**Première palette de démonstration** : 6–12 espèces configurables à tester (céréales, légumes et quelques cultures de climat), **pas une limite produit définitive**. La complexité vient des profils et règles partagés, non d'un moteur par espèce.

## 4. Temps, météo et croissance hors présence du joueur

**Moteur événementiel/différé**, sans calcul agricole sur le RAF :
1. À la première lecture valide, action, échéance ou chargement de partie, récupérer `lastEvaluatedWorldTime` et `targetWorldTime`.
2. Récupérer des **résumés climatiques couvrant réellement l'intervalle** (`ClimateSummary` : chaleur/degrés-jours, pluie, évaporation approximée, gel, soleil si utile), **selon la zone et la période** ; ne pas remplacer l'historique par « météo courante × durée ».
3. **Rejouer les actions agricoles datées** et les changements de profil/règle dans l'ordre causal ; intégrer la croissance par **tranches bornées de temps agricole** ou via équations intégrables lorsque sûres.
4. Mettre à jour humidité/nutriments/santé/maturité/rendement en unités/arrondis déterministes, calculer **échéance suivante** et stocker nouveau snapshot avec révision. Une parcelle déchargée n'a pas besoin d'instance 3D.
5. Pour une demande visuelle, produire **un état public compact** sans forcer la construction de toute la UI propriétaire.
6. Les actions critiques `Harvest/Irrigate/Plant` **évaluent l'état à l'heure effective** avant la transaction, afin d'éviter des récoltes anticipées ou divergentes.

**Conservation climatique** : stocker **un journal d'événements significatifs** et des **agrégats périodiques** versionnés (par exemple par journée de jeu et région), avec règles de conservation/migration. Ne pas garder un million de ticks pluie/vent ; **ne pas perdre** pour autant les sécheresses/gels et traitements passés.

**Garantie déterministe** : une parcelle évaluée toutes les minutes et la même parcelle évaluée 10 jours plus tard doivent conduire à un état équivalent, à tolérance de quantification explicitée, si elles reçoivent **exactement la même séquence de climat/actions et versions**. Documenter comment les arrondis intermédiaires sont appliqués pour éviter un avantage au joueur connecté.

**Pièges et contraintes** :
- Le `WorldClock` peut être **accéléré en bêta** ; la simulation agricole progresse en temps **du monde**, pas en secondes PC du joueur ni en frames WebGL. En multijoueur, le serveur est propriétaire de l'horloge.
- **Longues absences** : réduire le coût par résumés climatiques, calculs bornés et snapshots/échéances ; si l'historique nécessaire manque, **signal explicite et règle de rattrapage documentée**, pas résultats inventés.
- **Règles modifiées après publication** : versionner culture/modèle climatique et migrations. Ne pas appliquer rétroactivement une nouvelle formule sans décision explicite.
- Les effets de maladie/maturation hors écran peuvent nécessiter **une échéance de logique même sans joueur** pour événements globaux/contrats ; planifier les seules échéances obligatoires, pas toutes les cultures chaque seconde.

## 5. Répartition des calculs, données et rendu

| Besoin | Agriculteur autorisé | Joueur passant | Parcelle déchargée |
| --- | --- | --- | --- |
| **Vérité de la croissance** | Même `FarmState` partagé | Même `FarmState` partagé | État enregistré + temps |
| **Simulation** | Sur action/lecture/échéance | Sur besoin d'un état visible, si nécessaire | Sur prochaine échéance obligatoire seulement |
| **Données réseau** | Humidité, nutriments, santé, progression, rendement, historique permis | `plotId`, culture/stade/couleur, état récolté/visuel pertinent | Aucune diffusion |
| **Actions** | Semer, arroser, traiter, récolter, consulter selon permissions | Voir, visiter, aider si autorisé | Aucune sans événement |
| **Rendu 3D** | LOD par **caméra**, détails de plants si proche | Même LOD **à caméra équivalente** | Aucun mesh |
| **UI** | Inspection détaillée et outils | Indication compacte éventuelle | Aucune |

**Ne pas confondre** :
- **Détail d'UI/données selon droits** ≠ **nombre de plantes rendues selon GPU/caméra**.
- Si l'agriculteur regarde sa parcelle depuis une colline, la parcelle doit rester une **surface lointaine simplifiée** ; s'il entre dans les rangs, ils sont instanciés comme pour tout visiteur proche.
- Un observateur sans droits **ne doit pas recevoir** humidité cachée, historique des traitements, stocks privés ou rendement futur exact via les messages, même si son interface n'affiche pas ces champs.

## 6. Rendu LOW-RESOURCE : champs et plantes sans entités individuelles

| LOD (dépend de caméra/écran) | Présentation | Coût |
| --- | --- | --- |
| **LOD0 proche** | Plants low-poly **instanciés** par classe d'espèce/stade, légère variation déterministe de taille/teinte, petits effets de récolte | Géométrie partagée ; peu de draw calls |
| **LOD1 intermédiaire** | Rangs simplifiés en groupes spatialement cullables, petite animation vent optionnelle | Densité réduite |
| **LOD2 éloigné** | Bandes simplifiées, teinte moyenne/stade, **pas d'animation par plant** | Très faible |
| **LOD3 panorama** | Couleurs/masques sur parcelle/terrain et rangs suggérés, **aucune instance de plante** | Coût de fragments limité |

**Reconstruction** :
- Positions de plants décoratifs générées **par `plotId + cropId + stage + seed + cellule de rendu`**, sans stocker les milliers de `EntityDefinitionV3`.
- Géométrie et matériau partagés par famille/plante; `InstancedMesh` en groupes **suffisamment petits pour culling**, réutilisés par secteur. Les variations de taille/couleur peuvent être stockées dans attributs d'instance, sans processeur JS par brin.
- **Stade change** : rafraîchir seulement la parcelle/zone visuelle et le cache dérivé ; ne pas rebâtir tout le terrain ni les autres fermes. Progression de hauteur peut être une **interpolation shader simple** ou un remplacement rare du buffer.
- Les cultures hautes peuvent avoir une collision **agrégée** pour les objets significatifs (barrières/arbustes robustes), mais **pas une collision par épi de blé**.
- **Herbes sauvages** et cultures sont des **couches distinctes** : masquer l'herbe de prairie dans le polygone cultivé, éviter doublons et z-fighting.
- **Neige/météo/eau** : recevoir uniformes environnement globaux ; animation de vent à coût nul au-delà de l'anneau proche, pas un shader fragment lourd sur une parcelle plein écran.
- **Replanter** = nouveau stade/état, pas des milliers d'objets réseau ni replay d'animations pour les passants.

Les seuils de distance ne sont **pas fixés** : utiliser `ResourceBudgetManager` (importance visuelle, taille projetée, vitesse de planage, GPU) et mesurer FPS/p95, fill-rate, instancing/instances réellement visibles, mémoire GPU estimée.

## 7. Actions de gestion complètes, mais calculs agrégés

| Action | Contrôle logique | Effet persistant |
| --- | --- | --- |
| `Plant` | parcelle libre, espèce compatible, saison/outil/stock graines, droits | culture/date/stock consommé |
| `Irrigate` | source disponible, quantité et droits, capacité de parcelle | humidité et consommation d'eau |
| `Fertilize` | type/quantité stock, compatibilité sol/limites | nutrition/sol, inventaire débité |
| `Treat` | produit/outil, contraintes et risque/état | santé/pression parasite/stock |
| `Tend` | entretien désherbage/outils, période et délais | qualité/risque/état agronomique |
| `Harvest` | maturité, quantité réellement disponible, outil/place inventaire | rendement/qualité, parcelle récoltée, inventaire crédité |
| `Clear/Rotate` | cycle terminé, sol et saison | état de culture remis à zéro, précédent conservé |

**Économie** : les actions de groupe sur rangs/parcelles modifient **une zone agronomique**, pas chaque plant séparément. Des outils permettent une interaction intuitive (arrosoir, binette, panier), sans simulation physique du liquide ou d'un grain par plant.

**Rendements et saisons** : les coefficients sont des données de profil et des fonctions quantifiées/versionnées, à ajuster par **tests gameplay**, pas des modèles agronomiques réels promettant une justesse scientifique.

## 8. Sauvegarde, permissions et serveur futur

**Sources persistantes séparées** :
- **Studio** : `FarmPlotDefinitionV3` (polygone, subdivision, sol et irrigation initiaux, profil, ownership/zone), catalogue de cultures et assets; export carte V3 portable.
- **Partie solo** : `FarmPlotState` par parcelle/zone, horodatage agricole, progression et ressources, révisions, inventaire et journaux d'événements nécessaires; sauvegarde locale versionnée distincte du projet auteur.
- **Futur serveur** : mêmes états avec autorité serveur, persistance durable, horloge et historique climatique communs, permissions; ne pas confondre « champs publics visibles » avec « secrets agronomiques lisibles par tous ».

**Exemples d'interfaces indicatives** (unités, stockage définitif et contrôle de droits à figer en `AGRI-1`) :

```ts
interface FarmPlotDefinitionV3 {
  plotId: string;
  schemaVersion: 1;
  outlineXZ: [number, number][];     // coordonnées monde, Y dérivé
  ownerScopeId?: string;            // aucun droit déduit du seul string
  soilPresetId: string;
  irrigationSourceRef?: string;
  zoneRefs?: string[];              // zones agricoles bornées
  rowPresetId?: string;
  seed: number;                    // variations visuelles uniquement
}

interface FarmZoneState {
  zoneId: string;
  cropId: string | null;
  plantedWorldTime: number | null;
  lastEvaluatedWorldTime: number;
  stage: "empty" | "seeded" | "growing" | "mature" | "harvested" | "failed";
  degreeDays: number;              // quantifié, profil versionné
  soilMoisture: number;             // borné, quantifié
  soilNutrients: number[];          // 1–3 réserves simples
  health: number;                   // état agrégé
  pendingYield: number;             // prédiction/réserve, non récompense autoritaire
  previousCropIds: string[];        // historique borné
}

interface FarmPlotState {
  plotId: string;
  revision: number;
  modelVersion: number;
  zones: FarmZoneState[];
  nextRelevantWorldTime?: number;
}

interface FarmActionRequest {
  requestId: string;                // idempotence
  plotId: string;
  zoneId?: string;
  type: "Plant" | "Irrigate" | "Fertilize" | "Treat" | "Tend" | "Harvest" | "Clear";
  payload: unknown;                 // valider par type/action avant emploi
  expectedRevision?: number;
}
```

**État public compact** : `plotId/revision/publicCropId/stage/visualVariant/harvested` (selon permissions) ; **état agriculteur détaillé** séparé. Le serveur envoie un **snapshot initial au chargement/AOI** puis des **deltas à changements significatifs**, pas les valeurs des plants, les vertices, la simulation par seconde ni les données privées.

**Sécurité et transactions futures** :
1. Authentifier et vérifier droits de consultation/action, position/portée si action physique, outils, inventaire, parcelle et version/révision.
2. Avancer `FarmSimulation` au temps **autoritaire** en utilisant le **même** historique climatique que les autres parcelles.
3. Appliquer **atomiquement** `FarmState + Inventory + WaterStock` si pertinent, éviter double semis/récolte/irrigation avec `requestId` unique. Gérer concurrence de deux propriétaires ou joueurs d'une même parcelle.
4. Émettre une révision monotone, **deltas/snapshots par zone d'intérêt**, mise à jour de `FarmPublicVisualState` uniquement quand l'apparence change.
5. La consommation de temps doit être stable pendant déconnexion/connexion ; les requêtes de vue ne doivent **pas** accélérer la culture ni permettre de dupliquer la récolte.
6. **Solo** : implémenter les mêmes commandes et journal d'événements dans `LocalFarmRepository`, sans serveur ni anti-triche prétendue.

**Charge réseau** : la majeure partie du trafic agricole est **événementielle**, pas des paquets à 10–30 Hz comme le mouvement des joueurs. Les intervalles d'échéance et états de culture sont **pilotés par gameplay**, sans fréquence réseau fixe imposée.

## 9. Échelle et budgets PERF : hypothèses à qualifier

**Cible qualitative** : des centaines/milliers de parcelles décrites et persistantes, avec le **coût temps réel principalement proportionnel aux parcelles actives/visibles et événements, pas au nombre de plantes ou à la superficie totale de la carte**.

**Mémoire** : un état logique compact pourrait viser **~96–256 octets par parcelle/zone** en représentation binaire très condensée (dépend des champs), soit **~94–250 Kio bruts pour 1 000 unités**. Il ne s'agit **ni** d'une mesure V8/JSON/DB, **ni** de la mémoire totale (polygones, profils, index, historique, réseau et caches ajoutent un surcoût). Les formats précis doivent être mesurés sur des états réels.

**Quotas** :
- `FarmEventScheduler` = file prioritaire de prochaines échéances, **pas de scan de toutes les parcelles par frame** ; travail borné et étalé via `WorkScheduler`.
- `FarmSimulation` peut s'exécuter **sur événement/demande**, même hors caméra ; priorité aux actions gameplay, échéances globales et requêtes de consultation, ensuite aperçus non urgents.
- `FarmLODRenderer` crée des groupes **instanciés** uniquement pour parcelles à proximité/visibles ; les parcelles loin restent **couleurs/masques** et visuels stockés/cachés dérivés.
- `ResourceRegistry` comptabilise buffers d'instances, géométries et matériaux partagés, textures/atlas et caches de parcelles visibles ; éviction des éléments inactifs.
- **Aucune animation par plante en CPU** ; vent visuel local uniforme/vertex simple ou OFF, pas d'ombre dynamique par plant, pas de colliders individuels.
- Le budget d'un parcelle et les seuils de LOD sont **communs au reste du monde** via `ResourceBudgetManager`, pas un régulateur AGRI concurrent.

**Scénarios à mesurer** : 100 / 1 000 / 10 000 parcelles **synthétiques** (sans prétendre qu'elles seront toutes visibles), 0 / 10 / 100 parcelles proches avec rangs instanciés, événements simultanés (orage, pluie, récoltes), accélération de l'horloge, 30 jours de reprise, vue de planage sur champs, plusieurs agriculteurs et passants. Mesurer **CPU évaluation & génération, p95/p99, mémoire estimée, nombre de jobs, draw calls/overdraw, taille snapshots/deltas et latence serveur simulée**. Tester aussi la mémoire du journal climatique et de l'historique d'actions à longue durée.

## 10. Studio : outil Parcelles simple et évolutif

- Outil **« Parcelle »** : polygone sur carte/terrain, alignement du relief, taille/rotation des rangs, clôtures/chemins, accès eau, culture/sol initial.
- **Sous-zones facultatives** : dessiner une ou quelques zones, profils d'irrigation distincts, sans éditeur de plante individuelle par défaut.
- **Bibliothèque de cultures** : une fiche paramétrable `CropProfile` par espèce, rendus de stade (semis/pousse/mature/sec), saison, température/eau, rendement, difficulté et provenance d'assets.
- **Inspecteur agriculteur en jeu** : culture, progression, humidité, fertilité, santé, planning, outils, récoltes/stock, actions et permissions. **Pour le passant : pas de panneau de gestion**, éventuellement info publique rapide.
- **Tests internes** : simuler horaire/saison/température/pluie/sécheresse, comparer croissance connecté vs hors ligne, calcul d'une récolte et latence d'actions, visualiser erreurs de connectivité eau/droits/stock.
- **Playtest** sur état de partie **jetable** : ne pas écrire les récoltes/tests météo dans l'archive Studio. Undo/Redo du polygone/source auteur et save partie séparée.
- **Blender/GLB** : presets de maison de ferme, outils, grange, clôture et quelques plantes/arbustes proches; surfaces/cultures et rendements sont des **données V3**, pas une collection de 10 000 GLB de blé.
- **Export ZIP V3** : polygones, profils de sol/culture, assets, IDs, liens d'eau; pas de cache GPU/instances ni réserves/récoltes d'une partie privée.

## 11. Risques, contraintes, diagnostics

- **Précision météo dans le passé** : ne pas prendre météo « du jour » pour dix journées écoulées. Prévoir **agrégats climatiques par région et période** plus journal daté des interventions.
- **Déterminisme connecté/hors ligne** : gérer quantification et intégration par tranches, version des formules/cultures et sérialisation de temps. Même seed ≠ même résultat si les événements climatiques diffèrent.
- **Faim de tâches** : 10 000 récoltes/échéances simultanées ne doivent pas bloquer un frame ni empêcher un joueur de récolter; mise en file et transactions priorisées, reprise sans perte ni réordonnancement causal.
- **Parcelles multipolygones / zones étendues** : ownership par `plotId`, index sectoriel, vue/hors écran. Une parcelle recoupant trois chunks reste une **seule source/état**, pas une triple récolte.
- **Eau / neige** : un champ inondé ou enneigé conserve son état logique, les shaders/matériaux affichent un effet approximé. La croissance ne doit **pas dépendre du WaterLOD** ou du rendu de neige.
- **Droits** : surface publique ne signifie pas permission de récolter. Historique, stock et rendement prévisionnel ne sont transmis qu'aux joueurs autorisés.
- **Économie** : des millions de plantes dessinées près de plusieurs joueurs peuvent coûter cher même si la simulation est légère : plafonner **instances, shaders, overdraw et ombres** via PERF, mutualiser les ressources.
- **Écoute/agriculteur** : une interface détaillée ne doit pas charger les milliers de modèles visuels lointains; séparer requête `FarmPlotState` du renderer.
- **Règles de récolte** : même parcelle ne doit jamais récompenser deux fois après double clic, retry, changement d'onglet, conflit serveur ou retour de session.

## 12. Tests de qualification

1. **Parcelle vide → semis → entretien → maturité → récolte** avec au moins 3 profils d'espèces, inventaire et saison valides.
2. **Simulation offline vs online** : même météo agrégée, même seed et actions datées, mêmes rendements/stades à quantification définie après 10–30 jours fictifs; changement de saison, gel, sécheresse et pluie inclus.
3. **Temps accéléré / onglet masqué / reprise** : aucune croissance doublée ou bloquée, pas de minuteur individuel par parcelle, horloge locale/serveur clairement séparées.
4. **Humidité/irrigation** : capacité de source, consommation d'eau atomique, effet au bon moment, pas de dépendance à l'animation de rivière/particules de pluie.
5. **Risque maladie/rotation** : événement déterministe/sous-zones, aucune réapplication aléatoire lors d'une simple consultation.
6. **Double récolte simultanée** : une récompense et une révision, idempotence des commandes et delta/snapshot après perte d'un paquet.
7. **Passant vs propriétaire** : données reçues/permissions/commandes distinctes, **même rendu à caméra identique** ; aucune fuite de stocks privés.
8. **Plantes graphiques** : zoom LOD0→3 et planage, silhouettes de champs visibles, densité instanciée proche, aucun popping excessif, pas de plant individuel distant.
9. **Parcelle sur plusieurs chunks**, changement de biotope/terrain proche, pluie/neige, route et eau : invariants des polygones, caches et invalidation locale.
10. **Export/import auteur ZIP V3** + **sauvegarde/rechargement de partie** : même géométrie de parcelle et même état agricole; aucune contamination source par état joueur.
11. **Stress** 100/1 000/10 000 parcelles descriptives, nombreux joueurs virtuels ou événements simultanés, mémoire/journaux bornés, CPU et p95/p99; GPU intégré réel avant de promettre 30/20 FPS.
12. **Edition Studio** : changer un polygone/rang/profil, Undo/Redo, recalcul sectorisé, source persistante; ne jamais effacer silencieusement une récolte existante en partie.

## 13. Roadmap AGRI-0…AGRI-8

| Phase | Livraison minimale et preuve |
| --- | --- |
| **AGRI-0** | Prototype/banc de simulation par parcelle, comparaison état agrégé vs grille/entités, charge 100/1 000/10 000 parcelles |
| **AGRI-1** | Sources `FarmPlotDefinitionV3`, zones/cultures/sols, IDs, index spatial et sauvegarde d'état agricole séparée |
| **AGRI-2** | `FarmSimulation` différée, `ClimateSummary`, horloge/saisons, historique compact, tests offline/online déterministes |
| **AGRI-3** | Humidité/irrigation, fertilité, rotation, maladies/parasites/traitements, versions de règles |
| **AGRI-4** | `FarmLODRenderer` niveaux de détail, instancing proche, rangs/proxies lointains, PERF/streaming |
| **AGRI-5** | Semis, entretien, récolte, inventaire, transaction locale/idempotence, UI agriculteur et passant distincte |
| **AGRI-6** | Studio éditeur de parcelles et catalogue de cultures, validation terrain/eau, preview/test, export/import ZIP V3 |
| **AGRI-7** | Contrats futur serveur : permissions, commandes autoritaires, snapshots/deltas/révisions, données publiques/privées, échéances |
| **AGRI-8** | Benchmarks GPU intégré et charge logique, tests de sessions longues et de concurrence, qualification des seuils |

**Ordre conseillé** : commencer par un **petit prototype jouable avec 1–3 parcelles, 3 cultures, plantation/croissance/récolte/sauvegarde**, mesurer et tester l'absence de croissance par frame avant d'étendre à 6–12 espèces et aux maladies/irrigation. **Pas de backend multijoueur requis pour le prototype solo.**

**Statut strict :** `SPECIFIED` ≠ `IMPLEMENTED` ≠ `TESTED` ≠ `BENCHMARKED` ≠ `RELEASED`.

**Décision finale :** *les cultures sont des états persistants calculés par parcelle à la demande ou aux échéances, pas des entités actives permanentes ; agriculteur et passant consultent des vues différentes du même état, tandis que l'apparence est optimisée indépendamment selon la caméra et le budget.*
