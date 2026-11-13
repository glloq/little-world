# B1 — Avancement vérifié de la branche Studio V3

Date : 13 novembre 2026. Périmètre : [objectifs B1](26-BETA-B1-OBJECTIFS.md).
Les incréments jusqu’à `a7a6f88` sont inclus dans `main`. **La bêta B1 n’est pas qualifiée.** **Lot 1 île (branche `claude/bold-tesla-b0pe7k`)** : générateur île/volcan V3, lecteur de monde compilé commun jeu/copie de test, horizon géographique + océan, priorité caméra et quotas — détail, mesures et limites dans [31 — Lot 1](31-LOT1-ILE-RENDU-CONTINU.md). Le nouvel [audit 30 — île 3 × 8 km](30-AUDIT-BETA-ILE-3X8-STUDIO-RENDU.md) consolide les manques actuels, les blocages de taille/visibilité et le plan Studio/rendu ; les décomptes plus bas correspondent aux incréments historiques.

## Incréments conservés

- `7e84e0d` : contrats source V3, migration V1/V2, commandes, stockage auteur, logique déclarative, slots de partie et compilateur statique.
- `4c69f19` : première interface Studio.
- `fe6c046`, `6092334`, `c914a8f`, `6929a3d`, `a248fef`, `5682345` : atomicité, boucle de jeu/sauvegardes, environnement, viewport 3D, collisions et personnages. Le jeu V2 et l'ancien éditeur restent accessibles.

## Réalisation et preuves

| Domaine / contrat | Implémenté sur cette branche | Vérification | Suite nécessaire |
| --- | --- | --- | --- |
| FND-01 / B1-13 | Source sectorisée clairsemée, index global, composants, prefabs/overrides, références et migration pure déterministe | Carte réelle `maps/default.json` : conservation des PNJ, dialogues, IDs et retour runtime ; V1 sans ajout de PNJ ; retouches à cheval sur secteurs | Autres archives auteur réelles et ergonomie de diagnostic |
| FND-07 / B1-14 | CommandBus à patches réversibles, historique borné, checkpoints, sélection et contexte communs | Annuler/refaire après rechargement ; transactions multi-secteurs ; restauration de checkpoints | Édition de tracés et caméra détaillée persistée |
| Stockage auteur | Projets IndexedDB indépendants, sources chargées à la demande, sauvegarde atomique avec révision attendue | 20 contrôles Chromium : multi-projets, conflit, rollback, checkpoint, reprise, lecture cohérente et migration IndexedDB | Récupération guidée depuis checkpoint dans l'interface |
| Studio / B1-12 | Accueil, import V1/V2/V3, carte 2D déplaçable/zoomable, recherche, objets/position/échelle, retouches relief et biotopes, viewport 3D/gizmos/pinceaux, personnages, dialogues, interactions, environnement et profils d’eau | Workflow de production Chromium : création, placement, rechargement, historique, import de référence et dialogue | Réseau hydrographique complet/chemins, patrouilles dessinées, mine/parcelles et formulaires avancés de conditions/actions |
| Archive / B1-14 | ZIP STORE JSON validé, sources sectorisées et bibliothèques, CRC et chemins contrôlés | Export/réimport unitaires ; téléchargement navigateur | Assets du catalogue intégrés à l'application ; fichiers binaires personnalisés et ZIP compressés non pris en charge |
| FND-03 / B1-06/07 | Conditions/actions typées, états logiques indépendants du rendu, templates porte/levier/réaction/collecte/livraison/pêche/énigme | Tests logique, limites, séquences différées, inventaire et références inter-secteurs | Effets de présentation complets (audio/animation), activités B1 spécialisées et scénario de qualification complet |
| FND-02 / B1-08 | GameSaveV1 et jusqu'à 10 slots locaux par monde, distincts du stockage auteur | Reprise des états persistants et séquences différées, slots corrompus diagnostiqués | État du bateau/position des PNJ, mine/parcelles et migrations après évolution des contrats |
| FND-08 | Préflight strict, catalogue local vérifié, compilation déterministe et incrémentale en ressources JSON par secteur | Tests de hashes, dépendances inter-secteurs, assets et sorties sur disque ; compilation depuis Studio | **Pas de meshes/LOD/navmeshes précalculés** ; raccord au streaming runtime |
| Copie de test / B1-14 | Snapshot V3 **compilé** stocké en IndexedDB et lu par le même lecteur que le monde publié (lot 1), slots temporaires isolés, autre fenêtre, source et historique conservés | Parcours Chromium studio/gameplay/eau/île sur build de production | Streaming des paquets auteur par secteur ; limites centrées ; transformations complètes (S-06) |
| FND-04/05, B1-03 | Horloge, climat périodique rejouable, jour/nuit et pluie bornée ; requêtes XYZ, sols/plafonds et colliders logiques | Agrégats continus/différés, temps/slots, barrière fermée/ouverte, trois étages en tests | Ciel avancé, connexions souterraines, climat agricole qualifié et rendu des mines |
| FND-09, B1-01/09/10/11 | Budget de présentation existant réutilisé, région source 1 km² de démonstration | Tests fonctionnels ; aucune qualification matérielle | Budget transversal complet, densité/contenu de la région, mine, agriculture, qualification audio et benchmarks PC |

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
npm run test:gameplay
npm run test:environment
npm run test:local
npm run test:characters
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

