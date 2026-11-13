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

## Complément G1/G2 : boucle interactive raccordée

Incréments postérieurs au premier atelier :

- `fe6c046` : validation atomique des segments d'actions, absence de récompense partielle sur inventaire plein, persistance des flags de dialogue (anciens slots V1 acceptés avec flags vides).
- Le scénario `maps/beta.project.json`, généré de façon déterministe par `npm run generate:beta`, est réimportable dans Studio. Entrée jeu `?beta=1` et bouton sur l'accueil ; source 1 000 × 1 000 m, quatre PNJ, collecte/livraison et levier + mécanisme. **Ce contenu n'est pas la carte B1 complète ni une qualification de sa densité/performance.**
- Nouveau module Studio **Interactions** : templates collecte/livraison/bascule/levier, références validées, même CommandBus. Modifier un template conserve l'identité de son interaction principale et les liens existants.
- Le jeu consomme les données logiques sans importer le stockage auteur. Les choix de dialogue exécutent les conditions/actions V3 dans le panneau existant.
- Sac, trois slots visibles par monde (stockage jusqu'à dix), sauvegarde/chargement et import/export JSON. Inventaire, progression, états et position sont restaurés. Le bateau, les états de mine/parcelle et l'environnement ne sont pas encore inclus.
- La copie de test utilise un snapshot identifié et des slots **sessionStorage isolés par snapshot** ; les vrais slots restent en localStorage. Chaque nouveau snapshot démarre sans reprendre un ancien état de test. La source, la sélection et l'historique restent dans Studio.
- Retour visuel des états : objet collecté masqué, ouverture représentée par rotation. **Pas de collision mobile de porte**, d'animation/son/effet générique complet ni de navigation avancée ajoutés ici. Le lecteur utilise encore l'adaptateur V2 pour la représentation, limité à 2 km par axe ; le modèle logique V3 est séparé.

Preuves : **106 tests unitaires/intégration** ; `npm run test:gameplay` ajoute **10 contrôles Chromium** couvrant collecte → dialogue/mission → livraison → mécanisme → sauvegarde/reload → absence de duplication → template Studio → sauvegarde temporaire sans écrasement des vrais slots → historique auteur conservé. Les 16 contrôles historiques et 15 contrôles Studio restent requis. `npm run generate:beta` est suivi d'un contrôle de dérive des fichiers générés dans la CI.

**Ordre actualisé :** conserver ces boucles fonctionnelles ; poursuivre FND-04 (horloge/climat communs), puis le viewport Studio local et FND-05 (requêtes 3D) avant mine/agriculture. G1/G2/G4 restent partiels tant que leurs autres critères ne sont pas démontrés.

## Complément FND-04 / B1-03 : horloge et climat de base

- Une `WorldClock` monotone alimentée par les pas de simulation remplace l'accumulation indépendante de temps dans le moteur d'actions. Les slots restaurent ce même temps ; les contrôles pause/×1/×60/×240 sont explicites et ne changent pas la cadence physique du joueur. La vitesse de test revient à ×1 au chargement d'une partie.
- Environnement auteur optionnel/versionné dans V3, éditeur Studio, propagation au snapshot jouable et au manifeste compilé. Les projets V3 existants restent lisibles avec un environnement par défaut déterministe.
- `ClimateHistory` v1 résout une région et un cycle clair/couvert/pluie depuis seed + version + temps. Les agrégats sur un intervalle couvrent les météos réellement traversées : chaleur au-dessus d'une base paramétrable, pluie et évaporation estimée. Une requête longue utilise des cycles et au plus 16 tranches ; pas de journal par frame, ni météo actuelle multipliée par toute la durée. Les paramètres sont un modèle stylisé, pas une simulation agronomique qualifiée.
- Rendu : lumière et fond jour/nuit, ciel couvert, une unique batch GPU de pluie locale (192 particules nominales, 96 au niveau économique, 0 au niveau de secours). Le niveau vient du `PresentationBudget` existant ; aucun nouveau contrôleur adaptatif. Le brouillard fixe de masquage est retiré. Pas de nouvelles shadow maps.
- Tests : horloges 20/30/60 Hz, pause/accélération/reprise ; agrégats continus/différés et partitions d'intervalles équivalents ; compilation de l'environnement ; 5 contrôles navigateur de l'horloge, de l'accélération, du retour à l'heure du slot et des compteurs de météo. Capture locale `/tmp/little-world-browser/beta-night.png`.

**Limites conservées :** pas encore de saisons/cultures, régions climatiques multiples, neige/gel, ciel étoilé/lunes, ombres dynamiques ou aperçu météorologique indépendant. L'histoire climatique est le modèle périodique immuable v1 ; aucun forçage météo historique n'est proposé. Évolution de seed/version d'une carte : avertissement de version au chargement de partie, puis requalification nécessaire avant d'y raccorder les parcelles. Le fond change de couleur ; le shader de ciel panoramique complet reste à développer. Aucune capacité GPU intégrée n'est démontrée par SwiftShader.

## Complément Studio G4 : viewport 3D local

- Nouvelle entrée **Vue 3D locale**, chargée à la demande. Même projet/sélection/CommandBus que la carte ; retour dans le module actif après réouverture.
- Réutilisation de `WorldView`, du terrain, des assets, des rigs PNJ et des contrôles Orbit/Transform existants. Chargement des sources voisines et de leurs dépendances canoniques ; géométries locales, aucun chargement de toutes les géométries du monde.
- Placement par clic, sélection en scène, gizmo de translation horizontale et inspecteur (transformation V3 complète pour les objets). Un déplacement utilise `putEntity` avec ancien/nouveau propriétaire dans la même transaction.
- Pinceaux 3D relief/forêt/prairie : collecte de points espacés pendant le glissement, au plus 64 retouches, **une transaction à la fin du geste**. Prévisualisation du rayon, puis mise à jour du terrain/écologie des secteurs affectés ; annulation/refaire communs. Le relief n'est pas recalculé à chaque événement de pointeur.
- Rendu à la demande après stabilisation des secteurs ; compteur de rendus immobile au repos. Retrait des contrôles, abonnements, ressources propres et contexte WebGL à la fermeture du module. Les chargements tardifs ne remplacent pas une autre vue après navigation.
- Correction de la recherche : filtrage pendant la saisie, sans remplacer le bouton au moment où le clic lui transfère le focus.

**10 contrôles Chromium** : sélection globale → 3D, repos sans rendu, placement direct, déplacement via inspecteur et annulation, **glissement réel du gizmo identifié dans la capture** et annulation en une opération, glissement du pinceau en une opération, retour à la carte sans perdre la sélection, absence d'erreurs. Capture locale : `/tmp/little-world-browser/studio-local-3d.png`.

Limites : objets et PNJ du secteur local, translation horizontale ; caméra réinitialisée autour du contexte conservé à l'ouverture, orientation orbitale détaillée non persistée. Les sources déjà hydratées restent en cache de session ; l'éviction du cache auteur reste à borner. Les traces eau/chemins ne sont pas encore modifiables dans ce module. Les contrôles matériels/ergonomiques restent nécessaires ; le test navigateur ne qualifie pas un budget GPU.
