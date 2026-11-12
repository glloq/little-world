# Little World

**Little World** est un projet de jeu **solo 3D**, jouable dans le navigateur sur **PC**, avec Three.js. Le joueur incarne un **écureuil volant** et explore une petite vallée montagneuse allant d'une source à un port maritime.

**Objectif V1 : application 100 % statique sur GitHub Pages, sans serveur ni compte utilisateur.**

> **État : documentation de conception.** Aucun jeu, éditeur, asset 3D ou déploiement GitHub Pages n'est encore opérationnel.

## Vision validée

- Carte **200 × 600 mètres**, vallée montagneuse avec rivière, moulin à eau, village et petit port côtier.
- Personnage **écureuil volant animal stylisé**, vue troisième personne, caméra souris.
- **Marche, course, saut, nage, plongée et planage** : saut au clavier par `Espace`, réappui pour ouvrir/replier la membrane en l'air.
- **PC uniquement**, clavier/souris, sans endurance, avec oxygène de plongée généreux, sans dégâts ni mort.
- D'abord **exploration et tests**, sans progression imposée, quêtes, combat ou construction par les joueurs.
- Génération procédurale déterministe d'un terrain **fixe côté joueur**, puis retouches dans un éditeur visuel.
- Ambiance d'animation traditionnelle originale : **low-poly organique**, éclairage doux, formes simples.
- **Assets GLB versionnés dans le dépôt**, catalogués, enrichis progressivement ; uniquement ressources dont la redistribution est autorisée (priorité CC0/originales).

## Cible de publication

- Jeu : `https://glloq.github.io/little-world/` (**URL prévue, non encore déployée**).
- Éditeur : page statique du même site, avec accès séparé (itinéraire exact à décider lors du bootstrap).
- **GitHub Actions** : tests, build Vite, publication sur GitHub Pages après validation.
- **Éditeur sans backend** : sauvegarde locale dans le navigateur (IndexedDB), import/export JSON pour conserver ou partager une carte ; pas de commit GitHub depuis le navigateur.
- Carte et ressources de démonstration intégrées au build ; aucune API ou connexion au serveur nécessaire au jeu.

## Hors V1

**Multijoueur, Colyseus, serveur Node.js permanent, base PostgreSQL, authentification, état partagé et sessions** sont **reportés**. L'architecture garde des modules séparés pour les ajouter éventuellement plus tard, sans imposer de protocole réseau maintenant.

Les éventuels systèmes de pêche, PNJ, quêtes, personnalisation avancée, météo complexe et mobile sont également différés.

## Documentation

| Fichier | Sujet |
| --- | --- |
| [Vision](docs/01-VISION.md) | Périmètre et objectifs solo |
| [Gameplay](docs/02-GAMEPLAY.md) | Écureuil, contrôles, locomotion |
| [Monde](docs/03-WORLD-GENERATION.md) | Génération, vallée, eau, géométrie |
| [Éditeur](docs/04-EDITOR-INTERACTIONS.md) | Édition, interactions locales, sauvegarde |
| [Architecture](docs/05-TECHNICAL-ARCHITECTURE.md) | Three.js, Rapier, TypeScript, organisation |
| [Assets](docs/06-ASSET-PIPELINE.md) | Licence, import, catalogue GLB |
| [Feuille de route](docs/07-ROADMAP.md) | Jalons testables solo/Pages |
| [GitHub Pages](docs/08-GITHUB-PAGES.md) | Hébergement statique, build et contraintes |
| [Décisions](docs/DECISIONS.md) | Validées, proposées, ouvertes, différées |
| [Catalogue](assets/README.md) | Futurs assets du dépôt |

## Ordre de développement

`D0 Documentation → M0 squelette Three.js + déploiement Pages → M1 déplacements → M2 vallée → M3 catalogue d'assets → M4 éditeur → M5 interactions → M6 optimisation/démonstration`.

Ne pas confondre **documenté**, **codé**, **testé localement**, **publié** et **validé dans le navigateur**.

## Licence

Aucune licence générale du **code** n'a encore été choisie. La publication du dépôt ne remplace pas la vérification des droits de redistribution de chaque asset.
