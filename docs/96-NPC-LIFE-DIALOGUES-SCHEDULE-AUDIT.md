# 96 — PNJ vivants : audit, dialogues contextuels et routines de villages

**Statut : AUDITED / DECIDED / SPECIFIED — aucune routine professionnelle livrée.**  
**Référence du code** : `main@f84c16cd` (18 novembre 2026, merge #75), incluant villages/services/port N1 et audit [92](92-COMPLETE-WORLDS-STUDIO-AUDIT.md). Couplage quêtes : [93](93-QUESTS-AUDIT-ISLAND-INTEGRATION.md), [94](94-QUESTS-DATA-EVENTS-REWARDS.md), roadmap [97](97-NPC-LIFE-IMPLEMENTATION-ROADMAP.md).

## Décision de game design ratifiée — un seul personnage humanoïde : le hamster (19/11/2026)

**NPH-01 :** tous les PNJ habitants / marchands / enfants / voyageurs qui étaient des `squirrel` s'affichent **en hamster**, exactement comme le joueur. Les petits animaux de faune (`kind:'animal'`) ne sont **pas** transformés en habitants parlants.

**NPH-02 :** le schéma source V2/V3 doit continuer à lire et exporter les anciens `squirrel` **à l'identique** ; la normalisation `squirrel → hamster` se fait au **niveau de la présentation/runtime** sans modifier les cartes, IDs, dialogues, objectifs ni sauvegardes. Les nouveaux PNJ créés via Studio proposent par défaut hamster / faune ; pas de nouvel écureuil dans les menus.

**NPH-03 :** utiliser exclusivement `buildHamster()`, la même morphologie/animation que le joueur. Le mode PNJ n'a pas de planeur, réutilise les géométries et actions existantes et crée ses rigs **à proximité**, avec silhouettes/impostors à distance. Les accessoires (chapeau, lunettes, foulard, sac), émotion et échelle distinguent les professions/enfants sans nouveau modèle complet.

**NPH-04 :** conserver les silhouettes de faune séparées ; jamais utiliser le sprite « écureuil humain » pour un villageois. Vérifier les exports V2→V3→V2, les anciens mondes compilés et la rigueur `rigId`/espèce. Ne pas mélanger la conversion de rendu avec une modification automatique du catalogue ou de l'inventaire.

**NPH-05 :** la conversion visuelle est en cours d'implémentation dans [PR #85](https://github.com/glloq/little-world/pull/85) ; elle n'est **pas** qualifiée tant que les tests legacy, navigateur et performances n'ont pas passé.


## 0. Objectif et règles de jeu

Rendre les villages et lieux d'activité **visiblement habités** : domicile → activité (champ, quai, mine, commerce, moulin) → rencontres → retour le soir, enfants jouant en sécurité, voyageurs arrivant au port, commerçants accueillant les joueurs, activités différentes selon pluie et heure. Les dialogues suivent le contexte local, les quêtes auto sont attribuées à des personnages retrouvables et les récompenses ne nécessitent pas qu'un PNJ reste figé.

**Périmètre** : solo GitHub Pages, carte active uniquement, PC ancien 4–8 Go ; pas de serveur/LLM/conversations générées en ligne, pas de simulation continue de chaque habitant, pas de métier produisant des ressources gratuitement par simple animation. Ne pas sacrifier exploration calme, accessibilité des quêtes et retouches auteur.

## 1. Audit précis des mécanismes existants

| Fichier / contrat | Présent sur main | Lacune vérifiée |
| --- | --- | --- |
| `src/npc.ts` | `NPCDefinition` = `idle/wander/patrol/work`, chemin fixe optionnel, vitesse max 5 m/s, état simple | Aucun métier, domicile, calendrier, rôle social ni itinéraire maison→travail |
| `src/npc.ts` / `tests/npc.test.mjs` | Décision à 10 Hz sous 65 m, 2 Hz jusqu'à 160 m, dormant après ; marche sol sec/pente et disques obstacles ; trajectoire déterministe | PNJ hors 160 m **immobile** : un agriculteur ne rejoint pas ses champs en l'absence du joueur ; pas de graphe piéton connecté |
| `src/npc-view.ts` | Un rig par acteur avec silhouette/imposteur selon distance, dialogues proches 5,5 m, 3D animation marche/salut/geste travail | Rigs construits même pour acteurs masqués ; pas de gestuelle métier variée ; `nearest` ignore les PNJ sans dialogue initial |
| `src/dialogue.ts`, `src/gameplay/dialogue-session.ts`, `src/gameplay/runtime.ts` | Graphes de dialogue, choix conditionnels, actions, émotions, `onDialogueChoice` ; 100 lignes et 8 choix max selon validateur | Pas d'échange contextuel depuis emploi du temps/météo/lieu ; les choix quêtes doivent être greffés sans supprimer les dialogues auteurs |
| `src/gameplay/game-view.ts` | Lie les positions des PNJ aux entités gameplay et au système de collision, traite plusieurs effets | L'action `moveNPCTo` finit dans le fallback « effet non pris en charge » : **ne déplace pas** effectivement le PNJ |
| `src/environment/clock.ts` / `climate.ts` | Horloge monotone partagée, phase jour/nuit/conditions météo déterministes ; durée de jour par défaut 1200 s de jeu | Aucune API de planification des routines, d'absence longue durée et de priorité d'activité sociale |
| `src/main.ts` | `npcs.update` dans la boucle de présentation, `gameplay.runtime.clock` et `climate.state` accessibles | Faire évoluer le plan logique **avec le temps monde**, pas selon les appels de rendu ou les FPS |
| `src/studio-core/types.ts`, `schema.ts` | Composants `Character`, `Navigation`, `BehaviorRef`, `DialogueActor` ; `BehaviorDefinition` limité aux 4 types ci-dessus | Pas de `ResidentProfile`/`DailyRoutine`, cible de métier, domicile, groupe familial ; schéma strict à étendre facultativement |
| `src/studio-core/migration.ts` | `runtimeContent` projette les composants V3 sur `WorldDefinition.npcs` ; migration préserve les PNJ anciens | Projection actuelle perd les métadonnées de résidence inexistantes ; nouveaux contrats doivent passer source→compile→runtime |
| `src/settlements/schema.ts` / `planner.ts` | `BuildingRecord.entry`, `AmenityRecord.entry`, chemins, port, `ShopAccess`, zones et liens de service | Entrées physiques possibles mais non affectées aux habitants ; aucune occupation des maisons / répartition des métiers |
| `src/settlements/local-life.ts` | Peut créer un seul hôte de village et son dialogue, protégé des recompositions manuelles | Cet hôte ne reçoit **pas** de `Navigation` ; à défaut de mouvement il demeure au point de service |
| `docs/92-COMPLETE-WORLDS-STUDIO-AUDIT.md` | Référence historique avec **32 habitants, 32 dialogues, 14 objectifs** ; diagnostics de traversées et zones calmes | La proximité ne certifie pas les trajets ; préserver le contenu legacy sans le transformer en PNJ de métiers par lot |

**Contraintes actuelles à respecter** : `validateNPCs` accepte au maximum **100 acteurs** dans le monde et `npcVisualTier` montre le rig au plus près, silhouette jusqu'à 160 m ; augmenter le nombre de maisons ne doit pas ajouter un PNJ par maison. Certains bâtiments historiques n'utilisent pas `Habitat`. Les PNJ de la carte 4×3 km doivent rester inchangés par défaut sans migration auteur explicitement validée.

## 2. Architecture décidée : « vie logique, représentation locale »

### 2.1 Trois niveaux, un seul état canonique

1. **ResidentRegistry (source Studio)** : identité permanente du PNJ, foyer, métier, lieu d'affectation, lieu de pause, éventuel groupe social ; references sur **entités/ancres existantes**, pas copies de coordonnées dispersées.
2. **DailyRoutinePlanner / SettlementLifeDirector (pur)** : transforme le calendrier mondial et les affectations en `ActivityIntent` déterministe. Change de phase uniquement aux créneaux, événements météo, interactions validées ou changement de destination. Calcule la position **logique** hors caméra ; pas besoin de déplacer tous les acteurs à 30 FPS.
3. **NPCNavigationAdapter + NPCPresentationAdapter (jeu)** : dans un rayon proche du joueur, matérialise la route et les gestes ; en périphérie met à jour grossièrement ; hors zone visible conserve une position/état calculables **sans simulation pas-à-pas** ni création de rig requis pour tous.

**Important :** le système existant `updateNPC` continue d'animer les PNJ anciens. Une routine peut piloter le prochain `target` ou le chemin du même état PNJ, **sans lancer un second moteur de déplacement** ou une boucle indépendante qui écrit ses coordonnées en concurrence.

### 2.2 Données V1 (format cible indicatif)

~~~ts
interface ResidentProfileV1 {
  schemaVersion:1;
  npcId:string;               // ID de Character existant
  settlementId:string;        // implantation réelle
  role:"farmer"|"fisher"|"miller"|"woodcutter"|"miner"|
       "merchant"|"innkeeper"|"porter"|"guard"|"child"|
       "craftsperson"|"traveler"|"villager";
  homeAnchorId?:string;       // entrée Habitat réelle ou résidence historique reconnue
  workAnchorId?:string;       // parcelle, poste pêche, comptoir, atelier...
  leisureAnchorIds?:string[];
  scheduleTemplateId:string;
  dialogueRoleId?:string;     // enrichissement, jamais remplacement auteur
  socialGroupId?:string;
  generated?:{sourceId:string;fingerprint:string;locked:boolean};
}

type LifeAction="sleep"|"commute"|"work"|"fish"|"garden"|
                "socialize"|"play"|"rest"|"wander"|"trade";
interface RoutineBlockV1 {
  startPhase:number; endPhase:number; // phase [0,1), en demi-open
  action:LifeAction;
  destination:"home"|"work"|"leisure"|"public-square"|"port";
  priority?:number;
}
interface DailyRoutineV1 {
  id:string; version:1;
  blocks:RoutineBlockV1[];
  weatherOverrides?:{weather:"rain";replaceActions:LifeAction[]}[];
}
~~~

Les types finaux doivent garder les schémas anciens lisibles : extension facultative `ResidentProfile` et registre `libraries.routines?` (ou composant `RoutineRef` lié aux données source), validation stricte/migration. **Une seule source d'autorité** pour chaque champ : l'éditeur de vie locale écrit dans ces structures natives, le compilateur produit des projections légères. Pas de champ libre `script` ni fonctions injectées.

Ancrages proposés : `BuildingRecord.entry` et porte réelle, `AmenityRecord.entry`, `ShopAccess`, entrée de mine, parcelle joueur/PNJ autorisée, poste d'eau validé, place ou chemin. Aucune coordonnée « domicile » inventée à partir de la proximité.

### 2.3 Horaires et calendrier

Utiliser `climate.state(worldClock.time).dayPhase`, pas l'horloge système. La journée par défaut dure **1 200 secondes de jeu**, et `initialDayPhase=.36`. Conversion horaire de présentation : `heure = dayPhase × 24` ; les horaires ci-dessous sont des **presets éditables**.

| Rôle | Matin | Journée | Soirée / nuit |
| --- | --- | --- | --- |
| Agriculteur | 06–08 h : maison→champ | 08–12 et 13–17 h : travailler, pause midi | 17–19 h : retour/place ; puis domicile |
| Pêcheur | 05–07 h : quai/berge | 07–13 h : pêche/vente, petite pause | 16–19 h : cabane/place ; domicile |
| Enfants | 08–10 h : départ des maisons | 10–17 h : jeux en groupe sur place/chemin sûr | 17–19 h : rentrée ; invisible ou repos |
| Commerçant | 08–09 h : boutique | 09–18 h : vente, gestes, discussions | Fermeture, promenade, domicile |
| Mineur | 07–08 h : mine | 08–16 h : entrée/atelier, pause | 16–18 h : remontée, auberge |
| Meunier / artisan | 07–08 h : moulin/atelier | 08–17 h : fabrication visuelle + dialogues | marché/domicile |
| Garde / veilleur | Matin : ronde | Jour : entrées, ponts, marché | Soir : tour de garde ; veilleurs nocturnes si validés |

Le soleil actuellement passe l'horizon autour des phases .25 (06 h) et .75 (18 h). Les créneaux sont donc cohérents avec le ciel et s'adaptent si le temps de la journée change. Le monde ne doit pas « rattraper » 12 heures de trajectoires pendant un chargement : calcul direct du bloc horaire et de la position logique associée.

Pour un personnage qui travaille loin de son foyer, le déplacement doit conserver un **temps de trajet crédible**, décalant les horaires si nécessaire. Si le parcours est impossible ou trop long, il faut **réduire les affectations**, pas téléporter des PNJ visibles.

### 2.4 Navigation par graphe de chemins validés

- **Un graphe piéton par île**, compilé à partir de `PathDefinition`, dessertes de maisons, ponts/`supportId`, entrées mine/port et points d'usage ; considérer connexions réelles et collision avec bâtiments.
- Réutiliser `inspectGroundSegment` / `planGroundRoute` et collision world déjà présentes ; ne pas ajouter de navmesh 3D sur toute l'île ni recalculer A* à chaque frame. Exemple de cache de routes par paire d'ancres et version géométrique.
- Vérifier pente, largeur, sols, portes ouvertes ou fermées, obstacles, falaises, eau profonde, escaliers/ponts, niveaux de mine **avant** de certifier trajet. Un nœud visuellement proche ne garantit pas une jonction.
- Gestion de foule **locale uniquement** : réservations de position de travail, sens de croisement simple, évitement réactif léger près joueur ; pas de simulation de centaines de voisins.
- En cas de chemin bloqué par édition : invalider affectation et indiquer diagnostic ; l'habitant garde un comportement `idle` sûr ou un lieu secondaire valide. Ne jamais traverser une maison/porte fermée.
- La maison peut être une **destination virtuelle de sommeil** en V1 : rejoindre la porte, disparaître uniquement hors vue si intérieur/porte non qualifié ; réapparaître depuis l'ancre accessible au réveil. Ne pas inventer une navigation intérieure fonctionnelle.

**Régimes de simulation** :
- **Proche** (distance actuelle <65 m) : décision max 10 Hz et animation interpolée, route conforme à la physique/collisions.
- **Intermédiaire** (65–160 m) : décisions max 2 Hz, suivi approximé mais validé.
- **Loin** (>160 m) : état horaire analytique, aucun itinéraire recalculé à la frame, pas de rig animé. À l'approche, projection au bon emplacement et interpolation sûre **hors champ de vision**, sans téléportation visible.
- **Autre île non chargée** : aucun NPC Three.js ni routine exécutée ; si besoin de faits économiques, uniquement moteur autonome distinct avec rattrapage borné.

La définition source peut avoir une centaine de PNJ (limite actuelle) ; **ne pas préconiser d'emblée 100 PNJ actifs**. Objectifs de densité initiaux **à mesurer** : hameau 2–4 habitants, village 6–12, ville 12–25, total d'île plafonné par un budget global/secteur et par les tests sur PC ancien. Réutiliser habitants du monde plutôt qu'en inventer d'office.

### 2.5 Interactions et continuité des missions

- Une conversation validée interrompt localement la marche, tourne le PNJ vers le joueur et reprend ensuite sa route **à partir de sa position réelle**. Ne pas changer la routine ou les objectifs par simple ouverture/fermeture de modale.
- `moveNPCTo`, `startDialogue` et `playAnimation` peuvent devenir de vraies commandes avec résultat (succès, route invalide, acteur absent), mais **l'action de quête ne doit pas être validée sur l'intention** : elle attend l'arrivée ou l'interaction correspondante.
- Si le donneur de quête a quitté son comptoir, le journal/carte suit **sa position réelle** et indique sa prochaine destination et son horaire. Pas de récompense bloquée par une attente de nuit incompréhensible.
- En V1, éviter de faire dépendre une quête d'un PNJ qui n'est accessible que quelques secondes : conserver des fenêtres d'interaction suffisantes, possibilité de réponse à domicile, alternative ou relais clairement désigné.
- Seul le métier/lieu **réellement validé** alimente le `QuestDirector` : le PNJ peut parler d'une mine décorative, mais ne doit pas donner de mission qui exige un minerai inexistant. L'animation de culture/pêche **ne doit pas** déclencher une véritable récolte ou un stock commercial sans la transaction d'activité correspondante.
- Conservation des dialogues auteur, des 14 objectifs legacy, des actions/choix et du journal. Aucun template ne remplace un texte manuscrit ou un PNJ « unique ».

## 3. Dialogues contextuels : solution déterministe sans IA

**DialogueContext** en lecture seule : `npcId`, `role`, `placeId`, `dayPhase`, `weather`, `questStates`, `playerProgress`, `shopAvailability`, `travelPresence`, `socialEvent`. Il provient de systèmes métiers existants, pas d'inférences de couleur du biome.

**DialogueComposer** insère facultativement des entrées structurées dans le graphe V3 :
1. **Parler** (salutation courte selon heure, métier, météo et relation).
2. **Lieu / Activité** (une ou deux informations vraies : moulin, champ, lieu de pêche, comptoir, pont).
3. **Quêtes / Travail** (offres validées, progression, remise ou refus).
4. **Commerce / Service** (si accès fonctionnel et éventuellement horaires de boutique validés).
5. **Au revoir**, revenir à la routine.

Exemples contextuels, jamais promesses inventées :
- Agriculteur au champ : « Les cultures ont besoin d'eau ; regarde la parcelle autorisée près du chemin. »
- Pêcheur au port : « Le matin, on trouve souvent du monde au quai. Le comptoir peut racheter du poisson. »
- Enfant sur la place : « On fait la course jusqu'au vieux puits ! » **Uniquement si** le puits, l'itinéraire et le mini-jeu sont réellement supportés ; sinon simple phrase ambiante.
- Commerçant sous la pluie : « Aujourd'hui je reste au comptoir. » si sa routine le prévoit.
- Mineur hors de la mine : « Je remonte au village après mon service. » sans ouvrir une mine fictive.

**Dialogues ambiants (barks)** : phrases courtes sans modale ni action, déclenchées lors de proximité/socialisation, cooldown par PNJ/groupe, au plus quelques émissions audibles/visibles par secteur ; sous-titres localisables. Doivent être désactivables et ne jamais masquer le journal ou monopoliser l'audio.

**PNJ sans `dialogue`** : aujourd'hui `npc-view.ts` ignore l'acteur dans `nearest`. Changer le contrat pour accepter une session contextuelle optionnelle **sans faux graph vide** ; l'action « parler » n'est affichée que si la session est effectivement disponible. Validateurs : 100 lignes / 8 choix par ligne actuels, schéma V3, aucune exécution de JS des cartes. Les templates peuvent être composés en runtime et ne doivent pas muter les données auteurs.

**Progression sociale facultative** : `metNpc`, `helpedRole`, `completedNpcQuest`, `visitedPlace` ; tonalités et quelques lignes alternatives. Éviter jauge d'amitié/métiers obligatoires, dialogues répétitifs interminables ou échanges de ressources non autorisés.

## 4. Catalogue de PNJ prioritaires et valeur de gameplay

| PNJ / rôle | Vie visible et déplacement | Dialogues / quêtes / interactions à relier | Prio |
| --- | --- | --- | --- |
| **Agriculteur / agricultrice** | Domicile→champ, arroser, biner, aller au marché | Semis, récolte de **parcelle joueur**, outils et recettes | P0 |
| **Pêcheur / pêcheuse** | Cabane→berge/quai→vente→cabane | Zones de pêche réellement accessibles, canne, espèces locales | P0 |
| **Commerçant / marchande** | Maison→étal, ouvrir/fermer, ranger des marchandises | Acheter/vendre, origine de stock, prix/foire, missions de livraison | P0 |
| **Habitants/enfants** | Maison→place→jeux/ronde, retours au soir | Ambiance, indications, mini-jeux non compétitifs ; sécurité autour routes/eau | P0/P1 |
| **Meunier / boulangère** | Maison→moulin/four, porter un sac, montrer les outils | Transformations réelles (farine/pain) si station et recette présentes | P1 |
| **Bûcheron / forestière** | Maison/camp→lisière→comptoir forestier | Ressources réellement collectables, bois, coupe et usages | P1 |
| **Mineur / chef de mine** | Hameau→entrée de mine→réception, pause | Extraction, casque/pioche, géologie, monte-charge, sécurité | P1 |
| **Forgeron / artisan** | Atelier→comptoir/stockage | Fonte, outils avancés, équipements régionaux si recette réellement utilisable | P1 |
| **Aubergiste / cuisinière** | Auberge→marché→cuisine | Nourriture, transformation, informations de village | P1 |
| **Rameur / capitaine / docker** | Apparaît avec ferry, descend au quai, charge, repart | Horaires de ferry réels, commerce maritime ; pas de PNJ permanent fictif | P1 |
| **Messager / colporteur** | Parcourt une route sûre entre villages proches | Quêtes de livraison et découvertes de pôles | P2 |
| **Garde / gardienne** | Ronde porte/place/pont, relève | Indications sur passages, ville, protection non violente | P2 |
| **Musicien / conteuse** | Place/auberge à certaines heures, petits rassemblements | Instruments déjà jouables, échange de mélodies/ambiance sans audio coûteux | P2 |
| **Érudit / exploratrice** | Bibliothèque, ruines, point de vue | Énigmes, points d'intérêt, histoire locale | P2 |
| **Moniteur de vol / ski / surf** | À l'arrivée du circuit ou de la station | Entraînement **uniquement** pour mécanique qualifiée ; surf futur | CONDITIONNEL |
| **Petits animaux non parlants** | Nid, abri, mare, promenade diurne | Animations simples/réactions ; pas de quêtes orales forcées | P2 |

**Variété des rôles sans multiplier les rigs** : réutiliser rig écureuil/hamster/animal, variations de couleur, chapeau/sac, accessoires affichés aux alentours, animations existantes. Les enfants sont une variante **d'échelle/animation** validée (éviter hitbox adulte inchangée ou création d'un rig complet unique par enfant). PNJ regroupés par pôles et périodes, pas un actor par maison/animal/zone.

