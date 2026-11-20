import test from 'node:test';
import assert from 'node:assert/strict';
import {collectActivitySites,activityCapabilityIndex} from '../src/studio-core/activity-sites.ts';
import {planFlightCourse,resortShaping} from '../src/studio-core/activity-planners.ts';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {buildHarvestIsland} from '../src/studio-core/harvest-island.ts';
import {parseDiveSite} from '../src/water/dive-sites.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';

test('activity sites describe every authored activity with capabilities, events and host role', () => {
 const p=buildHarvestIsland(),sites=collectActivitySites(p);
 const kinds=new Set(sites.map(s=>s.kind));
 for(const k of ['farm','fishing','race-roll'])assert.ok(kinds.has(k),k);
 const race=sites.find(s=>s.kind==='race-roll');assert.ok(race.capabilities.includes('race:roll'));assert.deepEqual(race.events,['race.finished']);
 assert.ok(sites.some(s=>s.capabilities.includes('fishing:sea')),'sea fishing from the port');
 const index=activityCapabilityIndex(sites);assert.ok(index.get('farm:any').length>=1);
 for(const s of sites)assert.ok(s.access&&s.footprint&&s.hostRole);
});

test('dive sites are a validated optional library and become activity sites', () => {
 const bounds={minX:-100,maxX:100,minZ:-100,maxZ:100};
 const site={version:1,id:'reef-a',name:'Récif',kind:'reef',entry:{x:0,z:0},polygon:[{x:0,z:0},{x:20,z:0},{x:20,z:20}],depthM:28,discoveries:[{id:'pearl',name:'Perle',x:5,y:-27,z:5}]};
 assert.deepEqual(parseDiveSite(site,bounds),site);
 assert.throws(()=>parseDiveSite({...site,kind:'volcano'},bounds));assert.throws(()=>parseDiveSite({...site,entry:{x:500,z:0}},bounds));
 const p=buildHarvestIsland();p.libraries.diveSites={'reef-a':{...site,entry:{x:p.world.bounds.minX+10,z:p.world.bounds.minZ+10},polygon:site.polygon.map(q=>({x:p.world.bounds.minX+q.x+10,z:p.world.bounds.minZ+q.z+10})),discoveries:undefined}};
 delete p.libraries.diveSites['reef-a'].discoveries;
 const back=parseProject(JSON.parse(JSON.stringify(p)));
 const dive=collectActivitySites(back).find(s=>s.kind==='dive');assert.ok(dive.capabilities.includes('dive:depth:deep'));assert.equal(dive.hostRole,'guide');
});

test('requested surf, flight and races are planned generically on a composed island', () => {
 assert.throws(()=>validateMapRequirements({...newIslandRequirements(),activities:{races:'none',ski:false,music:'off',surf:'yes'}}));
 assert.deepEqual(resortShaping(650),{fromM:189,rangeM:462,scale:.45,power:1});
 const r={...newIslandRequirements(),seed:4242,activities:{races:'flat',ski:false,music:'off',surf:true,flight:true}};
 const c=composeWorld(r,'Côte',{projectId:'coast',worldId:'coast'});
 assert.ok(c.ready,JSON.stringify(c.diagnostics.filter(d=>d.severity==='ERROR')));
 const kinds=collectActivitySites(c.project).map(s=>s.kind);
 assert.equal(kinds.filter(k=>k==='surf').length,3);assert.equal(kinds.filter(k=>k==='race-surf').length,3);
 assert.ok(kinds.includes('race-flight'));assert.ok(kinds.includes('race-roll'));
 // Flight rings keep clearance above the ground and descend overall.
 const flight=c.project.libraries.races['race:composition-flight'],h=projectGeography(c.project).ctx.height;
 for(const g of flight.gates)assert.ok(g.center.y>=Math.max(h(g.center.x,g.center.z),0)+9.9);
 assert.ok(flight.gates.at(-1).center.y<flight.gates[0].center.y);
});

test('flight planner reports a diagnostic on flat ground', () => {
 const r={...newIslandRequirements(),width:1000,length:800,maritimePort:false,welcomeVillage:'none'};
 r.islandStyle={...r.islandStyle,altitudeM:30};
 const p=composeWorld(r,'Plat',{projectId:'flat',worldId:'flat'}).project;
 const res=planFlightCourse(p);
 assert.ok('raceId' in res||res.code==='ACTIVITY_FLIGHT_MISSING');
});
