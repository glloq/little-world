# 72 — Studio : interface intuitive de création des maisons, hameaux, villages et villes

**Statut : SPÉCIFICATION UX / CONTRAT DE FORMULAIRE — aucune UI codée sur cette branche.**  
**17 novembre 2026.** Conception à implémenter progressivement selon [71 — Fast-track](71-SETTLEMENTS-FAST-TRACK.md).  
**Départ :** Studio actuel dispose déjà de `src/studio/shell.ts` (modules Objets, Chemins, Zones et Carte), d'une vue 3D persistante (`studio/viewport/editor-viewport.ts`), d'un outil `PolylineTool` et d'un aperçu de monde Canvas2D dans `studio/home-welcome.ts`. Réutiliser ces éléments : aucun second éditeur, canevas WebGL ou moteur de sauvegarde.

## 1. Positionnement dans Studio

Nouvelle action claire dans **Construire → Villages & villes** (un seul module), pouvant travailler sur une carte existante. Ne pas ajouter dès la V1 des menus séparés « Route », « Maison », « Camp », « Château », « Port », « Terrier » : ce sont des **recettes** ou des détails internes au même module.

Trois comportements en haut du panneau :
1. **Générer** une implantation ;
2. **Modifier** la colonie sélectionnée ;
3. **Ajouter** un bâtiment / chemin manuellement avec les outils Studio existants.

Les actions manuelles existantes (Objets, Structures naturelles, Chemins et rivières, Zones) restent disponibles : navigation retour et sélection persistées. Le module « Générer » guide le novice, l'inspecteur autorise les ajustements du créateur avancé.

## 2. Parcours principal : 4 étapes courtes

```text
Construire > Villages & villes

 [1. Type]          [2. Emplacement]          [3. Personnalisation]          [4. Aperçu]
 ┌──────────────┐   ┌─────────────────────┐   ┌────────────────────────┐   ┌──────────────────────┐
 │ Campement    │   │ Sélectionner zone    │   │ Taille       [moyenne] │   │ Plan + chemins       │
 │ Hameau       │ → │ Carte / vue 3D       │ → │ Style       [Auto]     │ → │ Bâtiments par rôle   │
 │ Village      │   │ Voir zones possibles │   │ Richesse     [Stable]  │   │ Alertes + coût        │
 │ Bourg / ville│   │ [centre suggéré]     │   │ Activité     [Mixte]   │   │ [Varier] [Créer]      │
 │ Port         │   │ [tracé facultatif]   │   │ Densité      [Normal]  │   │ [Options avancées]   │
 └──────────────┘   └─────────────────────┘   └────────────────────────┘   └──────────────────────┘
```

**Étape 1 — Type.** Cartes textuelles/visuelles compactes : `Campement`, `Hameau`, `Village`, `Bourg/Ville`, `Village portuaire`, `Village fortifié` (autres recettes en avancé). Les recettes non livrées affichent « indisponible » : jamais boutons inertes.

**Étape 2 — Où ?** Un point centre ou une zone dessinée dans la carte/vue Studio, avec suggestions basées sur pentes/eau/routes existantes. D'abord un **centre + rayon** rapide, zone polygonale disponible en avancé via les outils existants. Montrer immédiatement la surface utilisable et les impossibilités (falaise, profondeur, accès).

**Étape 3 — Personnaliser.** Exposer **5 réglages principaux** au maximum, avec des valeurs intelligentes et un bouton « Plus de réglages ». Ne pas demander l'altitude exacte des maisons, le numéro des tronçons, l'épaisseur des murs ou les sous-graines par défaut.

**Étape 4 — Aperçu et créer.** Afficher des routes colorées selon leur fonction, empreintes de bâtiments, espaces réservés, accès et avertissements. `Créer dans le monde` ne s'active qu'après résolution des erreurs bloquantes. Proposer **Varier**, **Modifier la zone** et **Retour**.

