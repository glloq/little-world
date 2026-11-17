# Îles composées et brouillon 2D éditable

Statut : besoins et architecture proposés après les six styles V4. Les fonctionnalités décrites ici ne sont pas encore implémentées. Ce document complète l’audit 65 ; il ne remplace pas les générations existantes.

## Trois choix indépendants

Le modèle actuel associe encore une silhouette et une organisation du relief. Séparer progressivement trois décisions :

- **Silhouette** : naturelle, allongée, croissant, tortue, couronne fragmentée. La tortue est une silhouette géographique reconnaissable, pas une créature mobile.
- **Relief** : doux, massif central ou latéral, volcan, plusieurs massifs, plateformes locales. Une silhouette en tortue peut ainsi recevoir un massif sur la carapace ou rester basse.
- **Usages et accès** : port, champs, bassin de lac, village éventuel, passages entre zones. Ils imposent des contraintes spatiales, pas seulement des couleurs.

Conserver les six styles V4 comme raccourcis préconfigurés et comme versions reproductibles des projets déjà créés. Une nouvelle version de composition enregistrera les choix séparés et leurs paramètres effectifs.

## Silhouettes composées

### Croissant avec port dans la baie

Former un contour concave unique : arc extérieur, deux pointes, retour par l’arc intérieur. L’ouverture est orientable. Par défaut, la baie s’ouvre vers le bas de la carte et le port se place sur son rivage intérieur, dans la partie centrale basse du terrain. Le placer sur terre au bord de la baie, jamais au centre géométrique dans l’eau.

Le port commence par une réservation de terrain bas, assez plat, relié à l’intérieur et à une eau suffisamment profonde et ouverte sur la mer. Quais, bâtiments et détails viennent ensuite par les outils et presets d’établissements existants. Distinguer explicitement « emplacement de port validé » et « port équipé » dans l’interface.

Contrôler la largeur de la passe, la profondeur d’approche et les collisions avec le littoral réel. Garder l’échancrure : une enveloppe convexe reboucherait la baie.

### Tortue

Construire une silhouette continue à partir d’une carapace centrale, d’une tête, de quatre avancées côtières et d’une petite queue. Varier leurs proportions et les baies qui les séparent. Le résultat reste une côte organique, pas un polygone à angles droits ni six terres qui se touchent par un pixel.

Une composition de lobes sert au calcul de la silhouette ; l’enregistrement final conserve les contours natifs et leurs budgets. Si l’extraction et la simplification ne peuvent garder les détroits et jonctions dans 64 points, refuser la configuration ou proposer une simplification visible. Ne pas tronquer arbitrairement les points. Vérifier l’absence d’auto-intersections et la continuité réelle des attaches.

## Zones utiles et falaises

Les plateformes doivent répondre à des usages : champs sur terrain sec et accessible, port au niveau côtier, lac dans une cuvette, forêt sur versant, promontoire ou quartier sur un replat. Définir pour chaque zone un contour, une altitude cible, une pente admissible, une surface utile et une transition de bord.

La falaise est une rupture locale permettant de lire une séparation ; le biome dépend aussi du sol et de l’humidité. Tous les bords d’une zone ne deviennent pas des falaises. Prévoir une portion de pente douce ou un passage explicite. Le lac a besoin d’un bassin, de berges et d’un niveau d’eau valide : une surface plate peinte en bleu ne suffit pas.

Proposer des zones non rectangulaires, des replats de tailles différentes et des escarpements interrompus. Conserver le choix entre séparation douce, talus et falaise. Les champs peuvent être dessinés à l’intérieur d’un replat organique ; leurs parcelles agricoles peuvent ensuite avoir leur propre géométrie.

## Passages réellement praticables

Créer un graphe de zones et de points d’accès avant de tracer les chemins. Relier en priorité port, plaines cultivables, régions principales et lieux d’intérêt demandés. Vérifier la continuité et la pente sur le terrain final, y compris entre les points de contrôle.

Réutiliser `PathDefinition` pour le revêtement du chemin, mais ne pas lui attribuer un effet qu’il n’a pas : il contient actuellement des points 2D, une largeur, un matériau et un lissage, sans profil de terrassement. Un chemin dessiné sur une falaise ne devient pas une rampe.

Pour une forte montée, chercher d’abord un col ou un détour en lacets. À titre de dimensionnement, 40 m de montée à 10 % nécessitent environ 400 m de parcours horizontal ; les seuils définitifs restent à calibrer sur la locomotion du jeu. Si le relief doit être modifié, afficher une proposition de corridor de terrassement et sa différence d’altitude. L’auteur accepte la proposition avant modification de ses zones verrouillées.

Des escaliers ou ponts nécessitent des géométries et collisions adaptées, pas un simple changement de matériau de chemin. Le heightfield actuel ne représente pas plusieurs sols superposés : éviter une fausse promesse de passage sous une passerelle ou dans un tunnel.

## Parcours du Studio

1. **Composer** : choisir silhouette, relief, dimensions, zones utiles et éléments souhaités. Produire un plan auteur provisoire.
2. **Retoucher en 2D** : sélectionner côte, massif, plateforme, zone ou cours d’eau directement dans le plan. Déplacer les poignées, ajouter/retirer des sommets, déplacer une forme entière et régler sa hauteur. Aplanir une zone à la hauteur choisie ; ajuster séparément son bord et sa transition.
3. **Vérifier** : vues d’altitude, de pente, de milieux, d’eau et d’accès ; coupes locales ; diagnostics sur les points concernés. Les configurations transitoirement invalides restent éditables, mais la confirmation est bloquée par les erreurs.
4. **Créer et ouvrir** : enregistrer exactement le brouillon validé et ouvrir le Studio. Ne pas relancer le générateur depuis la seule graine à la confirmation.

