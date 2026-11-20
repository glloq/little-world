import test from 'node:test';
import assert from 'node:assert/strict';
import {LandRegistry,compatibleUses,shapeContains,shapeArea,overlapArea,collectLandReservations,auditLandUse} from '../src/studio-core/land-registry.ts';
import {convexHull,inflateConvex,settlementFootprint,settlementGeoZones} from '../src/settlements/footprint.ts';
import {createGeoContext} from '../src/geography/engine.ts';
import {buildHarvestIsland} from '../src/studio-core/harvest-island.ts';

const square=(x,z,h)=>({kind:'polygon',points:[{x:x-h,z:z-h},{x:x+h,z:z-h},{x:x+h,z:z+h},{x:x-h,z:z+h}]});
const res=(id,use,shape,extra={})=>({id,use,shape,owner:{kind:use,id},priority:50,clearanceM:0,...extra});

test('shapes: containment, area and sampled overlap', () => {
 assert.ok(shapeContains(square(0,0,10),5,5));assert.ok(!shapeContains(square(0,0,10),15,0));
 assert.ok(shapeContains({kind:'corridor',points:[{x:0,z:0},{x:100,z:0}],widthM:6},50,2.9));
 assert.equal(Math.round(shapeArea(square(0,0,10))),400);
 const o=overlapArea(res('a','farm',square(0,0,10)),res('b','race',square(10,0,10)));
 assert.ok(Math.abs(o.areaM2-200)<20,String(o.areaM2));
});

test('registry rejects incompatible claims and accepts compatible ones', () => {
 const reg=new LandRegistry([res('village','settlement',square(0,0,40))]);
 assert.equal(reg.claim(res('street','road',{kind:'corridor',points:[{x:-60,z:0},{x:60,z:0}],widthM:4})).length,0,'streets cross villages');
 const race=res('race','race',{kind:'corridor',points:[{x:0,z:-80},{x:0,z:80}],widthM:8});
 const conflicts=reg.claim(race);
 assert.equal(conflicts.length,1);assert.equal(conflicts[0].b,'village');assert.ok(!reg.get('race'),'conflicting claim not stored');
 assert.equal(reg.claim(res('race2','race',{kind:'corridor',points:[{x:100,z:-80},{x:100,z:80}],widthM:8})).length,0);
 assert.ok(compatibleUses('piste','race')&&!compatibleUses('farm','race'));
 assert.deepEqual(reg.usesAt(0,0).map(r=>r.id).sort(),['street','village']);
 // Clearance applies against incompatible uses.
 const near=new LandRegistry([res('v','settlement',square(0,0,10),{clearanceM:6})]);
 assert.equal(near.conflictsWith(res('r','race',{kind:'corridor',points:[{x:13,z:-30},{x:13,z:30}],widthM:2})).length,1);
});

test('settlement footprint covers every door with its margin and becomes reserved ground', () => {
 const hull=convexHull([{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10},{x:5,z:5}]);
 assert.equal(hull.length,4);
 const poly=inflateConvex(hull,3),shape={kind:'polygon',points:poly};
 for(const q of hull)assert.ok(shapeContains(shape,q.x+2.9*Math.sign(q.x-5||1),q.z));
 const s={version:1,id:'v',recipe:{},buildings:[{entry:{x:0,z:0}},{entry:{x:30,z:0}},{entry:{x:15,z:20}}],pathHashes:{},revision:1};
 const f=settlementFootprint(s);assert.ok(f.length>8);
 const zones=settlementGeoZones({v:s});assert.equal(zones[0].kind,'settlement');
 const ctx=createGeoContext({seed:1,grid:{minX:-100,minZ:-100,chunkSizeM:64,columns:4,rows:4},masks:{},zones},{seaLevel:0,height:()=>5,water:()=>null,site:()=>null,pathDistance:()=>99,waterDistance:()=>99});
 assert.equal(ctx.occupancy(15,5),'reserved');assert.equal(ctx.occupancy(80,80),'none');
});

test('composed harvest island: reservations are derived and free of incompatible overlaps', () => {
 const p=buildHarvestIsland(),all=collectLandReservations(p);
 assert.ok(all.some(r=>r.use==='settlement'));assert.ok(all.some(r=>r.use==='farm'));assert.ok(all.some(r=>r.use==='road'));
 assert.deepEqual(auditLandUse(p),[]);
});
