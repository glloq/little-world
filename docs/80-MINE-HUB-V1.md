# 80 — MINE-HUB V1 : réception répétée à chaque étage

## Objectif graphique et logique

Référence visuelle approuvée le 18 novembre 2026 : **hall creusé dans la roche, comptoir à gauche avec un hamster contremaître, arche de la galerie principale au centre, monte-charge en bois à droite**. Palette bois chaud, pierre facettée, toile ocre/rouge, deux lanternes et quelques échantillons de pierre/fer/cristal. Style low-poly compact, sans textures obligatoires.

**Chaque étage reprend la même organisation**, à une altitude différente. Le **passage vers l’île est une arche au fond du hall, derrière la zone de réception et face à la galerie**, présente **uniquement au niveau 1**, jamais en hauteur au-dessus de l'entrée de minage. Les étages 2+ n'ont aucune sortie vers la surface. Le même *rôle* de contremaître est représenté par un hamster local à chaque réception, sans PNJ IA lourd supplémentaire. Les niveaux partagent une unique logique de progression du joueur et un axe de monte-charge vertical ; chaque comptoir possède un identifiant stable.

## V3 — hall élargi, circulation libérée (révision du 18/11/2026)

**Correctif graphique avant merge** : la première capture réelle montrait une cabine trop proche
de la caméra, un comptoir dissimulé et une arche étroite. Le nouveau prefab
`mine-hub-view.ts` réutilise les composants originaux et le maillage minier, mais
réorganise les volumes au lieu d'empiler les mêmes objets.

- **Réception ~13 × 14 m**, à coins irréguliers, générée dans la grille 2,5D ; pas
  de salle distincte à charger avant d'aller miner. Allée centrale libre de **3,5 m**.
- **Gauche** : comptoir contre la paroi (x local ≈ −6,65 m), contremaître derrière,
  échantillons des minerais de l'étage, petit bandeau de toile et outils au mur.
  Suppression du grand toit à 4 poteaux et des caisses dans la circulation.
- **Centre** : grande arche (~4,3 m de poutre, plus de 3,5 m de passage),
  symboles 3D pierre/fer/cristal adaptés à la géologie, rails prolongeant **après** le seuil
  un tronçon minier initial d'environ **5,8 m** avant son raccordement aux galeries auteur.
- **Droite** : plateforme de monte-charge ouverte, poulie arrière et trois appuis
  latéraux au maximum ; suppression de la cage et du gros panneau frontal.
- **Arrière** : arche de sortie ouverte vers l'île **uniquement au niveau 1**.
  Les étages 2 et 3 gardent l'emplacement d'accueil, sans issue vers la surface.
- **Voûte de réception relevée** au centre jusqu'à +1,10 m (hauteur totale plafonnée
  à 4,7 m, décroissance douce près des murs), avec cohérence entre
  `mine-mesher.ts` et `mine-collision.ts`.
- **Visibilité** : `world.setUnderground(true)` masque les groupes extérieurs
  (terrain, végétation, bâtiments, impostors) dans la mine, **sans couper la
  réserve d'éclairages `LocalLights`**. Retour normal à la surface quand le
  joueur quitte le niveau 1. Aucun second moteur de rendu.
- **Performance** : 1 mesh fusionné pour les solides procéduraux et 1 pour l'émission (le stand maritime N1 ajoute ses propres sous-meshes),
  pas de nouveaux points lumineux avec ombres, chunks conservés en streaming.
  Décor sans colliders supplémentaires ; la grille reste seule autorité.
- Le premier étage est préparé à l'ouverture du jeu ; l'habillage des étages
  suivants est préparé pendant le **seul chargement du monte-charge**.
  La circulation au même niveau reste instantanée.

**Limite d'implantation** : l'ouverture est rognée par le polygone minier existant.
Les toutes petites zones auteur exigent une validation dimensionnelle dans Studio ;
aucun élément hors zone ne doit devenir un obstacle invisible. Les cartes tests
de mine larges (~40 m et plus) accueillent l'organisation complète.

Validation : `npm test`, `npm run build`, `npm run test:b1` et le scénario
`tools/capture-mine-hub-browser.mjs` (captures réelles Chromium du hall et des étages
1/2/3, sans substitution par des images générées).

