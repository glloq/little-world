/** PHYS — CPU cost of one 30 Hz player step (simulatePlayer + WorldCollisionQuery), Node.
 * Scenarios: open relief, 400 obstacles around the path, mine grid provider (rock everywhere
 * except a 3 m gallery). Reports p50/p95/p99 µs per step. Usage: node tools/bench-physics.mjs */
import * as THREE from 'three';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {simulatePlayer,MAX_OXYGEN} from '../src/player.ts';
const keys={forward:1,right:.3,run:true,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const pct=(v,p)=>v[Math.min(v.length-1,Math.floor(v.length*p))];
function bench(name,query,space,start){
  const p={position:new THREE.Vector3(...start),velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false,space},t=[];
  for(let i=0;i<9000;i++){if(i%300===0){p.position.set(...start);p.velocity.set(0,0,0);}const a=performance.now();simulatePlayer(p,{...keys,right:Math.sin(i/40)},1/30,query);if(i>=600)t.push((performance.now()-a)*1000);}
  t.sort((a,b)=>a-b);return {scenario:name,p50Us:+pct(t,.5).toFixed(2),p95Us:+pct(t,.95).toFixed(2),p99Us:+pct(t,.99).toFixed(2)};
}
const relief=(x,z)=>Math.sin(z*.05)*3+Math.cos(x*.07)*2;
const rows=[bench('relief',new WorldCollisionQuery(relief,()=>null),undefined,[0,relief(0,0),0])];
const crowded=new WorldCollisionQuery(relief,()=>null);let s=7;const r=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
for(let i=0;i<400;i++)crowded.add({id:'o'+i,shape:'box',position:{x:(r()-.5)*60,y:-5,z:r()*120},size:{x:.5+r()*2,y:r()<.3?5.3:10,z:.5+r()*2},enabled:()=>true});
rows.push(bench('400 obstacles',crowded,undefined,[0,relief(0,0),0]));
const mine=new WorldCollisionQuery(relief,()=>null);
mine.setSpaceProvider('m',{floor:()=>-20,column:(id,x,z)=>Math.abs(x)<1.5?{floorY:-20,ceilingY:-16.5}:null,solids(id,a,b,c,d,out){for(let x=Math.floor(a);x<=Math.floor(b);x++)if(x<-2||x>=1)for(let z=Math.floor(c);z<=Math.floor(d);z++)out.push({minX:x,maxX:x+1,minZ:z,maxZ:z+1,minY:-1e5,maxY:1e5});}});
rows.push(bench('mine gallery (grid provider)',mine,{zoneId:'m',levelId:'l0'},[0,-20,0]));
console.log(JSON.stringify(rows,null,1));
