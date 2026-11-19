# NPC Life V3 — qualification pour Studio

Branche : `feat/npc-life-v3-social-navigation`. Ce document décrit les critères d'acceptation, pas une déclaration de fonctionnalité terminée.

## Architecture retenue

- Les personnages, les horaires, les ancrages, le dialogue et les trajets sont persistés dans les sources V3 existantes.
- Un unique modèle humanoïde hamster, avec représentation économique à distance et budget de rigs.
- Agendas à échantillonnage analytique, navigation validée par les surfaces réelles, A* borné, pas de recherche de trajet dans la boucle de rendu.
- Studio modifie la source via une transaction avec Undo/Redo ; le jeu compile les données issues de ces sources. Pas de second registre persistant.
- La génération ne fabrique ni emploi, ni maison, ni récompense si aucun ancrage natif fiable ne les justifie.

## Disponible sur cette branche

- Affectation explicite domicile/poste avec validation de trajet, horaires, limites d'occupation et exclusivité des postes ; espaces de jeu partagés pour les enfants.
- Inspection dans Studio : horaires, métier, prévisualisation journalière, ancrages de domicile et de travail, journal des incohérences du registre et recentrage des habitants.
- Pauses repas/sociales sur lieux atteignables et déplacements de routine analytiques ; dialogues contextualisés par le métier, la météo et le moment.
- Ponts/chemins multi-niveaux uniquement avec surfaces qualifiées et connexions réellement accessibles.
- Première mission sociale utilisant les objectifs, dialogues, choix et sauvegardes déjà présents.
- Tests unitaires V3 sur agenda, navigation en couches, sociabilité, quêtes et règles d'affectation.

## Conditions de sortie — ne pas merger avant qualification

1. **CI** : tests Node, TypeScript, build, générations déterministes et tests Studio navigateur verts sur le SHA final.
2. **Studio** : création/édition de plusieurs hamsters, modification d'horaire et métier, réaffectation maison/poste, Undo/Redo, export/import V3 et `Jouer ici` ; vérifier que les choix restent stables après régénération.
3. **Navigation** : travail de jour, retour de nuit, pause sociale, dialogue pendant marche, pont avec dénivelé, porte, croisement de routes superposées, terrain mouillé et modification de relief. Aucun téléport visuel ni route invalide.
4. **Sécurité des ancrages** : aucun doublon de poste exclusif, maison saturée, orphelin après suppression d'un lieu, ni écrasement d'une édition auteur.
5. **Gameplay** : donneur de quête mobile, interaction à portée réelle, objectif et récompense validés par les actions existantes, restauration après sauvegarde.
6. **Performance** : 10/40/100 habitants ; trajectoires hors caméra, plafonds de rigs, FPS/CPU/VRAM et mémoire vérifiés dans un navigateur sur PC cible 4–8 Go.
7. **Accessibilité** : clavier, focus et dialogues ; textes sans HTML injecté ; commandes lisibles et diagnostics actionnables.

## Reste à implémenter ou démontrer

- Replanification des itinéraires lorsque le relief, les portes ou obstacles sont modifiés à chaud et qualification des intérieurs/escaliers.
- Édition visuelle de pauses, points de rencontre et horaires par glisser-déposer ou tracé, avec validation complète depuis Studio.
- Variantes de sociabilité (groupes, enfants, scènes et interactions), sons/barks/sous-titres et animations cohérentes.
- Panneau de diagnostic global exhaustif après chargement des secteurs concernés (l'aperçu courant porte seulement sur les secteurs chargés).
- Intégration et test navigateur des missions et récompenses, dont les donneurs de quêtes en mouvement.
- Campagne de playtests multi-villages, benchmarks matériels et vérification des migrations historiques.

## Politique de validation

Ne pas confondre `implémenté`, `testé unitairement`, `testé en navigateur` et `qualifié`. Toute régression bloquante de CI suspend la fusion. Conserver les identités, dialogues et fichiers utilisateur existants.
