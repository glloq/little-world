# 82 — Roadmap d'implémentation : filières, ateliers, commerce maritime et Studio

**Statut : ROADMAP / SPECIFIED — implémentation non commencée par ce document.** Audit réel [80](80-ECONOMY-TRADE-CRAFT-AUDIT.md) ; contrats cible [81](81-ECONOMY-PRODUCTION-CONTRACTS.md). Conserver [73–79](73-ARCHIPEL-VISION-DECISIONS.md), notamment l'exigence de **jeu solo sur GitHub Pages, sans serveur ni multijoueur activé**.

## 0. Boucle jouable cible

**Récolter → acheter/compléter les ingrédients → voyager librement avec le sac → transformer dans un atelier local → récupérer l'ouvrage → consommer/utiliser/construire/vendre → réinvestir.**

Les chaînes de l'archipel forment un graphe économique à plusieurs sorties : le joueur ne doit ni suivre une profession obligatoire, ni passer par toutes les îles pour obtenir un objet de base. Les voyages doivent offrir de meilleurs rendements, des variantes et des équipements avancés, sans punir le jeu local.

Deux démonstrateurs obligatoires : **(A)** blé → farine → produit alimentaire + recharge de gaz ; **(B)** minerai → lingot → outil, avec acheminement libre d'au moins un composant entre deux îles. Une troisième boucle matériau de construction (pierre → blocs ou roseaux → panier) valide la diversité.

## 1. Lots en ordre de dépendances (ne pas réaliser simultanément sans contrat stable)

| Lot | Priorité | Travail concret et fichiers à adapter (indicatifs) | Gate / preuve |
| --- | --- | --- | --- |
| **ECO-0 — Baseline et choix d'autorité** | P0 | Vérifier `main` et branches archipel intégrées ; baseline `tests/economy.test.mjs`, `tests/ferry-transit.test.mjs`, `tests/save-v2.test.mjs`, `tests/island-transit.test.mjs` ; décider modèle de sauvegarde portable V3 vs sidecar | Tests baseline consignés, inventaire des schémas, décision écrite sur propriété du sac et transaction |
| **ECO-1 — Conservation du sac** | P0 BLOQUANT | `src/archipelago/transit.ts`, `src/main.ts`, `src/gameplay/game-view.ts`, `src/gameplay/save.ts` ; catalogue archipel commun, item inconnu préservé durablement, entrée/sortie des îles, migration | A→B→refresh→A (item absent à B) sans perte, dédoublement ni écrasement ; export/import conserve le contenu |
| **ECO-2 — Sûreté achat/vente** | P0 BLOQUANT | `src/gameplay/economy.ts`, `src/ui/shop/shop.ts`, `src/gameplay/game-view.ts` ; correction de la vente partiellement rémunérée ; transactions prix/quantités ; mécanisme unique d'atomicité | Monnaie presque pleine, sac presque plein, prix aberrant, quantité invalide, reprise refusée : aucun débit isolé |
| **ECO-3 — Catalogue et schémas** | P0 | `src/gameplay/schema.ts`, `src/gameplay/activities.ts`, `src/studio-core/schema.ts`, compilation ; ajouter les objets/recettes/stations versionnés, validateurs, IDs partagés | Ancien projet V3 charge, nouveau catalogue invalidé si recette orpheline / item incompatible, compilation déterministe |
| **ECO-4 — Moteur de fabrication pur** | P0 | Nouveaux modules ciblés `src/economy/recipes.ts`, `production.ts`, `transactions.ts` ou noms équivalents ; réutiliser `runtime.grantItems` et horloge existante | Start/ready/collect/cancel atomiques ; 1 ou plusieurs lots ; même requête rejouée sans doublon ; file et sorties persistantes |
| **ECO-5 — Atelier jouable V1** | P0 | Réutiliser `src/ui/app/game-ui.ts`, `src/ui/shop/shop.ts`, `src/ui/interactions/targets.ts` et prefabs ; onglet Transformer, 3 postes (moulin, cuisine, forge) ; sélection quantité et état | Recettes réellement consommées/produites, temps de jeu, feedback, sortie récupérable après voyage, clavier/mobile sans raccourcis parasites |
| **ECO-6 — Stock et prix locaux** | P1 | Étendre `ShopState`, `priceOf` contextualisé et `trade` ; commandes d'achat/revente avec stock, budget, demande et révision | Plusieurs comptoirs de même type avec offres distinctes ; revente inter-îles rentable mais pas de gain infini local |
| **ECO-7 — Commerce maritime** | P1 | Module cargo distinct de `ferry-schedule.ts`, profils par île, stand import ; calendrier événements et persistance, registre îles / routes | Produits étrangers reçus uniquement par expédition appliquée ; recharge bornée et idempotente ; présence visuelle facultative |
| **ECO-8 — Filières diversifiées** | P1 | Ajouter données de recettes et ressources récoltables : maïs, argile, combustible, fibres, pierre, bois ; au moins 5 types de stations | 15–20 recettes jouables, zéro item décoratif annoncé comme ressource récoltable sans source valide |
| **ECO-9 — Studio / publication** | P2 | Bibliothèques auteur + outil « Économie » : profils de ressources, stations, routes, recettes, aperçus des entrées/sorties et vérifications de disponibilité | Auteur configure sans édition JSON ; export compilé validé ; ancien projet + île de référence 4×3 km sans régression |
| **ECO-10 — Extension avancée** | P2 / FUTUR | Commandes PNJ, dépôts, construction à partir de matériaux, chaînes semi-automatiques ; puis commerce coop **uniquement après activation multi décidée** | Aucun serveur requis pour ECO-0…ECO-9 ; architecture évolutive sans réécriture des IDs |