## 5. Génération intelligente d'une vie locale (sans PNJ fantasmes)

Ordre de création recommandé :

1. Génération terrain/eau/relief et chemins réels ; ports N1, villages et services issus du merge #75.
2. Extraire `BuildingRecord.entry`, `AmenityRecord.entry`, champs (attribution PNJ vs joueur), mine, spots de pêche et services effectifs.
3. Construire un **LocalLifeCapabilityIndex** à partir de leurs accès et de leurs rôles ; ancrages physiques validés, exclusions et distances de trajet.
4. Allouer d'abord les **rôles indispensables réellement possibles** : hôte, agriculteur si champ PNJ, pêcheur si berge/port qualifiés, marchand si comptoir opérationnel. Aucune plantation fictive, aucun mineur sans mine.
5. Affecter un domicile **parmi les maisons réelles libres avec entrée valide** ; choisir un temps de marche cohérent, par graphe de chemins. Si aucun domicile utilisable, envisager un simple hôte local avec routine courte, sinon diagnostic.
6. Ajouter quelques habitants non professionnels (jeux, promenade, place) selon budget CPU et densité. Éviter les enfants au bord de l'eau, près des falaises, sur un circuit de course ou au milieu d'une route.
7. Générer programme horaire + dialogue contextuel optionnel + tags de quêtes autorisées ; préserver les dialogues/PNJ manuellement modifiés et les suppressions intentionnelles.
8. Vérifier le trajet domicile→activité→retour, cases occupées, porte, temps de parcours et présence du PNJ lorsqu'une quête exige une interaction ; restituer les diagnostics à Studio.

