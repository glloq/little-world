# 19 — Environnement : météo, ciel, neige, soleil, étoiles, lunes et ombres LOW-RESOURCE

**Cadrage validé le 12 novembre 2026.** Objectif : permettre tous les états météo et les cycles célestes de Little World, avec **un coût CPU/GPU réduit, prévisible et adaptable**, compatible avec la carte continue (au plus 10 × 10 km), le planage, les vues lointaines sans brouillard-cache et le futur multijoueur.

**Statut : spécification et cible technique, PAS fonctionnalités déjà livrées.** La bêta doit exposer un **menu de tests local** ; un futur serveur sera la **source autoritaire** de l'horloge et des états météo. Les deux sources doivent alimenter exactement le **même moteur de rendu**, sans créer dès maintenant de backend.

Références : [05 — Architecture](05-TECHNICAL-ARCHITECTURE.md), [07 — Roadmap](07-ROADMAP.md), [10 — Benchmarks](10-PERFORMANCE-ROADMAP.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [14 — Choix](14-TECHNICAL-CHOICES.md), [15 — V3](15-STUDIO-DATA-SCHEMAS-V3.md), [16 — Réseau futur](16-FUTURE-MULTIPLAYER.md), [17 — Horizon sans fog-cache](17-DISTANT-VIEW-RENDERING.md) et [18 — Herbe](18-GRASS-LOW-RESOURCE.md).

## 1. Règles de conception

1. **Une seule horloge logique, un seul état d'environnement résolu, plusieurs rendus spécialisés** : pas de simulation météo ni de système de temps par arbre/chunk/mesh.
2. **Rendu décorrélé de la source** : aujourd'hui `LocalEnvironmentSource` (horloge locale + scénarios bêta) ; plus tard `ServerEnvironmentSource` (snapshots/horodatages/événements). Même `EnvironmentSystem`, sans WebSocket ni autorité serveur requise en solo.
3. **Pas de nuages volumétriques raymarchés, ni simulation de millions de gouttes/flocons**. Ciel stylisé procédural simple, pluie/neige en échantillon visuel local instancié, vents partagés avec végétation/eau.
4. **Conserver les ombres à coût borné**, au maximum une source majeure projetant de vraies ombres solaires près du joueur, avec **liste limitée de casters proches/importants**. Petits objets/herbes et horizon : **aucune ombre dynamique**.
5. **Lumière, accumulation de neige et humidité changent via coefficients de shader / masques de surface**, sans reconstruire toute la carte, remplacer les matériaux à chaque variation ou réuploader toutes les géométries.
6. **Ciel nocturne étoilé** très léger, **une ou plusieurs lunes configurables**, chacune avec **orbite, période et phase propres** ; l'éclairage nocturne ne multiplie pas les shadow maps.
7. **Pas de brouillard servant à masquer le clipping**. Le brouillard est un phénomène météo explicite, variable et désactivé hors météo correspondante ; les reliefs lointains restent présents sous la couche atmosphérique.
8. **Une seule politique adaptative de budget** pour météo, ombres, herbes, végétation, personnages et horizon : réduire d'abord les effets cosmétiques ; préserver l'heure, l'illumination lisible, l'état de neige et la silhouette lointaine.
9. **Contraintes non garanties** : cibles 30 FPS nominal / 20 FPS secours sur GPU intégré ; chaque coût et qualité sera mesuré sur matériel représentatif. Aucun FPS ou budget de météo n'est actuellement démontré.

## 2. Modules et contrats

```text
LocalEnvironmentSource (bêta/solo)   ServerEnvironmentSource (futur)
                 \                           /
                  ---- EnvironmentStateSource ----
                                |
                   WorldClock + ClimateResolver
                                |
                       EnvironmentState
                    /       |       |       \
             SkyRenderer Lighting SurfaceWeather Precipitation
                 |        |       |            |
           Stars/Moons ShadowBudget Rain/Snow   Wind field
                                |
                      LowResourceBudget
```

**Responsabilités :**
- `WorldClock` : temps monotone/epoch du monde, rythme jour/année, pause/accélération en bêta, aucune dépendance au RAF.
- `ClimateResolver` : zone climatique macro/altitude, transitions déterministes, température, précipitations, vent, couverture nuageuse, accumulation/fonte.
- `EnvironmentStateSource` : délivre des états/snapshots horodatés **quelle que soit leur provenance**, sous une interface lisible et testable.
- `EnvironmentSystem` : résout le temps d'observation, interpole états et applique des uniformes communs, **sans rescanner tous les meshes chaque frame**.
- `SkyRenderer` : ciel, gradient, soleil visuel, lune(s), étoiles, couverture nuageuse.
- `LightingController` : intensité/couleur de la lumière solaire, de l'ambiance et du clair de lune approximé ; ombres via `ShadowBudgetManager`.
- `SurfaceWeather` : coloration neige/humidité, masques statiques par type d'asset/terrain.
- `PrecipitationRenderer` : pluie et neige utilisant le **même système d'instances locales**, avec paramètres de vitesse/taille/trajectoire.
- `EnvironmentTestPanel` : forçage local réversible pour la bêta, sans modifier projet/sauvegarde.

**Ne pas créer dix modules artificiels immédiatement** : cette liste décrit des rôles ; grouper le code tant que les responsabilités restent lisibles.

## 3. Modèle canonique : données auteur, météo dynamique, rendu

**Trois niveaux indépendants** :
1. `EnvironmentDefinitionV3` **auteur** : durée jour/année, trajectoire solaire stylisée, profil des étoiles, définitions des lunes, climats/biomes macro, transitions et palettes, variations d'altitude. Inclus dans la source Studio, versionné et validé.
2. `EnvironmentSnapshot` **runtime/serveur futur** : instant logique, état(s) météo par grandes régions, positions ou phases/horloge de transition, couverture nuageuse, précipitations, vent, température, accumulation de neige, humidité, brouillard, orage, seed, version. **Compact et horodaté**, indépendant de Three.js.
3. `EnvironmentVisualState` **client seulement** : soleil/lunes/étoiles calculés, uniformes/interpolations, nombre de particules, qualité d'ombres ; jamais persistant comme vérité métier ni synchronisé au niveau du mesh.

Types **illustratifs (pas encore implémentés)** :

```ts
type WeatherKind = "clear" | "cloudy" | "rain" | "snow" | "storm" | "fog" | "mixed";

interface MoonDefinition {
  id: string;
  name: string;
  orbitPeriodWorldDays: number; // > 0, indépendante des autres lunes
  initialOrbitalPhase: number;  // [0,1), au temps de référence
  inclinationDeg: number;
  ascendingNodeDeg?: number;
  angularDiameterDeg: number; // apparence dans le ciel
  color: string;
  brightness: number;         // contribution visuelle bornée
  phaseMode?: "derivedFromSun" | "artDirected";
}

interface EnvironmentDefinitionV3 {
  schemaVersion: 1;
  epochWorldSeconds: number;
  dayLengthWorldSeconds: number;   // durée d'un jour dans l'horloge du monde
  yearLengthWorldDays?: number;    // saisons stylisées facultatives
  solarTiltDeg?: number;
  moons: MoonDefinition[];         // 0, 1, 2... lunes, nombre contrôlé par validation
  starsSeed: number;
  climateZones: ClimateZoneDefinition[];
}

interface WeatherRegionState {
  regionId: string;
  kind: WeatherKind;
  cloudCover: number;          // [0,1]
  precipitationRate: number;   // [0,1], apparence choisie selon température/type
  temperatureC: number;
  windDirectionRad: number;
  windStrength: number;       // intensité physique/visuelle normalisée
  fogDensity: number;         // météo seulement
  stormIntensity: number;     // [0,1]
  snowCover: number;          // [0,1], persistante entre averses
  wetness: number;            // [0,1]
}

interface EnvironmentSnapshot {
  worldId: string;
  schemaVersion: number;
  worldTimeSeconds: number;
  timeScale: number;
  stateEpoch: number;          // version/numérotation croissante pour rejeter snapshots obsolètes
  weatherSeed: number;
  regions: WeatherRegionState[];
  transitions?: EnvironmentTransition[];
}
```

**Choix de temps :** `worldTimeSeconds` est un temps absolu du monde et `timeScale` le facteur de progression ; le client dérive les trajectoires par **fonctions pures du temps + seed**. Éviter d'accumuler la phase de chaque astre frame après frame (dérive, pause, reconnexion). Si l'auteur choisit « 45 min réelles par jour », représenter explicitement la conversion durée réelle → temps monde dans une configuration distincte ; **ne pas confondre les unités**.

**Validation :** champs bornés et finis, IDs uniques, périodes strictement positives, vitesses météo raisonnables, nombre d'astres borné selon le profil/compatibilité (sans imposer un plafond universel arbitraire), évolution de schéma migrable. Les états de rendu local ne sont pas enregistrés dans un slot de sauvegarde comme source d'autorité.

## 4. Jour/nuit, lever/coucher du soleil

- `sunDirection = f(worldTime, solarTilt, latitudeStylized?, season)` calculé depuis l'horloge ; direction caméra compatible avec un soleil à l'horizon, pas simplement une rotation de couleur.
- **Un seul soleil visuel** : disque et éventuellement halo de faible coût dans le shader de ciel ; pas de source de lumière pour le disque indépendamment de la lumière principale.
- Un **gradient ciel** jour/aube/crépuscule/nuit, palette pilotée par l'altitude du soleil et la couverture nuageuse ; éviter une texture panorama distincte par heure.
- `DirectionalLight` solaire principale + `HemisphereLight` ambiante ; luminosité/couleur changées via paramètres, sans ajouter des dizaines de lampes.
- **Transition continue** : lever et coucher chauds, journée claire/couverte, nuit froide ; préserver silhouettes d'horizon et visibilité jouable en nuit LOW-RESOURCE.
- Calcul des paramètres globaux à faible fréquence (p. ex. **1–2 Hz** comme valeur initiale) avec interpolation de valeurs visuelles si besoin ; le shader ciel peut utiliser un temps continu et rester à 30/20 FPS.
- À la nuit : **soleil sans ombre**, éclairage d'ambiance nocturne stylisé. Les lanternes peuvent émettre une lumière locale limitée, **sans shadow map supplémentaire par défaut**.
- Éclairage **physiquement plausible si utile, mais pas astrophysiquement lourd** : priorité à un ciel cohérent, agréable et bon marché.

## 5. Étoiles : ciel nocturne sans coût par étoile

**Choix recommandé : un seul star field de fond, sans entité ni animation individuelle.**

- Générer une **petite carte d'étoiles déterministe** depuis `starsSeed` (échantillons sur sphère ou texture unique, pas des centaines d'objets Three.js).
- Le ciel tourne selon une **horloge de rotation céleste** dérivée de l'epoch et de la période choisie (jour sidéral fictif si utile). Le soleil n'a pas besoin de faire tourner toutes les étoiles via CPU.
- Apparition progressive **au crépuscule** en fonction de l'altitude solaire, de la couverture nuageuse et de la visibilité atmosphérique ; ne pas rendre les étoiles visibles en plein jour/à travers un ciel couvert.
- Optionnel : légère scintillation globale dans shader à faible amplitude et densité limitée ; désactivable en profil minimal.
- Au maximum **un draw call ou intégré au shader ciel** ; pas de source d'éclairage, de physique ou de téléchargement étoile par étoile.
- Une constellation peut être une métadonnée visuelle future ; pas de simulation d'astres individuels nécessaire.

