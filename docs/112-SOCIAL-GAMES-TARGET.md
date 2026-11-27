# 112 — Jeux sociaux, terrier et compétitions : game design cible

Date : 27 novembre 2026. Complément à [111 — Game design cible](111-GAME-DESIGN-TARGET.md). Catalogue et règles de conception, pas un état d'implémentation.

## 1. Orientations retenues

- Les jeux constituent un pilier du gameplay social, indépendamment de l'économie de récolte.
- Le terrier possède un point d'accès à une salle de jeux, surtout pour deux à quatre joueurs. Les tavernes, villages, terrains et îles publiques proposent des activités spontanées ou organisées.
- Une activité compétitive récompense la maîtrise réelle, avec progression propre à la discipline. Aucun achat ne doit modifier les chances de victoire, la précision, la puissance ni les récompenses compétitives.
- Cible de classification familiale : PEGI 12 maximum. Pas de paris, mises de ressources ou simulations de casino ; hasard ludique permis dans les jeux classiques. Aucun achat de contenu aléatoire. La conformité internationale et la classification effective restent à vérifier avant publication.
- Monétisation envisagée et acceptée comme orientation : cosmétiques transparents et abonnement facultatif, sans accès payant à une meilleure performance. Les distinctions gagnées par compétence ne sont pas achetables.
- Les cœurs peuvent être des récompenses sociales, non achetables, non misables et non convertibles en argent. Leur usage précis pour débloquer les relations demeure à arbitrer (111).

## 2. Catalogue par lieu

Capacités proposées, à qualifier. Les variantes de règles ne sont pas des moteurs distincts. La disponibilité publique ne nécessite pas d'être propriétaire d'une installation.

| Lieu | Jeux candidats | Participants proposés | Accès |
|---|---|---|---|
| Terrier | Échecs, dames, dominos, puissance 4, bataille navale, cartes sans mise, dés, memory, puzzles coopératifs | 1–4 | Table ou point interactif, invitation, entraînement solo ou PNJ |
| Taverne / salle publique | Fléchettes, billard, baby-foot, palets, air hockey, anneaux, bowling | 1–6 | Stations libres, invitation, file locale |
| Village / parc | Pétanque, mölkky, quilles, croquet, mini-golf, tir à l'arc, frisbee, chamboule-tout, tir sur cible | 1–8 | Terrain visible, départ rapide, score |
| Complexe sportif | Golf, tennis, badminton, football, volleyball, basketball | 1–8 selon discipline | Terrain dédié, inscription, équipe |
| Côte / port / île nautique | Surf, régates, kayak, natation, plongée, plongeon, concours de pêche | 1–32 | Quai, plage, départ organisé |
| Montagne / parcours | Ski, slalom, roulade, planeur, obstacles, courses de montures | 1–16 | Parcours et lignes de départ |
| Exploration / grottes | Cache-cache, chasse au trésor, capture de drapeau sans combat, labyrinthe, énigmes coopératives, expédition souterraine | 1–32 | Entrée de zone ou groupe |
| Place communautaire | Concert, rythme, festival multi-épreuves, chantier/défi collectif | 1–64 et davantage après qualification | Entrée libre, calendrier et objectifs collectifs |

Échelles : duel, petit groupe (3–8), compétition locale (8–16), événement (16–64+). Distinguer participants actifs, spectateurs et joueurs simplement présents ; aucun chiffre ne constitue une capacité réseau démontrée. Les jeux courts visent 2–5 minutes ; golf, échecs et événements peuvent durer davantage.

## 3. Terrier : première priorité de spécification

Un espace de jeu compact, distinct du monde extérieur ; accès depuis un meuble interactif. Le joueur choisit un jeu, invite des amis, crée une session ou s'entraîne. Les modes ouverts au public restent accessibles dans les lieux communs. Possibilité de jouer sans ami connecté, avec PNJ lorsque pertinent, ou défi de score.

Premiers jeux proposés, non encore arbitrés :
- Puissance 4 : duel, règles simples, partie courte ; IA locale, tour par tour, victoire par alignement de quatre.
- Échecs : duel, règles standard, mode sans chrono et cadence choisie ; moteur de règles distinct de l'IA, niveaux PNJ ; classement uniquement dans les formats compétitifs appropriés.
- Puzzle coopératif : 1–4, objectif commun ; variante solo avec difficulté adaptée, pas de récompense issue du perdant.
- Jeux de cartes ou de dés : phase suivante, règles classiques sans mise ni imitation du casino ; hasard déterministe côté simulation, vérifiable en multijoueur.

