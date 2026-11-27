# 111 — Game design cible : Little World, solo et multijoueur

Date : 27 novembre 2026. Statut : vision cible issue de la discussion de conception ; ne constitue ni un audit du code ni une annonce de livraison.

**Conventions** : V = orientation validée explicitement pendant la discussion ou déjà établie dans les spécifications ; P = proposition de conception à confirmer ; O = décision ouverte / équilibrage. Les exemples numériques ne sont pas des engagements.

## 1. Vision et invariants

- V — Un monde convivial de hamsters, sans dépendance à la présence d'amis. Toute filière essentielle dispose d'un parcours solo complet ; la coopération enrichit le jeu sans imposer de classe, de métier ni d'abonnement.
- V — Diversifier les activités : agriculture, pêche, forêt, mines, artisanat, commerce, exploration, transport, construction, jeux et vie sociale. Le joueur peut se spécialiser ou varier.
- V — Favoriser les rencontres naturelles dans les lieux publics : ports, villages, marchés, événements. Les îles privées servent au développement personnel ; les espaces publics à la rencontre et aux projets communs.
- V — Équité entre joueurs, nouveaux et anciens, solo et groupe, appareils modestes et puissants. Pas de bonus économique cumulable indéfiniment via les amis, ni d'avantage lié au framerate. Pas de PvP obligatoire ni de survie punitive (voir 56).
- P — Trois progressions indépendantes : personnage, domaine/île, communauté ; ajouter les relations bilatérales comme progression distincte. Pas de classement global imposé.

## 2. Boucle de jeu

Récolter → transformer → utiliser/vendre/échanger → investir dans les outils, les bâtiments et le territoire → découvrir de nouvelles activités. Une boucle courte (mini-jeu, récolte, commande), une boucle moyenne (atelier, amélioration, exploration) et une boucle longue (spécialisation, domaine, communauté). Les loisirs ne doivent pas devenir un passage obligatoire pour produire.

Solo : PNJ, commandes et marché disponibles ; coopération spontanée sans groupe obligatoire ; groupe organisé pour chantiers, expéditions et transport ; compétition amicale facultative (courses roulade/planeur, ski, surf, pêche). Les récompenses de groupe ne doivent pas dupliquer le même stock à chaque participant.

## 3. Terrier et vie sociale

- V — Terrier personnel, espace fermé et compact ; décoration, vêtements, accessoires et objets personnels. Accès depuis le terrier à une salle/espace de jeux sociaux, en particulier jeux à deux et jeux de société.
- P — Accès à la salle via un point interactif ; activités chargées à la demande. Inviter un ami, jouer et revenir au terrier ; option solo contre PNJ si pertinente, spectateurs facultatifs. Mutualiser sessions, règles, scores et événements du moteur de mini-jeux (107), sans deuxième moteur.
- P — Catalogue évolutif : jeux de plateau, cartes sans mise d'argent réelle, puzzles coopératifs, jeux de précision ; activités sportives plutôt sur les îles publiques. Pas de récompense de valeur permettant de farmer les matchs arrangés.
- O — Capacité de la salle, catalogue, durée des sessions, règles de visite et récompenses.

## 4. Amitié, partage et droits

- V — Ajout par code ami ; permettre à deux nouveaux joueurs de se rencontrer et de démarrer une relation sans capital. Un ancien peut financer intégralement l'évolution sociale avec l'accord du nouveau.
- P — Identifiant de compte stable, code ami distinct et renouvelable en cas d'abus, demandes acceptées mutuellement, blocage, ajout direct et joueurs récemment rencontrés. Pas de monnaie exigée pour l'ajout, la discussion, l'invitation ou les dons simples.
- V — L'amitié doit permettre de transmettre des ressources, des plans de bâtiments, des tissus, vêtements/accessoires et de contribuer aux améliorations de l'île d'un ami. Le destinataire conserve le choix du placement et l'autorisation de construire.
- P — Niveaux cibles (pas de prix définitifs) :

| Cercle | Capacités proposées |
|---|---|
| 1 Connaissance | ajout, présence selon confidentialité, discussion, invitation, visite autorisée |
| 2 Ami | cadeaux simples, échanges et activités, accès facilité aux visites |
| 3 Compagnon | partage de plans, recettes, connaissances et styles ; projets communs |
| 4 Partenaire | financement, chantiers, ateliers et coffres explicitement autorisés |
| 5 Associé | domaine commun et gouvernance collective, si les deux acceptent |

