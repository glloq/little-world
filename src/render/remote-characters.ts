/** Local snapshot simulator and reusable distant character renderer. Never updates gameplay. */
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {DEFAULT_APPEARANCE,type Appearance} from '../character-style.ts';
import {buildHamster} from '../hamster/hamster.ts';
import type {PlayerPresentationState} from '../hamster/presentation-state.ts';
import {PresentationBuffer} from './presentation-buffer.ts';
import {createImpostorSectors} from './impostor-sectors.ts';
import {representationFor,REPRESENTATION_BUDGETS,type Representation} from './representation-policy.ts';
export const emptyPresentation=():PlayerPresentationState=>({v:1,t:0,x:0,y:0,z:0,yaw:0,mode:'ground',speed:0,verticalSpeed:0,turnRate:0,aboard:false,action:null,actionSeq:0,tool:null,fishing:null});
export function createRemoteCharacters(parent:THREE.Object3D,isOccluded?:(x:number,y:number,z:number)=>boolean){
 const sprites=createImpostorSectors(parent,'characters');sprites.setEnabled(true);
 const entries=new Map<string,{history:PresentationBuffer;state:PlayerPresentationState;mode:Representation;rig:ReturnType<typeof buildHamster>|null;last:number;appearance:Appearance}>();
 const parts=[[0,.43,0,.38,.42,.32],[0,.91,.1,.32,.3,.28],[-.24,1.18,.08,.11,.12,.08],[.24,1.18,.08,.11,.12,.08]].map(([x,y,z,sx,sy,sz])=>new THREE.IcosahedronGeometry(1,0).scale(sx,sy,sz).translate(x,y,z));
 const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());const material=new THREE.MeshLambertMaterial({color:0xb88d65,flatShading:true});
 const proxies=new THREE.InstancedMesh(geometry,material,100);proxies.count=0;proxies.name='Remote geometric fallback';proxies.frustumCulled=false;parent.add(proxies);
 const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1),white=new THREE.Color(0xffffff);
 const frustum=new THREE.Frustum(),viewMatrix=new THREE.Matrix4(),sphere=new THREE.Sphere(new THREE.Vector3(),2);
 const stats={actors:0,full:0,impostors:0,proxy:0,hidden:0,snapshots:0,rigs:0,updateMs:0,atlas:sprites.stats};
 return {stats,
  push(id:string,state:PlayerPresentationState,appearance?:Appearance){let e=entries.get(id);if(!e){if(entries.size>=100)return false;e={history:new PresentationBuffer(),state:emptyPresentation(),mode:'hidden',rig:null,last:0,appearance:{...(appearance??DEFAULT_APPEARANCE)}};entries.set(id,e);}if(appearance){e.appearance={...appearance};e.rig?.setAppearance(e.appearance);}if(e.history.push(state)){stats.snapshots++;return true;}return false;},
  remove(id:string){const e=entries.get(id);e?.rig?.dispose();entries.delete(id);},
  update(dt:number,time:number,camera:THREE.PerspectiveCamera,height:number,quality:number,delay=.15){
   let created=0;camera.updateMatrixWorld();frustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
   const start=performance.now(),budget=REPRESENTATION_BUDGETS[quality as 0|1|2]??REPRESENTATION_BUDGETS[2];sprites.setBudget(100,8);sprites.begin();sprites.update(time);proxies.count=0;stats.full=stats.impostors=stats.hidden=stats.proxy=0;
   // Prioritise closest identities without mutating their persistent histories.
   const ordered=[...entries.values()].sort((a,b)=>Math.hypot(a.state.x-camera.position.x,a.state.z-camera.position.z)-Math.hypot(b.state.x-camera.position.x,b.state.z-camera.position.z));
   for(const e of ordered){e.rig&&(e.rig.group.visible=false);if(!e.history.sample(time-delay,e.state))continue;const s=e.state,d=Math.hypot(s.x-camera.position.x,s.y-camera.position.y,s.z-camera.position.z);
    sphere.center.set(s.x,s.y+.6,s.z);if(!frustum.intersectsSphere(sphere)||d>80&&isOccluded?.(s.x,s.y+1.3,s.z)){stats.hidden++;continue;}
    e.mode=representationFor('character',1.2,d,{fov:camera.fov,height,quality},e.mode,sprites.ready);
    if(e.mode==='lod0'&&stats.full<budget.fullCharacters&&(e.rig||created<1)){
     if(!e.rig){const idle=[...entries.values()].filter(v=>v.rig&&!v.rig.group.visible).sort((a,b)=>a.last-b.last);if([...entries.values()].filter(v=>v.rig).length>=budget.fullCharacters){idle[0]?.rig?.dispose();if(idle[0])idle[0].rig=null;}created++;e.rig=buildHamster();e.rig.setAppearance(e.appearance);parent.add(e.rig.group);}
     e.rig.group.visible=true;e.rig.applyPresentation(s,dt);e.last=time;stats.full++;continue;
    }
    if(e.mode==='hidden'){stats.hidden++;continue;}
    const animation=s.action?'action':s.mode==='roll'?'roll':s.mode==='glide'?'glide':s.mode==='dive'?'dive':s.mode==='swim'?'swim':s.mode==='air'?'jump':s.speed>4?'run':s.speed>.3?'walk':'idle';
    if(e.mode!=='lod1'&&e.mode!=='lod2'&&sprites.write('hamster.'+animation,s.x,s.y,s.z,1,s.yaw,white)){stats.impostors++;continue;}
    position.set(s.x,s.y,s.z);q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,s.yaw);matrix.compose(position,q,scale);proxies.setMatrixAt(proxies.count++,matrix);stats.proxy++;
   }
   for(const e of [...entries.values()].filter(e=>e.rig&&!e.rig.group.visible).sort((a,b)=>a.last-b.last)){if([...entries.values()].filter(v=>v.rig).length<=budget.fullCharacters)break;e.rig!.dispose();e.rig=null;}
   proxies.instanceMatrix.needsUpdate=true;sprites.end();stats.actors=entries.size;stats.rigs=[...entries.values()].filter(e=>e.rig).length;stats.updateMs=performance.now()-start;
  },
  dispose(){for(const e of entries.values())e.rig?.dispose();entries.clear();sprites.dispose();geometry.dispose();material.dispose();proxies.removeFromParent();},
 };
}
export function createActorSimulator(parent:THREE.Object3D,count:number,origin:{x:number;z:number},ground:(x:number,z:number)=>number,isOccluded?:(x:number,y:number,z:number)=>boolean){
 const renderer=createRemoteCharacters(parent,isOccluded),sample=emptyPresentation();let next=0;
 const stats={...renderer.stats,hz:20};
 return {stats,renderer,
  tick(time:number){const hz=[20,8,2][Math.floor(time/12)%3];stats.hz=hz;if(time<next)return;next+=1/hz;if(next<time-1/hz)next=time+1/hz;
   for(let i=0;i<count;i++){const phase=time*.12+i*2.399,r=8+i*2.3;sample.t=time;sample.x=origin.x+Math.sin(phase)*r;sample.z=origin.z+Math.cos(phase)*r;sample.y=ground(sample.x,sample.z);sample.yaw=phase+Math.PI/2;sample.speed=r*.12;sample.mode=i%9===3?'roll':i%9===4?'glide':i%9===5?'swim':i%9===6?'air':'ground';sample.verticalSpeed=sample.mode==='air'?2:0;if(sample.mode==='glide')sample.y+=12;sample.action=i%9===7?'INTERACT':null;sample.actionSeq=Math.floor(time/3);renderer.push('simulated-'+i,sample);}
  },
  update(dt:number,time:number,camera:THREE.PerspectiveCamera,height:number,quality:number){renderer.update(dt,time,camera,height,quality,Math.max(.1,1.2/stats.hz));Object.assign(stats,renderer.stats);},
  dispose:()=>renderer.dispose(),
 };
}
