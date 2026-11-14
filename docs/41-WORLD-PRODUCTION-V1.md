# 41 — World Production V1 : biotopes, presets de paysages, assets et première île peuplée

**Date : 14 novembre 2026. Branche : `claude/little-world-production-v1-eym947` (rôle de `feat/world-production-v1`), partie de `main` à `b2d2b9d`.**
Statuts employés : `SPECIFIED → IMPLEMENTED → TESTED → BENCHMARKED → RELEASED`. Aucune mesure de ce document n'est une qualification sur GPU intégré réel : les rendus et cadences proviennent de Chromium headless + **SwiftShader** (rastériseur logiciel), signal de régression seulement. Rien n'est publié sur GitHub Pages par cette branche.

Ce document complète [33 — Geography Engine](33-GEOGRAPHY-ENGINE-CARTE-2D.md), [15 — Schémas V3](15-STUDIO-DATA-SCHEMAS-V3.md), [17 — Horizon](17-DISTANT-VIEW-RENDERING.md), [18 — Herbes](18-GRASS-LOW-RESOURCE.md), [20 — Blender/GLB](20-BLENDER-STUDIO-INTERCHANGE.md), [21 — Eau](21-WATER-HYDROLOGY-LOW-RESOURCE.md) et [22 — Budget](22-RESOURCE-BUDGET-MANAGER.md). Il n'ajoute **ni second moteur géographique, ni second gestionnaire de ressources, ni second éditeur, ni brouillard, ni backend**.

## 0. Synchronisation et audit (WP-0)