Les bâtiments de l'île historique sans composant `Habitat` ne sont **pas** convertis automatiquement ; leur domicile/porte doit être explicitement qualifié ou l'ancien fonctionnement conservé. Les PNJ existants et leurs dialogues ne sont jamais recyclés comme un personnage généré sans validation.

## 6. Raccordement au QuestDirector et à la carte

Le `QuestDirector` ([93–95](93-QUESTS-AUDIT-ISLAND-INTEGRATION.md)) consomme une **vue en lecture seule** : rôle du PNJ, compétence réelle, lieux accessibles, calendrier de disponibilité, position actuelle/estimée, quêtes déjà associées. Le `LifeDirector` n'octroie **pas** directement objets ou statuts d'objectifs.

Evénements supplémentaires optionnels :
- `npc.arrived_at_anchor` après arrivée **réelle vérifiée**, pas après changement d'intention ;
- `npc.interaction_completed` après dialogue/choix effectivement exécuté ;
- `npc.work_shift_started` réservé à des actions scénarisées si besoin, **jamais** preuve de récolte/production ;
- `public_event.started/ended` pour marché, musique ou regroupement avec capacité réelle.

Journal : marqueur actuel sur PNJ mobile ; affiche « En route vers le champ », « Au marché », « De retour au foyer » et disponibilité estimée à partir du calendrier. Si un PNJ porteur de récompense est chez lui, fournir une interaction accessible ou un remplaçant **déclaré et valide**, pas un téléport arbitraire.

