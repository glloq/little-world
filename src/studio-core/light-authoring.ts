/** E10 — authoring of Light components (pure, inside CommandBus transactions).
 * A light lives on its own entity (kind « effect », no GLB) or on an existing object/NPC. */
import type {LightComponent,LightPreset,ProjectDocument} from './types.ts';
import {putEntity} from './source.ts';
import {chunkAt} from './schema.ts';
import {lightFromPreset,LIGHT_PRESETS} from '../lighting/light-data.ts';

function source(draft:ProjectDocument,id:string){
  const entry=draft.entityIndex[id];if(!entry)throw Error('Entité inconnue : '+id);
  const e=draft.chunks[entry.ownerChunkId]?.entities[id];if(!e)throw Error('Charger le secteur avant modification');return structuredClone(e);
}
/** Add, replace (light) or remove (null) the Light component of an entity. */
export function setEntityLight(draft:ProjectDocument,id:string,light:LightComponent|null){
  const e=source(draft,id);if(light)e.components.Light=structuredClone(light);else delete e.components.Light;putEntity(draft,e);
}
export function updateEntityLight(draft:ProjectDocument,id:string,patch:Partial<Omit<LightComponent,'type'|'kind'>>){
  const e=source(draft,id),current=e.components.Light;if(!current)throw Error('Cette entité ne porte pas de lumière');
  const next:LightComponent={...current,...structuredClone(patch)};if(next.mode!=='state')delete next.stateKey;if(next.flicker&&next.flicker.amplitude<=0)delete next.flicker;
  // A manual change detaches the preset label unless the values still match it exactly.
  if(next.preset&&!matchesPreset(next,next.preset))delete next.preset;
  e.components.Light=next;putEntity(draft,e);
}
export function applyLightPreset(draft:ProjectDocument,id:string,preset:LightPreset){
  const e=source(draft,id),current=e.components.Light,base=lightFromPreset(preset,current?.offset.y);
  e.components.Light={...base,offset:current?{...current.offset}:base.offset,enabled:current?.enabled??true};putEntity(draft,e);
}
function matchesPreset(l:LightComponent,preset:LightPreset){const p=LIGHT_PRESETS[preset];return l.color===p.color&&l.intensity===p.intensity&&l.range===p.range&&l.mode===p.mode&&JSON.stringify(l.flicker??null)===JSON.stringify(p.flicker??null);}
/** Free-standing light (no model): an « effect » entity with Transform + Light. */
export function createLightEntity(draft:ProjectDocument,o:{id:string;name:string;x:number;z:number;preset:LightPreset}){
  const owner=chunkAt(draft.world,o.x,o.z);
  putEntity(draft,{id:o.id,name:o.name,kind:'effect',ownerChunkId:owner,components:{Transform:{type:'Transform',position:{x:o.x,y:0,z:o.z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Light:lightFromPreset(o.preset)}});
  return owner;
}