## 6. Une ou plusieurs lunes, chacune avec son cycle

**Exigence explicite : cycles indépendants.** Le projet doit autoriser **zéro, une ou plusieurs lunes**, de tailles/couleurs différentes, avec une **période orbitale propre, déphasage initial et inclinaison**. Deux lunes ne sont pas liées par une phase forcée commune.

Pour chaque lune `i` :
- `orbitalAngle_i(t) = 2π * fract(initialOrbitalPhase_i + worldTimeDays / orbitPeriodWorldDays_i)`.
- En déduire sa **direction du ciel** à partir d'un plan orbital stylisé, de l'inclinaison et du nœud ascendant, et contrôler sa visibilité quand elle est sous l'horizon.
- **Phase éclairée** (nouvelle, croissant, quartier, gibbeuse, pleine) normalement **dérivée de la géométrie Soleil–Lune–observateur**, afin de rester cohérente avec la direction solaire ; orientation de la partie éclairée tournée vers le soleil.
- Autoriser un mode `artDirected` explicite seulement pour un monde de fantasy si la cohérence physique est volontairement abandonnée. Une phase indépendante arbitraire et une orbite géométrique indépendante ne doivent pas se contredire silencieusement.
- L'apparition et le lever/coucher de **chaque** lune sont déterminés par son orbite, **pas** par le déclenchement de la nuit : elle peut être visible de jour si la phase/couleur le permet.
- L'horloge absolue permet de calculer instantanément leurs positions **après chargement, téléportation, accélération du temps et reconnexion**.

