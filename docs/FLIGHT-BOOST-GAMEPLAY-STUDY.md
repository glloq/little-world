# Étude — Propulsion aérienne à impulsions et gameplay du hamster

**Statut : étude fonctionnelle servant de référence à une implémentation expérimentale (voir la roadmap pour les preuves et limites).**  
**Référence :** branche feat/flight-boost-gameplay-roadmap, audit de main du 17 novembre 2026.  
**Roadmap exécutable :** [FLIGHT-BOOST-IMPLEMENTATION-ROADMAP.md](FLIGHT-BOOST-IMPLEMENTATION-ROADMAP.md).  
**Références :** [54 — Mouvement dynamique](54-DYNAMIC-MOVEMENT.md), [62 — Vol rapide](62-HIGH-SPEED-FLIGHT.md), [37 — Audio V2](37-AUDIO-V2-CATALOGUE.md), [22 — Budget ressources](22-RESOURCE-BUDGET-MANAGER.md), [16 — Multijoueur futur](16-FUTURE-MULTIPLAYER.md).

## 1. Intention et invariants

Créer une **propulsion comique au pet**, à **grosses impulsions cumulables**, qui récompense le pilotage (piqué → impulsions → traversée rapide → remontée) plutôt que le maintien d'un accélérateur continu.

- **Un appui = une impulsion** ; maintenir le bouton enchaîne les impulsions à cadence limitée, dans la réserve disponible. Commande PC existante : **Shift en planage** ; mobile : **bouton Boost** séparé de Saut/Planeur. Ne pas réintroduire le clic droit (menu natif Firefox, conflit de caméra). Éviter que la barre Espace ne déclenche le dernier panneau UI quand le jeu a le focus.
- Les impulsions **ajoutent de la vitesse, pas un déplacement instantané**. La vitesse persiste après relâchement puis se dissipe via traînée, virage, freinage et contacts ; piqué/remontée restent soumis au budget énergétique.
- Priorité à une conduite immédiatement plaisante dès le niveau de départ. Les améliorations ne sont pas une condition pour franchir les premières zones ; pas de survie punitive.
- Simulation locale **30 Hz fixe** (rendu 30/20 FPS), déterministe à commandes égales ; sans backend, framework physique supplémentaire, LLM ni nouveau système de rendu.
- Réutiliser l'inventaire, les aliments, le HUD, l'audio V2 et les effets instanciés existants ; préparer les états pour les fantômes/courses et le futur multijoueur **sans ajouter de réseau**.
- Garder l'accessibilité : aucun effet de caméra ne modifie la physique ; préférences réduire les mouvements / effets de vitesse ; signal visuel et sonore non bloquant en cas de son coupé.

## 2. Audit des éléments présents dans main

| Domaine | Constat vérifié | Point de travail |
| --- | --- | --- |
| Physique de propulsion | src/physics/gas-propulsion.ts : réserve max 100, initiale 75, débit 16 unités/s, accélération 10 m/s², rampe 0,16 s, compteur d'effets périodique 0,2 s | Il s'agit d'une **poussée continue** ; le compteur ne crée pas de coups physiques distincts |
| Vol | src/physics/motion.ts : GLIDE.max = 34 m/s (122,4 km/h), traînée, piqué/cabré, virages à rayon croissant | Ajouter les impulsions en respectant inertie/plafond et qualifier jusqu'à 60 m/s |
| Intégration | src/player.ts : gasBoostStep dans le mode glide ; pas de boost sur sol/eau/air sans membrane | Préserver ces portes d'entrée et transitions |
| Saisie | src/input/gameplay-input.ts : Shift sur PC, contrôle tactile existant, pas de clic droit | Traiter appui, maintien, relâchement, focus UI et latence indépendamment du FPS |
| Nourriture | src/gameplay/food-effects.ts : pomme +25, poire +25, prune +15, cerise +12 unités | Recalibrer progressivement à la nouvelle réserve ; manger au sol seulement (src/main.ts) |
| Sauvegarde | src/gameplay/save.ts : V2 et gasReserve limité par GAS.max | Migration des anciennes valeurs, améliorations persistantes, validation stricte |
| HUD | src/ui/app/game-ui.ts : jauge gaz en planage, rafraîchissement 4 Hz | Afficher impulsions disponibles, recharge/cooldown et état du combo |
| VFX | src/hamster/gas-effects.ts : 24 particules instanciées, une géométrie/matériau, pool | Ajouter variantes visuelles sans dupliquer un système par skin |
| Caméra | src/render/speed-effects.ts : FOV, recul, roulis et 12 traînées instanciées | Adapter bornes et interpolation à 60 m/s, préférences existantes |
| Audio | public/audio/catalog.json : Audio V2, sons de planeur/vent, **pas de son de pet/boost dédié détecté** | Nouveaux événements SFX avec variantes, budget audio et mode muet |
| Réseau futur | src/physics/movement-state.ts et src/hamster/presentation-state.ts : états/replay et gasPulseSeq | Distinguer tick d'impulsion, cosmétique et autorité logique ; conserver compatibilité |