Chaque fiche de jeu doit définir règles, conditions de fin, nombre de joueurs, durée, commandes PC/mobile, mode PNJ, spectateurs, reprise/abandon, récompenses, classement, coût technique et accessibilité. Les règles et la présentation sont séparées.

## 4. Progression et récompenses

Trois axes indépendants : expérience de discipline (activité), maîtrise (résultats et classement) et relation sociale (activités partagées). Un joueur peut être expert d'un jeu sans être riche ni abonné. Records personnels, statistiques par mode, trophées, titres et apparences de maîtrise exposables dans le terrier. Elo ou équivalent uniquement pour jeux appropriés ; distinguer entraînement, amical et classé. Les modes de hasard pur ne prétendent pas mesurer une compétence.

Récompenses annoncées à l'avance et émises par le jeu : participation effective, objectifs, performance vérifiable, paliers de maîtrise ou réussite coopérative. Cœurs, pièces et objets possibles ; montants et plafond à calibrer. Aucun débit chez le perdant ; pas de cagnotte financée par les joueurs, ni mise de monnaie, objet ou cœur. Plafonner les gains répétitifs et neutraliser les parties arrangées, les comptes fictifs et le farm automatique, sans bloquer le jeu entre amis.

## 5. Monétisation et protection

Acheter directement un cosmétique identifié (plateau, équipement visuel, tenue, animation, thème, décoration de terrier ou d'île) ; aucun prix aléatoire. Abonnement facultatif de soutien aux serveurs, avantages de confort/cosmétiques à définir, aucune puissance compétitive ou obligation pour jouer avec ses amis. Ne pas vendre les trophées et tenues attestant de la compétence. Aucun gain d'argent réel ni mécanisme de retrait, conversion ou marché secondaire des récompenses. Ne pas présenter les cœurs comme une monnaie spéculative.

Public cible incluant les mineurs : modération, blocage, signalement, confidentialité et contrôles parentaux à spécifier ; transparence des achats, absence de pression artificielle et de mécaniques de casino. PEGI 12 est un objectif, non une classification acquise. La conformité de chaque territoire et des flux économiques reste à faire vérifier ; aucune rentabilité n'est démontrée.

## 6. Mutualisation technique

Réutiliser [107 — plateforme unifiée](107-MINIGAMES-UNIFIED-PLATFORM.md) et les contrats de course existants, sans créer un moteur par jeu. Familles candidates : plateau/tour par tour ; cartes/dés ; balle et collisions ; lancer/visée/cibles ; courses et chronométrage ; coopération/énigmes ; musique/rythme ; événements collectifs. Ces familles sont des hypothèses d'architecture, pas des modules livrés.

Session commune : lobby, invitations, règles versionnées, participants, spectateurs, départ, commandes, résultat, abandon, reprise et historique. Autorité logique indépendante du rendu, chargement à la demande, résultat idempotent, pas de boucle de simulation supplémentaire par jeu. En bêta statique : solo/PNJ et éventuellement local sur un même client ; pas de prétention de multijoueur réseau effectif avant jalon autorisé.

## 7. Priorité et qualification

1. Valider catalogue et répartition géographique ; spécifier trois jeux du terrier en détail.
2. Définir l'accès aux tables, invitation, UX de session, entraînement et progression par discipline.
3. Définir règles de récompense, monétisation et prévention des abus ; tester joueurs nouveaux sans ressources et joueurs expérimentés.
4. Étendre les familles existantes aux jeux publics (fléchettes, golf/mini-golf, billard, etc.), puis compétitions et grands événements.
5. Qualifier progressivement capacités et équité sur appareils modestes, accessibilité mobile, charge participants/spectateurs ; réseau uniquement au jalon autorisé.
6. Reprendre ensuite les simulations économiques et l'équilibrage détaillé des filières.

Décisions ouvertes : trois premiers jeux définitifs, choix des cartes/dés, durées, limites de participation, récompenses, cœurs, tarifs cosmétiques/abonnement, coûts serveurs, modération et conformité régionale. Cette priorité remplace l'ordre de travail initial proposé dans le document 111, sans remettre en cause la régulation économique par PNJ dès la première version.