**Ordre de mise en place :** ECO-0 → ECO-1/2 → ECO-3 → ECO-4 → ECO-5 → ECO-6/7 → ECO-8/9. ECO-1/2 peuvent avancer sur branches séparées si contrats de sauvegarde/transaction stabilisés. Réduire le premier jalon à **2 îles statiques déjà publiées** ; ajouter la troisième seulement si les tests de passage sont stables. Pas de nouvelle zone générée à la volée par navigateur.

## 2. Inventaire détaillé des adaptations de projet

### Gameplay et inventaire

- Conserver les objets de `ItemDefinition` et la monnaie `coin`, sans nouvelle monnaie obligatoire.
- Définir catalogue archipel global ; politique claire pour conflits d'IDs, objets inconnus, renommages, stack max 1 pour les outils, objets « réservés » dans une fabrication.
- Introduire un registre d'**effets explicites** pour tous les plats préparés (voir `70-FOOD-BOOST-RECHARGE.md`) : consommation depuis le sac et autorisations de contexte inchangées.
- Séparer le **nombre d'objets transportables** (contrainte de sac existante) de la **quantité produite/achetée** et du **stock marchand**. Le transport entre îles n'ajoute pas une deuxième limite cachée.

### Production et métiers

- Catégories : agriculture/alimentation ; argile/pierre/construction ; roseaux/fibres/textiles ; minerais/métallurgie/outils ; bois/menuiserie ; artisanat avancé.
- Recettes avec entrées/sorties multiples, version, station, durée, coût de service et condition facultative de déblocage.
- Stations accessibles dans de vrais établissements ou petits stands ; fournisseur de service facultatif (PNJ), aucun PNJ 3D nécessaire hors écran.
- Stock d'atelier distinct du sac, file bornée et récupérer les produits finis ultérieurement. Si saturation du sac, garder la sortie à l'atelier.
- L'économie tourne en **événements datés**, non en boucle d'objets à chaque frame.

### Commerce et géographie

- Un profil économique par île décrit productions, besoins, établissements disponibles, partenaires, règles logistiques ; il ne dérive pas automatiquement du seul biome.
- Niveau de port = capacités des dessertes ; niveau technique et richesse artisanale indépendants.
- Stand maritime exclusivement pour lots importés d'autres îles ; autres boutiques peuvent racheter ou vendre des produits transformés selon demande.
- Permettre des arbitrages entre îles et la spécialisation des régions ; afficher marge/prix unitaire/stock et motif d'indisponibilité.
- Ne pas mélanger ferry voyageurs, cargos logiques, voyages personnels et transport de matériaux de chantier.

### Studio, données, assets

