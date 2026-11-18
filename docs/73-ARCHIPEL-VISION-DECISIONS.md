# 73 — Archipel : vision et décisions de gameplay

**Statut : DECISIONS VALIDÉES, architecture FUTURE ; non implémenté.** Cette spécification est la source de vérité fonctionnelle du système d'îles. Lire avec [74 — Registre](74-ISLAND-MANIFEST-REGISTRY.md), [75 — Voyages](75-ISLAND-TRAVEL-FERRIES-PORTS.md), [76 — Autonomie](76-ISLAND-AUTONOMY-ECONOMY-TRADE.md), [77 — Communautés](77-ISLAND-COMMUNITY-CONSTRUCTION.md) et [79 — Roadmap](79-ISLAND-ROADMAP-VALIDATION.md).

## 0. Stratégie de livraison — règle non négociable

1. **Étape immédiate : îles d'exemple STATIQUES, pré-générées, validées puis compilées** et publiées dans le build GitHub Pages. Le navigateur peut choisir parmi ces îles et voyager entre elles **sans serveur, compte, connexion réseau temps réel ni multijoueur**. Le catalogue statique doit inclure au moins l'île de démonstration existante 4 × 3 km et permettre d'ajouter d'autres exemples sans réécrire le runtime.
2. Chaque île demeure **une carte géographique continue et sectorisée**, selon les contrats Studio V3. Le nouvel archipel est un **ensemble de mondes distincts**, PAS un seul gigantesque heightfield. La limite de conception 10 × 10 km s'applique à une carte/île, pas à l'archipel entier ; aucune performance n'est promise par cette limite.
3. **Une seule île 3D active par client**. La transition en bateau utilise une petite scène indépendante, libère les ressources de l'île source et charge l'île cible ; elle n'oblige jamais deux mondes complets en RAM/VRAM.
4. **Multijoueur : préparation des contrats maintenant ; implémentation/activation reportée à un jalon explicitement autorisé.** Les contrats prévoient identités, droits, journal des mutations et simulation autoritaire, sans introduire de socket, serveur, identité cloud ou dépendance réseau dans la bêta solo GitHub Pages.
5. **Ne pas annoncer de fonctionnement permanent hors ligne en solo statique :** hors onglet/session, aucune simulation ne tourne ; son état est reconstruit lors de la réouverture par rattrapage déterministe et borné (76). Le futur serveur pourra avancer les îles en arrière-plan.
6. Un monde publié dans GitHub Pages est un **snapshot statique**. Le jeu solo enregistre les modifications personnelles localement. La publication d'une île utilisateur au catalogue commun ne peut PAS être automatique sur Pages sans infrastructure ou processus éditorial externe.

## 1. Îles, spécialisation et progression

- L'auteur choisit la recette géographique (île forestière, montagneuse, agricole, rocheuse, volcanique, marécageuse, côtière, etc.) et les ressources initiales ; le générateur produit relief, bassins, biotopes, zones constructibles et emplacements candidats de débarquement.
- **Spécialisation économique, niveau de développement et accessibilité maritime sont trois dimensions distinctes.** Une petite île sauvage peut rester isolée et viable ; grand port facultatif, non condition de victoire.
- Le joueur découvre et visite les îles **validées et publiées** accessibles par les liaisons maritimes ; une île non publiée ne figure pas dans le catalogue jouable. Certaines destinations peuvent être cachées jusqu'à découverte, d'autres visibles mais verrouillées avec une raison explicite.
- L'archipel peut contenir îles officielles sauvages (contenu protégé) et îles constructibles personnelles/communautaires ; la publication et les droits ne sont pas déduits du biome.

## 2. Coopération et gouvernance

- **Aucun propriétaire unique n'est requis.** Une île peut être privée à un groupe, sur invitation ou publique ; son mode de construction est configurable : libre encadré, collectif, vote pour gros projets, mode mixte avec parcelles privées.
- Séparer **droits d'accès de l'île, droits sur parcelles, droits sur objets, droits de chantier et contribution aux stocks**. Un joueur qui construit une maison ne devient pas propriétaire de la géographie.
- Les politiques évoluent par action autorisée et auditée sans effacer les contributions ni autoriser de destructions arbitraires.
- Les petits objets peuvent être placés automatiquement sous quotas ; les projets moyens disposent de chantiers collaboratifs ; les infrastructures majeures peuvent demander validation collective (77).
- Des modes sans gouvernance humaine permanente et des îles ouvertes aux visiteurs sont possibles ; les règles prédéfinies restent applicables en l'absence des fondateurs.

## 3. Autonomie et transport

- Production, consommation, repousse, besoins des PNJ, stockage, importations et exportations reposent sur une **simulation logique événementielle** (76), sans rendu du monde hors présence du joueur.
- Liaisons via petits rameurs, navettes et navires ; niveaux d'infrastructure déterminent **fréquence de présence, capacité de transport et options commerciales** indépendamment du type de biome.
- **Côte sauvage, sans ponton/port : bateau de voyageurs présent UN jour sur SEPT (temps de jeu). Grand port au niveau maximum : transport disponible en permanence.** Paliers intermédiaires configurables/à équilibrer (75).
- Cloche à l'arrivée et **cinq minutes de temps de jeu avant départ** ; marqueur du bateau sur la carte joueur quand il est présent. Sélection de destination dans la carte de l'archipel.
- Voyage masqué par cinématique depuis la poupe d'une barque vers un gros navire ; scène indépendante et chargement à durée non fixe.

## 4. Invariants techniques et exclusions

- Ne pas confondre **géographie auteur**, **monde compilé immuable**, **état persistant d'île**, **sauvegarde joueur** et **état de session** (15, 74).
- Réutiliser Studio, prefabs, placement, collisions, graphe de chemins, économie et audio existants ; aucun système concurrent ad hoc.
- Aucun script JavaScript arbitraire venant d'une carte ; validation de schémas/IDs/références.
- La bêta statique ne fournit ni construction collaborative entre navigateurs, ni dépôt de ressources partagé entre clients, ni propriétaire de monde distant, ni flotte commerciale globale transactionnelle.
- Les valeurs illustratives (coûts, jours d'escale intermédiaires, capacité/quotas, durée du cycle jour/nuit) sont **PROPOSÉES À CALIBRER**, sauf les deux extrêmes de desserte et les signaux explicitement validés.

## 5. Séparation des statuts

**DECIDED** = choix de gameplay. **SPECIFIED** = contrats écrits. **IMPLEMENTED** = code sur une branche identifiée. **TESTED** = tests exécutés avec preuves. **RELEASED** = sur GitHub Pages. Ne jamais faire passer ces documents de conception pour des fonctionnalités disponibles.
