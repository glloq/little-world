import * as THREE from 'three';
import {terrainHeight} from '../../terrain.ts';
import {affectedChunkIds} from '../../studio-core/schema.ts';
import {putTerrainEdit,putBiomeEdit} from '../../studio-core/source.ts';
import type {Tool,ToolContext} from './tools.ts';

export type BrushMode='raise'|'lower'|'flatten'|'smooth'|'forest'|'meadow'|'mountain'|'coast'|'village';
export const BIOME_MODES:BrushMode[]=['forest','meadow','mountain','coast','village'];
export const brushSettings={radius:10,strength:2,height:null as number|null};
export interface Dab {x:number;z:number}
/** Mean ground height in a disc: the target of the "smooth" dab (relaxes bumps towards the
 * local mean, with a softer weight than flattening). Pure and unit-tested. */
export function localMean(ground:(x:number,z:number)=>number,x:number,z:number,radius:number):number{
  let sum=0,count=0;for(let r=0;r<=2;r++){const ring=r===0?1:r*6,dist=radius*r/2.5;for(let i=0;i<ring;i++){const a=i/ring*Math.PI*2;sum+=ground(x+Math.cos(a)*dist,z+Math.sin(a)*dist);count++;}}
  return sum/count;
}
/** Resample a pointer path into dabs spaced by a fraction of the radius (continuous stroke). */
export function strokeDabs(points:Dab[],radius:number,max=96):Dab[]{
  const out:Dab[]=[];const spacing=Math.max(.5,radius*.45);
  for(const p of points){const last=out.at(-1);if(!last){out.push(p);continue;}const d=Math.hypot(p.x-last.x,p.z-last.z);if(d<spacing)continue;const steps=Math.floor(d/spacing);for(let i=1;i<=steps&&out.length<max;i++)out.push({x:last.x+(p.x-last.x)*i/steps,z:last.z+(p.z-last.z)*i/steps});}
  return out.slice(0,max);
}
/** E4 — terrain and biome brushes in the 3D view. The ring previews radius and footprint;
 * a whole drag is one transaction; [ ] change the radius, - + the strength. Right/middle
 * buttons and the wheel keep navigating while a brush is active. */
export class BrushTool implements Tool {
  readonly cursor='none';
  private ctx!:ToolContext;private ring:THREE.Group|null=null;private points:Dab[]=[];private painting=false;private busy=false;
  readonly id:string;readonly mode:BrushMode;
  constructor(id:string,mode:BrushMode){this.id=id;this.mode=mode;}
  activate(ctx:ToolContext){
    this.ctx=ctx;const g=new THREE.Group(),color=BIOME_MODES.includes(this.mode)?0x9be37d:this.mode==='lower'?0x8fc3ff:0xffe08a;
    const outer=new THREE.Mesh(new THREE.RingGeometry(.96,1,64),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:.95}));
    const inner=new THREE.Mesh(new THREE.CircleGeometry(1,48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:.12}));
    for(const m of [outer,inner]){m.rotation.x=-Math.PI/2;m.renderOrder=40;g.add(m);}g.visible=false;g.name='BrushPreview';ctx.scene.add(g);this.ring=g;
  }
  deactivate(){if(this.ring){this.ring.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.geometry.dispose();(m.material as THREE.Material).dispose();}});this.ring.removeFromParent();}this.ring=null;this.points=[];this.painting=false;}
  private show(e:PointerEvent){const point=this.ctx.ground(e);if(!point||!this.ring){if(this.ring)this.ring.visible=false;return null;}this.ring.visible=true;this.ring.position.set(point.x,point.y+.25,point.z);this.ring.scale.setScalar(brushSettings.radius);this.ctx.invalidate(2);return point;}
  pointerMove(e:PointerEvent){const point=this.show(e);if(this.painting&&point&&e.buttons&1){this.points.push({x:point.x,z:point.z});this.ctx.message(`${strokeDabs(this.points,brushSettings.radius).length} touche(s) · relâcher pour appliquer (Échap annule)`);}}
  pointerDown(e:PointerEvent){if(e.button!==0||this.busy)return;const point=this.show(e);if(!point)return;this.painting=true;this.points=[{x:point.x,z:point.z}];}
  pointerUp(e:PointerEvent){if(e.button!==0||!this.painting)return;this.painting=false;const dabs=strokeDabs(this.points,brushSettings.radius);this.points=[];if(dabs.length)this.commit(dabs);}
  cancel(){if(!this.painting)return false;this.painting=false;this.points=[];this.ctx.message('Trait annulé.');return true;}
  keyDown(e:KeyboardEvent){
    if(e.key==='['||e.key===']'){brushSettings.radius=Math.min(80,Math.max(1,brushSettings.radius*(e.key===']'?1.25:.8)));if(this.ring)this.ring.scale.setScalar(brushSettings.radius);this.ctx.message(`Rayon ${brushSettings.radius.toFixed(1)} m`);this.ctx.invalidate(2);return true;}
    if(e.key==='-'||e.key==='+'||e.key==='='){brushSettings.strength=Math.min(10,Math.max(.1,brushSettings.strength+(e.key==='-'?-.5:.5)));this.ctx.message(`Force ${brushSettings.strength.toFixed(1)}`);return true;}
    return false;
  }
  private commit(dabs:Dab[]){
    const s=this.ctx.session,radius=brushSettings.radius,strength=brushSettings.strength,mode=this.mode,biome=BIOME_MODES.includes(mode);this.busy=true;
    const flatHeight=brushSettings.height??terrainHeight(dabs[0].x,dabs[0].z);
    const targets=dabs.map(d=>mode==='smooth'?localMean(terrainHeight,d.x,d.z,radius):flatHeight);
    this.ctx.run(async()=>{try{
      const chunks=[...new Set(dabs.flatMap(d=>affectedChunkIds(s.document.world,d.x,d.z,radius)))];
      await s.change(biome?'Peindre un biotope':mode==='smooth'?'Lisser le relief':'Sculpter le relief',chunks,draft=>{dabs.forEach((d,i)=>{const base={id:crypto.randomUUID(),x:d.x,z:d.z,radius};
        if(biome)putBiomeEdit(draft,{...base,biome:mode as 'forest',density:Math.min(2,strength/2)});
        else putTerrainEdit(draft,{...base,mode:mode as 'raise',strength:mode==='smooth'?Math.min(4,strength*.4):strength,height:mode==='raise'||mode==='lower'?strength:targets[i]});});});
      this.ctx.message(`${dabs.length} retouche(s) · une seule opération dans l’historique.`);
    }finally{this.busy=false;}});
  }
}