La « génération finale » correspond ici à la validation et à la création du projet à partir des sources déjà calculées. Le terrain de l’aperçu doit être réel pour pouvoir vérifier les hauteurs et l’eau ; inutile de compiler tout le monde jouable, d’habiller la carte ou d’ouvrir une seconde scène 3D pendant les retouches.

## Modification des cours d’eau

Oui : sélectionner une rivière, déplacer/ajouter ses points, ajuster la largeur, déplacer une source ou choisir un nouvel exutoire. Pour un lac, modifier le contour, le niveau et les raccordements. Montrer le profil longitudinal et les erreurs localisées.

Déplacer un point ne doit pas autoriser une remontée arbitraire. Recompiler tout le réseau affecté, préserver les liens par ID et signaler les ruptures de confluence. Après une modification du relief, garder le tracé de l’auteur et proposer une correction des seuls tronçons invalides. Ne jamais remplacer silencieusement tout le réseau.

## Réutilisation du code existant

| Code actuel | Ce qu’il apporte | Adaptation |
|---|---|---|
| `studio/home-welcome.ts` | Aperçu Canvas2D et confirmation du même plan | Ajouter l’étape de brouillon éditable plutôt qu’une image interactive isolée |
| `studio/geo-map/editor.ts` | Carte par tuiles, calques, polygones, aplanissement, cache et invalidation locale | Réutiliser les outils sur une session provisoire, sans ouvrir le runtime |
| `studio/geo-map/shapes.ts` | Poignées de côte et de primitives, déplacement, insertion/suppression de points, annulation | Exposer les mêmes interactions dans le brouillon ; améliorer la sélection des zones composites |
| `studio/water-view.ts` | Tracés, lacs, profil, liens, validation WATER | Partager commandes et diagnostics ; ajouter le déplacement direct de poignées sur la carte commune |
| `studio-core/geo-edits.ts` | Corrections régionales, masques et aplanissement natifs | Paramétrer surface utile, altitude et transitions ; contrôler les effets sur les zones voisines |
| `studio-core/world-composition.ts` | Projet auteur calculé, besoins et diagnostics | Séparer génération initiale et validation du brouillon retouché |
| `studio-core/world-recomposition.ts` | Comparaison et protections des retouches | Régénération sélective par domaine, avec dépendances et verrouillage explicites |
| `world-data.ts` : `PathDefinition` | Tracé et aspect des chemins | Ajouter un planificateur d’accès et, séparément, les modifications nécessaires du terrain |

## Brouillon et propriété des modifications

Utiliser un `ProjectDocument` provisoire et les commandes communes. Ne pas créer un second format complet de carte ni une liste de coordonnées parallèle à la vraie géographie. Ajouter seulement des métadonnées auteur versionnées pour la composition, les zones d’usage, leurs liens et leur provenance.

Les métadonnées distinguent généré, retouché et verrouillé. « Regénérer l’eau » ou « Recalculer les biomes » annonce les changements et respecte les éléments verrouillés. « Autre graine » après des retouches affiche une comparaison et conserve le brouillon tant que le remplacement n’est pas appliqué.

Une manipulation continue = une commande Undo/Redo. L’édition des poignées donne un aperçu léger, puis un recalcul borné à la fin du geste. Numéroter les tâches de calcul pour qu’un résultat ancien ne remplace pas une retouche plus récente. Invalider les tuiles et diagnostics concernés, pas reconstruire tout le monde à chaque mouvement.

Conserver le brouillon après fermeture/rechargement dans un stockage de brouillons explicitement distinct des projets créés. Les aperçus sans modification ne doivent toujours pas ajouter de faux projets au catalogue. Annuler la création ne doit pas publier ni compiler une carte runtime.

## Ordre de réalisation

1. Brouillon 2D éditable : côte, formes de relief, hauteurs, sélection, historique, validation et création exacte. C’est la fondation pour corriger toutes les silhouettes, même les six styles déjà disponibles.
2. Croissant et tortue, contrôles de jonction et de baie ; réservation explicite du port.
3. Zones d’usage avec replats, bassins et transitions locales ; verrous et recalcul écologique.
4. Graphe d’accès, détours et propositions de rampes ; diagnostics de pente.
5. Édition unifiée des rivières et lacs, corrections partielles après modification du relief, puis enrichissement des ports et passages avec les assets et collisions existants.

## Critères de validation

- Croissant : baie ouverte et navigable selon le gabarit choisi, port sur terre au rivage intérieur, sans obstruction par le relief.
- Tortue : silhouette reconnaissable et organique, jonctions praticables, aucune auto-intersection ni dépassement de budget.
- Zones : surface et pente réellement compatibles avec les usages ; bassin de lac étanche et exutoire valide quand demandé ; falaises interrompues aux passages.
- Accès : pas de chemin déclaré praticable sur une paroi ; profils et collisions vérifiés sur le terrain final ; zones importantes connectées ou diagnostic explicite.
- Édition : déplacement de côte, modification d’une altitude, aplanissement et retouche d’eau visibles ; annulation et réouverture fidèles ; résultat enregistré identique au plan modifié.
- Dépendances : modifier une plateforme ne supprime ni rivière ni biome auteur ; verrous respectés ; recalculs périmés ignorés.
- Compatibilité : anciennes générations inchangées, source/import/export conservés, aucune régénération de l’île officielle dans les tests.
- Ressources : un moteur géographique, cache et tuiles existants, aucune entité par plante, pas de second contexte WebGL.