Après création : message résultat (« 57 bâtiments, 9 chemins, 2 bâtiments non placés »), puis bouton **Modifier dans Studio** et **Jouer ici**, pas de création automatique silencieuse.

## 3. Les cinq paramètres visibles (mapping UX → recette)

| Paramètre visible | Choix débutant | Données internes et logique |
| --- | --- | --- |
| **Type** | Camp, hameau, village, bourg, port, fortifié | `form` + ensemble de rôles/patrons + protections |
| **Taille** | Petite, moyenne, grande | cible de bâtiments et emprise autorisée, plafonnée par zone et budget |
| **Style** | Automatique, Bois, Terre, Pierre, Brique, Enduit blanc, Mixte | profil culturel + palette structure/murs/toits/façade ; ne détermine pas la richesse |
| **Richesse** | Modeste, Équilibrée, Prospère | distribution des 5 niveaux internes (0–4), entretien, dimensions, qualité des rues |
| **Activité** | Mixte, Agriculture, Forêt, Mine, Pêche, Commerce | besoins fonctionnels, ancres, chemins logistiques et bâtiments spéciaux |

**Densité** : réglage `Naturelle ↔ Compacte` affiché en **option contextuelle** lorsqu'elle influence le type (hameau/village/ville). Il s'agit d'un réglage avancé du moteur, **pas d'un sixième champ global systématique**.

**Valeurs par défaut conseillées pour accélérer le parcours :**
- Type = `Village` (ou le dernier choix retenu dans le brouillon courant).
- Taille = `Moyenne`.
- Style = `Automatique` (matériaux locaux + culture compatible avec climat/terrain, sans prétendre mesurer toute la géologie).
- Richesse = `Équilibrée`.
- Activité = `Mixte`.
- Réutiliser chemins existants = **oui** ; chemins mutualisés = **oui** ; s'adapter au relief = **oui**.
- Génération de défenses = **non**, sauf recette fortifiée.
- Préservation des édits manuels = **toujours oui** et non désactivable facilement.
- Autoriser « variation aléatoire » via `Varier` **sans** imposer de connaissance des graines.

Un preset peut pré-remplir les champs, **jamais les verrouiller**. Les matériaux du pont, du quai et de la route sont déduits automatiquement du style + richesse + ressources locales + usage.

## 4. Catalogue de presets : sortie contrôlée

| Carte utilisateur | Morphologie / ambiance | Éléments automatiques si réalisables | Condition |
| --- | --- | --- | --- |
| Maison isolée | 1 maison et court accès | cour/jardin possible | terrain constructible |
| Campement | tentes/yourtes/cabanes, feu, cercle ou clairière | chemin piéton et zone de feu | replat/sécurité ; nouveaux assets requis pour tente/yourte |
| Hameau | petits lots, chemin partagé | puits ou espace commun | possibilité d'accès |
| Village rural | centre, rues, fermes périphériques | champs proches, grange, moulin optionnel | sol et sites appropriés |
| Village forestier | bois, clairière, abris | scierie/camp bûcheron | forêt et accès |
| Village minier | habitat/utilitaire près d'une route de mine | mine/forge si disponibles | gisement/route, sinon diagnostic |
| Village de pêcheurs | maisons côte + pontons bois | comptoir/stockage/vente | côte/accostage |
| Bourg marchand | centre compact et pavé | boutiques, marché, entrepôts | surface/route |
| Village fortifié | enclos, portail et habitat | palissade bois ou mur pierre | emprise et portes |
| Village de terriers | dômes à entrée visible, chemin de colline | cheminée, jardins | assets/profil collision, à développer |
| Village troglodyte | façades de falaise, terrasses | grottes décoratives au départ | `enterable` bloqué sans CT-6 |
| Ville portuaire | rues logistiques, quais pierre/bois | marchés, entrepôts, pontons | vrai site portuaire |

