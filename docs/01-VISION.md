# 01 — Vision et périmètre

Statut : **spécification initiale approuvée pour la préproduction**, 12 novembre 2026.

## Concept

Little World est un **petit monde 3D exploratoire multijoueur**, conçu d'abord pour le navigateur sur PC. Le joueur incarne **un écureuil volant non humanoïde**, traverse une vallée montagneuse, suit le cours d'eau, découvre un moulin, un village et un petit port débouchant sur la mer.

L'expérience recherchée est calme, lisible et centrée sur le plaisir de circuler dans le relief. Les mécaniques de marche, course, saut, nage, plongée et planage doivent être intéressantes **avant** tout ajout de progression, quête ou économie.

## Décisions validées

| Sujet | Décision |
| --- | --- |
| Carte jouable | **200 m de large × 600 m de long** |
| Terrain | Fixe côté joueurs ; création procédurale et édition côté développeur |
| Personnage | **Écureuil volant**, animal stylisé, locomotion surtout quadrupède |
| Caméra | Troisième personne, orientable à la souris |
| Plateforme V1 | Navigateur **PC uniquement** |
| Contrôles | Clavier + souris, `Espace` pour saut et déploiement du planage selon le contexte |
| Endurance | Aucune au lancement |
| Plongée | Oxygène limité mais délai volontairement long |
| Dégâts / mort | Aucun dans la première version |
| Activité V1 | **Exploration et tests** |
| Population visée | 10 à 30 joueurs par instance, objectif à valider |
| Visuel | Low-poly organique et fortement optimisé, atmosphère chaleureuse |
| Assets | Catalogue dans le repo, enrichissement itératif, provenance et licences suivies |

## Direction artistique

- Une ambiance **originale** de conte animé : silhouettes rondes, végétation riche mais légère, lumière douce, palette naturelle, petites touches de magie environnementale.
- Éviter l'imitation directe d'un studio, film ou personnage existant ; créer des modèles, palettes et formes propres au projet.
- Priorité à une **forte lisibilité à distance**, notamment en planage.
- Préférer la variété par formes, couleurs et échelles à une multiplication de matériaux et textures.
- Architecture artisanale : bois, pierre, petites tuiles, moulin à roue visible, pontons de pêche et accessoires portuaires.

## Zones narratives de la carte

Ordre géographique proposé, à affiner dans l'éditeur : **haute vallée et source → forêt et clairières → moulin à eau → village et terres ouvertes → estuaire et port → côte maritime**. Les montagnes cadrent les déplacements et servent de décor lointain sans être toutes accessibles.

Présence souhaitée de quelques vestiges d'une civilisation ancienne et d'une magie discrète, mais **sans système de quêtes requis** pour la première version.

## Inclus dans le premier prototype jouable

1. Une **scène technique représentative** avec pente, plateforme de saut, eau de surface et volume profond.
2. Un écureuil avec déplacement, caméra et les six comportements : marche, course, saut, nage, plongée, planage.
3. Une petite boucle de test reproductible permettant de comparer les réglages.
4. Un test réseau minimal de deux joueurs pour éviter une simulation exclusivement locale.

## Hors périmètre du premier prototype

- Mobile, manette et réalité virtuelle.
- Construction et modification du terrain par les joueurs.
- Combat, santé, mort, endurance, inventaire complet, économie.
- PNJ complexes, quêtes, agriculture et pêche jouable (candidats aux itérations suivantes).
- Monde infini, plusieurs régions ou serveurs distribués.
- Multijoueur **à 30 joueurs garanti** : à mesurer après une implémentation effective.

## Critères qualitatifs

- Les états du personnage sont prévisibles ; aucun saut involontaire en entrant dans l'eau.
- Les transitions sol/air/eau sont faciles à comprendre visuellement.
- La carte paraît plus riche que ses dimensions grâce au relief, aux chemins, à l'eau et au cadrage.
- Les assets d'origines différentes doivent pouvoir être harmonisés automatiquement dans une même palette.
- Les systèmes doivent rester testables séparément du rendu et du réseau.

## Gouvernance des choix

Les décisions déjà prises et les hypothèses non confirmées sont référencées dans [DECISIONS.md](DECISIONS.md). Toute décision qui modifie la jouabilité, les formats de carte ou les règles du catalogue d'assets devra y être consignée avant implémentation.
