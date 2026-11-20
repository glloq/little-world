import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSurfIsland,SURF_ISLAND} from '../tools/generate-surf-island.mjs';
import {validateSurfZone} from '../src/surf/wave-field.ts';
import {validateRace} from '../src/gameplay/races.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {validateBirthPort} from '../src/studio-core/birth-port.ts';
test('dedicated surf island compiles a real N1 port and three disjoint A/B/C wave zones',()=>{
 const {project,port,plan,homes}=buildSurfIsland();
 assert.equal(project.world.worldId,SURF_ISLAND.worldId);
 assert.equal(plan.beaches.length,3,plan.warnings.join('; '));
 assert.ok(port.boat&&port.trade&&port.shore,'port uses real authored assets');
 assert.equal(validateBirthPort(project).length,0,'N1 authored port must survive source round-trip');
 const village=project.libraries.settlements['composition-welcome-village'];
 assert.ok(homes>=4);
 assert.equal(village.buildings.length,homes);
 assert.ok(Object.values(project.chunks).some(chunk=>Object.values(chunk.entities).some(entity=>entity.components.Resident)));
 assert.ok(project.libraries.objectives['composition-welcome-village-meet-neighbor']);
 assert.equal(Object.keys(project.libraries.surfZones??{}).length,3);
 assert.equal(Object.keys(project.libraries.races??{}).length,3);
 assert.ok(Object.keys(project.assets).some(id=>id.startsWith('maritime.')),'real port assets registered');
 assert.equal(parseProject(project).world.worldId,SURF_ISLAND.worldId);
 assert.equal(Object.values(project.entityIndex).filter(entity=>entity.id.startsWith('surf-shore:')).length,9);
 for(const b of plan.beaches){
  assert.equal(validateSurfZone(b.zone),b.zone);
  assert.equal(validateRace(b.gates,project.world.bounds),b.gates);
  assert.equal(b.gates.gates.length,4);
 }
 const [a,b,c]=plan.beaches;
 assert.equal(a.zone.barrelStrength,0);
 assert.ok(b.zone.barrelStrength>0);
 assert.ok(c.features.some(f=>f.kind==='boost'));
 assert.ok(c.features.some(f=>f.kind==='ramp'));
 for(let i=0;i<plan.beaches.length;i++)for(let j=i+1;j<plan.beaches.length;j++){
  const x=plan.beaches[i].zone,y=plan.beaches[j].zone;
  assert.ok(x.maxX<=y.minX||y.maxX<=x.minX||x.maxZ<=y.minZ||y.maxZ<=x.minZ,
   'beaches must never share a water-owned rectangle');
 }
 assert.ok(plan.beaches.every(b=>Math.hypot(b.start.x-port.boat.x,b.start.z-port.boat.z)>105),
  'calm harbour stays separated from breaking waves');
});
