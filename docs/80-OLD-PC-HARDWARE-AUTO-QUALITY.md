# 80 — Compatibilité vieux PC 4–8 Go et qualité graphique adaptative

**Statut : SPECIFIED / non implémenté par ce document.** Audit du `main@f37d7767`, 18 novembre 2026. **Objectif :** Little World solo sur GitHub Pages, agréable visuellement et fluide sur un PC ancien, tout en réinvestissant les optimisations dans les futurs graphismes. Aucun FPS ni niveau de RAM n'est garanti sans qualification matérielle.

Références de vérité : [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md), [10 — Performance/mesures](10-PERFORMANCE-ROADMAP.md), [17 — horizon](17-DISTANT-VIEW-RENDERING.md), [55 — rendu hybride](55-HYBRID-DISTANT-RENDERING.md), [81 — audit du moteur](81-RENDER-PERFORMANCE-CODE-AUDIT.md) et [82 — roadmap](82-PERFORMANCE-GRAPHICS-IMPLEMENTATION-ROADMAP.md). Les contrats du présent document précisent les profils matériels, sans créer de second gestionnaire PERF.

## 1. Matériel cible : 4 Go testables, 8 Go référence

La **RAM totale ne suffit pas** à déterminer les FPS : CPU, GPU intégré/dédié, mémoire vidéo partagée, pilotes, WebGL2, navigateur, résolution et charge système déterminent la faisabilité. Sur un ordinateur à 4 Go, le système d'exploitation et le navigateur peuvent déjà consommer une part importante de la mémoire ; une carte de 4×3 km ne doit donc jamais être entièrement résidente en géométries proches.

| Profil de validation | Configuration représentative à sélectionner et documenter | Objectif de présentation, non garanti | Exigence |
| --- | --- | --- | --- |
| **PC ancien 4 Go** (compatibilité expérimentale) | 4 Go de RAM **totale**, GPU intégré ancien **compatible WebGL2**, CPU et OS relevés, navigateur maintenu | 30 FPS si possible, **20 FPS stable en secours** à une résolution raisonnable | Jeu complet, silhouettes/horizon, collisions et interactions conservés, aucune saturation mémoire |
| **PC ancien 8 Go** (référence minimale visée) | 8 Go, GPU intégré d'entrée de gamme, navigateur courant | **30 FPS nominal** à 1280×720 initialement ; tester ensuite 1600×900 | Qualité maximale **compatible avec ce budget**, sans dégradation évitable |
| **PC plus performant** (évolutions visuelles) | 8 Go ou plus, GPU plus rapide, résolution native | 30 FPS soutenu avec marge ; 60 FPS **seulement comme évolution future**, non pris en charge par la cadence actuelle | Détails/effets supplémentaires sans régression des profils anciens |

Les résolutions et FPS sont des **objectifs de test**, pas des prérequis qui forceraient immédiatement une image floue. 4 Go est un **objectif de compatibilité**, pas une promesse « minimum requis ». Un GPU qui n'expose pas correctement WebGL2 reste hors périmètre de garantie tant qu'un fallback distinct n'a pas été implémenté et testé. Ne jamais ajouter une dépendance WebGPU obligatoire.

**Objectif mémoire initial à mesurer, non budget validé :** sur 4 Go viser un onglet jeu modeste et stable (point de départ : 350–500 Mio de mémoire de processus/ensemble de processus attribuable au jeu selon méthode OS), sur 8 Go examiner 500–750 Mio. Ces plages ne correspondent **ni** à la taille du heap JS **ni** à la VRAM ; elles servent uniquement à commencer la campagne, puis sont révisées avec mesures système et pression mémoire. Prévoir de la marge pour l'OS, les onglets, le décodage audio et les buffers GPU partagés. Ne pas adopter ces valeurs comme seuils d'arrêt automatique.

## 2. Invariants qualité/gameplay — pas de mode « jeu vide »