- Phase 1 : **catalogues préconfigurés statiques** et stations prefab existantes ; aucun nouvel écran Studio bloquant.
- Phase 2 : panneau simple « Économie » (activité dominante, filières autorisées, quantité de postes, intensité des échanges) ; mode avancé pour recettes, prix, règles, routes et exceptions.
- Génération d'établissements cohérente : moulin près de cultures/eau/vent selon prefab ; forge proche du village/mines ; commerce maritime proche d'un quai accessible, collision et chemins validés.
- Validation publication : toutes références d'items/recettes/stations résolues, outputs atteignables, aucun cycle explosif, aucun commerce import sur île sans source ni route, budget d'assets respecté.
- Rendu low-poly : réutiliser 1–2 prefabs de comptoir/atelier ; enseignes et caisses variant par matériau ; LOD/décor sans meshes de production pour une île absente.

## 3. UX joueur minimal et intuitif

**Boutique/atelier :** une modale contextuelle unique avec onglets `Acheter`, `Vendre`, `Transformer` (si autorisés). Liste filtrable par catégorie, recherche facultative ultérieure. Détails : icône, nom, provenance si import, quantité disponible/possédée, prix unitaire, coût total et raison de blocage.

**Transformation :** sélectionner recette → afficher ingrédients possédés/manquants, nombre de lots, sorties, frais, temps de jeu → `Lancer` → progression/heure de fin → `Récupérer`. Le cas « pas assez de place » conserve les objets finis à l'atelier. Les actions métier passent toutes par le contrôleur, jamais par manipulation directe du DOM.

**Sac :** montrer pour un item les actions disponibles selon contexte (`Manger`, `Équiper`, `Déposer`, `Vendre`, `Utiliser dans un atelier`), sans bouton inactif systématique pour toute action future. Une recette nouvelle ne doit pas exiger une refonte complète du sac.

**Carte :** un symbole commerce et éventuellement la spécialisation de l'île ; pas d'icônes de tous les stocks détaillés. Préparer un carnet facultatif de prix/produits découverts ultérieur.

## 4. Démos et critères de validation par gate

### G0 — Contrats et non-régression

- État exact du `main`, versions des mondes, migrations, baselines consignés.
- Schémas vérifiés par parseurs, aucun nouveau champ non validé, ancien `StudioProjectV3` encore importable.
- Pas de duplication de moteur inventaire, d'atelier, de simulation agricole ou de stock.

### G1 — Transport sûr + transactions sûres (BLOQUANT)

- Cas A→B→refresh→A et A→B→C→A, contenu identique y compris objet non défini par B.
- Rollback d'un chargement cible impossible, ticket expiré et import/export.
- Achat/vente près de la limite de pièces, vendeur sans argent, quote périmée, stock insuffisant, inv. saturé ; zéro perte silencieuse.
- Replay de transaction avec même requestId ne modifie jamais l'état une deuxième fois.

### G2 — Recettes et ateliers

- Trois types de postes, 6–8 recettes de démonstration, inputs débités une fois, jobs repris après refresh et après voyage.
- Sortie persistante tant qu'elle n'est pas collectée ; récupération partielle non implicite.
- Modification/suppression d'une recette sans corruption d'un job existant ; migration explicitement testée.

### G3 — Économie maritime réelle en solo local

- Deux îles publiées ont offres différentes ; livraison d'import porte un `originIslandId` différent ; stock de l'origine débité dans la simulation locale cohérente ou injection scénarisée déclarée.
- Horloge de fret indépendante du ferry voyageur ; jours/semaines sautés rattrapés par événement borné.
- Test achat dans île A → vente île B bénéficiaire ; acheter+revendre sur le même comptoir n'est pas une source de gain illimité ; demande/trésorerie bornées.
- Chaque client GitHub Pages a sa propre économie de test ; aucun faux prétendu partage réseau.

### G4 — Contenu diversifié / Studio

- Catalogue initial environ **15–20 recettes** réparties entre alimentaire, minerais, bois, pierre et fibres ; comptoirs et stations réellement accessibles.
- Aperçu Studio des chaînes de production avec alerte ingrédients introuvables, recette cyclique non bornée et port sans lien commercial.
- Tests visuels et ergonomiques sur PC et mobile ; aucune surcharge de menu global.

### G5 — Qualification de performance