**Rendu économique :**
- **Disques orientés caméra/sprites ou inclus au shader du ciel**, avec éclairage de croissant simple ; 1 à quelques sprites/draw calls ou passage ciel unique.
- Pas de mesh 3D haute résolution, ni de textures géantes, ni d'orbites Three.js simulées par objet.
- Pas de shadow map par lune. Pour une/des lunes très lumineuses, au plus **une composante globale d'éclairage nocturne agrégée et plafonnée**, sans faire varier le nombre de lights selon le nombre de lunes.
- Les éclipses, marées astronomiques complexes, vraies distances physiques et ombres mutuelles sont **hors périmètre initial** ; une éclipse artistique éventuellement événementielle sera un effet explicite et testable.

**Tests indispensables :** lune A et B de périodes différentes, opposition/conjonction, traversée du jour, soleil couchant, pleine/nouvelle lune, timeScale ×60/×240, pause/retour, réimport de projet, données identiques après reconnexion/snapshot.

## 7. Nuages, vent, pluie, neige et orages

| Effet | Méthode LOW-RESOURCE | Budget de dégradation |
| --- | --- | --- |
| **Nuages** | Une/deux couches de bruit scrollé dans le shader de ciel, couverture/teinte selon météo ; pas de raymarching volumétrique | 1 couche en qualité faible ; shader ciel minimal si nécessaire |
| **Vent** | Vecteur commun dans un état environnemental, utilisé par herbe/arbres/eau/nuages ; vertex shader léger | Réduire animation cosmétique végétale en premier |
| **Pluie** | Instances de traits/quads dans volume **local autour de la caméra**, réemploi des buffers ; aucune collision par goutte | Compter puis retirer des instances, réduire surfaçage/overdraw |
| **Neige qui tombe** | Même système instancié que pluie avec vitesses/tailles/trajectoires propres | Densité plus faible, particules plus grosses si visuellement acceptable |
| **Éclaboussures** | Petits sprites instanciés près de surfaces proches visibles, sélection stochastique | Désactivés en premier |
| **Orages** | Éclairs **événementiels** (flash de ciel/variation de lumière existante), tonnerre différé, aucun système d'ombre supplémentaire | Flash+son seuls en mode minimum |
| **Brouillard météo** | Effet atmosphérique explicite, densité liée à l'événement ; doit pouvoir être **nul par temps clair** | Pas de volumes de brouillard coûteux |
| **Eau/sol humide** | Variation de teinte/roughness de matériaux existants | Teinte simple seulement en faible qualité |

