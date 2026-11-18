# 95 — Surf V1 · qualification CPU/GPU, navigateur et îles spécialisées

**Branche** : `docs/surf-island-full-plan` · PR #83 (brouillon).
**Règle** : une fonctionnalité poussée et un test créé ne sont **pas** une qualification.
Ne pas confondre Chromium/SwiftShader (logiciel) avec une mesure sur GPU intégré réel.

## État technique vérifiable dans la branche

| Objectif | Code réellement disponible | Qualification restante |
| --- | --- | --- |
| Déplacement CPU/GPU | `src/surf/wave-field.ts`, `src/render/surf-water-view.ts` : sinusoïde + harmonique identique, masque de profondeur identique, temps shader périodique, test `tests/surf-render.test.mjs` | Mesurer et examiner le rendu sur rivage réel ; la géométrie interpole entre sommets, l'eau physique est continue |
| FPS / LOD | Maillages pré-calculés à 3 résolutions, sélection par distance à la zone et `PresentationBudget.level`, même matériau/shader, triangles et tier exposés en métriques | Mesures FPS p95 sur Intel UHD/Iris ou AMD iGPU 4–8 Go, vérification des changements de LOD en déplacement rapide |
| Tubes et brassage | `surf-barrel.ts`, `barrel-wash.ts`, `surf-tumble-pose.ts`, collision logique / raccourci plongée, tampon 4 crêtes maximum par zone | Essai de fermeture/ressortie sur plusieurs côtes, caméra et animation en jeu |
| Nage/vol/ski | Champ surf **optionnel** ; `tests/surf-compat.test.mjs` compare les mêmes actions à 30 Hz avec/sans champ désactivé ; suite navigateur existante dans `checks.yml` | Confirmer exécution verte de toutes les étapes CI, y compris le bateau et les autres îles |
| Sac / planche | `tool:surfboard` déclaré dans le gameplay ; slot mains standard, favoris et icône, objet porté entre îles ; l'outil `B` n'autorise la planche que si équipée hors démo | `npm run test:surf` doit ouvrir le sac, équiper la planche, puis tester nage/surf en vrai navigateur |
| Animations / audio / HUD | Postures de rame, carving et saut ; planche orientée sur la normale CPU ; sons existants réutilisés ; HUD contextuel | Sons spécialement mixés surf, finition des transitions et caméra intérieur tube |
| Zones A/B/C | `planThreeSurfBeaches` + bouton Studio `Implanter 3 plages surf A/B/C`; source V3 stocke 3 zones, 3 courses, boosts/tremplin, runtime multi-zones | Valider une carte réelle en Studio et publier une **île autonome** spécifique : aucune nouvelle île n'est inscrite au catalogue public |
| Port calme | Le planner réserve un **repère** en eau calme, écarté des plages | Quai, marchand, rameur et bateau non créés par le planner : les placer avec les assets portuaires existants |

## Test navigateur reproductible

Créer et servir un build du dernier commit :

```bash
npm ci
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 5173 --strictPort
```

Dans un autre terminal :

```bash
npm run test:surf
```

Le script utilise une île publiée et `?surfDemo=1&metrics=1`, capture
`/tmp/little-world-browser/surf-demo.png` ou `surf-failed.png` en cas d'échec.
Il doit vérifier explicitement un champ de vagues, la planche visible,
les tubes, les triangles bornés, l'équipement depuis le sac et les transitions B.

Sur la CI Linux, le rendu logiciel **SwiftShader** vérifie le fonctionnement
et la présence d'erreurs JavaScript, **pas** les performances GPU.

## Benchmark PC 4–8 Go / iGPU

Sur un vrai PC cible, lancer Chromium matériel (avec WebGL accéléré) :

```bash
SURF_NATIVE_GPU=1 npm run benchmark:surf
```

Sur Windows PowerShell :

```powershell
$env:SURF_NATIVE_GPU='1'
npm run benchmark:surf
```

Utiliser `CHROMIUM_PATH` pour cibler un Chromium compatible si nécessaire.
Le résultat inclut : vendor/renderer WebGL, `navigator.deviceMemory` si exposé,
FPS présentés, p95 du temps de travail JS/rendu, niveau du budget graphique,
nombre de draw calls, triangles, triangles de la zone surf et 2 captures.
Fichiers dans le répertoire temporaire du système, sous `little-world-browser` (`/tmp/little-world-browser` sous Linux ou `%TEMP%\\little-world-browser` sous Windows). Le rapport utilise également `os.totalmem()` pour n'accorder le statut GPU intégré 4–8 Go qualifié qu'à une machine ayant réellement cette plage de RAM, et non à une grande machine dont le navigateur expose 8 Go par approximation.

**Cibles provisoires** : 30 FPS visés, 20 FPS de repli ;
pas de dépassement prolongé de 50 ms du p95 de travail ;
une baisse de détail ne doit jamais changer la simulation à 30 Hz.
Une mesure sur SwiftShader/llvmpipe **ne** valide **jamais** ces cibles.
Pour des comparaisons sérieuses, répéter à résolution et navigateur fixes,
vérifier le GPU retourné et enregistrer au moins 3 parcours identiques.

## Tests automatiques en complément

```bash
node --experimental-strip-types --test tests/surf.test.mjs tests/surf-barrel.test.mjs tests/surf-render.test.mjs tests/surf-island-planner.test.mjs tests/surf-compat.test.mjs tests/surf-compiled.test.mjs
```

`checks.yml` exécute également la matrice navigateur
existante (eau, nage, bateaux, courses, vol, mines, sauvegardes, etc.) et désormais
le test surf. Une preuve positive doit provenir de **l'exécution du commit final**.

## Portée de l'implantation Studio

L'outil A/B/C refuse un terrain sans profondeur suffisante ou une zone occupée.
Il n'efface pas les villages, les quais ni les routes.
Les circuits sont versionnés et validés avec les contrôles de courses historiques.
Le système réutilise `NearSea` par soustraction des rectangles de chaque zone.

Le port calme n'est qu'un repère ; aucune instance de bateau ou quai n'est ajoutée
artificiellement. Il reste à construire un exemple publié dédié à partir des
assets réels du projet et à passer les tests d'archipel.

## Conditions avant merge

1. CI du dernier commit : `npm test`, `npm run build`, Surf navigateur,
   sauvegardes/eau/nage/vol/ski/bateau et Studio sans échec.
2. Captures d'une zone A, B et C, y compris tube vu en traversée et plage.
3. Contrôle sans trous de `NearSea` sur les 3 limites de zone et tests de
   changement de LOD en vol rapide.
4. Mesure réelle Intel/AMD iGPU 4–8 Go avec GPU identifié et résultat de
   benchmark archivé.
5. Île Surf dédiée publiée en tant que source compilée : port et activité réels.
