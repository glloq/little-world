# 88 — Mine V5 · rendu rocheux, casque et rendement stable

## Portée du premier lot

Branche `feat/mine-visuals-yield-v1`, PR #76. Aucune fusion automatique.

La mine reste une grille excavable **2,5D** avec les mêmes cellules, sauvegardes,
outils, accès multi-niveaux et commerce. Seule la représentation et la politique
de fragments évoluent dans ce premier lot.

### G1 — Budget de rendu : implémenté

- `src/activity-view.ts` : ne calcule/rend que les chunks de **l'étage actif**.
  Les étages proches ne sont plus mesurés comme visibles à travers le puits.
- Le monte-charge utilise toujours `preloadMineLevel()` pour préparer le niveau
  de destination avant d'activer son espace. La galerie d'un même étage est
  traversable sans overlay.
- À mesurer sur intégrés 4–8 Go : `mineChunks`, `mineQuads`,
  `builds`, FPS p50/p95 et pics de frame au changement de niveau.

### G2 — Roche facettée : première passe implémentée

- `mine-mesher.ts` : macrorelief continu sur environ 7 m et fractures de 2,7 m,
  relief mural jusqu'à 0,55 m et voûtes jusqu'à 0,55 m.
- Le déplacement se fait **dans la roche**, sans réduire les cellules praticables.
  Tous les déplacements utilisent des coordonnées mondiales stables, sans fissure
  à la frontière des chunks.
- Cache temporaire des sommets par chunk afin de réutiliser les mêmes sommets
  entre quads (per-cell, per-row).
- Le prefab commun des réceptions reçoit aussi de **petites formations rocheuses
  facettées** et des inclusions minérales sur ses murs latéraux, fusionnées avec
  les mêmes deux meshes. Le chemin central et le monte-charge restent dégagés.
- **Non inclus** : décor rocheux généralisé à toutes les galeries, strates de
  couleurs dédiées, effondrements visuels et LOD décoratif (prochaine passe).

### G3 — Casque : V1 implémentée

- `tool:miners-helmet` en vente au comptoir de mine, objet d'équipement distinct
  de la pioche. Le joueur l'équipe depuis le sac.
- `src/hamster/mine-helmet.ts` : petit mesh low-poly attaché au socket de tête
  animé, **un seul** `THREE.SpotLight` blanc chaud de portée 12 m, sans ombres.
- Lampe éteinte et accessoire masqué en surface ; aucun spawn d'éclairage à chaque frame.
- Le casque ne remplace pas la pioche sélectionnée et ne consomme pas de carburant.
- **À mesurer** : impact du spot sur les shaders Lambert selon les profils PC,
  comportement en roulade et occultation par les parois. Ajouter ensuite un mode
  de substitution point-light/halo pour GPU limités si nécessaire.
- **Non inclus** : sauvegarde persistante de l'état équipé, batterie et amélioration
  de puissance/portée du casque.

### M1/M2 — Cycles de récolte / durabilité V7 (implémenté)

Le bloc demeure dans **la grille 2,5D d'origine**. Le minage est désormais
décomposé en trois compteurs distincts : frappes, travail du cycle et
durabilité restante. **Aucune frappe isolée n'ouvre un cube de la mine**.

- Le slider suit un mouvement aller-retour, avec fréquence et fenêtres
  de réussite différentes pour Terre (900 ms), Pierre (1 150 ms), roche
  dure (1 480 ms), fer (1 680 ms), cristal (1 920 ms).
- Les frappes produisent un travail entier : **normal = 3**,
  **bonne = 4**, **parfaite = 5** ; seuil de récolte = **15**.
  La récolte tombe après **5 normales / 4 bonnes / 3 parfaites**
  (ou une combinaison de 3–5 frappes). L'excédent de travail est conservé.
- À **chaque récolte**, le bloc perd exactement **1 point de durabilité**.
  Un lot donne surtout **1 terre ou 1 pierre**. Sur un filon de fer/cristal,
  un seul bonus précieux intermédiaire peut survenir au deuxième lot,
  avec une chance très basse augmentée par la précision.
- Seul le **dernier lot, lorsque la durabilité atteint zéro**, retire
  la cellule du modèle, met à jour le chunk et agrandit physiquement la
  galerie. Il attribue **2 unités** du matériau du bloc, ou **3 unités
  avec une pioche en acier**, si le sac a de la place. Si seule une unité
  peut être stockée, elle est quand même récoltée.
- Le player peut utiliser **F / E ponctuellement** ou le bouton tactile
  pour synchroniser sa frappe ; **F maintenu** conserve son creusement
  automatique (normales uniquement). Une erreur de timing ne pénalise pas
  le rendement de base.
- Le HUD indique la solidité **N/max**, la matière du bloc et une
  estimation des frappes jusqu'au prochain lot. Aucun rendu WebGL
  additionnel, aucune ressource attribuée par l'interface.

#### Durabilité initiale proposée