| Vérification | Résultat |
| --- | --- |
| `main` réel | `b2d2b9d` (« Merge pull request #13 ») |
| `feat/little-world-assets` intégrée | **oui** : `git merge-base --is-ancestor origin/feat/little-world-assets origin/main` vrai (fusion `27968b0`) |
| Manifestes et GLB attendus | 13 manifestes, **130 GLB présents**, **toutes les empreintes SHA-256 des manifestes correspondent** aux fichiers (0 erreur) |
| Autres branches actives | `feat/living-world-editor` (docs), `claude/studio-inspector-edit-guard` (1 commit Studio), `claude/bold-*` (fusionnées) — aucune modifiée |
| Baseline tests | `npm test` 295/295, `npm run typecheck` OK |
| Ressources externes | **non téléchargées** : `kenney.nl` et `quaternius.com` refusés par le proxy réseau de la session (HTTP 403). Besoins documentés § 2.3, aucun fichier inventé |

État trouvé : le Geography Engine (archipel, classification, masques, habillage procédural G5, workers, carte 2D) était implémenté et testé ; **aucun GLB de la branche d'assets n'était utilisé par le runtime** (seuls `pine/rock/crate.glb` historiques) ; l'île publiée était un preset « île unique » sans contenu auteur.

## 1. Architecture livrée

```text
Sources V3 (projet Studio)                       ┌──────────── assets/world-assets.json (généré, WP-1)
  world.terrain (archipel) ◄── formes des presets │  60 assets, 130 GLB mesurés + usages géographiques
  chunks[*].layers ◄────────── masques des presets│
  libraries.water/paths/zones ◄ eau, chemins, zones
  entités (Visual = asset du registre)  ◄─────────┘
  libraries.landscapes  ◄── NOUVEAU (facultatif) : instances de presets + trace de génération
          │
          ▼  Geography Engine (inchangé dans son rôle : classification = autorité)
  classifyPoint ─► profileOf (10 biotopes) ─► generateDressingCell v2 (espèces + reliefs)
          │            ▲ landscapeInfluenceAt (régions douces des presets)
          ▼
  World Compiler (inchangé) : masques par secteur, logique globale (libraries.landscapes)
          ▼
  Runtime : DressingView (2 BatchedMesh LOD0/LOD1 + silhouettes) · PlacedInstances (2 BatchedMesh)
            · objets placés en THREE.LOD réel · PresentationBudget unique (inchangé)
```

| Module | Rôle | Fichier |
| --- | --- | --- |
| Inventaire GLB | lit manifestes + GLB (triangles, bornes, pivot, matériaux, textures, couleurs de sommets, empreintes) | [tools/build-world-assets.mjs](../tools/build-world-assets.mjs) |
| Usages | rôle, habitats, collision, échelle, instancing, empreinte au sol | [src/world-production/asset-usage.ts](../src/world-production/asset-usage.ts) |
| Registre | catalogue unique (placement manuel, presets, biotopes), diagnostics | [src/world-production/registry.ts](../src/world-production/registry.ts) |
| Biotopes | 10 profils, espèces, écotones, régions de paysage | [src/world-production/biotopes.ts](../src/world-production/biotopes.ts) |
| Habillage | espèces + reliefs (falaises, éboulis, berges, dunes, marais) | [src/geography/dressing.ts](../src/geography/dressing.ts) |
| Bibliothèque GPU | GLB → géométries aplaties partagées | [src/world-production/species-library.ts](../src/world-production/species-library.ts) |
| Rendu | BatchedMesh LOD0/LOD1 + silhouettes + repli | [src/dressing-view.ts](../src/dressing-view.ts), [placed-instances.ts](../src/world-production/placed-instances.ts) |
| Presets | contrat, 10 presets, application/régénération/suppression | [landscape-schema.ts](../src/world-production/landscape-schema.ts), [landscape-presets.ts](../src/world-production/landscape-presets.ts), [landscapes.ts](../src/world-production/landscapes.ts) |
| Hydrographie | tracé par plus grande pente (puis validation WATER) | [src/world-production/hydro-trace.ts](../src/world-production/hydro-trace.ts) |
| Studio | module « Paysages », bibliothèque unifiée | [src/studio/landscapes-panel.ts](../src/studio/landscapes-panel.ts), [src/studio/library.ts](../src/studio/library.ts) |

## 2. Assets (WP-1)

### 2.1 Inventaire et usage

`npm run generate:world-assets` (CI : `npm run check:world-assets`) produit [assets/world-assets.json](../assets/world-assets.json) à partir des **vrais fichiers** : 60 assets, 130 GLB, 945 296 octets, 0 texture embarquée, empreintes conformes. Les GLB d'origine ne sont **jamais modifiés**.

| Famille | Disponibles | Intégrés (registre + code) | Qualifiés runtime* | Utilisés dans le monde | Non utilisés |
| --- | --- | --- | --- | --- | --- |
| Arbres (lots 1-2) | 12 | 12 | 12 | 12 (génération) | — |
| Arbustes | 3 (+3 du lot V2 « haies ») | 6 | 6 | 6 (génération) | — |
| Petites plantes | 8 | 8 | 8 | 8 (génération) | — |
| Bois mort | 3 | 3 | 3 | 3 (génération + ruines) | — |
| Haies | 2 | 2 | 2 | 1 (`hedge_low`) | `hedge_dense` |
| Clôtures / poteaux | 6 | 6 | 6 | 5 | `fence_split_rail` |
| Murets | 5 | 5 | 5 | 4 | `wall_straight` |
| Ponts | 3 | 3 | 3 | 2 (`bridge_stone`, `bridge_wooden_arch`) | `bridge_log` |
| Ponton | 5 | 5 | 5 | 1 (`dock_tile`) | bollard, ladder, post, ramp |
| Bâtiments | 5 | 5 | 5 | 5 (maisons, cabane, phare, moulins) | — |
| Bateaux | 2 | inventoriés | — (système bateau existant) | 0 | rowboat, sailboat |
| Historiques | 3 | 3 | 3 | `pine` (seul conifère) | `rock`, `crate` |

\* « Qualifié runtime » = chargé, rendu et testé dans Chromium/SwiftShader par les contrôles navigateur et les captures (pas une qualification GPU réel ni une validation artistique).

Utilisation mesurée (île + référence, entités auteur) : 509 modules de clôture de pâturage, 44 de clôture à piquets, 7 portillons, 21 poteaux, 214 haies basses, 196 murets (irréguliers, moussus, angles, extrémités), 28 souches moussues, 19 maisons/cabanes, 3 phares, 2 moulins à vent, 1 moulin à eau, 5 ponts (pierre, arche en bois), 14 pontons ; la végétation instanciée utilise **30 espèces** de la bibliothèque.

### 2.2 Constats techniques (corrigés sans toucher aux GLB)

| Constat | Correction |
| --- | --- |
| `COLOR_0` des GLB écrit en **octets sRGB** (générateurs trimesh), interprété en linéaire par glTF → couleurs délavées | conversion sRGB → linéaire à l'import (instances et objets placés) |
| GLB **sans matériau** → matériau glTF par défaut **métallique** → bâtiments noirs sans carte d'environnement | matériau Lambert partagé à couleurs de sommets |
| `bush_round` (+0,205 m), `bush_irregular` (+0,096 m) et 4 autres modèles au-dessus de leur pivot | décalage vertical calculé à l'instanciation (`groundOffset`), diagnostic `ASSET_PIVOT` |
| `pine.glb` : 1 seul LOD, 2 matériaux, 20 triangles | conservé (seul conifère) ; diagnostic `ASSET_SINGLE_LOD` |
| Bosquets rejetés (`grove_*`) | absents du registre ; test dédié |

### 2.3 Ressources externes

**Aucune ressource externe ajoutée** (réseau refusé). Familles insuffisamment couvertes, enregistrées comme besoins : **conifères** (un seul sapin historique de 20 triangles), **rochers / modules de falaise, arches, surplombs, entrées de grotte** (rochers procéduraux instanciés en attendant), **plantes de dune et côtières dédiées** (réutilisation de `broadleaf_plant`/`reeds_patch`), **bois flotté** (réutilisation de `log_fallen`), **plantes volcaniques**. Candidats à vérifier (licence CC0 annoncée, à confirmer sur la page officielle avant import) : Kenney Nature Kit, Quaternius Stylized Nature MegaKit.

## 3. Biotopes et habillage (WP-2/WP-3)

La classification du Geography Engine reste l'autorité (masques auteur d'abord). Un **profil** précise ensuite ce qui pousse, en quelles proportions et comment il se mélange à ses voisins. Contrat : altitude préférée, pente maximale, géologies, humidité, distance à la mer et à l'eau douce, densités (arbres, arbustes, sol, bois mort, rochers), mélanges d'espèces, ouverture, taille, largeur d'écotone, transitions, variantes.

