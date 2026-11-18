# 87 — Port N1 : scène et interaction runtime (première intégration)

**Branche** : `feat/port-n1-generated-islands` — première implémentation de l'assemblage du port N1 pour Little World ; à valider en navigateur et sur les îles publiées. Se rapporte aux [objectifs graphiques 85](85-PORT-TRADE-CENTERS-VISUAL-DESIGN.md) et au [contrat d'implantation 86](86-MARITIME-TRADE-PLACEMENT-N1-N3.md).

## Composants réutilisés, sans nouveaux GLB

- Stand **`port-trade-n1-v1.glb`** : toile rayée, quatre poteaux, enseigne et caisses vides ; aucun produit affiché.
- **`assembleDock`** : cellules **3 × (2×2 m)** en bois, poteaux partagés et une bitte d'amarrage, depuis `public/models/structures/dock`.
- **`boat.rowboat_wood`** de la bibliothèque World Production : vrai GLB existant avec LODs, chargé par `createAsset`, pas de seconde barque construite en primitives.
- **`buildHamster()`** : rameur sur le quai, vendeur derrière le comptoir ; pas de duplication du petit rameur embarqué du substitut procédural.
- **Aucune texture nouvelle** et aucune détection embarquée de marchandises à partir du GLB.

## Algorithme côté jeu

- `src/archipelago/port-n1-plan.ts` : recherche pure déterministe et bornée d'une rive compatible, à partir d'ancres portuaires existantes et du spawn de l'île.
- Critères : secteur du monde valide, sol sec et quasi plan pour le stand, passage piéton, profondeur pour la barque et le bout du ponton ; sinon retour `null` sans création à un point arbitraire.
- `src/archipelago/port-n1-view.ts` : vraie scène GLB ; chargement asynchrone, partage des ressources, acteur à quai et vendeur du N1 pilotés par l'horloge ferry existante.
- `src/archipelago/port-n1-collisions.ts` : surfaces de quai marchables et proxies séparés (poteaux / comptoir) ; ne pas obstruer tout l'espace derrière le stand.
- `src/main.ts` : quand une île **publiée** du catalogue maritime dispose d'une rive éligible, le point d'embarquement existant est remplacé par le socket du quai N1. Si aucun emplacement sûr n'est trouvé, l'ancienne navette est conservée.
- `src/ui/interactions/targets.ts` et `src/ui/app/game-ui.ts` : cible marchand séparée de la cible rameur ; la même interface de marché local et le service d'import réel sont réutilisés.

### Règle d'escale (N1 uniquement livré)

Navette présente : barque visible, rameur à quai, vendeur au comptoir, actions indépendantes.  
Navette absente : barque/rameur/vendeur absents, stand/ponton/stock restent physiquement et logiquement présents ; les importations ne sont plus achetables tant que le commerçant est absent.

Les N2/N3 restent **bases 3D validées** à brancher ensuite, conformément à la matrice 86 : marchand permanent, rameur uniquement à l'escale. **Aucune évolution automatique des bâtiments**.

### Debug et tests

`?metrics=1` expose `window.littleWorldMetrics.maritimePort` (`active`, niveau, stand, trade, boarding, merchant, rower, présences), et la carte reçoit le marqueur « Comptoir maritime » sur une île ayant un N1 opérationnel.

`tests/port-n1-plan.test.mjs` vérifie la recherche déterministe, l'absence de placement hors côte et la matrice N1–N3. Le smoke `tools/test-ferry-browser.mjs` vérifie les deux sockets et l'achat import via la présence physique au comptoir ; capture de vérification `/tmp/little-world-browser/port-n1-real-assets.png` lors de l'exécution CI.

## Limites à ne pas confondre avec une livraison complète

- **Le port est calculé au chargement d'une île publiée** : pas encore une composition persistée dans les entités V3 / World Studio, ni de bouton Studio « ajouter ce port ». Cette étape viendra après la validation réelle du modèle et des accès.
- L'algorithme côtière est volontairement conservateur : sur relief non compatible il **ne place rien** au lieu de créer un quai flottant ou un bâtiment inaccessible.
- Collisions du quai approximées par boîtes ; vérifier franchissement de la rive et navigation avec le contrôleur réel, en particulier si la rive et le ponton sont à des altitudes différentes.
- La scène N1 ne corrige pas les meshes N2/N3. Le N1 n'a pas de LOD dédié pour le stand, même si la barque et les modules dock ont leurs LOD existants ; optimiser après mesure.
- L'acteur marchand N1 et le rameur utilisent la logique de présence du ferry, pas des routines PNJ autonomes avec dialogue/sauvegarde de métier.
- Pas de transfert de marchandises par simple présence de la barque : seul le service cargo fait foi.

**Gates de qualification à venir** : présence réelle sur chaque île publiée, capture WebGL, accès marchand et rameur sans téléportation, fonctions d'import, navigation dans la zone des collisions, FPS sur configuration 4–8 Go. Si un gate échoue, ne pas déclarer l'intégration complètement qualifiée.
