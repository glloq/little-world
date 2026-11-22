/** Doc 107 §évolution graphique — presentation cost of every mini-game view (Node, no GPU).
 * For each variant: draw calls (visible meshes / instanced meshes / lines) and triangles of
 * the view group, `update()` CPU time p50/p95 over a played session (balls moving), heap
 * growth per update (allocations), and the same after the activity is disposed (leaks).
 * Usage: node --experimental-strip-types --expose-gc tools/bench-minigames-view.mjs [label] */
import * as THREE from 'three';
import {createMiniGameManager} from '../src/minigames/manager.ts';
import {defaultMiniGame} from '../src/minigames/layouts.ts';
import {MINIGAME_VARIANT_IDS} from '../src/minigames/catalog.ts';
import {ballWorldOf} from '../src/minigames/ball/simulation.ts';

const pct=(v,p)=>{const s=[...v].sort((a,b)=>a-b);return +s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2);};
const gc=()=>{if(globalThis.gc){globalThis.gc();globalThis.gc();}};
const env={height:(x,z)=>Math.sin(x*.07)*.3+Math.cos(z*.05)*.2};
function drawCost(group){
  let calls=0,triangles=0;
  group.traverseVisible(o=>{
    if(!(o.isMesh||o.isLine||o.isPoints))return;
    const g=o.geometry,n=o.isInstancedMesh?o.count:1;if(!n)return;calls++;
    const idx=g.index?g.index.count:g.attributes.position.count;triangles+=(o.isMesh?idx/3:0)*n;
  });
  return {calls,triangles:Math.round(triangles)};
}
const rows=[];
for(const variant of MINIGAME_VARIANT_IDS){
  const def=defaultMiniGame(variant,{id:'minigame:bench-'+variant,x:0,z:0}),m=createMiniGameManager([def],{env});
  await m.prepare(def.id);const r=m.records.get(def.id),factory=await r.module.loadView(),scene=new THREE.Group();
  // Effects pool shared like in the game (absent on older builds: optional).
  const fx=factory.createEffects?.(scene)??null;fx?.setTier?.('high');
  const view=factory.create(scene,r.sim,env,{fx,tier:()=>'high'}),idle=drawCost(scene);view.setState?.('active');
  let tick=0,seq=0;const actor={id:'p',x:def.area.x,y:0,z:def.area.z,vx:0,vy:0,vz:0,radius:.4,height:1,mode:'ground'};
  const send=b=>m.submit({instanceId:def.id,playerId:'p',tick:tick+1,seq:++seq,...b});
  send({type:'join'});send({type:'start'});m.tick(++tick,1/30,[actor]);
  const w=ballWorldOf(r.sim),times=[];let peakFx=0;
  // Shots every 2 s from the aim anchor (or the first ball): a moving scene for the renderer.
  for(let k=0;k<1800;k++){
    if(k%60===0){const a=r.sim.aim(r.session,actor);if(a){actor.x=a.anchor.x-Math.sin(def.area.heading)*.7;actor.z=a.anchor.z-Math.cos(def.area.heading)*.7;}
      else{actor.x=w.px[0]-.7*Math.sin(def.area.heading);actor.z=w.pz[0]-.7*Math.cos(def.area.heading);}
      send({type:'launch',yaw:def.area.heading+((k/60)%3-1)*.08,power:.7});}
    const res=m.tick(++tick,1/30,[actor]);for(const e of res.events)view.onEvent?.(e,r.session,'p');
    for(const alpha of [.5,1]){const t=performance.now();view.update(alpha,1/60);fx?.update(1/60);times.push((performance.now()-t)*1000);}peakFx=Math.max(peakFx,fx?.live??0);
    if(r.state!=='ACTIVE'){send({type:'join'});send({type:'start'});}
  }
  const active=drawCost(scene);
  gc();const h0=process.memoryUsage().heapUsed;for(let k=0;k<3000;k++)view.update(k%2?1:.5,1/60);gc();const perUpdate=(process.memoryUsage().heapUsed-h0)/3000;
  view.dispose();fx?.dispose();m.dispose();
  rows.push({variant,idle,active,peakEffects:peakFx,updateUs:{p50:pct(times,.5),p95:pct(times,.95),p99:pct(times,.99)},heapPerUpdateB:Math.round(perUpdate),childrenAfterDispose:scene.children.length});
}
console.log(JSON.stringify({label:process.argv[2]??'',node:process.version,rows},null,1));
