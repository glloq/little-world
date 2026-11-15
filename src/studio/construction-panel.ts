/** Wall and bridge builders reuse the universal polyline editor and V3 undoable entities. */
import {node,button,field,select,numberInput} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import {worldAsset,placeableWorldAssets,assetDefinitionFor,colliderFor} from '../world-production/registry.ts';
import {wallModules,bridgePlan,type ModulePose} from '../studio-core/modular-construction.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {putEntity} from '../studio-core/source.ts';
import {yawQuaternion} from '../studio-core/transforms.ts';
import {terrainHeight,waterDepth} from '../terrain.ts';
export interface ConstructionContext {session:StudioSession;edit(target:PolylineTarget):void;status(text:string,error?:boolean):void}
export function mountConstructionPanel(host:HTMLElement,ctx:ConstructionContext){
  const panel=node('section','','construction-panel');
  const walls=placeableWorldAssets().filter(a=>['walls','fences'].includes(worldAsset(a.id)?.group??''));
  const bridges=placeableWorldAssets().filter(a=>worldAsset(a.id)?.group==='bridges');
  const wall=select('structure.wall_straight',walls.map(a=>[a.id,a.name] as const),()=>{});
  const bridge=select('structure.bridge_log',bridges.map(a=>[a.id,a.name] as const),()=>{});
  let clearance=1;
  const begin=(kind:'wall'|'bridge')=>{
    const id=(kind==='wall'?wall:bridge).value,asset=assetDefinitionFor(id),reg=worldAsset(id);
    if(!asset||!reg){ctx.status('Modèle de construction manquant dans le registre',true);return;}
    const length=reg.size[0];const p=ctx.session.document;
    const compute=(points:{x:number;z:number}[])=>{
      if(kind==='wall')return {poses:wallModules(points,length),warnings:[]};
      const plan=bridgePlan(points[0],points[1],length,terrainHeight,waterDepth,clearance);
      return {poses:[plan.pose],warnings:plan.warnings};
    };
    const target:PolylineTarget={label:kind==='wall'?'Construire un muret modulaire':'Installer un pont entre deux rives',
      points:[],min:2,max:kind==='wall'?50:2,color:kind==='wall'?0x92866c:0x65a9d7,
      diagnose(points){
        if(points.length<2)return null;
        try{compute(points);return null;}catch(e){return e instanceof Error?e.message:String(e);}
      },
      commit:async(points)=>{
        const result=compute(points),b=p.world.bounds;
        for(const pos of result.poses)if(pos.x<b.minX+1||pos.x>b.maxX-1||pos.z<b.minZ+1||pos.z>b.maxZ-1)throw Error('Construction hors des limites du monde');
        const ids=[...new Set(result.poses.map(pos=>chunkAt(p.world,pos.x,pos.z)))];
        const created:string[]=[];
        await ctx.session.change(kind==='wall'?'Construire un mur modulaire':'Installer un pont',ids,d=>{
          if(!d.assets[id])d.assets={...d.assets,[id]:asset};
          for(const pose of result.poses){
            const eid=crypto.randomUUID(),ownerChunkId=chunkAt(d.world,pose.x,pose.z),collider=colliderFor(id);
            putEntity(d,{id:eid,kind:'prop',name:asset.name,ownerChunkId,components:{
              Transform:{type:'Transform',position:{x:pose.x,y:pose.lift,z:pose.z},
                rotation:yawQuaternion(pose.yaw),scale:{x:pose.scaleX,y:1,z:1}},
              Visual:{type:'Visual',assetId:id},
              ...(collider?{Collider:collider}:{})
            }});created.push(eid);
          }
        });
        ctx.session.selection.setSelection(created.map(id=>({kind:'entity' as const,id})));
        ctx.status(created.length+' élément(s) construits. '+result.warnings.join(' '));
      }};
    ctx.edit(target);
  };
  panel.append(node('h4','Constructions modulaires'),
    node('p','Choisir un module du catalogue, tracer la construction dans la vue 3D, puis valider avec Entrée.','muted'),
    field('Module de mur ou clôture',wall),button('Tracer un mur / une clôture',()=>begin('wall')),
    field('Type de pont',bridge),field('Marge au-dessus du sol central (m)',numberInput(clearance,v=>clearance=Math.max(.2,Math.min(3,v)),.2,3)),
    button('Relier deux rives par un pont',()=>begin('bridge'),'primary-button'),
    node('p','Le pont adapte sa longueur dans une plage limitée et vérifie les rives et la présence d’eau. Les connexions et collisions restent à tester en jeu.','muted'));
  host.append(panel);
}
