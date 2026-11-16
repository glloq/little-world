# Studio — Production géographique V2 (A → B → C → D → E → H)

Branche : `feat/studio-geography-production-v2` (issue de `main`, non fusionnée).

## A — Géographie et hydrologie

- `watershed-analysis.ts` : D8 borné (256–16 384 cellules), exutoires et *sources candidates* d'après l'accumulation amont. Cap strict même sur cartes très allongées. Un résultat n'est **pas** une preuve de débit physique ; altitude et pente proviennent du terrain actuel.
- `watershed-rivers.ts` : au maximum six propositions, chaque tracé passant dans **le planificateur de rivière guidée et le compilateur WATER existants** ; refus si source déjà occupée, creusement excessif, boucle ou erreur de réseau.
- Le panneau A3 des régions peut **proposer → voir en 3D → créer** un cours d'eau. L'aperçu ne modifie aucune source. Avant application, hydratation des secteurs concernés et nouveau calcul ; refus si le tracé n'est plus identique.
- `planHydroFalls` : jusqu'à six nouvelles cascades proposées en lot, chacune validée contre le réseau déjà modifié. Une seule transaction Undo/Redo pour le lot, après confirmation explicite.
- `depression-fill.ts` : remplissage prioritaire borné (priority-flood, coût O(n log n)), estimation du **niveau de débordement**, de la profondeur et de la surface des cuvettes. La chaîne des prédécesseurs fournit, lorsqu'elle existe, un point de crête du déversoir et un point réellement plus bas en aval (écart > 0,75 m). Le monde n'est pas modifié ; sur les cartes très allongées, la résolution est plafonnée en une réduction directe plutôt qu'en milliers de décréments.
- `basin-lakes.ts` : propositions de lacs selon ce niveau, contour étoilé de 20 sommets suivant les berges réellement échantillonnées. Contrôle des bords et refus des ouvertures non fermées ; aperçu 3D et revalidation intégrale après hydratation avant création V3 explicite. Aucune excavation silencieuse.
- `lake-outflow.ts` : proposition **facultative** de rivière depuis un lac existant, démarrant sur sa rive près d'un déversoir ; liaison `from:lake` vérifiée par le compilateur WATER existant. Rejet si le tracé revient dans le lac, si la rive est trop loin ou si le réseau devient invalide. Le Studio propose « Voir la sortie » et « Créer la rivière de sortie » après nouvelle vérification du relief, dans une transaction annulable. Il ne creuse pas automatiquement le lit.
- Ces algorithmes réutilisent les sources V3, sans données hydrographiques parallèles ni coût en jeu.

## B — Écologie

- Six profils rapides de densité : natif, forêt dense/clairsemée, prairie, marais et rochers. Modification des champs `RegionVegetation` existants, sans nouveaux assets ni textures, conservation des mélanges d'espèces personnalisés.

## C — Constructions

- Échantillonnage des murs modulaires effectué une fois par tracé, au lieu d'être reconstruit pour chaque module : réduction du coût CPU sur les longs murs, sans changement du format V3.

## D / E — Ergonomie et aperçu avant régénération

- Nouvelle ligne 3D jetable de prévisualisation hydrologique (aucun collider, aucun export).
- Vue globale **Canvas2D** des lacs proposés, sources de bassins, cours d'eau, déversoirs naturels et cascades, sans nouvelle scène WebGL, sans textures ni recalcul du relief. Projection géographique proportionnelle contrôlée en tests.
- Régions : **mini-carte des cellules réellement modifiées** après simulation exacte (vert ajouté, orange effacé, bleu remplacé). Les conflits et les cellules protégées restent présentés par les comptes de validation. Le calcul utilise les mêmes `applyRegionBatch` / masques que l'écriture.
- Maximum 16 384 cellules visuelles ; nombre total exact conservé. Pour les reliefs modifiés, deuxième carte avec points d'altitude avant/après échantillonnés (jusqu'à 4 096 tests, rouge pour hausse et bleu pour baisse), clairement distincte du diff exact des masques. Pas de copie globale du monde, uniquement les secteurs impliqués. Les index de secteurs temporaires sont copiés pour ne pas polluer le document source.
- Le moindre changement confirmé invalide la prévisualisation, qui doit être régénérée avant l'application.
- L'assistant de création affiche l'avancement de chaque domaine à partir de sources réellement présentes.

## H — Performance / qualité

- `geographyReadiness` : métriques auteur non destructives (secteurs indexés/chargés, reliefs, falaises, régions, hydro, objets, chemins) et avertissements de budget.
- Diagnostics du viewport enrichis : draw calls, triangles et budget des falaises.
- Tests Node : échantillonnage D8 et priority-flood sur cartes allongées et extrêmes, cuvettes fermées vs pentes ouvertes, déversoir aval, rivière de sortie de lac, déterminisme, planification sans mutation, profils écologiques, budgets et placement des murs, prévisualisation exacte des masques et échantillons des altitudes.
- Tests navigateur Studio géographie V2 : panneaux des propositions hydrologiques, contrôle d'export non destructif, aperçu des compositions régionales.
- Action GitHub : annulation des matrices navigateur dépassées à chaque nouveau commit, séparément par événement PR/push.
- Éditeur de prefab : protection des actions contre une sélection périmée ; test navigateur lié à l'ID sélectionné, diagnostic des valeurs exportées.

## Limites non résolues

- Les déversoirs sont estimés et une rivière de sortie peut être **proposée** depuis un lac existant lorsqu'un tracé descendant valide est trouvé ; il ne s'agit pas d'un routage fluvial continu garanti. Le D8 de tracé des rivières ne traverse pas automatiquement les dépressions, et ne simule ni précipitations ni débits. Certains secteurs éloignés peuvent être non hydratés lors de l'analyse initiale ; l'application exige une revalidation.
- Les cascades sont validées hydrauliquement mais leur rendu et le pied de chute doivent être inspectés en jeu.
- L'aperçu régional montre les **masques source exacts** et des points d'altitude échantillonnés (max 4 096), pas une image WebGL exacte « avant/après » du paysage.
- Aucun benchmark sur GPU intégré réel ; pas de garantie de 30 FPS.
- Restent à réaliser : routage fluvial **continu** entre sous-bassins et à travers plusieurs lacs, représentation non étoilée des grands lacs avec îles, connexions hydrologiques complexes, filtres d'exclusion de végétation par classe, vrais groupes de transformations, validation de traversabilité.