Moulin à vent et moulin à eau ne sont **jamais imposés** par le simple nom « village agricole ». Les sites sont vérifiés ; un moulin demandé en obligatoire mais impossible entraîne une erreur explicite. Une forge nécessite **un accès logistique**, pas un point géométriquement voisin de la mine.

## 5. Panneau « Plus de réglages » (seulement si pertinent)

Groupes repliables, avec petites aides contextuelles :

1. **Organisation** : densité, forme (`organique/linéaire/radiale/terrasses`), centralité, quartiers, taille de parcelle, mitoyenneté ; pas de contrôle brut des dizaines de paramètres de scoring.
2. **Architecture** : poids des matériaux disponibles (terre/bois/pierre/brique), toit (chaume/tuiles/ardoise/bois), façade (nue/blanche/colorée), usure, hauteur/étages, terriers/grottes lorsque disponibles.
3. **Fonctions** : nombre de fermes, moulins, forges, marchés, ateliers, auberges ; `Obligatoire / Si possible / Interdit` pour chaque rôle ; relation aux mines, champs, forêts, port.
4. **Infrastructure** : type de route dominante, routes existantes conservées, hiérarchie et connexion, ponts, escaliers, places, port bois/pierre, raccordements aux parcelles.
5. **Défenses** : aucune, palissade, enceinte pierre, tours, portes, château selon la recette.
6. **Génération** : graine, sous-variation maisons/routes/décor, limites CPU, nombre cible de bâtiments, refus des gros terrassements, exclusions, zones protégées.
7. **Édition** : verrouiller colonie/quartier/bâtiment/route, régénérer seulement les éléments non verrouillés, afficher un diff avant remplacement.

Une option n'apparaît **que si** elle est compatible : `quai` si côte/lac et accès ; `moulin à eau` si rivière ; `grottes` si falaise et implémentation validée ; `palissade` pour types défendus ; `mines` si gisement et ressource reconnue.

**État des options** : `Disponible` / `Site incompatible` / `Fonction en développement`, avec raison et proposition d'ajustement. Ne jamais masquer un échec de génération silencieusement.

## 6. Aperçu rapide sans surcharger WebGL

**Première version :** plan 2D en surimpression de la carte/viewport, construit depuis un `SettlementPlan` sans créer les meshes définitifs.

Couches activables uniquement au besoin :
- **Bâtiments** : empreintes + couleur par métier, icône pour place, moulin, forge, marché, port.
- **Routes** : principale / secondaire / sentier / accès privé, avec surface en légende facultative.
- **Parcelles** : contours et terres réservées.
- **Contraintes** : zones non constructibles, pentes, eau, collisions, espaces de porte.
- **Qualité** : avertissements et éléments non réalisables.

Encart minimal dans l'aperçu :
```text
 Village rural — Proposition 03
 62 bâtiments souhaités / 58 placés
 1 place, 5 rues, 8 chemins secondaires
 2 accès à corriger   [Voir]
 [Varier les maisons]  [Varier le plan]
 [Retour]                         [Créer le village]
```

Calcul des candidats par étapes et prévisualisation progressive ; annuler une génération obsolète via génération ID et révision. Un seul rendu WebGL de Studio : l'aperçu peut réutiliser la vue et les contrôles, pas en créer un second. `drawWelcomePreview` offre un précédent pour la visualisation Canvas2D.

## 7. Comment « Modifier » doit fonctionner après création

Dans l'inspecteur d'une colonie :
- **Identité** : nom, type, style, activité, taille, richesse.
- **Variantes** : `Varier les maisons` (conserve routes/parcelles), `Varier les routes` (prévisualise impact des entrées et verrous), `Varier le décor`.
- **Verrouillage** : `Ne plus modifier` pour routes, maisons, quartier, édits manuels.
- **Structure** : ouvrir les outils Studio existants pour déplacer/éditer une maison, un chemin, une porte ou une zone.
- **Diagnostic** : pour chaque objet « pourquoi ici ? », accès connecté, type de sol, score, conflits, ressources, matériaux, état de collision et possibilité d'interaction.

