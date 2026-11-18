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
- **Non inclus** : assets rochers 3D secondaires, strates de couleurs dédiées,
  effondrements visuels, LOD décoratif (prochaine passe graphique).

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

### M1 — Fragments : correction implémentée

Problème antérieur : chaque coup partiel tirait un fragment avec probabilité
`MineMaterial.fragment`. Une pioche très faible avait donc beaucoup plus de
chances de donner des ressources supplémentaires.

Nouvelle règle :

1. Une cellule garde son total de dégâts, existant et sérialisé.
2. Un **unique tirage déterministe par cellule** est évalué lorsque le cumul
   atteint **50 %** des points de vie (quelle que soit la puissance de la pioche).
3. Une cellule peut donner **au maximum une unité supplémentaire** en plus du
   minerai normal. Jamais une récompense par coup ou par rafraîchissement.
4. Si le coup final franchit directement les 50 %, le bonus est attribué avec
   la récolte atomique : si le sac accepte 1 mais pas 2, la récolte de base est
   acceptée. Si le sac refuse tout, la cellule n'est pas effacée.
5. Le passage `save -> reload` ne recrée aucun bonus : le seuil ne peut plus être
   franchi si les dégâts sauvegardés l'ont déjà dépassé.
6. Les anciennes sauvegardes restent lisibles ; aucun nouveau champ nécessaire.

Les probabilités actuelles restent celles de `MINE_MATERIALS.fragment` :
pierre 15 %, roche dure 12 %, fer 6 %, cristal 3 %.

### M2 — Minage de précision : phase suivante, non implémentée

Mini-jeu court et **optionnel**, action maintenue puis relâchée / frappe sur
un repère de fissure. L'interface ne doit pas attribuer d'objets directement.
Un score 0–1 produit seulement un multiplicateur de puissance plafonné
(normal x1, bonne x1,15, excellente x1,30). Le bonus de quantité reste
indépendamment plafonné par cellule.

À prévoir avant code :
- Politique de rythme : F maintenu = minage standard, appui précis = variante
  optionnelle sans perte sur erreur.
- Source d'autorité : validation par `MineState.strike`, à déplacer ensuite
  sur serveur lors du multijoueur ; idempotence et anti-spam.
- HUD léger directement sur la paroi, sans modal plein écran, compatible mobile.
- Benchmark économie : minerai/minute et pièces/minute pour chaque outil,
  avec et sans mini-jeu ; éviter les fermes à cristaux.
- Audio et particules sur frappes efficaces : budget borné, pas de nouveaux
  shaders ou lumières par impact.

## Contrôles avant merge

- [ ] Tests Node / TypeScript / Vite et tests navigateur B1 validés sur le SHA final.
- [ ] Capture réelle du casque dans le hall et dans une galerie sombre.
- [ ] Relief sans fissures sur deux chunks voisins, y compris après excavation.
- [ ] Vérifier la sortie de mine, l'ascenseur et les niveaux 2–3 inchangés.
- [ ] Bench bas de gamme : sans dégradation perceptible de FPS, draw calls et mémoire.
- [ ] Valider l'équilibrage des fragments, des outils et de l'inventaire.

Ne pas fusionner la PR avant vérification de ces contrôles.
