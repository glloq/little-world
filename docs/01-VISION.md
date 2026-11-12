# 01 — Vision et périmètre

**Statut : spécification V1 solo validée — 12 novembre 2026.**

## Concept

Petit monde 3D d'**exploration solo** dans le navigateur **PC**. Le joueur est un **écureuil volant non humanoïde** qui traverse une vallée montagneuse depuis une source jusqu'à un port sur la mer. On privilégie une exploration agréable, de beaux panoramas, le planage, la nage et la plongée, sans boucle de progression complexe.

La **première version est intégralement autonome côté navigateur**, hébergée sur **GitHub Pages**. Pas de serveur de jeu, compte ni réseau temps réel requis.

## Choix actés

| Domaine | Décision |
| --- | --- |
| Carte | **200 × 600 m** de zone de conception jouable |
| Environnement | Montagnes, rivière, moulin à eau, forêt, village, port, côte |
| Personnage | Écureuil volant stylisé, principalement quadrupède |
| Contrôles | PC clavier/souris, caméra troisième personne à la souris |
| Déplacements | Marche, course, saut, planage volontaire, nage, plongée |
| Endurance | Aucune dans la première version |
| Oxygène | Limite généreuse ; valeur à régler en prototype |
| Santé / mort | Ni dégâts ni mort |
| Activité | Exploration et tests techniques |
| Style | Low-poly organique optimisé ; ambiance originale d'animation japonaise |
| Carte côté joueur | **Immuable** : aucune modification terrain, rivières ou bâtiments |
| Fabrication du monde | Génération déterministe + **éditeur de carte et d'interactions** |
| Assets | Petits packs sélectionnés, GLB locaux, provenance/licences vérifiées |
| Publication | Build statique + GitHub Actions + GitHub Pages |

## Ambiance

- Formes organiques simples, matériaux légers, palette naturelle et lumière chaleureuse.
- Moulin avec roue visible, maisonnettes en bois/pierre, pontons de pêche, végétation abondante et quelques vestiges anciens.
- Magie environnementale **discrète** possible, pas de système de sorts dans le prototype.
- Identité visuelle originale ; ne pas chercher à reproduire un film ou une marque.

## Parcours géographique proposé

**Source en altitude → sentiers et forêt → moulin → clairières/village → estuaire → port/mer**.

Les pentes et montagnes lointaines renforcent l'impression d'échelle tout en limitant la zone réellement parcourable. Le planage doit procurer des trajets intéressants ; la rivière contient des sections profondes permettant la plongée.

## Premier prototype acceptable

1. **Scène de test WebGL accessible par URL GitHub Pages** et sans backend.
2. Écureuil provisoire ou final, caméra souris et états de mouvement fonctionnels.
3. Marche/course, saut, planage, nage et plongée dans une petite zone avec pentes/eau profonde.
4. Réglages des vitesses et transitions mesurables via interface de debug locale.
5. Fonctionnement dans un navigateur PC récent sans compte, réseau API ni installation applicative.

## Objectif de la V1 complète

- Vallée de 200 × 600 m générée et retouchée.
- Bibliothèque d'assets locaux classés, accessibles dans l'éditeur.
- Éditeur web statique : terrain, eau, végétation, chemins, bâtiments, interactions.
- **Sauvegardes locales** et import/export explicites des cartes JSON.
- Mode de test immédiat de la carte et des interactions.
- Jeu jouable depuis GitHub Pages avec scène par défaut compilée/embarquée.

## Exclusions de V1

- **Multijoueur** (objectif historique de 10–30 joueurs **reporté**, non testé).
- Serveur Colyseus, sessions, base de données, comptes utilisateurs, chat, synchronisation.
- Modification du monde par les joueurs.
- Combat, dégâts, mort, endurance, économie, quêtes et agriculture.
- Mobile/manette/VR ; météo complexe et cycle jour/nuit complet non prioritaires.

## Critères qualité

- Transitions de locomotion fluides et prévisibles ; aucun état bloquant.
- La page charge **tous les assets nécessaires** depuis le même site statique.
- Sauvegarde/rechargement d'une carte sans perte ; export de sécurité utilisable.
- Déploiement reproductible avec version de build identifiable.
- Performances mesurées sur PC représentatif, sans objectif FPS inventé.

Voir [Feuille de route](07-ROADMAP.md), [Pages](08-GITHUB-PAGES.md) et [Décisions](DECISIONS.md).
