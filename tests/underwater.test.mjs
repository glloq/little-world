import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBathymetry,profileDepth,compileSeabedFeatures} from '../src/geography/bathymetry.ts';
import {depthZone} from '../src/geography/depth-zones.ts';
import {underwaterLook} from '../src/render/underwater-view.ts';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {collectActivitySites} from '../src/studio-core/activity-sites.ts';
import {parseProject} from '../src/studio-core/schema.ts';

test('bathymetry: validated profile and seabed shapes stay submerged', () => {
 const b=parseBathymetry({shelfDepthM:9,shelfWidthM:300,dropWidthM:150,features:[
  {id:'r',kind:'reef',points:[{x:0,z:0},{x:100,z:0}],widthM:20,crestDepthM:2},
  {id:'h',kind:'blue-hole',x:300,z:0,radiusM:30,depthM:45},
  {id:'s',kind:'shoal',x:600,z:0,radiusM:40,depthM:1}]},40);
 assert.throws(()=>parseBathymetry({...b,features:[{id:'v',kind:'volcano',x:0,z:0}]},40));
 assert.ok(Math.abs(profileDepth(b,40,0)-1)<1e-9);assert.ok(Math.abs(profileDepth(b,40,200)-9)<1e-6);assert.ok(Math.abs(profileDepth(b,40,1000)-40)<1e-6);
 const apply=compileSeabedFeatures(b);
 assert.equal(apply(50,0,-9,0,250),-2,'reef crest');assert.ok(apply(300,0,-9,0,250)<=-44.9,'blue hole');
 assert.ok(apply(600,0,-9,0,250)<=-.3,'shoal never emerges');assert.equal(apply(50,0,-9,0,0),-9,'no effect on the shore line');
});

test('depth zones and underwater look', () => {
 assert.equal(depthZone(-1,0),null);assert.equal(depthZone(1,0),'shore');assert.equal(depthZone(5,0),'shallow');
 assert.equal(depthZone(15,.8),'drop-off');assert.equal(depthZone(15,.1),'mid');assert.equal(depthZone(40,0),'deep');assert.equal(depthZone(90,0),'abyss');
 const shallow=underwaterLook(2,1),deep=underwaterLook(40,1),night=underwaterLook(2,0);
 assert.ok(deep.far<shallow.far&&night.far<shallow.far&&deep.far>=14);assert.ok(deep.sun<shallow.sun);
});

test('composed island with an authored seabed, dive sites and dive quests', () => {
 assert.throws(()=>validateMapRequirements({...newIslandRequirements(),underwater:{shelf:'deep',reefs:1,holes:0,trench:false,diveSites:true}}));
 const r={...newIslandRequirements(),seed:17,underwater:{shelf:'wide',reefs:2,holes:1,trench:true,diveSites:true},circulation:true,stories:true};
 const c=composeWorld(r,'Plongée',{projectId:'dive',worldId:'dive'});
 assert.ok(c.ready,JSON.stringify(c.diagnostics.filter(d=>d.severity==='ERROR')));
 const p=c.project,h=projectGeography(p).ctx.height,sites=Object.values(p.libraries.diveSites??{});
 assert.ok(sites.length>=2,String(sites.length));
 for(const s of sites){for(const d of s.discoveries??[]){const ground=h(d.x,d.z);assert.ok(d.y<0&&d.y>ground-.01&&d.y-ground<2,`${d.id}: ${d.y} vs ${ground}`);}}
 assert.ok(sites.some(s=>s.depthM>=25),'a deep site exists');
 assert.ok(collectActivitySites(p).some(s=>s.kind==='dive'));
 assert.ok(Object.keys(p.libraries.questCatalog).some(k=>k.includes(':depth')));
 assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))).world.terrain,p.world.terrain);
});
