import type {AudioDefinition} from '../audio/schema.ts';
import type {EnvironmentDefinition} from '../environment/climate.ts';
/** Authoring V3 contracts. Compiled worlds and player save slots use separate schemas. */
import type { Appearance } from '../character-style.ts';
import type { GameplayDialogue, InteractionDefinition, ActivityDefinition, VariableDefinition, ItemDefinition, ObjectiveDefinition } from '../gameplay/schema.ts';
import type { BiomeStroke, TerrainStroke, WaterBody, PathDefinition } from '../world-data.ts';
export type StableId = string;
export type ChunkId = string;
export type AssetId = string;
export type StateValue = boolean | number | string;
export interface PointXZ { x:number; z:number; }
export interface Vector3 { x:number; y:number; z:number; }
export interface Bounds { minX:number; maxX:number; minZ:number; maxZ:number; }
export interface SourceManifest { worldRef:string; chunkIndexRef:string; entityIndexRef:string; librariesRef:string; assetCatalogRef:string; }
export interface StudioProjectV3 { schemaVersion:3; projectId:StableId; worldId:StableId; name:string; assetCatalogVersion:string; createdWith:string; revision:number; sourceManifest:SourceManifest; }
export interface WorldDefinitionV3 { /** Base relief generator; absent = historical valley. */ terrain?:import('../terrain-generator.ts').TerrainGeneratorDefinition; audio?:AudioDefinition; environment?:EnvironmentDefinition; schemaVersion:3; worldId:StableId; seed:number; generatorVersion:'1'; bounds:Bounds; seaLevel:number; chunkSizeM:number; coordinateSystem:'meters-y-up'; chunkIndexRef:string; density:number; viewDistance:number; editSequence:number; }
export interface TerrainEdit extends TerrainStroke { order:number; }
export interface BiomeEdit extends BiomeStroke { order:number; }
export interface TransformComponent {type:'Transform';position:Vector3;rotation:{x:number;y:number;z:number;w:number};scale:Vector3;}
export interface VisualComponent {type:'Visual';assetId:AssetId;variant?:string;}
export interface CharacterComponent {type:'Character';species:'squirrel'|'animal';rigId:'squirrel-rigid';appearance:Appearance;}
export interface NavigationComponent {type:'Navigation';behaviorId:StableId;speed:number;radius:number;path?:PointXZ[];}
export interface BehaviorRefComponent {type:'BehaviorRef';behaviorId:StableId;}
export interface DialogueActorComponent {type:'DialogueActor';dialogueIds:StableId[];}
export interface StateComponent {type:'State';initial:Record<string,StateValue>;}
export interface PersistenceComponent {type:'Persistence';fields:string[];}
export interface InteractableComponent {type:'Interactable';prompt:string;range:number;interactionIds:StableId[];}
export interface ColliderComponent {type:'Collider';shape:'box'|'sphere';size:Vector3;layer:'solid'|'trigger';}
export interface AnimatorComponent {type:'Animator';clips:string[];initialClip?:string;}
/** E10 — local light, independent of any GLB: on its own entity or attached to an object/NPC
 * (offset in the entity's local frame). Point lights only; no shadow map. */
export type LightMode='always'|'night'|'state';
export type LightPreset='warm-lantern'|'flickering-fire'|'fixed-lamp'|'cold-light';
export interface LightComponent {type:'Light';kind:'point';color:string;intensity:number;range:number;offset:Vector3;enabled:boolean;mode:LightMode;
  /** mode 'state': boolean entity state that switches the light (e.g. « allumee »). */
  stateKey?:string;
  /** Deterministic low-frequency flicker: amplitude 0–1, speed in variations per second. */
  flicker?:{amplitude:number;speed:number};preset?:LightPreset;}
