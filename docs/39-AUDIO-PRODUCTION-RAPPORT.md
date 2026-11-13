# 39 — Rapport de production audio (généré)

> Généré par `npm run synth:audio` (`tools/audio-synth/report.mjs`). Faits mesurés uniquement : **aucune écoute humaine n’a été réalisée** ; aucune ressource n’est `VERIFIED`.

## Résumé

- **19 fichiers MIDI** originaux (26 Kio) et **230 fichiers WAV** PCM 16 bits mono (20.1 Mio).
- États : `TECHNICALLY_VALID` 214, `LISTENING_REVIEW` 35. `LISTENING_REVIEW` = substituts procéduraux de sons naturels complexes, écoute prioritaire ; `TECHNICALLY_VALID` = contrôles automatiques réussis, écoute encore nécessaire avant `VERIFIED`.
- Événements : 108/108 jouables ; 106 avec prises propres ; `mission.complete` → `mission`, `puzzle.solved` → `mission` par repli explicite ; sans ressource : aucun.
- Réutilisation : 23 variantes réutilisent un fichier d’un autre groupe (gain/hauteur), sans fichier dupliqué.
- Mémoire décodée estimée (48 kHz float32) : total 57.0 Mio si tout était chargé — le moteur ne charge qu’à la demande et plafonne le cache à 2/4/4 Mio selon le profil.
- Ressources restant à produire (`PLANNED`) : 0.

## Répartition par dossier

| Dossier | Fichiers | Taille | PCM décodé (somme) |
|---|---|---|---|
| `ambience/coast` | 1 | 310 Kio | 1350 Kio |
| `ambience/desert` | 1 | 302 Kio | 1313 Kio |
| `ambience/forest` | 2 | 603 Kio | 2625 Kio |
| `ambience/marsh` | 1 | 302 Kio | 1313 Kio |
| `ambience/mine` | 7 | 1046 Kio | 2932 Kio |
| `ambience/night` | 1 | 302 Kio | 1313 Kio |
| `ambience/plains` | 1 | 302 Kio | 1313 Kio |
| `ambience/village` | 2 | 560 Kio | 2438 Kio |
| `ambience/volcano` | 1 | 302 Kio | 1313 Kio |
| `ambience/water` | 6 | 2024 Kio | 7500 Kio |
| `ambience/weather` | 7 | 2603 Kio | 7578 Kio |
| `sfx/creatures` | 37 | 2284 Kio | 4969 Kio |
| `sfx/farming` | 31 | 1662 Kio | 3615 Kio |
| `sfx/footsteps` | 40 | 1138 Kio | 2473 Kio |
| `sfx/magic` | 4 | 655 Kio | 1988 Kio |
| `sfx/mining` | 34 | 1846 Kio | 4016 Kio |
| `sfx/objects` | 16 | 1818 Kio | 4331 Kio |
| `sfx/player` | 11 | 415 Kio | 902 Kio |
| `sfx/ui` | 2 | 65 Kio | 142 Kio |
| `sfx/water` | 25 | 2013 Kio | 4942 Kio |

## Contrôle technique par groupe (mesures)

Centroïde spectral moyen (indicateur de brillance/matière), niveau RMS et crête. Règles : pas d’écrêtage, crête ≤ −0,9 dBFS, |DC| ≤ 0,01, bords nuls, silence initial ≤ 25 ms (450 ms pour les ambiances à attaque progressive), raccord de boucle continu et au niveau de la boucle, prises distinctes (corrélation < 0,9), écart de niveau entre prises ≤ 6 dB.

