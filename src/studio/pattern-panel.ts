/** Placement patterns reuse the V3 source, same registry and CommandBus as manual placement. */
import {node,button,field,numberInput} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import {placementSettings} from './viewport/placement-tool.ts';
import {linePattern,areaPattern,type PatternPoint} from '../studio-core/placement-patterns.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {putEntity} from '../studio-core/source.ts';
import {yawQuaternion} from '../studio-core/transforms.ts';
import {assetDefinitionFor,colliderFor} from '../world-production/registry.ts';
import {terrainHeight,waterDepth} from '../terrain.ts';
import {checkPlacement} from './viewport/placement-rules.ts';
const settings={spacing:5,yawOffset:0,protect:true};
export interface PatternPanelContext {
  session:StudioSession;
  edit(target:PolylineTarget):void;
  status(message:string,error?:boolean):void;
}
function createPatternTarget(ctx:PatternPanelContext,mode:'line'|'area'):PolylineTarget{
  const item=placementSettings.item;
  if(item.kind!=='asset')throw Error('Choisir un modèle 3D dans la bibliothèque avant le tracé');
  const p=ctx.session.document,asset=p.assets[item.id]??assetDefinitionFor(item.id);
  if(!asset)throw Error('Modèle 3D inconnu : '+item.id);
  const space=settings.spacing,offset=settings.yawOffset*Math.PI/180,protect=settings.protect;
  const pointsFrom=(points:{x:number;z:number}[])=>mode==='line'?linePattern(points,space):areaPattern(points,space);
  const commit=async(points:{x:number;z:number}[])=>{
    const samples=pointsFrom(points),accepted:PatternPoint[]=[],reasons=new Set<string>(),building=item.id.startsWith('architecture.');
    for(const pos of samples){
      const result=checkPlacement(p,pos.x,pos.z,{ground:terrainHeight,depth:waterDepth,building,radius:building?4:1});
      if(result.level==='invalid'||(protect&&result.level==='warning')){reasons.add(result.reason);continue;}
      // Prevent the repeated elements from intersecting each other.
      if(protect&&accepted.some(old=>Math.hypot(pos.x-old.x,pos.z-old.z)<space*.7)){reasons.add('Espacement entre objets');continue;}
      accepted.push(pos);
    }
    if(!accepted.length)throw Error('Aucun emplacement compatible. '+[...reasons].slice(0,3).join(' · '));
    const chunks=[...new Set(accepted.map(pos=>chunkAt(p.world,pos.x,pos.z)))],created:string[]=[];
    await ctx.session.change((mode==='line'?'Aligner ':'Remplir une zone avec ')+asset.name,chunks,draft=>{
      if(!draft.assets[item.id])draft.assets={...draft.assets,[item.id]:asset};
      for(const pos of accepted){
        const id=crypto.randomUUID(),ownerChunkId=chunkAt(draft.world,pos.x,pos.z);
        putEntity(draft,{id,kind:building?'building':'prop',name:asset.name,ownerChunkId,components:{
          Transform:{type:'Transform',position:{x:pos.x,y:0,z:pos.z},rotation:yawQuaternion(pos.yaw+offset),
            scale:{x:1,y:1,z:1}},
          Visual:{type:'Visual',assetId:item.id},
          ...(colliderFor(item.id)?{Collider:colliderFor(item.id)!}:{})
        }});created.push(id);
      }
    });
    ctx.session.selection.setSelection(created.map(id=>({kind:'entity',id})));
    ctx.status(created.length+' exemplaires créés en une opération ; '+(samples.length-accepted.length)+' emplacement(s) ignoré(s).');
  };
  return {label:mode==='line'?'Répétition le long d’un tracé':'Remplissage régulier d’une zone',points:[],min:mode==='line'?2:3,max:50,
    closed:mode==='area',color:0x7cbf83,diagnose(points){
      if(points.length<(mode==='line'?2:3))return null;
      try{return pointsFrom(points).length+' objets prévus avant contrôles de placement';}
      catch(e){return String(e instanceof Error?e.message:e);}
    },commit};
}
export function mountPatternPanel(host:HTMLElement,ctx:PatternPanelContext):void{
  const panel=node('section','','pattern-panel');
  const start=(mode:'line'|'area')=>{
    try{ctx.edit(createPatternTarget(ctx,mode));}catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}
  };
  const protect=node('input');protect.type='checkbox';protect.checked=settings.protect;
  protect.onchange=()=>{settings.protect=protect.checked;};
  panel.append(node('h4','Placement assisté de séries'),
    node('p','Choisir un objet dans la bibliothèque, tracer une ligne pour clôtures, haies ou chemins décorés ; tracer un polygone pour répartir régulièrement des objets.','muted'),
    field('Espacement entre objets (m)',numberInput(settings.spacing,v=>settings.spacing=Math.max(.5,Math.min(100,v||5)),.5,100)),
    field('Décalage de rotation (°)',numberInput(settings.yawOffset,v=>settings.yawOffset=Math.max(-180,Math.min(180,v||0)),-180,180)),
    field('Éviter les chevauchements et les fortes pentes',protect),
    button('Répéter sur une ligne',()=>start('line'),'primary-button'),
    button('Remplir un polygone',()=>start('area')),
    node('p','2 à 50 sommets selon le tracé, au maximum 160 objets par opération. Clic : point · Entrée : valider · Échap : abandonner.','muted'));
  host.append(panel);
}
