# 37 — Audio V2 : catalogue contextuel, événements sémantiques et production

**Campagne AUD-V2 (novembre 2026).** Évolution incrémentale du moteur audio B1 décrit en [23](23-MIDI-AUDIO-LOW-RESOURCE.md) et [28](28-AUDIO-ET-RECETTE.md) : le moteur, le mixeur, le séquenceur MIDI, les cinq timbres, les budgets et l'activation après geste sont **conservés** ; on ajoute un catalogue versionné organisé par événements, contextes, musiques et ambiances, directement exploitable par le jeu, le Studio et un futur agent de génération audio.

- Inventaire complet généré : [38 — Inventaire audio V2](38-AUDIO-V2-INVENTAIRE.md).
- **Production réalisée (campagne AUDIO PRODUCTION)** : 230 WAV + 19 MIDI originaux, aucun `PLANNED` restant — [39 — Rapport de production](39-AUDIO-PRODUCTION-RAPPORT.md) (mesures, états, liste de préécoute humaine).
- Manifeste machine-readable pour l'agent de génération : [`assets/audio/production-manifest.json`](../assets/audio/production-manifest.json).
- Source unique du catalogue : [`src/audio/catalog-source.ts`](../src/audio/catalog-source.ts) → `npm run generate:audio` → `public/audio/catalog.json`, manifeste et doc 38 (déterministes, vérifiés en CI).

## 1. Audit initial (état de `main` au 13 novembre 2026, commit `93f23f6`)

| Élément | Constat |
| --- | --- |
| `AudioEngine` | Un `AudioContext` créé au geste, bus master/music/sfx/ambience, mute et volumes persistés hors sauvegardes, suspension/reprise, pool de voix avec vol, cache PCM avec éviction, deux décodages simultanés, ordonnancement MIDI en avance sur `currentTime`. **Solide, conservé.** |
| Schéma V1 (`schema.ts`) | `soundId → 1 WAV base64`, sans contexte, sans variante, sans statut de production. Plafonds fixes : 32 assets, 32 sons, 16 partitions, 4 Mio de sources intégrées, échantillons ≤ 8 s. Tout est encodé en base64 dans le JSON. |
| Contenu | 5 patches, 2 MIDI (jour/nuit), 6 WAV procéduraux CC0 (`collect`, `mission`, `lever`, `step`, `water`, `rain`). |
| Sons réellement émis | Actions déclaratives `playSound` (collecte, livraison, levier), pas (`step`, cadence fixe dans `view.ts`), ambiances globales pluie/eau, émetteurs liés aux entités. **Rien** pour saut, planage, eau, bateau, mine, ferme, PNJ. |
| Studio | Module Audio V1 : palette, import MIDI/WAV licencié, mapping, musiques jour/nuit, émetteurs ; son de confirmation dans Interactions. |
| V3 / ZIP | `world.audio` copié tel quel dans le manifeste compilé et l'archive (aucun buffer runtime). |
| Branches parallèles | `feat/little-world-assets` (GLB, aucun fichier audio) et `feat/living-world-editor` (historique séparé, aucun fichier audio). **Aucun conflit** : cette campagne ne touche aucun asset 3D ni module PHYS/WATER/MINE/AGRI ; elle *consomme* leurs résultats métier (`dig`, `farmAct`, `player.space`, `waterSurface`). |

## 2. Contrats V2 (`src/audio/catalog.ts`, `context.ts`)

`AudioDefinitionV2 = { schemaVersion: 2, meta, patchIds, assets, scores, events, music: { cues }, ambience, emitters }`

