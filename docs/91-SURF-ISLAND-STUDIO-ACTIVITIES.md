# 91 — SURF : île dédiée, Studio, équipements, activités et courses

**Statut : plan fonctionnel SPECIFIED ; premier prototype moteur/Studio en cours, île spécialisée et activités complètes non publiées.** Voir [93 — état du prototype](93-SURF-PROTOTYPE-PROGRESS.md). Dossier fonctionnel et plan d'implantation. Les réglages chiffrés sont **valeurs de prototypage** et ne constituent ni une carte publiée ni un comportement validé. Dépend de [90 — moteur](90-SURF-ARCHITECTURE-CONTRACTS.md) et conduit à [92 — roadmap](92-SURF-IMPLEMENTATION-ROADMAP.md). Compatibilité avec [75 — transports](75-ISLAND-TRAVEL-FERRIES-PORTS.md), [80 — courses](80-RACES-FLIGHT-ROLL-DEMO.md), [81 — pistes](81-MODULAR-RACE-TRACKS.md), [82 — implantation](82-RACE-TERRAIN-PLACEMENT.md), [89 — inventaire](89-INVENTORY-V3-HAMSTER.md).

## 1. Vision : île aquatique facultative

Une île **statique et compilée** pouvant être visitée depuis l'archipel, où le hamster peut librement surfer, participer à des défis et choisir une autre activité. Aucun multijoueur ni serveur obligatoire au lancement; mêmes compétences et équipements transportables depuis les autres îles, sous réserve des règles déjà présentes.

**Dimensions de départ à tester** : carte 2 × 2 km, **~65–80 % de mer jouable** (approche depuis le large + marge de sécurité), terre regroupée au sud ou sur une côte latérale pour garder 500–1000 m de trajet aquatique dans les bounds. Ne jamais déduire la zone jouable du décor `OceanRing` extérieur à la carte. Site du surf distinct du chenal de ferry et des quais (éviter vagues imposées aux bateaux). Les dimensions finales dépendent du générateur et des benchmarks.

### Zones de l'île

| Code | Lieu | Utilité | Preset de départ |
| --- | --- | --- | --- |
| ISURF-A | Baie d'initiation | Rame, prise de vague, équilibre, petits sauts | gentle, 0,4–0,9 m, vitesses basses |
| ISURF-B | Longue houle | Accélération, virages, prise de creux, longues courses | rolling, 0,8–1,6 m |
| ISURF-C | Parc acrobatique | Tremplins, courants boost, anneaux, bouées, réception | arcade, 0,6–2 m |
| ISURF-D | Point de grandes vagues (option P2) | Vagues spéciales, figures à haute vitesse | power, amplitude à qualifier |
| ISURF-H | Port calme et village | Arrivée ferry, dépôt de planche, marchand, missions | vagues atténuées, eau nav. stable |
| ISURF-R | Récif/hauts-fonds | Repère visuel, trajectoires à risque, interdiction fond | bathymétrie validée |

Éviter d'exposer 12 variantes dans la première version: publier **A+B+C** et port, puis activer D après validation des performances/contrôles.

### Implantation physique (contraintes)

- **Fronts orientés large → rive**, avec longueur et largeur suffisantes pour rejoindre les vagues sans traverser les limites jouables. En courbe de côte, diviser en plusieurs `SurfZone` plutôt que déformer un front continu sans justification.
- La bathymétrie définit les transitions eau profonde → banc de sable/récif → zone de déferlement → eau calme très peu profonde. Les pentes sont lissées sur une distance au moins supérieure au rayon de contact de la planche; plage assez douce pour sortir de l'eau à pied.
- Arrivée maritime distincte avec chenal sûr, profondeur de bateau et absence de déferlantes. Contrôler les quais, collisions et pontons du vrai système de ferry.
- Réserver une **zone de récupération** au pied des sauts, suffisamment profonde et libre, sans plages/rochers/structures; une réception ratée est un événement de jeu non punitif.
- Placer bouées et checkpoints selon la **trajectoire dynamique de vague**; leurs positions réelles et volumes de collision restent fixes en monde. Pour les anneaux aériens, dimensionner une enveloppe de saut réaliste.
- Empêcher arbres, rochers, végétation et bateaux procéduraux dans la zone de course via les mécanismes géographiques existants; réservation d'emprise, pas suppression graphique tardive des obstacles.
- Prévoir points d'arrivée/retour, limite de zone, orientation caméra, mini-carte, secours en cas de sortie de carte, téléportation/respawn validé.
- Les vagues doivent s'amortir près du port et à la côte sans passer au travers des terres; coutures visuelles vérifiées avec `NearSea` et `OceanRing`.

