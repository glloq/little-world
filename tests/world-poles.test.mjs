import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCHITECTURE_STYLES,HOUSE_LOOKS,houseStylesFor,LEGACY_AUTO_HOUSES} from '../src/settlements/architecture.ts';
import {HABITAT_STYLES} from '../src/settlements/habitat.ts';
import {validateSettlementRecipe,newSettlement} from '../src/settlements/schema.ts';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {auditLandUse} from '../src/studio-core/land-registry.ts';
import {parseProject} from '../src/studio-core/schema.ts';

test('architecture catalog: every style has a look, legacy auto draw unchanged', () => {
 for(const s of HABITAT_STYLES)assert.ok(HOUSE_LOOKS[s],s);
 for(const a of Object.values(ARCHITECTURE_STYLES))for(const h of a.houses)assert.ok(HABITAT_STYLES.includes(h));
 assert.deepEqual([...HABITAT_STYLES.slice(0,3)],[...LEGACY_AUTO_HOUSES]);
 assert.deepEqual(houseStylesFor(undefined),LEGACY_AUTO_HOUSES);
 const world={worldId:'w',seed:1,bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100}};
 assert.equal(validateSettlementRecipe({...newSettlement(world,'v'),architecture:'alpine',role:'mountain'},world).architecture,'alpine');
 assert.throws(()=>validateSettlementRecipe({...newSettlement(world,'v'),architecture:'gothic'},world));
 assert.throws(()=>validateMapRequirements({...newIslandRequirements(),poles:[{role:'castle',size:'hamlet'}]}));
});

test('themed poles: complementary villages, field belt, no incompatible overlap', () => {
 const r={...newIslandRequirements(),seed:17,architecture:'tropical',earthworks:true,poles:[{role:'fishing',size:'village'},{role:'farming',size:'hamlet'}]};
 const c=composeWorld(r,'Poles',{projectId:'poles',worldId:'poles'});
 assert.ok(c.ready,JSON.stringify(c.diagnostics.filter(d=>d.severity==='ERROR')));
 const settlements=Object.values(c.project.libraries.settlements);
 assert.ok(settlements.length>=3,String(settlements.length));
 const fishing=settlements.find(s=>s.recipe.role==='fishing'),farming=settlements.find(s=>s.recipe.role==='farming');
 assert.ok(fishing&&farming);assert.equal(fishing.recipe.layout.pattern,'fishing');
 for(const s of settlements)for(const b of s.buildings){const e=c.project.chunks[c.project.entityIndex[b.id].ownerChunkId].entities[b.id];assert.ok(ARCHITECTURE_STYLES.tropical.houses.includes(e.components.Visual.assetId.replace('settlement.house_','')));}
 assert.ok(Object.keys(c.project.libraries.zones).some(id=>id.startsWith(farming.id+'-belt-')),'field belt');
 for(let i=0;i<settlements.length;i++)for(let j=i+1;j<settlements.length;j++)assert.ok(Math.hypot(settlements[i].recipe.center.x-settlements[j].recipe.center.x,settlements[i].recipe.center.z-settlements[j].recipe.center.z)>250);
 assert.deepEqual(auditLandUse(c.project),[]);
 assert.deepEqual(parseProject(JSON.parse(JSON.stringify(c.project))),c.project);
});
