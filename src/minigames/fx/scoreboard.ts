/**
 * Score boards (doc 107 §panneaux): seven-segment digits drawn by ONE InstancedMesh per field
 * (no texture, no canvas, readable day and night with an unlit material). Instances are only
 * rewritten when a displayed value changes — never per frame.
 */
import * as THREE from 'three';
import type {MiniGameTheme} from '../theme-palettes.ts';
import {Painter,shade} from './painter.ts';

/** Segments a..g of each digit (standard 7-segment order). */
const DIGITS=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
const SEG:Record<string,[number,number,boolean]>={a:[0,1,true],b:[.5,.5,false],c:[.5,-.5,false],d:[0,-1,true],e:[-.5,-.5,false],f:[-.5,.5,false],g:[0,0,true]};
/** Two numbers of up to two digits each (e.g. "2 – 1", "17 · 4"). */
export const SCOREBOARD_DIGITS=4;
export interface ScoreboardPlacement {x:number;y:number;z:number;yaw:number;kind:'wood'|'stone'}
let segment:THREE.BufferGeometry|null=null,lit:THREE.MeshBasicMaterial|null=null;
const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scl=new THREE.Vector3(),zero=new THREE.Matrix4().makeScale(0,0,0),up=new THREE.Vector3(0,1,0);
/** Board frame (posts + panel), painted with the field. Digits face +v (towards the field). */
export function paintScoreboard(pt:Painter,b:ScoreboardPlacement,theme:MiniGameTheme){
  const c=Math.cos(b.yaw),s=Math.sin(b.yaw),at=(u:number)=>({x:b.x+u*c,z:b.z-u*s});
  const frameColor=b.kind==='stone'?0x8f8a80:0x7a5232,panel=0x1f2326;
  for(const u of [-.85,.85]){const p=at(u);pt.block(p.x,b.y,p.z,.12,1.3,.12,b.yaw,shade(frameColor,.9));}
  pt.block(b.x,b.y+1.25,b.z,2,.95,.14,b.yaw,frameColor,theme.cap);
  const f=at(0);pt.block(f.x+s*.075,b.y+1.33,f.z+c*.075,1.76,.78,.01,b.yaw,panel);
}
export class ScoreboardDigits {
  readonly mesh:THREE.InstancedMesh;
  private shown:string[]=[];
  private readonly boards:readonly ScoreboardPlacement[];
  constructor(parent:THREE.Object3D,boards:readonly ScoreboardPlacement[]){
    this.boards=boards;
    segment??=new THREE.BoxGeometry(1,1,1);lit??=new THREE.MeshBasicMaterial({color:0xffd34d});
    this.mesh=new THREE.InstancedMesh(segment,lit,Math.max(1,boards.length*SCOREBOARD_DIGITS*7+boards.length*2));
    this.mesh.name='ScoreboardDigits';this.mesh.frustumCulled=false;parent.add(this.mesh);
    for(let i=0;i<this.mesh.count;i++)this.mesh.setMatrixAt(i,zero);
    this.set(null,null);
  }
  /** Shows two values (null = dashes). Returns true when the instances were rewritten. */
  set(left:number|null,right:number|null):boolean{
    const text=(v:number|null)=>v===null?'--':String(Math.max(0,Math.min(99,Math.round(v)))).padStart(2,' ');
    const key=text(left)+text(right);if(this.shown[0]===key)return false;this.shown[0]=key;
    let i=0;
    this.boards.forEach(b=>{
      q.setFromAxisAngle(up,b.yaw);const c=Math.cos(b.yaw),s=Math.sin(b.yaw);
      for(let d=0;d<SCOREBOARD_DIGITS;d++){
        const ch=key[d],segs=ch==='-'?'g':ch===' '?'':DIGITS[Number(ch)],u=-.66+d*.36+(d>=2?.12:0);
        for(const name of 'abcdefg'){
          const [sx,sy,horizontal]=SEG[name],on=segs.includes(name);
          const lu=u+sx*.16,ly=b.y+1.33+sy*.2,w=horizontal?.16:.035,h=horizontal?.035:.17;
          if(on){pos.set(b.x+lu*c+s*.085,ly,b.z-lu*s+c*.085);scl.set(w,h,.02);m4.compose(pos,q,scl);this.mesh.setMatrixAt(i,m4);}else this.mesh.setMatrixAt(i,zero);
          i++;
        }
      }
      // Separator dots between the two numbers.
      for(const dy of [.07,-.07]){pos.set(b.x+.06*c+s*.085,b.y+1.33+dy,b.z-.06*s+c*.085);scl.set(.04,.04,.02);m4.compose(pos,q,scl);this.mesh.setMatrixAt(i++,m4);}
    });
    this.mesh.instanceMatrix.needsUpdate=true;return true;
  }
  dispose(){this.mesh.removeFromParent();this.mesh.dispose();}
}