## Complément FND-05 : collisions logiques et étages

- `WorldCollisionQuery` indépendant de Three.js : grille spatiale pour corps solides, déplacement horizontal avec glissement et blocage par axes, surfaces/plafonds identifiés par **zone + étage + X/Y/Z**. Un étage absent produit une erreur explicite, sans repli sur le heightfield extérieur.
- Adaptateur de colliders auteur : transformations, rotations et échelles donnent des **enveloppes AABB conservatrices**, sans consulter les meshes ni la qualité graphique. Les sphères utilisent aussi leur enveloppe ; pas de moteur rigide/capsules/OBB exact. Les corps gigantesques sont hors de la grille fine pour éviter d'allouer une matrice mondiale.
- Le joueur peut consommer ce query sans changer le chemin V2 historique. La requête de sol/plafond et l'absence d'eau extérieure dans un espace souterrain sont testées avec trois niveaux superposés ; **aucune mine jouable n'est encore créée**.
- Les snapshots jouables transportent leurs colliders séparément des meshes ; le jeu n'ouvre pas les sources Studio. Les templates porte/levier et la barrière du scénario fournissent un volume simple. L'état `open` ou `collected` libère ce volume immédiatement, y compris après chargement d'un slot ; les colliders des PNJ déclarés suivent leurs positions logiques.
- La collision ne dépend pas d'un état visible du mesh, d'un LOD ni du nombre de particules. Aucun backend ou moteur de physique supplémentaire.

Preuves : **116 tests unitaires/intégration**. Le parcours jeu contient désormais **12 contrôles navigateur**, dont marche réelle contre la barrière fermée puis traversée après résolution du mécanisme, et reprise sans nouvelle récompense. Les contrôles historiques restent requis. Le prototype teste uniquement des corps simples ; franchissement automatique, contacts verticaux sur les boîtes, souterrains rendus, connecteurs, cellule excavable et persistance d'un contexte mine dans le slot restent à développer avant B1-09.

## Complément Studio B1-05/12 : création et édition de personnages

- Module **Personnages** : créer un écureuil/petit animal à une position choisie, puis nom, accessoires, émotion, activité (immobile/promenade/travail), rayon et vitesse. Le parcours d'une patrouille existante est préservé ; son dessin interactif reste à développer.
- Création d'un dialogue et comportement liés avec IDs stables dans les bibliothèques. Édition par le panneau de dialogue existant ; mêmes transactions, sélection et stockage que la carte. Aucun accès à la personnalisation ou aux préférences du joueur.
- Les modifications d'apparence remplacent les anciens overrides correspondants de l'instance ; les liens de dialogue et autres composants restent conservés.
- Le constructeur de PNJ reçoit les limites explicites du monde pour la vue locale V3 ; la validation historique V2 garde ses limites par défaut. Les tests distinguent ces deux chemins.
- Les contrôles de formulaires Studio possèdent maintenant un libellé accessible explicite, y compris les listes déroulantes.

Preuves : **119 tests unitaires/intégration**, dont création/lien, identité du dialogue après personnalisation, patrouille et overrides, PNJ situé au-delà des anciennes limites avec limites V3 explicites. **6 contrôles navigateur** : création sans JSON → apparence/navigation → dialogue → sauvegarde/rechargement → annulation persistante → personnage réellement présent et conversation ouverte dans le playtest. Navigation hiérarchique avancée, nouvelle morphologie/rig et édition visuelle des patrouilles restent hors de cet incrément.

## Fiabilisation des éditions et rétention des tests