## 2. Studio : parcours simple, avancé optionnel

Dans Studio, groupe **Eau → Surf**, ne pas surcharger les outils principaux de terrain ni créer un deuxième éditeur d'île. Réutiliser sélection, undo/redo, `PolylineTool`, transaction `CommandBus`, prévisualisation 3D et `Jouer ici`.

### Assistant guidé 5 étapes

1. **Choisir la côte** : cliquer sur une zone de mer; détecter profondeur, proximité des terres, direction normale locale vers rive, obstacles et zone portuaire. Afficher une suggestion sans modifier le projet.
2. **Dessiner l'emprise** : rectangle/polygone de surf à l'intérieur des limites, gérer marges et zones d'exclusion. Prévisualisation de l'orientation et de 3 fronts de houle.
3. **Choisir un style** : `Doux`, `Longues vagues`, `Puissantes`, `Arcade`; réglages visibles vitesse de vague / hauteur / espacement / intensité / sens; paramètres avancés sous panneau replié.
4. **Placer les activités** : sélecteur `Surf libre`, `Course`, `Parc aquatique`, `Grandes vagues`; générer des propositions de parcours, rampes, slaloms et zones de réception **sans application implicite**.
5. **Tester/valider/publier** : aperçu animé, jouer à partir du départ, diagnostics profondeur/relief/port/rampes/anneaux, sauvegarder, ZIP, compiler. Undo/Redo et import/export des IDs et des phases.

### Réglages auteur

| Catégorie | Réglages essentiels | Avancés |
| --- | --- | --- |
| Zone | polygone, nom, activée, direction rive | seed, epochTick, masques côtiers, traversée entre zones |
| Houle | hauteur, espacement, vitesse, preset | asymétrie, fréquence, phase, limite de pente |
| Déferlement | point où la vague s'écrase | courbe d'amortissement, profondeur, seuil bathymétrie |
| Rendu | qualitatif auto | écume, couleur selon profondeur, transparence, LOD |
| Surf | assistance équilibre, plage départ | adhérence, virage, pumping, rame, plage vitesse |
| Activités | mode, départ, difficulté | répétitions, boosts autorisés, critères de score |
| Obstacles | type, placement, orientation | collider, impulsion, cooldown, zone atterrissage |

**Validation statique avant application** : points dans bounds, polygone non auto-croisé, direction normale unitaire, paramètres bornés et finis, profondeur suffisante, absence de collisions avec port/bâtiments/terre et zones critiques; chevauchements de zones hiérarchisés ou refusés; nombre d'objets/boosts/émetteurs borné.

### Implantation intelligente, calquée sur l'outil Course existant

Algorithme déterministe, localisé :
1. Échantillonner les côtes candidates, profondeur et gradient du fond dans un rayon borné; limiter nombre de candidats/échantillons.
2. Classer orientation de houle, longueur utile, profondeur, risque de hauts-fonds, accessibilité, visibilité, proximité d'un port, présence d'obstacles et marge des limites.
3. Générer 1–3 **propositions** de zones avec trajet large→rive, variation de hauteur progressive et une ou plusieurs bandes de bouées ou tremplins.
4. Pour chaque module, vérifier courbe d'approche surfable, hauteur de saut possible, **zone de réception**, distance des autres objets; interdire un boost pointant vers une falaise/quai/rive trop proche.
5. Afficher explications/résultat; n'ajouter au projet qu'après clic `Créer` via CommandBus; Undo/Redo exact. Ne jamais modifier le relief d'une île déjà publiée silencieusement.

La première V1 doit fonctionner **sans génération intelligente** (zones dessinées manuellement). L'auto-placement arrive quand le moteur de vagues est mesurable. L'ancien outil `race-terrain-planner` refuse volontairement l'eau : **un planificateur surf spécialisé** est requis.

## 3. Équipements et interactions du hamster

