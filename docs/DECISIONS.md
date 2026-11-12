# Registre des décisions — Little World

Dernière consolidation documentaire : **12 novembre 2026**.

Ce registre distingue :
- **VALIDÉ** : explicitement choisi par l'utilisateur ou sa confirmation des recommandations précédentes.
- **PROPOSÉ** : défaut recommandé, révisable après prototypes.
- **OUVERT** : information non décidée qui doit être réglée avant la fonctionnalité concernée.
- **DIFFÉRÉ** : hors prototype initial, peut être préparé dans l'architecture.

## Décisions VALIDÉES

| ID | Décision | Précision |
| --- | --- | --- |
| D-001 | Moteur de rendu **Three.js** | Application web |
| D-002 | Carte **200 × 600 m** | Vallée montagneuse, cours d'eau, moulin, port près de la mer |
| D-003 | Joueur = **écureuil volant** | Animal stylisé, pas humanoïde |
| D-004 | Vue à la **troisième personne**, caméra souris | PC |
| D-005 | Plateforme initiale **PC uniquement** | Pas de mobile au début |
| D-006 | Déplacements : marche, course, nage, plongée, planage + saut | Tous requis pour les tests |
| D-007 | **Pas d'endurance** au début | Les modes restent disponibles |
| D-008 | `Espace` = saut, puis action de planage en l'air | Nécessité d'éviter l'appui continu involontaire |
| D-009 | Plongée avec limite d'oxygène **généreuse** | Durée exacte non fixée |
| D-010 | **Pas de dégâts ni mort** pour la V1 | Conséquence d'oxygène vide à décider |
| D-011 | **Exploration et tests** au départ | Pas de quêtes nécessaires |
| D-012 | **Aucune modification de carte par les joueurs** | Éditeur réservé à la création |
| D-013 | Génération largement automatique + **éditeur** | Retouches possibles et interactions configurables |
| D-014 | **Assets dans le repo**, ajout progressif | Catalogue et traçabilité |
| D-015 | Art direction **low-poly organique, optimisée** | Ambiance d'animation japonaise originale |
| D-016 | Architecture multijoueur prévue | Objectif 10–30 joueurs |
| D-017 | Préférence assets **CC0 / originaux** | Licence exacte à vérifier avant distribution |
| D-018 | Bâtiments préfabriqués **et** modules assemblables | Début avec formes simples |
| D-019 | Éditeur avec **mode test**, sauvegarde et versions | Outils simples avant logique nodale |
| D-020 | Monde avec source, vallée, rivière, forêt, moulin, petit village et port | Répartition exacte ajustable |
| D-021 | Bibliothèque d'interactions prédéfinies | Interactions courantes d'abord |

## PROPOSITIONS par défaut

| ID | Proposition | Quand la revoir |
| --- | --- | --- |
| P-001 | TypeScript, Vite et pnpm workspaces | Spike M0 |
| P-002 | Rapier pour collisions | Test M1 |
| P-003 | Node.js + Colyseus, serveur autoritaire | M1b |
| P-004 | PostgreSQL pour persistance plus tard | M6 |
| P-005 | GLB comme format runtime, `.blend` si utile et autorisé | M3 |
| P-006 | `ZQSD/WASD` déplacement, `Shift` course, `Ctrl` plongée, `E` interaction | Test de maniabilité M1 |
| P-007 | `Espace` = saut, relâchement puis second appui = toggle membrane | Prototype M1 |
| P-008 | Marche principalement quadrupède et membrane animée, sans tissu physique | Modèle original M1/M3 |
| P-009 | Taille réelle en mètres, axe Y vertical, coordonnées de carte immuables | M0/M3 |
| P-010 | River spline, heightfield + meshes séparés pour surplombs | M2 |
| P-011 | Couche de base procédurale, overrides humains, carte compilée | M2/M4 |
| P-012 | Règles d'interactions déclaratives sans JS libre | M5 |
| P-013 | Décors lointains simplifiés, instancing végétation | Profilage M7 |
| P-014 | Monde partagé en instances, sessions épinglées à une version | M6 |
| P-015 | Prototype réseau 2 joueurs avant carte finale | M1b |
| P-016 | Palette de bâtiments bois/pierre et végétation stylisée | Direction artistique M3 |
| P-017 | Pas d'escalade, saut simple | Revue gameplay après M1 |
| P-018 | Une seule carte au lancement ; plusieurs cartes possibles plus tard | Après M6 |

## Questions OUVERTES (n'empêchent pas la documentation)

| ID | Question | Critère ou échéance |
| --- | --- | --- |
| O-001 | Licence du **code source** du dépôt public ? | Avant contributions / distribution |
| O-002 | Format et proportions définitives de l'écureuil ; rig d'animation ? | Préparation asset personnage M1/M3 |
| O-003 | Vitesses, hauteur de saut, ratio de planage, rayon collision ? | Calibration M1 |
| O-004 | Durée d'oxygène et conduite à zéro sans mort ? | M1 |
| O-005 | Limites exactes du terrain praticable et hauteurs de vallée ? | M2 |
| O-006 | Résolution du terrain et distance de rendu ? | Bench M2 |
| O-007 | Mode capture de souris, sensibilité et réglages caméra ? | M1 |
| O-008 | Hôte de déploiement / base de données / stockage des fichiers compilés ? | M6 |
| O-009 | Asset sources exactes, licences par fichier, choix des modèles à inclure ? | M3 |
| O-010 | Comptes utilisateurs / mode invité et persistance joueurs ? | M6 |
| O-011 | Le port permet-il la nage en mer jusqu'où ? | M2 |
| O-012 | Système de versions et migration de cartes publiées ? | M4/M6 |

## Fonctionnalités DIFFÉRÉES

Pêche jouable, activités artisanales, PNJ/dialogues, quêtes, agriculture, combat éventuel, cycle jour/nuit complet, météo avancée, inventaire profond, personnalisation extensive, support mobile/manette, outils de logique visuelle par nœuds.

Elles doivent rester **possibles** sans être implémentées dans le premier prototype.

## Règles de modification des décisions

1. Modifier l'entrée et indiquer l'impact sur les documents associés.
2. Documenter l'essai ou la raison technique si une proposition devient validée.
3. Ne pas transformer un paramètre **PROPOSÉ** en contrainte obligatoire sans vérification.
4. Ne pas déclarer une fonctionnalité comme livrée sur la seule base d'une spécification.