## 7. Studio : réglages et diagnostics

Créer une section **Vie locale / Habitants** dans la composition de villages, avec réglages peu nombreux : `activé`, `densité faible/normale/riche`, `rythme calme/animé`, `familles de rôles`, `horaires`, `routines auteur verrouillées`. Sous-section avancée facultative pour affecter maison, métier, poste, trajet et horaires de chaque PNJ. Prévisualisation temporelle par curseur 0–24 h **sans modifier l'horloge de la partie** ; surbrillance des trajets/collisions, zones de jeu et points de rassemblement.

**Raison de refus explicite** :
`LIFE_NO_HOME`, `LIFE_NO_JOB_SITE`, `LIFE_ROUTE_BLOCKED`, `LIFE_DOOR_UNREACHABLE`, `LIFE_WORKSITE_UNUSABLE`, `LIFE_CHILD_UNSAFE`, `LIFE_SCHEDULE_CONFLICT`, `LIFE_STATION_NOT_FUNCTIONAL`, `LIFE_AUTHOR_LOCKED`, `LIFE_NPC_LIMIT`, `LIFE_QUEST_GIVER_UNAVAILABLE`, `LIFE_UNSUPPORTED_INDOOR`.

Ne pas bloquer la publication d'une **île volontairement inhabitée** ; bloquer uniquement les affectations déclarées obligatoires incompatibles, afficher avertissements vérifiables pour le reste.

