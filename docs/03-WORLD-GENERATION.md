# 03 — Carte, génération et compilation du monde

Statut : **périmètre validé ; algorithmes, amplitudes et résolutions proposés**.

## Cadre géographique fixe

- **200 m (largeur) × 600 m (longueur)** de zone de jeu.
- Vallée longitudinale bordée de reliefs montagneux, ouverte sur une côte maritime.
- Cours d'eau continu : **source haute → rivière → moulin → estuaire → port → mer**.
- Un petit village, des clairières, sentiers, forêt, rochers et quelques ruines.
- Les montagnes éloignées sont principalement du décor ; délimitation diégétique du monde plutôt que murs invisibles dans les zones centrales.

La surface rectangulaire correspond à une **enveloppe de conception**, pas à 120 000 m² de sol plat accessible. La part de terrain praticable dépendra des couloirs, pentes et obstacles.

## Stratégie : génération guidée + corrections manuelles

L'éditeur s'appuie sur une **graine déterministe** et des contraintes de haut niveau, puis enregistre les retouches humaines dans une couche distincte.

### Pipeline envisagé

1. Paramètres versionnés (`seed`, dimensions, configuration du relief, style, version du générateur).
2. **Squelette de vallée** : axe longitudinal, pentes générales, versants et zone littorale.
3. **Hydrologie guidée** : source, profil descendant de rivière, bassin de moulin, embouchure, mer.
4. Terrain détaillé par bruit/profil et contraintes locales ; correction des incohérences hydrologiques.
5. Détection de surfaces potentielles pour moulin, village, ponts et port.
6. Végétation et rochers selon biome local, pente, altitude, distance à l'eau et exclusion de zones.
7. Application des **overrides manuels non destructifs** : sculpture, suppression, peinture de zones, courbes, positions de prefabs.
8. **Compilation** : maillages optimisés, collisions simplifiées, instances, navigation et catalogue des interactions.

Chaque génération doit être **reproductible** avec la même graine, la même version du générateur et la même configuration. Changer la version de génération sans migration ne doit pas silencieusement déplacer les objets placés à la main.

## Édition sans perte

Séparer :
- `base` : résultat procédural connu.
- `overrides` : corrections humaines explicites.
- `authored` : objets, chemins et interactions placés intentionnellement.
- `compiled` : artefacts dérivés et régénérables pour le runtime.

Lors d'une régénération partielle, avertir des conflits et conserver l'ancien résultat si une correction ne peut être réappliquée ; **ne pas écraser les modifications humaines**.

## Terrain

Terrain **heightfield** triangulé low-poly pour la majeure partie de la vallée. Les murs, surplombs et grottes éventuels seront des **meshes séparés** ; une heightmap seule ne sait pas représenter des surplombs.

Le maillage peut être scindé en petites sections pour le culling et la réédition, mais le monde n'est **pas infini**. Les décors distants peuvent être condensés en silhouettes sans collisions.

Résolution du terrain, limite de pente, étendue de la côte, amplitude d'altitude et taille des sections : **paramètres à mesurer**, non encore figés.

## Eau

Une rivière représentée par une **spline** et un profil de hauteur physiquement plausible, avec des tronçons plus ou moins profonds pour permettre nage et plongée. L'estuaire rejoint un niveau de mer fixe.

Séparer :
1. Maillage visuel de surface.
2. Volume logique d'immersion.
3. Géométrie du fond.
4. Sens et intensité du courant éventuel (facultatif en V1).

Le moulin s'installe au bord d'un tronçon à dénivelé adapté ; sa roue sera un prefab distinct avec pivot d'animation.

## Placement et décoration

- **Prefabs** complets ou modulaires : arbres, rochers, maison, moulin, pont, port, accessoires.
- Contraintes de placement automatique (distance aux rives, pente maximale, densité).
- Placement manuel pour les éléments narratifs.
- Variantes d'échelle/rotation/couleur à partir d'un nombre réduit de modèles.
- **Instancing** des éléments répétitifs, et nombres de matériaux limités.
- Zones d'exclusion autour des chemins, accès du moulin et quais.

## Performance et visibilité

- Limiter la géométrie, les matériaux, les lumières dynamiques et les objets avec collision.
- Culling des objets derrière les reliefs / hors champ ; distance d'affichage adaptée à une carte longue.
- Les grandes montagnes et l'horizon peuvent être des assets très simples.
- Le chargement progressif par section est **optionnel**, à déclencher si le profilage le justifie : à cette échelle, une carte compilée intégralement pourrait suffire.
- **Aucune synchronisation réseau du terrain** : les joueurs reçoivent une même version immuable de la carte et seulement les états dynamiques nécessaires.

## Contrats de données proposés

Chaque carte contiendra au minimum :
- `worldId`, `schemaVersion`, `generatorVersion`, `seed`, `sizeMeters`.
- `generationParams`, `landmarks`, `waterBodies`, `terrainOverrides`.
- `placedInstances` (références d'assets par ID stable), `interactionInstances`.
- `publicationVersion` et hachages des artefacts dérivés.

**Séparer le format source éditable du format compilé** est indispensable. L'éditeur doit pouvoir recharger la carte même après optimisation des meshes destinés au jeu.

## Vérifications minimales

- Génération déterministe sur la même entrée.
- Rivière sans remontée d'altitude inexpliquée hors ouvrages d'art.
- Aucune maison, quai ou moulin placé dans une pente incompatible.
- Chemin praticable entre zones principales.
- Absence de collision incohérente dans les zones aquatiques.
- Overrides humains conservés après compilation et rechargement.
- Aucune modification par les joueurs en session multijoueur.
