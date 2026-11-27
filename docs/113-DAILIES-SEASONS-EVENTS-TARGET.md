# 113 — Objectifs journaliers, saisons et événements internationaux

Date : 27 novembre 2026. Statut : conception cible, non implémentée. Complément à [111 — Game design cible](111-GAME-DESIGN-TARGET.md) et [112 — Jeux sociaux](112-SOCIAL-GAMES-TARGET.md). Les orientations validées sont distinguées des exemples chiffrés et des décisions ouvertes.

## 1. Objectifs journaliers — décisions validées

- Les dailies encouragent le joueur à circuler dans le monde et à réaliser **trois à cinq actions différentes**.
- Budget de temps total : **5 à 15 minutes maximum**, déplacements, interfaces et attente compris. Ce plafond vaut également pendant les événements.
- Le système doit être équitable entre pêcheur, mineur, forestier, agriculteur et futures spécialisations. Il ne doit pas imposer un autre métier, un équipement inaccessible, un trajet maritime long ou la présence d'un autre joueur.
- Chaque joueur peut accomplir ses objectifs seul (PNJ, activités individuelles) ou à plusieurs. Les interactions sociales enrichissent le jeu, sans devenir un verrou.
- Les pièces proviennent principalement des activités économiques et des commandes ; les cœurs peuvent récompenser la diversité des activités et la progression sociale. Aucun cœur acheté, misé ou convertible en argent (112). Leur rôle exact et leur barème restent ouverts.
- Pas de pénalité d'absence, série de connexions obligatoire, achats nécessaires ou objectifs perdus à cause d'un prérequis non accessible.

### Accessibilité géographique — contrainte validée

Les objectifs journaliers sont consultables depuis le terrier ou le menu du joueur sur n'importe quelle île, et validés automatiquement. Le joueur peut obtenir la récompense complète sans quitter son île personnelle ; aucune visite de l'île principale, mairie ou PNJ n'est obligatoire pour consulter, valider ou réclamer les récompenses. Les objectifs occasionnels sur l'île principale (football, mini-golf, commerce, aide PNJ) disposent toujours d'une alternative équivalente ailleurs. Aucun bonus quotidien indispensable n'est réservé à l'île principale.

Les rendez-vous communautaires sont volontaires, distincts des dailies et non obligatoirement quotidiens ; deux à trois par semaine constituent une hypothèse, à calibrer. Voir [114 — Île principale](114-MAIN-ISLAND-TARGET.md).

### Paliers proposés, à équilibrer

| Actions distinctes | Budget cumulé cible | Cœurs cumulés (exemple) |
|---|---:|---:|
| 3 | 5 min | 2 |
| 4 | 10 min | 3 |
| 5 | 15 min | 5 |

Les récompenses sont cumulées au sens du total atteint : passer de 3 à 4 actions ajoute 1 cœur dans cet exemple, et non 3. Ces montants ne sont pas validés. Les pièces obtenues par vente ou commande restent indépendantes. Les paliers de 5/10/15 min sont des cibles de test, non des durées démontrées.

### Catalogue extensible des familles d'activités

Le catalogue n'est pas fermé. Les nouvelles activités sont raccordées au même moteur d'objectifs ; ne pas développer un système de dailies par métier.

| Famille | Exemples de tâches courtes |
|---|---|
| Récolte | Pêcher, miner, couper du bois, récolter des légumes, cueillir |
| Transformation | Préparer un plat, fondre un lingot, scier des planches, moudre de la farine, fabriquer du tissu |
| Commerce | Vendre un produit, honorer une commande, troquer |
| Logistique | Déposer une livraison à proximité, charger des marchandises |
| Construction | Contribuer en matériaux, placer un élément autorisé, améliorer un bâtiment |
| Décoration | Aménager le terrier, personnaliser un espace ou le hamster |
| Exploration | Découvrir une zone accessible, retrouver un point d'intérêt |
| Sports | Terminer un parcours court, participer à une épreuve |
| Jeux de société | Terminer une partie courte, réussir un puzzle |
| Vie sociale | Aider un PNJ ou un ami, participer à une activité commune |
| Écologie | Replanter, entretenir les cultures, restaurer un habitat |
| Culture et événements | Jouer de la musique, compléter une collection, participer à une fête |

Les catégories de validation peuvent être regroupées en récolte, transformation, commerce, exploration, divertissement et contribution ; le découpage définitif reste ouvert. Récolter cinq fois la même ressource ne doit pas valider cinq catégories. Préserver néanmoins plusieurs choix pertinents pour un joueur spécialisé.

