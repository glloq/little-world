# 114 — Île principale : services, administration et vie communautaire

Date : 27 novembre 2026. Statut : game design cible, non implémenté. Complète [111](111-GAME-DESIGN-TARGET.md), [112](112-SOCIAL-GAMES-TARGET.md) et [113](113-DAILIES-SEASONS-EVENTS-TARGET.md). Les invariants validés sont distincts des bâtiments et paramètres proposés.

## 1. Rôle de l'île principale — validé

L'île principale est le centre social, commercial, culturel, ludique et logistique de Little World. Elle accueille les nouveaux joueurs, mais doit rester intéressante pour les anciens. Elle ne constitue pas une unité de production primaire.

- Agriculture, pêche, minage et exploitation forestière économiques : sur les îles personnelles des joueurs. Sur l'île principale, uniquement des versions d'initiation de ces activités.
- Les zones pédagogiques permettent d'apprendre les outils et les règles ; aucun rendement économique permettant de les exploiter en série. Les outils de départ sont gratuits ; aucun joueur ne doit pouvoir monopoliser un poste pédagogique. Les modalités de réinitialisation et de récompense du tutoriel restent à définir.
- Végétation et paysages publics à vocation décorative, de promenade et de mise en scène.
- Commerce, transformation, services, jeux, compétitions et événements constituent les raisons de revenir. La transformation publique ne remplace pas les capacités de spécialisation et de production sur les îles personnelles.
- Conserver une géographie compacte : port, place centrale, marché et loisirs facilement accessibles. Les dimensions et capacités ne sont pas encore fixées.

## 2. Pôles fonctionnels et bâtiments candidats

Les pôles constituent une base de conception acceptée, mais chaque bâtiment ci-dessous est une proposition à préciser. Plusieurs services peuvent être mutualisés dans un bâtiment ou par un PNJ ; ne pas créer un bâtiment par menu.

| Pôle | Bâtiments / espaces envisagés | Services |
|---|---|---|
| Accueil et administration | Mairie, accueil, cadastre, poste, banque, maison des activités | Tutoriels, propriétés, associations, aide, informations |
| Commerce | Marché central, épicerie, quincaillerie, boutique de vêtements, décoration, pépinière, marchand itinérant | Achats/ventes, commandes, outils, plans, cosmétiques |
| Artisanat | Forge, scierie, menuiserie, textile, cuisine, architecture | Initiation aux filières, transformation, services et plans |
| Transport | Port, gare maritime, entrepôt, chantier naval, écurie | Destinations, expéditions, bateaux, montures |
| Loisirs | Taverne, salle de jeux, bowling, café, restaurant, salle de musique | Jeux sociaux, rencontres, musique |
| Sports | Mini-golf, boulodrome, terrain multisport, cibles, circuits et obstacles | Parties libres, compétitions, spectateurs |
| Culture | Musée, bibliothèque, galerie, salle des trophées, théâtre, jardin | Collections, créations, records, exposition |
| Événements | Place des festivals, stands temporaires | Fêtes internationales, concours et boutiques optionnelles |
| Initiation | Petite mine, zone forestière, parcelle pédagogique, ponton, atelier pédagogique | Apprentissage uniquement, pas d'exploitation commerciale |

Le catalogue des jeux et leurs capacités restent décrits dans [112](112-SOCIAL-GAMES-TARGET.md). Les grandes disciplines peuvent également disposer d'îles spécialisées. Les éléments d'administration, marché et poste ont été acceptés comme bases à approfondir, pas comme spécifications exhaustives.

## 3. Administration — services et intérêt gameplay

| Service | Fonction et intérêt | PNJ candidat |
|---|---|---|
| Mairie | Projets publics, contributions, évolution visible de l'île, informations communautaires ; votes éventuels à définir | Maire |
| Accueil | Découverte, tutoriels, outils gratuits et accompagnement | Guide |
| Cadastre | Acquisition de l'île personnelle, choix du biome, extensions terrestres, maritimes ou souterraines | Agent |
| Associations | Groupes, îles collectives, permissions, gouvernance et projets | Agent |
| Poste | Courriers, cadeaux, colis, transmission de plans, échanges asynchrones | Facteur |
| Banque | Consultation des finances, historique, financement de projets ; pas de crédit payant ni spéculation proposés | Banquier |
| Métiers | Découverte des filières, progression, statistiques et éventuelles certifications | Conseiller |
| Tourisme | Carte, destinations, activités accessibles | Guide |
| Événements | Calendrier, inscriptions, informations | Organisateur |
| Records | Statistiques, classements, trophées | Responsable sportif |
| Solidarité | Aide aux nouveaux joueurs, dons et financement volontaire des projets d'amis | Agent |
| Missions | Information facultative et commandes de PNJ ; aucun retrait ni validation obligatoire des dailies en personne | Agent |