Les niveaux ouvrent des possibilités, pas des autorisations automatiques. Les cadeaux simples restent possibles dès le premier niveau, selon consentement et règles d'échange. Les statistiques relationnelles proposées : ancienneté, activités variées, temps partagé plafonné, contributions, projets terminés. Pas de gain par spam ou comptes fictifs. Relation bilatérale, progression non transférable. Aucun avantage de rendement multiplicatif par nombre d'amis.

### Monnaie sociale : décision ouverte

V — Absence de blocage pour les nouveaux ; financement unilatéral possible avec consentement ; générosité encouragée. O — Choix entre pièces classiques, cœurs ou combinaison. Les cœurs ne sont PAS une décision définitive. Si retenus : distinguer portefeuille et expérience relationnelle, permettre une acquisition solo et via PNJ, empêcher farm/revente, ne pas récompenser les créations de comptes. Les montants évoqués pendant la discussion (capital de 10, plafond de 50/semaine, coûts 5/15/30/60) étaient exploratoires et ne constituent pas un barème. Alternative à tester en priorité : progression relationnelle gratuite, coûts en pièces pour services/objets concrets, pas pour l'amitié elle-même. Abonnement éventuel : confort/cosmétique seulement, aucune permission ni puissance économique exclusive ; modèle non arrêté.

### Propriété et permissions

Île personnelle, île collective, île publique : gouvernance distincte. Distinguer visite, récolte, dépôt, retrait, atelier, placement, modification, destruction, gestion des membres. Refus par défaut des actions sensibles ; autorisations explicites, révocables, journalisées. Contribution en l'absence du propriétaire si autorisée ; historique, confirmation des opérations irréversibles, gestion de départ d'un associé. Partage de plans : distinguer copie d'un savoir, transfert d'un objet physique, financement et construction ; ne jamais dupliquer le stock. Les règles de gouvernance existantes (73/77) restent applicables.

## 5. Îles personnelles et spécialisations

- V — Choisir une identité géographique (forestière, agricole, côtière, rocheuse, etc.) sans avantage initial injuste ni exclusion des ressources indispensables. Chaque choix donne un potentiel comparable, pas une carte identique. Ressources de base accessibles par production locale, PNJ ou commerce.
- V — Le domaine s'agrandit progressivement ; il ne se limite pas à une île fixe. Agriculture : surface cultivable ; pêche : domaine maritime, habitats, profondeur et bateaux ; forêt : parcelles, essences ; mine : galeries et concessions. Les possibilités de développement doivent être comparables.
- P — Paliers illustratifs de surface : 150×150 m ou 100×200 m au départ, puis 200, 300, 400, 500 m de côté comme hypothèses de test. Préférer des extensions choisies à une multiplication uniforme de toutes les zones. Les proportions 30/25/20/15/10 évoquées auparavant ne sont pas imposées.
- O — Limites maximales par activité, surface totale, nombre d'îles personnelles, coût des extensions, densité de ressources. Comparer rendements nets/temps actif, occupation, temps de renouvellement et budget technique. Une île de démonstration publique de grande taille n'est pas la référence de taille d'une île personnelle.
- P — Plafonds de production/stockage et capacités actives plutôt qu'une seule limite en mètres. Un joueur ne doit pas être condamné à sa spécialisation initiale ; prévoir diversification/réorientation sans perte arbitraire.

### Mines

La discussion part de l'hypothèse de trois niveaux existants, non vérifiée ici dans le code. V — Résoudre l'épuisement avant de multiplier les îles. P — concessions horizontales bornées, niveaux selon progression ; états active, épuisée, réaménagée. Certains filons renouvelables à cadence limitée, autres accessibles via nouveaux secteurs ou expéditions. Les galeries anciennes peuvent être conservées comme stockage/champignonnière/atelier, ou réinitialisées après confirmation en préservant/récupérant les aménagements selon règles. Une nouvelle île 150×150 n'est pas automatiquement nécessaire. O — renouvellement vs réinitialisation, quotas et minéraux rares, nombre maximal de concessions.

### Ressources et écologie

Organiques (bois, plantes, nourriture, fibres), minérales (pierre, argile, sable), métalliques (minerais/alliages), transformées (planches, briques, tissus, pièces), rares liées aux biomes. Réserves bornées, repousse ou régénération déterministe ; récolte privée protégée. Sur île publique, tester quotas individuels de prélèvement sur une réserve commune et zones dédiées, pour éviter monopole sans rendre le stock infini. Les PNJ respectent les mêmes règles écologiques et de production (103). Aucun prélèvement concurrent du même objet.

