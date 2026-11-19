# 99 — Génération de population PNJ : capacités réelles, affectations et diagnostics

**Statut : IMPLEMENTATION / QUALIFICATION EN COURS sur PR #90.**  
Base contrôlée : `main@a2e17a84`. Contrats antérieurs : [96 — Vie des PNJ](96-NPC-LIFE-DIALOGUES-SCHEDULE-AUDIT.md), [97 — Roadmap](97-NPC-LIFE-IMPLEMENTATION-ROADMAP.md), [98 — V1 réelle](98-NPC-LIFE-V1-IMPLEMENTATION.md).

## Objectif du lot

Évoluer d'un générateur de quelques figurants à un **plan de population qualifié**, en ne consommant que les sources natives du Studio. L'ensemble doit rester compatible avec les anciennes cartes, les changements manuels et l'architecture d'un hamster unique pour tous les PNJ humanoïdes. Aucune ressource n'est créée par les animations des métiers.

## Architecture ajoutée

| Source | Responsabilité | Garanties |
| --- | --- | --- |
| `src/npc-life/capabilities.ts` | `localLifeCapabilities` : maisons, vrais métiers, lieux publics, postes de quai, champs NPC, mine réelle | Jamais de pêcheur sans quai, mineur sans mine ; provenance par ID d'ancre |
| `src/npc-life/assignments.ts` | `createResidentAssignmentPlanner` : foyers disponibles, itinéraires, postes réservés et cache | Affectation par **distance de marche**, pas Euclide ; limite de 2 habitants par maison par défaut ; un salarié par poste |
| `src/npc-life/routes.ts` | Graphe natif partagé ; nœuds distants de 2 m, raccordement géométrique des intersections en T | Index spatial, recherche A* bornée ; validation eau/sol/obstacles ; ponts surélevés exclus tant que leur support n'est pas qualifié |
| `src/settlements/population.ts` | Création déterministe des enfants et travailleurs | N'émet un `Resident` que si foyer + poste + route vérifiés ; réutilise le rig hamster ; préserve modifications et dialogues auteurs |
| `src/settlements/local-life.ts` | Hôte d'accueil avec métier conditionnel | Peut rester un greeter statique si aucune destination professionnelle réelle n'est accessible ; ne réserve pas plusieurs postes |
| `src/npc-life/registry.ts` | `residentRegistry` : vue **lecture seule** des entités source | Identités, métier, maison, poste, auteurs/provenances, diagnostics de source manquante/déplacée et doublon |
| `src/settlements/planner.ts` | Composition et diagnostic avant publication | Un graphe/route planner partagé pour le village ; métriques `lifeStats` dans le plan seulement, pas en sauvegarde |
| `src/settlements/validation.ts` | Contrôle du contenu existant après sauvegarde | Signale avec `LIFE_*` les maisons/postes manquants, modifiés, sur-occupés ou dupliqués |
| `src/studio/settlements-view.ts` | Interface utilisateur de génération et de suivi | Population, postes et trajets impossibles visibles ; panneau par village avec sélection des habitants et accès à l'inspecteur 3D |

Les `Resident` sont des **composants facultatifs** ; les anciens PNJ sans routine continuent à fonctionner comme auparavant. Les identifiants déjà publiés (`-host`, `-resident-i`, `-worker-i`) sont préservés lors de la régénération. La provenance (`AmenityRecord.entityHash/dialogueHash`) protège les modifications et suppressions de l'auteur.

## Qualification technique

Tests ciblés :
- `tests/npc-life-generation-v2.test.mjs` : inventaire de métiers réels, exclusion des emplois fictifs, chemin non euclidien, eau, obstacle, intersection T, occupation du domicile, idempotence.
- `tests/npc-life-registry.test.mjs` : lecture seule, diagnostic de perte de source, conservation des dialogues et modifications auteurs.
- Tous les anciens tests `npc-life*.test.mjs`, `settlements*.test.mjs`, `npc.test.mjs` ; navigation et migration V2/V3.

Ne déclarer **QUALIFIED** qu'après `npm test`, `npm run build`, CI navigateur (Studio/services/jeu), audit de trajectoires et benchmark sur matériel cible de 4–8 Go. L'état des tests du SHA courant doit être consulté dans la PR #90. Un test qui trouve un itinéraire ne certifie pas à lui seul une animation sans téléportation visible.

## Limitations et phases suivantes

1. **G07 à finir** : ponts et escaliers multi-niveaux, portes dont l'état change, replanification au runtime et évitement de foules (actuellement, les chemins à `supportId` sont volontairement exclus).
2. **G08–G11** : vraies journées multi-activités et météo, pause et rencontres, groupes d'enfants, animations continues et transitions rig/LOD sans saut.
3. **G12–G15** : catalogue étendu des métiers/port/voyage, gestes et accessoires, dialogues contextuels avancés et quêtes `QuestDirector` sans softlocks.
4. **G16** : affectation manuelle du domicile/poste par sélection spatiale dans Studio (le panneau actuel inspecte la population et permet les horaires ; il ne change pas encore les ancres par glisser-déposer).
5. **G18** : scénarios de 0/10/30/60/100 PNJ source, jeu rapide en planeur, plusieurs îles, contrôle CPU/GPU/draw calls, rechargement et 20–30 FPS en fonction du budget réellement mesuré.
6. **Architecture future** : économie de fond / transport inter-îles uniquement lorsque les métiers ont des événements transactionnels réels, sans déclencher la collecte joueur via une animation PNJ.

**Politique de sûreté :** un emploi absent, un trajet dangereux ou un budget dépassé supprime l'affectation automatique et crée un diagnostic ; il ne téléporte pas l'habitant, ne crée pas de métier fictif et ne modifie pas les récompenses du joueur.
