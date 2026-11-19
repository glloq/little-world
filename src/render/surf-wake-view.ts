/** Surfboard wake (presentation only): two rail trails glued to the swell and a few stylised
 * spray droplets in hard carves. One mesh, one draw call, fixed buffers, no allocation per
 * frame, no Math.random (droplets come from a hash of the tick). Physics never reads it. */
import * as THREE from 'three';
import type {SurfWaveField} from '../surf/wave-field.ts';

const SAMPLES=26;          // rail history (one sample every 2 ticks ≈ 1.7 s)
const RAILS=2;
const DROPS=14;
const RAIL_VERTICES=RAILS*SAMPLES*2;
const DROP_VERTICES=DROPS*3;
const SAMPLE_EVERY=2;
const DROP_LIFE=.55;       // seconds
export interface SurfWakeActor {
 position:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number};
 mode:string;surfStage?:string;surfHeading?:number;surfAirborne?:boolean;
}
export interface SurfWakeStats {activeSamples:number;activeDrops:number;vertices:number;drawCalls:number;detail:number}
const hash=(n:number)=>{let x=Math.imul(n^0x9e3779b9,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x^=x>>>16;return (x>>>0)/4294967296;};
export function createSurfWakeView(parent:THREE.Object3D){
 const positions=new Float32Array((RAIL_VERTICES+DROP_VERTICES)*3);
 const colors=new Float32Array((RAIL_VERTICES+DROP_VERTICES)*4);
 const indices=new Uint16Array(RAILS*(SAMPLES-1)*6+DROPS*3);
 let c=0;
 for(let r=0;r<RAILS;r++)for(let i=0;i<SAMPLES-1;i++){
  const a=(r*SAMPLES+i)*2,b=a+2;indices.set([a,b,a+1,a+1,b,b+1],c);c+=6;
 }
 for(let d=0;d<DROPS;d++){const a=RAIL_VERTICES+d*3;indices.set([a,a+1,a+2],c);c+=3;}
 const geometry=new THREE.BufferGeometry();
 const position=new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage);
 const color=new THREE.BufferAttribute(colors,4).setUsage(THREE.DynamicDrawUsage);
 geometry.setAttribute('position',position);geometry.setAttribute('color',color);
 geometry.setIndex(new THREE.BufferAttribute(indices,1));
 const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide});
 material.name='SurfWakeMaterial';
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name='SurfWake';mesh.frustumCulled=false;mesh.renderOrder=5;mesh.visible=false;
 parent.add(mesh);
 // History ring (fixed typed arrays): x, z, intensity, tick.
 const hx=new Float64Array(SAMPLES),hz=new Float64Array(SAMPLES),hi=new Float32Array(SAMPLES),ht=new Float64Array(SAMPLES);
 let head=0,count=0,lastTick=-1,detail=1,lastHeading=0;
 // Droplets: spawn point, velocity, birth time (seconds of presentation).
 const dp=new Float32Array(DROPS*3),dv=new Float32Array(DROPS*3),db=new Float64Array(DROPS).fill(-1e9);
 let nextDrop=0;
 const stats:SurfWakeStats={activeSamples:0,activeDrops:0,vertices:RAIL_VERTICES+DROP_VERTICES,drawCalls:0,detail};
 const foam=[.93,.98,.97];
 function clear(){count=0;stats.activeSamples=0;stats.activeDrops=0;db.fill(-1e9);mesh.visible=false;stats.drawCalls=0;}
 function setDetail(level:0|1|2){detail=level;stats.detail=level;if(level===0)db.fill(-1e9);}
 function update(actor:SurfWakeActor,field:SurfWaveField|null,tick:number,render:{x:number;y:number;z:number},alpha=1){
  const riding=!!field&&actor.mode==='surf'&&!actor.surfAirborne;
  if(!riding){if(count||mesh.visible)clear();lastTick=tick;return;}
  const speed=Math.hypot(actor.velocity.x,actor.velocity.z),heading=actor.surfHeading??Math.atan2(actor.velocity.x,actor.velocity.z);
  const fx=Math.sin(heading),fz=Math.cos(heading);
  if(tick!==lastTick&&tick%SAMPLE_EVERY===0){
   const tail=.8;
   hx[head]=actor.position.x-fx*tail;hz[head]=actor.position.z-fz*tail;
   hi[head]=Math.max(0,Math.min(1,(speed-1.5)/9));ht[head]=tick;
   head=(head+1)%SAMPLES;count=Math.min(SAMPLES,count+1);
   // Spray in hard carves: turn rate × speed, deterministic per tick.
   const turn=Math.abs(Math.atan2(Math.sin(heading-lastHeading),Math.cos(heading-lastHeading)))*15;
   if(detail>0&&speed>4&&turn*speed>(detail>1?3.2:4.5)){
    const n=detail>1?3:2;
    for(let k=0;k<n;k++){
     const r=hash(tick*7+k),r2=hash(tick*13+k+5),side=Math.sign(Math.sin(heading-lastHeading))||1;
     const i=nextDrop;nextDrop=(nextDrop+1)%DROPS;
     dp[i*3]=actor.position.x-fx*.3;dp[i*3+1]=actor.position.y;dp[i*3+2]=actor.position.z-fz*.3;
     const out=1.4+2.2*r;
     dv[i*3]=fz*side*out-fx*(.5+r2);dv[i*3+1]=1.6+1.8*r2;dv[i*3+2]=-fx*side*out-fz*(.5+r2);
     db[i]=tick/30;
    }
   }
   lastHeading=heading;
  }
  lastTick=tick;
  const now=(Math.max(0,tick-1)+Math.max(0,Math.min(1,alpha)))/30;
  const life=SAMPLES*SAMPLE_EVERY*(detail===0?.5:1);
  let active=0;
  for(let r=0;r<RAILS;r++){
   const side=r===0?-1:1;
   for(let i=0;i<SAMPLES;i++){
    const base=((r*SAMPLES+i)*2);
    // i = 0 is the newest point: the live board tail (continuous with render interpolation).
    let x:number,z:number,intensity:number,age:number;
    if(i===0){x=render.x-fx*.8;z=render.z-fz*.8;intensity=Math.max(0,Math.min(1,(speed-1.5)/9));age=0;}
    else if(i<=count){
     const k=(head-i+SAMPLES)%SAMPLES;x=hx[k];z=hz[k];intensity=hi[k];age=(tick+alpha-1-ht[k])/life;
    }else{x=render.x;z=render.z;intensity=0;age=1;}
    if(age<1&&intensity>0)active++;
    const fade=Math.max(0,1-age)*intensity;
    // Rails spread slowly behind the board.
    const spread=.2+.55*age,width=.07+.12*age;
    const y=(field!.height(x,z,Math.max(0,tick))??field!.zone.seaLevel)+.045;
    const ox=fz*side*spread,oz=-fx*side*spread,wx=fz*width,wz=-fx*width;
    for(let e=0;e<2;e++){
     const s=e===0?-1:1,v=base+e,o=v*3,o4=v*4;
     positions[o]=x+ox+wx*s;positions[o+1]=y;positions[o+2]=z+oz+wz*s;
     colors[o4]=foam[0];colors[o4+1]=foam[1];colors[o4+2]=foam[2];colors[o4+3]=.55*fade*fade;
    }
   }
  }
  let drops=0;
  for(let d=0;d<DROPS;d++){
   const t=now-db[d],o=(RAIL_VERTICES+d*3)*3,o4=(RAIL_VERTICES+d*3)*4;
   const live=t>=0&&t<DROP_LIFE&&detail>0;
   const x=dp[d*3]+dv[d*3]*t,y=dp[d*3+1]+dv[d*3+1]*t-4.9*t*t,z=dp[d*3+2]+dv[d*3+2]*t;
   const size=live?.09*(1-t/DROP_LIFE*.5):0;
   positions[o]=x-size;positions[o+1]=y;positions[o+2]=z;
   positions[o+3]=x+size;positions[o+4]=y;positions[o+5]=z;
   positions[o+6]=x;positions[o+7]=y+size*1.7;positions[o+8]=z;
   for(let v=0;v<3;v++){colors[o4+v*4]=foam[0];colors[o4+v*4+1]=foam[1];colors[o4+v*4+2]=foam[2];colors[o4+v*4+3]=live?.85*(1-t/DROP_LIFE):0;}
   if(live)drops++;
  }
  stats.activeSamples=active;stats.activeDrops=drops;
  position.needsUpdate=true;color.needsUpdate=true;
  mesh.visible=active>0||drops>0;stats.drawCalls=mesh.visible?1:0;
 }
 return {mesh,stats,update,setDetail,clear,
  dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