- `npm test`, `npm run typecheck`, `npm run build`, `npm run test:economy`, `npm run test:ferry`, `npm run test:ui` selon disponibilité des navigateurs.
- Benchmark micro : 10, 50, 100 îles **logiques** avec stocks/cargos/jobs et aucune scène Three.js ; relever temps de replay, JS heap et taille des sauvegardes ; **ne pas inventer un budget chiffré sans mesure baseline**.
- Toute absence prolongée est traitée par borne + curseur, pas boucle de chaque minute écoulée ; reprise de lots sans double application.
- Jeux de données invalides ou malveillants refusés par validateurs (quantités négatives, NaN, identifiants arbitraires, stocks gigantesques).
- Régression sur île existante 4×3 km, mouvement, planage, eau, audio, Studio et voyage ; contrôle mémoire et actifs audio/3D déchargés.

## 5. Arborescence cible indicative

~~~text
src/economy/
  catalog.ts          # catalogue commun, index par itemId
  recipes.ts          # données + validateurs des recettes
  production.ts       # files/jobs, événements purs
  transactions.ts     # atomicité multi-comptes et révisions
  pricing.ts          # prix contextuels déterministes
  maritime.ts         # événements cargo et provenance
  island-profile.ts   # spécialisation/demande/stations
src/gameplay/economy.ts  # adaptateur de compatibilité pour shops actuels
src/archipelago/        # réutiliser registry/transit/ferry ; pas de duplication
src/ui/shop/            # onglet atelier et composants réutilisables
src/studio/             # configurateur économique ultérieur
tests/economy-*.test.mjs
~~~

Les noms sont **proposés**, à revoir avant implémentation après audit des imports réels. Préférer des petits modules purs et des adaptateurs, éviter un monolithe `economy.ts` géant.

## 6. Contenu proposé pour l'île d'exemple

| Île de référence | Ressources et métiers de départ | Importations intéressantes |
| --- | --- | --- |
| `volcano-island` (4×3 km) | Minerai, roche, forge/fonderie de démonstration (à placer/vérifier) | Farine, nourriture, fibres |
| `forest-valley` | Bois, récoltes, scierie, moulin/cuisine (à placer/vérifier) | Lingots, objets métalliques, pierre travaillée |
| Troisième île **future** | Agriculture et textile, cultures de maïs/lin après ajout du moteur | Outils métalliques, briques, bois travaillé |

Ce tableau représente une **répartition cible**, pas une assertion que ces ateliers/productions existent aujourd'hui sur les cartes compilées.

## 7. Lots de PR et suivi d'avancement

Ouvrir **une PR par lot fonctionnel qualifiable** après ECO-0 ; chaque PR indique :
- statut `SPECIFIED / IMPLEMENTED / TESTED / QUALIFIED`, numéro ECO, base SHA, fichiers et dépendances ;
- preuves de tests et scénarios de sauvegarde/migration ;
- impacts sur build GitHub Pages, perf, UI, actifs, compatibilité V3 ;
- limites connues et rollback.

Ne pas fusionner ECO-3/4/5/7 d'un coup sans tests incrémentaux. Les filières supplémentaires doivent être de simples **données validées** après qualification du moteur, afin de limiter fortement les coûts d'implémentation.

## 8. Décisions ouvertes à trancher avant ECO-3/ECO-4

| Question | Proposition par défaut | Pourquoi |
| --- | --- | --- |
| Sauvegarde portable | un `PlayerEconomyState` versionné séparé des slots d'îles, à confirmer en ECO-0 | protège le sac lors de changements de monde |
| Temps de fabrication | minutes de jeu canoniques, récupération dans l'atelier d'origine | prévisible et compatible hors écran |
| Produits finis non récupérés | coffre de sortie d'atelier, persistant et borné | empêche disparition quand sac plein |
| Frais | en pièces, coût explicite au démarrage | utilise l'économie actuelle |
| Qualité / usure d'objet | **reportées** (items stackables simples) | évite inventaire à instances uniques dès V1 |
| Origines multiples | suivre `originIslandId` au **niveau des lots de marché**, pas dans chaque objet du joueur | simplifie les stacks et garde le comptoir d'import honnête |
| Stock de production locale | disponibilité déclarée au départ, simulation événementielle ensuite | évite fabrication « gratuite » hors session |
| Activation multijoueur | aucun serveur jusqu'à décision explicite | garde le build statique fonctionnel |

**Définition de terminé :** une session solo réunit au moins deux îles statiques, un voyage conservant tous les biens, une recette multi-ingrédients, un atelier à sortie différée, un marché aux stocks réels, un arbitrage maritime et un refresh sans perte, avec tests reproductibles et build Pages publiable.