| Profil | Génération | Végétation (espèces) | Transitions | Tests | Limites |
| --- | --- | --- | --- | --- | --- |
| Forêt tempérée | `forest` | feuillus ronds/hauts, noisetiers, sapins, jeunes arbres ; fougères, mousses, champignons ; souches, troncs | prairie, vallée humide, marais, montagne, lande | `biotopes.test` | un seul conifère |
| Prairie | `meadow`, `village` | arbres isolés en bosquets, cerisier ; fleurs sauvages/hautes | forêt, montagne, plage, vallée humide | idem | herbe courte = couleur du sol (doc 18) |
| Vallée humide | forêt/prairie humides près de l'eau | feuillus hauts, noisetiers ; fougères, roseaux, mousses | forêt, prairie, marais | idem | — |
| Marais | `wetland` | arbres morts, roseaux (y compris en eau < 0,6 m), mousses, souches | vallée humide, forêt | idem | pas de plantes aquatiques flottantes |
| Montagne | `mountain` | sapins, arbres morts ; buissons irréguliers ; rochers, blocs en pied de pente | prairie, forêt, volcan, lande | idem | — |
| Lande | `scrub` humide | buissons irréguliers ; rares sapins | prairie, montagne, zone sèche, côte rocheuse | idem | pas de bruyère dédiée |
| Littoral sableux | `coast` + sable | buissons ronds ; plantes de dune ; bois flotté ; **palmiers seulement si un paysage l'autorise** | prairie, côte rocheuse, marais | idem | plantes de dune réutilisées |
| Littoral rocheux | `coast` + roche/falaise | rares sapins ; rochers de falaise, galets | plage, lande, montagne | idem | — |
| Volcanique | `volcanic` | arbres morts rares ; basalte en colonnes, rochers sombres | montagne, lande, zone sèche | idem | — |
| Zone sèche | `scrub` très sec loin de l'eau | arbres tordus ; buissons irréguliers ; rochers | lande, volcan, prairie | idem | — |