**Précipitations locales seulement** : le client ne crée pas la pluie pour les 100 km² ; les autres régions ont un **état logique de météo**, sans particules. Même sous un orage de grande ampleur, l'impact visuel local est limité par budget GPU.

**Ne pas simuler la pluie à l'intérieur** par défaut : masque simple d'exposition/intérieur ou zones d'exclusion si disponibles. Éviter lancer des raycasts pour chaque goutte ; utiliser état du bâtiment/zone ou une approximation bon marché.

## 8. Neige : accumulation indépendante de la chute

**Ne jamais transformer toute la carte instantanément en blanc au début d'une averse.**

- `precipitationRate` = flocons en cours ; `snowCover` = quantité **accumulée et persistante** ; `temperatureC` + température saisonnière/altitude influencent accumulation et fonte.
- Accumulation/melt évoluent à fréquence **faible ou événementielle**, au niveau d'une **grande zone climatique / altitude**, jamais pour chaque triangle/chunk à chaque frame.
- Précipitations mixtes possibles près du gel ; la détection de type pluie/neige est une règle météo explicite, pas un shader devinant la saison.
- **Terrain** : palette neige interpolée dans le matériau existant, éventuellement attribut de masque pré-calculé ; pas de reconstruction du heightfield.
- **Toitures** : masque statique de rétention calculé depuis orientation/normal, éventuellement coefficient de matériau ; neige sur les faces supérieures, pas uniformément sur les murs.
- **Arbres** : masque statique par sommet/matériau pour houppiers exposés vers le haut ; tronc différent ; éviter repeindre tout l'arbre ou recalculer toute la géométrie.
- **Rochers et objets** : masque normal/matériau ; objets non concernés restent sur leur shader habituel.
- **Feuilles caduques et saison** : variantes de feuillage saisonnières via paramètres/prefabs compilés lorsque utiles ; **ne pas confondre feuilles tombées et neige**.
- **Couches d'altitude** : neige persistante au sommet des montagnes au-dessus d'une limite configurée, indépendamment de l'averse dans la vallée. Les **proxies d'horizon 3D** reçoivent les **mêmes coefficients de neige**, sinon rupture de continuité à distance.
- **Eau** : ne pas blanchir mers, lacs ou rivières avec un masque de neige générique ; glace réelle réservée à une règle explicite future, pas au seul visuel.
- **Pas de volumes de neige ajoutés partout** dans le profil initial ; pas de collisions modifiées, pas de vraie épaisseur de neige.