## V4 — galerie large, carte souterraine, puits et vrai stand maritime N1

Révision du 18 novembre 2026 ; la référence de code reste la PR #71.

- **Arche d'accès au minage** : élargie à ~5,85 m de poutre / ~5 m de passage utile,
  et **alignée avec un couloir dégagé d'environ 6 m de largeur** dans
  `MineGrid`. Le joueur entre physiquement par la grande arche existante,
  sans ouverture secondaire plus petite juste derrière. La circulation dans
  le même étage ne provoque aucun écran de chargement.
- **Carte et minimap** : dans la mine, le HUD remplace la vue aérienne de l'île
  par le **plan 2D du niveau actif**, basé sur les cellules ouvertes réelles,
  avec repères pour le joueur, le comptoir, le monte-charge, l'entrée du minage
  et la sortie de surface (seulement au niveau 1). La touche `M` ouvre le
  plan souterrain avec zoom et recentrage ; en quittant la mine, le HUD et `M`
  reviennent à la carte de l'île. Raster 1 pixel / cellule, mis en cache par
  étage et nombre de cellules excavées ; aucune scène Three.js additionnelle.
- **Puits de monte-charge** : `mineShaftOpening()` supprime les quads de sol
  et de plafond **au même axe XZ** suivant le niveau :
  niveau 1 = dessous ouvert, plafond fermé ; niveaux intermédiaires = dessus
  et dessous ouverts ; dernier niveau = dessus ouvert, fond fermé. Les
  poutres/câbles verticaux donnent une continuité visuelle. La plateforme
  du monte-charge est l'élément de sol jouable ; la collision 2,5D conserve
  pour l'instant un plancher logique sous les vides décoratifs afin d'éviter
  des chutes involontaires. **La simulation physique d'une cabine en mouvement
  n'est pas encore mise en place**.
- **Stand de mine** : véritable GLB maritime validé **N1**
  `public/models/commerce-portuaire/port-trade-n1-v1.glb`, repris
  depuis `main` en préservant ses mesh, toile rayée, ossature,
  comptoir et caisses. Les nœuds d'enseigne de commerce maritime sont
  masqués à l'exécution et remplacés par une enseigne **deux pioches
  croisées**. Le GLB est chargé une seule fois puis cloné en partageant
  ses ressources à chaque étage. Le PNJ hamster mineur et la logique
  d'achats/ventes restent ceux de la mine, sans importer les règles de
  présence du ferry ou les stocks du commerce maritime.
- **Validation** : tests des ouvertures sur les trois étages, du passage
  de minage, du fichier GLB et du changement de carte dans le scénario B1.

## Plan de circulation validé

De la gauche vers la droite : **stand du contremaître**, **entrée de la galerie de minage (en face)**, **monte-charge**. Derrière le joueur, sur le même sol, **arche ouverte vers la sortie de l'île au niveau 1 uniquement**. Aucune porte opaque ne ferme ce passage.

- **Île → niveau 1** : transition existante immédiate, sans nouveau chargement de page ni overlay.
- **Réception → galerie de minage au même étage** : déplacement libre, sans écran de chargement, pas de niveau fictif séparé.
- **Monte-charge → autre étage** : vérification des droits, affichage d'une courte interface de chargement, préconstruction limitée des chunks proches de l'arrivée, puis déplacement validé et rafraîchissement du niveau actif.
- **Niveaux 2+ → île** : impossible directement ; retourner au niveau 1 avec le monte-charge puis traverser la sortie arrière.
- **Rendu** : le même prefab low-poly pour toutes les mines/étages ; seuls les pictogrammes 3D **pierre/fer/cristal réellement détectés** dans la géologie de l'étage varient au-dessus de l'arche centrale. Pas de multiplicité de GLB par minerai.
- Le chargement du monte-charge est **une transition locale de chunks**, pas un reload navigateur ou une navigation vers une autre URL.

## Implémentation

