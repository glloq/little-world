# 94 — QuestDirector : contrats de données, événements, solvabilité et récompenses

**Statut : SPECIFIED / TARGET — contrat proposé, non implémenté.**  
Base : `main` au `f84c16cd`, après merge #75. Décisions [93](93-QUESTS-AUDIT-ISLAND-INTEGRATION.md) ; exécution [95](95-QUESTS-IMPLEMENTATION-ROADMAP.md) ; audit de contenu [92](92-COMPLETE-WORLDS-STUDIO-AUDIT.md).

**Raccord au système de résidents (non implémenté)** : [96 — rôles, domiciles, routines et dialogues contextuels](96-NPC-LIFE-DIALOGUES-SCHEDULE-AUDIT.md). Le `QuestDirector` consulte les créneaux et positions logiques des PNJ en lecture seule ; il ne modifie pas leurs trajets. Une animation PNJ de pêche, récolte ou fabrication n'émet jamais un événement de réussite du joueur. Les commandes `moveNPCTo` et `startDialogue` doivent disposer d'adaptateurs avec validation d'arrivée/interaction, sans ajouter un deuxième runtime.


## 1. Frontières de responsabilité

| Propriétaire | Responsabilité exclusive | Interface pour les quêtes |
| --- | --- | --- |
| Studio/compilateur | Cartographie, zones, routes, PNJ, services, source immuable, génération qualifiée | `QuestCatalogV1` depuis `IslandCapabilityIndexV1` |
| Gameplay runtime | Inventaire, monnaie `coin`, dialogues/actions/états et validation | `CommandPort` pour accepter/récompenser ; pont `GameplayEvent` |
| `QuestDirector` | Offres, sélection, progression, validation des étapes, état et demandes de claim | État pur sans Three.js, DOM, fetch, timers |
| Activités natives | Pêche, collecte, mine, fermes, fabrication, courses, ports | Événement métier **après commit réussi**, identifiant idempotent |
| Sauvegarde | Slots du monde, bagage portable et migration | `questsLocal?` + `questProgressPortable?`, versionnés |
| UI | PNJ, journal, carte, notifications, Studio audit | Modèles de lecture ; **aucune mutation directe** |

Ne PAS construire une deuxième économie, une deuxième navigation, un deuxième inventaire, une deuxième source de circuits ou un second interpréteur d'actions. Reprendre les contrats existants : `ObjectiveDefinition`, `ActivityDefinition`, `DialogueActor`, `ShopAccess`, `grantItems`, `createActivityRuntime`, `FISH_BY_WATER`, `ruleFor`, `CROPS`, `STARTER_RECIPES` et le moteur de courses.

## 2. Types cibles (proposition TS, à faire valider par le code)

~~~ts
type QuestDifficulty = 0 | 1 | 2 | 3 | 4 | 5;
type QuestStatus = "available" | "active" | "ready" | "claimed" |
                   "cancelled" | "expired" | "suspended";

type QuestStepV1 =
  | {kind:"talk"; npcRole?:string; npcId?:string}
  | {kind:"visit"; targetId:string; withinM:number}
  | {kind:"acquire"; itemId:string; quantity:number;
     source?: "any"|"gather"|"fishing"|"mine"|"farm"|"trade"|"craft";
     fromIslandId?:string}
  | {kind:"deliver"; itemId:string; quantity:number; giverId:string}
  | {kind:"craft"; recipeId:string; quantity:number; stationId?:string}
  | {kind:"race"; raceId:string; maxSeconds?:number}
  | {kind:"event"; eventType:string; subjectId?:string; count:number};

interface QuestTemplateV1 {
  id:string; version:1; family:string; difficulty:QuestDifficulty;
  titleKey:string; descriptionKey:string;
  giverRoles:string[]; requiredCapabilities:string[];
  steps:QuestStepV1[]; rewardProfileId:string;
  repeatable:boolean; cooldownGameMinutes?:number;
  uniquePerArchipelago?:boolean;
}

interface QuestRewardV1 {
  kind:"item"|"coins"|"unlock";
  itemId?:string; quantity?:number;
  unlockId?:string; unlockKind?:string;
}
interface QuestCatalogEntryV1 {
  questKey:string; templateId:string; templateVersion:number;
  islandId:string; giverId:string;
  bindings:Record<string,string|number>;
  steps:QuestStepV1[]; rewards:QuestRewardV1[];
  dependencies:string[]; catalogRevision:string;
  proof:{capabilityIds:string[];validatorVersion:string};
}
interface QuestInstanceV1 extends QuestCatalogEntryV1 {
  instanceId:string; acceptedAtGameMinute:number;
  status:QuestStatus; stepIndex:number; stepProgress:number[];
  appliedEventIds:string[]; rewardClaimId?:string;
}

