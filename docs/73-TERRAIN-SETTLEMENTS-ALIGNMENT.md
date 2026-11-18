# Coordination terrain, établissements, accès et collisions

Statut : référence de conception adoptée pour les prochains lots. Ne constitue pas une implémentation du générateur de colonies ou une qualification des collisions.

À la demande de l’auteur, la branche [`docs/studio-settlements-collision-roadmap`](https://github.com/glloq/little-world/tree/docs/studio-settlements-collision-roadmap) sert de cible en parallèle du travail sur le terrain. Lecture effectuée au commit [`bf9a0ee`](https://github.com/glloq/little-world/tree/bf9a0eebc32c099007e52e5cf7853d378a2e523e). Les liens ci-dessous figent les contrats lus ; les évolutions ultérieures de la branche devront être examinées avant adaptation.

Références prioritaires :

- [66 — implantation et réseau](https://github.com/glloq/little-world/blob/bf9a0eebc32c099007e52e5cf7853d378a2e523e/docs/66-SETTLEMENTS-PLACEMENT-NETWORK.md).
- [70 — contrats techniques](https://github.com/glloq/little-world/blob/bf9a0eebc32c099007e52e5cf7853d378a2e523e/docs/70-SETTLEMENTS-TECHNICAL-CONTRACTS.md).
- [71 — livraisons F0 à F8](https://github.com/glloq/little-world/blob/bf9a0eebc32c099007e52e5cf7853d378a2e523e/docs/71-SETTLEMENTS-FAST-TRACK.md).
- [72 — parcours Studio](https://github.com/glloq/little-world/blob/bf9a0eebc32c099007e52e5cf7853d378a2e523e/docs/72-SETTLEMENTS-STUDIO-UX.md).

La branche documentaire est consultée comme référence : elle n’est pas fusionnée automatiquement. Le présent travail continue sur la branche terrain demandée par l’auteur. Les lots de colonies ultérieurs gardent leurs livraisons ciblées ; aucun merge dans `main` n’est implicite.

## Contrat commun à viser

Le terrain fournit des sources natives modifiables : côte, heightfield final avec retouches, hydrographie, biomes, zones protégées et chemins existants. Le planificateur des établissements consomme ces sources ; il ne recrée ni une île ni un réseau d’eau indépendant.

Les réservations de zones à introduire doivent pouvoir décrire un usage, un contour, une altitude ou plage de hauteurs, une pente admissible, des dégagements et des points d’accès. Les ancrages portent une position XYZ, une orientation, un mode d’accès et, si nécessaire, un niveau ou une structure. Ce sont des exigences de contrat, pas de nouveaux champs déjà acceptés par le parser. Leur persistance exige une extension versionnée et des tests d’archive.

| Élément du terrain | Besoin des établissements | Critère commun |
|---|---|---|
| Baie du croissant | Emplacement portuaire, quai et accès logistique | Réserver d’abord rivage, terrain et volume d’approche ; vérifier profondeur et ouverture vers la mer |
| Replat agricole | Champs, ferme, grange, éventuellement moulin | Surface et pente réelles compatibles ; desserte utile ; moulin à eau seulement si site hydrologique adapté |
| Massif ou falaise | Habitat en terrasse, points d’intérêt, passage | Recul de bord, fondations et accès par col, rampe ou escalier vérifiés |
| Île tortue | Quartiers et circulation suivant les lobes | Attaches terrestres assez larges et praticables ; pas de connexion déduite de la silhouette seule |
| Rivière ou lac retouché | Berme, franchissement, moulin ou port | Respect du réseau WATER, des rives et des réservations ; conflit explicite si l’eau coupe un accès |
| Chemin régional | Rues et dessertes des portes | Mutualiser le réseau existant ; réserver les ancrages structurants avant les maisons |
| Zone ou objet manuel | Régénération locale | IDs et propriété stables, verrous respectés, diff avant application, une transaction annulable |

Ne pas générer des habitations simplement parce qu’un biome ou une couleur indique une zone plane. Le support, l’empreinte orientée, le volume, l’accès et les collisions doivent être vérifiés sur le terrain final.

## Navigation et physique : invariants

- `PathDefinition` demeure la sortie graphique des chemins. Un graphe logique commun décrit connexions, hauteurs, niveaux, largeur utile, dégagement et agents. Ne pas créer un second réseau propre au terrain.
- Deux traits qui se croisent en XZ ne forment pas une jonction si leurs hauteurs ou structures diffèrent.
- Une rampe exige un profil de terrain ou une surface physique marchable. Un chemin dessiné sur une falaise ne crée aucun passage.
- Une porte est un obstacle distinct : son ouverture ne rend jamais les murs du bâtiment traversables. Réserver entrée et dégagement avant de remplir les parcelles.
- Une grotte traversable reste bloquée sans preuve d’ouverture du terrain et de la collision. Le heightfield seul ne fournit pas plusieurs sols superposés.
- LOD et rendu n’autorisent aucune suppression de collision nécessaire. Les contraintes de déplacement rapide restent celles du moteur commun.

Les états affichés doivent distinguer **emplacement réservé**, **infrastructure proposée**, **accès validé** et **objet jouable**. Un port réservé dans la baie n’est pas encore un port équipé ni un embarcadère qualifié.

## Travail parallèle et points de rencontre

| Terrain | Établissements / physique | Point de rencontre |
|---|---|---|
| Brouillon 2D déjà implémenté | F0 : baseline et fixtures | Même `ProjectDocument`, session, historique et sources finales |
| Croissant et tortue | F1 : maison jouable, porte et dégagement | Réservations/ancrages compatibles ; aucune promesse de jouabilité sans preuve physique |
| Zones planes et bassins | F2 : aperçu d’un hameau de 8–15 maisons | Consommer les zones sans terrassement ou modification d’eau silencieux |
| Accès entre plateformes | F3 : graphe 3D, rues et parcelles | Un seul graphe de circulation et une validation de pente/franchissement |
| Variantes locales et verrous | F4 et suivants : styles, métiers et ports | Changer les maisons sans recalculer les routes ; changer le terrain avec diff des conflits |

L’ordre des lots terrain du document 67 est conservé, avec ces contrats transversaux dès leur conception. Les petits prototypes de collision F1 peuvent avancer indépendamment des nouvelles silhouettes. Le port équipé, les grottes et les grands villages ne bloquent pas l’édition de terrain ; leurs accès ne sont pas déclarés jouables avant qualification.

## Effets d’une retouche de terrain

Une modification de côte, hauteur, plateforme ou rivière doit identifier les réservations, chemins, parcelles et bâtiments dépendants. Proposer des corrections locales ; ne pas effacer ni déplacer silencieusement les sources auteur. Si une entrée ou une voie devient inaccessible, localiser le conflit dans le brouillon et dans l’aperçu de l’établissement.

Chaque plan dérivé référence la révision ou l’empreinte des sources utilisées. Refuser un commit devenu périmé. Sous-graines indépendantes pour silhouette, relief, hydrographie, routes et bâtiments ; IDs stables pour les éléments conservés. Scores, grilles de coût et caches restent des dérivés jetables.

## Vérifications conjointes à prévoir

1. Croissant avec site portuaire : passe marine ouverte, accès terrestre réel et place suffisante pour les ancrages de quai.
2. Tortue avec hameau : desserte partagée entre les lobes, sans traversée d’une baie ou attache trop étroite.
3. Champs sur replat : ferme et grange accessibles sans écraser les berges, ni imposer un moulin impossible.
4. Deux plateformes : vraie montée praticable ; un croisement sous un pont reste indépendant.
5. Hausse du terrain après placement : conflit de fondation ou de porte visible ; objets verrouillés conservés ; Undo rétablit l’ensemble.
6. Déplacement d’une rivière : raccords et franchissements revalidés, sans reconstruire tous les établissements.
7. Aller-retour archive et « Jouer ici » : sources, accès, états et collisions cohérents ; performances mesurées séparément de la réussite visuelle.

Ces scénarios sont à implémenter et tester au fil des lots concernés. Les tests réussis du brouillon 2D ne qualifient pas encore les colonies, portes, quais ou grottes futurs.
