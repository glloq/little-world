# B1 — Avancement vérifié de la branche Studio V3

Date : 13 novembre 2026. Périmètre : [objectifs B1](26-BETA-B1-OBJECTIFS.md).
Cette branche avance G1 et une première partie de G4. **La bêta B1 n'est pas qualifiée.**

## Incréments conservés

- `7e84e0d` : contrats source V3, migration V1/V2, commandes, stockage auteur, logique déclarative, slots de partie et compilateur statique.
- Incrément suivant : entrée `/studio/`, projets, carte auteur 2D, outils et workflow navigateur. Le jeu V2 et l'ancien éditeur restent accessibles.

## Réalisation et preuves

| Domaine / contrat | Implémenté sur cette branche | Vérification | Suite nécessaire |
| --- | --- | --- | --- |
| FND-01 / B1-13 | Source sectorisée clairsemée, index global, composants, prefabs/overrides, références et migration pure déterministe | Carte réelle `maps/default.json` : conservation des PNJ, dialogues, IDs et retour runtime ; V1 sans ajout de PNJ ; retouches à cheval sur secteurs | Autres archives auteur réelles et ergonomie de diagnostic |
| FND-07 / B1-14 | CommandBus à patches réversibles, historique borné, checkpoints, sélection et contexte communs | Annuler/refaire après rechargement ; transactions multi-secteurs ; restauration de checkpoints | Pinceaux continus et gizmos 3D communs |
| Stockage auteur | Projets IndexedDB indépendants, sources chargées à la demande, sauvegarde atomique avec révision attendue | 15 contrôles Chromium : multi-projets, conflit, rollback, checkpoint, reprise | Récupération guidée depuis checkpoint dans l'interface |
| Studio / B1-12 | Accueil, import V1/V2/V3, carte 2D déplaçable/zoomable, recherche, objets/position/échelle, retouches relief et biotopes, dialogue existant réutilisé | Workflow de production Chromium : création, placement, rechargement, historique, import de référence et dialogue | Viewport 3D local, manipulation directe complète, eau/chemins, création PNJ, éditeurs d'actions/mine/parcelles |
| Archive / B1-14 | ZIP STORE JSON validé, sources sectorisées et bibliothèques, CRC et chemins contrôlés | Export/réimport unitaires ; téléchargement navigateur | Assets du catalogue intégrés à l'application ; fichiers binaires personnalisés et ZIP compressés non pris en charge |
| FND-03 / B1-06/07 | Conditions/actions typées, états logiques indépendants du rendu, templates porte/levier/réaction/collecte/livraison/pêche/énigme | Tests logique, limites, séquences différées, inventaire et références inter-secteurs | Raccord complet au jeu et aux formulaires Studio ; scénario B1 de référence |
| FND-02 / B1-08 | GameSaveV1 et jusqu'à 10 slots locaux par monde, distincts du stockage auteur | Reprise des états persistants et séquences différées, slots corrompus diagnostiqués | UI en jeu, migration de sauvegardes après évolution des contrats ; mine/parcelles non intégrées |
| FND-08 | Préflight strict, catalogue local vérifié, compilation déterministe et incrémentale en ressources JSON par secteur | Tests de hashes, dépendances inter-secteurs, assets et sorties sur disque ; compilation depuis Studio | **Pas de meshes/LOD/navmeshes précalculés** ; raccord au streaming runtime |
| Copie de test / B1-14 | Adaptation temporaire vers le lecteur V2, autre fenêtre, source et historique Studio conservés | Ouverture du test et historique conservé dans Chromium ; anciens tests preview préservés | Lecteur V3 sectorisé et états gameplay jetables ; test V2 limité à 2 km par axe et terrains centrés |
| FND-04/05/09, B1-01/03/09/10/11 | Contrats documentaires conservés | Aucun statut livré ajouté | Horloge/climat, requêtes de collision 3D, budget commun, carte B1, mine, agriculture et audio à développer |

## Vérifications reproductibles

Node 22, dépendances du lockfile :

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run preview -- --host 127.0.0.1 --port 5173 --strictPort
# Dans un autre terminal, sur ce build :
npm run test:browser
npm run test:studio
```

Résultat local de cet incrément : **99 tests unitaires/intégration**, **16 contrôles navigateur existants**, **15 contrôles Studio** ; aucun échec ni erreur JavaScript/HTTP sur ces parcours. Les tests IndexedDB utilisent les modules source via Vite :

```sh
npm run dev -- --host 127.0.0.1 --port 5189 --strictPort
# Autre terminal :
node tests/studio-storage.browser.mjs http://127.0.0.1:5189/little-world/
```

15 contrôles de stockage réussis. Capture de contrôle locale : `/tmp/little-world-browser/studio-v3.png`.
Chromium headless/SwiftShader vérifie les régressions fonctionnelles ; **aucun benchmark GPU intégré ou qualification Firefox effectué pour cet incrément**. Le build avertit toujours de la taille du module Three.js partagé ; la carte 2D charge ses modules spécialisés à la demande.

## Ordre de reprise

1. Stabiliser G1 avec raccord runtime du modèle logique et des slots ; conserver les formats auteur/compilé/partie distincts.
2. Compléter le workflow G4 : viewport 3D local réutilisant les outils existants, eau/chemins, NPC et templates d'interactions ; test complet modifier → annuler/refaire → exporter/réimporter → jouer → revenir.
3. FND-04/05 : horloge/climat communs et requêtes spatiales à plusieurs hauteurs, avant mine et agriculture.
4. G2 : scénario unique de mission/énigme sur région B1, puis G3 : mine, parcelles et audio. Suivre les contrats 19/22/23/24/25 avant ces modifications.
5. G5 : Firefox, sessions longues et mesures sur PC réel ; publier seulement après qualification explicite.

La branche de travail doit être poussée après chaque incrément cohérent. Une branche poussée et testée n'est ni un déploiement Pages ni une bêta publiée.
