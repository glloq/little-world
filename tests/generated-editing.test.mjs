import test from 'node:test';
import assert from 'node:assert/strict';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements} from '../src/studio-core/map-requirements.ts';
import {removeSettlement} from '../src/settlements/authoring.ts';
import {planActivityStories} from '../src/studio-core/activity-stories.ts';
import {buildHarvestIsland} from '../src/studio-core/harvest-island.ts';
import {planCirculationLinks} from '../src/studio-core/circulation.ts';
import {terrainAccessContext} from '../src/studio-core/terrain-access.ts';
import {putPath} from '../src/studio-core/source.ts';

test('removing a graded settlement removes its own site grading only', () => {
 const r={...newIslandRequirements(),seed:17,welcomeVillage:'village',earthworks:true};
 const p=composeWorld(r,'G',{projectId:'g',worldId:'g'}).project,a=p.world.terrain.archipelago;
 assert.ok(a.earthworks?.some(w=>w.id.startsWith('settlement:composition-welcome-village:')));
 a.earthworks.push({id:'manual:pad',kind:'pad',polygon:[{x:0,z:0},{x:10,z:0},{x:10,z:10}],levelM:5,talusM:4});
 removeSettlement(p,'composition-welcome-village');
 assert.deepEqual(p.world.terrain.archipelago.earthworks.map(w=>w.id),['manual:pad']);
});

test('regenerating stories keeps locked hosts, their dialogue and their quests', () => {
 const p=buildHarvestIsland();for(const l of planCirculationLinks(p,terrainAccessContext(p)).paths)putPath(p,l);
 const first=planActivityStories(p);assert.ok(first.hosts.length);
 const host=first.hosts.find(h=>Object.values(p.libraries.questCatalog).some(q=>q.giverId===h)),dialogue=p.libraries.dialogues[host+'-talk'];dialogue.lines[0].text='Texte retouché';
 const quests=Object.values(p.libraries.questCatalog).filter(q=>q.giverId===host).map(q=>q.questKey);
 const q0=p.libraries.questCatalog[quests[0]];q0.bindings.title='Titre retouché';
 const again=planActivityStories(p,{keep:new Set([host])});
 assert.ok(p.entityIndex[host]);assert.equal(p.libraries.dialogues[host+'-talk'].lines[0].text,'Texte retouché');
 assert.equal(p.libraries.questCatalog[quests[0]].bindings.title,'Titre retouché');
 assert.ok(!again.hosts.includes(host),'kept host not recreated');
 assert.equal(Object.keys(p.entityIndex).filter(id=>id.startsWith('host:'+host.split(':')[1]+':')).length,1,'no duplicate host for the family');
});

test('stories and seabed edits are real, undoable transactions (no shared-draft mutation)', async () => {
 const {CommandBus}=await import('../src/studio-core/commands.ts'),{editDocument}=await import('../src/studio-core/edit.ts');
 const p=buildHarvestIsland();for(const l of planCirculationLinks(p,terrainAccessContext(p)).paths)putPath(p,l);
 const before=JSON.stringify(p),bus=new CommandBus(p,()=>{});
 const t=editDocument(bus,'Histoires',Object.keys(p.chunkIndex),d=>{planActivityStories(d);});
 assert.ok(t&&t.patches.length>0);assert.notEqual(JSON.stringify(p),before);
 bus.undo();assert.equal(JSON.stringify(p),before,'undo restores hosts, dialogues and quests exactly');
 const t2=editDocument(bus,'Fonds',[],d=>{d.world.terrain=structuredClone(d.world.terrain);d.world.terrain.archipelago.bathymetry={shelfDepthM:9,shelfWidthM:320,dropWidthM:180,features:[]};});
 assert.ok(t2&&t2.patches.some(x=>x.path.join('/').includes('bathymetry')||x.path.join('/').includes('terrain')));
 bus.undo();assert.equal(JSON.stringify(p),before);
});