## 6. Filières économiques équivalentes

V — Chaque activité dispose d'une évolution comparable et de transformations créant de la valeur. P — grille commune à quatre stades (exemples, non recettes définitives) :

| Filière | Brut | Préparation | Transformation | Produit/service |
|---|---|---|---|---|
| Bois | rondins | scierie/planches | menuiserie | mobilier, bâtiments |
| Pêche | poisson | préparation | cuisine/sushis | restauration |
| Mines | minerai | fusion/lingot | alliages | outils, pièces |
| Agriculture | récoltes | tri/mouture | ingrédients | aliments élaborés |
| Textile | fibres | fil | tissu | vêtements et accessoires |

Chaque niveau ouvre de la diversité, pas seulement un multiplicateur. Les ateliers consomment entrées, temps et capacité ; les sorties sont traçables. Les filières se complètent (outils, bois, nourriture, textile), sans rendre un autre joueur indispensable. Mesurer revenu net médian par minute active, capital requis, temps passif, risque, logistique, stocks et difficulté. Équité signifie potentiel comparable dans des conditions comparables, pas revenus identiques à tout instant.

## 7. Marché commun et économie PNJ — priorité initiale

V — Mettre les PNJ économiques en place dès le début, même pour un seul joueur ou nettement moins de 100 joueurs. Ils constituent une base de production et de consommation ; le marché ne dépend pas d'un nombre minimal de joueurs. L'offre et la demande orientent la spécialisation sans l'imposer.

