# 65 — Génération de colonies, architecture et identité visuelle dans Little World Studio

**Statut : SPECIFIED — cadrage et roadmap uniquement, aucune fonctionnalité livrée par cette branche.**  
**Date : 17 novembre 2026.** Branche : `docs/studio-settlements-collision-roadmap` (créée depuis `main`).  
**Périmètre :** maisons, fermes, campements, villages, bourgs, villes, ports, défenses, terriers et grottes habitables **sur un monde existant**. Ce chantier ne refond pas le générateur d'îles.

## 0. Sources de vérité et compatibilité avec l'existant

- [13 — UX et architecture Studio](13-STUDIO-UX-ARCHITECTURE.md), [15 — schémas V3](15-STUDIO-DATA-SCHEMAS-V3.md), [32 — Studio 3D](32-STUDIO-EDITEUR-3D.md).
- [11 — politique low-resource](11-LOW-RESOURCE-POLICY.md), [22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md), [24 — mines](24-MINES-MULTILEVEL-LOW-RESOURCE.md), [25 — agriculture](25-AGRICULTURE-PARCELS-LOW-RESOURCE.md).
- [66 — règles de localisation et réseau](66-SETTLEMENTS-PLACEMENT-NETWORK.md), [67 — collisions et interactions](67-SETTLEMENTS-COLLISIONS-INTERACTIONS.md), [68 — roadmap et validation](68-SETTLEMENTS-ROADMAP-TESTS.md).

**Points observés dans le code de `main` lors du cadrage :**
- `src/studio-core/types.ts` expose les entités V3, prefabs, composants `Visual`, `Collider`, `Interactable`, `State`, `Persistence`, `TriggerVolume` et les IDs stables. Les colliders typés ne couvrent actuellement que `box | sphere`.
- `src/studio/session.ts` et `src/studio-core/commands.ts` gèrent une session et des commandes réversibles ; la régénération doit passer par ces composants, sans deuxième historique.
- `src/studio/viewport/placement-rules.ts` signale pente et proximité par des avertissements simples ; ce n'est **pas** encore un solveur de parcelles/accès/collisions.
- `src/world-data.ts` possède `PathDefinition` avec points, largeur, type de surface et `smooth` ; `src/paths/path-view.ts` génère le rendu des chemins par secteurs. Ne pas créer un second rendu routier concurrent.
- `src/structures/natural-structure.ts` traite arches/ponts/tunnels avec terrain heightfield et géométrie locale ; une grotte habitable nécessitera une extension dédiée, pas un voxel engine global.
- `src/studio/shell.ts` dispose déjà de modules Objets, Structures naturelles, Chemins et rivières, Zones, Interactions, Validation. Le générateur de colonies est un **nouveau parcours dans ce Studio**, pas une nouvelle application.
- Les anciens documents sont parfois des cibles historiques : toute affirmation d'implémentation doit être vérifiée sur la branche de développement au début de SET-0.

## 1. Objectifs et invariants

1. Générer une implantation crédible **en une seule opération auteur**, prévisualisée et annulable, sans refaire les placements à la main.
2. Distinguer **morphologie de colonie, culture architecturale, ressources locales, prospérité, rôle des bâtiments, qualité d'entretien et contexte géographique**. La pierre n'est pas intrinsèquement riche, un enduit blanc n'est pas une catégorie structurelle, une yourte n'est pas nécessairement précaire.
3. Partager un même graphe de transport pour routes, rues, sentiers, ponts, escaliers, accès de portes et liaisons vers quais.
4. Réserver les volumes de collision et de circulation **avant** le placement cosmétique ; jamais de bâtiment inaccessible, d'entrée sous le terrain ou de tunnel traversé par une paroi solide.
5. L'apparence/LOD n'influence **jamais** collisions, portée des interactions, état des portes ou logique du joueur.
6. La génération est déterministe, réversible, incrémentale, sectorisée et fonctionne sans backend sur GitHub Pages.
7. Aucun système économique ou urbain complexe ne tourne en permanence en jeu : les règles de ville sont compilées dans Studio ; seules interactions et états utiles vivent au runtime.
8. Respecter les modifications manuelles et les références croisées : ne jamais supprimer silencieusement une entité verrouillée ou un lien d'interaction.
9. Ne pas introduire de système supplémentaire de physique, de stockage, de CommandBus, de ResourceBudgetManager ou de rendu des routes.
10. Architecture compatible avec futur multijoueur (identités et événements persistants) **sans implémenter le réseau aujourd'hui**.

## 2. Axes indépendants du générateur