**Attention :** la documentation historique de vol rapide et la réalité du code peuvent diverger après des merges. Revalider chaque constante au début de la mise en œuvre ; aucun chiffre de performance n'est garanti ici.

## 3. Paramètres de référence à tester (pas des constantes validées)

### 3.1 Réserve / améliorations

Réserve **en unités de gaz**, coût **14 unités par impulsion** et affichage en nombre d'impulsions **entières utilisables** (floor(réserve / coût)). Garder aussi le reliquat : un boost incomplet **n'est pas déclenché**, il n'est pas perdu lors d'une recharge.

| Niveau de capacité | Capacité totale (unités) | Boosts max (coût 14) | Démarrage / déblocage |
| --- | ---: | ---: | --- |
| Départ | 200 | 14 | Réserve initiale : 150 unités, donc **10 boosts** |
| Explorateur | 224 | 16 | Défi accessible d'exploration |
| Aventurier | 252 | 18 | Parcours de pilotage |
| Maître du vent | 280 | 20 | Défi avancé facultatif |

Une sauvegarde du niveau de capacité ne doit jamais réinitialiser la réserve : au déblocage, la capacité augmente, mais le gaz courant reste inchangé (ou bonus de remplissage explicite comme récompense).

### 3.2 Puissance et cycle

- **Impulsion nominale :** gain de vitesse de 10 m/s au départ, puis 11, 12 et 14 m/s selon **quatre paliers indépendants** du niveau de capacité. Application physique étalée sur **0,15–0,25 s** (proposition : 0,20 s), pas un changement de position ni une téléportation.
- **Cadence minimale :** 0,55 s entre débuts d'impulsions, y compris appui maintenu ; aucun effet mécanique caché à la fin. En cas de relâchement, la poussée déjà commencée se termine ; le relâchement ne supprime pas l'élan.
- **Vitesse expérimentale maximale :** 60 m/s, soit **216 km/h**, à valider ; en cas de collision, streaming ou performance non qualifiés, maintenir une limite sûre inférieure. Au-dessus de 150 km/h : rayon de virage augmenté et anticipation du décor.
- **Diminution de rendement** vers le plafond, sans empiler des impulsions au-delà de la limite ; ne jamais injecter de vitesse par simple ouverture du planeur ou changement de mode.
- **Combo :** l'enchaînement doit d'abord venir des **vitesses physiques cumulées**. Un bonus facultatif plafonné à +5 % de l'efficacité d'impulsion peut être testé **après qualification** seulement, sans accélération gratuite à répétition, et désactivé par défaut tant qu'il n'est pas équilibré.
- **En dehors du planage :** pas de consommation ni de puissance ; aucune transition sol/nage/air qui rejoue un ancien appui. La progression ne doit pas augmenter arbitrairement la vitesse de marche/roulade/nage.

Le gain de vitesse nominal est une **hypothèse de réglage** et ne correspond pas nécessairement au gain net constaté après énergie verticale, traînée et limitation.

### 3.3 Recharge alimentaire et économie

Réutiliser en premier lieu pomme (+25), poire (+25), prune (+15) et cerise (+12) ; requalifier les taux d'acquisition et les coûts après 10–20 min d'exploration. Le jeu ne doit pas imposer de revenir régulièrement à la ferme juste pour voler. Autoriser progressivement des **recettes** comiques (fromage, patate, noisette), sans effet non indiqué ni bonus de puissance aléatoire. Consommer un objet d'inventaire **uniquement après** validation (sol, stock, capacité restante). Ne pas consommer l'aliment lorsque la réserve est pleine ; plafonner les valeurs et refuser les entrées corrompues.

## 4. Boucle de jeu recherchée

1. Décoller depuis une pente/une falaise, déployer le planeur en conservant l'élan initial.
2. Prendre de la vitesse en piqué, utiliser une ou plusieurs impulsions **au bon moment**, gérer les virages et la remontée.
3. Explorer un relief avec terrasses, cols, arches et grandes vallées ; traverser des anneaux ou relever un défi chronométré.
4. Atterrir, collecter de la nourriture, compléter une petite mission animale, débloquer au choix **capacité, puissance ou maîtrise**.
5. Débloquer un skin/son pour personnaliser le hamster et refaire le parcours : meilleurs temps ou moindre nombre de pets.

