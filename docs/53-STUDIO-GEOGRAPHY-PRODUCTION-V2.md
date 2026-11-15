# Studio — Production géographique V2 (A → B → C → D → E → H)

Branche : `feat/studio-geography-production-v2` (issue de `main`, non fusionnée).

## A — Géographie et hydrologie

- `watershed-analysis.ts` : D8 borné (256–16 384 cellules), exutoires et *sources candidates* d'après l'accumulation amont. Cap strict même sur cartes très allongées. Un résultat n'est **pas** une preuve de débit physique ; altitude et pente proviennent du terrain actuel.
- `watershed-rivers.ts` : au maximum six propositions, chaque tracé passant dans **le planificateur de rivière guidée et le compilateur WATER existants** ; refus si source déjà occupée, creusement excessif, boucle ou erreur de réseau.
- Le panneau A3 des régions peut **proposer → voir en 3D → créer** un cours d'eau. L'aperçu ne modifie aucune source. Avant application, hydratation des secteurs concernés et nouveau calcul ; refus si le tracé n'est plus identique.
- `planHydroFalls` : jusqu'à six nouvelles cascades proposées en lot, chacune validée contre le réseau déjà modifié. Une seule transaction Undo/Redo pour le lot, après confirmation explicite.
- Ces algorithmes réutilisent les sources V3, sans données hydrographiques parallèles ni coût en jeu.

## B — Écologie

- Six profils rapides de densité : natif, forêt dense/clairsemée, prairie, marais et rochers. Modification des champs `RegionVegetation` existants, sans nouveaux assets ni textures, conservation des mélanges d'espèces personnalisés.

## C — Constructions

- Échantillonnage des murs modulaires effectué une fois par tracé, au lieu d'être reconstruit pour chaque module : réduction du coût CPU sur les longs murs, sans changement du format V3.

## D / E — Ergonomie et aperçu avant régénération

- Nouvelle ligne 3D jetable de prévisualisation hydrologique (aucun collider, aucun export).
- Régions : **mini-carte des cellules réellement modifiées** après simulation exacte (vert ajouté, orange effacé, bleu remplacé). Les conflits et les cellules protégées restent présentés par les comptes de validation. Le calcul utilise les mêmes `applyRegionBatch` / masques que l'écriture.
- Maximum 16 384 cellules visuelles ; nombre total exact conservé. Pas de copie globale du monde, uniquement les secteurs impliqués.
- Le moindre changement confirmé invalide la prévisualisation, qui doit être régénérée avant l'application.
- L'assistant de création affiche l'avancement de chaque domaine à partir de sources réellement présentes.

## H — Performance / qualité

- `geographyReadiness` : métriques auteur non destructives (secteurs indexés/chargés, reliefs, falaises, régions, hydro, objets, chemins) et avertissements de budget.
- Diagnostics du viewport enrichis : draw calls, triangles et budget des falaises.
- Tests Node : échantillonnage D8 sur carte allongée, déterminisme, planification sans mutation, profils écologiques, budgets et placement des murs, prévisualisation exacte des régions.

## Limites non résolues

- Le D8 ne comble pas les cuvettes et ne simule pas les précipitations : les candidats sont **indicatifs**, et des sources peuvent ne produire aucune rivière valide. Certains secteurs de terrain éloignés ne sont pas hydratés lors de l'analyse initiale ; la revalidation de l'application est obligatoire.
- Les cascades sont validées hydrauliquement mais leur rendu et le pied de chute doivent être inspectés en jeu.
- L'aperçu régional montre les **masques source modifiés**, pas une image WebGL exacte « avant/après » du paysage.
- Aucun benchmark sur GPU intégré réel ; pas de garantie de 30 FPS.
- Restent à réaliser : drainage avec remplissage des dépressions, placement assisté de lacs, connexions hydrologiques complexes, filtres d'exclusion de végétation par classe, vrais groupes de transformations, validation de traversabilité.