| Axe | Exemples | Effet |
| --- | --- | --- |
| Morphologie | isolée, hameau, village-rue, radial, bourg dense, ville, village en terrasses | trame parcellaire et rues |
| Milieu | plaine, forêt, versant, falaise, rive, lac, côte, marais | scores de localisation, assises, accès |
| Culture/style | rural, forestier, pierre montagnarde, torchis/colombages, enduit blanc, port marchand, troglodyte | palettes et proportions |
| Ressources | terre, argile, pierre, bois, roseaux, paille, minerai, eau, vent | disponibilité et coût relatif des matériaux/infrastructures |
| Prospérité | précaire, modeste, stable, aisé, prestigieux ; distribution spatiale | volume, finitions, entretien, dimensions |
| Activité | agriculture, forêt, mine, pêche, artisanat, commerce, défense, itinérance | bâtiments spécialisés et chaînes de desserte |
| Protection | aucune, clôture, palissade, remparts, château | enceintes, portes, rues, emprises |
| Densité | dispersée, équilibrée, compacte, très dense | largeur de parcelle, mitoyenneté, voisinage |
| État | construit, entretenu, usé, abandonné | variantes d'assets et état de gameplay |
| Contenu spécial | moulin, port, marché, phare, forge, terrier, grotte | contraintes, lots, interactions |

Ne PAS coder un moteur par type de village. Une recette = une combinaison versionnée de ces dimensions + contraintes éditables.

## 3. Morphologies et échelles à viser

| Famille | Variantes à couvrir | Éléments structurants |
| --- | --- | --- |
| Habitation isolée | maison, ferme, cabane, maison troglodyte, terrier | entrée et accès au réseau |
| Campement | bivouac, forestier, marchand, mineur, montagne, nomade | feu, abris, tentes/yourtes, stockages, accès |
| Hameau | agricole, forestier, pêcheur, mineur | chemin partagé, espace commun |
| Village | rural, rue, circulaire, lacustre, côtier, étagé, troglodyte | centre, logements, activités, transitions périphériques |
| Défendu | village palissadé rond/ovale, bourg à remparts, château + faubourg | portes sur routes, tours, dégagement |
| Bourg/ville | marché, résidentiel, artisanal, commercial, portuaire | quartiers, voirie hiérarchique, places, logistique |
| Port | pêche, petit commerce, marchand, bois, pierre, mixte | quais, vente, entrepôts, rues d'accès |

Les tailles de référence (5–20 maisons en hameau, 20–80 village, 80–150 gros village, 150–300 bourg, 300–600 petite ville) sont **paramètres de génération initiaux**, pas limites GPU garanties. Le bon budget est celui du contenu **visible simultanément** et de la simulation active.

## 4. Catalogue d'architecture modulaire

Séparer **forme / structure / remplissage / finition / toiture / accessoires / état**.

| Axe | Variantes |
| --- | --- |
| Volumes | cabane, rectangle, L, U, étage, maison étroite mitoyenne, ronde, dôme, terrier de colline, façade en falaise |
| Structure | poteaux, rondins, colombages, maçonnerie, ossature légère, semi-enterrée |
| Murs | planches, torchis, pisé, adobe, pierre brute/taillée, brique, bois+terre, bois+pierre, brique+bois |
| Façades | nue, enduit terre, enduit blanc/chaux, colorée, bardage, pierre apparente |
| Toits | chaume/paille, roseaux, bardeaux, tuile, ardoise, dalles, herbe, toile |
| Ouvertures | porte ronde, porte droite, arche, fenêtre simple/ronde, volets ; portes ouvertes/fermées |
| Secondaires | cheminée, auvent, balcon, escalier, jardin, clôture, muret, puits, tas de bois, feu de camp |
| État | neuf, entretenu, vieilli, abandonné ; sans obliger les collisions à suivre les détails graphiques |

**Cibles de catalogue à valider sur les assets actuels :** 12–20 silhouettes utiles, 8–12 familles de toits/façades, et quelques modules réutilisables. Un même asset doit avoir des métadonnées d'empreinte, pivot, ouverture, accès, LOD et collision. Ne jamais promettre un asset non présent : distinguer `AVAILABLE`, `REUSABLE_WITH_VARIANT`, `TO_BUILD`.

**Terriers/dômes** : entrée apparente, fenêtre, cheminée qui traverse la silhouette, toiture d'herbe/terre/enduit, intérieur facultatif ; dôme simple/double et maison semi-enterrée.  
**Grottes de falaise** : décorative fermée, refuge habité, atelier, stockage, entrée de mine, réseau multi-niveaux ; entrée et circulation 3D à spécifier avec [67](67-SETTLEMENTS-COLLISIONS-INTERACTIONS.md).  
**Campements** : tente toile/peaux, yourte, cabane en rondins, abri de planches/branchages, feu central, stockage, charrettes. Réserver un dégagement sécurisé autour du feu.

## 5. Richesse, ressources et répartition des rôles

- Profil global de prospérité + distribution locale de foyers (aucune ségrégation rigide par matériau).
- La **culture architecturale** fixe les poids dominants ; la **disponibilité des ressources** contraint les choix ; la **richesse** influence taille, entretien, détails et surfaces construites ; le **métier** détermine dépendances et localisation.
- La diversité est contrôlée par quartier et par graine : par exemple maisons simples dans un faubourg, commerces près d'une place, entrepôts au port, bâtiments plus soignés près des axes commerciaux ; garder des exceptions.
- Une colonie peut évoluer visuellement sans casser les accès ou les identités : remplacement de variantes et revêtements, pas destruction d'entités.
- Activités : habitation, agriculture, meunerie, boulangerie, pêche, transformation du poisson, exploitation du bois, scierie, mine, fonderie, forge, marché, auberge, entrepôt, défense, refuge.
- La demande `forge près de la mine` se traduit par **chaîne d'approvisionnement** mine → transport → forge/fonderie → marché ; proximité routière, combustible, nuisances et clients peuvent primer sur la distance euclidienne.

