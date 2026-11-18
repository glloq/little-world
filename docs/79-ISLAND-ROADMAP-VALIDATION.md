# 79 — Roadmap d'archipel : lots, dépendances, tests et gates

**Statut : ROADMAP / SPECIFIED — aucun lot implémenté au titre de ce document.** La démo actuelle 4 × 3 km reste le cas de non-régression. Références [73](73-ARCHIPEL-VISION-DECISIONS.md) à [78](78-ISLAND-STUDIO-PLAYER-UX.md), [07 — Roadmap](07-ROADMAP.md), [16 — Future Multiplayer](16-FUTURE-MULTIPLAYER.md).

## 0. Priorités de release

**Livraison A : SOLO STATIQUE sur GitHub Pages, SANS multijoueur**. Des îles d'exemple générées et validées à l'avance, cataloguées et chargées à la demande, avec voyage scénarisé. Les mécanismes d'autonomie, de construction et de commerce peuvent être testés **en simulation locale** sans partager l'état entre joueurs.

**Livraison B : progression solo persistante**. Construction simplifiée, travaux/économie locaux, publication d'îles via pipeline Studio/CI, toujours sans serveur.

**Livraison C : multijoueur, uniquement après décision explicite**. Serveur autoritaire, comptes, gouvernance, persistance inter-joueurs, coop et échanges réellement partagés. Aucun code réseau ne devient une dépendance préalable de A/B.

## 1. Lots recommandés

| Lot | Cible | Travail | Critère bloquant |
| --- | --- | --- | --- |
| ISL-0 | P0 | Audit formats actuels, objets Studio, loaders, sauvegardes, assets, chemins | état réel confirmé, baselines et contrats existants identifiés |
| ISL-1 | P0 | IslandManifest + registry statique, IDs/version/anchors, île démo 4 × 3 km + exemples | génération reproductible, validation stricte, aucun contenu invalide publié |
| ISL-2 | P0 | WorldTransition solo, chargement/déchargement, scène bateau | A→B→A, inventaire conservé, pas de fuite GPU/RAM, rollback sûr |
| ISL-3 | P0 | FerrySchedule, niveaux de ports, carte, cloches | niveau 0 un jour/semaine, niveau max permanent, -5 min sans doublon |
| ISL-4 | P1 | IslandSimulation pure et événements d'économie testables localement | rattrapage borné, idempotence, inventaires cohérents |
| ISL-5 | P1 | Construction solo depuis plans/ressources, partage des règles de placement | placements valides, sauvegarde versionnée, aucun deuxième Studio |
| ISL-6 | P1 | Intégration UX Studio/jeu, presets, outils de publication et diagnostics | parcours sans JSON manuel, CI Pages, mise à jour d'exemples sans casse |
| ISL-7 | FUTUR | Contrats coop activés, serveur et gouvernance | décision d'ouverture multi + sécurité/charge/transactions validées |

Les lots ISL-1 à ISL-3 doivent rester démontrables dans un build Vite statique. ISL-4 et ISL-5 sont des simulations locales testables, non une simulation d'archipel partagé.

## 2. Découpage des responsabilités (noms indicatifs)

- **ArchipelagoRegistry/IslandManifest** : index compilé et validation.
- **WorldTransition** : cycle de vie scène et restauration.
- **FerrySchedule/TravelController** : fenêtres, liaisons et embarquement.
- **IslandSimulation** : fonctions pures, événements, rattrapage, stocks.
- **ConstructionCommands/PermissionPolicy** : règles métiers partagées ; adapter l'interface actuelle.
- **IslandSaveAdapter** : mutations locales, versionnage, migration.
- Futur **IslandAuthority** : serveur propriétaire des mutations, transactions et horloge.

Respecter les modules existants (Studio V3, economy, audio, boats, gameplay, save, ResourceBudgetManager). Ne pas dupliquer routes, colliders, comportements de bateau, inventaire ni moteur de transactions.

## 3. Tests fonctionnels automatisés

1. Création de deux îles d'exemple avec seeds/version fixes ; digests stables et valeurs différentes attendues.
2. Statuts de publication et rejet d'îles non validées ; absence d'ancres de débarquement bloque.
3. Transition aller-retour A→B→A conserve progression, inventaire et états ; rafraîchissement/échec de téléchargement rollback.
4. Niveaux ports 0–4 et calendrier sur frontières de semaine ; cloches à l'arrivée et à -5 min de jeu jouées une fois au maximum.
5. Marqueur carte visible uniquement selon état canonique ; menu destination explique les verrouillages.
6. Simulation locale hors écran : replay déterministe, non-négativité, conservation stocks, livraisons et production idempotentes, délai borné.
7. Placement de bâtiment : même solveur que Studio, portes/collisions/nav stables ; sauvegarde et migration.
8. Tests de permissions dans moteur pur (sans serveur), et tests de commandes concurrentes pour la future version autoritaire.
9. Régressions : démarrage de l'île 4 × 3 km, déplacement, planage, eau, carte, audio, Studio, import/export.
10. Perf : CPU/JS heap/VRAM proxy, objets Three.js non libérés, temps transition et téléchargement ; mesures navigateur et GPU intégré avant qualification.

