import {StudioSession} from '../src/studio/session.ts';
import {defaultStudioContext} from '../src/studio-core/context.ts';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compileProject,preflightProject} from '../src/world-compiler/compile.ts';
import test from 'node:test';import assert from 'node:assert/strict';
import {composeWorld,projectFromComposition} from '../src/studio-core/world-composition.ts';
import {DEFAULT_MAP_REQUIREMENTS,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {selectIslandStyle} from '../src/studio-core/island-styles.ts';
import {DEFAULT_LAYOUT,validateLayout} from '../src/studio-core/terrain-sites.ts';
import {planWorldTerrain} from '../src/studio-core/world-terrain-planner.ts';
import {simpleOutline,validateCompositionDraft} from '../src/studio-core/composition-draft.ts';
import {archipelagoField,compilePolygon} from '../src/geography/archipelago.ts';
import {terrainAccessContext,validateTerrainAccess} from '../src/studio-core/terrain-access.ts';
import {editTerrainSite,cultivateTerrainSite,assertTerrainSiteLocks,previewTerrainAccess,applyTerrainAccess,removeTerrainSite} from '../src/studio-core/terrain-site-edits.ts';
import {inspectGroundSegment,planGroundRoute} from '../src/paths/terrain-route.ts';
import {readProjectArchive,writeProjectArchive} from '../src/studio-core/archive.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {fingerprint} from '../src/world-production/landscape-schema.ts';
import {previewWorldRecomposition} from '../src/studio-core/world-recomposition.ts';
import {compileWaterNetwork} from '../src/water/profile.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
const request=(silhouette='crescent',extra={})=>{const r=selectIslandStyle(DEFAULT_MAP_REQUIREMENTS,'gentle');return {...r,compositionVersion:5,islandStyle:{...r.islandStyle,silhouette},layout:{...DEFAULT_LAYOUT,harbor:true,farms:2,lake:true},...extra};};
const resolveAsset=async asset=>{const bytes=await readFile(new URL('../public/'+asset.file,import.meta.url));return {hash:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.byteLength};};
const cache=new Map();const plan=shape=>{if(!cache.has(shape))cache.set(shape,composeWorld(request(shape)));return cache.get(shape);};
test('composed configuration is explicit and older styles remain versioned',()=>{
 const r=request();assert.deepEqual(validateMapRequirements(r),r);assert.throws(()=>validateMapRequirements({...r,compositionVersion:4}));
 for(const v of [{farms:5},{farms:.5},{maxSlope:0},{harbor:1},{version:2},{unknown:1}])assert.throws(()=>validateLayout({...DEFAULT_LAYOUT,...v}));
 assert.throws(()=>validateMapRequirements({...r,islandStyle:{...r.islandStyle,model:'caldera'}}));
});
test('organic crescent and turtle contours are simple and fit extreme world frames',()=>{
 for(const shape of ['crescent','turtle'])for(const [width,length,orientation]of [[4000,3000,0],[500,8000,35],[8000,500,90]])for(const seed of [4242,17,19001]){
  const r=request(shape,{width,length,seed});r.islandStyle.orientation=orientation;
  const t=planWorldTerrain(r),points=t.terrain.landmasses[0].outline;assert.equal(points.length,64);assert.ok(simpleOutline(points));assert.ok(points.every(p=>Math.abs(p.x)<=width/2&&Math.abs(p.z)<=length/2));
 }
 const r=request('crescent'),t=planWorldTerrain(r),f=archipelagoField({width:r.width,length:r.length,seed:r.seed,seaLevel:0},t.terrain);
 for(let z=0;z<=1400;z+=20)assert.ok(f.height(0,z)<0,'Bay opens toward the lower map edge');
 assert.equal(planWorldTerrain(request('turtle',{type:'archipelago'})).terrain.landmasses.length,3,'Optional satellite islands are preserved');
 const turtle=planWorldTerrain(request('turtle')),inside=compilePolygon(turtle.terrain.landmasses[0].outline);assert.ok(inside(0,0)>0);assert.ok(inside(0,-900)>0,'Head is connected to the body');assert.ok(inside(700,-500)>0,'Fore-flipper forms a real peninsula');
});
test('both silhouettes produce actual flat reservations, a bounded lake and dry graded native paths',()=>{
 for(const shape of ['crescent','turtle']){
  const result=plan(shape),p=result.project;assert.ok(result.ready,JSON.stringify(result.diagnostics));const sites=p.libraries.terrainPlans['composition-layout'].sites;
  assert.equal(sites.length,4);assert.equal(sites.filter(s=>s.kind==='farm').length,2);assert.ok(sites.some(s=>s.kind==='lake'&&p.libraries.water[s.waterId]?.kind==='lake'));
  const c=terrainAccessContext(p);assert.deepEqual(validateTerrainAccess(p),[]);
  for(const site of sites.filter(s=>s.kind!=='lake')){
   const f=p.world.terrain.archipelago.features.find(f=>f.id===site.featureId),inside=compilePolygon(f.polygon);
   for(const q of f.polygon.map(q=>({x:site.entry.x+(q.x-site.entry.x)*.5,z:site.entry.z+(q.z-site.entry.z)*.5})))if(inside(q.x,q.z)>5){assert.ok(!c.wet(q.x,q.z));assert.ok(Math.abs(c.height(q.x,q.z)-f.heightM)<.1,site.name+' is really level');}
  }
  assert.ok(Object.keys(p.libraries.paths).length>=3);
  for(const water of compileWaterNetwork(Object.values(p.libraries.water),projectGeography(p).source,0))assert.ok(!water.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE'||d.code==='LAKE_SPILL'),JSON.stringify(water.diagnostics));
  assert.deepEqual(readProjectArchive(writeProjectArchive(p)),p);
 }
 const port=plan('crescent').project.libraries.terrainPlans['composition-layout'].sites.find(s=>s.kind==='harbor');assert.ok(Math.abs(port.entry.x)<200,'Harbor is on the inner central shore');
});
test('ground access cannot jump over water, a cliff, or width clearance',()=>{
 const bounds={minX:-150,maxX:150,minZ:-150,maxZ:150},policy={maxSlope:.2,widthM:4,maxCells:1024},a={x:-100,z:0},b={x:100,z:0};
 const cliff={bounds,seaLevel:0,height:x=>x<0?10:70,wet:()=>false};assert.equal(inspectGroundSegment(a,b,cliff,policy).valid,false);assert.equal(planGroundRoute(a,b,cliff,policy).points.length,0);
 const sea={bounds,seaLevel:0,height:(x,z)=>Math.abs(x)<20?-8:10,wet:()=>false};assert.equal(planGroundRoute(a,b,sea,policy).points.length,0);
 const narrow={bounds,seaLevel:0,height:()=>10,wet:(x,z)=>Math.abs(z)>1};assert.equal(inspectGroundSegment(a,b,narrow,policy).valid,false);
 const hill={bounds,seaLevel:0,height:(x,z)=>10+Math.max(0,35-Math.hypot(x,z)*.5),wet:()=>false};const route=planGroundRoute(a,b,hill,policy);assert.ok(route.points.length>2);assert.ok(route.points.some(p=>Math.abs(p.z)>40),'Detours around a slope instead of inventing a ramp');
});
test('zone movement and height edits keep lake supports together and flag old paths for repair',()=>{
 const p=structuredClone(plan('turtle').project),site=p.libraries.terrainPlans['composition-layout'].sites.find(s=>s.kind==='lake'),oldWater=structuredClone(p.libraries.water[site.waterId]),oldPlatform=p.world.terrain.archipelago.features.find(f=>f.id===site.featureId);
 editTerrainSite(p,site.id,{dx:35,dz:10,heightM:oldPlatform.heightM+4});const moved=p.libraries.water[site.waterId];
 assert.equal(moved.points[0].x,oldWater.points[0].x+35);assert.equal(moved.level,oldWater.level+4);assert.ok(validateTerrainAccess(p).some(d=>d.code==='SITE_ACCESS_INVALID'));
 assert.deepEqual(parseProject(p),p);const checked=validateCompositionDraft(plan('turtle'),p);assert.ok(checked.diagnostics.some(d=>d.code==='SITE_ACCESS_INVALID'));
 assert.equal(fingerprint(projectFromComposition(checked,'Retouched').world.terrain),fingerprint(p.world.terrain));
});
test('locks protect source geometry and water; automatic routing preserves authored paths',()=>{
 const p=structuredClone(plan('crescent').project),site=p.libraries.terrainPlans['composition-layout'].sites[0];editTerrainSite(p,site.id,{locked:true});
 assert.throws(()=>editTerrainSite(p,site.id,{dx:10}));const after=structuredClone(p);after.world.terrain.archipelago.features.find(f=>f.id===site.featureId).heightM+=1;assert.throws(()=>assertTerrainSiteLocks(p,after));
 editTerrainSite(p,site.id,{locked:false});const edge=p.libraries.terrainPlans['composition-layout'].access.find(e=>e.pathId);p.libraries.paths[edge.pathId].width=4;assert.throws(()=>previewTerrainAccess(p));
 const clean=structuredClone(plan('crescent').project),preview=previewTerrainAccess(clean),changed=structuredClone(clean);changed.manifest.name='New';assert.throws(()=>applyTerrainAccess(changed,preview));
 applyTerrainAccess(clean,preview);assert.deepEqual(validateTerrainAccess(clean),[]);assert.deepEqual(parseProject(clean),clean);
});
test('removing a group preserves hand-edited paths and global recomposition protects reservations',()=>{
 const p=structuredClone(plan('crescent').project),site=p.libraries.terrainPlans['composition-layout'].sites.find(s=>s.kind==='farm'),edge=p.libraries.terrainPlans['composition-layout'].access.find(e=>e.from===site.id||e.to===site.id);p.libraries.paths[edge.pathId].width=4;
 removeTerrainSite(p,site.id);assert.ok(p.libraries.paths[edge.pathId]);assert.ok(!p.world.terrain.archipelago.features.some(f=>f.id===site.featureId));assert.deepEqual(parseProject(p),p);
 const locked=structuredClone(plan('turtle').project);editTerrainSite(locked,locked.libraries.terrainPlans['composition-layout'].sites[0].id,{locked:true});assert.throws(()=>previewWorldRecomposition(locked,request('crescent')));
 const swapped=previewWorldRecomposition(plan('crescent').project,request('turtle')).project;assert.equal(swapped.world.generation.islandStyle.silhouette,'turtle');assert.deepEqual(parseProject(swapped),swapped);
});

test('agricultural reservations become native planted plots and move with their platform',()=>{
 const p=structuredClone(plan('turtle').project),site=p.libraries.terrainPlans['composition-layout'].sites.find(s=>s.kind==='farm');
 cultivateTerrainSite(p,site.id);const updated=p.libraries.terrainPlans['composition-layout'].sites.find(s=>s.id===site.id),old=structuredClone(p.libraries.zones[updated.farmZoneId]);
 assert.equal(old.farm.initialCrop,'wheat');assert.equal(old.kind,'farm-plot');editTerrainSite(p,site.id,{dx:10,dz:5});
 assert.equal(p.libraries.zones[updated.farmZoneId].polygon[0].x,old.polygon[0].x+10);assert.deepEqual(parseProject(p),p);
 removeTerrainSite(p,site.id);assert.equal(p.libraries.zones[updated.farmZoneId],undefined);assert.deepEqual(parseProject(p),p);
});
test('compiled terrain retains real platforms and required access failures block preflight',async()=>{
 const p=structuredClone(plan('crescent').project),compiled=await compileProject(p,{resolveAsset});assert.ok(compiled.manifest.terrain.archipelago.features.some(f=>f.surface));assert.ok(!compiled.diagnostics.some(d=>d.severity==='ERROR'));
 const broken=structuredClone(p);broken.world.generation.layout.accessRequired=true;
 const site=broken.libraries.terrainPlans['composition-layout'].sites.find(s=>s.kind==='farm');editTerrainSite(broken,site.id,{dx:10});
 const preflight=await preflightProject(broken,{resolveAsset});assert.ok(preflight.diagnostics.some(d=>d.severity==='ERROR'&&d.code==='SITE_ACCESS_INVALID'));
});

test('the common session rejects edits through other tools when a reservation is locked',async()=>{
 const p=structuredClone(plan('turtle').project),site=p.libraries.terrainPlans['composition-layout'].sites.find(s=>s.kind==='farm'),stored={document:p,revision:0,journal:null,checkpointId:null,context:defaultStudioContext(p.manifest.projectId,p.manifest.worldId)},store={loadChunks:async()=>({}),saveChanges:async()=>1},session=new StudioSession(store,stored);
 await session.change('Lock reservation',[],d=>editTerrainSite(d,site.id,{locked:true}));const before=fingerprint(p.world.terrain);
 await assert.rejects(session.change('Edit from another tool',[],d=>{d.world.terrain=structuredClone(d.world.terrain);d.world.terrain.archipelago.features.find(f=>f.id===site.featureId).heightM+=5;}));
 assert.equal(fingerprint(p.world.terrain),before);session.commands.undo();assert.equal(p.libraries.terrainPlans['composition-layout'].sites.find(s=>s.id===site.id).locked,false);await session.flush();
});

test('a reserved lake with an opened shore is rejected without blocking artistic legacy water globally',()=>{
 const p=structuredClone(plan('turtle').project),site=p.libraries.terrainPlans['composition-layout'].sites.find(s=>s.kind==='lake');
 p.libraries.water[site.waterId].level+=20;assert.ok(validateTerrainAccess(p).some(d=>d.code==='SITE_LAKE_BERMS'&&d.severity==='ERROR'));
 assert.equal(validateCompositionDraft(plan('turtle'),p).ready,false);
});
