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

### M1/M2 — Slider rythmé et extraction progressive : implémentés en V6

Le minage conserve la **même grille 2,5D et les mêmes points de vie** :
chaque frappe applique les dégâts de la pioche à la cellule visée ; la cellule
ne disparaît **que lorsque ses PV atteignent zéro**. Aucun mesh ou panneau
ne décide de la récompense.

**Slider temps réel**, compact et sans modal : lorsque le joueur vise une
paroi, le curseur effectue un aller-retour. La partie centrale est optimale.
Le matériau définit la durée d'un cycle ainsi que la largeur des zones.

| Matière | Période complète | Coups par résultat intermédiaire |
|---|---:|---:|
| Terre | 900 ms | 3 |
| Roche | 1150 ms | 4 |
| Roche dure | 1480 ms | 5 |
| Fer | 1680 ms | 4 |
| Cristal | 1920 ms | 5 |

- **F ou E ponctuel** au moment idéal : frappe parfaite à **×1,30 de puissance**.
  Fenêtre plus large : bonne frappe à **×1,15**.
- **F maintenu** : creusement automatique conservé, puissance normale ×1 ;
  le joueur n'a pas besoin de participer au mini-jeu.
- **Tactile** : bouton *Frapper* sur le slider, même mécanique que le clavier.
- **Erreur de timing** : puissance normale, pas de pénalité de ressource.
  La frappe reste valide et compte dans le creusement.
- Le slider et sa cible sont mis à jour dans le moteur de présentation existant.
  Environ 11 évaluations de cible/s, simple position CSS du curseur par frame,
  aucun second rendu 3D.

**Récompenses** : un résultat est accordé toutes les **3 à 5 frappes
validées sur la même cellule** avant sa destruction. Le résultat
est majoritairement **Terre** (`mine:earth`) ou **Pierre**
(`mine:stone`), en quantité 1 ; ce sont des ressources de déblai.
Pour le fer et le cristal, le **deuxième** cycle peut exceptionnellement
fournir une unité du minerai réel, avec une chance améliorée par une
bonne ou parfaite frappe (fer 5 % de base, cristal 1,2 % de base ;
multiplicateurs 1,4 et 2,25). Au plus **un bonus rare intermédiaire
par cellule**, quelle que soit la vitesse de la pioche.

Une cellule entièrement excavée fournit **une seule fois** son minerai
principal comme avant ; pour la terre, cette ressource principale devient
`mine:earth`. La progression en PV, l'accessibilité, la portée, la
détection des chunks et l'occupation restent inchangées.

**Persistance et économie**

- `MineState` conserve maintenant `damage` et `hits` (counters acceptés)
  par `levelId:ix:iz`, tous deux plafonnés à 256 cellules en cours.
- Les sauvegardes antérieures, sans `hits`, restent lisibles. Les mines
  partiellement travaillées sont désormais écrites **même quand aucune
  cellule n'a encore été excavée**.
- Une demande de frappe (`requestId`) déjà acceptée ne rejoue pas
  le gain, y compris après rechargement ; elle reste dans la fenêtre
  de déduplication persistée.
- Si le sac refuse un gain intermédiaire, ni les dégâts ni le compteur de
  coups ne sont engagés. Le joueur peut libérer de la place et reprendre.
- Les valeurs monétaires des débris sont limitées à 1 pièce/unité.
  Les faibles outils peuvent créer plus de déblais communs car ils
  nécessitent davantage de coups, mais **pas plus de tirages rares**.
- Le score de timing est local pour l'instant. En multijoueur, le
  serveur devra valider les timestamps/rythmes de frappes avant de
  retenir une précision améliorée.

**Étapes futures** : affichage de fissures correspondant aux dégâts,
petites particules aux frappes précises, retour visuel « excellent »,
réglages d'accessibilité et benchmark minerai/minute sur chaque outil.

## Contrôles avant merge

- [ ] Tests Node / TypeScript / Vite et tests navigateur B1 validés sur le SHA final.
- [ ] Capture réelle du casque dans le hall et dans une galerie sombre.
- [ ] Relief sans fissures sur deux chunks voisins, y compris après excavation.
- [ ] Vérifier la sortie de mine, l'ascenseur et les niveaux 2–3 inchangés.
- [ ] Bench bas de gamme : sans dégradation perceptible de FPS, draw calls et mémoire.
- [ ] Valider l'équilibrage des fragments, des outils et de l'inventaire.

Ne pas fusionner la PR avant vérification de ces contrôles.
