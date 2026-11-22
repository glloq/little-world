import test from 'node:test';
import assert from 'node:assert/strict';
import {WaterSpatialIndex,CHANNEL_SHAPE} from '../src/water/profile.ts';
import {carveWaterBeds} from '../src/terrain.ts';

// Doc 108 §9: organic channel derived at compile time; physics and render share it.
const bend={id:'bend',points:[{x:0,z:0},{x:0,z:80},{x:40,z:130},{x:100,z:150},{x:180,z:150}],width:8,depth:2,level:0,profile:{mode:'manual',levels:[20,19.6,19.2,18.8,18.4]}};

test('the width breathes along the river within bounds and keeps the authored width at both ends',()=>{
 const c=new WaterSpatialIndex([bend],()=>30,0).bodies[0];
 const halves=c.points.map(p=>p.half);
 assert.ok(halves.every(h=>h>=4*CHANNEL_SHAPE.minFactor-1e-9&&h<=4*CHANNEL_SHAPE.maxFactor+1e-9));
 assert.ok(Math.abs(halves[0]-4)<1e-9&&Math.abs(halves.at(-1)-4)<1e-9,'links and bridges see the authored width');
 assert.ok(Math.max(...halves)-Math.min(...halves)>.4,'not a constant ribbon');
});

test('the deepest line moves to the outside of a bend; the bed is deeper there than on the point bar',()=>{
 const index=new WaterSpatialIndex([bend],()=>30,0),c=index.bodies[0];
 // The trace turns right (from +z toward +x) around (40,130): outside = left bank (+ shift).
 const mid=c.points.reduce((b,p)=>Math.hypot(p.x-40,p.z-130)<Math.hypot(b.x-40,b.z-130)?p:b);
 assert.ok(mid.shift>.5,'thalweg toward the outside: '+mid.shift);
 const hit=index.query(mid.x,mid.z)[0],nx=-hit.flowZ,nz=hit.flowX,o=hit.half*.8;
 const outside=carveWaterBeds(()=>30,index,mid.x+nx*o,mid.z+nz*o),inside=carveWaterBeds(()=>30,index,mid.x-nx*o,mid.z-nz*o);
 assert.ok(outside<inside-.3,`outer bed ${outside.toFixed(2)} deeper than point bar ${inside.toFixed(2)}`);
});

test('an entrenched river gets V-shaped banks (wider reach) instead of a 2 m wall',()=>{
 const index=new WaterSpatialIndex([bend],()=>30,0),c=index.bodies[0];
 assert.ok(c.bankM>8,'10 m above the water ⇒ wide banks: '+c.bankM);
 const p=c.points[2],hit=index.query(p.x,p.z)[0],nx=-hit.flowZ,nz=hit.flowX;
 const at=d=>carveWaterBeds(()=>30,index,p.x+nx*(hit.half+d),p.z+nz*(hit.half+d));
 assert.ok(at(3)<29&&at(6)<30,'bank still descending 6 m beyond the water');
 assert.ok(at(1)<at(3)&&at(3)<at(6),'monotone bank');
 const flat=new WaterSpatialIndex([{...bend,profile:{mode:'manual',levels:[29.9,29.8,29.7,29.6,29.5]}}],()=>30,0).bodies[0];
 assert.ok((flat.bankM??0)<1,'a river level with its banks keeps narrow banks');
});

test('river stones: deterministic, along the banks, boulders only in fast shallow water',async()=>{
 const {riverStones,STONE_STRIDE,riverStoneBudget}=await import('../src/render/river-stones.ts');
 const calm=new WaterSpatialIndex([{...bend,profile:{mode:'manual',levels:[20,19.9,19.8,19.7,19.6]}}],()=>30,0).bodies[0];
 const steep=new WaterSpatialIndex([{...bend,id:'steep',profile:{mode:'manual',levels:[40,30,22,15,8]}}],()=>45,0).bodies[0];
 const bed=c=>(x,z)=>c.points.reduce((b,q)=>Math.hypot(q.x-x,q.z-z)<Math.hypot(b.x-x,b.z-z)?q:b).level-.6;
 const a=riverStones(calm,bed(calm)),b=riverStones(calm,bed(calm)),s=riverStones(steep,bed(steep));
 assert.deepEqual(a,b,'same water, same stones');assert.equal(a.length%STONE_STRIDE,0);
 const big=v=>{let n=0;for(let i=0;i<v.length;i+=STONE_STRIDE)if(v[i+3]>.55)n++;return n;};
 assert.ok(s.length/STONE_STRIDE>a.length/STONE_STRIDE,'rapids: more stones');assert.ok(big(s)>big(a),'rapids: boulders');
 for(let i=0;i<a.length;i+=STONE_STRIDE){const d=Math.min(...calm.points.map(p=>Math.hypot(p.x-a[i],p.z-a[i+2])));assert.ok(d<calm.width,'stone near the water: '+d.toFixed(1));}
 assert.equal(riverStoneBudget(3),0);assert.ok(riverStoneBudget(0)>riverStoneBudget(2));
});
