# Little World — Bateaux low-poly V2

Deux assets 3D originaux, en glTF binaire sans texture externe, couleurs de sommet.

## Embarcations

| Modèle | LOD0 | LOD1 | Clips |
|---|---:|---:|---|
| Barque à rames | 404 triangles | 232 triangles | `OarsRow` |
| Petit voilier | 604 triangles | 312 triangles | `SailFold`, `SailUnfold`, `SailTrim`, `RudderTurn` |

## Aperçu HTML

Ouvrir `validation_bateaux_3d.html` depuis Firefox ou Chrome. La page intègre les quatre GLB et ses aperçus sans dépendance réseau. Elle permet de sélectionner modèle, LOD, tourner la vue, simuler rames, voile ouverte/repliée, vent et flottement. Le battement de la voile au vent est un effet graphique dans la page, **pas une animation stockée dans le GLB**. Les autres animations sont des clips glTF 2.0 et des nœuds articulés.

## Compatibilité avec Little World

- Origine de scène : centre horizontal de la coque, au niveau de flottaison théorique `y=0` ; axe Y vertical, proue vers +Z.
- Barque : `Body`, `OarPort`, `OarStarboard`. Les rames tournent autour de leur dame de nage.
- Voilier : `Body`, `SailRigPivot` parent de `Boom`, `SailCloth`, `SailRolled`, et `RudderPivot`.
- Voile déployée à l'ouverture du GLB. `SailRolled` est initialement quasiment à zéro en taille. Les clips `SailFold` et `SailUnfold` jouent la transition; ne pas superposer deux clips contrôlant le même nœud.
- Voile au vent : animation très faible des sommets et orientation du gréement côté runtime; pas de vraie simulation de tissu ou de flottabilité complexe.
- Collision/navigation : proxies de coque distincts du rendu, avec dimensions calibrées par type; ne pas reprendre les points `canBoatSailAt` et rayons d'embarquement fixes pour les deux bateaux.
- Futur multijoueur : sérialiser position/cap, vitesse, voile et angle du gouvernail; oscillations visuelles calculées client.
- Conçu pour GitHub Pages : aucun appel API ni serveur nécessaire pour charger le pack.
- Corrections V2 : voile gonflée vers l'avant dans la visionneuse, inversion du sens de réaction au vent, et réparation préventive du winding/normales des faces avant export pour éviter les trous visuels liés au back-face culling. Aucun commit GitHub effectué ; modèles validés et prêts à intégrer au jeu.

## Reproduction

```bash
python tools/assets/generate-boats.py
```

Dépendances du générateur source: `numpy`, `trimesh`. Les outils de prévisualisation et les tests visuels restent disponibles dans le pack de validation hors dépôt.