**Répartition naturelle** : treillis de 4 m tiré par graine + cellule (inchangé), bosquets/clairières par bruit basse fréquence (forêts) et bosquets épars (milieux ouverts), **écotones** : le profil d'un candidat est lu sur une grille de 16 m à un point décalé (≤ 32 m) → pénétration mutuelle des lisières sans frontière nette, indépendante de l'ordre des secteurs (test « ecotones »).
**Reliefs** : rochers de falaise, **blocs en pied de pente** (courbure concave), éboulis, galets de plage, **galets et roseaux de berge**, **ripisylve** (arbres riverains < 26 m), **roselières** en eau peu profonde, **plantes de dune** et **bois flotté** sur le haut de plage, colonnes de basalte. Exclusions inchangées et testées : routes, bâti (empreintes mesurées), champs, zones réservées (arbres), sous l'eau.
**Déterminisme** : même source + graine + version (`DRESSING_VERSION = 2`) + cellule = mêmes éléments ; aucune donnée par plante n'est stockée.

## 4. Presets de paysages (WP-4)

Contrat `libraries.landscapes` (facultatif, validé, compatible avec tous les projets existants) : ID stable, preset + version, nom, graine, centre, emprise (largeur × longueur), orientation, paramètres bornés, **trace de génération** (empreinte canonique de chaque élément produit, cellules de masque peintes). Un preset écrit des **données auteur rééditables** ; la végétation reste générée.