interface QuestOfferConfigV1 {
  schemaVersion:1; enabled:boolean;
  density:"low"|"normal"|"high";
  maxDifficulty:QuestDifficulty;
  enabledFamilies:string[];
  maxVisiblePerGiver:number; maxActivePerPlayer:number;
  disabledTemplates?:string[]; pinnedTemplateIds?:string[];
}
~~~

Ce modèle est volontairement **distinct** du statut historique d'`ObjectiveDefinition` (`locked/active/complete`). Ne pas élargir arbitrairement l'ancien enum sans migration. L'adaptateur journal agrège quêtes anciennes et instances générées et conserve les APIs historiques.

Garder un petit ensemble fermé d'étapes côté V1 ; les étapes de futur surf/ski ne deviennent éligibles que lorsque des événements natifs/validateurs sont disponibles. Les valeurs comme `titleKey` sont des clés de modèles localisés, pas du JavaScript exécutable.

## 3. Événements métier : succès validés et provenance

~~~ts
interface QuestGameEventV1 {
  schemaVersion:1;
  eventId:string; // stable pour la commande source, unique par transaction
  type:string;
  worldId:string; islandId:string;
  gameMinute:number; sequence:number;
  actorId?:string; targetId?:string;
  itemId?:string; quantity?:number;
  source?:string; recipeId?:string; raceId?:string;
  measuredSeconds?:number;
}
interface QuestCommandV1 {
  commandId:string;
  type:"accept"|"cancel"|"claim";
  instanceId:string; actorId?:string;
}
~~~

**Émettre seulement APRÈS validation/commit de l'activité** et avec un ID de commande/transaction déjà existant ou généré et persisté par le producteur. Un événement de résultat ne signifie jamais « joueur a appuyé sur F/E ».

| Événement | Point de branchement ciblé | Sémantique |
| --- | --- | --- |
| `npc.talked` | `gameplay/dialogue-session.ts` | Interaction validée avec l'acteur, non ouverture de la carte |
| `location.visited` | Zones/waypoints gameplay ; vérification du joueur réel | Position atteinte, lieu accessible et seuil réel |
| `resource.gathered` | `gameplay/gathering.ts` | Ramassage effectivement attribué (fruit/bois/champignon) |
| `fishing.caught` | `main.ts` après `takeCatch` et `grantItems` réussis | Poisson et type d'eau ; échec/sac plein ne comptent pas |
| `mine.extracted` | `gameplay/activity-runtime.ts` après la récompense effective | Nature/quantité du cycle, mine et niveau |
| `farm.harvested` | `gameplay/activity-runtime.ts` après récolte validée | Culture, parcelle, quantité réellement obtenue |
| `workshop.collected` | `economy/workshop-services.ts` après collecte de sortie | Recette, station et quantité ; `ready` seul ne compte pas |
| `market.traded` | `economy/island-markets.ts` après transaction | Quantité, achat/vente, shop, île |
| `race.finished` | `gameplay/races.ts` / `main.ts` | Course identifiée, version, temps final et conditions |
| `ferry.arrived` | `archipelago/transit.ts` / voyage réellement restauré | Arrivée valide et durable sur destination publiée |
| `quest.delivered` | Commande QuestDirector au PNJ de remise | Débit atomique des objets, uniquement à la remise |

Un `acquire` de source `fishing` n'avance **pas** sur `market.traded` : acheter 3 truites ne compte pas comme en pêcher 3. Un `deliver` est satisfait par le stock réellement porté **au moment de la remise**, quelle qu'en soit l'origine, sauf si la mission exige explicitement la provenance.

La variation du solde du sac seule **ne renseigne pas la source** : ne jamais inférer `fishing.caught`, `mine.extracted` ou `craft` par diff d'inventaire. Pour une quête « avoir 5 pommes », `source:any` peut lire le stock courant ; pour « cueillir 5 pommes », compter les événements `resource.gathered` post-acceptation.

Prévoir normalisation/validation stricte d'identifiants, provenance et quantité ; rejet d'événements dupliqués, hors monde, expirés, sujets non éligibles, indices non monotones et temps non crédibles. Toute erreur doit être diagnostic, pas création de ressource.

## 4. Capacité de l'île et preuve de faisabilité

