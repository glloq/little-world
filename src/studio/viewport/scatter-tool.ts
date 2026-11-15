/** Bounded deterministic multi-asset placement brush.
 * One drag commits one V3 transaction; no per-frame world state is serialized. */
import * as THREE from 'three';
import {chunkAt} from '../../studio-core/schema.ts';
import {putEntity} from '../../studio-core/source.ts';
import {yawQuaternion} from '../../studio-core/transforms.ts';
import {assetDefinitionFor,colliderFor} from '../../world-production/registry.ts';
import {terrainHeight,waterDepth} from '../../terrain.ts';
import {checkPlacement} from './placement-rules.ts';
import type {Tool,ToolContext} from './tools.ts';
import {strokeDabs,type Dab} from './brush-tool.ts';
export const scatterSettings={
  palette:[] as string[],radius:12,density:.035,scaleMin:.85,scaleMax:1.15,seed:4242,
  spacing:2.5
};
export interface ScatterPoint {x:number;z:number;assetId:string;yaw:number;scale:number}
const hash=(x:number)=>{x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return (x^(x>>>16))>>>0;};
const random=(seed:number)=>()=>{seed=hash(seed+0x9e3779b9);return seed/4294967296;};
export function scatterPoints(dabs:Dab[],settings:typeof scatterSettings,max=120):ScatterPoint[]{
  const palette=[...new Set(settings.palette)].filter(Boolean);if(!palette.length)return [];
  const radius=Math.max(1,Math.min(80,settings.radius)),spacing=Math.max(.5,settings.spacing);
  const points:ScatterPoint[]=[],used=new Set<string>();
  for(let i=0;i<dabs.length&&points.length<max;i++){
    const dab=dabs[i],r=random(hash((settings.seed|0)^hash(Math.round(dab.x*10))^hash(Math.round(dab.z*10))));
    const attempts=Math.min(100,Math.ceil(Math.PI*radius*radius*Math.max(.001,settings.density)));
    for(let j=0;j<attempts&&points.length<max;j++){
      const a=r()*Math.PI*2,dist=Math.sqrt(r())*radius,x=dab.x+Math.cos(a)*dist,z=dab.z+Math.sin(a)*dist;
      const key=Math.round(x/spacing)+':'+Math.round(z/spacing);
      if(used.has(key)||points.some(p=>Math.hypot(p.x-x,p.z-z)<spacing))continue;
      used.add(key);points.push({x,z,assetId:palette[Math.floor(r()*palette.length)],yaw:r()*Math.PI*2,
        scale:settings.scaleMin+r()*(settings.scaleMax-settings.scaleMin)});
    }
  }
  return points;
}
export class ScatterTool implements Tool {
  readonly id='scatter';readonly cursor='crosshair';
  private ctx!:ToolContext;private ring:THREE.Mesh|null=null;private painting=false;private pending:Dab[]=[];
  private busy=false;
  activate(ctx:ToolContext){
    this.ctx=ctx;this.ring=new THREE.Mesh(new THREE.RingGeometry(.96,1,48).rotateX(-Math.PI/2),
      new THREE.MeshBasicMaterial({color:0x78c787,transparent:true,opacity:.85,side:THREE.DoubleSide,depthTest:false}));
    this.ring.renderOrder=40;this.ring.visible=false;ctx.scene.add(this.ring);
  }
  deactivate(){if(this.ring){this.ring.geometry.dispose();(this.ring.material as THREE.Material).dispose();this.ring.removeFromParent();this.ring=null;}this.pending=[];this.painting=false;}
  pointerMove(e:PointerEvent){
    const p=this.ctx.ground(e);if(this.ring){this.ring.visible=!!p;if(p){this.ring.position.set(p.x,p.y+.3,p.z);this.ring.scale.setScalar(scatterSettings.radius);}}
    if(this.painting&&p&&(e.buttons&1))this.pending.push({x:p.x,z:p.z});
    this.ctx.invalidate(2);
  }
  pointerDown(e:PointerEvent){if(e.button!==0||this.busy)return;const p=this.ctx.ground(e);if(p){this.painting=true;this.pending=[{x:p.x,z:p.z}];}}
  pointerUp(e:PointerEvent){if(e.button!==0||!this.painting)return;this.painting=false;
    const dabs=strokeDabs(this.pending,scatterSettings.radius,24);this.pending=[];
    const points=scatterPoints(dabs,scatterSettings);if(!points.length){this.ctx.message('Palette vide : ajoutez des assets.');return;}
    this.busy=true;this.ctx.run(async()=>{try{
      const s=this.ctx.session,p=s.document;
      const eligible=points.filter(q=>q.x>=p.world.bounds.minX&&q.x<=p.world.bounds.maxX&&q.z>=p.world.bounds.minZ&&q.z<=p.world.bounds.maxZ&&
        checkPlacement(p,q.x,q.z,{ground:terrainHeight,depth:waterDepth,building:q.assetId.startsWith('architecture.'),radius:q.assetId.startsWith('architecture.')?4:1}).level!=='invalid');
      const valid=eligible.filter(q=>!!(p.assets[q.assetId]??assetDefinitionFor(q.assetId)));
      if(!valid.length){this.ctx.message('Aucun emplacement valide pour cette palette.',true);return;}
      const ids=[...new Set(valid.map(q=>chunkAt(p.world,q.x,q.z)))];
      await s.change('Peindre '+valid.length+' objets de décor',ids,d=>{
        for(const q of valid){const asset=d.assets[q.assetId]??assetDefinitionFor(q.assetId);if(!asset)continue;
          if(!d.assets[q.assetId])d.assets={...d.assets,[q.assetId]:asset};
          const ownerChunkId=chunkAt(d.world,q.x,q.z);
          putEntity(d,{id:crypto.randomUUID(),kind:q.assetId.startsWith('architecture.')?'building':'prop',
            name:asset.name,ownerChunkId,components:{
              Transform:{type:'Transform',position:{x:q.x,y:0,z:q.z},rotation:yawQuaternion(q.yaw),scale:{x:q.scale,y:q.scale,z:q.scale}},
              Visual:{type:'Visual',assetId:q.assetId},
              ...(colliderFor(q.assetId)?{Collider:colliderFor(q.assetId)!}:{})
            }});
        }
      });
      this.ctx.message(valid.length+' objets posés en une transaction (Ctrl+Z pour annuler).');
    }finally{this.busy=false;}});
  }
  cancel(){if(!this.painting)return false;this.painting=false;this.pending=[];return true;}
}
