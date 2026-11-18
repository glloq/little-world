# Villages adaptés au site : rue, montagne, rivière et pêche

Implémenté sur `feat/stepped-island-identity`, sans déploiement. Complète [77 — implantation organique](77-ORGANIC-SETTLEMENT-PLACEMENT.md) : l’organisation concentrique reste disponible et n’est plus l’unique nouveau modèle.

Dans **Construire → Villages & villes → Type → Organisation**, choisir :

| Organisation | Structure et adaptation |
| --- | --- |
| Concentrique organique / aéré | Place commune, voies radiales et passages périphériques irréguliers. |
| Village-rue organique | Un passage sinueux, des maisons aux retraits et positions variables, un point d’activité sur cet axe. |
| Village de montagne | Direction initiale tangente à la pente, recherche de passages proches de la même altitude ; maisons sur des sols suffisamment réguliers. |
| Village de rivière | Direction guidée par la rivière native la plus proche et distance à la berge ; rues sur sol sec, sans traversée implicite. |
| Village de pêcheurs | Orientation et trajectoire guidées par le rivage réel (mer ou eau native), activité pêche proposée automatiquement et comptoir si son accès convient. |
| Rues alignées (ancien modèle) | Compatibilité explicite avec les projets précédents. |

Les formes nouvelles sont indépendantes de la taille et du style architectural. Le choix d’un point d’activité n’impose plus une structure radiale aux villages organisés le long d’un passage. Les mêmes maisons, portes, équipements et chemins V3 servent à tous les modèles.

## Adaptation réelle, limites visibles

Les tracés sont déterministes et bornés : recherche locale dans deux directions, coût de courbure, pente, altitude ou distance à l’eau selon le modèle, vérification de chaque tronçon par le terrain et les collisions existantes. Les maisons cherchent ensuite une implantation et un accès libres autour du tracé retenu ; leurs entrées s’orientent vers le chemin. Les extrémités peuvent s’arrêter devant un obstacle : le nombre demandé reste une cible, et le nombre réalisable est affiché.

Les modèles liés à l’eau refusent un site intérieur sans rivière ou rivage à proximité. **Chercher un emplacement** présélectionne aussi selon cette proximité puis valide la proposition complète. La mer n’est pas confondue avec une rivière et les réservations agricoles restent exclues des implantations.

Le modèle montagne ne terrasse pas le relief. Les fortes pentes sans replats peuvent ne permettre aucune maison ; il faut alors déplacer le village ou préparer le terrain dans son éditeur. Ce lot ne construit ni pont, escalier physique, quai, enceinte ou port bâti. Un village de rivière peut occuper une rive : aucune liaison vers l’autre rive n’est supposée sans accès réel.

## Édition et compatibilité

Centre, rayon, orientation, zone dessinée, déplacements individuels, variations des façades, verrous et application transactionnelle restent communs. Les poignées de quartiers radiaux sont masquées pour les organisations suivant un passage ; les poignées de maisons restent disponibles. Leur déplacement est relatif à la position réellement proposée, y compris si la recherche avait dû s’écarter du premier candidat.

Les nouvelles valeurs `street`, `mountain`, `river`, `fishing` étendent `SettlementRecipe.layout.pattern` version 1. L’absence de `layout` et les trois valeurs précédentes gardent leur comportement. Les références à l’eau sont recalculées à partir des sources natives courantes, sans copie d’un réseau hydrologique dans la recette. Une modification de l’eau peut donc changer la proposition suivante ; les verrous et retouches de sources continuent d’être préservés.

## Vérification

`tests/contextual-settlements.test.mjs` vérifie les quatre implantations sur des fixtures distinctes, les sources et accès natifs, le flanc en altitude près d’un sommet, les berges sèches, le comptoir de pêche, la réaction à une rivière modifiée, le refus d’un site sans eau, la recherche d’un rivage et le déplacement individuel d’une maison. Les fixtures restent dans `tools/` et ne remplacent pas la carte officielle.

`npm run test:contextual-settlements` choisit chaque modèle dans le vrai Studio et contrôle aperçu, poignées, création, export ZIP et réouverture. Les captures et son rapport sont dans [captures/contextual-settlements-v1](captures/contextual-settlements-v1/). La régression `npm run test:organic-settlements` vérifie le modèle concentrique précédent.

- [Village-rue](captures/contextual-settlements-v1/street-preview.png)
- [Village de montagne](captures/contextual-settlements-v1/mountain-preview.png)
- [Village de rivière](captures/contextual-settlements-v1/river-preview.png)
- [Village de pêcheurs](captures/contextual-settlements-v1/fishing-preview.png)

Les captures montrent les propositions effectivement générées, pas une garantie artistique pour chaque graine. Aucun résultat de FPS n’est revendiqué.

Qualification : 656 tests unitaires réussis, build avec vérification TypeScript réussi, 21 contrôles navigateur contextuels et 14 contrôles de régression organique réussis. Les captures contextuelles demandent 20 maisons : 20 proposées pour la rue, la montagne et les pêcheurs, 17 pour la rivière. Toutes les propositions capturées passent la validation avant création ; les cibles partielles restent affichées.

Étude suivante, non implémentée : [79 — villes sur deux rives, ponts, diversité et vie locale](79-RIVER-TOWNS-DIVERSITY-LIFE-PLAN.md).