**Meilleur rapport coût/qualité** : calculer l'aptitude à recevoir de la neige une fois (par sommet / matériau / asset, ou texture de masque compacte), puis mélanger `baseColor` et `snowColor` via un coefficient **uniforme par macro-région**. L'interpolation fragmentaire des matériaux PBR lourds sur tout le monde doit être mesurée ; ne pas modifier les matériaux ne recevant jamais de neige.

**Humidité** : même idée, coefficient sur palette/roughness existants ; pas de duplicata de meshes et pas de textures « mouillées » générées à chaque averse.

## 9. Ombres : une zone locale, sélection de grands objets, budget adaptatif

**La source solaire peut éclairer le monde entier ; ses ombres dynamiques ne couvrent que le proche.** Un gros château ou une montagne reste visible à distance **sans shadow map distante**. Les ombres des reliefs éloignés et l'assombrissement des vallées sont rendus via **AO/baking/proxies/couleurs pré-calculées**, pas une carte d'ombres du monde entier.

**Politiques proposées :**

| Niveau de rendu | Ombres dynamiques | Exemples de casters |
| --- | --- | --- |
| **Minimum** | **Aucune** shadow map | Joueur/PNJ : petite ombre elliptique simulée si utile |
| **Équilibré** | **1 seule shadow map solaire** 512² ou 1024², zone locale **≈ 20–40 m**, valeurs à mesurer | Joueur + quelques grands arbres/bâtiments proches et objets importants |
| **Élevé** | Toujours une lumière solaire principale, résolution/portée éventuellement accrue **après benchmark** | Sélection un peu plus large ; éviter ombres mondiales |

**Choix de casters :** objets dans un index spatial local, importance visuelle (taille/projection écran, intérêt gameplay), distance et budgets de triangles/draw calls d'ombre. Réévaluer la liste **sur changement de zone ou déplacement significatif**, avec hystérésis ; ne pas parcourir tous les objets du monde à chaque frame. Les récepteurs d'ombres peuvent être une zone adaptée autour du joueur et du terrain proche.

**Exclusions par défaut :** herbes/fleurs, petits accessoires, faune décorative, arbres au loin, côtes/montagnes lointaines, étoiles et lune(s). Les PNJ proches non prioritaires peuvent utiliser une **ombre de contact simulée**.

**Cadences d'ombre :** calculer la direction du soleil à faible fréquence mais actualiser la shadow map quand **lumière, caméra, objet projetant ou recevant une ombre** change de manière visuellement notable. Une carte statique peut être conservée entre deux changements ; **ne pas fixer 2 Hz à des ombres mobiles en plein planage**. Si prise en charge de `renderer.shadowMap.autoUpdate/needsUpdate`, garder un critère de *dirty flags* clair et tester réellement.

**Points de vigilance Three.js :**
- L'activation des shadow maps ajoute des passes de rendu ; **une seule** map n'est pas « gratuite ».
- Une shadow map de 1024² couvre **4× les texels** d'une 512² ; la bande passante, la taille et le coût des objets casters restent à profiler.
- Une portée trop grande réduit la résolution apparente et accentue scintillement/aliasing.
- Pour soleil très bas, **limiter la longueur visible** des ombres, accepter une approximation artistique et éviter d'élargir le frustum d'ombre à plusieurs kilomètres.
- Nuits/lunes : **pas de shadow map lunaire** ; lanternes et éclairs sans shadow maps en profil normal.
- Éviter le scintillement lorsque la zone d'ombres suit le joueur (stabiliser la projection, snapping et hystérésis si nécessaire).
- Exposer dans la bêta sélection des casters, portée, résolution, compteurs de draw calls et coût GPU.

## 10. Rendu à faible fréquence vs rendu par frame

Le rendu se fait à **30 FPS nominal / 20 FPS secours**, mais la logique météo n'a pas besoin de tourner à 30 Hz :

