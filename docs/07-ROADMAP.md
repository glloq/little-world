# 07 — Feuille de route et critères d'acceptation

Statut : **plan de développement proposé**. Aucun jalon technique n'a encore démarré ; la documentation constitue le jalon **D0**.

## Principes

- **Fonctionnement testable avant finition artistique** : scène minimale d'abord.
- Architecture client/serveur pensée dès le départ, sans devoir livrer immédiatement un serveur complet.
- Éditeur et jeu réutilisent les mêmes données et règles ; les assets sont sélectionnés depuis un registre.
- Les tests doivent distinguer : codé, testé automatiquement, testé visuellement, validé multijoueur et effectivement déployé.
- Ne pas promettre 30 joueurs ou de bonnes performances avant un banc de test.

## Jalons

### D0 — Documentation et décisions (ce commit)

**Livrables :** README, spécifications gameplay, monde, éditeur, architecture, assets, feuille de route et registre de décisions.

**Critère :** documents liés, choix validés et hypothèses clairement distingués, aucune ressource présentée comme implémentée.

### M0 — Squelette exécutable du projet

**Livrables :** pnpm workspaces, applications `game`, `editor`, `server` minimales, packages partagés, TypeScript strict, Vite, scripts CI et tests.

**Critères :**
- Démarrage local reproductible depuis README, sans installation implicite.
- Une scène Three.js vide s'affiche ; le serveur démarre ; l'éditeur démarre.
- Types `InputCommand`, `MovementState`, `WorldManifest`, `AssetManifest`, `InteractionDefinition` documentés.
- Tests / lint / build exécutables et vérifiés.

### M1 — Déplacements de l'écureuil volant

**Livrables :** prototype visuel avec proxy d'écureuil, caméra, marche/course/saut, chute/planage, nage/plongée, collisions et volumes d'eau.

**Critères :**
- `Espace` déclenche un seul saut à l'appui ; deuxième appui après relâchement ouvre/replie membrane.
- Le personnage peut rejoindre l'eau, nager, plonger, refaire surface et en sortir.
- Les pentes et les bords de rivière ne provoquent pas de transitions répétées.
- Les six comportements sont rejouables via inputs simulés.
- Une scène de test permet de régler les vitesses sans changer le code.

### M1b — Risque réseau précoce

**Livrables :** serveur simple, deux clients, réplication de position/mode, premier banc de latence.

**Critères :**
- Deux écureuils se voient dans la même scène et conservent les modes de locomotion.
- Les inputs invalides ne peuvent pas fixer arbitrairement la position côté serveur.
- Documentation des écarts de position et des corrections.

**Remarque :** cette étape est volontairement anticipée avant la carte complète.

### M2 — Générateur initial de vallée

**Livrables :** graine déterministe, génération 200 × 600 m, cours d'eau, volume maritime, reliefs et points d'intérêt réservés.

**Critères :**
- Deux générations avec la même graine/version sont identiques.
- Source → moulin → estuaire → mer connectés de façon cohérente.
- Parcours continu au sol et passages de planage/nage intentionnels.
- Une scène représentative contient pente, forêt, eau profonde et littoral.

### M3 — Bibliothèque initiale d'assets

**Livrables :** registre validé, import GLB, miniatures, liste de provenance/licences, modèle d'écureuil qualifié ou proxy documenté.

**Critères :**
- Chaque asset effectivement ajouté possède source/licence et validation technique.
- Plusieurs arbres/roches/bâtiments et accessoires visibles par recherche dans un catalogue simple.
- Le moulin dispose d'une roue séparée et animable.
- Aucun asset non redistribuable n'est ajouté au dépôt public.

### M4 — Éditeur de carte minimal

**Livrables :** sélection, sculpture de terrain, contrôle de rivière, placement/rotation d'assets, chemins, sauvegarde/chargement et mode test.

**Critères :**
- Générer → modifier → sauvegarder → recharger conserve toutes les retouches.
- Changer la graine ne supprime jamais silencieusement les modifications.
- Les assets placés sont référencés par identifiant stable.
- Une carte peut être compilée/publée et chargée par le jeu.

### M5 — Interactions déclaratives

**Livrables :** composant `Interactable`, état, déclencheurs, animations, interface de configuration et validation serveur.

**Critères :**
- Interaction `E` sur la vanne du moulin : état partagé et roue animée localement.
- Contrôle de portée et d'état côté serveur.
- Les interactions inconnues ou invalides empêchent la publication.
- L'éditeur peut créer cette interaction sans script spécifique au moulin.

### M6 — Monde multijoueur jouable

**Livrables :** sessions, apparition et déconnexion, états des joueurs, synchronisation d'interactions, persistance minimale des états partagés.

**Critères :**
- Deux joueurs parcourent toute la carte ; pas de désynchronisation durable des états.
- Tests progressifs à **2, 10 et 30** clients simulés ou réels, avec mesure latence/CPU/traffic.
- Reconnexion et changement de version de carte gérés sans incohérence.
- Déclaration explicite des limites constatées.

### M7 — Finition, ambiance et publication

**Livrables :** palette cohérente, LOD / instancing si nécessaires, éclairage, audio environnemental, port/moulin/village aboutis.

**Critères :**
- Mesures de FPS et temps de chargement sur PC représentatifs.
- Parcours exploration complet de la source à la mer sans bug bloquant.
- Bundle de carte versionné, assets auditables, procédures de déploiement.

## Ordre pratique recommandé

`D0 → M0 → M1 → M1b → M2 → M3 → M4 → M5 → M6 → M7`.

**M2/M3 peuvent avancer parallèlement** : l'outillage d'import d'assets peut être préparé pendant que le générateur de vallée se stabilise. Les parties statiques du monde doivent être disponibles avant l'intégration définitive des interactions.

## Risques à surveiller

| Risque | Parade |
| --- | --- |
| Animations de planage non disponibles pour un écureuil existant | Proxy puis rig original |
| Instabilité sol/eau/air | États testés, seuils d'entrée/sortie distincts, pas fixe |
| Mauvais couplage Three.js / physique / serveur | Contrats et simulation indépendante du rendu |
| Résultats génératifs peu crédibles | Contraintes géographiques et éditeur non destructif |
| Baisse des FPS dans une vallée très végétalisée | Instancing, culling, budgets mesurés |
| Éditeur trop ambitieux | Outils simples d'abord, graphe visuel après |
| Licences d'assets incompatibles avec repo public | CC0 vérifié asset par asset, source et licence enregistrées |
| Multijoueur 30 joueurs non atteint | Benchmarks progressifs, profiler avant d'optimiser |

## Définition de terminé

Pour chaque jalon, enregistrer : commit/PR, instructions d'essai, tests exécutés, captures ou courte vidéo si visuel, résultats mesurés, problèmes connus et statut **implémenté / testé / validé**. Aucun pourcentage d'avancement ne doit être déduit du seul nombre de fichiers créés.