~~~ts
type CapabilityCertainty = "KNOWN"|"POSSIBLE_NEEDS_REVIEW"|"UNAVAILABLE";
interface ResourceSourceV1 {
  itemId:string; sourceKind:string; sourceId:string;
  position?:{x:number;z:number}; zoneId?:string;
  certainty:CapabilityCertainty; renewability:"renewable"|"finite"|"unknown";
  requires:string[]; provides:string[];
}
interface IslandCapabilityIndexV1 {
  schemaVersion:1; islandId:string; worldId:string;
  buildVersion:string; generationFingerprint:string;
  sources:ResourceSourceV1[];
  activityIds:string[]; rolesByNpcId:Record<string,string[]>;
  reachableAnchors:string[]; unavailableReasons:Record<string,string[]>;
}
~~~

**Ordre de construction** :

1. Relire les données natives **réellement compilées** : entités, PNJ/`DialogueActor`, zones mine/champ, `races`, `ShopAccess`/service valide, eau, `waterKinds`, routes/ports publiés, objets du catalogue et recettes.
2. Lister les **producteurs réels** : `ruleFor` par espèces présentes, `FISH_BY_WATER` seulement si spot valide, matériaux miniers possibles dans la géologie et l'étage, cultures autorisées **sur parcelle joueur**, ateliers utilisables, stocks/profils de boutiques et fournitures achetables.
3. Calculer les **préconditions** (outil accessible sans la même quête, station, seed, accès, transport), les stocks réalisables, le coût d'une chaîne. La présence d'un item dans `ECONOMY_ITEMS` ne certifie **rien**.
4. Calculer la **solvabilité** par fermeture de graphe sur les producteurs, achats possibles et dépendances, avec garde anti-cycles. Les cycles sont rejetés ou exigent une ressource initiale extérieure prouvée.
5. Valider les **trajets pratiques** entre PNJ et action / retour à l'aide des contrôles Studio existants (ponts, pentes, eau, passage souterrain, emprises), pas seulement distance euclidienne.
6. Marquer toute incertitude explicitement : rareté poisson doré, ressource stochastique non garantie, mécanisme futur non branché, parcours inaccessible, PNJ sans interlocuteur, commerce d'une île non publiée.

Ne jamais créer des quêtes `KNOWN` à partir d'un biome générique, d'un village décoratif, d'une recette hors station, d'une plage sans surf jouable ou d'un ski sans événement de victoire. Si la garantie d'une source rare n'est pas démontrée, proposer seulement un objectif bonus non bloquant ou une alternative commune.

Le `ContentPlan` proposé dans [92](92-COMPLETE-WORLDS-STUDIO-AUDIT.md) sera l'entrée auteur commune (pôles + intentions) ; l'index de capacités est **une projection**, jamais un nouveau moteur de composition de villages.

## 5. Génération déterministe et diversité

Entrées déterministes : `islandId`, `worldId`, `buildVersion`, empreinte des sources validées, config auteur, catalogue de templates versionnés, éventuel état joueur pour les **offres** ; sorties ordonnées indépendamment de l'ordre des objets JS. La seed ne doit jamais permettre de tirer une quête non faisable.

**Construction du catalogue**, dans l'ordre : filtrer capacités → instancier paramètres (quantité/lieu/espèce/PNJ) → résoudre dépendances → vérifier trajets → scorer intérêt/progression/diversité/répétition → appliquer quotas → préserver overrides/verrous auteur → émettre reason codes pour les rejets.

**Attribution runtime** : conserver les offres déjà vues/acceptées, appliquer la disponibilité et l'historique du joueur ; ne renouveler que les emplacements proposés, de façon déterministe lors de conversation ou d'échéance **en temps de jeu** ; pas toutes les frames. Ne pas faire reroll jusqu'à obtenir une récompense régionale unique.

Exemple de clé logique stable : `autoquest:<islandId>:<templateId>:<giverId>:<bindingsHash>`. L'instance active ajoute une séquence de prise calculée par autorité ; même entrée/version → même catalogue, mais une quête acceptée conserve ses bindings malgré une nouvelle version de l'île. Les IDs réels respecteront les limites de `schema.ts` via hash compact plutôt que concaténation non bornée.

**Quotas de départ à mesurer, non garanties** : 1–2 offres/PNJ, 3–5 actives/joueur, 20–60 candidates/île suffisamment riche, 1 à 5 étapes/quête ; au moins une introduction pour les capacités jouables suffisamment couvertes. Les budgets ne doivent pas remplir artificiellement une île volontairement calme.

## 6. Transactions et remise de récompense