1. **Jeu et simulation invariants** : pas fixe 30 Hz, contrôles réactifs, nage/planage/bateau, collision, PNJ utiles, interactions et sauvegardes inchangés par le budget visuel.
2. **Monde lisible en permanence** : terrain approchable, montagnes, falaises, côtes, ville et repères lointains visibles ; aucun brouillard ajouté pour masquer le streaming.
3. **Ne jamais supprimer un objet interactif ou sa collision parce que son mesh est invisible**. Garder les données/colliders/IDs indépendamment du renderer.
4. **Qualité perceptuelle d'abord** : corriger reconstruction/streaming/draw calls/uploads/overdraw avant de diminuer la résolution ou de retirer des détails. Les substitutions LOD doivent maintenir volumes, densité apparente, couleurs, ombrage et silhouettes.
5. **Aucune baisse arbitraire liée à la RAM déclarée** : 4 Go peut être performant dans une scène donnée ; un PC à 8 Go peut être GPU-limité. La capacité sert au choix initial conservateur, le réglage durable dépend des mesures.
6. **Une île active par client** ; lors des traversées, libérer les ressources inutiles de l'île précédente, A→B→A sans fuite. Solo hors ligne/Pages inchangé ; aucun service de télémétrie requis.

## 3. Contrat utilisateur et découverte matérielle

**Menu joueur** (simple) : `Qualité graphique : Automatique (recommandé) / Économie / Équilibrée / Élevée`. Conserver les préférences actuelles `low/medium/high` et leur comportement tant que le mode Auto n'est pas prêt ; prévoir migration stable. Un réglage « Élevée » exprime une **préférence**, pas une interdiction de secours sous pression extrême ; le menu indique le profil demandé et le profil effectif. Ajouter éventuellement « Fidélité prioritaire » / « Fluidité prioritaire » comme préférences de priorité **après** validation UX, pas dix sliders par défaut.

**Panneau bêta avancé** : cible 30/20, résolution interne et effective, DPR, profil demandé/effectif et cause, framerate p50/p95/p99, CPU simulation/update/submit, temps GPU asynchrone si disponible, draw calls, triangles, objets/secteurs, mémoire/cache estimés, long frames, streaming et nombre de jobs. Commandes de test temporaires : `Auto` on/off, `freezeAuto`, `renderTier`, `grass`, `impostors`, `tile`, `workers`, et export JSON de la configuration + trajectoire. Ne jamais enregistrer ces réglages locaux dans le projet source V3/ZIP.

**Détection informative uniquement** :
- `navigator.deviceMemory` est optionnel, arrondi et non standard sur certains navigateurs ; jamais l'unique source pour classer 4/8 Go.
- `navigator.hardwareConcurrency` n'est qu'un indice ; ne pas confondre threads logiques, performance CPU ou quota d'exécution.
- Extension timer GPU WebGL2 asynchrone si disponible, sinon GPU `unknown`. Ne pas inférer les octets de VRAM du nombre de meshes, ni assimiler `renderSubmitMs` à un temps GPU.
- Vérification de compatibilité WebGL2 et messages clairs en cas d'échec ; ne pas prétendre qu'un démarrage garantit les FPS.
- **Démarrage progressif** : rendre une scène lisible rapidement, streamer d'abord le voisinage/repères, observer quelques secondes **sans imposer de stress test long** ou de gros shaders au lancement. Les valeurs initiales respectent la préférence enregistrée, puis Auto s'ajuste.

## 4. Adaptation automatique par cause mesurée

Le seul arbitre reste `PresentationBudget` puis son évolution contrôlée vers `ResourceBudgetManager` (doc 22). `FrameClock` conserve indépendamment la cadence et la simulation. Les consommateurs publient besoins/coûts/qualité minimale mais ne changent pas seuls le niveau global. Les mesures doivent être lissées, avec hysteresis/cooldown (initialement 3 s surcharge / 12 s rétablissement, **à calibrer**).

