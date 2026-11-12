# Registre de décisions — Little World

**Mise à jour : 12 novembre 2026 — nouvelle cible V1 solo sur GitHub Pages.**

États :
- **VALIDÉ** : choisi par l'utilisateur / confirmé précédemment.
- **PROPOSÉ** : valeur technique modifiable après tests.
- **OUVERT** : à préciser avant implémentation de la fonction.
- **DIFFÉRÉ** : exclu de la V1, sans obligation de conception immédiate.

## VALIDÉ — V1

| ID | Décision |
| --- | --- |
| D-001 | Rendu **Three.js / WebGL** |
| D-002 | Carte jouable **200 × 600 m** dans une vallée montagneuse |
| D-003 | Personnage **écureuil volant animal stylisé**, surtout quadrupède |
| D-004 | Vue troisième personne, caméra contrôlée à la souris |
| D-005 | **PC uniquement**, clavier/souris |
| D-006 | Marche, course, saut, nage, plongée, planage |
| D-007 | **Pas d'endurance** |
| D-008 | `Espace` au sol pour sauter, déclenchement volontaire de la membrane en l'air |
| D-009 | Oxygène de plongée à **grande limite** |
| D-010 | Pas de dégâts ni mort en V1 |
| D-011 | Exploration / expérimentation avant quêtes ou activités complexes |
| D-012 | Les joueurs **ne modifient pas la carte** |
| D-013 | Génération automatique + **éditeur visuel** de carte, objets et interactions |
| D-014 | Assets disponibles **dans le dépôt**, ajout progressif |
| D-015 | Direction artistique **low-poly organique optimisée**, chaleureuse et originale |
| D-016 | **Première version solo exclusivement** ; multijoueur reporté |
| D-017 | Hébergement visé : **GitHub Pages**, frontend statique |
| D-018 | **Aucun serveur de jeu / backend / API nécessaire à la V1** |
| D-019 | Bibliothèque d'assets à redistribution autorisée, préférence **CC0 / originaux** |
| D-020 | Bâtiments complets et modulaires dans l'éditeur |
| D-021 | Carte : source, forêt, rivière, moulin à eau, village, port près de la mer |
| D-022 | Interactions configurables dans l'éditeur, sans code spécifique pour chaque objet |
| D-023 | Possibilité de sauvegarder et d'exporter les modifications localement |
| D-024 | Cycle jour/nuit/météo, quêtes et activités avancées non prioritaires |

## PROPOSÉ — technique

| ID | Choix | Réévaluation |
| --- | --- | --- |
| P-001 | TypeScript strict + Vite + pnpm | M0 |
| P-002 | Rapier JS/WASM pour collisions | M1 |
| P-003 | Jeu et éditeur comme **2 entrées web statiques** partageant des modules | M0 |
| P-004 | Publication GitHub Actions, site `/little-world/` | M0 |
| P-005 | `base: '/little-world/'` en prod Vite, assets base-aware | M0 |
| P-006 | Stockage **IndexedDB + import/export JSON** pour l'éditeur | M4 |
| P-007 | Carte source structurée, génération déterministe, overrides, carte compilée | M2/M4 |
| P-008 | GLB, unités mètres, Y vertical, pivots documentés | M3 |
| P-009 | `ZQSD/WASD` mouvement, `Shift` course, `Ctrl` descente, `E` interagir | M1 |
| P-010 | `Espace` front au sol ; nouvel appui après relâchement pour toggle membrane | M1 |
| P-011 | Pas de persistance de progression joueur nécessaire en V1 | M1 |
| P-012 | États d'interactions locaux, composants déclaratifs sans JS externe | M5 |
| P-013 | Terrain heightfield + meshes séparés pour surplombs | M2 |
| P-014 | Instancing végétation, décors éloignés simplifiés | Profilage M6 |
| P-015 | Pas d'escalade complexe, saut simple | M1 |
| P-016 | Carte par défaut compilée et publiée ; éditeur **ne commit pas directement** | M4 |
| P-017 | Pas de routage SPA historique exigeant un fallback serveur | M0 |
| P-018 | Pas de `apps/server` ni de packages réseau en V1 | M0 |

## OUVERT — valeurs, sans bloquer D0

| ID | Point à décider | Échéance |
| --- | --- | --- |
| O-001 | Licence **du code** public | Avant contributions externes |
| O-002 | Proportions finales, rig et animations originales de l'écureuil | M1/M3 |
| O-003 | Vitesses et coefficients du planage, impulsion de saut, collision | M1 |
| O-004 | Durée exacte d'oxygène et réaction non punitive à zéro | M1 |
| O-005 | Altitudes, terrain praticable et bornes visuelles de la carte | M2 |
| O-006 | Résolution du terrain et distances de rendu | M2 |
| O-007 | Sensibilité caméra et détails de capture de la souris | M1 |
| O-008 | Organisation finale des points d'entrée jeu/éditeur sur Pages | M0 |
| O-009 | Sélection des assets exacts et droits de redistribution | M3 |
| O-010 | Scène de démonstration initiale / carte source à publier | M2 |
| O-011 | Gestion des versions/migrations de cartes JSON | M4 |
| O-012 | Plage d'accès de l'écureuil à la mer | M2 |

## DIFFÉRÉ — aucune livraison V1

**Multijoueur** (objectif historique 10–30 joueurs), Colyseus, serveur Node.js permanent, synchronisation, comptes, chat, PostgreSQL, persistance partagée, validation d'interactions côté serveur, prédiction réseau, tests de charge multi-joueurs.

Également différés : mobile, manette, PNJ complexes, quêtes, pêche jouable, agriculture, commerce, combat, changements de terrain par les joueurs, météo avancée, logique visuelle par nœuds.

## Règles de suivi

1. Toute nouvelle décision métier modifie ce registre et les spécifications impactées.
2. Distinguer **confirmé**, **proposé**, **testé**, **livré**.
3. Ne pas écrire une infrastructure « au cas où » si elle complique la V1 statique.
4. L'architecture doit rester modulaire, mais la modularité n'implique pas la présence d'un serveur.
