> **Historique** : ce document décrit le prototype initial (75/100). Pour les valeurs en vigueur (réserve 150/200→280, coût 14/impulsion et nouveaux aliments), consulter [70 — Aliments et recharge](70-FOOD-BOOST-RECHARGE.md) et `src/physics/gas-propulsion.ts`.

# 59 — Propulsion au gaz en vol (prototype)
Branche : `feat/glide-gas-boost`, basée sur `main` commit `31ffb4b`. Pas de merge.
## Contrat
- Clic droit maintenu **seulement en mode glide** ; clic gauche conserve la rotation de la caméra.
- La physique à 30 Hz détient la réserve (initiale 75/100), la dépense (16/s), l'accélération (5 m/s²) et les impulsions (0,2 s).
- La poussée entre dans le bilan énergétique de `glideVelocity`. Le plafond de vitesse existant (34 m/s), les décrochages et collisions restent actifs.
- En dehors du plané, la poussée est strictement désactivée. Une fermeture de menu, perte de focus ou changement de mode doit relâcher l'entrée.
- Particules : un `InstancedMesh` de 24 particules au maximum, sans texture ni ombre. Affichage local uniquement, indépendant du tick de simulation.
- Réaction corporelle du héros appliquée après la pose du rig **dans main.ts**, pour ne pas invalider les GLB et les atlas d'imposteurs existants.
- Son temporaire : ressource `player.glide.deploy` réutilisée à cadence réduite. Créer plus tard 3–5 sons de pets légers dans le catalogue audio V2 ; aucune piste MIDI requise.
## Alimentation
`food:apple` +25, `food:pear` +25, `food:plum` +15, `food:cherry` +12.
Action « Manger » dans le sac sur carte jouable, uniquement hors vol et hors bateau. Retrait atomique de 1 aliment dans le runtime, puis recharge bornée à 100. Les champignons non qualifiés ne sont **pas** consommables.
## Compatibilité
- `Controls.boostHeld` optionnel : aucun changement des anciennes commandes.
- `MovementSnapshot` ajoute les champs optionnels gaz / séquence / phase, validés pour la répétabilité.
- `GameSaveV2.gasReserve` optionnel, anciennes parties remplies avec la valeur initiale.
- Le modèle de présentation permet d'ajouter ultérieurement les événements de propulsion au rendu des joueurs proches. Aucun réseau n'est ajouté ; les imposteurs lointains ne portent pas les particules.
## Essais
```bash
npm test
npm run check:impostors
npm run assets:hamster
npm run typecheck
npm run build
```
Puis essai manuel à 20/30 FPS : clic gauche + clic droit simultanés, menu contextuel désactivé seulement sur le canvas, relâchement hors canvas, atterrissage, eau, épuisement, rechargement alimentaire, chargement V1, changement de caméra, cas de plusieurs personnages. Les économies GPU sont à mesurer, non garanties.
