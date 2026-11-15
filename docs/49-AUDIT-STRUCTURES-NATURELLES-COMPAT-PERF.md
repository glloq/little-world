# Audit compatibilité et budget — Structures naturelles (Studio)

Branche : `feat/studio-creation-workflows-v1` — **aucune fusion dans main**.
Périmètre : arche rocheuse, pont naturel, tunnel traversant (voûte locale + relief heightfield).
Date : 15 novembre 2026.

## 1. Points contrôlés

| Sous-système | Contrat / vérification | État |
| --- | --- | --- |
| Source V3 | `NaturalStructure` versionné dans les composants d'entité, validé par `parseComponents` et `parseProject` | Implémenté, tests |
| Studio 3D | Polyligne à deux points, aperçu jetable, paramètres, édition sur ID inchangé | Automatisation navigateur ciblée passée |
| Terre / géographie | Un tunnel applique des retouches `flatten` V3 localisées ; suppression, changement, Undo/Redo traités ensemble | Implémenté, tests |
| Réédition des tunnels | Les hauteurs de référence sont recalculées sans les anciens traits appartenant au même tunnel | Corrigé, test de non-régression |
| Export et compilation | Asset procédural interne vérifié dans `verifyAssets`, modèle + édition dans archive V3, compilation en descripteurs | Implémenté, tests |
| Runtime | Conversion de `NaturalStructure` vers un `Placement`, création de la voûte et 16 collisions décomposées | Implémenté, tests |
| États gameplay | Les sous-colliders renvoient au véritable ID de l'entité porteuse, pas à un état inexistant | Corrigé |
| Prefabs | Capture visuelle classique refusée (impossible de copier une excavation par simple Visual) | Corrigé |
| Transformations | Translation/rotation/échelle génériques interdites : conserver l'alignement physique et géographique via l'éditeur spécialisé | Test |
| Scène 3D | Les sources auteur continuent à utiliser `addPlacement` et les secteurs chargés ; aucune géométrie mondiale figée | Implémenté |
| Monde jouable | Les vues naturelles sont instanciées **uniquement près du joueur** et libérées à distance | Implémenté, tests |

## 2. Profil de coût (borne théorique, pas benchmark matériel)

- Voûte : **132 triangles** et **1 draw call** par ouvrage visible, au lieu de 192 triangles.
- Chaque mesh contient 396 sommets non indexés, avec positions/couleurs/normales en Float32, soit environ **14,3 Ko de buffers d'attributs** sans compter CPU, matériaux et surcoûts GPU.
- `createNaturalView` limite à **48 ouvrages affichés simultanément**, donc **6 336 triangles**, **48 draw calls** et environ **684 Ko d'attributs GPU nominaux** au maximum pour ces voûtes uniquement.
- Rayon d'affichage 260 m, hystérésis 24 m ; réévaluation du voisinage si le focus se déplace d'au moins 16 m. Le mesh d'un ouvrage lointain n'est pas alloué.
- Les ombres portées ont été désactivées sur ces structures : évite des soumissions supplémentaires aux shadow maps sur matériel économique.
- Chaque structure génère **16 colliders AABB** (aucun mesh collider, aucun collider plein dans l'ouverture). Ces descripteurs restent dans le monde logique même si la géométrie n'est pas affichée.
- Un tunnel génère au maximum **25 retouches locales** du heightfield selon sa taille ; cette limite est validée avant l'enregistrement.
- Aucun GLB externe ni système CSG/voxel global n'est nécessaire ; les GLB existants restent disponibles aux autres outils.

**À ne pas confondre** : cette borne concerne exclusivement la géométrie de *structures naturelles*, pas le terrain, la végétation, les personnages ou les autres meshes. Elle ne démontre pas un débit de 30 FPS sur mobile. Les pics de création/libération de plusieurs meshes pendant un déplacement rapide doivent encore être profilés sur un vrai appareil.

## 3. Régressions éliminées

1. Le catalogue source auto-généré des assets n'est pas modifié : l'asset interne `procedural.natural_structure` est reconnu explicitement par le compilateur.
2. Le parser d'entité exige le `Visual` attendu, un `Transform`, une échelle unitaire et l'absence de `Collider` plein avec `NaturalStructure`.
3. Les trous creusés dans le relief portent un préfixe stable relié à l'ID de l'entité ; suppression et Undo/Redo reconstruisent le relief.
4. Les anciens traits d'excavation sont omis lors du calcul de la nouvelle hauteur de référence en mode modification, pour éviter un approfondissement cumulatif.
5. Les copies d'un assemblage visuel, et les outils génériques de transformation/duplication, ne peuvent pas casser silencieusement une structure naturelle.
6. Les faces internes des 16 blocs graphiques sont supprimées et les meshes lointains libérés au lieu d'être seulement cachés.
7. Le test navigateur de l'ancien gizmo attend maintenant le rafraîchissement de l'inspecteur après Undo, afin d'éviter de conclure trop tôt à une régression.

## 4. Risques encore ouverts

- Les **tunnels sont des couloirs excavés dans un heightfield et coiffés d'une voûte locale**, pas des soustractions booléennes dans la montagne. Les interfaces entre rochers, côtes de pente et couverture naturelle doivent être examinées visuellement.
- La collision du dessus est une approximation de la voûte par **16 boîtes AABB**. La présence d'une surface au-dessus et le passage libre dessous sont testés, mais le franchissement continu de *toutes* les combinaisons de portée, courbure et dénivelé n'est pas prouvé ; les rampes très raides peuvent rester non franchissables par la marche.
- Les colliders du monde compilé ne sont pas encore streamés géographiquement comme les meshes ; une carte contenant des centaines de structures augmentera le coût logique de démarrage et la mémoire CPU malgré la grille spatiale de collision.
- Pas d'essai sur GPU mobile réel : les captures Chromium/SwiftShader et les budgets statiques sont seulement des indicateurs.
- Le format legacy V1/V2 reste distinct et ne sait pas représenter `NaturalStructure` ; le chemin officiel est le projet V3 compilé. Ne pas ouvrir un monde V3 en lui appliquant l'ancien parseur V1/V2.

## 5. Validation

- `tests/studio-natural-structures.test.mjs` : profils, contraintes dimensionnelles, passage dessous/dessus, source V3, rendu, compilation, suppression / Undo/Redo, non-régression des tunnels réédités, protection des assemblages.
- `tests/studio-natural-view.test.mjs` : géométrie non allouée à distance, culling, plafond 48, throttle, libération de ressources.
- `tools/test-studio-natural-structures-browser.mjs` : création, ghost, réglages, export ZIP, édition, Undo/Redo, excavation.
- `tools/test-local-browser.mjs` : attente du retour de l'inspecteur après annulation du déplacement au gizmo.
- Suite : `npm test`, `npm run build`, commandes de génération de cartes, tests navigateur, compilation et démarrage du lecteur compilé.

Ne qualifier **ni** la traversabilité intégrale sur terrain extrême **ni** les performances mobiles comme garanties avant la recette manuelle et les mesures matérielles.