| Composant | Cadence de départ, à mesurer |
| --- | --- |
| Horloge logique | Horodatages absolus + pas fixe pour les règles de gameplay |
| Choix de nouvelle météo / transitions climatiques | Événementiel / toutes les **10–30 s** si besoin |
| Résolution de valeurs météo/palettes/soleil | **1–2 Hz** avec interpolation visuelle |
| Soleil, étoiles, lunes dans le ciel | Positions calculées depuis temps absolu ; uniforms/transformations interpolés |
| Nuages / vent | Temps continu dans shader ; pas de simulation des nuages par sommet CPU |
| Pluie/neige visuelles | Instances GPU avec buffers réemployés, aucun déplacement CPU par particule |
| Accumulation neige/fonte/humidité | Faible fréquence, par macro-région/altitude |
| Shadow map | *Dirty* selon caméra/lumière/casters ; budget et profils, **pas un tick aveugle imposé** |
| Tonnerre/foudre | Événements datés/seeds ; son/flash à déclenchement |

**Le temps accéléré dans le menu bêta** ne doit pas faire dépendre la qualité de rendu de l'horloge, ni déclencher des milliers d'événements instantanés. Recalculer directement les états célestes à l'instant demandé.

## 11. Budget LOW-RESOURCE et dégradation

Budgets **expérimentaux hors shadow maps**, **non mesurés** :
- CPU environnement récurrent : **< 0,2 ms/frame** visé.
- GPU météo/ciel/particules : **< 1 ms/frame** visé selon densité d'écran.
- Draw calls additionnels ciel/particules : **1–4** en situation ordinaire visés.
- Mémoire GPU additionnelle : **1–4 Mio** visés hors shadow map et textures déjà partagées.
- **0** volume de nuages raymarché, **0** physique par goutte/flocon, **0** réanimation/reconstruction du terrain par météo.

**Ombres :** budget séparé parce qu'il dépend énormément du nombre de casters, de la résolution et du matériel ; ne **jamais** déclarer que le GPU total de l'environnement tient sous 1 ms si la shadow map n'est pas mesurée.

**Priorité de qualité sous surcharge** :
1. Réduire éclaboussures, particules pluie/neige, scintillement et autres effets secondaires.
2. Réduire densité des nuages, complexité du bruit shader ou choisir une variante de shader simple si elle est déjà précompilée.
3. Réduire les casters et la portée/résolution de la shadow map ; la **désactiver entièrement** en secours si besoin.
4. Réduire vent/effets cosmétiques de végétation via le [budget partagé herbe](18-GRASS-LOW-RESOURCE.md).
5. **Ne jamais dégrader** l'horloge logique, les lunes/stars cohérentes, la neige accumulée, les states météo importants ni la silhouette lointaine réelle. Le profil minimal doit conserver l'ambiance reconnaissable.

Éviter les changements de defines/options shader déclenchant des compilations pendant une transition météo. Prévoir un **petit nombre de variantes stables**, préchargées si vraiment nécessaires, et modifier des uniformes.

## 12. Source locale bêta maintenant, autorité serveur plus tard

**Le même `EnvironmentStateSource` fournit** temps, version, transitions et régions. La bêta force une source locale **sans modifier les données auteur ou les sauvegardes joueur**.

**Mode bêta / dev** :
- Accès au menu **« Environnement »**, activable en bêta, masqué dans l'interface joueur normale.
- Presets **Clair, Nuageux, Pluie, Neige, Pluie/neige mêlées, Brouillard, Orage** ; transitions forcées ou immédiates pour test.
- Contrôles **heure solaire (0–24), pause, ×1, ×60, ×240**, jour/année/date, vitesse des transitions et capture scénario.
- Couverture nuageuse, intensité pluie/neige, direction/force du vent, température, brouillard, humidité, neige accumulée, altitude de la limite neigeuse.
- **Ciel étoilé :** densité/visibilité et rotation céleste ; vérifier étoile masquée par nuages/jour.
- **Lunes :** liste dynamique, ajouter/retirer lune de **test** (dans les limites de validation), période indépendante, déphasage initial, inclinaison, taille/couleur/luminosité, prévisualisation des phases.
- **Ombres :** Auto/Off/On, distance, résolution 512/1024, liste/compteur de casters, frame de recalcul, shadow draw calls et mesures si disponibles.
- **Qualité :** profil min/équilibré/élevé + capteur CPU/GPU/draw calls + basculement automatique.
- Outil « **Jouer ici** » du Studio utilise les mêmes presets et peut inspecter les états régionaux ; **aucune duplication de moteur**.