| Groupe | Prises | Durée (s) | Centroïde (Hz) | RMS (dBFS) | Crête (dBFS) | Statut | Recette |
|---|---|---|---|---|---|---|---|
| `amb-cave` | 1 | 7.00–7.00 | 207 | -39.2–-39.2 | -26.0–-26.0 | TECHNICALLY_VALID | lot A, boucle, 22,05 kHz |
| `amb-desert` | 1 | 7.00–7.00 | 2816 | -35.0–-35.0 | -21.0–-21.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-fire` | 1 | 6.00–6.00 | 3460 | -35.0–-35.0 | -15.0–-15.0 | TECHNICALLY_VALID | lot E, boucle |
| `amb-forest` | 1 | 7.00–7.00 | 2690 | -33.3–-33.3 | -20.0–-20.0 | TECHNICALLY_VALID | lot A, boucle, 22,05 kHz |
| `amb-forest-night` | 1 | 7.00–7.00 | 1403 | -36.7–-36.7 | -24.0–-24.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-lake` | 1 | 7.00–7.00 | 663 | -38.6–-38.6 | -22.0–-22.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-night` | 1 | 7.00–7.00 | 3178 | -37.6–-37.6 | -22.0–-22.0 | TECHNICALLY_VALID | lot A, boucle, 22,05 kHz |
| `amb-plain` | 1 | 7.00–7.00 | 2437 | -34.8–-34.8 | -21.0–-21.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-rain-heavy` | 1 | 7.00–7.00 | 5383 | -30.0–-30.0 | -15.0–-15.0 | TECHNICALLY_VALID | lot C, boucle |
| `amb-rain-light` | 1 | 7.00–7.00 | 5633 | -35.6–-35.6 | -18.0–-18.0 | TECHNICALLY_VALID | lot A, boucle |
| `amb-rapids` | 1 | 7.00–7.00 | 2033 | -30.7–-30.7 | -16.0–-16.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-river` | 1 | 7.00–7.00 | 1667 | -33.1–-33.1 | -18.0–-18.0 | TECHNICALLY_VALID | lot A, boucle, 22,05 kHz |
| `amb-sea` | 1 | 7.20–7.20 | 1889 | -33.0–-33.0 | -17.0–-17.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-shimmer` | 1 | 6.00–6.00 | 2466 | -32.5–-32.5 | -20.0–-20.0 | TECHNICALLY_VALID | lot E, boucle, 22,05 kHz |
| `amb-swamp` | 1 | 7.00–7.00 | 328 | -37.6–-37.6 | -22.0–-22.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-underwater` | 1 | 7.00–7.00 | 268 | -33.4–-33.4 | -20.0–-20.0 | TECHNICALLY_VALID | lot A, boucle, 22,05 kHz |
| `amb-village` | 1 | 7.00–7.00 | 1097 | -35.3–-35.3 | -22.0–-22.0 | LISTENING_REVIEW | lot C, boucle, 22,05 kHz |
| `amb-volcano` | 1 | 7.00–7.00 | 190 | -32.0–-32.0 | -18.0–-18.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-waterfall` | 1 | 7.00–7.00 | 2843 | -28.3–-28.3 | -15.0–-15.0 | TECHNICALLY_VALID | lot C, boucle |
| `amb-watermill` | 1 | 6.00–6.00 | 1305 | -35.0–-35.0 | -17.0–-17.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-wind-light` | 1 | 7.00–7.00 | 1818 | -35.3–-35.3 | -22.0–-22.0 | TECHNICALLY_VALID | lot A, boucle, 22,05 kHz |
| `amb-wind-strong` | 1 | 7.00–7.00 | 1242 | -30.1–-30.1 | -17.0–-17.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `amb-windmill` | 1 | 6.40–6.40 | 976 | -34.8–-34.8 | -18.0–-18.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `bag` | 2 | 0.37–0.39 | 4533 | -32.1–-31.9 | -14.0–-14.0 | TECHNICALLY_VALID | lot A |
| `basket` | 2 | 0.50–0.50 | 6874 | -37.5–-35.4 | -13.0–-13.0 | TECHNICALLY_VALID | lot E |
| `bird` | 4 | 0.55–0.86 | 5035 | -25.6–-23.5 | -15.0–-15.0 | LISTENING_REVIEW | lot D |
| `boat-board` | 2 | 0.80–0.80 | 747 | -26.8–-25.4 | -8.0–-8.0 | TECHNICALLY_VALID | lot A |
| `boat-bump` | 2 | 0.80–0.80 | 573 | -24.5–-24.4 | -7.0–-7.0 | TECHNICALLY_VALID | lot E |
| `boat-creak` | 3 | 1.14–1.24 | 4036 | -38.8–-37.7 | -14.0–-14.0 | TECHNICALLY_VALID | lot C |
| `boat-move` | 1 | 6.00–6.00 | 1467 | -32.7–-32.7 | -17.0–-17.0 | TECHNICALLY_VALID | lot A, boucle, 22,05 kHz |
| `bridge` | 2 | 1.60–1.60 | 3605 | -32.8–-31.9 | -10.0–-10.0 | TECHNICALLY_VALID | lot E |
| `chest` | 2 | 1.10–1.10 | 5060 | -34.6–-33.3 | -10.0–-10.0 | TECHNICALLY_VALID | lot E |
| `cut` | 2 | 0.30–0.30 | 5706 | -31.5–-30.9 | -12.0–-12.0 | TECHNICALLY_VALID | lot E |
| `dive` | 2 | 0.90–0.90 | 712 | -22.7–-22.3 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `door-close` | 2 | 0.70–0.70 | 2845 | -29.8–-28.7 | -9.0–-9.0 | TECHNICALLY_VALID | lot E |
| `door-open` | 2 | 1.10–1.10 | 3839 | -38.7–-38.6 | -11.0–-11.0 | TECHNICALLY_VALID | lot E |
| `drip` | 4 | 0.90–0.90 | 1587 | -39.2–-36.4 | -16.0–-16.0 | TECHNICALLY_VALID | lot C |
| `expr-annoyed` | 2 | 0.35–0.43 | 652 | -26.8–-26.8 | -17.0–-17.0 | LISTENING_REVIEW | lot D |
| `expr-calm` | 2 | 0.46–0.54 | 180 | -29.7–-29.3 | -18.0–-18.0 | LISTENING_REVIEW | lot D |
| `expr-effort` | 2 | 0.24–0.29 | 1628 | -25.8–-25.5 | -16.0–-16.0 | LISTENING_REVIEW | lot D |
| `expr-happy` | 2 | 0.55–0.55 | 3418 | -24.8–-24.8 | -15.0–-15.0 | LISTENING_REVIEW | lot D |
| `expr-sad` | 2 | 0.56–0.61 | 1396 | -23.3–-23.3 | -17.0–-17.0 | LISTENING_REVIEW | lot D |
| `expr-surprised` | 2 | 0.17–0.22 | 2432 | -21.1–-21.1 | -15.0–-15.0 | LISTENING_REVIEW | lot D |
| `fish` | 2 | 0.50–0.50 | 2875 | -33.3–-33.1 | -14.0–-14.0 | TECHNICALLY_VALID | lot D |
| `flock` | 1 | 1.30–1.30 | 782 | -32.9–-32.9 | -15.0–-15.0 | TECHNICALLY_VALID | lot D |
| `frog` | 3 | 0.41–0.83 | 3115 | -38.4–-37.7 | -16.0–-16.0 | LISTENING_REVIEW | lot D, attaque progressive |
| `fs-dirt` | 4 | 0.30–0.30 | 4060 | -26.9–-26.3 | -8.0–-8.0 | TECHNICALLY_VALID | lot A |
| `fs-grass` | 4 | 0.32–0.32 | 5007 | -27.9–-25.1 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `fs-grass-wet` | 3 | 0.36–0.36 | 4472 | -28.8–-24.5 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `fs-gravel` | 3 | 0.32–0.32 | 6746 | -29.2–-27.8 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `fs-metal` | 3 | 0.40–0.40 | 1767 | -31.4–-29.3 | -12.0–-12.0 | TECHNICALLY_VALID | lot E |
| `fs-mud` | 3 | 0.40–0.40 | 1730 | -22.5–-22.4 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `fs-sand` | 3 | 0.30–0.30 | 7260 | -30.1–-27.8 | -11.0–-11.0 | TECHNICALLY_VALID | lot A |
| `fs-snow` | 3 | 0.34–0.34 | 3388 | -27.4–-25.5 | -11.0–-11.0 | TECHNICALLY_VALID | lot E |
| `fs-stone` | 4 | 0.22–0.22 | 3901 | -31.8–-30.3 | -10.0–-10.0 | TECHNICALLY_VALID | lot A |
| `fs-tallgrass` | 3 | 0.45–0.45 | 5402 | -27.7–-26.6 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `fs-water` | 3 | 0.36–0.36 | 2220 | -26.1–-24.4 | -10.0–-10.0 | TECHNICALLY_VALID | lot A |
| `fs-wood` | 4 | 0.26–0.26 | 377 | -27.5–-26.4 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `gears` | 1 | 4.00–4.00 | 1225 | -35.1–-35.1 | -15.0–-15.0 | TECHNICALLY_VALID | lot E, boucle, 22,05 kHz |
| `glide-deploy` | 2 | 0.40–0.40 | 2905 | -34.6–-33.1 | -10.0–-10.0 | TECHNICALLY_VALID | lot A |
| `gull` | 2 | 0.78–0.86 | 2862 | -28.3–-27.9 | -17.0–-17.0 | LISTENING_REVIEW | lot D |
| `harvest` | 3 | 0.70–0.70 | 4961 | -30.2–-28.6 | -10.0–-10.0 | TECHNICALLY_VALID | lot A |
| `harvest-grain` | 3 | 0.65–0.65 | 6059 | -29.3–-27.9 | -10.0–-10.0 | TECHNICALLY_VALID | lot A |
| `insect` | 2 | 1.43–1.84 | 606 | -30.8–-30.8 | -20.0–-20.0 | LISTENING_REVIEW | lot D, attaque progressive |
| `irrigate` | 1 | 5.00–5.00 | 1963 | -37.3–-37.3 | -21.0–-21.0 | TECHNICALLY_VALID | lot C, boucle, 22,05 kHz |
| `jump` | 2 | 0.26–0.26 | 3530 | -30.4–-28.4 | -12.0–-12.0 | TECHNICALLY_VALID | lot A |
| `ladder` | 2 | 0.90–0.90 | 4168 | -33.2–-29.8 | -11.0–-11.0 | TECHNICALLY_VALID | lot C |
| `land-heavy` | 2 | 0.55–0.55 | 4427 | -26.7–-26.2 | -7.0–-7.0 | TECHNICALLY_VALID | lot A |
| `land-soft` | 3 | 0.30–0.30 | 4791 | -28.1–-26.7 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `lap` | 3 | 0.93–0.97 | 890 | -30.9–-29.2 | -15.0–-15.0 | TECHNICALLY_VALID | lot C, attaque progressive |
| `lever` | 2 | 0.60–0.60 | 5129 | -30.8–-30.4 | -10.0–-10.0 | TECHNICALLY_VALID | lot E |
| `magic` | 2 | 1.50–1.50 | 3383 | -29.3–-28.4 | -14.0–-14.0 | TECHNICALLY_VALID | lot E |
| `mammal` | 2 | 0.53–0.86 | 1312 | -26.5–-26.4 | -17.0–-17.0 | LISTENING_REVIEW | lot D |
| `mine-collect` | 2 | 0.45–0.45 | 4881 | -33.3–-32.4 | -11.0–-11.0 | TECHNICALLY_VALID | lot A |
| `mine-crack` | 2 | 0.60–0.60 | 5187 | -33.7–-33.2 | -10.0–-10.0 | TECHNICALLY_VALID | lot E |
| `mine-crystal` | 2 | 1.30–1.30 | 2875 | -27.2–-26.7 | -12.0–-12.0 | TECHNICALLY_VALID | lot A |
| `mine-denied` | 2 | 0.35–0.35 | 369 | -30.2–-29.9 | -12.0–-12.0 | TECHNICALLY_VALID | lot A |
| `mine-enter` | 1 | 1.40–1.40 | 511 | -30.5–-30.5 | -16.0–-16.0 | TECHNICALLY_VALID | lot C, attaque progressive |
| `mine-hit-crystal` | 3 | 0.90–0.90 | 5034 | -27.9–-27.1 | -10.0–-10.0 | TECHNICALLY_VALID | lot A |
| `mine-hit-hardrock` | 4 | 0.45–0.45 | 4353 | -29.0–-27.8 | -8.0–-8.0 | TECHNICALLY_VALID | lot A |
| `mine-hit-ore` | 3 | 0.55–0.55 | 4556 | -28.9–-27.2 | -8.0–-8.0 | TECHNICALLY_VALID | lot A |
| `mine-hit-softrock` | 4 | 0.45–0.45 | 2277 | -30.9–-27.7 | -8.0–-8.0 | TECHNICALLY_VALID | lot A |
| `mine-hit-soil` | 3 | 0.45–0.45 | 3444 | -26.2–-25.1 | -8.0–-8.0 | TECHNICALLY_VALID | lot A |
| `mine-rubble` | 3 | 0.81–0.98 | 4754 | -30.5–-29.2 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `mine-strike` | 3 | 0.26–0.26 | 4595 | -31.8–-31.6 | -11.0–-11.0 | TECHNICALLY_VALID | lot A |
| `mission-accept` | 1 | 1.00–1.00 | 1947 | -26.4–-26.4 | -12.0–-12.0 | TECHNICALLY_VALID | lot E |
| `npc-activity` | 2 | 0.94–0.96 | 5823 | -41.9–-41.9 | -16.0–-16.0 | TECHNICALLY_VALID | lot D |
| `owl` | 2 | 1.80–1.80 | 427 | -26.3–-26.3 | -16.0–-16.0 | LISTENING_REVIEW | lot D |
| `pick` | 3 | 0.45–0.45 | 5439 | -28.9–-28.8 | -12.0–-12.0 | TECHNICALLY_VALID | lot E |
| `pickup` | 3 | 0.40–0.40 | 5645 | -32.4–-30.6 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `plant` | 3 | 0.68–0.79 | 6742 | -35.0–-32.1 | -8.0–-8.0 | TECHNICALLY_VALID | lot A |
| `puzzle-step` | 2 | 0.50–0.50 | 726 | -34.4–-33.5 | -10.0–-10.0 | TECHNICALLY_VALID | lot E |
| `resurface` | 2 | 0.80–0.80 | 2358 | -29.8–-26.7 | -11.0–-11.0 | TECHNICALLY_VALID | lot A |
| `rumble` | 2 | 2.43–2.61 | 130 | -29.0–-26.1 | -14.0–-14.0 | TECHNICALLY_VALID | lot C, attaque progressive |
| `seedbag` | 2 | 0.50–0.50 | 6862 | -33.5–-31.7 | -13.0–-13.0 | TECHNICALLY_VALID | lot E |
| `shimmer-hit` | 1 | 1.60–1.60 | 4920 | -31.0–-31.0 | -16.0–-16.0 | TECHNICALLY_VALID | lot E, attaque progressive |
| `slide` | 2 | 0.65–0.84 | 4459 | -28.8–-27.9 | -11.0–-11.0 | TECHNICALLY_VALID | lot E |
| `splash-big` | 2 | 1.10–1.10 | 1817 | -23.8–-23.4 | -7.0–-7.0 | TECHNICALLY_VALID | lot A |
| `splash-small` | 3 | 0.75–0.75 | 2284 | -25.9–-23.0 | -9.0–-9.0 | TECHNICALLY_VALID | lot A |
| `squirrel` | 3 | 0.53–0.62 | 4024 | -27.8–-27.0 | -15.0–-15.0 | LISTENING_REVIEW | lot D |
| `swim` | 3 | 0.52–0.69 | 874 | -24.0–-23.8 | -11.0–-11.0 | TECHNICALLY_VALID | lot A |
| `thunder` | 2 | 2.74–3.28 | 5898 | -26.7–-26.6 | -10.0–-10.0 | TECHNICALLY_VALID | lot C, attaque progressive |
| `till` | 3 | 0.60–0.60 | 3228 | -29.7–-25.2 | -9.0–-9.0 | TECHNICALLY_VALID | lot E |
| `tools` | 2 | 0.50–0.50 | 2924 | -28.5–-28.3 | -11.0–-11.0 | TECHNICALLY_VALID | lot E |
| `torch` | 1 | 0.90–0.90 | 4125 | -32.8–-32.8 | -12.0–-12.0 | TECHNICALLY_VALID | lot E |
| `voc-squirrel` | 4 | 0.33–0.53 | 2891 | -26.0–-24.4 | -14.0–-14.0 | LISTENING_REVIEW | lot D |
| `watering` | 3 | 1.24–1.39 | 2903 | -27.9–-26.7 | -11.0–-11.0 | TECHNICALLY_VALID | lot A |
| `weed` | 2 | 0.55–0.55 | 5241 | -31.2–-29.4 | -11.0–-11.0 | TECHNICALLY_VALID | lot A |

## Musiques MIDI

| Thème | Durée | Tempo | Mesures | Notes | Polyphonie max | Hauteurs mélodiques |
|---|---|---|---|---|---|---|
| `music-coast` | 34.29 s | 84 | 16×3 | 155 | 4 | 8 |
| `music-day-a` | 41.74 s | 92 | 16×4 | 253 | 5 | 11 |
| `music-day-b` | 27.69 s | 104 | 16×3 | 126 | 5 | 15 |
| `music-desert` | 50.53 s | 76 | 16×4 | 141 | 3 | 11 |
| `music-discovery` | 8.57 s | 84 | 3×4 | 16 | 3 | 11 |
| `music-farm` | 41.74 s | 92 | 16×4 | 238 | 4 | 10 |
| `music-forest` | 45.71 s | 84 | 16×4 | 246 | 5 | 11 |
| `music-magic` | 53.33 s | 72 | 16×4 | 286 | 3 | 7 |
| `music-menu` | 50.53 s | 76 | 16×4 | 200 | 5 | 11 |
| `music-mine` | 58.18 s | 66 | 16×4 | 115 | 4 | 11 |
| `music-mission` | 36.92 s | 104 | 16×4 | 187 | 3 | 11 |
| `music-mountain` | 56.47 s | 68 | 16×4 | 176 | 4 | 8 |
| `music-night-a` | 58.18 s | 66 | 16×4 | 184 | 6 | 10 |
| `music-night-b` | 40 s | 72 | 16×3 | 58 | 4 | 10 |
| `music-rare` | 12 s | 60 | 3×4 | 24 | 5 | 2 |
| `music-ruins` | 60 s | 64 | 16×4 | 62 | 3 | 9 |
| `music-success` | 7.5 s | 96 | 3×4 | 23 | 4 | 13 |
| `music-swamp` | 54.86 s | 70 | 16×4 | 113 | 5 | 9 |
| `music-village` | 38.4 s | 100 | 16×4 | 159 | 4 | 18 |

## Liste de préécoute humaine

À faire au casque puis sur enceintes d’ordinateur portable, volume général 55 %, dans le jeu (`?metrics`) et dans le Studio (prévisualisation de contexte). Passer chaque ressource à `VERIFIED` ou `REJECTED` dans `assets/audio/produced.json`, puis `npm run generate:audio`.

- **ambience** (30) — Écouter chaque fond 2 minutes en boucle (raccord inaudible ?), puis en combinaison : pluie + forêt + rivière + musique de nuit + pas. Les fonds « bruit filtré » (forêt, plaine, désert, vent, village) doivent rester distincts et non fatigants.
  - Prioritaires : `amb-village-01`
- **creatures** (37) — PRIORITAIRE — substituts procéduraux : écureuil, expressions, oiseaux, hibou, grenouilles, insectes, mouettes, mammifères. Vérifier qu’ils ne sonnent ni électroniques ni agaçants ; remplacer par une source réaliste si nécessaire.
  - Prioritaires : `bird-01`, `bird-02`, `bird-03`, `bird-04`, `expr-annoyed-01`, `expr-annoyed-02`, `expr-calm-01`, `expr-calm-02`, `expr-effort-01`, `expr-effort-02`, `expr-happy-01`, `expr-happy-02`, `expr-sad-01`, `expr-sad-02`, `expr-surprised-01`, `expr-surprised-02`, `frog-01`, `frog-02`, `frog-03`, `gull-01`, `gull-02`, `insect-01`, `insect-02`, `mammal-01`, `mammal-02`, `owl-01`, `owl-02`, `squirrel-01`, `squirrel-02`, `squirrel-03`, `voc-squirrel-01`, `voc-squirrel-02`, `voc-squirrel-03`, `voc-squirrel-04`
- **farming** (31) — Semis, arrosage, désherbage, récoltes, panier, outils : gestes courts, matière végétale crédible.
- **footsteps** (40) — Enchaîner 8 pas par surface à la cadence de marche puis de course : matière reconnaissable (herbe/terre/pierre/bois/eau…), aucune prise qui « saute » en niveau, pas de clic. Comparer herbe sèche et mouillée.
- **magic** (4) — Activation, scintillement, aura : doux, pas de stridence > 6 kHz prolongée.
- **mining** (34) — Frappe d’outil puis réponse de chaque matière : terre < roche tendre < roche dure < minerai < cristal doivent se distinguer ; éboulis et récolte sans fatigue sur 20 répétitions.
- **objects** (16) — Portes, coffre, levier, pont, torche, engrenages, feu, collecte : grincements non agressifs, latch nets.
- **player** (11) — Saut, atterrissage léger/lourd et planage : poids crédible d’un petit animal, pas d’effet spectaculaire.
- **ui** (2) — Sac/inventaire : discret.
- **water** (25) — Éclaboussures, nage, plongée, remontée, clapotis et bateau : lisibilité en mono à 10–30 m, bulles naturelles, pas de « bip » synthétique.
- **musique** (19) — Écouter chaque thème deux fois de suite dans le jeu : mélodie identifiable, pas de note qui « coince », transitions jour/nuit et vers les jingles sur la mesure, cohérence entre biomes ; fatigue après 20 minutes ?

## Limites connues

- Tous les sons sont **synthétisés procéduralement** (aucun générateur IA ni banque d’échantillons licenciée n’était disponible dans l’environnement de production). Les impacts, frottements, eau et vent sont crédibles par construction physique simplifiée ; les **voix d’animaux** sont des substituts (statut `LISTENING_REVIEW`).
- Les fonds « bruit filtré » (forêt, plaine, désert, vent, village) sont proches spectralement ; leur différenciation repose sur les couches ponctuelles (oiseaux, insectes, mouettes…) des profils d’ambiance.
- Les mesures (centroïde, RMS, raccords) ne remplacent pas une écoute ; les budgets CPU/GPU sur PC à GPU intégré et le comportement Firefox n’ont pas été mesurés ici.