## 8. Tests bloquants et compatibilité

- Déterminisme : même île/seed/recettes → mêmes profils/horaires/domiciles ; résultats indépendants de 20/30/60 FPS et de l'ordre des entités.
- Horaires : lever/coucher, minuit, accélération temps 0–240, sauvegarde et changement d'île, longue absence hors caméra sans rattrapage CPU infini ni apparition visible.
- Navigation : résidence→champ, cabane→quai, trajet vers pont, impossibilité de traverser eau profonde, falaises, bâtiments/portes ; replanification à la fermeture d'un chemin.
- Conversations : PNJ en marche, hôte sans dialogue initial, actions auteur, choix à conditions, fermeture et reprise de l'itinéraire ; aucune perte d'interaction 5,5 m.
- Sociabilité : enfants sur place sécurisée, scènes de marché non obligatoires, aucune répétition de bark toutes les frames.
- Quêtes : récompense malgré horaires, marqueur journal actualisé, aucune récolte virtuelle comptée comme action joueur.
- Studio : génération/regen, suppressions, locks, Undo/Redo, copie historique 4×3 km intacte, import/export/playtest.
- Profil PC ancien : allocations 3D par PNJ et draw calls, CPU max/average sur village chargé, coût de projection hors caméra ; FPS à mesurer sur matériel réel.

**Aucune commande/tests n'a été exécuté dans cette phase documentaire.** La stratégie d'implémentation et les critères de sortie sont détaillés dans [97](97-NPC-LIFE-IMPLEMENTATION-ROADMAP.md).