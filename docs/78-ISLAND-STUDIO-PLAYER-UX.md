# 78 — Studio et UX joueur : création d'îles, construction et voyage

**Statut : SPECIFIED — conception de parcours, pas interface livrée.** Références [73](73-ARCHIPEL-VISION-DECISIONS.md), [74](74-ISLAND-MANIFEST-REGISTRY.md), [75](75-ISLAND-TRAVEL-FERRIES-PORTS.md), [77](77-ISLAND-COMMUNITY-CONSTRUCTION.md), [13 — UX Studio](13-STUDIO-UX-ARCHITECTURE.md), [40 — UI joueur](40-UI-JOUEUR.md).

## 1. Deux expériences, un même moteur

### Studio auteur (hors partie)

- Choisir **thème, type, taille, contraintes géographiques, hydrologie, ressources, vocation et position des futurs quais** ; aperçu avant génération.
- Éditer carte, biotopes, relief, implantations, bibliothèques, PNJ et règles de publication, selon les modules Studio existants.
- Valider l'île, compiler les fichiers statiques, attribuer islandId/contentVersion et produire son entrée de registre.
- **GitHub Pages** : ajouter explicitement l'export au dépôt puis publier par build ; aucune création utilisateur n'écrit directement sur le site public.

### Mode construction du joueur (dans le jeu)

- Interface simplifiée, contextuelle : **Plans → Matériaux → Choisir parcelle → Aperçu fantôme → Valider/Chantier**.
- Le joueur ne dispose pas des outils d'édition géologique ou de changements globaux du Studio ; seuls des ajustements de décor/terrain explicitement autorisés peuvent être envisagés plus tard.
- Utiliser mêmes prefabs, variantes par matériaux, vérification de collisions et points d'accès que Studio ; conserver une palette adaptée au thème de l'île sans enfermer les habitants dans un style unique.
- Afficher coût, stocks, matériaux manquants, permissions, règles d'accès, raisons d'échec et progression de chantier.
- En **solo statique**, enregistrement local versionné. Les contrôles d'édition collective et transactions réseau sont masqués/désactivés tant qu'aucun backend n'est activé.

## 2. Parcours voyageur

- Depuis rameur/quai : ouvrir la carte de l'archipel. Distinction visuelle : îles publiées/découvertes/accessible/verrouillées, avec motif si inaccessible.
- Afficher niveau de port, dernier/prochain passage, bateau présent, heure estimée de départ **en temps de jeu** et condition d'accès.
- Sur la **carte locale du joueur**, marqueur du bateau uniquement durant sa présence au quai ; signal « départ imminent » pendant les 5 dernières minutes de jeu.
- Cloche d'arrivée et cloche de pré-départ via moteur Audio V2 ; respecter volume, portée, restrictions audio du navigateur et préférence mute.
- Caméra de voyage derrière la barque se dirigeant vers un plus grand navire ; transitions reproductibles et indicateur de chargement lorsque nécessaire ; restaurer le focus et les contrôles à l'arrivée.

## 3. Parcours communautaire FUTUR (sans imposer le réseau)

- Menu « Mon île » : accès public/privé/invitation, règles libres/collectives/mixtes, parcelles, projets, stocks, propositions et membres.
- Pas de formulaire d'administration lourd dans le HUD : vue compacte, onglets ou modales contextuelles.
- Les permissions sont exposées comme **capacités**, jamais par simple masquage d'un bouton ; serveur futur vérifie toutes les actions.
- Les personnes hors ligne ne bloquent pas automatiquement l'économie ou les chantiers ; les règles décident du sort des projets et de l'accès aux ressources.

## 4. Compatibilité et accessibilité

- Conserver les raccourcis d'entrée du jeu, le mode souris/caméra et la gestion unique des modales ; aucune barre espace ne doit déclencher un bouton après fermeture de fenêtre pendant que le jeu a le focus.
- Le jeu se lance normalement sur GitHub Pages, **sans écran de connexion multijoueur, erreur de socket ou bouton inactif obligatoire**.
- L'édition et la carte fonctionnent au clavier et sur les profils mobiles le moment venu ; labels textuels accessibles pour icônes et états.
- Éviter de charger simultanément Studio complet, îles étrangères ou assets de communauté non nécessaires.

## 5. Recette navigateur

- Ouvrir la démo 4 × 3 km ; choisir une autre île **pré-générée**, voyager, revenir et recharger la page.
- Démo sans réseau externe de jeu ni serveur : pas d'appel WebSocket, aucun besoin d'identification, contrôles et sauvegardes intactes.
- Carte locale : bateau présent/absent, statut et message corrects ; sons uniques sur événements.
- Placement autorisé/refusé ; projet en attente ; rechargement conserve état local ; absence de duplication des objets et baisse mémoire après transition.