Le changement de richesse/style **ne doit pas** automatiquement effacer une maison ou une route. Le générateur propose un diff `ajouts / remplacements / suppressions / inchangés / protégés`, les suppressions sont explicitement confirmées quand elles peuvent casser les liens. `Undo` restaure la colonie précédente.

Si le terrain a changé depuis le dernier plan : `Cette proposition doit être recalculée`, pas de commit d'un plan périmé.

## 8. Déclinaisons en fonction de la géographie existante

- **Plaine** : rues simples, lotissements organiques, fermes sur bordure.
- **Terrasses et montagne** : petits groupes sur plateformes, chemins en lacets et escaliers ; pas de jonction 2D artificielle entre niveaux.
- **Côte/port** : choix port bois/pierre lié au style, richesse, usage, profondeur et accessibilité.
- **Forêt** : clairières, parcelles excluant les arbres majeurs, cabane + feu sécurisé.
- **Camp sur col** : replat proche du chemin et abrité ; pas sur une crête impropre.
- **Collines/terriers** : entrée orientée vers chemin, façade non enterrée, cheminée distincte.
- **Falaises/grottes** : ouverture décorative si physique non prouvée ; vrai passage conditionné à un système local validé.

Les suggestions de sites utilisent les **mêmes données géographiques que le moteur**, pas une seconde heuristique propre au formulaire.

## 9. Tests UX d'acceptation (à exécuter, pas encore exécutés)

| Parcours | Résultat attendu |
| --- | --- |
| Première génération novice | 5 choix, zone, aperçu, créer ; aucune configuration technique nécessaire |
| Site non constructible | blocage clair avant commit + suggestion d'emplacement |
| Terres fertiles absentes | activité agricole difficile signalée ; pas de moulin artificiel |
| Changer style bois → pierre | maisons et revêtement des axes cohérents, routes connectées et IDs stables |
| Varier les maisons | **aucune** nouvelle route si non demandée |
| Modifier maison manuellement | l'élément est préservé après regen |
| Réouverture du projet | colonie, recette et overrides présents |
| Annuler / refaire | sources, référents et objets rétablis |
| Jouer ici | collisions de murs et portes, interactions valides, aucun faux passage |
| Type indisponible | raison et prérequis affichés, aucun bouton sans effet |
| Taille dépasse ressources | diagnostic et limite, pas de blocage du navigateur |
| Raccourcis Studio | Ctrl+Z, sélection, navigation 3D, gestion du focus clavier inchangés |

**Definition of Done UX :** permettre une génération propre **sans toucher au JSON ni aux coordonnées**, et ne pas perdre les modifications manuelles. Le mode avancé sert à approfondir, pas à corriger systématiquement les erreurs du générateur.

## 10. Découpage UX par lots Fast-track

- **F2 / indispensable** : module unique, cartes type, sélection centre/rayon, 5 paramètres, preview 2D, alertes, `Créer`, Undo/Redo, `Jouer ici`.
- **F3** : aperçu vrai graphe routier + parcelles, verrouillage et régénération des maisons.
- **F4** : palette des matériaux, richesse et surface des voies avec transformation sans re-layout.
- **F5–F6** : éditeur de rôles et infrastructures avancées ; modèles de colonies spécialisés, options contextuelles.
- **F7** : terriers/dômes et option grotte décorative ou réellement traversable selon gate technique.
- **F8** : visualisation des budgets de performance et grands quartiers, chargement progressif.

**Point d'architecture à préserver :** le formulaire fabrique une recette ; le même solveur pur calcule preview et plan définitif ; l'édition passe par le CommandBus V3 ; seule la vue et les messages dépendent du DOM/Three.js. Cela garde un comportement prévisible et minimise le coût de maintenance.