export interface TriggerVolumeComponent {type:'TriggerVolume';shape:'box'|'sphere';size:Vector3;interactionIds:StableId[];}
export interface ComponentMap {
  Transform?:TransformComponent;Visual?:VisualComponent;Character?:CharacterComponent;Navigation?:NavigationComponent;
  BehaviorRef?:BehaviorRefComponent;DialogueActor?:DialogueActorComponent;State?:StateComponent;Persistence?:PersistenceComponent;
  Interactable?:InteractableComponent;Collider?:ColliderComponent;Animator?:AnimatorComponent;TriggerVolume?:TriggerVolumeComponent;Light?:LightComponent;
}
export type ComponentName = keyof ComponentMap;
export interface PrefabOverride {component:ComponentName;field:string;value:unknown;}
export interface EntityDefinitionV3 {id:StableId;kind:'prop'|'building'|'character'|'trigger'|'effect';name:string;ownerChunkId:ChunkId;parentId?:StableId;prefabId?:StableId;variantId?:StableId;components:ComponentMap;overrides?:PrefabOverride[];}
export interface PrefabDefinitionV3 {id:StableId;version:number;name:string;components:ComponentMap;variants?:Record<string,PrefabOverride[]>;}
export type DialogueDefinitionV3 = GameplayDialogue;
export interface BehaviorDefinition {id:StableId;kind:'idle'|'wander'|'patrol'|'work';}
export interface CharacterDefinition {id:StableId;name:string;species:'squirrel'|'animal';rigId:'squirrel-rigid';appearance:Appearance;}
/** Only actually implemented declarative gameplay registries are populated. */
export interface ProjectLibraries {
  prefabs:Record<StableId,PrefabDefinitionV3>;
  characters:Record<StableId,CharacterDefinition>;
  dialogues:Record<StableId,DialogueDefinitionV3>;
  behaviors:Record<StableId,BehaviorDefinition>;
  interactions:Record<StableId,InteractionDefinition>;
  activities:Record<StableId,ActivityDefinition>;
  variables:Record<StableId,VariableDefinition>;
  items:Record<StableId,ItemDefinition>;
  objectives:Record<StableId,ObjectiveDefinition>;
  water:Record<StableId,WaterBody>;
  paths:Record<StableId,PathDefinition>;
  /** Activity zone boundaries (farm plots, mines). Optional: older projects have none. */
  zones?:Record<StableId,ActivityZoneV3>;
}
export interface ActivityZoneV3 {id:StableId;kind:'farm-plot'|'mine';name:string;polygon:PointXZ[];levels?:number;
  /** Mine settings (levels, entrance, stairs, geology). Optional: defaults derived at compile time. */
  mine?:import('../mine/mine-data.ts').MineSettingsV3;
  /** Farm plot settings (crops, rows, soil, irrigation). Optional: defaults derived at compile time. */
  farm?:import('../farm/farm-data.ts').FarmSettingsV3;}
export interface AssetDefinition {id:AssetId;name:string;type:'glb'|'procedural';file?:string;license:string;source:string;}
export interface EntityIndexEntry {id:StableId;kind:EntityDefinitionV3['kind'];name:string;ownerChunkId:ChunkId;position:Vector3;references:StableId[];logical?:{position?:Vector3;initialState?:Record<string,StateValue>;persistentState?:string[];interactable?:{prompt:string;range:number;interactionIds:string[]}};}
export interface ChunkMetadata {chunkId:ChunkId;cx:number;cz:number;revision:number;sourceRef:string;dependencies:ChunkId[];terrainOwners?:Record<StableId,ChunkId>;biomeOwners?:Record<StableId,ChunkId>;}
export interface ChunkSourceV3 {
  schemaVersion:3;chunkId:ChunkId;index:{cx:number;cz:number};revision:number;
  entities:Record<StableId,EntityDefinitionV3>;entityIds:StableId[];
  terrainEdits:TerrainEdit[];terrainRefs:StableId[];biomeEdits:BiomeEdit[];biomeRefs:StableId[];
  waterRefs:StableId[];pathRefs:StableId[];
  /** Geography corrections of this sector (16×16 cell masks per layer). Optional. */
  layers?:import('../geography/layers.ts').SectorLayers;
}
/** chunks is a loaded source cache; indexes and libraries remain available globally. */
export interface ProjectDocument {
  manifest:StudioProjectV3;world:WorldDefinitionV3;
  chunkIndex:Record<ChunkId,ChunkMetadata>;entityIndex:Record<StableId,EntityIndexEntry>;
  libraries:ProjectLibraries;assets:Record<AssetId,AssetDefinition>;chunks:Record<ChunkId,ChunkSourceV3>;
}
export interface MigrationReport {fromVersion:1|2;toVersion:3;projectId:string;worldId:string;counts:{entities:number;terrainEdits:number;biomeEdits:number;water:number;paths:number;dialogues:number;chunks:number};preservedIds:string[];warnings:string[];}
export interface Diagnostic {severity:'ERROR'|'WARNING'|'INFO';code:string;message:string;id?:string;chunkId?:string;module?:string;}