**Bêta override** : impose un `EnvironmentSnapshot` ou une `EnvironmentDefinition` temporaire avec **bouton « Réinitialiser »**, ne modifie pas la source permanente sans action d'édition explicite. Les tests peuvent exporter **un JSON de scénario reproductible**, sans sauvegarde persistante involontaire.

**Interface serveur future** :
- Une autorité unique décide `worldTimeSeconds/timeScale`, epoch, événements météo et transitions **par macro-zone climatique**.
- Les clients reçoivent **snapshot horodaté + seed/version + transitions planifiées** ; interpolent localement, gèrent les arrivées tardives et les resynchronisations.
- **Ne jamais transmettre chaque image de nuage, goutte, flocon, étoile, orbite ou shadow map**.
- Contrôle bêta local isolé des parties multijoueurs réelles : il ne modifie jamais le monde partagé ; le serveur garde l'autorité gameplay et les règles de météo.
- Les événements orage/effets sont dérivés d'IDs et seeds. Les actions gameplay dépendantes de la météo (un mécanisme gelé, une mission) doivent être **évaluées par l'autorité logique**, et non par la densité des particules que voit le client.
- Ne pas installer de backend dans la campagne solo au nom de cette compatibilité future.

## Eau et météo : un seul vent, une seule horloge visuelle

Le [document 21 — Eau et hydrographie LOW-RESOURCE](21-WATER-HYDROLOGY-LOW-RESOURCE.md) fixe l'intégration :

- L'eau extérieure reçoit **soleil/lunes/ciel, couverture nuageuse et vent** depuis les uniformes partagés de l'environnement. **Ne pas créer une seconde météo** dans `WaterRenderer`.
- Le **vent** peut animer les faibles vaguelettes de mer et lac près de la caméra ; le **courant fluvial** reste indépendant, défini par `WaterNetwork` pour les rubans et acteurs.
- Pluie/neige peuvent changer **teinte/écume** via quelques paramètres globaux ; pas de particules de pluie avec collisions individuelles sur la surface ni remeshing de l'océan.
- La **vue sous-marine** reçoit teinte et atténuation lumineuse selon eau/soleil/profondeur ; le brouillard sous-marin est une **atténuation dans l'eau** et non un fog permanent masquant le décor/horizon terrestre.
- Le **LOD eau moyen/lointain** privilégie couleur et luminosité globales, désactive les animations inutiles, même pendant l'orage ; la qualité adaptative est partagée avec végétation, météo et ombres.
- Un futur serveur peut être autoritaire pour l'heure et météo commune ; **aucune synchronisation individuelle** des vagues et éclaboussures.

## Budget central PERF : météo et ombres coopératives

**Règle du [ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md)** : la météo et les ombres reçoivent un **plafond commun**, elles n'exécutent pas leur propre algorithme de baisse de qualité indépendant.

- **Ciel, heure, étoiles, orbites de lunes, température et neige accumulée** restent **logiquement exacts** quel que soit le profil GPU.
- Le budget peut réduire ou couper **précipitations visuelles, éclaboussures, couches de nuages, vent décoratif**, densité d'effets d'orage ; conserver la lisibilité du monde.
- Ombres : `off/near512/near1024` (variants indicatifs), priorité **grands objets proches**, coûts des casters surveillés ; la shadow map solaire est une passe GPU additionnelle, **indépendamment** du coût ciel/particules.
- Les uniformes de vent/soleil restent partagés avec herbe/eau. **Pas** de recompile shader à chaque changement de météo ou de profil, variantes stables et transitions limitées.
- Benchmark couplé nuit/lunes, pluie/neige, forêt, village, eau et planage, avec p95/p99, longue frame et **temps GPU réellement mesuré si disponible**.

## Ambiances musicales et sons météo en MIDI/SFX

Le [document 23 — Audio MIDI LOW-RESOURCE](23-MIDI-AUDIO-LOW-RESOURCE.md) exploite `EnvironmentState` **sans ajouter un autre contrôleur de météo**.

- `WorldClock` et la météo sélectionnent des motifs **dans une palette de 5–10 instruments MIDI**, avec transitions musicales (jour/nuit, lever/coucher, pluie/neige, tempête). L'horloge **AudioContext** cadence la lecture, indépendamment de la vitesse de passage des heures en bêta.
- Pluie, vent, feuillage et éclairs sont des **sons naturels** : quelques boucles/échantillons légers ou bruit synthétique si moins coûteux, **pas** une note MIDI par goutte/flocon.
- La météo renseigne gain/intensité/événements, `AudioBudgetManager` plafonne **voix/émetteurs/PCM** sous PERF et évite de dédoubler les couches d'ambiance par biome.
- Tonnerre daté, changement de vent et entrée en zone enneigée déclenchent des **événements sonores**, non des `AudioContext` supplémentaires. Niveaux sonores et effets limités pour ne pas masquer les indices utiles au gameplay.

