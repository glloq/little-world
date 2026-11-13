/** E10 — « Lumières » module: place a light, attach one to the selection, night preview,
 * and the list of sources with the budget decision at the current camera (dynamic light,
 * halo, over budget, off, far). Sources of unloaded sectors are listed once hydrated. */
import {node,button,field,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import type {LightPreset} from '../studio-core/types.ts';
import {listElements,elementLabel} from '../studio-core/elements.ts';
import {setEntityLight} from '../studio-core/light-authoring.ts';
import {lightFromPreset,LIGHT_PRESETS} from '../lighting/light-data.ts';
import {placementSettings} from './viewport/placement-tool.ts';
import {PRESET_OPTIONS} from './light-inspector.ts';
import {editQueue} from './inspector.ts';
import {LIGHT_POOL} from '../world.ts';

const STATUS:Record<string,string>={dynamic:'lumière dynamique',glow:'halo',budget:'hors budget (halo)',off:'éteinte (jour / état)',far:'lointaine'};
export const lightSettings={preset:'warm-lantern' as LightPreset};
export function mountLightsPanel(host:HTMLElement,o:{session:StudioSession;viewport:StudioViewport;status(text:string,error?:boolean):void;refresh():void}):()=>void{
  const s=o.session,p=s.document,v=o.viewport;
  const night=node('input');night.type='checkbox';night.checked=v.nightPreview;night.onchange=()=>{v.setNightPreview(night.checked);draw();};
  const place=()=>{placementSettings.item={kind:'light',preset:lightSettings.preset,name:LIGHT_PRESETS[lightSettings.preset].label};v.setTool('place');o.status('Cliquez dans la vue pour placer la lumière (répétable), Échap pour terminer.');};
  const attach=()=>void editQueue.run(async()=>{
    const ids=s.selection.selection.filter(r=>r.kind==='entity'&&p.entityIndex[r.id]).map(r=>r.id);if(!ids.length)throw Error('Sélectionnez d’abord un objet ou un personnage.');
    await s.hydrate(ids.map(id=>p.entityIndex[id].ownerChunkId));
    await s.change(ids.length>1?`Ajouter ${ids.length} lumières`:'Ajouter une lumière',[...new Set(ids.map(id=>p.entityIndex[id].ownerChunkId))],d=>{for(const id of ids)setEntityLight(d,id,lightFromPreset(lightSettings.preset));});o.refresh();
  }).catch(e=>o.status(String(e instanceof Error?e.message:e),true));
  const summary=node('p','','muted light-summary'),list=node('div','','search-results light-list');
  host.append(node('div','LUMIÈRES','kicker'),node('h3','Éclairage local'),
    field('Préréglage',select(lightSettings.preset,PRESET_OPTIONS,val=>{lightSettings.preset=val as LightPreset;if(placementSettings.item.kind==='light')place();})),
    button('Placer une lumière',place,'primary-button'),button('Attacher à la sélection',attach),field('Aperçu de nuit',night),
    node('p','L’aperçu de nuit reprend les valeurs du jeu à minuit sans changer l’heure du projet. Seules les sources proches et prioritaires deviennent de vraies lumières ; les autres restent des halos.','muted'),summary,list);
  function draw(){
    const lights=listElements(p,'','light',200),counts:Record<string,number>={};list.replaceChildren();
    for(const {ref}of lights){
      const status=v.lightStatus(ref.id);counts[status]=(counts[status]??0)+1;
      const b=button(elementLabel(p,ref),()=>{s.selection.select(ref);v.focusSelection();o.refresh();},'light-button light-row'+(s.selection.selection.some(r=>r.id===ref.id)?' selected':''));
      b.dataset.status=status;b.append(node('small',' · '+STATUS[status],'status-'+status));list.append(b);
    }
    const stats=JSON.parse(v.canvas.dataset.lights??'{}') as {pool?:number;budget?:number};
    summary.textContent=`${lights.length} source(s) chargée(s) · ${counts.dynamic??0}/${stats.budget??LIGHT_POOL} lumière(s) dynamique(s) · ${counts.budget??0} hors budget`;
    summary.dataset.overBudget=String(counts.budget??0);summary.dataset.dynamic=String(counts.dynamic??0);
  }
  draw();const timer=setInterval(draw,1000);
  const stops=[s.selection.subscribe(draw),s.commands.subscribe(()=>setTimeout(draw,50))];
  return ()=>{clearInterval(timer);stops.forEach(stop=>stop());};
}