- **AudioAsset** — la ressource réelle : `id, kind (sample/midi/procedural), format (wav/ogg/midi/procedural), status (PLANNED/GENERATED/VERIFIED/REJECTED), license, source`, et **une seule** source : `uri` (fichier statique relatif `audio/…`, résolu depuis `import.meta.env.BASE_URL`, jamais d'URL absolue), `bytesBase64` (fichier utilisateur intégré, WAV/MIDI, portable dans le ZIP) ou `procedural` (paramètres allowlistés). Métadonnées : `duration, channels, sampleRate, loopStart/loopEnd, bytes, estimatedDecodedBytes, generatorVersion, contentHash (sha256-…)`.
  - **PLANNED interdit toute référence de fichier** : impossible de présenter une ressource fictive comme disponible. Seuls GENERATED/VERIFIED sont joués ; REJECTED jamais.
- **SoundEvent** — identifiant sémantique stable (`player.footstep`, `mine.hit`…) : catégorie, bus, variantes `{assetId, weight, gain?, pitch?, when?}`, `fallback`, gain/hauteur, `pitchJitter` (≤ 2 demi-tons), `gainJitter` (≤ 50 %), `cooldownMs`, `priority`, `maxInstances`, `steal`, `spatial`/`radius`, `loop`, `repeat` (random / avoid-repeat / shuffle / sequence), `maxLatencyMs` (abandon d'un one-shot devenu inutile), `tags.gameplay/caption`.
- **SoundContext** — faits **tous optionnels** : surface (grass, tallGrass, dirt, mud, sand, gravel, stone, wood, metal, water, snow), matière (soil, softRock, hardRock, metalOre, crystal…), mouvement, intensité, `wet`, météo, biome, moment, lieu, activité, `nearWater`, outil, type d'objet, espèce, état, distance. Validation **stricte côté auteur** (`parseCondition`), **tolérante côté runtime** (`sanitizeContext` ignore les valeurs invalides, ne lève jamais).
- **MusicCue** — `scoreIds` (variantes), `when`, `priority`, `kind` (loop/stinger), `transition` (bar/immediate), `silence` [min, max] s entre deux lectures.
- **AmbienceProfile** — `when`, `priority`, `global` ou lieu (`exclusive` pour mines/sous l'eau : pas de pluie sous terre), `fadeSeconds`, couches `bed / weather / source / oneshot` (intervalle aléatoire).

### Limites selon le type et le chargement (`AUDIO_V2_LIMITS`)

| Ressource | Limite | V1 |
| --- | --- | --- |
| Assets au catalogue | 512 | 32 |
| Intégrés au projet (portables) | 64 fichiers, 1 Mio chacun, **4 Mio** au total, WAV ≤ 8 s / MIDI | 4 Mio |
| Fichiers statiques | échantillon ≤ 2 Mio et ≤ 12 s ; MIDI ≤ 1 Mio | — |
| Procéduraux | 128, ≤ 4 s | — |
| Événements / variantes | 1024 / 32 par événement | 32 sons |
| Partitions / thèmes / profils | 64 / 64 / 64 (8 couches) | 16 partitions |

Les limites V1 restent appliquées aux définitions V1. Les fichiers utilisateur restent bornés (taille, durée, nombre).

## 3. Sélection et variations (`variants.ts`, `resolve.ts`)

1. Variantes dont la condition accepte le contexte **et** dont la ressource est jouable (ni PLANNED, ni introuvable dans cette session).
2. On garde le groupe **le plus spécifique** (nombre de critères satisfaits) : *herbe mouillée* > *herbe* > générique.
3. Sinon, chaîne de **repli** (`fallback`, 8 maximum, cycles refusés à la validation) ; sinon **silence + diagnostic**.
4. Tirage selon `repeat` : pondéré, anti-répétition, sac mélangé (chaque prise une fois par cycle, pas de doublon à la frontière), séquence ; RNG injectable et déterministe en test.
5. Gain/hauteur : ceux de l'événement **propriétaire de la prise** (conception sonore), × variante × jitter borné ; comportement (cooldown, priorité, portée, polyphonie, bus) : ceux de l'événement **demandé**.
6. Cooldown compté à l'acceptation de la demande (un décodage lent ne provoque pas de rafale), polyphonie par événement avec vol de la plus ancienne voix, +1 de priorité pour les sons du joueur, abandon des one-shots arrivés plus tard que `maxLatencyMs`.

## 4. Routage adaptatif (`router.ts`, `world-probe.ts`, `main.ts`)

Le routeur ne lit **que des faits métier** (mode de déplacement, à bord, `player.space`, surface échantillonnée, météo/heure de l'`EnvironmentState`, eau proche, caméra immergée, parcelle proche) et des résultats d'actions validées ; jamais de modifications de meshes. L'état audio reste local au client. Un futur serveur n'aura qu'à émettre des IDs d'événements et leurs paramètres (`router.emit(id, {context, position})`).

| Événement | Déclencheur réel |
| --- | --- |
| `player.footstep` | distance accumulée au sol : 0,9 m / ≥ 220 ms (marche, règle V1), 1,25 m / ≥ 200 ms (course) — **même cadence à 20 et 30 FPS** (testé) |
| `player.jump`, `player.land` (intensité selon la chute), `player.glide.deploy/fold`, boucle `player.glide.wind` | transitions de `player.mode` |
| `water.enter/dive/surface/exit`, `water.swim` | transitions nage/plongée, distance en nage |
| `boat.board/disembark`, boucle `boat.move` | état « à bord », vitesse du bateau |
| `mine.enter/exit/level.change` | `player.space` |
| `mine.hit`, `mine.cell.excavated`, `mine.resource.collect/crystal`, `mine.action.denied` | résultat de `ActivityRuntime.dig` + matière de la cellule visée |
| `farm.plant/water/harvest/clear`, `ui.error` | résultat de `farmAct` ; `farm.seedbag` au changement de culture |
| `npc.vocalize` | ouverture d'un dialogue |
| actions `playSound` | IDs V1 ou événements V2 |

Contexte partagé musique/ambiance : moment (`night` si soleil sous l'horizon), météo, `wet`, biome et lieu (biotope échantillonné ≤ 4 Hz), `mine`/`underwater`/`farm`, activité (`mining`, `sailing`, `farming`, `explore`). La musique et les ambiances sont réévaluées à 5 Hz ; les notes restent ordonnancées sur `AudioContext.currentTime`, indépendamment du FPS, du pas 30 Hz et de l'accélération du monde.

## 5. Moteur (`engine.ts`) — adaptations sans réécriture

- Accepte V1 ou V2 (V1 migré en mémoire), `playSound(id)` devient un alias de `playEvent(id)` : mêmes priorités/portées par défaut.
- Chargement **différé** des fichiers statiques depuis la base (`baseUrl`), un seul téléchargement/décodage par ressource (promesses partagées), cache PCM borné par le budget existant avec éviction LRU, contrôle de signature (`RIFF`/`OggS`), ressource introuvable marquée indisponible **une fois** puis contournée par repli.
- Partitions MIDI statiques téléchargées à la demande ; une partition demandée pendant son chargement démarre dès qu'elle est prête. Silences de fin de phrase (`requestSilence`) et jingles sur frontière de mesure.
- `MusicDirector` (thème selon le contexte, maintien si rien ne correspond — comportement V1, silences, jingles) et `AmbienceMixer` (profils globaux + un profil de lieu, couches en boucle plafonnées par `ambienceLayers`, ponctuelles à intervalle aléatoire sans rafale à l'entrée, fondus par profil, voix en fondu exclues du plafond dur).
- Sons procéduraux (UI, signal de maturité) synthétisés de façon déterministe dans un `AudioBuffer`.
- Métriques : événements demandés/joués/filtrés/cooldown/polyphonie/manquants/en retard, thème, couches d'ambiance, ressources indisponibles, diagnostics (≤ 40, dédoublonnés).
- **Inchangés** : `AudioContext` unique, activation au geste, mute, volumes, suspension/reprise, `dispose`, budgets 12/16/24 voix — 2/3/4 sources spatiales — 2/4/4 Mio PCM (consommateurs de `PresentationBudget`, aucun second automate).

## 6. Compatibilité et migration (`migrate.ts`)

- `migrateAudioV1toV2` : pure, entrée intacte, validée. Chaque `soundId` V1 devient un événement **du même id** avec le même gain/hauteur, priorité 4, portée 40 m, sans jitter ; partitions, timbres, émetteurs et octets intégrés conservés ; `music.day/night` → thèmes `explore.day/night` ; `ambience.rain/water/night` → profil `legacy` (ordre et priorités V1, plafond du budget). Des alias sémantiques (`player.footstep → step`, `weather.rain → rain`…) relient le routeur aux sons V1.
- Les projets/cartes V1 restent V1 sur disque (lecture inchangée) ; le jeu les migre en mémoire. Dans le Studio, **« Passer au catalogue V2 »** est une transaction annulable qui migre puis fusionne le catalogue intégré **sans écraser** les données de l'auteur (`mergeAudioCatalogs`).
- Références : un lien d'auteur cassé (`playSound` ou émetteur vers un id inexistant) reste refusé à la validation Studio/compilation avec un message explicite ; une **ressource** absente (PLANNED, fichier introuvable, décodage refusé) ou un **événement** inconnu émis au runtime produit un diagnostic et du silence, jamais une exception.
- Archive V3 : `world.audio` V2 voyage tel quel ; les fichiers utilisateur intégrés sont portables ; les fichiers de la bibliothèque Little World sont référencés par `uri` (ressources statiques du jeu, non autonomes hors d'un build Little World).

## 7. Studio (`audio-view.ts`, `audio-catalog-view.ts`)

Projet V1 : panneau V1 inchangé + bouton de passage au V2. Projet V2 : recherche, filtres par catégorie et par état (disponible / repli / manquant), prises attendues vs disponibles, édition de volume, hauteur, variations, délai, priorité, polyphonie, portée, répétition, boucle, spatialisation ; liste des prises avec statut, licence et provenance ; association d'une ressource existante ou d'un WAV importé (licence/provenance obligatoires) sous condition (surface, matière, intensité, mouillé) ; prévisualisation d'un contexte qui explique la prise retenue et le chemin de repli ; thèmes et profils (gain par couche) ; émetteurs ; diagnostics. Aucune fonction de station audionumérique.

## 8. Flux pour l'agent de génération (2ᵉ agent)

1. Lire `assets/audio/production-manifest.json` : `conventions` (format Ogg Vorbis mono, normalisation, boucles sans couture 6–8 s, règles MIDI SMF1/PPQN 480/programmes autorisés, contenu sans voix humaine, CC0) puis `items` (fichier cible, groupe/prise, événements, durée, boucle, condition de contexte, cahier des charges, vague B1/2/3, réutilisations).
2. Produire les fichiers aux chemins `file` (sous `public/`), vague 1 d'abord (54 fichiers B1), puis vague 2 (bêta enrichie : 117 au total), vague 3 optionnelle (43).
3. Déclarer chaque fichier livré dans [`assets/audio/produced.json`](../assets/audio/produced.json) : `"<assetId>": {"file": "audio/…", "status": "GENERATED", "source": "outil, version, graine/prompt", "license": "CC0-1.0", "generatorVersion": "…"}`. **Ne pas éditer `public/audio/catalog.json` à la main.**
4. `npm run generate:audio` mesure le fichier (octets, sha256, durée, canaux, fréquence — WAV, Ogg Vorbis/Opus, MIDI, sans décodage ni dépendance : `tools/audio-probe.mjs`), passe l'asset de PLANNED à GENERATED avec son `uri`, le retire du manifeste et met à jour la doc 38. Un fichier pour un id inconnu ou déjà disponible est refusé. **VERIFIED** uniquement après écoute humaine ; **REJECTED** garde le fichier pour inspection mais ne le joue jamais.
5. Lancer `npm test` et `node tools/run-browser-check.mjs audio-v2 <dev-url>`.

Essai réalisé dans une copie jetable : un Ogg Vorbis de 0,25 s enregistré pour `fs-grass-01` a été mesuré (44,1 kHz, mono), rendu disponible, choisi pour `player.footstep` sur herbe au lieu du repli `step`, et retiré du manifeste (159 fichiers restants). Aucun fichier de ce test n'est livré.

## 8 bis. Production réalisée et outils

- `tools/audio-synth/` : DSP déterministe (`dsp.mjs`), recettes par groupe (`recipes.mjs`), contrôle qualité (`qc.mjs`), rendu (`render.mjs`), compositions (`music.mjs`, `compositions.mjs`), rapport (`report.mjs`).
- `npm run synth:audio` régénère tout (fichiers, registre, catalogue, rapport) ; `npm run check:audio-synth` vérifie que chaque fichier livré est **identique bit à bit** à son rendu (exécuté en CI).
- États : `TECHNICALLY_VALID` (contrôles automatiques réussis), `LISTENING_REVIEW` (substitut procédural d’un son naturel complexe, écoute prioritaire), `VERIFIED` réservé à une écoute humaine, `REJECTED` jamais joué. Le moteur joue `GENERATED`, `TECHNICALLY_VALID`, `LISTENING_REVIEW` et `VERIFIED`.
- Licence : créations originales du projet (synthèse et composition), dédiées CC0 comme la bibliothèque V1 existante — **à confirmer par le propriétaire du dépôt**.

## 9. Statuts (spécifié / implémenté / testé / publié)

| Mécanisme | Spécifié | Implémenté | Testé | Publié |
| --- | --- | --- | --- | --- |
| Schéma V2, validation, limites par type | oui | oui | unitaires | build local vérifié |
| Migration V1→V2 et fusion Studio | oui | oui | unitaires + navigateur | build local |
| Variantes, repli, cooldown, polyphonie, retard | oui | oui | unitaires + Chromium | build local |
| Routeur (déplacements, eau, bateau, mine, ferme, PNJ) | oui | oui | unitaires + parcours vallée/B1 | build local |
| Directeur musical, mixeur d'ambiances | oui | oui | unitaires + Chromium | build local |
| Chargement statique différé, Ogg Vorbis | oui | oui | Chromium (Ogg si `ffmpeg` présent) | build local |
| Studio catalogue | oui | oui | Chromium | build local |
| Ressources sonores et MIDI | oui | **oui** : 230 WAV + 19 MIDI (synthèse procédurale et composition originales, `tools/audio-synth`) | contrôle technique automatique, reproductibilité bit à bit, lecture dans le moteur réel (Chromium) ; **aucune écoute humaine** | build local |
| Portes/coffres/UI/émetteurs WaterNetwork, outils/agriculture avancée, montures | événements définis | **non émis** (fonctions de jeu absentes) | — | — |

**Non exécuté dans cet environnement** : Firefox (non installé — le repli de positionnement listener/panner reste testé en unitaire), écoute humaine, mesures CPU audio/glitches sur PC à GPU intégré, déploiement GitHub Pages réel (build statique, chemins base-aware et `verify-static-build` vérifiés localement). Les budgets restent des hypothèses à calibrer (doc 22/23).
