# 105 — Studio : génération, retouche manuelle et fluidité sur PC modeste

Statut : **IMPLEMENTED + TESTED** sur `claude/stoic-heisenberg-xwfbza`. Tests unitaires, tests navigateur Studio existants, mesures Chromium avec CPU bridé. **Non qualifié sur iGPU réel.**

Complète [104 — générateur cohérent](104-COHERENT-WORLD-GENERATOR-AUDIT.md) et [22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md).

## 1. Audit de départ (commit `64d4a53`)

### 1.1 Éditabilité après génération

| Donnée générée | Avant | Après |
|---|---|---|
| Relief (masses, formes) | éditable (carte 2D, formes) | inchangé |
| Terrassements | **aucune UI** ; restaient en place après suppression d’un village | module « Monde généré » (niveau, talus, suppression) ; supprimés avec leur village ; contour sur la carte 2D |
| Fonds marins auteur (plateau, tombant, récifs, trous bleus, fosses) | **aucune UI** (seule la profondeur globale) | profil éditable, formes (profondeur, taille, suppression), replanification, retour au fond historique ; tracés sur la carte 2D |
| Sites de plongée et découvertes | **aucune UI** | nom, type, profondeur, entrée, découvertes, replanification ; contours sur la carte 2D |
| Style et rôle des villages | 3 styles historiques seulement | 8 apparences, thème d’architecture, rôle de pôle ; emprises sur la carte 2D |
| Liaisons de chemins, hôtes, dialogues, quêtes | régénération impossible hors création | « Relier les lieux isolés », « Régénérer hôtes, dialogues et quêtes » (hôtes verrouillés conservés) |
| Quêtes générées | non distinguées ; cible et précision d’événement invisibles | marque ✧, événement choisi dans le registre, cible et précision éditables |
| Réponses de dialogue conditionnelles | deux réponses identiques sans explication | la condition d’inventaire est affichée |
| Options V5 (terrasser, relier, pôles, architecture, surf, station, vol, fonds, histoires, langue) | seulement via un thème non modifiable | assistant pas à pas + « Personnaliser dans l’assistant » depuis un thème |
| Recomposition | surf, plongée et quêtes générées restaient périmés | gardés (refus si retouchés) puis remplacés |
| Rétrogradation sous V5 | les options V5 faisaient échouer la validation | toutes les options V5 sont retirées |

Les mondes V1–V4 ne contiennent pas ces données : leur édition historique est inchangée.

### 1.2 Défaut de fond corrigé

Le brouillon d’une transaction Studio (`studio-core/edit.ts`) ne copie que le premier niveau. Les objets imbriqués sont partagés avec le document : relief, bibliothèques, ressources, secteurs non déclarés.

Les nouvelles retouches modifiaient donc l’original directement. Elles n’étaient **ni annulables ni sauvegardées**.

Correction : copie avant écriture du relief, des dialogues, des quêtes et des objets, et déclaration de tous les secteurs pour les actions qui créent ou suppriment des entités. Un test vérifie que « Annuler » restaure exactement l’état d’avant.

### 1.3 Ressources et attentes

| Point chaud | Avant | Après |
|---|---|---|
| Aperçu de l’assistant | `composeWorld` sur le fil principal à **chaque** réglage modifié : gel de 3 à 50 s sans indicateur | Web Worker dédié, la dernière demande gagne (les anciennes sont annulées), anti-rebond de 300 ms, barre de progression par étape avec bouton Annuler |
| Thème, reprise de brouillon, recomposition | gel complet ; texte statique | worker et progression ; la recomposition affiche « Référence · … » puis « Nouveau plan · … » |
| Caméra | chaque mouvement sauvegardait tout le projet dans IndexedDB (copie de l’en-tête, du journal et des index) et reconstruisait l’inspecteur | seul l’état de vue est enregistré (un petit enregistrement, 1,5 s après) ; l’inspecteur n’est reconstruit que si la sélection, l’outil ou le module change |
| Historique | à chaque édition et à chaque itération du rognage, tout l’historique (≤ 4 Mio) était resérialisé | taille calculée une fois par transaction |
| Retouche du relief | un parcours complet de la scène par zone touchée ; tous les rubans et instances recalculés même hors zone | un seul parcours par mise à jour ; seuls les éléments réellement dans la zone sont recalculés |
| Diagnostics du viewport | sérialisation JSON à chaque image d’animation | toutes les 6 images, plus la dernière |
| Carte 2D | toute retouche de bibliothèque (dialogue, quête…) invalidait toutes les tuiles et le projet des workers ; un redessin par événement souris | seules les bibliothèques géographiques invalident ; un redessin par image |
| Rendu 3D sur petite machine | aucun profil (détails maximum, herbe équilibrée, MSAA) | profil `low` automatique (≤ 4 cœurs ou ≤ 4 Go) : ratio de pixels 1, sans MSAA, habillage et herbe économes ; `?studioQuality=low\|normal` |
| Ouverture, création, export, « Jouer ici » | texte statique, page figée | bandeau d’activité peint **avant** le travail, temps écoulé, `aria-busy` |

