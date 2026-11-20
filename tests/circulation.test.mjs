import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCirculationGraph,circulationReport,networkDistances,auditCirculation,planCirculationLinks,collectDestinations} from '../src/studio-core/circulation.ts';
import {terrainAccessContext} from '../src/studio-core/terrain-access.ts';
import {buildHarvestIsland} from '../src/studio-core/harvest-island.ts';
import {putPath} from '../src/studio-core/source.ts';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements,validateMapRequirements} from '../src/studio-core/map-requirements.ts';

const project=(paths,extra={})=>({world:{bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},seaLevel:0},chunks:{},entityIndex:{},libraries:{paths:Object.fromEntries(paths.map(p=>[p.id,p])),water:{},zones:{},...extra}});
const path=(id,points,width=2)=>({id,points,width});

test('graph joins shared vertices, T-junctions and X-crossings', () => {
 const p=project([path('a',[{x:0,z:0},{x:100,z:0}]),path('b',[{x:50,z:1},{x:50,z:80}]),path('c',[{x:20,z:-40},{x:20,z:40}]),path('d',[{x:300,z:0},{x:400,z:0}])]);
 const g=buildCirculationGraph(p);
 assert.equal(g.componentCount,2);
 const a0=g.nodes.findIndex(q=>q.x===0&&q.z===0),top=g.nodes.findIndex(q=>q.x===50&&q.z===80),dist=networkDistances(g,a0);
 assert.ok(Math.abs(dist[top]-(50+79))<2,String(dist[top]));
});

test('destinations attach by footprint and report isolation from the port', () => {
 const p=project([path('main',[{x:0,z:0},{x:200,z:0}]),path('far',[{x:400,z:200},{x:450,z:200}])],{
  zones:{f:{id:'f',kind:'farm-plot',name:'Champ',polygon:[{x:180,z:10},{x:220,z:10},{x:220,z:60},{x:180,z:60}]},m:{id:'m',kind:'mine',name:'Mine',polygon:[{x:440,z:190},{x:460,z:190},{x:460,z:210},{x:440,z:210}]}},
 });
 p.chunks={c:{entities:{port:{id:'port',name:'Port',components:{Transform:{position:{x:5,y:0,z:5}},State:{initial:{portN1Authored:true}}}}}}};
 const g=buildCirculationGraph(p),r=circulationReport(g);
 assert.equal(r.hubId,'port:port');
 assert.equal(r.destinations.find(d=>d.id==='farm:f').status,'reachable');
 assert.equal(r.destinations.find(d=>d.id==='mine:m').status,'isolated');
 assert.deepEqual(auditCirculation(p).map(d=>d.code),['CIRC_ISOLATED']);
 assert.ok(collectDestinations(p).some(d=>d.kind==='port'));
});

test('missing links are routed on dry, walkable ground to the port network', () => {
 const p=buildHarvestIsland(),before=circulationReport(buildCirculationGraph(p));
 assert.ok(before.destinations.some(d=>d.status!=='reachable'),'harvest island has an unlinked race start');
 const links=planCirculationLinks(p,terrainAccessContext(p));
 assert.ok(links.paths.length>=1);assert.match(links.paths[0].id,/^circulation-link-/);
 for(const l of links.paths)putPath(p,l);
 const after=circulationReport(buildCirculationGraph(p));
 assert.equal(after.reachable,after.destinations.length);
});

test('composition option adds links only when requested', () => {
 assert.throws(()=>validateMapRequirements({...newIslandRequirements(),compositionVersion:4,circulation:true}));
 const r={...newIslandRequirements(),width:2000,length:1500,activities:{races:'flat',ski:false,music:'off'}};
 const plain=composeWorld(structuredClone(r),'A',{projectId:'a',worldId:'a'}),linked=composeWorld({...structuredClone(r),circulation:true},'B',{projectId:'b',worldId:'b'});
 assert.equal(Object.keys(plain.project.libraries.paths).filter(id=>id.startsWith('circulation-link-')).length,0);
 const unreached=c=>c.diagnostics.filter(d=>d.code.startsWith('CIRC_')).length;
 assert.ok(unreached(linked)<=unreached(plain));
 assert.ok(linked.stages.some(s=>s.id==='circulation'));
});
