import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_BRIEFS,briefToRequirements,validateWorldBrief,composeBrief} from '../src/studio-core/world-brief.ts';
import {collectActivitySites} from '../src/studio-core/activity-sites.ts';
import {auditLandUse} from '../src/studio-core/land-registry.ts';
import {circulationReport,buildCirculationGraph} from '../src/studio-core/circulation.ts';
import {ARCHITECTURE_STYLES} from '../src/settlements/architecture.ts';

test('every example brief maps to valid V5 requirements with coherence options on', () => {
 for(const b of Object.values(WORLD_BRIEFS)){
  const r=briefToRequirements(b);
  assert.equal(r.compositionVersion,5);assert.ok(r.earthworks&&r.circulation&&r.stories);
  assert.equal(r.seed,b.seed);assert.deepEqual(r.poles,b.poles);
 }
 const tropical=briefToRequirements(WORLD_BRIEFS['tropical-port']);
 assert.equal(tropical.architecture,'tropical');assert.equal(tropical.underwater.shelf,'wide');assert.ok(tropical.underwater.reefs>=2&&tropical.underwater.diveSites);
 assert.ok(tropical.activities.surf&&tropical.activities.flight);
 assert.equal(briefToRequirements(WORLD_BRIEFS['alpine-resort']).activities.skiResort,true);
 assert.throws(()=>validateWorldBrief({...WORLD_BRIEFS['surf-coast'],climate:'lunar'}));
 assert.throws(()=>validateWorldBrief({...WORLD_BRIEFS['surf-coast'],poles:[{role:'castle',size:'hamlet'}]}));
});

test('a themed brief composes a coherent, playable world without island-specific code', () => {
 const c=composeBrief(WORLD_BRIEFS['surf-coast']);
 assert.ok(c.ready,JSON.stringify(c.diagnostics.filter(d=>d.severity==='ERROR')));
 const p=c.project,kinds=collectActivitySites(p).map(s=>s.kind);
 assert.equal(kinds.filter(k=>k==='surf').length,3);assert.ok(kinds.includes('race-roll'));
 const settlements=Object.values(p.libraries.settlements);assert.ok(settlements.length>=2);
 for(const s of settlements)assert.equal(s.recipe.architecture,'fishing');
 for(const s of settlements)for(const b of s.buildings){const e=p.chunks[p.entityIndex[b.id].ownerChunkId].entities[b.id];assert.ok(ARCHITECTURE_STYLES.fishing.houses.includes(e.components.Visual.assetId.replace('settlement.house_','')));}
 assert.deepEqual(auditLandUse(p),[]);
 const reach=circulationReport(buildCirculationGraph(p));assert.ok(reach.reachable/reach.destinations.length>=.8,`${reach.reachable}/${reach.destinations.length}`);
 assert.ok(Object.keys(p.libraries.questCatalog).length>=3);
 assert.ok(Object.keys(p.entityIndex).some(id=>id.startsWith('host:surf')));
});