| Diagnostic | Faire d'abord, à fidélité identique | Ensuite si nécessaire | Dernier recours |
| --- | --- | --- | --- |
| **CPU limité** | Réutiliser matrices/buffers, index spatial, répartir rebuilds, déprioriser tâches non visibles et annuler jobs périmés | Réduire fréquence des mises à jour **décoratives uniquement** | LOD secondaires si gain démontré |
| **GPU géométrie/draw calls** | Batching/instancing spatial, culling conservateur, proxies équivalents et suppression des pixels/objets non visibles | LOD projetés/hystérésis pour petits détails | Simplifier un effet local coûteux |
| **GPU fill-rate/fragment** | Couper overdraw invisible, améliorer shaders transparents et limiter passes ; comparer imposteurs vs silhouettes | Résolution 3D interne en petites étapes **seulement après diagnostic GPU ou surcharge indéterminée durable** ; UI/HUD nets | Baisser davantage l'interne, sans toucher à la simulation |
| **Streaming/mémoire** | Caches LRU avec ownership, réutiliser chunks/GLB, prioriser trajectoire et préchargement borné, garder ancien LOD | Réduire cache **inactif** et jobs spéculatifs | Profil visuel adapté à la mémoire disponible |
| **Origine indéterminée** | Journaliser, attendre une fenêtre d'observation et éviter plusieurs leviers à la fois | Dégrader prudemment ce qui ne change pas l'apparence utile | 20 FPS de présentation si la surcharge persiste |

**Important :** le code `src/frame-clock.ts` actuel réduit le pixel ratio par niveau (1 / 0,8 / 0,65), sans diagnostic explicite CPU/GPU : c'est une cible d'évolution, **pas une capacité déjà livrée**. Ne pas activer simultanément plusieurs automates qualité. Si l'adaptation diminue la résolution, afficher une raison et remonter progressivement lorsque le budget le permet.

## 5. Réglages de départ (hypothèses à benchmarker)

| Domaine | PC 4 Go expérimental | PC 8 Go référence | Ne pas faire |
| --- | --- | --- | --- |
| FrameClock | 30 FPS visés, 20 en dernier recours | 30 FPS visés | Modifier la vitesse logique selon FPS |
| DPR 3D | Préserver la netteté si possible ; autoriser baisse graduelle **en cas de GPU limité** | Résolution 3D native/plafond utilisateur lorsque soutenable | Réduire DPR comme réponse systématique à un pic CPU |
| Terrain | 3 LOD et horizon conservés, budget de build borné, ancien mesh affiché | Idem, marges caches plus généreuses si utile | Trou de terrain ou désactivation des colliders |
| Herbe | Visibilité projetée ; `groundOnly` seulement si indiscernable ou sous pression confirmée | `balanced/dense` selon coût et visibilité | Couper l'herbe visible près du sol sans contrôle A/B |
| Arbres/rochers | Lots cullables et silhouettes géométriques très légères | Même géométrie, plus de détails si budget disponible | Remplacer systématiquement tous les arbres par atlas |
| Imposteurs | `off` par défaut tant que le gain iGPU n'est pas prouvé | `off` par défaut tant que non qualifiés | Déclarer un gain à partir de seuls triangles |
| Éclairage | Soleil/hémisphère, halo léger, pas d'ombres massives | Identique ; futurs effets sur budget supplémentaire | Désactiver la lumière fondamentale |
| Téléchargements | Charger uniquement les assets requis et conserver un cache borné | Même principe | Précharger toute l'archipel/Studio sur un 4 Go |

**Qualité visible mesurée** : captures A/B mêmes seed/heure/météo/caméra/résolution, pixels différenciés si rendu déterministe ; revue manuelle des silhouettes, couleurs, LOD/popping, lumière, herbes proches et objets importants. Le gain CPU seul ne justifie pas une régression graphique.

## 6. Qualification et statut

La matrice de tests et les critères sont détaillés en [82 — Roadmap et gates](82-PERFORMANCE-GRAPHICS-IMPLEMENTATION-ROADMAP.md). Au minimum : PC réel 4 Go et 8 Go, navigateur Chromium et Firefox lorsqu'ils sont utilisables, démarrage à froid, 10 min de jeu, planeur rapide, forêt dense, port/village, nuit et A→B→A. Mesurer également le fonctionnement avec un autre onglet ouvert et le temps de fermeture/libération de mémoire.

**Définition de succès** : la meilleure fidélité stable par machine, sans perte fonctionnelle, sans longues saccades récurrentes et avec profil adaptatif explicable. Les cibles 30/20 et 4/8 Go ne deviennent des engagements qu'après mesures répétées et publication du matériel testé.