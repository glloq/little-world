/** E10 — Light component of the selected entity: preset, colour, intensity, range, height,
 * activation mode, flicker; add / remove. Every change is one undoable transaction. */
import {node,button,field,numberInput,select} from './dom.ts';
import type {InspectorContext} from './inspector.ts';
import {editQueue} from './inspector.ts';
import type {LightComponent,LightPreset,ProjectDocument} from '../studio-core/types.ts';
import {setEntityLight,updateEntityLight,applyLightPreset} from '../studio-core/light-authoring.ts';
import {lightFromPreset,LIGHT_PRESETS,LIGHT_PRESET_IDS} from '../lighting/light-data.ts';

const MODES:[string,string][]=[['always','Toujours allumée'],['night','La nuit (transition progressive)'],['state','Selon un état de l’objet']];
export const PRESET_OPTIONS:[string,string][]=LIGHT_PRESET_IDS.map(id=>[id,LIGHT_PRESETS[id].label]);
export function lightSection(ctx:InspectorContext,id:string,light:LightComponent|undefined):HTMLElement{
  const s=ctx.session,p=s.document,box=node('fieldset','','light-card');box.append(node('legend','Lumière'));
  const owner=()=>[p.entityIndex[id].ownerChunkId];
  const run=(label:string,edit:(d:ProjectDocument)=>void)=>void editQueue.run(async()=>{await s.change(label,owner(),edit);ctx.refresh();}).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true));
  if(!light){
    let preset:LightPreset='warm-lantern';
    box.append(node('p','Ajoutez une source lumineuse à cet élément (indépendante de son modèle 3D).','muted'),field('Préréglage',select(preset,PRESET_OPTIONS,v=>preset=v as LightPreset)),
      button('Ajouter une lumière',()=>run('Ajouter une lumière',d=>setEntityLight(d,id,lightFromPreset(preset))),'primary-button'));
    return box;
  }
  const patch=(label:string,value:Parameters<typeof updateEntityLight>[2])=>run(label,d=>updateEntityLight(d,id,value));
  const color=node('input');color.type='color';color.value=light.color;color.onchange=()=>patch('Couleur de la lumière',{color:color.value.toLowerCase()});
  const enabled=node('input');enabled.type='checkbox';enabled.checked=light.enabled;enabled.onchange=()=>patch(enabled.checked?'Allumer la lumière':'Éteindre la lumière',{enabled:enabled.checked});
  box.append(field('Préréglage',select(light.preset??'',[['','Personnalisé'],...PRESET_OPTIONS],v=>{if(v)run('Préréglage de lumière',d=>applyLightPreset(d,id,v as LightPreset));})),
    field('Active',enabled),field('Couleur',color),
    field('Intensité (cd)',numberInput(light.intensity,v=>patch('Intensité de la lumière',{intensity:Math.max(0,Math.min(200,v))}),0,200,'1')),
    field('Portée (m)',numberInput(light.range,v=>patch('Portée de la lumière',{range:Math.max(.5,Math.min(60,v))}),.5,60,'.5')),
    field('Hauteur de la source (m)',numberInput(light.offset.y,v=>patch('Hauteur de la lumière',{offset:{...light.offset,y:Math.max(-50,Math.min(50,v))}}),-50,50,'.1')),
    field('Allumage',select(light.mode,MODES,v=>patch('Mode de la lumière',{mode:v as LightComponent['mode'],...(v==='state'?{stateKey:light.stateKey??'allumee'}:{})}))));
  if(light.mode==='state'){const key=node('input');key.value=light.stateKey??'';key.onchange=()=>{if(key.value.trim())patch('État de la lumière',{stateKey:key.value.trim()});};box.append(field('État (booléen) qui l’allume',key));}
  box.append(field('Vacillement (0 = fixe)',numberInput(light.flicker?.amplitude??0,v=>patch('Vacillement de la lumière',{flicker:{amplitude:Math.max(0,Math.min(1,v)),speed:light.flicker?.speed??1.2}}),0,1,'.05')),
    node('p','Pas d’ombre portée pour les lumières locales. Seules les sources les plus proches deviennent de vraies lumières, les autres un halo.','muted'),
    button('Retirer la lumière',()=>run('Retirer la lumière',d=>setEntityLight(d,id,null))));
  return box;
}