Regroupement compact envisagé : mairie, cadastre, poste, banque et maison des activités ; marché à proximité. À confirmer : services réellement nécessaires, bâtiments séparés, horaires et responsabilités des PNJ. L'administration doit fournir des possibilités, pas des étapes bureaucratiques.

### Mairie, marché et poste

- Mairie : favoriser les chantiers collectifs, contributions volontaires, projets d'aménagement et résultats visibles. Les votes, budgets, droits et gouvernance sont à spécifier ; aucune participation imposée.
- Marché : marché hybride joueurs/PNJ, commandes et stocks réels, offre et demande. Les PNJ stabilisent l'économie dès le début, même avec peu de joueurs. Réutiliser les contrats de production et marché (76, 81, 84, 103) et les décisions de 111.
- Poste : échanges asynchrones, dons, colis et plans. Respecter consentement, permissions, limites et transactions sans duplication. Les contenus reçus ne modifient jamais une île sans autorisation. Le modèle d'amitié et de financement reste décrit dans 111.

## 4. Dailies indépendantes de la localisation — contrainte validée

- Consultation depuis le terrier ou le menu du joueur, quelle que soit l'île. Validation automatique à partir des événements métiers.
- Aucune obligation de visiter l'île principale, ni pour obtenir, terminer, valider ou réclamer une récompense quotidienne. Pas de passage obligatoire à la mairie, au bureau des missions ou à un PNJ.
- Trois à cinq actions différentes, durée totale 5 à 15 minutes maximum, y compris trajets et interfaces. L'accès à la récompense complète doit rester possible sans quitter l'île personnelle, avec des objectifs équivalents réalisables localement. Aucun bonus indispensable réservé à l'île principale.
- Une activité sur l'île principale peut apparaître occasionnellement dans le catalogue (football, mini-golf, commerce, aide PNJ), avec une alternative équivalente ailleurs. Ne pas imposer un rendez-vous quotidien ni la présence d'autres joueurs.
- Les tâches adaptées à la spécialisation restent accessibles en solo. Les récompenses, quantités et règles de génération détaillées restent à équilibrer dans 113.

## 5. Animation communautaire volontaire

L'île principale attire par ses activités et non par les récompenses perdues en cas d'absence.

Exemples : rencontres de football, concours de mini-golf ou fléchettes, commandes exceptionnelles, marchés temporaires, chantiers collectifs, concerts, festivals et expositions. Accès libre, invitation ou inscription selon l'activité. Offrir des horaires variés, modes solo/PNJ quand pertinents et possibilités de spectateurs.

Deux à trois rendez-vous communautaires par semaine ont été proposés, sans engagement de cadence. La fréquence exacte reste à définir. Les événements peuvent être occasionnels et distincts des dailies. Les fêtes internationales restent indépendantes, selon les fenêtres de 14 à 21 jours et la politique historique/gratuit/premium de 113.

Les déplacements vers l'île principale doivent être pratiques ; aucune obligation de transport rapide gratuit n'est retenue pour valider les dailies. Les modalités de desserte restent à préciser avec les contrats existants (75).

## 6. Qualification attendue et décisions ouvertes

- Nouveau joueur : accès aux outils, apprentissage des quatre filières, acquisition de l'île personnelle, sans exploitation rentable des zones pédagogiques.
- Joueur occasionnel : récompense quotidienne complète sans quitter son île, sans ami connecté, dans le budget temporel.
- Joueur social : accès aux activités de l'île principale, rencontres spontanées, compétitions et chantiers volontaires, sans rendre la participation nécessaire.
- PNJ et économie : stocks, commandes et services cohérents même avec un seul joueur ; aucune création de ressources arbitraire.
- Charge : concentrations autour du port, du marché, de la mairie et des activités ; mesurer visibilité et performances avant de fixer les capacités.

Restent ouverts : superficie, plan précis, bâtiments obligatoires, regroupement des services, règles de mairie, marché et poste, horaires PNJ, cadence des événements, transport et budgets. Aucun code ni activation réseau ne découle automatiquement de cette spécification.