**Maîtrise (3 niveaux optionnels) :** légères réductions de pertes en virage / meilleure lisibilité des commandes, jamais stabilisation automatique qui empêche un piqué volontaire. Équilibrer séparément la course chronométrée : catégorie standard à capacités communes, catégorie libre avec améliorations.

**Défis** (solo d'abord) : anneaux de montagne, gorge à franchir, remontée après piqué, distance sans atterrissage, parcours à nombre limité de pets, course de précision entre falaises. Aucun combat, dégâts obligatoires ni grind lourd. Conserver des temps et scores locaux ; fantômes/défis multijoueurs ensuite.

## 5. Habillage visuel : skins cosmétiques

Six styles à proposer en V1, **strictement non mécaniques** :

| Skin | Silhouette / palette suggérées | Idée de déblocage |
| --- | --- | --- |
| Classique | Petits nuages verts | Inclus |
| Fromage | Bulles jaunes | Recette/quête fromage |
| Patate | Nuage brun tourbillonnant | Collecte/mission |
| Noisette | Feuilles et éclats bruns | Exploration forêt |
| Magique | Étincelles violettes | Énigme |
| Arc-en-ciel | Courte traînée multicolore | Défi optionnel |

**Approche low-cost :** réutiliser le pool actuel de 24 instances, envisager 24–32 instances visibles localement maximum et mesurer plutôt que garantir ce plafond. Palettes via couleurs d'instance, matrices et géométries partagées (1 à 3 silhouettes). Pas de texture lourde, post-traitement, particules non bornées, ombres portées ni création/allocation par frame. Lorsque le jeu réduit les effets : conserver **le déclenchement lisible** et couper les détails décoratifs. Une seule préférence de skin local et, plus tard, ID de skin distant validé.

## 6. Habillage sonore : catalogue des besoins

L'audio sera une réponse à l'événement **d'impulsion autorisée par la simulation**, pas un son à chaque frame de Shift. Ajouter au catalogue V2 des IDs stables avec variantes, priorité joueur et repli générique en cas de ressource manquante.

| Famille | Prises visées | Direction artistique |
| --- | ---: | --- |
| Pet classique | 5 | Court, sec, grave/aigu/comique |
| Pet puissant | 4 | Impact rond et bref, sans saturation |
| Pet fromage | 3 | Bulles/élastique |
| Pet patate | 3 | Grave/étouffé |
| Pet noisette | 3 | Petit claquement sec |
| Pet magique | 3 | Sifflement léger |
| Vent de vitesse | 2 | Souffle adaptatif, boucles compactes |
| Confirmation de combo | 2 | Signal discret, non obligatoire |
| **Total cible** | **25** | Variantes modulables par pitch/gain |

Production originale ou redistribuable avec provenance et licence, tests d'écoute manuels (pas seulement tests de validité technique). Privilégier mono et fichiers courts préchargés uniquement à la demande, cache audio partagé. Empêcher les doublons si les paquets de rendu sont sautés (utiliser sequence/tick) ; limiter la polyphonie, faire du ducking doux pour les impulsions répétées et atténuer/agréger les pets éloignés des autres joueurs. Séparer éventuellement le volume « humour/propulsion » du reste des sons importants seulement si le mixeur existant peut l'intégrer proprement.

## 7. UI, saisie, feedback et accessibilité

- En planage : **compteur segmenté** d'impulsions complètes, indicateur discret du cooldown, vitesse en km/h, retour de refus (plus assez de gaz / planeur fermé / délai).
- Pas de deuxième grande barre permanente ; masquer le widget de propulsion quand il n'est pas pertinent. HUD throttlé, mais feedback d'appui disponible au tick de simulation ou interpolé en présentation, non lié à 4 Hz.
- **PC : Shift**, **mobile : Boost séparé de Saut/Planeur**, seul bouton Action contextuel si nécessaire. Pas de clic droit comme raccourci. Ignorer touches lorsque panneau texte / dialogue / sauvegarde a le focus ; gérer blur, pause et repli d'onglet sans boost fantôme.
- Personnalisation via menu hamster existant : effet de pet + palette/son, prévisualisation courte facultative ; la prévisualisation **ne consomme pas** de gaz.
- FOV/recul/traînées proportionnels à la vitesse, limites sûres en 60 m/s ; réduction de mouvements coupe les artifices sans ralentir le joueur ni cacher les informations.
- Pour de futures courses : affichage temps, meilleur temps, boosts utilisés, trajectoire et récompense, sans multiplier les panneaux du jeu.

## 8. Contrats de données, état et sécurité

Séparer trois responsabilités :

**Physique autoritaire (simulation) :** gasReserve, gasCapacityLevel, gasPowerLevel, gasControlLevel, impulsionActive/tempsRestant, dernier tick d'impulsion, cooldownTicks, gasPulseSeq, vitesse et mode. Déclencher une impulsion uniquement sur commande validée en planage ; retirer les 14 unités **une seule fois au début**. Mise à jour deterministic tick 30 Hz et sans dépendance à Date.now/performance.now/Math.random.

**Sauvegarde joueur :** réserve, trois niveaux de progression, skins/sons débloqués, sélection cosmétique, records de course ; migration des anciennes V1/V2, validation stricte et borne pour les niveaux. Les effets en cours peuvent être réinitialisés au chargement **sans octroyer de gaz** ; synchroniser avec save/restore existant. Les valeurs antérieures ne doivent pas être interprétées comme 100 % de la nouvelle capacité sans règle de migration documentée.

**Présentation locale / distante :** gasPulseSeq et, si nécessaire, skinId/variantId, intensity et événement de départ pour jouer une seule fois son et particules ; jamais appliquer un bonus physique reçu du renderer. Pour le futur serveur autoritaire, commandes horodatées, vitesse/énergie validées, pulses dédoublonnés, interpolation des joueurs lointains. **Aucune implémentation réseau dans cette campagne.**

Préférences purement locales pour réduire les effets, les sons et la sensibilité caméra ; pas de métriques réseau ou de données personnelles ajoutées.

## 9. Qualification, métriques et risques

| Axe | Cas de test bloquant |
| --- | --- |
| Simulation | Un appui = un seul coût, maintien = plusieurs coups à cadence bornée ; relâchement conserve vitesse ; pas d'impulsion hors planeur |
| Énergie | Aucun gain sans propulsion/piqué, pas de vitesse > plafond, cap stable quel que soit le FPS rendu |
| Intégration | Transition sol/air/eau/planeur, collisions et rechargement, pause/refocus, clavier et tactile, sauvegarde ancienne |
| Collisions | Murs minces, arches, ponts et plateformes, falaises, eau, atterrissage à 60 m/s |
| Streaming | Préchargement > distance parcourue au tick, traversée rapide 4 × 3 km, pas de terrain manquant ni de file non bornée |
| Rejeu | 30 Hz, états/cooldown/impulsions capturés, reprise exacte des entrées, fantôme reproductible |
| Audio | 25 ressources prévues/validées, zéro son fantôme, zéro double, silencieux/muet et navigateur en arrière-plan |
| VFX | Nombre d'instances borné, mémoire et draw calls stables, préférences réduire les animations |
| Performance | p50/p95/p99 simulation, frames > 50 ms, streaming/cache, FPS 30 cible / 20 secours sur PC GPU intégré réel |
| Fun/équilibrage | Tester 10 et 20 boosts, vitesse ressentie, contrôle à 60 m/s, fréquence de recharge et lisibilité des combos |

**Risques majeurs :** haute vitesse (2 m/tick à 60 m/s), faux négatifs de collisions, trafic de streaming, rayon de virage insuffisant, accélération trop forte pour les petites cartes et répétition sonore lassante. Si l'une des qualifications échoue, réduire la vitesse max **sans modifier silencieusement les autres lois physiques** ; conserver les paramètres expérimentaux derrière le banc de tests.

**Hors périmètre immédiat :** nouvelle physique complète, serveur/multijoueur réel, monétisation, nouveaux équipements complexes, compétition publique, recettes indispensables à la progression.

## 10. Références du code concerné

- Simulation : src/physics/gas-propulsion.ts, src/physics/motion.ts, src/player.ts, src/physics/movement-state.ts, src/physics/collision-world.ts
- Saisie / HUD / caméra : src/input/gameplay-input.ts, src/main.ts, src/ui/app/game-ui.ts, src/render/speed-effects.ts
- Effets / présentation : src/hamster/gas-effects.ts, src/hamster/presentation-state.ts, menu de personnalisation existant
- Progression : src/gameplay/food-effects.ts, src/gameplay/save.ts, gameplay économie/inventaire
- Audio : src/audio/view.ts, src/audio/catalog.ts, src/audio/engine.ts, public/audio/catalog.json et ressources audio/sfx
- Tests existants : tests/gas-propulsion.test.mjs, tests/dynamic-motion.test.mjs, npm run test:motion, npm run bench:physics, npm run benchmark:route

**Décision pratique :** implémenter d'abord les impulsions et les instruments de mesure ; n'accorder de progression permanente ni de bonus de combo avant d'avoir un pilotage agréable et des collisions validées.