| Matière | Durabilité | Lots nécessaires avant ouverture |
|---|---:|---:|
| Terre | 2 | 2 |
| Pierre | 3 | 3 |
| Roche dure | 5 | 5 |
| Fer | 7 | 7 |
| Cristal | 11 | 11 |

La difficulté influe sur la **durabilité** et la **vitesse du slider** ;
la compétence influence le nombre de coups par lot. L'ancien champ
`hp` (20–500) ne sert plus au minage V7, mais reste réservé à la
migration des sauvegardes historiques.

#### Persistance / validité / anti-rejeu

- `MineState` persiste `miningVersion:2`, `damage` (nombre de
  points de durabilité déjà consommés), `hits` (coups validés par
  cellule) et `work` (progression entière de 0 à 14 avant le lot).
  Les informations sont bornées à 256 cellules en cours.
- Les anciennes sauvegardes de mine sans `miningVersion` sont migrées :
  la progression historique en PV est proportionnellement convertie
  en durabilité consommée et travail résiduel ; les excavations
  enregistrées demeurent excavées.
- Le moteur valide la position, la cellule adjacente accessible et le
  sac **avant** de valider le lot. Si l'inventaire refuse le lot,
  aucun coup, progression ou durabilité n'est consommé.
- Les requêtes de frappe validées sont dédupliquées par identifiant
  (y compris après sauvegarde/rechargement). Les minerais ne sont
  jamais réattribués à la simple réouverture de la carte ou d'un
  menu.
- Le score de timing demeure calculé côté client pendant la bêta
  solo. Une version multijoueur devra faire valider le rythme et la
  frappe par une autorité serveur.

**Prochaines améliorations** : fissures et marques 3D visuellement
proportionnelles à la durabilité, particules faibles lors des récoltes,
meilleur retour sonore « frappe parfaite », essais de rendement
ressource/heure selon matériaux et difficulté. Mesurer les performances
et contrôler le scénario navigateur B1 avant merge.

### G4 — Fissuration progressive des blocs : V1 implémentée

**Quatre aspects en comptant l'intact, trois seuils visibles**, puis la
destruction effective du bloc. La fissuration dépend uniquement de la
**durabilité consommée / durabilité initiale**, jamais de l'horloge ou
de la vitesse de frappe.

| Part de solidité consommée | Stade | Effet visuel |
|---|---|---|
| Inférieure à 25 % | 0 | Roche intacte |
| 25 à 49 % | 1 | 2 fines fissures angulaires |
| 50 à 74 % | 2 | 5 segments, fissures ramifiées |
| 75 à 99 % | 3 | 8 segments, fracture plus large |
| 100 % | Destruction | Bloc réellement retiré et passage ouvert |

**Lissage naturel suivant le matériau :** une terre à 2 points ne
traversera pas tous les stades ; un cristal à 11 points les traversera
plus progressivement. Les débris et la récolte restent gérés par les
cycles de 3 à 5 frappes, inchangés.

**Implémentation :** `src/mine/mine-cracks.ts` calcule le stade,
la couleur et les chunks voisins à actualiser.
`mine-mesher.ts` dessine les fissures par de petits rubans de triangles
sur la surface déformée **existante** des faces rocheuses exposées.
Elles sont fusionnées au **même BufferGeometry / même matériau** que
la paroi : aucun mesh par cellule, aucune texture et aucun draw call
supplémentaire. Les rubans restent légèrement décalés vers le couloir
pour éviter le z-fighting ; leur géométrie ne modifie pas les collisions.

`MineState.strike` signale un changement de stade uniquement après
un **cycle récolté** qui a traversé un seuil de 25/50/75 %.
`activity-runtime` invalide seulement les chunks possédant les
faces du bloc, y compris des deux côtés des joints de 32 m.
Un coup isolé ou une récolte qui ne franchit pas de seuil ne
reconstruit **aucune géométrie**. La destruction à zéro passe par le
mécanisme d'excavation classique qui supprime le bloc et ses fissures.
Les sauvegardes existantes contiennent déjà les points de durabilité,
donc aucun nouvel attribut n'est nécessaire.

Validation : tests automatiques des seuils par matériau, géométrie
fusionnée, déterminisme des couleurs/sommets, joints de chunks,
durabilité inchangée et suppression à l'excavation. À compléter :
capture réelle dans le jeu, test de lisibilité à différentes distances
et budget FPS sur vieux PC.

## Contrôles avant merge

- [ ] Tests Node / TypeScript / Vite et tests navigateur B1 validés sur le SHA final.
- [ ] Capture réelle du casque dans le hall et dans une galerie sombre.
- [ ] Relief sans fissures sur deux chunks voisins, y compris après excavation.
- [ ] Vérifier la sortie de mine, l'ascenseur et les niveaux 2–3 inchangés.
- [ ] Bench bas de gamme : sans dégradation perceptible de FPS, draw calls et mémoire.
- [ ] Valider l'équilibrage des fragments, des outils et de l'inventaire.

Ne pas fusionner la PR avant vérification de ces contrôles.