## 4. Politique de statuts

Sur chaque tâche : **DECIDED / SPECIFIED / IMPLEMENTED / TESTED / QUALIFIED / RELEASED**, nom de branche/PR, commande de test et limites. Une capture de simulation ou un test SwiftShader ne qualifie pas les FPS sur GPU réel. Aucun libellé « multijoueur disponible » avant serveur, authentification et tests de concurrence.

## 5. Gates de publication

- **G0 Documentation** : décisions sans contradiction, formats versionnés, limites solo explicites dans README/AGENTS/docs 12–16.
- **G1 Catalogue** : au moins deux îles compilées, validées et localisables ; île référence 4 × 3 inchangée.
- **G2 Voyage** : fallback et mémoire ; aucune route vers monde invalide.
- **G3 Desserte** : horloges/événements cohérents carte/cloches, au moins niveau 0 et maximum.
- **G4 Autonomie** : modèle pur et reprises déterministes sans réseau ; informer que le monde n'évolue pas activement hors client.
- **G5 Construction** : intégration avec assets/placement/économie ; sauvegarde solo fiable.
- **G6 Multi (futur)** : autorité serveur, transactions idempotentes, permissions, charge, restauration, protection anti-abus et compatibilité des clients ; **bloqué jusqu'à demande expresse**.

## 6. Exclusions actuelles

Pas de serveur Node de jeu, WebSocket, comptes, matchmaking, base partagée, vote réseau effectif, îles générées par visiteurs sur GitHub Pages, routes commerciales avec transaction entre joueurs. Le pilote solo doit rester publiable comme fichiers statiques à chaque jalon.

## 7. Livrables attendus par lot

Code TypeScript + tests unitaires/Browser et rapport de mesures ; docs API et décisions mises à jour ; preuves de compatibilité des sauvegardes ; démo statique sur branche avant merge dans main.

## Suivi de la première branche de code (18/11/2026)

- **ISL-1 partiel** : catalogue statique `public/archipelago/catalog.json` avec **une seule île réellement compilée**, lecteur/validateur `src/archipelago/registry.ts` ; une deuxième île de référence reste **à générer**.
- **ISL-3 partiel** : calendrier déterministe `ferry-schedule.ts`, avertissement -5 minutes de jeu, navette low-poly locale, marqueur sur la carte et deux signaux procéduraux ; vérifications/unitaires à confirmer par CI.
- **ISL-2 non livré** : cinématique DOM de **prévisualisation uniquement**, ne remplace pas encore le monde actif. Pas de transfert d'inventaire, snapshots inter-îles ou navigation vers un deuxième monde tant que les contrats de sauvegarde ne sont pas validés.
- **Invariants inchangés** : jeu statique GitHub Pages, pas de backend, pas de multijoueur, île principale et bateaux pilotables inchangés. Les statuts ci-dessus ne sont pas des preuves de qualification navigateur.

## ISL-2 — implémentation en cours sur feat/archipelago-real-island-travel (18/11/2026)

- Une deuxième île **statique et compilée** est promue depuis la scène auteur V3 `production-reference` existante : chemin de publication `dist/archipelago/worlds/forest-valley`, catalogue `public/archipelago/catalog.json`.
- Le départ valide les descripteurs du monde cible avant d'écrire une sauvegarde `slot-ferry-auto` isolée par `worldId`, un ticket de transfert temporaire `sessionStorage`, puis lance la cinématique. Le changement de document décharge entièrement le monde précédent.
- À l'arrivée : overlay de traversée durant le boot, restauration d'un état de monde local autonome, du sac portable, de la progression de propulsion et de l'horloge de jeu ; un objet propre à l'autre monde reste en **escrow**, pas effacé.
- En cas d'erreur de compilation/chargement : annulation du ticket et retour à l'île source. Les commandes du mode Studio, bêta et tests de cartes ne changent pas.
- **À qualifier par CI et navigateur réel** : trajet A→B→A, récupération du monde d'origine, absence de doublons, stabilité des sauvegardes et budget RAM. Reste une architecture de **rechargement complet de page**, avant toute future transition intra-scène.
- **Aucun** système de compte, WebSocket, serveur persistant ou multijoueur n'a été ajouté. Le snapshot forestier est une île de référence **statique**, non une île générée à la demande du visiteur.

## Extension ECO — fabrication artisanale et marchés inter-îles (18/11/2026)

Les lots **ECO-0 à ECO-10** sont documentés dans [82 — Roadmap économique](82-ECONOMY-PRODUCTION-ROADMAP.md), après [80 — audit existant](80-ECONOMY-TRADE-CRAFT-AUDIT.md) et [81 — contrats](81-ECONOMY-PRODUCTION-CONTRACTS.md). Ils complètent **ISL-2 (passage avec sac portable)** et **ISL-4 (simulation autonome)** ; le **ECO-1** de persistance de tout objet inter-îles et le **ECO-2** de sûreté des ventes sont bloquants avant commerces avancés. Première cible : **deux îles statiques déjà publiées** et recettes/ateliers locaux ; troisième île et Studio complet ensuite. Aucun serveur/multijoueur n'est introduit.
