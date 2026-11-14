/** World Production V1 — authoring usage of the Little World asset library (WP-1).
 * Hand-maintained table merged with the technical inventory of the real GLB files by
 * `tools/build-world-assets.mjs` into `assets/world-assets.json` (single catalogue for manual
 * placement, landscape presets and biotope generation). Technical facts (triangles, bounds,
 * hashes, LOD) are NEVER written here: they are measured from the files.
 * Pure data, no import: also loaded by Node tools. */
export const REGISTRY_VERSION='1';
export type BiotopeId='temperate-forest'|'prairie'|'humid-valley'|'marsh'|'mountain'|'heath'|'sandy-coast'|'rocky-coast'|'volcanic'|'dry-zone';
/** Superimposed land uses (occupations / amenities), never exclusive biomes. */
export type AmenityId='village'|'orchard'|'ruins'|'riverbank'|'cliff-foot'|'dune'|'town'|'castle'|'port'|'mine'|'forest-camp';
export type AssetRole='tree'|'shrub'|'ground'|'deadwood'|'hedge'|'fence'|'wall'|'bridge'|'dock'|'building'|'boat'|'legacy'|'landmark'|'rock'|'counter'|'prop';
export type PlacementKind='scatter'|'cluster'|'line'|'anchor'|'manual';
/** Logical collision wished at runtime (independent from the visual LOD). */
export type CollisionKind='none'|'trunk'|'box'|'footprint';
/** Far silhouette family used when the GLB LODs are not drawn (≥ mid distance). */
export type CrownShape='cone'|'round'|'palm'|'bare';
export type RuntimeStatus='INVENTORIED'|'INTEGRATED';
export interface AssetUsage {
  role:AssetRole;placement:PlacementKind;collision:CollisionKind;
  /** Drawn with the shared instanced dressing renderer (one batch for all species). */
  instancing:boolean;
  /** Ground radius kept free around one instance (m, at scale 1). */
  footprintM:number;
  /** Uniform scale range applied by generators (GLB stays untouched). */
  scale:[number,number];
  crown?:CrownShape;
  habitats:(BiotopeId|AmenityId)[];
  runtimeStatus:RuntimeStatus;
  maxTriangles?:number;notes?:string;
}
const tree=(habitats:AssetUsage['habitats'],crown:CrownShape,scale:[number,number],notes?:string):AssetUsage=>({role:'tree',placement:'cluster',collision:'trunk',instancing:true,footprintM:1.2,scale,crown,habitats,runtimeStatus:'INTEGRATED',...(notes?{notes}:{})});
const small=(role:AssetRole,habitats:AssetUsage['habitats'],scale:[number,number],placement:PlacementKind='scatter',collision:CollisionKind='none'):AssetUsage=>({role,placement,collision,instancing:true,footprintM:.5,scale,habitats,runtimeStatus:'INTEGRATED'});
const built=(role:AssetRole,footprintM:number,habitats:AssetUsage['habitats'],placement:PlacementKind,collision:CollisionKind,maxTriangles?:number,notes?:string):AssetUsage=>({role,placement,collision,instancing:false,footprintM,scale:[1,1],habitats,runtimeStatus:'INTEGRATED',...(maxTriangles?{maxTriangles}:{}),...(notes?{notes}:{})});
export const ASSET_USAGE:Record<string,AssetUsage>={
  // Trees (GLB ≈ 4–7 m at scale 1: generators scale them to forest heights).
  'nature.broadleaf_round':tree(['temperate-forest','humid-valley','prairie','riverbank','village'],'round',[1.3,2]),
  'nature.broadleaf_tall':tree(['temperate-forest','humid-valley','riverbank'],'round',[1.2,1.7]),
  'nature.hazel_thin':tree(['temperate-forest','humid-valley','riverbank','prairie'],'round',[1,1.5]),
  'nature.sapling_thin':tree(['temperate-forest','prairie','humid-valley'],'round',[.9,1.4],'Jeunes arbres en lisière et clairières.'),
  'nature.leafless_tree':tree(['mountain','marsh','heath','volcanic'],'bare',[1,1.5],'Arbres morts sur pied : altitude, marais, cendres.'),
  'nature.dead_tree_twisted':tree(['mountain','heath','volcanic','dry-zone','ruins'],'bare',[.9,1.4]),
  'nature.palm_thin':tree(['sandy-coast'],'palm',[1.2,1.7],'Uniquement si le paysage l’autorise explicitement (preset « sandy-beach », option palmiers).'),
  'nature.palm_curved':tree(['sandy-coast'],'palm',[1.1,1.5],'Idem palm_thin.'),
  'nature.fruit_apple':tree(['orchard','village'],'round',[1,1.3]),
  'nature.fruit_pear':tree(['orchard','village'],'round',[1,1.3]),
  'nature.fruit_plum':tree(['orchard','village'],'round',[1,1.3]),
  'nature.fruit_cherry':tree(['orchard','village','prairie'],'round',[1,1.3]),
  'nature.pine':{...tree(['mountain','temperate-forest','rocky-coast','heath'],'cone',[.8,1.25],'Sapin historique (20 triangles, 2 matériaux, sans couleurs de sommets) : seul conifère disponible. Famille « conifères » insuffisamment couverte.'),runtimeStatus:'INTEGRATED'},
  // Shrubs.
  'nature.bush_small':small('shrub',['temperate-forest','prairie','humid-valley','heath','village'],[.8,1.4],'cluster'),
  'nature.bush_asym':small('shrub',['temperate-forest','heath','mountain','rocky-coast','dry-zone'],[.8,1.3],'cluster'),
  'nature.bush_round':small('shrub',['prairie','village','sandy-coast','dune'],[.9,1.5],'cluster'),
  'nature.bush_irregular':small('shrub',['heath','mountain','rocky-coast','volcanic','dry-zone'],[.9,1.4],'cluster'),
  'nature.shrub_flowering':small('shrub',['prairie','village','humid-valley'],[.8,1.2],'cluster'),
  'nature.shrub_flower':small('shrub',['prairie','village','temperate-forest'],[.8,1.2],'cluster'),
  // Ground flora (short-ranged, never shadows, no CPU animation).
  'nature.fern_small':small('ground',['temperate-forest','humid-valley','riverbank','marsh'],[.8,1.4]),
  'nature.wildflowers_patch':small('ground',['prairie','humid-valley','village','orchard'],[.7,1.2]),
  'nature.flowers_tall':small('ground',['prairie','humid-valley'],[.7,1.1]),
  'nature.mushrooms_patch':small('ground',['temperate-forest','marsh'],[.6,1]),
  'nature.mushroom_tall':small('ground',['temperate-forest'],[.5,.9]),
  'nature.moss_patch':small('ground',['temperate-forest','marsh','humid-valley','riverbank','ruins','cliff-foot'],[.8,1.6]),
  'nature.reeds_patch':small('ground',['marsh','riverbank','humid-valley','dune'],[.8,1.3]),
  'nature.broadleaf_plant':small('ground',['temperate-forest','humid-valley','riverbank','sandy-coast','dune'],[.7,1.2]),
  // Deadwood.
  'nature.stump_simple':small('deadwood',['temperate-forest','mountain','heath','marsh'],[.8,1.2],'scatter','box'),
  'nature.stump_mossy':small('deadwood',['temperate-forest','marsh','humid-valley','ruins'],[.8,1.2],'scatter','box'),
  'nature.log_fallen':small('deadwood',['temperate-forest','humid-valley','sandy-coast','riverbank'],[.9,1.4],'scatter','box'),
  'nature.rock':{role:'legacy',placement:'scatter',collision:'box',instancing:false,footprintM:1.2,scale:[1,1],habitats:['mountain','cliff-foot'],runtimeStatus:'INTEGRATED',notes:'Rocher historique 8 triangles ; l’habillage utilise des rochers procéduraux instanciés (famille rochers/falaises insuffisante).'},
  // Enclosures (lines of modules, 2 m grid).
  'nature.hedge_low':{...small('hedge',['village','orchard','prairie'],[1,1],'line','box'),footprintM:1},
  'nature.hedge_dense':{...small('hedge',['village','orchard','prairie'],[1,1],'line','box'),footprintM:1},
  'structure.fence_split_rail':built('fence',.3,['village','orchard','prairie'],'line','box'),
  'structure.fence_picket':built('fence',.3,['village'],'line','box'),
  'structure.fence_pasture':built('fence',.3,['village','prairie','orchard'],'line','box'),
  'structure.fence_gate':built('fence',.3,['village','orchard'],'line','none'),
  'structure.post_rustic':built('fence',.2,['village','prairie'],'line','box'),
  'structure.post_square':built('fence',.2,['village'],'line','box'),
  'structure.wall_straight':built('wall',.4,['village','ruins','prairie'],'line','box'),
  'structure.wall_corner':built('wall',.6,['village','ruins'],'line','box'),
  'structure.wall_end':built('wall',.4,['village','ruins'],'line','box'),
  'structure.wall_irregular':built('wall',.4,['ruins','mountain','prairie'],'line','box'),
  'structure.wall_moss':built('wall',.4,['ruins','temperate-forest','humid-valley'],'line','box'),
  // Bridges and dock: anchored on banks / shore, never scattered.
  'structure.bridge_log':built('bridge',2.2,['riverbank'],'anchor','footprint'),
  'structure.bridge_wooden_arch':built('bridge',3,['riverbank','village'],'anchor','footprint'),
  'structure.bridge_stone':built('bridge',4.2,['riverbank','village'],'anchor','footprint'),
  'structure.dock_tile':built('dock',1,['sandy-coast','village'],'line','footprint'),
  'structure.dock_post':built('dock',.2,['sandy-coast','village'],'manual','box'),
  'structure.dock_ramp':built('dock',1,['sandy-coast','village'],'manual','footprint'),
  'structure.dock_bollard':built('dock',.3,['sandy-coast','village'],'manual','box'),
  'structure.dock_ladder':built('dock',.3,['sandy-coast','village'],'manual','none'),
  // Buildings: anchored on flat ground, exclude dense vegetation around their footprint.
  'architecture.wooden_cabin':built('building',5,['village','temperate-forest','mountain'],'anchor','footprint'),
  'architecture.stone_house':built('building',5.5,['village','ruins'],'anchor','footprint'),
  // Boats (doc 42 §H2): the player's boat wears the sailboat; both are moored in the ports.
  'boat.sailboat_small':built('boat',3,['sandy-coast','rocky-coast'],'manual','none'),
  'boat.rowboat_wood':built('boat',3,['sandy-coast','rocky-coast','riverbank'],'manual','none'),
  'architecture.lighthouse':built('building',4.5,['rocky-coast','sandy-coast'],'anchor','footprint',3000,'2 672 triangles en LOD0 : réservé aux points de vue remarquables.'),
  'architecture.windmill_stone':built('building',6.5,['village','prairie'],'anchor','footprint'),
  'architecture.watermill_log_stone':built('building',5.5,['village','riverbank'],'anchor','footprint'),
  // World kit (project-generated, art review pending): town, landmarks, counters, rocks, conifers.
  'architecture.inn':built('building',6.5,['town','village'],'anchor','footprint'),
  'architecture.house_timber':built('building',4.5,['town','village'],'anchor','footprint'),
  'architecture.house_blue':built('building',4,['port','village'],'anchor','footprint'),
  'architecture.farmhouse':built('building',8,['village','prairie'],'anchor','footprint'),
  'architecture.watchtower':built('landmark',3.4,['mountain','rocky-coast','town','castle'],'anchor','footprint'),
  'architecture.castle_keep':built('landmark',9,['castle'],'anchor','footprint'),
  'structure.castle_wall':built('wall',1.4,['castle','town'],'line','box'),
  'structure.castle_tower':built('landmark',3.4,['castle','town'],'anchor','footprint'),
  'structure.castle_gate':built('landmark',5,['castle','town'],'anchor','footprint'),
  'architecture.church':built('landmark',8,['town','village'],'anchor','footprint'),
  'architecture.cathedral':built('landmark',14,['town'],'anchor','footprint'),
  'landmark.world_tree':built('landmark',7,['temperate-forest','humid-valley'],'anchor','footprint',1000),
  'nature.conifer_tall':{...tree(['mountain','temperate-forest','heath','rocky-coast'],'cone',[.9,1.4],'Conifère du kit généré (comble la famille conifères).'),runtimeStatus:'INTEGRATED'},
  'nature.conifer_wide':{...tree(['mountain','temperate-forest','heath'],'cone',[.9,1.3]),runtimeStatus:'INTEGRATED'},
  'nature.boulder_large':built('rock',3.2,['mountain','cliff-foot','prairie','heath','volcanic'],'scatter','box'),
  'nature.boulder_pile':built('rock',3.5,['mountain','cliff-foot','rocky-coast','heath'],'scatter','box'),
  'nature.rock_spire':built('rock',2.6,['mountain','rocky-coast','volcanic'],'anchor','box'),
  'nature.rock_arch':built('landmark',7,['rocky-coast','mountain','dry-zone'],'anchor','footprint'),
  'nature.cliff_block':built('rock',4.5,['mountain','rocky-coast','cliff-foot'],'anchor','box'),
  'landmark.cave_entrance':built('landmark',6,['mountain','rocky-coast','mine'],'anchor','footprint'),
  'landmark.standing_stones':built('landmark',7,['prairie','heath','ruins'],'anchor','none'),
  'landmark.ruined_tower':built('landmark',4,['ruins','heath','mountain'],'anchor','footprint'),
  'landmark.obelisk':built('landmark',1.6,['ruins','town'],'anchor','box'),
  'structure.market_stall':built('counter',1.8,['town','village','port'],'anchor','box'),
  'structure.counter_mine':built('counter',1.8,['mine'],'anchor','box'),
  'structure.counter_forest':built('counter',2.2,['forest-camp','temperate-forest'],'anchor','box'),
  'structure.counter_port':built('counter',1.8,['port'],'anchor','box'),
  'structure.well':built('prop',1.3,['town','village'],'anchor','box'),
  'structure.lamp_post':built('prop',.3,['town','village','port'],'manual','box'),
  'structure.signpost':built('prop',.3,['town','village','prairie'],'manual','none'),
  'structure.barrel':built('prop',.5,['town','port','village'],'manual','box'),
  'structure.crate_stack':built('prop',1,['town','port','mine'],'manual','box'),
  'structure.chest':built('prop',.7,['town','forest-camp','castle'],'manual','box'),
  'structure.bench':built('prop',1,['town','village'],'manual','none'),
  'structure.fountain':built('prop',2.6,['town'],'anchor','box'),
  'structure.palisade':built('wall',.4,['village','forest-camp','castle'],'line','box'),
  'structure.pier_hut':built('building',3,['port','marsh'],'anchor','footprint'),
};
