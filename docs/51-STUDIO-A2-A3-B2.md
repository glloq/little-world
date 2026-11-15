# 51 — Studio : itérations A2, A3 et B2

Branche : `feat/studio-creation-workflows-v1`. Aucun merge dans `main`.

## A2 — Reliefs linéaires natifs en 3D

Le module **Monde > Régions > Reliefs linéaires en 3D** propose quatre outils :
- **Crête montagneuse** : ridge/heightM ; axe polyline, largeur et hauteur.
- **Escarpement rocheux** : une crête *étroite* et raide, pas une paroi verticale réelle.
- **Vallée** : coupe linéaire `valley/depthM`.
- **Col / passage** : vallée localisée dans une crête ou un massif.

Deux à 32 points déplaçables ; hauteur/profondeur et largeur réglables dans le tracé ; aperçu simple. Chaque forme demeure une `ReliefFeature` du générateur archipel, identifiée par un ID stable ; création, réédition et suppression passent par une unique transaction V3 avec Undo/Redo. Le heightfield reste la source des hauteurs. **Aucun nouveau maillage 3D en jeu.** Pour les surplombs, arches et tunnels, utiliser l'outil séparé **Structures naturelles**.

Limites du générateur réutilisé : 64 formes au maximum par archipel, profondeur de vallée <= 400 m, hauteur de crête <= 800 m. Les falaises sont des *approximations de relief* : aucune vraie face verticale sans géométrie locale.

## B2 — Composition végétale par région

Le contrat V3 `libraries.regions[id].vegetation` est **optionnel** pour conserver la compatibilité des sauvegardes A/B déjà créées.

Paramètres :
- `trees`, `shrubs`, `ground`, `deadwood` : coefficients entre 0 et 2 par rapport au biotope courant.
- `treeMix` : jusqu'à six essences arborées existantes, poids de 1 à 20. Le panneau expose deux essences favorites et leur proportion.
- `transitionM` (existant) : adoucit la frontière polygonale.

Les valeurs s'appliquent au **moteur d'habillage instancié** ; elles ne créent ni entités de végétation, ni fichiers GLB, ni textures, ni nouveaux draw calls de classe. En cas de mélange personnalisé, les poids de l'habitat naturel et ceux du mélange auteur sont interpolés en bordure.

La géométrie polygonale est **précompilée une seule fois par révision géographique** : boîte englobante puis fonction de distance signée. Aucun recalcul de ses segments par frame. Les limites de candidats et budgets de l'habillage restent applicables. L'écriture dans le ZIP et le passage par la compilation V3 transmettent les réglages au monde jouable.

Une région sans réglages de végétation ou dont tous les réglages sont à leur valeur par défaut ne produit pas d'influence supplémentaire ; les paysages existants restent donc inchangés.

**Limites :** il s'agit de l'habillage végétal instancié, pas de toutes les décorations ou herbes shader du moteur. Le plafond de végétation est conservé : ×2 ne signifie pas nécessairement deux fois plus d'instances visibles. En cas de superposition de paysages et régions, l'influence la plus forte l'emporte plutôt qu'une accumulation additive. Les masques de biotope et les exclusions manuelles conservent leur priorité.

## A3 — Assistant hydrologique

Sous **Monde > Régions > Contrôle des rivières, lacs et cascades** :
1. **Analyser le réseau hydrologique** via `compileWaterNetwork` (vraies règles du compilateur).
2. Repérer les rivières sans exutoire dont le point aval est à 10 m ou moins d'un lac ou d'une autre rivière.
3. **Voir le raccord** puis **Appliquer le raccord** : projection sur le segment, validation de réseau complet, changement V3 annulable. Aucun lien illégal n'est enregistré.
4. Détecter jusqu'à 64 pentes susceptibles de recevoir une cascade, avec point et dénivelé proposés. Ces cascades sont seulement des suggestions : l'auteur doit vérifier et régler leurs niveaux dans le module Eau.

L'assistant n'introduit ni dynamique de simulation supplémentaire ni creusement automatique. L'analyse est lancée par action de l'utilisateur ; elle ne tourne pas pendant chaque frame.

**Limites :** la reconstruction globale du bassin versant, le tracé multi-cours d'eau et l'insertion automatique de cascades sûres restent à qualifier. Les liens ne sont pas ajoutés si le profil enfreint les contraintes d'altitude ou la topologie.

## Tests / recette

- `tests/studio-relief-lines.test.mjs` : relief natif, réédition, état source, Undo/Redo, limites géométriques.
- `tests/studio-region-vegetation.test.mjs` : validation V3, transfert Studio/runtime, mélange pondéré, zones sans végétation instanciée.
- `tests/studio-hydro-network-assistant.test.mjs` : diagnostics, suggestion non mutante, raccordement, échecs sûrs et cascades proposées.
- `tools/test-studio-regions-browser.mjs` : A/B, interface A2/A3, B2 essences, ZIP, modifications et Undo.
- `.github/workflows/studio-regions.yml` : tests ciblés et navigateur.
- Suite générale : `npm test`, `npm run build`, scénarios navigateur.

À contrôler avant promotion : projets avec de nombreuses régions juxtaposées, budgets mobile WebGL, pentes fortes et profils d'eau sur cartes de grande taille, performances sur GPU réel.
