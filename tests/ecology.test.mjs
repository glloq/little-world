import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BIOMES,creaturePosition,generateEcologySector,habitatAllows,sampleBiome} from '../src/biomes.ts';
import {createEcology} from '../src/ecology.ts';

test('ecology generation is deterministic and independently seeded by sector',()=>{
  const a=generateEcologySector(1284,-1,-3);
  assert.deepEqual(a,generateEcologySector(1284,-1,-3));
  assert.notDeepEqual(a,generateEcologySector(1285,-1,-3));
  assert.notDeepEqual(a,generateEcologySector(1284,-1,-2));
  assert.equal(Object.keys(BIOMES).length,7);
  assert.equal(sampleBiome(0,250),'coast');
});
test('plants and wildlife satisfy habitats and fish remain underwater throughout their paths',()=>{
  let fish=0,plants=0;
  for(let cx=-2;cx<=1;cx++)for(let cz=-6;cz<=5;cz++){
    const sector=generateEcologySector(1284,cx,cz,2);
    for(const plant of sector.plants){plants++;assert.ok(habitatAllows(plant.kind,plant.x,plant.y,plant.z));}
    for(const site of sector.creatures){
      assert.ok(habitatAllows(site.kind,site.x,site.y,site.z));
      if(site.kind==='fish'){
        fish++;
        for(let t=0;t<40;t+=.23){const p=creaturePosition(site,t);assert.ok(habitatAllows('fish',p.x,p.y,p.z));}
      }
    }
  }
  assert.ok(fish>10);assert.ok(plants>100);
});
test('density zero disables all populations',()=>{
  const sector=generateEcologySector(1,0,0,0);
  assert.equal(sector.plants.length,0);assert.equal(sector.creatures.length,0);
});
test('ecology keeps a bounded resident cache and disposes instance and shared resources',()=>{
  const root=new THREE.Group(),system=createEcology(root,1284,1);
  for(let i=0;i<18;i++)system.update(.016,i,-50,-170);
  assert.equal(system.stats.sectors,9);
  assert.ok(system.stats.plants>0);
  let instancesDisposed=0,geometriesDisposed=0,materialsDisposed=0;
  const geometries=new Set(),materials=new Set();
  root.traverse(o=>{if(o instanceof THREE.InstancedMesh){o.addEventListener('dispose',()=>instancesDisposed++);geometries.add(o.geometry);materials.add(o.material);}});
  for(const geometry of geometries)geometry.addEventListener('dispose',()=>geometriesDisposed++);
  for(const material of materials)material.addEventListener('dispose',()=>materialsDisposed++);
  for(let i=0;i<120;i++){system.update(.016,i,i*20,-170);assert.ok(system.stats.sectors<=25);}
  assert.ok(instancesDisposed>0);
  assert.equal(geometriesDisposed,0,'evicting instances must preserve shared geometry');
  system.dispose();assert.equal(root.children.length,0);assert.equal(system.stats.sectors,0);
  assert.equal(geometriesDisposed,geometries.size);assert.equal(materialsDisposed,materials.size);
  system.dispose();assert.equal(geometriesDisposed,geometries.size);
});

test('local ecology refresh preserves distant instance buffers and recreates only touched sectors',()=>{
  const root=new THREE.Group(),system=createEcology(root,1284,1);
  for(let i=0;i<12;i++)system.update(.016,i,-50,-170);
  const ecology=root.children[0],untouched=ecology.children.find(g=>g.name==='Ecology -3:-5');
  assert.ok(untouched);
  system.refresh(-50,-170,3);
  assert.ok(system.stats.sectors<9);
  assert.ok(ecology.children.includes(untouched));
  for(let i=0;i<12;i++)system.update(.016,i,-50,-170);
  assert.equal(system.stats.sectors,9);
  assert.ok(ecology.children.includes(untouched));system.dispose();
});