- Les éditions successives de l’inspecteur sont sérialisées à partir de l’état courant. Sauvegarde, export, changement de projet et lancement de test attendent la fin des éditions en cours. Un départ pendant une édition en attente déclenche la protection de fermeture.
- Matérialiser un composant résolu sur une instance retire ses anciens overrides correspondants, en conservant prefab, variante et overrides des autres composants. Une position ne revient plus silencieusement à une ancienne valeur après édition/déplacement. Test de déplacement entre secteurs avec overrides existants.
- L’éviction d’un ancien snapshot jetable supprime aussi ses slots temporaires ; les vrais slots et les sources auteur restent distincts.
- État de validation de cet incrément : **120 tests unitaires/intégration**, build TypeScript/Vite et **17 contrôles Studio** incluant deux changements de coordonnées déclenchés avant la fin de la première édition. Les autres parcours (16 historiques, 12 gameplay, 5 environnement, 10 local, 6 personnages, 15 stockage) restent dans la CI.

## Cohérence des lectures de secteurs et migration du stockage

- Le stockage navigateur passe à la version **IndexedDB 2** : ajout automatique d’un index compact `(projectId, revision)`, sans réécrire les projets ni leurs secteurs. Les formats source V3, compilé et GameSave ne changent pas.
- Une hydratation différée vérifie la révision attendue dans **la même transaction de lecture** que les secteurs. Un ancien manifeste ne peut plus recevoir silencieusement les sources récentes d’un autre onglet. Le contrôle utilise la clé de l’index, sans cloner le manifeste/global index à chaque lecture locale.
- La session attend ses propres sauvegardes en cours avant de charger des sources supplémentaires. Les conflits externes restent explicites ; récupération guidée et copie d’une révision ancienne partiellement déchargée restent à améliorer.
- **20 contrôles IndexedDB Chromium** : 15 précédents, rejet d’une lecture obsolète, lecture à la bonne révision, ouverture d’une vraie base v1 avec données, conservation des secteurs après migration et mise à jour atomique de l’index de révision.

État récapitulatif : **120 tests unitaires/intégration** et **86 contrôles navigateur** répartis entre jeu historique, Studio, interactions/sauvegardes, environnement, viewport local, personnages et stockage. Ces vérifications ne remplacent pas la qualification GPU intégré/Firefox ou l’acceptation humaine de B1.

## Démarrage asynchrone et diagnostic CI

La CI de `1b42e96` a échoué dans l'ancienne étape regroupant tous les navigateurs, tandis que la suite complète repassait localement. Les journaux détaillés de ce run demandent une authentification GitHub ; le résumé public ne donnait que l'étape groupée.

- Le bouton **Explorer** reste désactivé jusqu'à la fin de l'initialisation et l'installation des handlers. Le premier clic ne peut plus être absorbé pendant les imports/fetch asynchrones.
- Un contrôle navigateur bloque volontairement le chargement JavaScript, vérifie cet état désactivé puis libère le chargement et démarre la partie. Environnement : **6 contrôles** ; total courant **87 contrôles navigateur**.
- Les suites navigateur ont des étapes CI distinctes ; `tools/run-browser-check.mjs` remonte le nom et la fin de l'erreur dans une annotation. Les journaux et artefacts ordinaires restent produits. Cela permet de diagnostiquer un éventuel nouvel échec sans confondre jeu historique, Studio, gameplay, environnement, local, personnages et stockage.

Ce contrôle de démarrage corrige un risque réel ; il ne suffit pas à attribuer avec certitude l'ancien échec CI sans son journal détaillé. La validation du nouveau head doit être consultée séparément.

## Audio et vérification avant essais utilisateur

Le moteur MIDI/Web Audio, le mixeur, les bruitages, les ambiances proches et le module Studio Audio sont implémentés sur cette branche. Sources MIDI/WAV licenciées embarquées, voix/PCM bornés, culling spatial, mode silencieux, réglages persistants et arrêt/reprise couverts par tests. Voir [28 — Audio et recette utilisateur](28-AUDIO-ET-RECETTE.md) pour le périmètre exact, les **132 tests / 110 contrôles navigateur** et les étapes d’essai. Les cinq presets et échantillons de référence sont originaux CC0. Le statut AUD-8 (écoute/bench matériel et Firefox réel) reste à qualifier ; il n’est pas assimilé à une CI verte.


## Eau : profils suivant le relief

Le module Studio **Eau** et l’éditeur historique proposent maintenant des cours d’eau suivant le terrain, un profil longitudinal, des altitudes manuelles et des plans horizontaux. Même profil dérivé pour ruban 3D, creusement du lit, nage et caméra ; recalcul des dépendances de relief sur le corridor complet. Les anciennes eaux horizontales restent intactes jusqu’à conversion explicite. Détails, parcours et limites : [29 — Eau et profils](29-WATER-PROFILES.md).

Cet incrément avance certaines parties de WAT-1/WAT-2 ; **le réseau complet, les cascades, lacs polygonaux, jonctions, courants et WaterLOD0–3 restent non livrés**. Il ne qualifie pas toute l’hydrologie B1.
