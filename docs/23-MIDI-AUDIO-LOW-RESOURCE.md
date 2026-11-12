# 23 — Audio LOW-RESOURCE : 5–10 instruments MIDI, synthèse légère et échantillons

**Décision produit validée le 13 novembre 2026.** Little World utilise un **petit ensemble de 5 à 10 instruments musicaux MIDI au maximum**, un **synthétiseur Web Audio léger partagé** pour leurs notes, et un **lecteur d'échantillons courts** pour les effets naturels ou les timbres qui ne se synthétisent pas efficacement. L'objectif est une ambiance low-poly chaleureuse, musicale et interactive, sans imposer une SoundFont complète ni plusieurs centaines de fichiers audio. **MIDI n'est pas le format obligatoire de tous les sons.**

**Statut : spécification cible / axe AUD ; aucun moteur MIDI, synthétiseur ou lecteur d'échantillons n'est déclaré implémenté.** Le code `main` inspecté (13 novembre 2026, `src/main.ts`, `src/world.ts`, `src/boat.ts`, `src/player.ts`, `package.json`) ne montre pas encore de moteur Web Audio/MIDI intégré. Ne pas confondre choix artistique, prototype, benchmark et fonctionnalité déployée.

Références : [02 — Gameplay](02-GAMEPLAY.md), [05 — Architecture](05-TECHNICAL-ARCHITECTURE.md), [06 — Assets](06-ASSET-PIPELINE.md), [07 — Roadmap](07-ROADMAP.md), [09 — Tests navigateur](09-BROWSER-TEST-PLAN.md), [10 — Benchmarks](10-PERFORMANCE-ROADMAP.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [12 — Périmètre](12-PROJECT-SCOPE.md), [13 — Studio](13-STUDIO-UX-ARCHITECTURE.md), [14 — Choix techniques](14-TECHNICAL-CHOICES.md), [15 — Schémas V3](15-STUDIO-DATA-SCHEMAS-V3.md), [19 — Environnement](19-ENVIRONMENT-WEATHER-SKY.md), [20 — Import/export](20-BLENDER-STUDIO-INTERCHANGE.md), [21 — Eau](21-WATER-HYDROLOGY-LOW-RESOURCE.md), [22 — PERF](22-RESOURCE-BUDGET-MANAGER.md).

## 1. Portée précise : instruments, voix et événements différents

- **5–10 instruments MIDI** = **5–10 définitions de timbres/patches musicaux réutilisables sur l'ensemble du jeu**, pas 5–10 `AudioContext`, pas 5–10 synthétiseurs autonomes par PNJ, pas nécessairement 10 pistes, et **pas la limite de notes simultanées**.
- **Un moteur de synthèse** partagé, **une banque de patches restreinte**, un lecteur de séquences `.mid` ou de pistes converties en événements normalisés. Première proposition de palette artistique : flûte douce, cordes pincées, harpe/pluck, clochette, percussion douce, nappe très simple. Ce sont des **exemples**, à composer/valider artistiquement ; possibilité de 5 patches au lancement puis d'en ajouter jusqu'à 10 sans changer de moteur.
- **Bruitages naturels** : échantillons courts comprimés pour cri animal, pas, choc, éclaboussure ; **boucles/sons procéduraux** économiques pour eau, vent, pluie, insectes. Les ambiances ne consomment pas un patch MIDI chacune.
- **Ne pas implémenter General MIDI 128 instruments**, banque SF2 complète, lecteur SFZ universel, DAW dans Studio, simulation acoustique complète, ni périphérique MIDI obligatoire.
- **Web MIDI API non requise** : le navigateur **lit et interprète des fichiers MIDI**, puis déclenche des voix Web Audio lui-même. L'accès à des claviers MIDI USB externes serait un **extra explicitement optionnel** et soumis à compatibilité/permissions ; **Firefox et mobile ne doivent pas en dépendre**.
- **MIDI = instructions musicales, pas échantillons sonores**. La qualité, la mémoire et le coût CPU dépendent des patches, enveloppes, voix et effets réellement exécutés.

## 2. Architecture : un AudioContext et un arbitre PERF

```text
World/Gameplay/Environment Events ───────────────┐
                                                │
MIDI Assets (.mid) → MidiParser → MidiSequencer ──┼──► AudioEngine (Web Audio)
                                                │          │
SFX/Ambience Assets (.ogg/.opus/.wav) ────────────┘     Shared VoicePool
                                                          │
                                    ┌─────────────────────┼────────────────────┐
                                    ▼                     ▼                    ▼
                                Music Bus              SFX Bus           Ambience Bus
                                MIDI synth            Samples           Loops/noise
                                    └─────────────────────┼────────────────────┘
                                                          ▼
                                             Mixer/Master Gain/Limiter*
                                                          ▼
                                            AudioDestination (1 Context)
                                                          ▲
                                         AudioBudgetManager (QualityConsumer)
                                                          ▲
                                        ResourceBudgetManager (PERF, doc 22)
```

*Limiter léger **optionnel après écoute/mesure** ; priorité à une gestion correcte des gains/voices plutôt qu'à une chaîne d'effets coûteuse.*

**Responsabilités :**
- `AudioEngine` : créer **un seul `AudioContext` par instance de jeu** à la première interaction/autorisée, reprendre/suspendre/fermer proprement, créer les bus de volume (music/sfx/ambience/master), ne pas dupliquer par objet/scene.
- `MidiParser` : lire les événements SMF valides, construire une timeline absolue par piste, normaliser les contrôleurs supportés et mapper les numéros de programme à **5–10 patches allowlistés**.
- `MidiSequencer` : piloter tempo, tempo changes, pistes/motifs, transitions, événements musicaux et programmation d'horloge **audio** ; ne pas jouer une note via `requestAnimationFrame`.
- `LightSynth` : allocation/vol de voix, `OscillatorNode`/enveloppe/filter/éventuel patch sample ; 1 voix = coût, pas « instrument ».
- `SamplePlayer` : décode/diffuse quelques `AudioBuffer` courts, réutilise les buffers, décide mono/stéréo selon usage, éteint un son lointain **avant** création si inaudible.
- `AudioSpatializer` : un `PannerNode` ou placement stéréo par émetteur **audible/prioritaire**, atténuation distance et sélection des émetteurs, pas de calcul par secteur ou PNJ à chaque frame.
- `AudioBudgetManager` : **sous-système consommateur de `QualityBudgetSnapshot`** ; choisit max voix, max sources 3D, patches/effets, cache audio ; **pas de deuxième automate de performance** concurrent.
- `AudioEventRouter` : associe `soundId/scoreId/biomeId/eventId` stables aux actions. Les sons décoratifs non émis ne modifient **aucun état gameplay**.

**Intégration Three.js** : spatialisation possible avec Web Audio natif (`AudioListener`/nœuds propres ou adaptation Three.js ciblée). Garder **une seule stratégie de spatialisation** et une seule sortie audio ; éviter de créer un `AudioListener` par PNJ ou caméra.

## 3. Patches de synthèse peu coûteux et rendu des notes

**Patch = définition statique de timbre réutilisée** par toutes les voix. Prioriser les formes simples : `sine`, `triangle`, `square` à faible amplitude, ou **une petite forme d'onde pré-calculée partagée** si un instrument le justifie. Enveloppe ADSR simple, un filtre facultatif **par voix seulement si nécessaire**, vibrato/portamento limités. **Pas de convolution/réverbération par note**.

- Timbres recommandés pour le premier prototype : flûte/triangle, pluck à courte décroissance, clochette simple, harpe pincée, percussion très courte. Une nappe douce peut être ajoutée si la polyphonie reste modérée.
- Voix purement synthétiques : `OscillatorNode` + `GainNode` enveloppe ; une seconde onde partagée/voie de bruit/filtre **uniquement si le patch l'exige**. Programmer `frequency`, `gain` et note-off dans le temps audio, pas par timers JS à la milliseconde.
- **Note-off fiable** : ADSR et release bornés, cleanup des nœuds, éviter notes bloquées, gérer correctement `noteOn velocity=0` comme note-off. Si sustain CC64 retenu, le tester ; sinon l'ignorer explicitement avec warning lors de l'import.
- **Voice stealing** : en cas de limite, libérer en priorité les voix relâchées, puis peu audibles/moins prioritaires, avec **petit fade-out** pour éviter les clics ; ne pas couper les notes prioritaires d'une action joueur pour préserver des notes décoratives.
- **Éviter la promesse « zéro CPU »** : même un oscillateur simple, un filter et un Panner consomment du traitement au rythme d'échantillonnage ; mesurer coût/latence selon polyphonie et navigateur.
- **AudioWorklet non requis pour V1** : natif `AudioNode` et scheduling suffisent tant que les voix sont peu nombreuses. Ne créer un moteur `AudioWorklet` que si les mesures (glitches/CPU ou nécessité de timbre) justifient sa complexité. Un `AudioWorklet` a besoin d'un contexte sécurisé et ne remplace pas gratuitement le coût CPU du traitement audio.

## 4. Lire les séquences MIDI, les adapter au monde et au moteur

**Formats pris en charge en première intention** : Standard MIDI File **SMF Type 0 et Type 1**, métriques `PPQN`, tempo méta-events (notamment changements de tempo), note-on/off, velocity et choix de piste. `ProgramChange` limité aux patches autorisés, `CC7` volume / `CC11` expression / `CC10` panoramique **uniquement si réellement implémentés et testés**. Contrôleurs exotiques et SysEx **rejetés ou ignorés avec diagnostic clair** ; **pas d'exécution de données importées**.

**Important :** l'import d'un MIDI conçu pour 128 programmes GM **ne crée pas 128 instruments**. Choix d'import :
1. **Mapper** les programmes entrants à des `patchId` existants dans la palette de 5–10.
2. **Réaffecter** les pistes, les rendre muettes ou utiliser un patch par défaut choisi explicitement.
3. **Avertir** sur les programmes/percussions non reproduits fidèlement, les contrôleurs et les pistes/notes au-delà du budget.

**Sécurité et robustesse** : bornes pour taille de fichier, nombre de pistes, événements, tempo, longueur, polyphonie maximale attendue, durée/valeurs, lecture à offsets contrôlés ; import transactionnel sans muter le projet sur échec, noms/métadonnées traités comme texte, licences vérifiées. **Pas de dépendance externe pour lire un simple fichier .mid** si un parseur restreint suffit, mais éviter d'écrire un parseur binaire non testé à partir de suppositions.

**Horloges séparées** :
- `WorldClock` = heure du monde/jour-nuit/météo, éventuellement accélérée en bêta ; `AudioContext.currentTime` = temps de sortie audio réel.
- Les motifs musicaux sont sélectionnés depuis le **contexte du monde**, mais leur lecture suit **l'horloge audio** sans accélérer mécaniquement la musique en `WorldClock ×240`, sauf mode de test demandé.
- **Scheduler en avance** (valeurs de départ à mesurer, p. ex. lookahead ~100–200 ms avec rafraîchissement régulier) : planifier note-on/note-off avec `AudioParam` et temps audio. Un `setInterval` léger peut alimenter l'agenda musical, mais **le timing de lecture** est exécuté par le moteur audio, pas par le timer JS.
- Changement de musique/biome : transition à une frontière musicale (mesure/phrase) avec crossfade court, sans télécharger toute une nouvelle banque ni laisser des notes pendantes.
- Pause/unfocus : politique explicite de suspension ou atténuation, annulation/replanification des notes non encore émises ; pas de rafale de notes en rattrapage après retour.

## 5. Lecteur d'échantillons : seulement quand la synthèse serait moins rentable

**SFX et nature** : pas sur bois/roche/eau, bruit de cascade/rivière, vent, pluie, chants d'animaux et éventuel instrument difficile à reproduire de manière économique. Utiliser **une petite banque de sons courts partagée**, avec variations simples de gain/hauteur et déclenchement par événement.

- `AudioBuffer` décodés **une fois par ressource partagée**, diffusés par `AudioBufferSourceNode` éphémères : ne pas décoder le même échantillon pour chaque PNJ/ruisseau.
- Mono recommandé pour les **sources localisées** avec spatialisation, stéréo réservé à musique/ambiance globale si son intérêt est audible. Les ambiances longues peuvent être lues en flux/ressource compressée avec politique adaptée ; ne pas tout décoder d'office dans des `AudioBuffer`.
- OGG/Opus/Vorbis et autres formats **testés par navigateur**, avec fallback compatible si nécessaire. Ne pas supposer un codec garanti partout ; créer le manifeste d'assets avec variants/fallbacks mesurés.
- Boucles d'eau/vent : **une/deux couches par ambiance pertinente**, plus quelques émetteurs réellement audibles. Pour 200 oiseaux, **pas 200 objets audio actifs** ; sélectionner les quelques événements plausibles les plus proches ou importants, avec temps et seed déterministes si besoin.
- Les `AudioBufferSourceNode` sont à usage unique ; **le buffer source est réutilisable**, pas le nœud de lecture. Pooler les structures lorsque réellement utile ; libérer source/gain/panner et ne pas conserver les nœuds « stoppés ».
- Bruit filtré procédural pour vent/eau **uniquement si moins coûteux** que la diffusion de boucles compressées ; comparer CPU/qualité, ne pas présumer que toute synthèse est plus économique.

## 6. Budgets de voix, cache et mémoire (EXEMPLES À MESURER)

Ces nombres sont des **points de départ de benchmark**, et non de la performance démontrée ou un quota absolu de navigateur.

| Paramètre | Éco (hypothèse) | Équilibré (hypothèse) | Qualité (hypothèse) |
| --- | --- | --- | --- |
| **Patches MIDI disponibles** | **5–10** (mêmes définitions) | **5–10** | **5–10** |
| Notes de musique simultanées | 6–8 | 10–12 | 12–16 |
| Total voix audio simultanées (musique+SFX+ambiance) | 12 | 16 | 24 |
| Sources spatialisées | 2 | 4 | 6 |
| Ambiances globales croisées | 1 | 1–2 | 2 |
| Réverbération | off | off / effet partagé léger | partagée et mesurée |
| HRTF | off | off | optionnel pour sources prioritaires |
| Cache PCM décodé | cible **≤2–4 Mio** | cible **≤4–8 Mio** | cible **≤8–16 Mio** |

**Clarification fondamentale** : **5–10 instruments ≠ 5–10 voix**. Un seul patch de harpe peut jouer plusieurs notes à la fois, mais le `VoicePool` a un plafond **global** ; les sons de gameplay prioritaires disposent d'une réserve pour ne pas être bloqués par la musique. Une voix échantillonnée et une voix synthétique participent au même budget global, tout en ayant des coûts CPU différents.

**Mémoire PCM décodée** : mono 48 kHz × float32 = **192 000 octets/seconde** (~0,183 Mio/s). Une boucle de 10 s mono ≈1,83 Mio ; stéréo ≈3,66 Mio. Le fichier compressé téléchargé peut être beaucoup plus petit, **mais le PCM décodé et les caches de navigateur/driver coûtent davantage**. Compter les buffers PCM **une fois** dans `ResourceRegistry`, avec incertitude et métadonnées format/durée/canaux.

**Ne pas promettre « 5–10 instruments = moins de 1 Mo »** : les oscillos simples sont légers, mais les échantillons, banques et loops déterminent la mémoire. Un budget de 4–8 Mio décodés ne comprend pas nécessairement tous les objets/nœuds/driver audio.

**Propriétés importantes** : `AudioContext.sampleRate` réel, CPU audio, polyphonie, latence et défauts de sortie, chargement/decodage, occupation PCM, nombre de nœuds actifs, nombre d'émetteurs, mode économie et actions de suppression de voix. **Ne jamais assimiler le FPS à la qualité audio** : il peut y avoir des craquements même à 60 FPS, ou un jeu à 20 FPS dont la musique reste stable.

## 7. Gestion dynamique par AudioBudgetManager (consommateur PERF)

**Ne créer aucun second `ResourceBudgetManager`**. Le gestionnaire audio souscrit au **snapshot global** et publie ses observations de coût :

```ts
type AudioQuality = "eco" | "balanced" | "quality";
type AudioPriority = "critical" | "player" | "music" | "nearby" | "ambient" | "decorative";

interface AudioQualityBudget {
  maxTotalVoices: number;
  maxMusicVoices: number;
  maxSpatialEmitters: number;
  maxDecodedPcmBytes: number;  // estimation, pas mesure du système audio
  spatialMode: "equalpower" | "hrtfPriority";
  reverb: "off" | "shared";
  ambienceLayers: 1 | 2;
}

interface AudioPlayEvent {
  eventId: string;
  soundId: string;             // son/catalogue stable, pas chemin brut ni script
  priority: AudioPriority;
  location?: [number, number, number]; // Y vertical, mètres
  gain?: number;
  pitch?: number;
  seed?: number;               // variations déterministes éventuelles
}

interface MidiPatchDefinition {
  patchId: string;
  displayName: string;
  kind: "oscillator" | "sampled";
  synthesisPresetId?: string;   // allowlist, pas de code arbitraire auteur
  sampleAssetId?: string;
  maxVoices?: number;
}

interface AudioProjectDefinitionV3 {
  schemaVersion: 1;
  midiPatchLibrary: MidiPatchDefinition[]; // validation 5..10 MAX, moins possible au début
  music: Array<{scoreId: string; midiAssetId: string; patchMap: Record<string,string>}>;
  ambienceProfiles: Array<{biomeId: string; soundIds: string[]}>;
  emitters: Array<{entityId: string; soundId: string; radiusM: number; loop?: boolean}>;
}
```

**Validation recommandée** : **1–10 patches configurables** pour la flexibilité d'un projet vide ou du prototype, avec objectif artistique final **5–10 au maximum** ; IDs uniques, niveaux/volumes bornés, mappings MIDI refermés sur une **palette validée**, assetId et licence requis, maxVoices et périmètre de spatialisation sûrs. Les valeurs auteur `gain/pitch/radius` doivent être contrôlées et ne peuvent pas désactiver les quotas runtime.

**Priorités de voix** :
1. **Indispensable gameplay** : interaction confirmée, signal sonore de règle/énigme ; prévoir secours visuel si audio désactivé.
2. **Joueur** : instrument joué, action directe, sons de mouvement vraiment utiles.
3. **Musique** principale et transition (plafond propre).
4. **Sons proches audibles** : cascade, PNJ, faune pertinente.
5. **Ambiance de biome** puis détail lointain.
  
En surcharge : ne pas démarrer une source inaudible, voler une voix décorative puis couper les effets spatiaux et la réverbération, réduire les couches d'ambiance, puis **polyphonie musicale non essentielle**. Éviter de couper brutalement un motif musical ou un indice de gameplay ; fade-out court et mesures d'écoute.

**Culling audio** : sélectionner les emitters proches **par index spatial du monde déjà existant**, distance maximale et importance/occlusion simplifiée si vraiment utile ; pas de panner/oscillateur créé pour les sources hors rayon. Mise à jour distance/position des sources pertinentes à fréquence limitée/interpolée ; tourner/écouter rapidement lors des mouvements joueur si audible. **Bruitage ponctuel non émis = aucun coût de lecture**.

**AudioSpatializer** : commencer par `PannerNode` modèle `equalpower` ou `StereoPannerNode` selon usage, ne passer à **HRTF prioritaire** qu'après benchmark qualité/coût. Les ambiances globales n'ont pas besoin de 3D individuelle.

## 8. Événements, musique adaptative et futur multijoueur

- Le **Studio** associe `scoreId/soundId` à **biome, région, saison, météo, jour/nuit, lieux, personnages, ruines, interactions, objets/instruments**, sans programme JS dans les données auteur.
- Musique dynamique : motif du matin/nuit ou de la pluie, transpositions/variations, couches choisies **dans les mêmes 5–10 timbres**. Transition musicale sur frontière de phrase/battement ; **ne pas démarrer 5 pistes simultanément** sans budget.
- **Ambiance par biome** : fond stable + quelques événements proche ; eau de rivière/cascade via l'état `WaterNetwork`, pluie/vent via `EnvironmentState`, sans second simulateur météo/audio.
- **Audio 3D** : passer des coordonnées d'entité au panner seulement si la source est effectivement audible ; garder les objets décoratifs silencieux quand ils sont loin.
- Les événements sont déclenchés par la **simulation/interaction** et sont indépendants du LOD graphique, de la fréquence du rendu, des frames ignorées et du mode silence.
- Le futur serveur peut transmettre **IDs d'événements/états significatifs**, pas les échantillons, notes MIDI calculées localement, buffers ou PCM. Pour une musique synchronisée collectivement, un epoch/scoreId/tempo événementiel peut être exploré plus tard **sans backend maintenant**.

## 9. UX du Studio, fichiers et export portable

**Éditeur sonore spécialisé et compact**, pas un séquenceur/DAW :
- Import `.mid` → **inspecter tempo, durée, pistes, notes, programmes et polyphonie maximale**, avec preview audio et table de **mapping des instruments 5–10** (règles explicites pour programmes GM non reconnus).
- Import `.ogg/.opus/.wav` et variantes compatibles → preview, durée, canaux, poids compressé, **PCM décodé estimé**, droits/licences, taille après cache ; option mono pour son spatialisé.
- **Bibliothèque de patches** : maximum dix timbres, paramètres simples pré-approuvés (enveloppe, couleur, hauteur, gain) et bouton écouter. Toute édition complexe de l'onde est hors périmètre.
- `AudioEmitter` sur un objet/PNJ/lieu : fichier/patch, portée, volume, loop/événement, atténuation, priorité, test depuis la position joueur/caméra.
- **Profil de biotope** : un/deux fonds + événements ponctuels paramétrés, dans la même bibliothèque, météo/heure pour variations.
- Menu joueur : **musique / effets / ambiance / master**, bouton mute, paramètre spatialisation **optionnel** ; **pas** 30 sous-options en interface normale.
- Menu bêta : compteur voix musicales/SFX, emitters audibles, buffers PCM chargés, temps/latence audio disponibles, interruptions, changements de biome, simu pluie/orage, essais de polyphonie **et forçage de budget**.
- **Archive Studio V3 ZIP portable** : inclure `.mid`, sons/patches/manifestes et licences/dépendances, pas les `AudioBuffer` décodés, voix en cours, offsets `AudioContext` ou des éléments GPU. Déduplication par hash et IDs stables.
- Les modèles Blender GLB peuvent référencer un `soundId` via données **validées**, mais aucun script/audio n'est exécuté depuis le GLB importé.

## 10. Compatibilité, autoplay, transport et erreurs

- **Web Audio** : demander/réactiver `AudioContext` au **clic utilisateur** « Jouer » (ou activation explicite de l'audio) ; gérer `suspended`, fermeture, onglet masqué, retour de focus, mute et échec d'unlock. Le monde continue en **mode silencieux sans planter**.
- **Web MIDI API** non requis ; ni clavier USB, ni accès SysEx, ni permission MIDI nécessaire pour charger un `.mid` local. Un périphérique MIDI externe **pourra être ajouté plus tard** si pris en charge.
- **Codec** : tester Opus/Vorbis/WAV dans Firefox et Chromium de référence et solutions de repli ; ne pas charger de banque externe via CDN.
- **Temps de scheduling** : ne pas caler notes musicales sur le tick 30 Hz du jeu, la vitesse des frames ou le `requestAnimationFrame`. Les notes restent à l'heure même si le GPU travaille beaucoup ; gérer interruptions sans rafales de notes accumulées.
- **Chargement** : assets audio en streaming ou décodage différé selon usage. Éviter de décoder tous les fichiers du monde au spawn, file bornée pour `decodeAudioData`, ne pas saturer mémoire sur zones multiples.
- **Import fiable** : tailles/événements MIDI bornés, controllers allowlistés, assets/licences résolus, chemins d'archive sûrs, pas de scripts/exécutables, rollback sur import échoué.
- **Respect utilisateur** : mute immédiat, volume indépendant, réduction du volume d'ambiance quand son interactif prioritaire si nécessaire ; n'utiliser aucune vibration/loudness automatique agressive.
- **Tests** : audio indisponible/autorisation refusée, navigateur en arrière-plan, glissement temporel, 2 score changes rapprochés, 200 émetteurs virtuels mais 4 sources réelles, notes coupées, libération après changement de monde et import répétitif.

## 11. Mesure LOW-RESOURCE : ce qu'il faut réellement comparer

**Ne pas inférer le coût du son depuis le FPS GPU.** La lecture/synthèse audio peut utiliser des ressources du thread audio, de l'audio backend et du thread principal (scheduling/décodage) ; selon navigateur, les métriques détaillées peuvent ne pas être exposées.

| Métrique | Méthode initiale | Limite / piège |
| --- | --- | --- |
| Patchs chargés | Comptage `MidiPatchDefinition` | Patch ≠ voix ni CPU |
| Voix musicales/SFX/ambiance | Compteurs `VoicePool` par état | Ne reflète pas exactement traitement audio backend |
| Sources spatialisées | Compteur des nœuds actifs et audibles | Les panners/HRTF ont un coût variable |
| PCM décodé | `sampleRate × canaux × frames × 4` par `AudioBuffer` | Estimation des buffers, hors overhead/driver |
| Octets réseau/chargement | Resource Timing/manifestes | Cache navigateur et decodage non inclus |
| `decodeAudioData` | Temps du début à la fin et pics frame | Travail asynchrone ≠ CPU pur du navigateur |
| Notes ratées/retard | Scheduler, interruptions et écoute enregistrée en test | Les frames peuvent être lisses avec un audio défectueux |
| CPU audio | Profilage navigateur si disponible, tests A/B (0/8/16/24 voix) | Pas de lecture portable « Audio CPU ms/frame » garantie |
| Longue session | État de `AudioContext`, nodes, PCM, reprises, captures | Éviter fuite après 30–60 min et 20 changements de biome |

**Protocole A/B** : mêmes événements/durée/patchs à 0/8/16/24 voix, avec/sans Panner, musique seule, 2 ambiances, pluie/cascade, changement rapide de zones ; qualifier **qualité auditive et glitches** en plus de CPU/mémoire. Comparer CPU sur Firefox/Chromium, GPU intégré et PC modeste. Mesurer également si la synthèse d'un bruit de rivière coûte plus que sa boucle échantillonnée.

**Aucune cible CPU « <0,1 ms » revendiquée** sans mesure : audio sur thread distinct, scheduler léger sur JS, backend variable. Un budget de 5–10 patches est une limite **artistique de choix**, pas une preuve de performance à lui seul.

## Ambiance minière et son d'excavation

Le [document MINE 24](24-MINES-MULTILEVEL-LOW-RESOURCE.md) ajoute des zones creusables multiétages, sans élargir la palette de **5–10 instruments MIDI**.

- Sons de frappe, roche, récolte/cristal, passage de puits et bruitage d'outil : **petits échantillons courts** ou synthèse ponctuelle si plus légère, pas une source par cellule de pierre.
- Par mine/étage, une **ambiance sonore de galerie** (éventuellement une seconde couche très locale) suffit ; culling des émetteurs par salle/portail et priorité à l'action joueur.
- Musique de découverte ou de cristaux via **les patches MIDI existants**, pas de banque entière dédiée aux mines.
- `AudioBudgetManager` plafonne voix/PCM/émetteurs, et un delta de mine ne transporte **aucun buffer ni son**, uniquement l'événement logique nécessaire.

## 12. Plan d'implémentation AUD-0…AUD-8

| Phase | Livrable / gate |
| --- | --- |
| **AUD-0** | Baseline repo, audit formats/navigateurs, conception de 5 patches de référence, tests d'écoute et outils de mesure |
| **AUD-1** | Un seul `AudioContext`, bus master/music/sfx/ambience, unlock au clic, mute/volumes, suspend/reprise, `dispose` et mode silencieux |
| **AUD-2** | Import/parseur SMF `.mid` restreint + `MidiSequencer` horaire Web Audio + mapping maximum 10 patches, notes/tempo/stop sans blocage |
| **AUD-3** | `LightSynth` (oscillateurs/enveloppes), voice pool partagé, vol de voix sans clic, test 5–10 timbres et polyphonie |
| **AUD-4** | `SamplePlayer` buffers courts/loops, catalogue/version/licence, cache PCM et décodage différé, variantes codec |
| **AUD-5** | `AudioEmitter` et profils d'ambiance biotope/eau/météo/nuit, musique adaptative, culling par proximité et `equalpower` |
| **AUD-6** | `AudioBudgetManager` consommateur PERF, plafonds voix/spatialisation/PCM, priorités sons gameplay et nettoyage ressources |
| **AUD-7** | Studio bibliothèque MIDI/échantillons, patch palette, mapping de tracks, placement/preview/édition simple et export/import ZIP V3 |
| **AUD-8** | Benchmarks navigateur et PC modeste : coût CPU/PCM/latence, glitches, haute densité, longues sessions, qualification des profils |

**Gates obligatoires** :
1. Jouer un MIDI type0/type1 connu avec **5 patches**, mapping clair, note-off sans note infinie, volume/mute immédiats, pas de fichier SF2 géant.
2. **Dix patches configurés** sans charger 10 contextes/audio graphs par zone ; limite de polyphonie 8/12/16 testée et voix supprimées avec fade.
3. Même partition audible et rythme correct à 20/30 FPS, accélération du temps monde et onglet masqué/repris **sans rafale accumulée**.
4. 100–200 sons virtuels en forêt → seulement quelques **émetteurs réellement audibles** ; sons utiles aux interactions prioritaires.
5. Synthèse musicale + rivière/pluie/cascade sample/loop + PNJ : budget mémoire PCM et consommation CPU stables ; pas de bruitage « perdu » sans rapport d'éviction/priorité.
6. Import `.mid` malformé/programmation GM inconnue/SysEx/très grand fichier, asset audio de codec non supporté, ZIP tronqué : **échec propre**, aucun écrasement auteur.
7. Navigateurs Firefox et Chromium, **audio unlock** et mode silencieux en cas de refus, context perdu/fermé, import répété, arrêt/changement de monde ; aucune fuite.
8. Archive V3 portable et publication GitHub Pages contiennent ressources **nécessaires et licenciées**, aucune banque externe/CDN obligatoire et aucun contexte audio créé au chargement d'une carte silencieuse.

**Statuts** : `SPECIFIED` ≠ `IMPLEMENTED` ≠ `TESTED` ≠ `BENCHMARKED` ≠ `RELEASED`. Aucune phase AUD-1…AUD-8 n'est livrée par la création de cette fiche.

## 13. Décision synthétique et exclusions

**Validé** : **5 à 10 instruments MIDI au maximum**, synthétiseur Web Audio natif économique et **petit lecteur d'échantillons** ; un contexte et un mixeur partagés, plafond de voix indépendant du nombre de patches, culling audio par proximité, musique adaptative, ambiance par biome, Studio simple, budgets sous `PERF`, aucun MIDI matériel obligatoire.

**À calibrer** : choix exact et qualité des timbres, polyphonie et voix réservées, cache PCM par navigateur/machine, codecs/fallbacks, technique de synthèse pour eau/vent, politique musique en background, coût HRTF/effets et scénarios de stress.

**Hors périmètre initial** : soundfont General MIDI complète, 128 programmes, échantillons lourds en masse, éditeur de musique professionnel, moteur acoustique réverbération physique, streaming audio cloud, MIDI USB obligatoire, ordonnanceur MIDI calé sur RAF, lecture audio par chaque PNJ ou arbre.

**Principe :** *une petite palette de timbres MIDI fait vivre la musique ; quelques échantillons créent des sons naturels ; le budget borne les voix réelles et la mémoire sans jamais dépendre du FPS graphique.*