### Génération et équité

Proposition technique : sélectionner les objectifs selon spécialisation, progression, outils, stocks, biomes accessibles, saison et activités proches. Évaluer leur coût en temps actif et la faisabilité du parcours complet ; ne pas équilibrer uniquement les quantités produites.

- Exemples de récolte : quelques légumes, poissons, minerais ou rondins ; quantités à calibrer. Semer ou entretenir une parcelle est possible sans attendre sa croissance. Ne pas exiger qu'une nouvelle production longue se termine avant le reset.
- Générer des alternatives locales gratuites si un objectif est indisponible. Les quêtes d'événement se substituent à des objectifs habituels au lieu d'allonger la liste obligatoire.
- Valider sur événements métiers réussis et traçables, automatiquement pendant le jeu. Ne pas payer pour une animation seule, une vente annulée ou une action répétée fictivement.
- Une action de jeu peut contribuer à plusieurs progressions (discipline, relation, quête) selon les règles, mais une récompense quotidienne ne peut être créditée deux fois.
- Garder les objectifs hebdomadaires et permanents séparés ; ils ne rallongent pas les dailies. Leur politique de rattrapage reste à définir.

## 2. Trois calendriers indépendants

### Saisons naturelles — validé

Printemps, été, automne, hiver. Durée : **deux à trois mois par saison** ; trois mois constitue la référence pour quatre saisons sur une année. Les transitions, dates exactes et hémisphères restent à définir.

| Saison | Variations de contenu proposées |
|---|---|
| Printemps | Floraison, semis, activités en extérieur |
| Été | Fruits, pêche, surf, fêtes estivales |
| Automne | Récoltes, champignons, feuilles, marchés |
| Hiver | Neige, ski, serre, pêche adaptée, activités du terrier |

