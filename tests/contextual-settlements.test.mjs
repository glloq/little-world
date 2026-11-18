import test from 'node:test';
import assert from 'node:assert/strict';
import {contextualSettlementFixture} from '../tools/context-settlement-fixture.mjs';
import {planSettlement} from '../src/settlements/planner.ts';
import {applySettlement} from '../src/settlements/authoring.ts';
import {validateSettlements} from '../src/settlements/validation.ts';
import {validateSettlementRecipe} from '../src/settlements/schema.ts';
import {settlementTerrain} from '../src/settlements/terrain.ts';
import {fingerprint} from '../src/world-production/landscape-schema.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {suggestSettlementSite} from '../src/settlements/site-search.ts';
for(const pattern of ['street','mountain','river','fishing'])test(pattern+' uses contextual native roads, dry lots and preserved source terrain',()=>{
 const {project:p,recipe:r}=contextualSettlementFixture(pattern),terrain=fingerprint(p.world.terrain),plan=planSettlement(p,r);
 assert.ok(plan.buildings.length>=10,JSON.stringify(plan.diagnostics));assert.ok(!plan.diagnostics.some(d=>d.severity==='ERROR'));const spine=plan.paths.find(p=>p.id===r.id+'-street-0');assert.ok(spine?.points.length>=5);assert.ok(!plan.paths.some(p=>p.id.includes('-street-ring-')));
 const c=settlementTerrain(p);assert.ok(spine.points.every(q=>!c.wet(q.x,q.z)&&c.height(q.x,q.z)>c.seaLevel+1));
 if(pattern==='mountain'){const heights=spine.points.map(q=>c.height(q.x,q.z));assert.ok(Math.min(...heights)>60);assert.ok(Math.max(...heights)-Math.min(...heights)<2);}
 if(pattern==='river'){assert.ok(spine.points.every(q=>q.z>-30));assert.ok(Math.max(...spine.points.map(q=>q.x))-Math.min(...spine.points.map(q=>q.x))>80);}
 if(pattern==='fishing')assert.ok(plan.entities.some(e=>e.components.State?.initial.shop==='port'));
 const reroll=planSettlement(p,{...r,houseVariation:3});assert.deepEqual(plan.paths,reroll.paths);applySettlement(p,plan);assert.deepEqual(validateSettlements(p),[]);assert.equal(fingerprint(p.world.terrain),terrain);assert.equal(p.libraries.settlements[r.id].recipe.layout.pattern,pattern);parseProject(p);
});
test('river and fishing layouts refuse a dry inland site rather than inventing water',()=>{for(const pattern of ['river','fishing']){const {project:p,recipe:r}=contextualSettlementFixture('street');r.layout.pattern=pattern;const plan=planSettlement(p,r);assert.ok(plan.diagnostics.some(d=>d.code==='SET_CONTEXT_SITE'&&d.severity==='ERROR'));assert.throws(()=>applySettlement(p,plan));}});
test('a river layout reacts to its actual water geometry and invalid shapes remain rejected',()=>{const {project:p,recipe:r}=contextualSettlementFixture('river'),a=planSettlement(p,r);for(const point of p.libraries.water.river.points)point.z-=20;const b=planSettlement(p,r);assert.notEqual(fingerprint(a.paths),fingerprint(b.paths));assert.throws(()=>validateSettlementRecipe({...r,layout:{...r.layout,pattern:'imaginary'}},p.world));});
test('site search for fishermen finds a real coast instead of the center of the plain',async()=>{const {project:p,recipe:r}=contextualSettlementFixture('fishing');r.center={x:0,z:0};r.targetBuildings=12;const found=await suggestSettlementSite(p,r);assert.ok(found.plan);assert.ok(found.plan.buildings.length>=8);applySettlement(p,found.plan);assert.deepEqual(validateSettlements(p),[]);});

test('a contextual house drag is relative to the accepted lot rather than its rejected initial candidate',()=>{const {project:p,recipe:r}=contextualSettlementFixture('river'),a=planSettlement(p,r),first=a.buildings[0],before=a.entities.find(e=>e.id===first.id).components.Transform.position,b=planSettlement(p,{...r,layout:{...r.layout,adjustments:[{slot:first.slot,dx:0,dz:1}]}}),after=b.entities.find(e=>e.id===first.id)?.components.Transform.position;assert.ok(after);assert.equal(after.x,before.x);assert.equal(after.z,before.z+1);assert.deepEqual(a.paths.filter(p=>p.id.includes('-street-')),b.paths.filter(p=>p.id.includes('-street-')));applySettlement(p,b);assert.deepEqual(validateSettlements(p),[]);});