Objet de test `tool:surfboard`, puis variantes déclaratives par `surfBoardId` :
- `board.basic` : stable, faible coût, pas de contrainte d'obtention.
- `board.fast` : glisse plus rapide, virage moins facile.
- `board.trick` : plus maniable et léger pour sauts.
- `board.long` : meilleure prise de vague/rame, rotations aériennes moins rapides.
- **Skins cosmétiques** : coloris, motif low-poly, nageoire, traînée légère. Ne pas rendre un skin acheté requis pour accéder aux niveaux.

**Intégration existante** : `src/gameplay/player-loadout.ts`, `src/ui/inventory/inventory-logic.ts`, `src/gameplay/game-view.ts` et l'objet dans `gameplay.items`. Le slot `hands` existant est suffisant **pour prototype**, mais réserver une capacité `activity=surf` ou un slot `board` explicitement versionné si l'équipement dans les mains crée un conflit avec la pêche et les instruments. Ne pas inférer le comportement du nom traduit de l'objet. Le cas du sac à dos/planeur ne doit pas être cassé.

Séquence : ouvrir le sac → équiper la planche → approcher de l'eau → action `Surfer` / entrée en paddle → prendre une vague → revenir à la plage → ranger. La planche n'est pas rendue quand non utilisée si le joueur préfère la discrétion; elle peut être brièvement portée lors de l'entrée/sortie. Valeurs sauvegardées dans loadout, non dans le moteur de vagues. Définir exactement récupération après `wipeout` : planche rattachée ou flottante proche, pas de perte permanente.

### Commandes PC à stabiliser

| Contexte | ZQSD/WASD | Shift | Espace | S/Ctrl | E |
| --- | --- | --- | --- | --- | --- |
| paddle | direction, avance | alternance rame / maintien geste selon accessibilité | montée sur planche si vague prise (ou auto) | ralentir/plonger si explicitement demandé | quitter surf |
| ride | cap et équilibre | posture/pump **contextuel** (pas de roulade) | impulsion de saut, buffer près crête | freinage doux/fort | sortir si faible vitesse |
| air surf | contrôle limité | variante figure selon mode | pas de planeur automatique | posture réception | sans effet |
| wipeout | nage habituelle | nage rapide | plongée existante | plongée existante | retrouver planche |

Pour garder les commandes intuitives, la V1 prévoit **prise de vague automatique aidée** et `Espace` pour le saut. Rame répétée ou tenue doit produire des pulses bornés; effet sonore/petites éclaboussures une fois par pulse. Mobile = commandes secondaires adaptées plus tard, mais **préserver immédiatement les conventions droite/gauche** et `Space` ne doit pas réouvrir de fenêtres UI.

### Animations hamster et assets

