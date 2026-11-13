# Audio B1 et vérification avant essais utilisateur

Branche de travail : `feat/studio-v3`. L’audio décrit ici est implémenté ; les mines, l’agriculture et les autres critères B1 restant dans le [suivi général](27-B1-IMPLEMENTATION-STATUS.md) ne sont pas déclarés terminés.

## Audio disponible

- Un moteur Web Audio partagé par instance de jeu, créé au premier clic autorisé. Le chargement d’une carte silencieuse ne crée aucun contexte. Erreur d’activation : le jeu continue sans son.
- Cinq presets : flûte douce, cordes pincées, harpe, clochette et percussion douce. Deux partitions MIDI originales et six échantillons WAV courts CC0, générés par `npm run generate:audio`. Aucune banque externe ni Web MIDI matériel.
- Lecture SMF 0/1 PPQN, tempos et changements de tempo, programmes mappés à la palette, velocity-zero/note-off, notes incomplètes refermées. Maximum 1 Mio, 32 pistes, 100 000 événements, 20 000 notes et 30 minutes par MIDI. Sustain/autres contrôleurs, pression et pitch bend sont ignorés avec diagnostic ; SysEx/SMPTE/type2 sont refusés.
- Ordonnancement en avance sur `AudioContext.currentTime`, indépendant de RAF et de l’accélération du monde. Changement de partition sur une frontière de mesure avec libération des anciennes voix ; masquage de l’onglet suspend et reprend sans rejouer le passé.
- Mixeur général/musique/effets/ambiance, mute, préférences locales distinctes des sources et des slots. Les sons confirmant collecte, livraison et mécanisme sont des actions déclaratives ; les pas et ambiances proches ont une fréquence bornée.
- Budgets audio consommateurs du niveau de `PresentationBudget` existant, sans nouvel automate adaptatif : 12/16/24 voix actives selon profil, 6/8/12 voix musicales, 2/3/4 sources spatialisées, 2/4/4 Mio de PCM. Deux voix supplémentaires peuvent finir leur court fade lors d’un remplacement ; les nœuds sont ensuite libérés. Priorité aux effets joueur avant musique et ambiance.
- Émetteurs statiques indexés spatialement ; sources liées à une entité mises à jour à cadence réduite. Aucun nœud pour un son hors portée. Panoramique `equalpower`, pas de HRTF ni réverbération par objet.

## Studio et portabilité

Module **Audio** : installer l’ambiance originale, écouter les cinq timbres/partitions, importer et inspecter un MIDI, changer ses mappings, choisir musique de jour/nuit, importer un WAV, écouter les sons et lier un émetteur à la sélection. Le module **Interactions** propose le son de confirmation. Licence et provenance sont obligatoires pour les imports.

Les fichiers MIDI/WAV sont conservés encodés dans les JSON auteur et réellement inclus dans le ZIP V3, avec leurs métadonnées. Pas d’`AudioContext`, de voix ou de `AudioBuffer` dans les archives/sauvegardes. Le manifeste compilé conserve la définition audio ; le runtime ne lit pas le stockage auteur.

Import d’échantillons actuel : WAV PCM 8/16 bits ou float32 mono/stéréo, 8 secondes et 1 Mio par fichier, catalogue de sources 4 Mio. Validation du conteneur/durée avant décodage natif, deux décodages simultanés, cache PCM partagé avec éviction. Ogg/Opus, édition de synthèse avancée, export de fichiers audio séparés et qualifications de codecs Firefox restent à développer.

## Parcours conseillé pour vos essais

1. Démarrer le jeu puis **Tester la mission et le mécanisme**. Le son commence après **Explorer** ; régler **Son** à droite. Essayer musique, effets, ambiance, volume général et mute.
2. Marcher, approcher l’eau, collecter un gland, accepter/livrer la mission et ouvrir le mécanisme. Les confirmations visuelles restent utilisables avec le son coupé.
3. Ouvrir **Heure et météo**, accélérer le monde : la musique garde son tempo. Masquer l’onglet quelques secondes, revenir ; vérifier absence de note bloquée ou rafale.
4. Ouvrir Studio, module **Audio** ; installer la palette, écouter, importer un MIDI/WAV personnel avec licence/provenance, annuler/refaire, sauvegarder et exporter. Réimporter l’archive comme nouveau projet lorsque l’identifiant n’existe pas déjà dans ce navigateur, puis tester la copie.
5. Tester les outils existants : objets, terrain/biotopes, vue 3D/gizmo/pinceau, personnages/dialogues/interactions, slots de partie et retour au Studio. Les slots du test restent séparés des vraies parties.

## Vérification automatisée

```sh
npm test
npm run typecheck
npm run generate:audio
npm run generate:beta
npm run build
# Sur le build servi par npm run preview :
npm run test:browser
npm run test:studio
npm run test:gameplay
npm run test:environment
npm run test:local
npm run test:characters
npm run test:audio
# Modules source servis par Vite :
node tests/studio-storage.browser.mjs <base-url>
node tests/audio-engine.browser.mjs <base-url>
```

Les tests audio Chromium mesurent une sortie Web Audio non nulle, mute/volumes, contexte unique, fermeture des notes, quotas, 200 sources virtuelles, décodage/cache, pause/reprise, changements de score, mode indisponible, import et archive. Ces mesures ne certifient ni la qualité à l’oreille ni l’absence de glitches sur un PC réel. L’écoute et les essais Firefox/GPU intégré restent à qualifier séparément.
