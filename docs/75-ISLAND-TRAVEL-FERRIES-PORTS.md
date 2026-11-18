# 75 — Voyages inter-îles, navettes, niveaux des ports et retours audio/carte

**Statut : SPECIFIED — mécanique cible ; non implémentée.** Sources [73](73-ARCHIPEL-VISION-DECISIONS.md), [74](74-ISLAND-MANIFEST-REGISTRY.md), [37 — Audio](37-AUDIO-V2-CATALOGUE.md), [40 — UI](40-UI-JOUEUR.md), [21 — Eau](21-WATER-HYDROLOGY-LOW-RESOURCE.md).

## 1. Parcours joueur

1. Se rendre à la zone d'embarquement (côte, ponton ou port), interagir avec le rameur/la navette.
2. Afficher la **carte de l'archipel** avec uniquement les îles validées/publiées, informations de découverte et raisons des destinations inaccessibles.
3. Vérifier horaires, inventaire/condition d'accès et disponibilité ; sélectionner la destination.
4. Lancer une scène maritime **très légère** : petite barque vue par caméra alignée derrière elle vers un grand navire, rameur animé ; masquer le chargement du monde cible.
5. Sauvegarder les états, libérer les ressources de la scène source (mesh, textures, matériaux, audio, événements), charger uniquement l'arrivée de l'île cible, puis rendre les contrôles à l'utilisateur.
6. En cas d'échec, restaurer la situation de départ ou proposer un retour sûr sans perte de progression/inventaire.

La durée de la cinématique dépend de l'état réel de chargement ; pas d'horloge fixe qui téléporte vers une île incomplète. Une boucle d'aviron est acceptable si le chargement est long ; afficher un indicateur discret/diagnostic en cas de délai anormal.

## 2. Niveaux d'infrastructure et dessertes

| Niveau | Infrastructure | Voyageur | Fret |
| --- | --- | --- | --- |
| 0 | Côte sans ponton ni port | **Un jour de présence par semaine de jeu** (VALIDÉ) | petites livraisons optionnelles |
| 1 | Ponton léger | fréquence intermédiaire À CALIBRER | faible capacité |
| 2 | Petit port | fréquence intermédiaire À CALIBRER | capacité moyenne |
| 3 | Port commercial | fréquence élevée À CALIBRER | plusieurs routes |
| 4 | Grand port | **Présence permanente d'un bateau de voyage** (VALIDÉ) | capacité maximum selon capacités réelles |

Les horaires et routes sont déterminés à partir de l'infrastructure et d'un calendrier défini. Le niveau 4 signifie disponibilité permanente d'une **option de transport**, pas que tous les navires physiques du monde sont toujours rendus. Les bateaux de fret et les bateaux de voyageurs sont des systèmes logiques distincts. Aucun blocage définitif du joueur : fournir un trajet de secours cohérent, explicitement documenté.

## 3. Modèle horaire / événements

~~~ts
type FerryStatus = "absent" | "arriving" | "docked" | "departing";
interface FerryCallV1 {
  callId: string; // stable par navette + île + escale + cycle
  ferryId: string; islandId: string; dockId: string;
  status: FerryStatus;
  arrivalGameMinute: number;
  departureGameMinute: number | null; // null : desserte permanente
  scheduleVersion: string;
}
~~~

Le calcul des fenêtres repose sur **une horloge de jeu canonique** et des époques/offsets explicites. Ne jamais confondre minutes de jeu et temps réel. Les **5 minutes de jeu avant départ** sont une décision validée, mais leur lisibilité en secondes réelles doit être testée selon l'accélération du temps.

Événements : ferry.arrived, ferry.departure-warning, ferry.departed, ferry.delayed, ferry.cancelled. Idempotence par (callId, eventType) ; l'UI, l'audio et la carte consomment le même état canonique. Ne pas dériver le calendrier d'un setInterval côté client.

## 4. Cloche et carte du joueur

- **À l'arrivée** : déclencher une sonnerie de cloche distincte, une fois par escale si le joueur peut l'entendre.
- **Cinq minutes de jeu avant départ** : une deuxième sonnerie, distincte, une fois par escale si le bateau a un départ prévu.
- Audio local spatial et à portée limitée, filtré par le gestionnaire audio V2 ; pas de sources audio sur les autres îles.
- Reconnexion pendant l'escale : afficher l'état courant et un éventuel avertissement visuel, **sans rejouer des cloches historiques**. Le client gère également l'autoplay et le mode muet.
- **Carte joueur de l'île : marqueur au quai tant que le bateau est effectivement présent** (docked, éventuellement état d'approche explicite), signalement de départ imminent, disparaît après départ ; sélection = horaires/destination.
- **Carte d'archipel : horaires consultables même quand le bateau est absent**. Ne pas confondre statut de desserte et emplacement d'un navire physique lointain.

## 5. Transitions et performances

États du gestionnaire : IDLE → PREPARING → CINEMATIC → UNLOADING → LOADING → READY → COMPLETE, avec chemins FAILED/ROLLBACK. Ne pas conserver deux îles chargées en même temps ; budget mémoire de la scène maritime séparé, réutilisation des assets déjà présents et déchargement explicite des GPU resources.

Les navires hors zone peuvent être des événements logiques, **pas des meshes animés**. Le mode GitHub Pages utilise un calendrier déterministe local qui continue via rattrapage à la réouverture (76), sans connexion serveur.

## 6. Recette de tests

- Côte niveau 0 : présence exactement un jour sur sept dans le calendrier défini ; niveau 4 : transport toujours accessible.
- Fenêtres intermédiaires, frontières de semaine, changements d'heure et rattrapage sans double son.
- Arrivée, avertissement à -5 minutes jeu, départ ; marqueur carte cohérent ; option audio désactivée.
- Trajet A→B→A conserve inventaire, progression, IDs et états locaux, sans doublons.
- Fichier cible absent, chargement lent, déconnexion simulée, refresh pendant transit : repli sûr.
- Profilage GPU/RAM/temps de chargement, sans régression de la carte de référence 4 × 3 km.