Planche low-poly ~2 styles initiaux, un seul objet rendu attaché au rig/point de contact :
- Paddle couchée, mouvements des bras alternés et sillage.
- Transition allongé → debout, récupération d'équilibre.
- Ride : lean gauche/droite, banking de planche, légère absorption de vague.
- Pump : flexion / extension sur phase de face de vague, feedback limité (pas de farm d'énergie).
- Air : rotation autorisée, posture arrière/avant, vitesse angulaire plafonnée.
- Landing : absorption, bruit de planche, petit spray; wipeout : séparation visuelle, éclaboussure et nage.
- Eviter nouveau squelette, textures lourdes ou grands systèmes de particules ; réutiliser animation existante `src/hamster/hamster-animation.ts` et `src/character-animation.ts`, rendu via un `surf-character-view` analogue à neige. Collisions de la planche = proxy logique indépendant du GLB.

## 4. Catalogue d'activités surf

### MVP — obligatoire pour une bêta intéressante

| ID | Activité | Mécanique | Succès vérifiable |
| --- | --- | --- | --- |
| ACT-01 | Apprendre à ramer | propulsion main gauche/droite ou action unique accessible | atteindre une zone de départ |
| ACT-02 | Prendre sa première vague | position + vitesse relative de front | entrer en `ride` |
| ACT-03 | Descendre une vague | pente dynamique + inertie | atteindre vitesse cible sans boost |
| ACT-04 | Faire un virage | appui/adhérence et perte en virage | tourner dans couloir |
| ACT-05 | Sauter la crête | vitesse + pente + impulsion | décoller/retomber sur l'eau |
| ACT-06 | Slalom aquatique | bouées statiques | portes en ordre |
| ACT-07 | Sprint de plage | parcours temps + checkpoints | chrono local |
| ACT-08 | Parc de tremplins | rampes fixes + boosts compatibles | terminer une course acrobatique |
| ACT-09 | Surf libre | distance/temps sur vague | record personnel sans compétition |
| ACT-10 | Retour sécurité | chute, récupération de planche, sortie d'eau | aucune perte de matériel |

### Extensions P1/P2, après sensation de glisse validée

- **Compétitions** : contre-la-montre, collecte d'anneaux, meilleur saut, durée de vague, score de figures, combo de vagues, slalom sans toucher les bouées, parcours sans boosts, vitesse maximale, défi de précision de réception, poursuite d'une vague spéciale.
- **Modules** : tremplin fixe/largeur variable, rampes inclinées latéralement, anneaux aériens, bouées, passerelle traversante, arches, plateformes de réception, tourniquet lent (P2), courant accélérant, courant latéral, zone freinante, vague croisée, grande houle occasionnelle, raccourcis, bassin de récupération.
- **Progression douce** : école de surf PNJ animal, défi du moniteur, niveaux apprentissage/intermédiaire/expert, déblocage d'apparences non bloquantes, choix d'assistance pour débutants, panneau de records locaux, panneau météo/état de houle.
- **Économie de l'archipel** : stand de location/vente de planches, boutique de skins et accessoires, atelier d'amélioration cosmétique, récompenses légères ; transport d'objets cohérent avec l'inventaire inter-îles, commerce optionnel.
- **Activités connexes** : stand-up paddle sur mer calme (contrôleur rame simplifié), bodyboard (visuel/maniabilité différente), skimboard à la plage (plus tard, spécifique aux faibles profondeurs), course de barques/kayaks sur mer calme (réutiliser bateau), photographie/collection de défis, petites missions de sauvetage non punitives, exploration de récifs, pêche depuis une zone autorisée. Windsurf et kitesurf sont **P3 distincts** (voile + vent + contrôles additionnels) ; ne pas les faire passer pour de simples skins de surf.
- **Multijoueur futur** : départ synchronisé, fantômes locaux avant joueurs distants, course en équipe, relais de planches et spectateurs à distance; pas de modification de la mer par joueur en V1.

### Système de figures proposé

Première version : 180°, 360°, saut de crête, atterrissage propre, carving, pumping et chaîne de 2 vagues. Mesurer **une seule fois** la rotation physique durant `air`, son amplitude, la hauteur au-dessus de la vague, la vitesse de réception et un `landingId` unique. Pas de score calculé sur les animations interpolées à FPS variable. Anti-exploit : pas de score en saut stationnaire, cooldown par événement, pas de re-déclenchement si même saut/replay, combos plafonnés.

## 5. Courses, boosts et collisions

**Réutiliser le moteur commun** `src/gameplay/races.ts`. Ajouter `RaceKind='surf'` (ou extension compatible avec migration si les anciennes données strictes l'exigent) et `RaceMotionMode='surf'|'air'`; adapter :
- `validateRace`, `advanceRace`, `startAuthoredRace`, `startDemoRace`, `studio-core/race-authoring.ts`, `studio/races-panel.ts`, `gameplay/playable.ts`.
- Modes `surf` au sol liquide, `air` uniquement si saut surf marqué; la chute `swim` peut interrompre ou pénaliser selon l'activité.
- Portes fixes (2–24 en V1) avec volume 3D, orientations vers l'aval, et contrôle de franchissement par **segment swept**; gardes anti-teleportation.
- Signatures records incluant `wavePreset/zoneId/waveRevision/physicsRevision/boostConfig`, règle de départ/temps, build de l'île; une modification invalide la comparabilité, pas les anciens records dans leur partition.
- Boosts `zone` placés indépendamment du circuit, activation si contact réel, direction sûre, cooldown, effets VFX/SFX, interdiction optionnelle selon type de course; aucune animation comme déclencheur.
- `RaceTrack` actuel est **une route terrestre 2,5D** : ne pas y représenter une vague mobile ni le fond marin; étendre les **modules de course** déclaratifs dans une structure aquatique distincte et compatible avec les gates existantes.

### Difficulté des parcours

- **Débutant** : vagues basses, assistance prise de vague, checkpoints larges, pas de boosts obligatoires, récupération près côte.
- **Intermédiaire** : trajectoires sur plusieurs vagues, virages serrés, 1–2 sauts, zones de courant.
- **Avancé** : vitesse élevée, anneaux suspendus, rampes, enchaînements, pénalités facultatives hors trajectoire.
- **Arcade libre** : boosts importants, tremplins spectaculaires, figures et raccourcis; garder catégorie séparée des records surf naturel.

## 6. Présentation, UX, son, caméra

- **HUD compact** hors course : vitesse, vague actuelle (indicateur prendre / sur la vague), équilibre, boost si applicable, rappel contextuel `Espace sauter`. En course ajouter checkpoints/temps/score sans dupliquer les panneaux.
- **Caméra** : bascule douce sur la planche, suit le déplacement de la vague; ne pas prendre les tangentes de `WaveField` comme commande de direction du joueur. Éviter secousses; FOV de vitesse limité, option réduire les animations.
- **Affichage des vagues** : crête blanche discrète, points de mousse, eau turquoise/profonde selon profondeur; silhouette de vague visible depuis les dunes/planeur, sans transparence multi-pass.
- **Audio** : réutiliser `public/audio/sfx/water/*`, `public/audio/ambience/water/*` et l'`AudioController`. Ajouter événements `surf.paddle`, `surf.catch`, `surf.ride`, `surf.turn`, `surf.jump`, `surf.land`, `surf.wipeout`, `surf.boost`, `surf.wave.break`. 1 événement par événement logique; 1–2 boucles locales max, audio spatial borné et silencieux valide.
- **Accessibilité** : option assistance de prise de vague/équilibre, pas de spam obligatoire, remapping futur; contrastes des anneaux, désactivation des scintillements, sons non indispensables pour réussir.
- **Météo** : vent existant = intensité scalaire; `swellDirection` reste propriété de zone jusqu'au contrat météo directionnelle; pluie/vent peuvent faire varier doucement couleur/écume/hauteur dans des bornes versionnées, pas désynchroniser les compétitions.

## 7. Publication archipel, sauvegardes, sécurité

- Générer l'île à partir de **StudioProject V3** et compiler ses manifest/chunks ; ajouter à `public/archipelago/catalog.json` seulement après qualification. Ne pas retoucher l'île volcan par défaut pour tester surf.
- Cataloguer un `surf-island` stable, configurer un quai/port adapté et vérifier `transit` et retour. Charger **une seule île active** ; décharger meshes, audio et caches surf quand on la quitte.
- V1 = solo statique local. Records personnels `localStorage`, équipements et progression par `worldId/islandId`, sauvegarde partiellement remplie tolérée, migration d'un ancien `GameSaveV2`.
- Ne pas sauver en permanence les positions de chaque vague : paramétrage `seed, phase, epochTick, waveRevision` suffit, avec temps canonique et stratégie à décider pour pause/sortie d'île (continuer temps monde ou reprendre le même état); rendre cette décision **explicite et testée**.
- En prévision du futur multi, serveur enverra **seed, zone/revision, tick de référence, transitions joueur, impulsions de boost, événements de course** ; client recrée vagues. Validation d'autorité sur courses et achats, snapshot + correction, pas d'émission d'écume/gouttes réseau. Aucun réseau nécessaire à la bêta.

## 8. Matrice de validation de l'île

| Scénario | Condition |
| --- | --- |
| Port calme / ferry | bateau n'est pas chassé par les déferlantes, embarquement/retour fonctionnels |
| Zone A | prendre une vague depuis l'eau calme, glisser 30 m, sauter et atterrir |
| Zone B | descendre la face, accélérer sans boost, virer, rejoindre une deuxième vague |
| Zone C | 3–5 obstacles, une rampe, un boost et des checkpoints terminables |
| Côtes | fond réellement immergé, pas d'eau au-dessus du sable ni trou de LOD |
| Hors carte | aucun franchissement de frontière pendant une descente rapide |
| Chute | retour nage et récupération planche sans perte de sauvegarde |
| Studio | déplacement d'une zone, diagnostic, undo/redo, export/import et test local |
| Voyage | île originale → île surf → île originale sans fuite GPU/audio/sauvegarde |
| Qualité | `economy`/haute = même mouvement et score à input/tick identiques |
| PC | 720p GPU intégré ancien, profils A/B, durée longue et métriques p95/p99 |
