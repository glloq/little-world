# 18 — Herbes ultra-low-resource : herbe courte, herbe haute et réaction au passage

**Décisions validées le 12 novembre 2026.** Cible : prairies visuellement riches dans le style low-poly de Little World, **avec un coût additionnel CPU/GPU presque nul**, y compris lorsque le joueur marche, plane, nage à proximité du rivage ou lorsque plusieurs personnages traversent une zone.

**Statut : architecture et budgets d'essai, pas performances déjà atteintes.** Le code actuel dispose d'une végétation écologique instanciée, mais **aucun système complet d'herbe haute réagissant aux joueurs ne doit être présumé livré**.

Références : [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [17 — Horizon sans brouillard](17-DISTANT-VIEW-RENDERING.md), [15 — V3 Studio](15-STUDIO-DATA-SCHEMAS-V3.md), [16 — Multijoueur futur](16-FUTURE-MULTIPLAYER.md), [10 — Performance](10-PERFORMANCE-ROADMAP.md).

## 1. Principes non négociables

1. **Le sol donne déjà l'impression d'être herbeux.** Herbe courte = couleurs de terrain, variations de biome et motifs précalculés (vertex colors ou texture/atlas simple existant). Aucune géométrie par brin.
2. **La géométrie 3D est un supplément visuel local, entièrement facultatif.** Conserver une prairie cohérente si l'herbe 3D est désactivée par qualité minimale, environnement chargé ou GPU insuffisant.
3. **Herbe haute à géométrie très légère :** petites touffes opaques, en général **2–4 triangles** (plus uniquement si un benchmark visuel le justifie), partageant matériau et mesh.
4. **Aucune physique individuelle, collision de brin, rigid body ou boucle de mouvement CPU par touffe.** Déformation facultative en vertex shader, racines ancrées.
5. **Aucune ombre dynamique d'herbe** (ni `castShadow` ni `receiveShadow`). Couleurs plus sombres près du sol si besoin ; ne pas ajouter une passe d'ombres.
6. **Pas de transparence de masse.** Préférer géométrie opaque et couleurs de sommets ; alpha, alpha-to-coverage ou billboards seulement si l'efficacité **GPU réelle** est supérieure.
7. **Touffes groupées spatialement et rendues avec `InstancedMesh`.** Pas de `Mesh` par plante ; éviter aussi un groupe géant qui force à dessiner une plaine entière.
8. **Génération déterministe par secteur** depuis biome, seed, version, densité, exclusions et relief ; stockage de paramètres source, **pas** d'IDs persistants pour chaque touffe.
9. **Zéro trafic réseau spécifique à l'herbe** : déformation purement cosmétique locale. La position des personnages, déjà connue du client, suffit ; aucun état de végétation partagé.
10. **Aucun brouillard de dissimulation** des zones dépourvues d'herbe 3D : l'aspect lointain est repris par couleur/motifs de terrain et silhouettes de biotope.

**Règle de qualité :** en mode ultra-économique, l'herbe procédurale peut être entièrement désactivée **sans modifier le relief, les déplacements, les interactions ou la visibilité globale**.

## 2. Trois couches indépendantes

| Couche | Visuel | Production | Coût à l'image |
| --- | --- | --- | --- |
| **1 — Sol herbeux** | Couleur, densité apparente, variation basse fréquence intégrée au terrain | Mise à jour uniquement à la génération/édition des biotopes et des chunks de terrain | **Pas de draw call distinct** si réutilisation du matériau de terrain ; léger coût de shading existant |
| **2 — Touffes 3D proches** | Quelques centaines de touffes visuellement réparties, surtout herbe haute | Instances opaques, regroupées par secteur utile | Dessin + sommets/pixels effectivement présents, pas de CPU par touffe |
| **3 — Réaction locale** | Sommet ployé au vent/passage, base immobile | Uniformes de position/vitesse proches ; vertex shader léger | Seulement sur instances visibles/qualifiées ; désactivable |

**Herbe courte (≈ 5–20 cm) :** privilégier la couche 1 ; quelques rares touffes près de la caméra seulement si cela apporte un gain visuel. **Herbe haute (≈ 40–100 cm) :** couche 2, réservée aux prairies, roseaux et habitats correspondants, avec couche 3 localisée.

Les herbes au-delà de la bande proche **ne restent pas en géométrie détaillée**. Leur couleur, l'aspect des masses de végétation et les proxies lointains sont assurés par les couches du [document 17](17-DISTANT-VIEW-RENDERING.md), sans brouillard ni coupure visible.

## 3. Budgets initiaux : profils dynamiques, valeurs non garanties

| Paramètre expérimental | **Ultra-économique** | **Équilibré (départ recommandé)** | **Plus dense (si marge GPU)** |
| --- | --- | --- | --- |
| Portée touffes proches | **5–7 m** | **8–12 m** | **12–18 m** |
| Touffes courtes 3D actives | **0–100** | **200–500** | **500–1 000** |
| Touffes hautes actives | **150–400** | **500–1 200** | **1 500–3 000** |
| Géométrie haute | **2–4 triangles/touffe** | **2–4 triangles/touffe** | **2–4 triangles/touffe** |
| Triangles herbe haute indicatifs | **300–1 600** | **1 000–4 800** | **3 000–12 000** |
| Influence personnages proches | **1** | **1–2** | **2–4** |
| Ombres dynamiques herbe | **0** | **0** | **0** |
| Effet de réaction | Optionnel | Oui, local | Oui, local |

Le **nombre de touffes actives** est un plafond visuel par caméra, **pas** le nombre de plantes pouvant être décrites par les biotopes. Ces chiffres sont des **hypothèses à calibrer sur GPU intégré**, notamment l'effet de la résolution et du coût des draw calls. La densité autorisée dépend du coût du **reste de la scène** ; ne pas allouer un quota d'herbe garanti si le budget du frame est déjà saturé.

**Mode de secours supplémentaire** : `groundOnly` = aucune géométrie 3D, aucune animation ni shader de réaction ; seule la couche 1 subsiste.

## 4. Placement et chargement : anneau local en coordonnées mondiales fixes

- Générer les touffes à partir de **`worldId + generatorVersion + chunkId + biomeSeed`**, avec règles de densité/exclusion ; ne pas les réorganiser au hasard à chaque déplacement.
- Partitionner l'herbe en **petites cellules/secteurs locaux** ; activer/désactiver au franchissement de cellules ou de seuils significatifs, avec marge et hystérésis. **Ne pas reconstruire ni re-uploader le buffer d'instances chaque frame.**
- Réutiliser des buffers/instances si le joueur revient ; cache court/borné et libération explicite en cas d'éviction.
- La caméra peut tourner sans déclencher de nouveau placement. Le **frustum culling** supprime les groupes non visibles ; éviter la création de trop nombreux groupes minuscules.
- Éviter de dessiner de l'herbe sous l'eau, sur les routes, bâtiments, plages sans végétation ou hors biotopes autorisés.
- Le placement suit le terrain/heightfield ; une sculpture dans le Studio invalide **uniquement les cellules affectées**. Les objets peuvent conserver leur propre ID, pas chaque touffe.
- Le rayon peut être réduit automatiquement lorsque le joueur plane vite ou regarde le lointain ; une prairie de base reste visible au sol.

**Point d'attention :** l'anneau suit le joueur en **activant des cellules du monde**, pas en déplaçant visuellement une grille de touffes sous ses pieds : ce déplacement causerait un effet de glissement perceptible.

## 5. Animation très économique sur GPU

### Vent

- Animations appliquées au **sommet** de la touffe, racines fixes. Variation pseudo-aléatoire par **phase d'instance pré-calculée**.
- Préférer une **direction et une amplitude globales du vent** avec une forme simple et peu de fréquences ; éviter plusieurs `sin` et bruits procéduraux à chaque sommet.
- Qualité minimale : supprimer le vent ou ne l'animer que sur les touffes très proches. Aucun mouvement CPU individuel.
- Un **matériau/shader simple partagé** ; couleurs de sommet et lumière ambiante approximative plutôt que shaders PBR complexes.

### Passage d'un joueur

- Envoyer une fois par frame la position relative au monde, un rayon/force et éventuellement la direction/vitesse du joueur.
- Le vertex shader évalue une influence **localisée** avec `dot(delta, delta)` (distance au carré), `smoothstep` et `heightFactor²` ; déplacement horizontal uniquement de la partie haute.
- **Aucune boucle JavaScript sur les touffes**, `setMatrixAt()` ni `instanceMatrix.needsUpdate` à chaque frame.
- Éviter les calculs de proximité CPU par touffe ou des requêtes physiques par brin.
- Quand aucun personnage n'est proche : **matériau simple sans réaction ou branche shader uniforme cohérente**, selon ce que le benchmark montre le plus efficace. Ne pas supposer que laisser un shader coûteux actif sur 0 interaction ne coûte rien.

**Proposition de formule illustrative :**

```glsl
vec2 delta = grassWorldXZ - actorXZ;
float d2 = dot(delta, delta);
float influence = 1.0 - smoothstep(innerRadius2, outerRadius2, d2);
float tipWeight = heightFactor * heightFactor;
grassVertexXZ += bendDirection * (influence * tipWeight * strength);
```

Veiller aux repères `world/local`, au signe de `bendDirection`, à des rayons **au carré**, à une direction normalisée ou bornée et aux collisions du personnage qui demeurent inchangées. Le calcul au carré économise une racine, **mais la principale économie vient de la réduction du nombre de sommets et de matériaux**.

### Futur multijoueur

- **1–2 personnages prioritaires** en profil équilibré, pouvant inclure un autre joueur visible. Les personnages hors zone ne plient rien.
- Pour une foule, **ne pas boucler systématiquement sur des dizaines de joueurs dans chaque sommet**.
- Une texture d'influence **locale et basse résolution** (par exemple **64 × 64, deux canaux 8 bits = 8 Kio de données brutes hors overhead**) peut être testée si les positions-uniformes deviennent trop coûteuses ; **ne pas l'implémenter d'emblée**. Le coût d'upload/écriture/échantillonnage doit être comparé au shader direct.
- Si la texture est utilisée, rafraîchissement visuel moins fréquent possible (**5–10 Hz à tester**), avec retour progressif à zéro. Le rendu reste 30/20 FPS indépendamment.
- Aucun réseau pour les impacts sur l'herbe ; la [réplication des joueurs](16-FUTURE-MULTIPLAYER.md) fonctionne déjà par intérêt spatial.

## 6. Budget unique de végétation et adaptation automatique

L'herbe partage le budget de performance avec **arbres, massifs, plantes, particules, PNJ, bâtiments, terrain et foule** : éviter de fixer des plafonds isolés qui saturent collectivement un PC.

**Ordre de dégradation proposé :**

1. Retirer l'herbe **non visible** / réduire cellules actives et portée.
2. Réduire progressivement la **densité d'instances** de manière **stable et déterministe** (prioriser touffes significatives, pas clignotement aléatoire).
3. Désactiver **réaction**, puis vent cosmétique si le profil exige de minimiser le coût de vertex shader.
4. Conserver le sol coloré, mais supprimer complètement l'herbe 3D (`groundOnly`) si la charge totale exige un mode de secours.
5. Rétablir qualité avec **hystérésis** après retour durable sous budget ; pas de bascules d'une frame à l'autre.

La qualité de l'herbe doit être commandée par un **budget global de rendu**, qui prend aussi en compte les LOD des arbres, la foule et le panorama, sans jamais ralentir la simulation de déplacement à 20 Hz.

**Cibles indicatives de validation**, non garanties ni obligatoires sur tous les GPU :
- CPU récurrent propre à l'herbe, hors génération : **< 0,1 ms/frame** sur le PC de référence.
- Coût GPU additionnel : **< 0,5 ms/frame**.
- Draw calls herbe : **1–4** en scène ordinaire, hors nécessité de culling spatial.
- Mémoire GPU supplémentaire pour buffers/textures de touffes : **< 2 Mio**.
- **0** rigid body/contrainte, **0** calcul de déplacement CPU par touffe/frame, **0** octet/s propre à l'herbe.

Les plafonds doivent être évalués **à scène comparable**, avec percentiles de frametime et mesures du coût CPU/GPU lorsque disponibles. `renderer.info.render.calls` n'isole pas à lui seul le coût de l'herbe ; instrumenter ses draw calls/pass, sa présence et ses variantes.

## 7. Modularité et intégration du code existant

Créer progressivement une petite responsabilité `grass-system` à partir de `src/ecology.ts`, `src/biomes.ts` et des chunks/LOD existants ; **ne pas reconstruire le système de végétation de zéro**.

| Module logique proposé | Responsabilité |
| --- | --- |
| `GrassGenerator` | Instances déterministes par cellule, biome, exclusion et hauteur du sol |
| `GrassRenderer` | Matériau opaque partagé, culling, instances, tiers de qualité, GPU wind |
| `GrassInteractionField` | Une/few positions d'acteurs, shader de pliage local, fallback sans interaction |

Le découpage peut rester **un ou deux fichiers** tant que la complexité ne justifie pas davantage ; éviter l'abstraction prématurée et les dépendances lourdes. Pas de librairie de physique pour l'herbe.

**Données V3 :** propriétés de biotope `grassStyle/grassDensity/grassHeight/seed` facultatives, profils globaux/recettes de génération et variantes artistiques ; les buffers d'instances et silhouettes sont **des ressources dérivées**. Les pinceaux du Studio modifient une région source, déclenchent une invalidation locale, puis le runtime/éditeur reconstituent le résultat sans stocker des milliers de touffes dans le JSON.

## Vent et précipitations partagés avec l'environnement

Selon [19 — Environnement LOW-RESOURCE](19-ENVIRONMENT-WEATHER-SKY.md), l'herbe ne crée **aucun système météo autonome**.

- Le `WeatherController` fournit un **vecteur de vent commun** au shader d'herbe, aux arbres, nuages et eau ; les uniformes ne font pas recalculer les matrices de touffes.
- La neige peut modifier **la palette du terrain et, si nécessaire, la couleur d'herbes visibles** par coefficient de matériau ; ne pas recréer des milliers de touffes enneigées ni ajouter un mesh par flocon.
- En hiver/fort enneigement, **réduire ou masquer l'herbe basse** lorsque la neige la couvre ; priorité aux couleurs du sol, sans coût de végétation supplémentaire.
- Ombres : **aucune herbe ne projette de shadow map**, même si des bâtiments/arbres proches reçoivent des ombres dynamiques.
- Météo et herbe se partagent le **budget graphique global**, les précipitations et ombres ne doivent pas empêcher de basculer vers `groundOnly`.

## Berges et zones humides : adapter la végétation au réseau d'eau

Le [contrat hydrographique 21](21-WATER-HYDROLOGY-LOW-RESOURCE.md) produit **berges, rives, profondeurs et zones d'immersion** en données spatiales dérivées, exploitées par les règles d'écologie/biotopes :

- **Écarter l'herbe terrestre sous l'eau** et les touffes 3D situées à l'intérieur d'un volume de rivière/lac/mer ; utiliser des espèces aquatiques/roseaux selon zones.
- Les **rives humides** peuvent sélectionner des densités et styles propres, mais la végétation est générée par **seed + biome + cellules**, pas un mesh par plante ou une simulation d'eau/sol par touffe.
- Après modification de spline/lit/berge, invalider uniquement les **cellules écologiques concernées** et préserver les autres seeds/instances. Les LOD eau n'ont aucun effet sur la présence réelle des volumes ou sur les exclusions de végétation.
- Le vent est commun avec la météo (doc 19), **pas** le courant de rivière ; pas de déplacement CPU individuel d'herbe à cause du courant.

## Budget global PERF et végétation

[22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md) arbitre la **végétation, le terrain, la météo et l'horizon** par plafonds communs.

- `GrassRenderer`/écologie conservent leurs **instances par secteurs** et variations déterministes ; appliquent des profils `groundOnly`→dense reçus du gestionnaire **sans second régulateur autonome**.
- Les petites herbes/décorations sont sacrifiées avant le relief visible, les maisons, la nage et les personnages essentiels ; vent/animation secondaires peuvent s'arrêter sans modifier les données de biotope.
- La fréquence/charge de génération dépend d'un **quota de jobs CPU/VRAM** et de la priorité spatiale, pas du nombre global d'herbes du monde ; le côté de planage/vision bénéficie du préchargement.
- Inspecter CPU génération, GPU shader/fill-rate, draw calls/instances/caches estimés, hystérésis de distance/qualité ; pas de centaines d'effets de passage simulés sur CPU.
- Éviter de figer les profils herbe sous forme de nombre de triangles seulement : **budget de frame commun** et tests de forêts densément couvertes.

## 8. Tests et validation

**Scènes et variantes :**
1. Sol seul `groundOnly`.
2. Herbe courte proche seulement.
3. Herbe haute sans animation.
4. Herbe haute avec vent seulement.
5. Herbe haute avec 1 puis 2 personnages actifs.
6. Champ avec 10 personnages artificiels : seuls 1–2 proches prioritaires ont un impact direct ; variante de texture d'influence si implémentée.
7. Village/forêt chargé + herbes ; planage et rendu panoramique, vue basse, rotation caméra.
8. Biotope peint et retouché en Studio ; tests de régénération et Undo/Redo.

**Mesurer séparément** CPU du placement/streaming, CPU récurrent, frametime GPU si timer disponible, draw calls, triangles, uploads, buffers et textures, overdraw, mémoire et stabilité d'image. Éviter de changer simultanément la graine/le contenu/la résolution quand on compare deux techniques.

**Tests de fonction obligatoires :**
- La graine reproduit les mêmes touffes à coordonnées monde égales après aller/retour ; pas de « glissement ».
- Aucune animation CPU par individu ; pas d'upload de matrice par frame.
- La base des touffes reste collée au terrain ; le pliage n'affecte pas les collisions.
- La conversion en `groundOnly` n'affecte ni la navigation ni les états/objets du jeu.
- La densité adaptative ne produit ni trous brusques ni clignotements constants.
- Aucun fog utilisé pour masquer les changements de densité.
- Les biotopes V2 restent valides ; toute extension de schéma V3 possède migration/validation.

**Gates suggérés :** `GR-0` baseline ; `GR-1` couche sol + touffes opaques ; `GR-2` réaction 1 acteur GPU ; `GR-3` intégration aux cellules/biotopes/Studio ; `GR-4` trois profils + fallback `groundOnly` ; `GR-5` benchmarks GPU intégré et tests de foule simulée.

## 9. Frontière entre décision et implémentation

- **VALIDÉ :** herbe courte prioritairement dans le terrain ; herbe haute 3D locale très simple et optionnelle ; interaction cosmétique GPU ; zéro physique/touffe, zéro réseau, silhouettes lointaines sans fog, budget partagé/adaptatif.
- **À EXPÉRIMENTER :** distances de 5–18 m, quantités d'instances, 2–4 triangles/touffe, temps CPU/GPU, 1–4 draw calls, caches par cellule, texture d'influence 64 × 64 si nécessaire.
- **NON LIVRÉ PAR CE DOCUMENT :** shaders, module `grass-system`, éditeur d'herbes détaillé, benchmarks, intégration V3/Studio, mode multijoueur.

La cible est une prairie **visuellement convaincante mais graphiquement dispensable**. Le rendu d'herbe ne doit jamais déterminer la cadence, la logique de jeu, la capacité réseau ou la visibilité du monde.