## 2. Mesures

Scénario reproductible : Chromium/SwiftShader en 1280 × 720, **CPU du fil principal bridé ×4** (CDP). Il compare le build de `64d4a53` (avant) au build de cette branche (après). Le script est `lowend.mjs`, lancé dans le bloc de session ; il utilise des tâches longues `PerformanceObserver` et compte les `IDBObjectStore.put`. Ce sont des signaux de régression, pas des mesures d’iGPU.

| Étape | Avant | Après |
|---|---|---|
| Assistant « Créer un monde » : premier retour visible | **15,0 s** (page figée) | **0,15 s** (barre de progression) |
| Assistant : plus longue tâche du fil principal | **14,8 s** (une seule tâche) | **0,40 s** (0,47 s cumulés) |
| Ouverture de l’île officielle jusqu’à la vue 3D au repos | 7,3 s · 6,4 s de tâches longues | 6,6 s · 5,6 s |
| Navigation (30 crans de molette, 10 glissés) puis 2,5 s de repos | 28,6 s · 24,3 s de tâches longues · max 238 ms | 20,3 s · 16,3 s · max 171 ms |
| Écritures IndexedDB pendant cette navigation | **33** | **2** |
| Profil de rendu 3D appliqué | aucun | `low` (détection automatique dans ce conteneur) |

Lecture :

- **Durée de l’aperçu (15 s avant, 4,5 s après).** Elle n’est pas comparable : le bridage CDP ne ralentit que le fil principal, alors que le worker tourne à pleine vitesse. Le gain réel porte sur la réactivité : l’interface reste utilisable pendant tout le calcul.
- **Gain de navigation.** Il combine les corrections de code (sauvegarde, inspecteur, diagnostics) et le profil `low`. Les écritures IndexedDB, elles, ne dépendent que du code.
- **Génération d’un thème.** Sans bridage, « Côte des Rouleaux » s’ouvre en 9,9 s avec une seule tâche longue de 177 ms. Avant, l’interface restait figée pendant toute la génération.
- **Non-régression.** Les tests navigateur existants `test-studio-browser` (17 contrôles) et `test-studio-creation-acceptance-browser` (13 contrôles) passent, sans erreur de page.

## 3. Restes

- **Coût par édition de `settlementSourceHash`** : empreinte de tout le projet, environ 25 fois par recherche de site. Non changé : la remplacer par un compteur de révision demande que tous les chemins d’écriture le tiennent à jour.
- **`syncContent` du viewport** : il resérialise les retouches, placements et zones des secteurs chargés à chaque transaction. Il faut un index de signatures par secteur.
- **Composition encore sur le fil principal** dans le brouillon 2D (`validateCompositionDraft`, déclenché 180 ms après chaque retouche) et dans les assistants hydrographiques. Ces opérations sont plus courtes, mais toujours sans progression.
- **Courses de ski secondaires** (tracé, difficulté) et `summitShaping` : pas encore éditables.
- **Champs de ceinture** : ils restent quand on supprime leur village (zones ordinaires, supprimables à la main).
- **Temps GPU** : les mesures SwiftShader avec CPU bridé ne qualifient pas un iGPU (doc 22). Benchmark matériel à faire.
