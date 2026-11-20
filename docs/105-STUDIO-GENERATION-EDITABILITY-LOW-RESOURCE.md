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

Mesures en cours (CPU bridé ×4, Chromium/SwiftShader) : résultats ajoutés au prochain commit.

## 3. Restes

- **Coût par édition de `settlementSourceHash`** : empreinte de tout le projet, environ 25 fois par recherche de site. Non changé : la remplacer par un compteur de révision demande que tous les chemins d’écriture le tiennent à jour.
- **`syncContent` du viewport** : il resérialise les retouches, placements et zones des secteurs chargés à chaque transaction. Il faut un index de signatures par secteur.
- **Composition encore sur le fil principal** dans le brouillon 2D (`validateCompositionDraft`, déclenché 180 ms après chaque retouche) et dans les assistants hydrographiques. Ces opérations sont plus courtes, mais toujours sans progression.
- **Courses de ski secondaires** (tracé, difficulté) et `summitShaping` : pas encore éditables.
- **Champs de ceinture** : ils restent quand on supprime leur village (zones ordinaires, supprimables à la main).
- **Temps GPU** : les mesures SwiftShader avec CPU bridé ne qualifient pas un iGPU (doc 22). Benchmark matériel à faire.