## 6. Infrastructure = même identité que la ville

Les façades **et** les routes, chemins, ponts, escaliers, places, quais, remparts et clôtures héritent d'une **palette locale cohérente** :
- campement : sols piétinés, pistes légères, planches/rondins ;
- rural pauvre : terre, herbe, gravier local, pont bois ;
- forestier : pistes et passerelles bois ;
- montagne pierreuse : sentiers, marches et murets pierre ;
- bourg prospère : place pavée, axe marchand empierré, périphérie en gravier/terre ;
- ville brique/pierre : centre dallé/pavé, quais maçonnés possibles ;
- port modeste : ponton bois, aire de vente sur sol stabilisé ;
- port marchand : quai pierre ou mixte, entrepôts reliés par route carrossable.

La surface **n'est pas** la topologie du réseau : une route pavée peut devenir chemin de terre sans couper la navigation. Pas de « une rue par maison » ; les dessertes sont mutualisées.

## 7. Parcours UX « Générer une colonie » dans Studio

1. Sélectionner une zone ou un point d'ancrage sur une carte existante.
2. Choisir **type / taille / fonction / culture / richesse / densité / protections** (presets simples).
3. Spécifier bâtiments spéciaux et exclusions (« obligatoire », « si site adapté », « interdit »).
4. Voir un **aperçu léger** avant commit : zones, routes/chemins, parcelles, empreintes, entrées, infrastructures, alertes, coût estimé.
5. Bouton « Varier » par sous-système (**seulement maisons**, voirie, parcelles, décor), graine visible ; résultats déterministes.
6. Commit **une transaction CommandBus** ; Undo/Redo, sauvegarde, export/import, « Jouer ici ».
7. Édition locale : déplacer, remplacer, verrouiller, protéger un quartier ; régénérer seulement la partie voulue, avec aperçu du diff avant application.
8. Inspecteur : pourquoi ce placement ? quel rôle ? accès, score, matériau, richesse, collisions, interactions et diagnostics.
9. Aucune boîte de dialogue avec 50 options par défaut : détails avancés dans panneaux spécialisés du Studio existant.

**Non-objectifs de la V1 :** population simulée en continu, économie complète, construction physique temps réel par PNJ, gros voxels creusables sur la surface, serveur réseau, intérieur détaillé de toutes les maisons.

## 8. Contrat de qualité V1

Une colonie générée est acceptable lorsque :
- tous les bâtiments marqués accessibles ont un point d'entrée et un chemin praticable ;
- aucun empiètement rédhibitoire (eau profonde, falaise, route, voisinage, fondation, volume de porte) n'est passé sous silence ;
- les fonctions requises sont réalisées ou signalées **non réalisables** avec raison explicite ;
- les styles de matériaux sont cohérents avec richesse, ressources, fonction et revêtement de voirie ;
- preview, commit, Undo/Redo, export/import et re-génération contrôlée conservent les IDs et les objets verrouillés ;
- les collisions et interactions fonctionnent indépendamment du LOD ;
- les scènes de validation passent les gates de [68](68-SETTLEMENTS-ROADMAP-TESTS.md).

**Parcours de livraison et interface utilisateur :** [71 — roadmap accélérée](71-SETTLEMENTS-FAST-TRACK.md) et [72 — UX Studio](72-SETTLEMENTS-STUDIO-UX.md).

**Documents d'exécution :** [66](66-SETTLEMENTS-PLACEMENT-NETWORK.md), [67](67-SETTLEMENTS-COLLISIONS-INTERACTIONS.md), [68](68-SETTLEMENTS-ROADMAP-TESTS.md). **SET-0 audité statiquement :** [69 — état du code](69-SETTLEMENTS-SET0-AUDIT.md), [70 — contrats techniques retenus](70-SETTLEMENTS-TECHNICAL-CONTRACTS.md). Aucun test physique ou benchmark n'est qualifié par ces documents.


## Extension futur système d'îles — partage des contrats SET

Les règles d'implantation, les archétypes de maisons (bois, pierre, terre, yourte, terrier, grotte), les entrées, voiries, collisions et ports conçus ici doivent devenir des **services/contrats réutilisables** par le mode construction des joueurs. **Ne pas dédoubler les solveurs SET**. Le Studio crée des sources auteur statiques ; le mode joueur crée des placements/runtime mutations versionnés et financés par plans/matériaux.

Les îles d'exemple et leurs implantations sont **pré-générées et compilées** pour GitHub Pages ; droits, chantiers collectifs et simulation multi resteront des contrats sans serveur actif jusqu'à demande explicite. Voir [77](77-ISLAND-COMMUNITY-CONSTRUCTION.md) et [78](78-ISLAND-STUDIO-PLAYER-UX.md).