- `src/mine/mine-hub.ts` : contrat pur `mineHubLayout` et `mineHubCell`, emplacement du shaft XZ identique sur tous les étages, identifiants des comptoirs et seuils de déblocage.
- `src/mine/mine-state.ts` : réserve des cellules **initialement ouvertes**, à l'intérieur du polygone de la mine, sans excavation persistée ni modification du terrain extérieur, avec passage garanti et ouvert du portail extérieur à l'arche arrière du niveau 1. Chaque étage reçoit aussi un raccordement vers la galerie auteur la plus proche, sans percer hors du masque de mine. Scan local borné autour du puits.
- `src/mine/mine-hub-view.ts` : prefab procédural original. Géométrie de poutres, toile, comptoir, personnage, rails, arche arrière exclusive au niveau 1 et pictogrammes des minerais du niveau **fusionnée en deux meshes** (matières classiques + lumière visuelle). Aucun collider propre : les cellules de la grille restent la vérité physique. Pas de GLB téléchargé.
- `src/activity-view.ts` : instancie une réception par niveau mais affiche **seulement le niveau actif** et préchauffe par lots les chunks de destination lors d'un trajet en monte-charge ; réutilise deux matériaux entre les instances. Le reste du rendu de galerie conserve son streaming.
- `src/gameplay/activity-runtime.ts` : recherche locale du stand/monte-charge, liste des étages, contrôle de droits et téléportation validée vers la plateforme commune. Les transitions automatiques d'escaliers sont **désactivées seulement dans le runtime du jeu** ; l'entrée/sortie extérieure demeure une transition physique. Pas de serveur.
- `src/main.ts` et `src/ui/app/game-ui.ts` : utiliser E près du stand pour acheter/vendre et ouvrir conseils/accès ; E près de la plateforme ouvre les étages. Les ventes utilisent le même catalogue `SHOPS.mine` et le même inventaire que les comptoirs existants.

### Progression actuelle

Les droits sont déterministes à partir du **nombre total de cellules réellement excavées** sur les mines de la partie : niveau 1 libre, niveau 2 à partir de 12 cellules, niveau 3 à partir de 40 cellules, puis +40 cellules par étage supplémentaire. Ce sont des **valeurs de gameplay V1 à équilibrer**, pas un système d'XP final. Acheter/vendre n'est jamais requis pour débloquer un étage.

Les cellules excavées sont déjà persistées via `MineState` et le schéma `GameSaveV2` ; le rang se recalcule après chargement. Aucune nouvelle donnée d'autorisation redondante n'est ajoutée. Si le jeu devient multijoueur, le serveur devra recalculer les droits et valider l'intention de voyage.

## Points d'attention

1. Ce modèle est un **premier prefab procédural** suivant l'implantation de la référence validée, pas une conversion automatique de l'image en un GLB final ni une animation complète du PNJ.
2. Les entrées et galeries existantes restent compatibles. Certaines petites mines auteur peuvent nécessiter d'agrandir la zone pour loger le hall : ne jamais excaver hors du masque de mine.
3. L'axe vertical utilise le premier connecteur existant comme repère pour limiter les migrations de cartes. Les anciens paliers non utilisés ne deviennent pas des passages automatiques.
4. Le shop utilise un identifiant local `mine-hub:<mineId>:<levelId>` ; vérifier le réapprovisionnement, les stocks et la disponibilité de marchandises sur plusieurs étages.
5. Les lanternes, le rendu et le chargement inter-étage doivent être mesurés sur GPU intégré. **30 FPS visés, non garantis**. Pas de deuxième moteur de collision ou gestionnaire de ressources.

## Validation avant merge

- `npm test` : invariants géologiques, état minier, galerie non fissurée, nouveau hub stable et accès validés.
- `npm run typecheck`, `npm run build` : Vite et TypeScript sans erreur.
- `npm run test:gameplay` / `npm run test:b1` avec navigateur si disponible.
- Vérification visuelle à chacune des trois profondeurs : position du comptoir, hamster, voie centrale, monte-charge, absence de paroi masquante, et éclairage.
- Test manuel : entrer → vendre au niveau 1 → essayer niveau 2 verrouillé → miner 12 cellules → retourner au stand → descendre → remonter → sauvegarder/recharger → retrouver le même droit et les mêmes cellules.

## Itérations suivantes (non implémentées dans V1)

Poulie/cabine de lift animées ; lever visuel des portes ; panneaux textuels précis des niveaux ; idle du contremaître ; tutoriel à étapes mémorisées ; maillage final art-director / LOD1 ; intégration des niveaux dans l'éditeur de mines du Studio ; calibrage de seuils via des quêtes et métiers.