**Politique de priorité manuelle (explicite)** : un élément est « possédé » tant que son empreinte est inchangée ; une régénération ne remplace que le contenu possédé ; le contenu **modifié** est conservé et **détaché** (rendu à l'auteur), le contenu **supprimé** n'est pas recréé, les **cellules corrigées** ne sont jamais repeintes — sauf écrasement **confirmé**. Les cellules égales à la valeur déjà calculée par le moteur ne sont pas stockées. Toute rivière produite doit passer la **compilation hydrographique WATER** (sinon inversée vers l'aval, sinon sans cascade, sinon refusée avec diagnostic).

| Preset | Fonction | Données produites | Édition Studio | WATER / PHYS | Statut |
| --- | --- | --- | --- | --- | --- |
| `forest-valley` | vallée boisée, clairières, sous-bois humide | forme vallée, masques forêt/clairières/humidité, ruisseau tracé selon la pente, passerelle | oui | ruisseau validé WATER ; collisions des entités inchangées | TESTED |
| `river-bend` | méandre, berges, poches de marais, pont | lit (vallée), rivière tracée/validée, masques humides, pont en pierre étiré sur la portée | oui | validée WATER, inversion automatique vers l'aval | TESTED |
| `rocky-cliff` | escarpement, roche apparente, éboulis | crête raide, masques roche/éboulis | oui | — | TESTED |
| `sandy-beach` | plage, sable sec/humide, dunes, palmiers en option | masques sable/littoral (si différents du calcul), région littoral | oui | diagnostic si pas de mer | TESTED |
| `marsh-basin` | dépression, étangs, roselières, îlots praticables | cuvette + cuvettes d'étangs, lacs à niveau constant, masques marais/humidité/îlots | oui | lacs validés ; étang refusé si cuvette trop plate | TESTED |
| `mountain-pass` | deux sommets, crête, col, sentier | 2 massifs + crête, éboulis, sentier | oui | — | TESTED |
| `waterfall-gorge` | gorge, cascade, bassin | marche nette + gorge + bassin, rivière avec cascade explicite haut/bas posée sur la marche, lac du bassin | oui | cascade `falls` validée WATER | TESTED |
| `volcanic-field` | basalte, cendres, coulées, cône en option | masques basalte/cendre/volcanique, cône facultatif | oui | — | TESTED |
| `ancient-ruins` | replat, murets effondrés, pierres, sentier | plateau, murets irréguliers/moussus + angles/extrémités, souches moussues, sentier, région « ruines » | oui | collisions des murets (entités) | TESTED |
| `village-clearing` | village, place, chemins, jardins, verger, champ, moulin | replat, maisons/cabanes (emplacements plats), chemins, jardin à piquets + portillon, haie de verger, champ (zone AGRI) clôturé avec portillon, moulin à vent, régions prairie/verger | oui | zone `farm-plot` lue par AGRI ; aucune simulation ajoutée | TESTED |

Studio (module **Paysages**, même vue 3D, même historique) : choix du preset, emprise orientée dessinée sur le relief, centre / taille / orientation / graine / paramètres, **aperçu à blanc chiffré**, application ou régénération en **une transaction**, liste des paysages (voir, modifier, régénérer, supprimer), écrasement des retouches **sur confirmation**. Bibliothèque d'objets : un seul catalogue (registre + historique) avec miniatures réelles, dimensions, LOD, triangles, coût indicatif, licence, statuts, usages ; placer un asset du registre l'ajoute au projet dans la même transaction.

## 5. Scène de référence et île (WP-5 / WP-6)

**Référence ≈ 1 km²** — `npm run generate:production-reference` → [maps/production-reference.project.json](../maps/production-reference.project.json), copie Studio (bouton « Scène de référence World Production »), monde compilé `public/maps/production-reference/` (`?world=maps/production-reference/manifest.json`). 8 paysages + phare, ponton, moulin à eau, entrée de mine, 4 chemins. Les **16 situations exigées** sont vérifiées par `tests/production-reference.test.mjs` (forêt, clairière, prairie, vallée, cours d'eau, **cascade WATER**, lac/bassin, falaise, plage, transition rocheuse, ensemble bâti, pont, chemins, mine, parcelle, ≥ 10 assets de la branche).

**Île 3 × 8 km** — `npm run generate:island` (CI : régénération + `git diff --exit-code`) : générateur archipel éditable (volcan nord 540 m avec cratère, crête et vallée nord, deux massifs centraux reliés par une crête, vallée centrale, collines, estuaire, 2 îlots) et **24 paysages** ; port (ponton), deux phares, mine du massif ouest (zone MINE), 6 itinéraires (village → forêt → mine, village → hameaux, village → port, ruines, lac → volcan).

| Objectif de composition | Visé | Obtenu (source) |
| --- | --- | --- |
| Grand volcan | 1 | 1 (+ petit cône de scories) |
| Massifs secondaires | 2–3 | 2 + col de montagne |
| Vallées | 3–5 | 5 (nord, centrale, estuaire, 2 vallées forestières) |
| Cours d'eau | 3–5 | 4 rivières/ruisseaux + 2 rivières de gorge, tous validés WATER |
| Lacs / étangs | 1–2 | 5 étangs et bassins (1 étang refusé : cuvette trop plate) |
| Cascades | 1–3 | 2 (niveaux haut/bas explicites) |
| Plages | 4–6 | 4 presets + plages générées |
| Falaises | 3–5 | 3 presets + côtes à falaises générées |
| Massifs forestiers | 3–4 | 2 vallées forestières + forêts générées des massifs |
| Village / hameaux | 1 + 1–2 | 1 village (8 maisons) + 2 hameaux |
| Ruines | 2–3 | 3 |
| Mine | 1 | 1 |
| Secteurs agricoles | 1–2 | 2 parcelles clôturées |

Le monde reste visible jusqu'à l'horizon **sans brouillard** ; la taille de l'île n'a pas été réduite.

## 6. Coûts et optimisations (WP-7)

Optimisations appliquées : un **BatchedMesh par LOD** pour toutes les espèces (au lieu d'un objet par arbre), **culling par instance**, pas de tri, aucune mise à jour par image (reconstruction seulement quand la cellule de focus change) ; **modules de clôtures/murets/haies/ponton en BatchedMesh** dans le jeu (vue du village : **300 → 138 appels**) ; vrais LOD GLB des objets placés (`THREE.LOD`) ; écotones par grille mémorisée (coût de l'habillage ÷ 2 par rapport à la première version) ; **masques non stockés quand ils égalent la classification** ; matériaux partagés. Les rayons LOD (`SPECIES_RADII`, `PLACED_RADII`) sont des réglages de banc, pas des vérités.

**Mesures Node** (`tools/benchmark-geography-cpu.mjs`, minimum de 7 passages ; mêmes empreintes de sortie = résultat identique) :

| Charge | Avant (`b2d2b9d`) | Après | Variation | Lecture |
| --- | --- | --- | --- | --- |
| 48 tuiles 3D, scène de référence géographique | 128,8 ms | ≈ 130–137 ms (empreinte identique) | bruit | terrain inchangé |
| Horizon complet, référence géographique | 18,3 ms | ≈ 16–20 ms (empreinte identique) | bruit | inchangé |
| 60 cellules d'habillage, référence géographique | 18,9 ms | **≈ 35–46 ms** | ×1,8–2,4 | sortie enrichie : espèces, écotones, berges, dunes, sols |
| 60 cellules d'habillage, scène World Production | — | ≈ 37 ms | — | 0,6 ms/cellule de 64 m (Node) |

**Parcours `benchmark-route` sur l'île publiée** (SwiftShader 960 × 640, qualité « équilibré », même itinéraire ; deux exécutions par variante) :

| Mesure | Avant (île preset, sans contenu) | Après (île peuplée) | Après, `?glb=0` (repli procédural) |
| --- | --- | --- | --- |
| p50 / p95 / p99 (ms) | 50 / 117–133 / 200–367 | 66,7 / 150–183 / 283–317 | 66,7 / 150 / 267 |
| Images > 100 ms | 32–49 | 65–82 | 61 |
| Appels moyens / triangles moyens | 82–84 / 40,1–43,9 k | 90 / 45,7 k | 91 / 45,6 k |
| Mise à jour CPU / soumission JS par image | 0,50 / 1,05 ms | 1,10 / 1,88 ms | 1,02 / 1,76 ms |
| Démarrage / stabilisation | 3,2–3,8 s / 0,03–0,12 s | 5,6 s / 0,5–0,7 s | 5,2 s / 0,6 s |
| « Trous » (fond visible sous l'horizon) | 0 | 0,08 % moyen, 0,29 % max | 0,06 % / 0,24 % |

Rapports bruts : [avant](benchmarks/2026-11-14-route-world-production-before.json), [après](benchmarks/2026-11-14-route-world-production-after.json), [après `?glb=0`](benchmarks/2026-11-14-route-world-production-after-glb0.json).

**Lecture honnête** : sur ce parcours, la végétation GLB elle-même ne coûte rien de mesurable (`?glb=0` donne les mêmes chiffres) ; la dégradation vient du **contenu de l'île** (939 paquets auteur lus au démarrage — limite connue du lecteur, pas encore de streaming des paquets auteur —, chemins, eau, entités, relief plus accidenté). Les « trous » mesurés sont de l'ordre de quelques pixels sur 2 560 points et apparaissent dans les caps tournés vers les nouveaux reliefs côtiers : à investiguer (silhouettes lointaines de falaises). **Aucune cible 30/20 FPS n'est déclarée atteinte** ; SwiftShader n'est pas un GPU intégré.

Bundles : JS total 1,39 → 1,59 Mio (registre JSON + modules) ; worker géographique inchangé dans son rôle (les profils de biotopes y sont inclus, pas le registre).

## 7. Tests et contrôles

| Catégorie | Contenu | Résultat |
| --- | --- | --- |
| Node (`npm test`) | 317 tests (295 avant) dont `world-assets` (5), `biotopes` (6), `landscapes` (7), `production-reference` (4) ; suites existantes inchangées et vertes | 317/317 |
| Déterminisme | habillage (ordre de génération), presets (deux applications), régénération sans effet, référence = sortie du générateur | TESTED |
| Compilation / import-export | projet → monde compilé → lecteur runtime (paysages, eau, zones) ; aller-retour du schéma (`parseProject`) ; Undo/Redo exact | TESTED |
| Navigateur (build de production, `vite preview`) | `tools/test-landscapes-browser.mjs` (12 contrôles, ajouté à la CI) + 15 suites existantes : legacy (16), published, studio, island (11), local, editor, editor-world, selection, geo-edit, paths, water, gameplay, b1, b1-studio, lights | **16/16 suites vertes** localement (SwiftShader) |
| Visuel | `tools/capture-world-views.mjs` + [tools/world-views.json](../tools/world-views.json) : 18 points de vue (panorama depuis le volcan, forêt dense, vallée, rivière et berges, falaise depuis sa base, littoral, village, planage, cascade) ; tableau avant/après avec appels et triangles : [docs/captures/README.md](captures/README.md) | captures reproductibles, **pas une approbation artistique** |

## 8. Limites restantes

1. **Streaming des paquets auteur** : l'île compte 939 secteurs auteur lus au démarrage (≈ 1,3 Mio) ; à streamer par la priorité caméra existante (R-02/R-06).
2. **Ressources externes non importées** (réseau) : conifères, modules de falaise/arches/grottes, plantes de dune et volcaniques restent des besoins.
3. **Liens hydrographiques** entre presets non automatiques (`from`/`to` non posés) ; certains étangs refusés quand la cuvette est trop plate ; une cascade exige une marche nette du relief.
4. Les **paysages qui se chevauchent** : le premier appliqué garde ses cellules de masque (le second les voit comme corrections).
5. Les **dunes** sont un habillage (sable, plantes), pas un relief propre.
6. Les objets placés hors modules répétitifs restent un objet par entité (bâtiments) ; la visibilité par distance des objets placés est celle du runtime existant.
7. Petits « trous » (≤ 0,3 % des points) relevés par le banc de parcours sur l'île peuplée.
8. Aucune mesure sur GPU intégré réel ni Firefox ; validation artistique des vues à faire par le propriétaire.

## 9. Tableau de statut

| Mécanisme | Spécifié | Implémenté | Testé | Benchmarké | Publié |
| --- | --- | --- | --- | --- | --- |
| Registre d'assets mesuré + usages | oui | oui | oui | taille, chargement | non |
| GLB de végétation instanciés (LOD0/LOD1 + silhouettes) | oui | oui | oui (navigateur, captures) | parcours île, `?glb=0` | non |
| Objets placés du registre (vrais LOD) + modules instanciés | oui | oui | oui | appels de la vue village | non |
| 10 profils de biotopes, écotones | oui | oui | oui | coût Node | non |
| Habillage des reliefs (falaises, berges, dunes, marais) | oui | oui | oui | coût Node | non |
| 10 presets + priorité manuelle + Undo/Redo | oui | oui | oui | — | non |
| Studio « Paysages » + bibliothèque unifiée | oui | oui | oui (navigateur) | — | non |
| Scène de référence ≈ 1 km² | oui | oui | oui (source + compilé) | captures | non |
| Île 3 × 8 km peuplée | oui | oui | oui (source, compilé, navigateur) | parcours SwiftShader | non |
| Qualification GPU intégré / PC de référence | oui | — | — | **non** | non |