P — Île commerciale publique (ou marché central dans l'archipel), ports et camp marchand itinérant : rencontres, commandes, échanges, livraison. Le camp propose des contrats temporaires, produits particuliers et débouchés tournants ; il ne doit pas être le seul accès aux biens essentiels.

- PNJ producteurs : agriculture, pêche, forêt et autres sources qualifiées ; ateliers et transporteurs utilisent les stocks et règles natifs. Besoins des habitants, restauration, constructions et projets publics créent une demande réelle.
- Marché hybride : annonces de vente, demandes d'achat, commandes/livraisons, y compris asynchrones sur futur serveur ; historique, quantité, prix, disponibilité. PNJ offrent un stock tampon borné à prix de secours et rachètent un volume limité à un prix inférieur. Éviter que le PNJ neutralise le commerce humain ou crée un arbitrage achat/revente sans risque.
- Prix variables selon stocks, transactions et demande ; variation bornée et lissée, réserve de biens essentiels. Pas d'achat illimité ni de création de monnaie sans suivi ; distinguer biens et monnaie créés/consommés, frais facultatifs à calibrer. Toute intervention de régulation doit être observable.
- P — Phase initiale : commandes PNJ, stocks réels et prix de référence ; phase 2 : variation et marchés locaux ; phase 3 : tampon ajusté, logistique et marché joueur. Les règles de base existent dès la première phase, même sans réseau.

O — formule de prix, taille des stocks, consommation, recettes, fréquence des commandes, frais, budgets PNJ, périmètre du marché (serveur/archipel), fonctionnement précis du camp. Simuler avant de figer. La présence des PNJ ne garantit pas mathématiquement l'équilibre : vérifier pénuries, inflation, surproduction, comportements opportunistes et chocs.

## 8. Multijoueur et équité matérielle

V — Garder le maximum de joueurs visibles, préférer simplifier les joueurs distants plutôt que les masquer arbitrairement ; cartes compactes et lieux de convergence. P — activités solo/duo, groupes 4–8, événements 32–128 ; charge progressive 8/32/64/128 joueurs dans un même lieu. Objectifs de qualification, pas capacités attestées.

P — Présentation distante adaptative : fréquence proche 15–20 Hz, intermédiaire 5–10, lointaine 2–3, hors zone présence approximative selon confidentialité ; interpolation, LOD, ombres et accessoires simplifiés. Les paramètres réseau ne changent pas les résultats de collecte, courses et mini-jeux. Une seule île 3D active par client. Autorité serveur sur mutations, horloge et transactions à terme ; accès aux données asynchrones sans rendu permanent.

La bêta statique GitHub Pages reste sans serveur ; rattrapage local borné, pas d'échanges réels entre navigateurs. Ne pas activer réseau/serveur sans jalon autorisé (73, 76). Cibles héritées : simulation fixe 30 Hz, rendu 30 FPS avec secours 20 ; qualification sur GPU intégré nécessaire.

## 9. Feuille de route proposée (priorité gameplay, non engagement de livraison)

**Séquence de conception corrigée le 27 novembre :** catalogue des jeux et accès (112), objectifs journaliers, puis saisons et événements récurrents (113). Ne pas considérer les valeurs provisoires comme des décisions définitives.

1. Consolider le catalogue des jeux, leurs emplacements, la progression de compétence et la monétisation équitable. Voir [112 — Jeux sociaux, terrier et compétitions](112-SOCIAL-GAMES-TARGET.md).
2. Définir les dailies pour toutes les activités : trois à cinq actions, 5 à 15 minutes maximum, équité entre spécialisations.
3. Définir les saisons naturelles de deux à trois mois, le calendrier international (événements de 14 à 21 jours) et les éditions cumulatives : contenu historique, nouveautés gratuites, nouveautés premium facultatives. Voir [113 — Dailies, saisons et événements](113-DAILIES-SEASONS-EVENTS-TARGET.md).
4. Poursuivre le game design avant de figer le catalogue exhaustif, les barèmes et les implémentations ; détailler terrier, invitations, permissions et partage.
5. Formaliser ressources, recettes, extensions d'île, mines et modèle économique ; qualifier l'économie solo PNJ dès la première version.
6. Après autorisation du jalon réseau : comptes, codes amis, consentement, transactions et sauvegarde serveur ; tests de charge et événements.
7. Équilibrage continu sans modifier silencieusement les invariants validés.

## 10. Qualification attendue

- Solo : débutant sans argent, accès à toutes les filières essentielles sans joueur tiers, absence de verrou social ; nouveaux joueurs et ancien finançant un ami, consentement et révocation vérifiables.
- Économie : populations simulées 0 joueur actif (PNJ seuls), 1, 8, 32, 100, puis stress ; spécialisation extrême, absence prolongée, surplus, pénuries, inflation ; comparer revenu net/temps, disponibilité des biens, concentration des stocks, évolution monétaire. Seuils à établir après baseline.
- Exploitation : même budget de progression pour agricole/pêcheur/mineur/forestier ; épuisement complet de mine, agrandissement, changement de métier, stock plein, régénération, sauvegarde/restauration.
- Sécurité : aucune duplication ou débit sans crédit, droits par défaut minimaux, refus des retraits/constructions non autorisés, journal, reprise après coupure.
- Social : deux nouveaux sans ressources peuvent se rencontrer et jouer ; plan ou bâtiment offert sans suppression des droits du propriétaire ; aucun achat obligatoire ; coopération synchrone et différée.
- Performance : même résultat métier pour 20/30 FPS et appareils différents ; charge de foule, mémoire, temps de trame, débit réseau, visibilité ; mesurer, ne pas présumer.

## 11. Décisions à arbitrer explicitement

Monnaie sociale (cœurs vs pièces vs aucune), niveaux et coûts, abonnement éventuel, superficies et capacités maximales, calendrier de repousse et mines, permissions/co-propriété détaillées, jeux du terrier, formule de prix et stocks tampons, scope du marché, seuils de qualification et activation réseau. Aucun montant ni capacité numérique proposée ici ne devient définitif sans validation.

## 12. Références internes

[Vision](01-VISION.md), [Gameplay](02-GAMEPLAY.md), [Solo/multi](56-AUDIT-GAMEPLAY-SOLO-MULTI-ROADMAP.md), [Archipel](73-ARCHIPEL-VISION-DECISIONS.md), [Autonomie](76-ISLAND-AUTONOMY-ECONOMY-TRADE.md), [Communautés](77-ISLAND-COMMUNITY-CONSTRUCTION.md), [Production](81-ECONOMY-PRODUCTION-CONTRACTS.md), [Marchés](84-ECONOMY-ISLAND-MARKETS-V1.md), [Cargo](85-ECONOMY-MARITIME-CARGO-V1.md), [PNJ](103-NPC-AUTONOMOUS-RESOURCE-ECONOMY-F09.md), [Mini-jeux](107-MINIGAMES-UNIFIED-PLATFORM.md), [Mines](24-MINES-MULTILEVEL-LOW-RESOURCE.md), [Agriculture](25-AGRICULTURE-PARCELS-LOW-RESOURCE.md), [Multijoueur](16-FUTURE-MULTIPLAYER.md).

Ce document complète les spécifications historiques sans les remplacer ni prétendre que les fonctionnalités sont implémentées. En cas d'écart, ouvrir une décision de conception explicite plutôt que modifier le code par déduction.
