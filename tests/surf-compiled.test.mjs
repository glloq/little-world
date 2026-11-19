import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';

const resolver=async()=>({hash:'0'.repeat(64),byteLength:100});
const zone={id:'surf:bay',minX:-120,maxX:120,minZ:-120,maxZ:120,dirX:0,dirZ:1,
 seaLevel:0,amplitude:1.2,wavelength:32,speed:6.2,seed:42,shoreFadeDepth:3,edgeFade:12,barrelStrength:.85};
const ramp={id:'surf-feature:kicker',kind:'ramp',x:0,z:40,dirX:0,dirZ:1,radius:4.5,power:1.5,cooldownTicks:150};
const build=()=>{
 const project=createProject({name:'Surf compiler fixture',width:640,length:640,seed:4234,
   projectId:'surf-compiler-fixture',worldId:'surf-compiler-world'});
 project.libraries.surfZones={[zone.id]:zone};
 project.libraries.surfFeatures={[ramp.id]:ramp};
 return project;
};
const fetcher=files=>async url=>{
 const path=new URL(url).pathname.replace(/^\/surf-fixture\//,'');
 return Object.hasOwn(files,path)?new Response(files[path]):new Response('',{status:404});
};
test('surf zones and aquatic modules survive V3 authoring, archive, compilation and playable load',async()=>{
 const original=build(),project=parseProject(original);
 assert.deepEqual(project.libraries.surfZones[zone.id],zone);
 assert.deepEqual(project.libraries.surfFeatures[ramp.id],ramp);
 const archived=readProjectArchive(writeProjectArchive(project));
 assert.deepEqual(archived.libraries.surfZones[zone.id],zone);
 assert.deepEqual(archived.libraries.surfFeatures[ramp.id],ramp);
 const compiled=await compileProject(archived,{resolveAsset:resolver});
 const bundle=await openCompiledWorld('http://localhost/surf-fixture/manifest.json',fetcher(compiled.files));
 const playable=playableFromCompiled(bundle);
 assert.deepEqual(playable.surfZones,[zone]);
 assert.deepEqual(playable.surfFeatures,[ramp]);
});
test('old projects remain valid; unsafe surf definitions reject before compile',()=>{
 const clean=createProject({name:'Without surf',width:640,length:640});
 assert.doesNotThrow(()=>parseProject(clean));
 const bad=build();bad.libraries.surfFeatures[ramp.id].x=300;
 assert.throws(()=>parseProject(bad),/Module surf|hors de zone/);
 const wrong=build();wrong.libraries.surfZones[zone.id].dirZ=3;
 assert.throws(()=>parseProject(wrong),/Zone de surf invalide/);
 const unsafeBarrel=build();unsafeBarrel.libraries.surfZones[zone.id].barrelStrength=2;
 assert.throws(()=>parseProject(unsafeBarrel),/Zone de surf invalide/);
});
test('optional swell style survives authoring, archive, compilation and playable load',async()=>{
 // Fresh literal: earlier tests mutate the shared fixture object.
 const clean={id:'surf:bay',minX:-120,maxX:120,minZ:-120,maxZ:120,dirX:0,dirZ:1,
  seaLevel:0,amplitude:1.2,wavelength:32,speed:6.2,seed:42,shoreFadeDepth:3,edgeFade:12,barrelStrength:.85};
 const styled=build();styled.libraries.surfZones[zone.id]={...clean,style:'tubular'};styled.libraries.surfFeatures={};
 const project=parseProject(styled);
 assert.equal(project.libraries.surfZones[zone.id].style,'tubular');
 const archived=readProjectArchive(writeProjectArchive(project));
 const compiled=await compileProject(archived,{resolveAsset:resolver});
 const bundle=await openCompiledWorld('http://localhost/surf-fixture/manifest.json',fetcher(compiled.files));
 assert.deepEqual(playableFromCompiled(bundle).surfZones,[{...clean,style:'tubular'}]);
 const invalid=build();invalid.libraries.surfZones[zone.id]={...clean,style:'tsunami'};invalid.libraries.surfFeatures={};
 assert.throws(()=>parseProject(invalid),/Zone de surf invalide/);
});
