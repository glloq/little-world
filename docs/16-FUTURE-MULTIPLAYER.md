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