## 13. Tests et qualification

**Scénarios** :
1. Temps clair à midi, aube/coucher à faible altitude solaire ; même scène sans changement de mesh.
2. Ciel étoilé nuit, lune unique, **deux lunes à périodes différentes** : positions, phases et visibilité de jour/nuit ; ×240, pause et saut direct dans le temps.
3. Nuages : clair → couvert → orage → clair, interpolation des palettes sans recompile de shaders ni saut lumineux.
4. Pluie/vent/orages, neige tombante à basse température, sol humide, neige accumulée puis fonte.
5. Neige sur **terrain, toits inclinés, sapins, rochers**, pas sur murs/troncs/eau et pas seulement sur terrain de détail proche : vérifier montagne de fond.
6. Brouillard **météorologique activé puis désactivé**, tout en gardant l'horizon réellement présent et sans fog par défaut pour camoufler des trous.
7. Ombres : joueur, arbre proche, grande maison, foule, planage rapide, soleil rasant, lever et coucher. Retirer les casters hors zone sans désactiver leur mesh.
8. Shadow Off/512/1024, mêmes conditions : mesurer FPS, p95/p99, GPU si possible, **draw calls de passe ombre**, qualité et scintillement.
9. Profils qualité et arrivée de pluie dans une forêt dense / village : réduction de particules avant perte d'horizon.
10. Sauvegarde/reprise, Studio et bêta, reload, future simulation de snapshots serveur (sans transport réseau), déphasage des deux lunes identique après reprise.

**Mesures :** frametimes, CPU logic/render, GPU timer si disponible, draw calls différenciés (scène/ombres/particules), occupation des buffers/textures, compilations shader, nombre de meshes casters, latence des transitions, pop/aliasing de l'ombre, distances/fog/horizon. Comparaisons à scène/caméra/graine/résolution fixes.

**Gates** :
| Phase | Livrable testable |
| --- | --- |
| **ENV-0** | Inventaire actuel + baseline météo/ombres + structure de tests et menu bêta |
| **ENV-1** | `WorldClock`, `EnvironmentStateSource`, contrôles heure ×1/×60/×240, source locale remplaçable |
| **ENV-2** | Ciel, lever/coucher, étoiles et **lunes indépendantes** avec phases cohérentes |
| **ENV-3** | Nuages/vent, pluie/neige instanciées, brouillard météorologique, éclairs événementiels |
| **ENV-4** | Neige/humidité sur terrain, toitures, arbres, rochers, hiver/altitude et horizon lointain |
| **ENV-5** | `ShadowBudgetManager`, casters importants/proches, mode sans ombres et shadow map solaire locale |
| **ENV-6** | Intégration Studio V3, bêta/menu test, scénario exportable et tests de snapshots d'autorité simulée |
| **ENV-7** | Benchmark GPU intégré, scénarios comparables et acceptation 30/20 FPS (résultat mesuré, pas supposé) |

## 14. Diagnostic de l'implémentation actuelle

**Code `main` inspecté le 12 novembre 2026** :
- `src/world.ts::configureScene` crée **un fond uni**, un `THREE.Fog` **fixe de 190 à 570 m**, un `HemisphereLight` et **deux `DirectionalLight`** fixes.
- `src/main.ts` instancie `WebGLRenderer` et le tone mapping, mais **n'active pas explicitement `renderer.shadowMap.enabled`**.
- **Aucun système de temps solaire, de ciel étoilé à plusieurs lunes, de neige par matériau ni de menu d'édition météo n'est établi par ces fichiers.**
- Le `Fog` fixe doit être remplacé par une logique **météo facultative** et ne plus servir de masque aux limites de rendu ; conserver la profondeur de vue document 17.
- Ne pas confondre **spécifié/implémenté/testé/publié**. Les paramètres de ce document sont **des décisions et hypothèses d'essai**, pas un audit de performances réussi.

**Décision finale :** ciel et astres très économiques, météo en états globaux/macrorégionaux, accumulation de neige par matériaux existants, ombres limitées aux grandes surfaces proches, test intégral dans la bêta, source serveur future interchangeable. Une carte lointaine n'a pas besoin de simulation météo par objet pour être visuellement cohérente.
