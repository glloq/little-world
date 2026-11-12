# 16 — Évolution future : multijoueur massif et optimisation des foules

**Décision de cadrage : 12 novembre 2026.**
**Statut : architecture future et garde-fous de compatibilité, PAS une fonctionnalité du jeu solo actuellement livrée.**

Documents de référence : [12 — Périmètre solo](12-PROJECT-SCOPE.md), [14 — Choix techniques](14-TECHNICAL-CHOICES.md), [15 — Données V3](15-STUDIO-DATA-SCHEMAS-V3.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [05 — Architecture](05-TECHNICAL-ARCHITECTURE.md).

## 1. Portée, objectifs et non-objectifs

**Choix utilisateur :** préparer l'architecture de Little World à un **futur multijoueur dans le même monde continu**, sans modifier la priorité immédiate : **jeu solo, Studio V3, exécution statique GitHub Pages, aucun serveur requis**.

| Mesure | Objectif futur | Niveau de preuve |
| --- | --- | --- |
| Première version multijoueur | **30 joueurs** dans un même monde ; test tous regroupés | Scénario de validation, pas capacité actuelle |
| Cible ambitieuse principale | **200 joueurs connectés** sur un monde continu ; tester au moins **100 regroupés** | Cible à benchmarker |
| Étude d'extension | **500 joueurs connectés** ; scénario **200–300 regroupés** | Expérimental ; dépendra du CPU réseau et du rendu |
| Référence client | PC standard/GPU intégré, affichage **30 FPS nominal / 20 FPS secours** | Budget du jeu, pas garantie multi |
| Carte | **Une géographie continue**, au maximum **10 × 10 km** | Limite de format ; n'implique ni simulation globale, ni contenu intégral |

Ne jamais présenter 200/500 comme le nombre déjà supporté ou garanti. **Le serveur, le client et les zones concentrées ont des limites différentes**. La zone de rassemblement extrême, pas la superficie du monde, est souvent le point de rupture.

**Non-objectifs maintenant :** serveur Node permanent, Colyseus, WebSockets, authentification, comptes, chat, persistance partagée, réplication réseau, prédiction/correction, matchmaking, partitionnement de processus. Les ajouter seulement dans une **campagne multi explicitement décidée**.

## 2. Séparer 5 couches qui ne doivent pas se confondre

1. **Contenu auteur du Studio** (source V3, entités, règles, prefabs, données géographiques).
2. **Contenu statique compilé** (manifestes/chunks/GLB/LOD/textures distribués par CDN/GitHub Pages ou équivalent).
3. **État logique et simulation** (positions, états dynamiques, interactions, inventaires, PNJ autoritaires lorsque multijoueur).
4. **Réplication par client** (quelles entités, propriétés, fréquences, priorités et droits).
5. **Présentation locale** (LOD, interpolation, animation, audio et caméra).

Les **chunks de stockage**, les **zones de simulation/autorité** et les **ensembles de visibilité réseau** sont trois découpages indépendants. Un changement de secteur de données ne transfère pas automatiquement la simulation à un autre processus.

**Invariant solo :** toutes les couches de logique/rendu travaillent localement sans réseau ; aucun accès socket ni serveur ne doit devenir une dépendance d'un `EntityDefinitionV3` ou du Studio.

## 3. Interest Management / AOI / filtrage de pertinence

**Choix futur prioritaire :** maintenir un **index spatial** des entités actives et calculer, pour chaque destinataire, un **ensemble pertinent** sans diffuser toutes les positions à tous les clients.

Critères combinables :
- Distance, visibilité/occlusion approximative, champ de vision/caméra, hauteur et type de mouvement (marche, course, planage, bateau).
- Interaction explicite en cours : conversation, suivi, groupe, échange, véhicule partagé, mini-activité.
- Importance de gameplay et changements d'état à préserver, même si l'entité est **hors vue**.
- Capacité du client (GPU/CPU) et budget réseau mesuré.

La priorité d'un dialogue actif ou d'un mécanisme partagé **surpasse** la réduction destinée aux foules. La distance seule ne suffit pas. Prévoir des **seuils avec hystérésis et délais de maintien** pour empêcher l'alternance coûteuse entrée/sortie de visibilité.

État d'intérêt recommandé : `untracked → tracked-distant → tracked-near → priority`. À l'entrée : snapshot initial, puis delta ; à la sortie : désabonnement/masquage, **pas suppression du vrai état logique**.

**Pas de calcul d'occlusion géométrique GPU coûteux par joueur sur le serveur** ; commencer par une grille/spatial hash + distances + contexte, puis mesurer des filtres supplémentaires.

## 4. Cadences distinctes et adaptatives

**Trois horloges indépendantes :**

| Couche | Valeur de départ proposée | Règle |
| --- | --- | --- |
| Simulation serveur future | **20–30 Hz** pour joueurs et interactions importants | Paramètre à benchmarker, ne jamais la réduire globalement à 2 Hz |
| Réplication réseau par couple destinataire/entité | **0–20 Hz** adaptatif, typiquement **2–20 Hz** si l'entité est suivie | Change selon priorité, visibilité, charge et stabilité |
| Présentation client | **30 FPS** cible / **20 FPS** secours | Interpolation, animation et LOD locaux ; pas déterminés par le taux de réplication |

Proposition de **paliers de départ**, **pas un SLA** :

| Situation | Mises à jour de mouvement proposées | Détails |
| --- | --- | --- |
| Joueurs en dialogue/interactions/proches prioritaires | **15–20 Hz** | Préserver réactivité et événements critiques |
| Visibles proches | **8–10 Hz** | Interpolation locale |
| À distance moyenne | **4–5 Hz** | Moins d'animations détaillées |
| Foule dense, personnages secondaires | **2–3 Hz** | Reconstruction avec vitesse/direction/animation, retard visuel possible |
| Très loin/masqués | **0–1 Hz** ou **aucun mouvement** | Événements/flags importants restent synchronisables |

**2–3 Hz = 333–500 ms entre états.** À 5 m/s, une cible parcourt **1,7–2,5 m** entre deux mises à jour : acceptable seulement avec interpolation/extrapolation bornée et pour les personnages secondaires ; **pas** pour toutes les collisions/interactions proches. Ne pas promettre une animation parfaitement fluide à 2 Hz. Pendant planage rapide, bateau, changement brutal de direction ou proximité d'une interaction, remonter la priorité ou envoyer des événements de correction.

Ne jamais confondre **réseau 2 Hz** avec **simulation serveur 2 Hz**, ni **simulation PNJ solo à fréquence réduite** avec la réplication réseau multijoueur.

### Pourquoi les volumes réseau ne suffisent pas

Pour `N` clients visibles entre eux à un taux `f`, **la borne naïve** de messages de position distribués est `N × (N−1) × f`, **avant groupement, intérêt, compression et overhead**. Réduire `f` de 15 à 3 diminue le nombre d'envois de positions de **80 %**, **pas** la charge totale CPU serveur ni le nombre de personnages à rendre.

Ne pas fonder les objectifs de joueurs sur cette seule équation.

## 5. Contrat de réplication et classes de fiabilité

Séparer au minimum :

| Canal logique | Contenu | Politique de départ |
| --- | --- | --- |
| **Mouvement** | Position/orientation/vitesse, état locomotion | Snapshots/deltas datés, cadences AOI ; **états anciens remplaçables**, pas de file infinie |
| **Événements importants** | Action, dialogue, activation de mécanisme, embarquement, téléportation | Livraison fiable/ordonnée ou idempotente selon événement ; priorité haute |
| **État partagé/persistant** | Ouverture de porte, inventaire autorisé, propriétés d'entité, mission collective | Snapshot initial + mutations fiables versionnées |
| **Apparence/équipement** | Espèce/skin/accessoires/animation choisie | À l'apparition et au changement, pas à chaque snapshot de position |
| **Ambiance locale** | Sons, météo décorative et animation de foule non critiques | Reconstitution cliente si déterministe, sans diffusion continue |

À réserver à l'implémentation réseau : choix du transport. **WebSocket** comme option simple de départ ; **WebTransport** ou autre seulement si la plateforme, les garanties et les benchmarks le justifient. Ne lier les schémas de données V3 à aucun transport.

### Optimisations à évaluer

- Messages **binaires**, quantification de positions **relatives au chunk/repère spatial**, limites de valeurs et de précision documentées.
- Delta compression / bitsets / masques de champs ; compatibilité de protocole, version et snapshot à l'arrivée dans l'AOI.
- **Paquets groupés** et budgets en octets/secondes et en CPU/client, pas un socket write pour chaque entité.
- Pacing et backpressure : ne pas accumuler les vieux mouvements ; limites mémoire/files/temps d'encodage.
- États d'animation **en IDs/étapes** : jouer les clips localement, **pas** diffuser chaque rotation d'os.
- Téléportation, embarquement, interaction et correction importante transmis sans attendre une fenêtre de mouvement de 500 ms.
- Reconnexion avec snapshot ciblé et version du monde, sans imposer l'envoi du monde entier.

Quantification, niveau de détail et fréquence font partie des **profils réseau**, non des données irréversiblement gravées dans chaque prefab.

## 6. Simulation serveur et faune

- **Serveur autoritaire** à terme sur les interactions et états partagés ; validation des actions, vitesses, positions, collisions utiles, droits d'inventaire, anti-triche proportionné.
- **Scheduler central** multi-fréquence ; joueurs actifs à haute fréquence, PNJ proches à fréquence réduite, PNJ lointains en mode analytique/dormant, faune décorative pilotée côté client lorsque cela n'affecte pas les règles du jeu.
- Les PNJ conservent une **position/activité logique** même hors rendu, reconstituée à l'arrivée d'un joueur. Les états gameplay importants ne dépendent pas des `THREE.Object3D`.
- **Véhicules et montures** : regrouper passagers et support dans une hiérarchie d'attache et une autorité de mouvement ; éviter la réplication de mouvements contradictoires.
- Horloge de monde commune pour règles et schedules PNJ ; les cycles visuels locaux ne sont pas une horloge de gameplay autoritaire.
- Les événements qui touchent un secteur non chargé modifient les **données logiques**, sans charger les maillages d'une maison à plusieurs kilomètres.

La simulation hors écran **doit rester déterministe ou reproductible lorsque nécessaire**, pas une simple suppression de l'état des objets importants.

## 7. Optimisation du rendu client des foules

**Le nombre de joueurs connectés et le nombre de personnages dessinés en détail sont deux budgets différents.**

Prévoir les niveaux suivants (seuils par **importance + distance + capacités GPU**, pas uniquement mètres) :

| LOD | Caractéristique | Exemples de budget à tester |
| --- | --- | --- |
| **LOD 0 : détaillé** | Rig, expressions, accessoires, animations complets | Quelques joueurs prioritaires/proches |
| **LOD 1 : simplifié** | Mesh et squelette allégés, clips et ombres réduits | Quelques dizaines de proches visibles |
| **LOD 2 : silhouette** | Très faible géométrie / rig minimal / imposteur si approprié | Joueurs secondaires d'une foule |
| **LOD 3 : invisible** | Aucun mesh ni animation visuelle | Hors vue ou trop loin |

- Réutiliser familles de rigs et animations ; sous-système de foule simplifié pour les personnages secondaires.
- **Instancing animé non automatique** : variété d'équipements, de morphologies et de squelettes complique l'instancing. Tester une représentation spécifique des silhouettes plutôt que supposer un gain.
- Désactiver à distance : IK, animations secondaires, physique cosmétique, ombres individuelles, accessoires minuscules, textures à forte résolution.
- Le client continue d'interpoler à **30/20 FPS** même si un personnage secondaire n'est répliqué qu'à 2 Hz ; interpolation/extrapolation **bornée**, avec corrections et gestion des téléportations.

**Exemple de profils de test** : 5–10 joueurs prioritaires, 20–40 proches, 50–100 secondaires ; ne pas en faire une limite absolue ni promettre 300 avatars détaillés à 30 FPS sur GPU intégré.

## 8. Préparer, sans implémenter, le passage à plusieurs processus

Un **monde logique continu** pourra être géré par plusieurs zones d'autorité. Ce découpage n'a pas besoin de correspondre à la taille des chunks de stockage.

- Définir un propriétaire logique de chaque **entité dynamique**, et un protocole futur de **transfert d'autorité** (état, version, numérotation, ack, rollback/réessai).
- Assurer qu'une seule autorité applique une mutation d'état à un instant donné ; traiter les collisions/événements aux frontières.
- Les abonnements AOI peuvent **déborder plusieurs zones de simulation** ; le client garde un monde sans écrans de chargement.
- Un mécanisme trans-zone utilise une référence et un événement typés, pas une référence directe au processus ou au socket.
- Eviter une base de données centrale synchrone dans la boucle de mouvement ; prévoir stockage partagé ou journal seulement pour les états vraiment persistants.
- **Ne pas ajouter de déploiement multi-processus tant qu'un serveur dédié mono-processus n'est pas benchmarké et insuffisant.**

## 9. Ce qui doit être compatible avec V3 **dès maintenant**

Ce chapitre précise des **contraintes de compatibilité**, pas l'obligation d'ajouter une couche réseau :

| À conserver dans les schémas/architectures actuels | Pourquoi |
| --- | --- |
| `entityId`, `worldId`, `chunkId` stables et référentiels typés | Suivre une entité malgré les changements de secteur |
| **Séparation logique / rendu / stockage auteur / sauvegarde joueur** | Rendre plus tard le serveur autoritaire sans convertir tout Three.js |
| **Événements et commandes de gameplay identifiables** | Rejouer/valider des interactions partagées |
| **État persistant explicite par composant/champ** | Savoir quels changements synchroniser |
| **Coordonnées mondiales et référentiel local de secteur** | Quantification réseau future possible |
| **Index spatial, état logique des entités déchargées** | AOI et changements inter-secteurs |
| **Horloge/simulation à pas fixe et ordonnanceur** | Réplication indépendante du rendu et des PNJ |
| **Familles de rigs, LOD et animation locale** | Foules visibles sans coût linéaire maximal |
| **Schémas versionnés/migrations** | Compatibilité monde, sauvegardes et futur protocole |

On peut ajouter **plus tard, si un cas concret apparaît**, des métadonnées optionnelles de `ReplicationHints` au niveau de composants :

```ts
// EXEMPLE FUTUR : indicatif, non à implémenter obligatoirement aujourd'hui.
interface ReplicationHints {
  mode: "static" | "event" | "dynamic";
  priority: "critical" | "normal" | "background";
  interestRadiusM?: number;
  persistChanges?: boolean;
}
```

**Ne pas rendre ces métadonnées obligatoires aujourd'hui.** Elles ne remplacent ni les règles de sécurité du serveur, ni les budgets AOI par destinataire. Les choix d'intérêt/frequence demeurent des **politiques runtime**, pas des propriétés figées dans la carte source.

**Ce qu'il ne faut PAS implémenter maintenant :** classe `NetworkEntity` pour tout objet, socket dans `StudioContext`, simulation de serveur en solo, protocole RPC global, transport fixé dans le schéma V3, comptes, login ou backend.

## Rendu des foules et environnement panoramique partagé

Le futur multijoueur exploite la **même politique de rendu longue portée que le solo** ([17 — Horizon et LOD sans brouillard](17-DISTANT-VIEW-RENDERING.md)). Le serveur n'envoie pas la géométrie du paysage : il synchronise les **états dynamiques pertinents**, tandis que les clients chargent localement le terrain statique, les silhouettes, les proxies de bâtiments et les ressources d'assets depuis un build/version déterminé.

Les **LOD d'avatars** et les **LOD géographiques** ont des budgets et une pertinence distincts. Un joueur lointain peut être invisible sans que la montagne sur laquelle il se trouve disparaisse ; les masses de forêt et les grands monuments ne sont pas rendus à leur détail maximal dans une foule.

**Ne jamais mélanger** la fréquence réseau AOI 2–20 Hz et la distance de rendu de l'horizon ; le monde profond est statique/reproductible côté client. La qualité 30/20 FPS doit être testée avec terrain panoramique **et** foule, pas avec une scène vide.

## Herbes interactives : cosmétique locale, coût borné en foule

Le [cadrage herbes low-resource](18-GRASS-LOW-RESOURCE.md) prépare une réaction au passage d'un ou plusieurs personnages **sans jamais synchroniser une touffe**.

- Tous les clients connaissent les biotopes/terrain compilés et régénèrent localement l'herbe proche ; le serveur n'envoie **ni matrices, ni oscillations, ni positions d'herbes**.
- La déformation se fonde uniquement sur les positions de joueurs **déjà répliquées par AOI**, en priorisant **1–2 acteurs** (d'autres si budget GPU mesuré).
- Ne pas effectuer une boucle shader sur tous les avatars d'une foule. Pour une densité élevée, tester éventuellement une **texture d'influence locale** de petite taille, **uniquement après profilage**.
- Les personnages lointains n'ont pas d'effet sur les touffes 3D du client. Aucun impact sur navigation, collisions, logique ou état autoritaire.
- Priorité GPU à la **vue panoramique et aux avatars lisibles** ; l'herbe peut passer en `groundOnly` pendant une foule dense.

## Autorité future de l'horloge, de la météo et des astres

La [spécification 19 — Environnement](19-ENVIRONMENT-WEATHER-SKY.md) définit `EnvironmentStateSource` : **LocalEnvironmentSource** utilisée dans le solo et le panneau de test bêta, **ServerEnvironmentSource** disponible plus tard lorsqu'un serveur sera réellement développé.

- Le **serveur futur** est autoritaire sur `worldTimeSeconds`, la cadence de temps, les régions météorologiques, les transitions et les états de neige/vent significatifs.
- Les clients reconstruisent depuis **epoch/seed/périodes** les étoiles, **chaque lune à cycle indépendant**, soleil, nuages, gouttes/flocons et palettes ; **aucun objet astral ni particule transmis sur le réseau**.
- Envoyer **snapshots horodatés et transitions/événements datés** par zone d'intérêt, avec version pour reconnexion/rattrapage. Éviter un paquet météo à chaque tick.
- Le joueur local ne peut pas modifier l'état météo commun via le panneau bêta : override de test uniquement en session isolée.
- Les règles gameplay dépendantes du temps/météo sont contrôlées par l'**autorité logique**, non par les shaders ou le FPS local.
- Les **ombres et leur budget** sont purement locaux à chaque client ; le serveur ne diffuse pas les shadow maps.

**Ne pas implémenter de backend météo lors de la campagne solo** au seul motif que ce contrat existe.

## Hydrographie : autorité serveur future, rendu d'eau local

Le [contrat WAT](21-WATER-HYDROLOGY-LOW-RESOURCE.md) distingue un réseau hydrographique **stable**, des volumes de nage/courants **logiques** et des vagues/écumes **strictement visuelles** :

- Le serveur éventuel devient autoritaire sur **règles de courant et niveaux d'eau de gameplay**, mouvements de bateaux/joueurs et éventuels événements de vannes/barrages, **pas** sur chaque animation de surface.
- Le client reconstruit localement le **WaterLODManager**, les vagues, écumes, reflets stylisés, vues sous-marines et densités en fonction de sa caméra/budget graphique.
- Pas de diffusion des triangles, particules, phase de mousse, normal maps ou pixels d'océan. La carte V3 et les volumes possèdent des **IDs et versions** réutilisables.
- Une désactivation de détails au loin **n'interrompt pas** la navigation, l'état autoritaire ou le calcul de collision. Les événements liés à l'eau s'appuient sur `WaterVolumes`, jamais sur le mesh Three.js.
- **Ne pas coder de serveur maintenant** au seul motif que cette frontière est documentée.

## PERF : optimisation locale au client, logique autoritaire indépendante

Le [document 22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md) est conçu pour le **jeu solo d'abord** ; sa politique GPU/CPU ne crée aucune obligation serveur.

- Le **client** choisit DPR/résolution, LOD de personnages/objets/eau/ombres/météo, distance d'animation et nombre d'assets visibles selon sa propre machine ; **aucun LOD graphique à répliquer**.
- Un futur **serveur** resterait autoritaire pour positions, événements, collisions et règles de gameplay ; qualité visuelle et cadence de présentation ne peuvent **pas réduire la fréquence des actions/événements critiques**.
- Les snapshots monde/entités gardent des IDs stables, les variantes d'affichage sont dérivées ; ressources/silhouettes plus économiques pour les joueurs secondaires sans divergence du monde.
- **Mesurer séparément** bande passante/tick serveur et frametime/draw calls/mémoire client ; 30/200/500 joueurs restent des objectifs non qualifiés.
- Préserver simulation/interaction au passage à 20 FPS présentation. Ne pas créer un système de gestion mémoire ou un serveur multijoueur au nom de PERF avant la campagne solo.

## Audio MIDI/SFX : contrôle local et événements futurs

**Contrat** : [23 — Audio LOW-RESOURCE](23-MIDI-AUDIO-LOW-RESOURCE.md). L'audio est **rendu local côté client**, depuis une palette de **5 à 10 instruments MIDI**, un synthétiseur commun et une petite bibliothèque de sons naturels.

- Les événements logiques importants (instrument actionné, musique régionale, interactions) pourraient être transmis comme **ID et temps de départ** par un serveur futur ; les **notes audio/PCM/voix, émetteurs cullés et spatialisation** ne sont pas répliqués.
- `AudioContext` et scheduling musical suivent une **horloge audio client**, éventuellement alignée sur un événement serveur pour une musique commune, mais **pas** sur le tick FPS.
- Chaque joueur peut avoir son **plafond local** de polyphonie/cache/émetteurs fixé par `AudioBudgetManager` (PERF), sans ralentir les règles de gameplay ou messages serveur.
- Aucune dépendance réseau/audio serveur pour la bêta solo ; les sons d'interaction critiques ont toujours un retour visuel adapté si la sortie audio est muette.

## Mines creusables synchronisées : intentions, snapshots et transactions

Le [document MINE 24](24-MINES-MULTILEVEL-LOW-RESOURCE.md) précise la future **autorité serveur des mines**, sans lancer de backend pour le solo statique actuel.

- **MineDefinitionV3** (source auteur) décrit entrées/étages/strates ; **MineState** serveur stocke **cellules excavées et gisements épuisés**, avec version du générateur. Les maillages restent calculés **côté client**.
- Le client envoie **`MineDigRequest` intention** (`requestId`, mine, étage, chunk, cellule, outil) ; le serveur valide **position/portée, permissions, outil, solidité, ressource et accès au niveau**. Ne jamais faire confiance à une quantité de minerai annoncée par le client.
- **Atomicité** : excavation + baisse de stock + crédit inventaire et contrôle **idempotent** du `requestId`, pour éviter qu'une cellule excavée simultanément par deux joueurs rapporte deux récompenses.
- **AOI mine localisée** : abonner seulement joueurs intéressés par `mineId/levelId/chunkId` et passages connectés, transmettre un **snapshot à l'arrivée** puis des **deltas ordonnés et révisés** ; en cas de trou de révision, resync snapshot.
- **Ne jamais envoyer des géométries/voxels complets en permanence**, pas de particules/sons/cristaux individuels réseau. Compression de snapshots et compaction des deltas à calibrer.
- Les **gisements rares cachés** et graines secrètes restent **dans l'autorité serveur**, non dans les assets publics ou fichiers V3 distribués aux clients.
- La définition physique/collision et les récompenses sont partagées, tandis que la géométrie LOD/éclairage/culling et qualité PERF sont locaux. **Stockage, transactions et réseau restent différés** jusqu'à une phase multijoueur réelle.

## 10. Plan de validation futur (gates non exécutés)

| Scénario | Participants | Densité | Gate |
| --- | --- | --- | --- |
| **MP-A** | 30 | 30 regroupés dans un village | déplacements/interaction/reconnexion ; qualité client |
| **MP-B** | 100 | 50 regroupés | AOI, débit serveur/client et p95 |
| **MP-C** | 200 | **100 regroupés** | cible principale : taux d'erreur, CPU tick, rendu GPU intégré |
| **MP-D** | 500 | **200–300 regroupés** | cible expérimentale, pas un engagement produit |
| **MP-E** | 500 | dispersés sur le monde | charge d'index spatial, mémoire, abonnements par joueur |
| **MP-F** | 200 | traversée d'une frontière d'autorité | uniquement si architecture multi-processus retenue |

Comparer **tests de bots headless** (capacité serveur) avec **vrais navigateurs** (capacité d'affichage). Un test 500 sockets ne prouve pas 300 personnages à 30 FPS.

### Métriques à publier avec chaque essai

- Serveur : tick p50/p95/p99, CPU par système, files d'événements, mémoire, GC, coût de filtrage AOI, nombre de messages/bytes sortants et entrants, perte/désordre, délai de livraison.
- Client : frametime p50/p95/p99, GPU/draw calls/triangles/mémoire, joueurs détaillés/simplifiés, gigue/interpolation, qualité de réponse des interactions.
- Jeu : latence action visible, intégrité des états partagés, cohérence des PNJ/mécanismes et sauvegardes, taux d'erreur de reconnexion.
- Décrire **machine**, navigateur, transport, scène, densité, profil réseau, version de build et durée avant chaque affirmation de capacité.

**Aucune promesse de 200/500 joueurs avant les résultats réels sur les scénarios correspondants.**

## 11. Phases et garde-fous

| Étape | Quand | Livrable |
| --- | --- | --- |
| **Maintenant : compatibilité V3** | Développement solo/Studio | IDs, états logiques indépendants des meshes, schémas versionnés, index et simulation décorrélée |
| **MP-0 : prototype réseau isolé** | Décision explicite de démarrer le multijoueur | 2–10 clients, serveur autoritaire et transport interchangeable |
| **MP-1 : première version** | Après preuve MP-0 | 30 joueurs, AOI et fréquences adaptatives, interactions fiables |
| **MP-2 : densité** | Après mesures MP-1 | 100–200 connectés, LOD de foules, backpressure, profils 2–20 Hz |
| **MP-3 : extension** | Si justifié | 500 expérimentaux, éventuellement autorité par zones/processus |

**Règle finale :** préserver un **jeu solo complet sans backend**. Ne pas modifier le scope V3 ni mettre en place de serveur dans le travail courant au seul motif que le multijoueur est envisagé.
