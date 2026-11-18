# 93 — SURF : état du prototype, comment tester et limites

**Branche :** `docs/surf-island-full-plan` — PR #83 (brouillon). **Statut : implémentation prototype, non qualifiée en navigateur / sur PC ancien.**

Ce journal complète [90 — architecture](90-SURF-ARCHITECTURE-CONTRACTS.md), [91 — île/activités](91-SURF-ISLAND-STUDIO-ACTIVITIES.md), [92 — roadmap](92-SURF-IMPLEMENTATION-ROADMAP.md). Il distingue les fonctionnalités codées des objectifs non livrés.

## Implémentation ajoutée sur la branche

| Sous-système | Fichiers | État |
| --- | --- | --- |
| Vagues paramétriques déterministes, pente/normale/vitesse, profondeur et fondu côtier | `src/surf/wave-field.ts` | PROTOTYPE, tests unitaires |
| Rame/paddle, prise de vague, virage, énergie, pumping, frein | `src/surf/surf-controller.ts` | PROTOTYPE, sensations non qualifiées |
| Saut de crête, réception, wipeout et nage de repli | `src/surf/surf-controller.ts`, `src/player.ts` | PROTOTYPE, collisions à éprouver |
| Intégration mode `surf` à 30 Hz et replay whitelist | `src/player.ts`, `src/physics/movement-state.ts` | PROTOTYPE |
| Shader de houle et maillage 3 m, prise en charge NearSea | `src/render/surf-water-view.ts`, `src/horizon-view.ts`, `src/world.ts` | PROTOTYPE, raccord et iGPU non qualifiés |
| Planche low-poly visible + objet `tool:surfboard` équipable, vente au port | `src/render/surf-board-view.ts`, `src/gameplay/economy.ts`, `src/main.ts` | Premier incrément lié au sac ; skins / animations complets à faire |
| Site de surf de démo, sans changer les cartes | `src/surf/surf-demo.ts` | PROTOTYPE; peut ne trouver aucune zone |
| Modules boost/ramp/buoy à cooldown tick | `src/surf/surf-features.ts`, `src/surf/surf-demo-features.ts`, `src/render/surf-features-view.ts` | PROTOTYPE |
| Course de surf réutilisant gates/chrono/records | `src/gameplay/races.ts`, `src/surf/surf-race-demo.ts`, `src/main.ts` | PROTOTYPE, records locaux |
| Studio V3 : surfZones et surfFeatures facultatifs, validation/compilation, modules d'édition | `src/studio-core/{types,schema}.ts`, `src/studio/{shell,surf-panel}.ts`, `src/runtime/compiled-world.ts`, `src/gameplay/playable.ts` | Premier incrément, UX à éprouver |
| Studio Courses : mode surf + altitude à partir du niveau marin | `src/studio-core/race-authoring.ts`, `src/studio/races-panel.ts` | Premier incrément |
| Audio : reconnaissance du mode de déplacement | `src/audio/router.ts` | Compatibilité de type, **nouveaux événements surf non créés** |
| Tests surf | `tests/surf.test.mjs` | Tests unitaires, CI en cours de qualification |

## Démarrer le prototype dans le navigateur

1. Installer et lancer : `npm ci`, `npm run dev`.
2. Ouvrir un monde généré avec `?surfDemo=1`, par exemple `/?surfDemo=1` si l'île par défaut est disponible.
3. Si un site maritime profond compatible est trouvé, le hamster démarre sur une planche en mer et les vagues apparaissent. Sur une carte sans site compatible, un avertissement console est émis et le jeu reste utilisable.
4. ZQSD/WASD : cap et rame avant la prise de vague ; Shift : propulsion supplémentaire en paddle ou pumping en ride ; Ctrl : frein ; Espace : saut de crête ; B : ranger/reprendre la planche après chute.
5. Ouvrir **Courses**, sélectionner **Surf — descente vers la plage** : quatre checkpoints et chrono local. Un boost, un tremplin et une bouée sont placés automatiquement près du couloir (leur position est un prototype).
6. Option Studio : `Surf` dans le groupe Monde, créer une zone sur la mer à la caméra puis placer des modules de boost/ramp/bouée. Dans `Courses`, créer un circuit de type Surf. La compilation V3 transporte zones et modules vers le runtime.

