# Little World

**Little World** est un prototype de jeu 3D multijoueur dans le navigateur, construit autour d'un **écureuil volant** explorant une petite vallée montagneuse, de sa source jusqu'à un port en bord de mer.

> **État : conception documentaire.** Aucun moteur, scène, asset ou gameplay n'est encore implémenté. Les dimensions, ambitions et composants cités sont des décisions ou des objectifs, pas des fonctionnalités disponibles.

## Principes validés

- **Carte jouable : 200 × 600 m**, relief montagneux, cours d'eau, moulin à eau, village et petit port côtier.
- **Personnage :** écureuil volant animal stylisé, principalement quadrupède ; caméra à la troisième personne contrôlée à la souris.
- **Déplacements :** marche, course, saut, nage, plongée et planage déclenché par le joueur.
- **Plateforme initiale :** PC, navigateur web, clavier et souris.
- **Gameplay initial :** exploration et essais techniques ; pas d'endurance, de dégâts ni de mort ; oxygène de plongée généreux.
- **Direction artistique :** low-poly organique, formes douces, ambiance chaleureuse d'animation traditionnelle, identité originale.
- **Monde :** généré de façon déterministe puis retouché par un éditeur. **Aucune modification de la carte par les joueurs.**
- **Multijoueur cible :** 10 à 30 joueurs dans une instance, à confirmer par les tests.
- **Assets :** bibliothèque locale au dépôt, enrichie progressivement ; préférence CC0 et créations originales.

## Documentation

| Document | Contenu |
| --- | --- |
| [Vision et périmètre](docs/01-VISION.md) | Identité, objectifs, exclusions, critères du prototype |
| [Personnage et déplacements](docs/02-GAMEPLAY.md) | Contrôles, états, transitions, caméra |
| [Monde et génération](docs/03-WORLD-GENERATION.md) | Vallée, génération, relief, rivière, mer, performances |
| [Éditeur et interactions](docs/04-EDITOR-INTERACTIONS.md) | Outils d'édition, prefabs, actions, publication |
| [Architecture technique](docs/05-TECHNICAL-ARCHITECTURE.md) | Monorepo, simulation, réseau, formats, tests |
| [Bibliothèque d'assets](docs/06-ASSET-PIPELINE.md) | Formats, provenance, licence, catalogue, import |
| [Feuille de route](docs/07-ROADMAP.md) | Jalons, vérifications, priorités |
| [Registre de décisions](docs/DECISIONS.md) | Décisions fermes, propositions, points à valider |
| [Répertoire assets](assets/README.md) | Convention d'organisation des futurs fichiers |

## Règle de développement

Avancer par **jalons jouables et vérifiables**. Le premier prototype doit permettre de tester les transitions de déplacement sur une petite scène représentative et de voir deux écureuils connectés, **avant** d'investir dans un monde complet.

Les éléments non décidés sont signalés explicitement dans `docs/DECISIONS.md`.

## Licence

**Aucune licence de code n'a encore été choisie.** Le caractère public du dépôt n'autorise pas, à lui seul, la réutilisation du code. Chaque asset devra posséder une provenance et une licence explicites avant d'être commité.