Aucun métier ne doit être bloqué par une saison. Prévoir alternatives, serres, échanges et îles spécialisées à climat permanent (ski/surf toute l'année), selon les biomes. La météo locale, la disponibilité des ressources et les fêtes culturelles sont des dimensions distinctes.

### Saisons compétitives — proposition

Classements et compétitions par discipline (golf, jeux de société, courses, ski, etc.). Période de deux à trois mois envisagée, à confirmer ; aucun reset des records historiques, trophées ou progression permanente. Distinguer classement de saison, maîtrise durable et statistiques personnelles (112).

### Événements culturels internationaux — validé

Fenêtres de **14 à 21 jours** autour des dates réelles des fêtes. Couverture mondiale : Europe, Afrique, Asie, Amériques, Océanie et Moyen-Orient. Le calendrier doit pouvoir représenter plusieurs cultures et plusieurs fêtes simultanées sans imposer une pratique religieuse.

Exemples de catalogue à vérifier culturellement et calendrièrement avant publication :

| Région / portée indicative | Fêtes candidates |
|---|---|
| International / Europe | Nouvel An, Noël, Pâques, carnavals, fêtes estivales et des récoltes |
| Asie | Nouvel An lunaire, fête des lanternes, Holi, Diwali, Songkran, Tanabata |
| Afrique | Yennayer, Timkat, fêtes des récoltes et festivals locaux |
| Amériques | Carnaval de Rio, Día de Muertos, Inti Raymi, Halloween, Thanksgiving |
| Océanie | Matariki, festivals culturels du Pacifique |
| Moyen-Orient / Asie centrale et diasporas | Nowruz, fêtes de l'Aïd |

Les catégories sont indicatives : plusieurs fêtes sont transrégionales. Ce tableau n'est ni une liste exhaustive ni un calendrier daté vérifié. Respecter la signification et la diversité locale des fêtes, éviter les stéréotypes et prévoir une représentation appropriée. Les dates mobiles et lunaires doivent être vérifiées par édition ; aucun calendrier religieux ne doit être approximé silencieusement.

Objectif de 25 à 40 événements annuels proposé, non validé comme quota. Prévoir des chevauchements et une sélection accessible sans multiplier le travail quotidien.

## 3. Contenu des événements et monétisation — validé

Chaque événement peut proposer décorations publiques, recettes, variantes de jeux, quêtes courtes, vêtements, accessoires du hamster, mobilier du terrier et décorations d'île.

- Des **cosmétiques gratuits** sont déblocables en jouant.
- Des **cosmétiques payants optionnels** et explicitement identifiés peuvent compléter la collection.
- Aucun achat requis pour participer, aucun avantage compétitif ou économique, aucun achat aléatoire, aucun pari ; respecter l'objectif PEGI 12 (112, classification non acquise).
- Aucun cumul de dailies dépassant 15 min en cas de fêtes simultanées. Pas de pression d'achat liée à une disparition définitive des objets.
- Les objets acquis restent au joueur après la fin de l'événement. Leur disponibilité future doit être cohérente avec les droits et collections.

## 4. Pérennité et saisons cumulatives — validé

Le jeu doit rester intéressant après un premier cycle annuel complet, sans exiger de recréer chaque événement. À la cinquième saison (premier retour d'une saison annuelle), reprendre le contenu historique **et ajouter de véritables nouveautés** pour les anciens joueurs.

Chaque édition comprend trois blocs :

1. **Historique :** retour des anciens cosmétiques et activités ; les nouveaux joueurs peuvent accéder aux collections précédentes.
2. **Nouveautés gratuites :** nouveaux objets, objectifs, recettes ou variantes de jeux ; les anciens joueurs ont de nouveaux objectifs sans payer.
3. **Nouveautés premium facultatives :** nouvelles apparences et décorations, sans avantage de gameplay.

Une répartition indicative de 75 % de réutilisation et 25 % de nouveautés a été évoquée ; ce n'est pas une obligation quantitative. L'ajout annuel d'un ou plusieurs éléments inédits significatifs est l'orientation retenue. Choisir le nombre et la nature selon la capacité de production, sans retirer le contenu déjà acquis.

### Méta-progression pluriannuelle

Collections évolutives, trophées millésimés, records historiques, statistiques de participation et titres honorifiques. Récompenser l'ancienneté et la maîtrise sans avantages économiques ou compétitifs. Distinguer un objet historique qui revient d'un souvenir daté attestant une participation effective ; un joueur ne perd pas sa collection s'il manque une édition. Les règles précises de rattrapage et de prestige sont à définir.

## 5. Moteur mutualisé et Studio — cible technique

Un événement permanent est identifié indépendamment de ses éditions. Une édition annuelle réutilise le contenu de base, ajoute les nouveautés, définit ses dates et ses règles. Éviter de dupliquer les ressources 3D ou les moteurs de jeu.

Modèle de données illustratif, à adapter aux contrats existants :

- EventDefinition : identifiant stable, références culturelles, règles communes, activités compatibles, ressources historiques.
- EventEdition : identifiant/version, eventId, calendrier de début/fin et fuseau de référence, contenu gratuit/premium, nouvelles ressources, règles de progression.
- PlayerEventProgress : joueur, événement/édition, objectifs terminés, objets acquis et récompenses déjà délivrées.
- DailyObjective : identifiant/version, famille, conditions, alternatives, coût estimé, source métier, politique de récompense.

Studio : créer un événement, dupliquer une édition précédente sans dupliquer les assets, configurer dates/décors/mini-jeux/objectifs/boutique, prévisualiser chaque saison, tester les chevauchements, vérifier la disponibilité des assets et publier un manifeste versionné. Les dates sont configurables et actualisables, les fêtes mobiles contrôlées annuellement. Les événements doivent fonctionner avec des règles bornées sans intervention quotidienne des développeurs.

Solo GitHub Pages : simulation locale selon contrats existants, aucune promesse d'économie partagée. Multijoueur futur : horloge serveur et transactions autoritaires, idempotence des récompenses, protection contre le changement d'horloge client. Aucun serveur activé par cette spécification.

## 6. Qualification et décisions ouvertes

Tester notamment :
- les quatre spécialités initiales, un débutant sans argent, un joueur occasionnel et un joueur ancien ;
- trois à cinq actions faisables en 5–15 minutes, y compris trajets, saisons et chevauchements, sans ami connecté ;
- un cycle annuel complet puis les cinquième et neuvième saisons : conservation, retour des collections, accès des nouveaux, intérêt des nouveautés, absence de duplication ;
- dates mobiles, changement d'année, fuseaux, réouverture après absence et fin d'événement ;
- budget de contenu et coût d'exploitation : taux de réutilisation, taille des assets, maintenance, modération et temps de création des éditions.

Restent ouverts : catalogue exhaustif d'activités et fêtes, dates réelles par édition, quantité d'actions par spécialité, barème des cœurs/pièces, formule de progression compétitive, taille des collections, prix cosmétiques, budget de production et modalités de rattrapage. La conformité internationale et la rentabilité ne sont pas démontrées. La documentation cible ne constitue pas une déclaration d'implémentation.