**La commande `B` est encore un raccourci de mise en planche.** Dans une zone créée par Studio, la planche doit être possédée et équipée depuis le sac ; dans `?surfDemo=1`, elle est autorisée sans inventaire pour les tests. Un véritable bouton d'action contextuelle reste à intégrer avant publication. Aucun raccourci réseau ou accès à un serveur requis.

## Vérifications automatisées

- `npm test` — inclut `tests/surf.test.mjs` et `tests/surf-compiled.test.mjs` (V3/ZIP/compilation/runtime).
- `npm run typecheck` et `npm run build` — cible TS/Vite/Pages.
- `npm run test:water`, `npm run test:boats`, `npm run test:motion`, `npm run test:ui` — vérifier non-régression sur la branche.
- Le test navigateur surf dédié `tools/test-surf-browser.mjs` **reste à créer** : vérifier la présence de vagues et de la planche, l'absence de trous, le saut/landing et le parcours.
- La qualification iGPU et les profils visuels économique/élevé restent à faire. Aucun surcoût CPU/GPU réel n'est encore revendiqué.

## Limitations techniques majeures (suite prioritaire)

1. **SurfZone V1** : rectangle axis-aligned, une seule zone active à la fois dans le runtime (la première zone compilée), hors laboratoire. Évolution : zones polygonales, sélection spatiale, continuité et bathymétrie.
2. **Vagues V1** : surface de hauteur univoque sans tube 3D, hauteur asymétrique mais simplifiée; calibration CPU/GPU, rive et physique à améliorer. Le renderer utilise un pas de 3 m minimum et limite la grille à 160 segments par axe, avant un vrai LOD adaptatif.
3. **Glisse V1** : impulsions de rame, virage et pumping heuristiques, réglages de sensations à mesurer; contrôle aérien limité, collisions/propagation des impacts non qualifiées.
4. **Équipement** : objet `tool:surfboard` dans le catalogue et achat au port, équipable depuis le sac. L'animation, les skins, la location, l'aide contextuelle et la pose 3D du hamster restent à compléter.
5. **Obstacle** : rampes/boosts/bouées déclenchés à rayon fixe, affichage low-poly statique ; systèmes de collisions et placements sûrs doivent encore être qualifiés.
6. **Studio** : outil de création de zone centré caméra, pas de vraie visualisation polygonale ni d'implantation intelligente. Les réglages des obstacles sont limités.
7. **Île spécialisée** : non créée/publiée ; le mode `?surfDemo=1` explore temporairement l'île générée active.
8. **Audio/HUD** : effets aquatiques historiques disponibles mais sons, posture de surf, retour d'équilibre et HUD dédiés non livrés.
9. **Bateaux** : niveau hydrographique volontairement inchangé. Une eau de surf n'influence pas encore la gîte/tangage des bateaux; le futur port devra exclure les brisants.
10. **Multijoueur** : aucune activation réseau; états déterministes prêts pour contrats futurs sous réserve de qualification.

## Plan d'attaque après ce prototype

**Priorité :** faire passer CI, puis ajouter un test navigateur surf reproductible, calibrer le contact/la vitesse/les sauts sur une vraie baie, éliminer les coutures visuelles, mesurer iGPU. Ensuite créer l'île dédiée, rendre la planche équipable depuis le sac, ajouter trois activités complètes et un parcours de progression. L'implantation intelligente et les grandes vagues sont reportées jusqu'à stabilisation du prototype.

Ne jamais déclarer `TESTED`, `QUALIFIED` ou `RELEASED` sur la base de ce journal seul.
