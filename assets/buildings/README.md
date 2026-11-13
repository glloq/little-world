# Little World — bâtiments validés

Trois modèles originaux approuvés le 13 novembre 2026 :

| Modèle | Version | LOD0 | LOD1 | LOD2 |
| --- | --- | ---: | ---: | ---: |
| Cabane en bois | V1 | 540 | 152 | 56 |
| Maison en pierre | V1 | 456 | 104 | 56 |
| Phare côtier | V1.2 | 2672 | 1236 | 528 |

- Fichiers : `public/models/buildings/<type>/lod{0,1,2}.glb`.
- Métadonnées / empreintes SHA-256 : `assets/buildings/approved.json`.
- Les modèles sont stockés et référencés dans `approved.json`, mais **pas encore ajoutés à `assets/catalog.json`** : ce catalogue alimente les scènes de référence générées, dont la reproductibilité doit être préservée. La future intégration éditeur nécessitera une migration contrôlée des scènes, ou un mécanisme de catalogue indépendant.
- Échelle en mètres, axe +Y vertical, avant -Z, sans texture externe.
- Le phare V1.2 conserve les corrections d'orientation V1.1 ; vitrages pleins et pas de lampe intérieure.
- Toutes les ressources sont locales et doivent utiliser le base path Vite plutôt qu'une URL absolue.
- Les LOD1 et LOD2 sont disponibles comme fichiers ; le changement de LOD automatique dans le jeu n'est pas démontré par le simple import.
- Les collisions, points d'interaction, distance LOD et performances mobiles doivent être qualifiés avant d'annoncer une intégration gameplay complète.
- Les assets procéduraux et IDs existants restent inchangés (notamment `architecture.cottage`).

Ne pas réintroduire les variantes V2 des maisons ni les anciennes versions du phare par inadvertance.