Le port de commande doit déléguer à l'**autorité d'inventaire** existante (locale aujourd'hui, serveur plus tard) ; ne pas changer directement `runtime.state.inventory` depuis le directeur, la vue ou le journal.

- `accept` : vérifier disponibilité, capacité d'actives, état et ID ; figer étapes, compteur initial, rémunération et template.
- `advance` : chaque événement validé est consommé au plus une fois par instance ; mise à jour de progression persistable ; la fin des sous-étapes ne retire pas automatiquement les ressources.
- `deliver` : recalculer le stock dans l'autorité, effectuer **débit avec changement d'état** sans effet partiel ; si l'objet est absent, mission reste active.
- `claim` : vérifier statut `ready`, giver/contexte/autorisation, place disponible, plafond de pièces, possession/déblocage unique ; appliquer un **seul ensemble atomique** « ressources + argent + déblocage + ledger de claim ». Sur échec (sac plein), laisser `ready`, aucune attribution partielle ni marque `claimed`.
- Un cadeau d'équipement déjà possédé ne peut pas disparaître silencieusement : politique par template (récompense alternative calculée et figée avant acceptation, ou crédit différé), jamais vente forcée ou création d'un second exemplaire `maxQuantity:1`.
- Si un claim utilise à la fois une progression portable et une sauvegarde locale non atomiques entre elles, introduire un journal **prepare/commit/recover** ou un unique agrégat autoritaire, avec rejouement idempotent. Les étapes multi-écritures ne doivent jamais promettre une atomicité qui n'existe pas.
- `claimId` et événements traités : journal durable borné, compactable seulement après checkpoint stable. Replay double-clic/retour/refresh ne doit jamais attribuer deux fois.

**Économie** : barème lié à `priceOf` / profil local et coût réel ; missions répétables plafonnées, cooldown. Interdire les boucles d'arbitrage où acheter un objet puis le remettre rapporte davantage que l'achat+transport+temps sans risque. Pas de farm infini de pièces sur des interactions `repeat:always`.

**Équipements** : outil dans `ItemDefinition` et mode `equipment.setHands/setHead` réellement utilisable ; cosmétiques de propulsion via `FlightProgress` (`unlockedSkins/unlockedSounds`), et éventuellement nouvel adaptateur de skins plus tard. Pas de `giveItem` pour un déblocage de skin qui n'est pas un item du sac. Planche surf/ski, palmes, dos/pieds : non promis tant que schémas/effets/visuels/équipement ne sont pas qualifiés.

## 7. Sauvegardes, compatibilité, publications

- `GameSaveV1/V2` doit rester lisible ; extension optionnelle et validée `questsLocal?`, ou nouveau sidecar versionné **uniquement après audit des writes** et avec tests de transaction/restore. Ne pas incrémenter globalement la sauvegarde sans preuve de migration complète.
- Instances acceptées, version/paramètres, compteurs, offres restantes, expiry/cooldowns et claims appliqués doivent survivre à recharge/export/import.
- `PortableTravelerCheckpoint` et ferry conservent le sac actuel ; les quêtes **inter-îles** et déblocages régionaux uniques nécessitent un journal portable distinct validé et résistants aux allers-retours.
- Monde compilé : ajout facultatif d'un descripteur/catégorie de quêtes versionné dans les sources Studio puis `world-compiler/compile.ts`/`manifests.ts`/`load.ts` ; ne pas écrire uniquement dans `main.ts` un catalogue implicite non versionné.
- Rééditer/régénérer une île ne réécrit pas une quête historique acceptée ; si une dépendance disparaît, marquer `suspended` avec diagnostic et **solution de reprise explicite** (migration, cible alternative prévue, annulation avec compensation), jamais inventaire perdu ni suppression silencieuse.
- Distinguer statuts `DECIDED / SPECIFIED / IMPLEMENTED / TESTED / QUALIFIED` ; la compilation n'atteste ni la navigation réelle ni l'absence d'exploit économique.

## 8. Diagnostics et invariants obligatoires

Codes cibles : `QUEST_NO_GIVER`, `QUEST_NO_SOURCE`, `QUEST_ITEM_NOT_OBTAINABLE`, `QUEST_NO_TOOL`, `QUEST_NO_STATION`, `QUEST_NO_PUBLISHED_FERRY`, `QUEST_UNREACHABLE`, `QUEST_DEPENDENCY_CYCLE`, `QUEST_EVENT_UNSUPPORTED`, `QUEST_REWARD_UNSUPPORTED`, `QUEST_REWARD_CAPACITY`, `QUEST_AUTHOR_LOCKED`, `QUEST_VERSION_MISMATCH`, `QUEST_SUSPENDED`.

Invariants : même source/version/seed → catalogue identique ; aucune quête impossible auto activée ; aucune ressource négative ; aucun don partiel ; aucune récompense double ; toute progression authentifiée par événement ou condition explicitement autorisée ; pas de mutation depuis l'UI ; éditions manuelles préservées ; monde historique non réécrit ; toutes limites bornées et mesurées.

Voir [95](95-QUESTS-IMPLEMENTATION-ROADMAP.md) pour la conversion de ce contrat en tâches de code/test avec gates.