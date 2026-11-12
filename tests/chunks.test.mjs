import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {chunkBounds,planChunks} from '../src/chunks.ts';
import {createChunkGeometry,createTerrainView} from '../src/terrain-view.ts';
const config={width:2000,length:2000,chunkSize:64,viewDistance:180};

test('finite chunks have stable identifiers and clamp partial edge bounds',()=>{
  const edge=chunkBounds(config,31,31);
  assert.equal(edge.id,'31:31');assert.equal(edge.maxX,1000);assert.equal(edge.maxZ,1000);
  assert.equal(edge.minX,984);assert.equal(chunkBounds(config,32,0),null);
  assert.equal(chunkBounds(config,-1,0),null);
  const a=planChunks(config,0,0), b=planChunks(config,0,0);
  assert.deepEqual(a,b);
  assert.ok(a.every(c=>c.distance<=config.viewDistance));
  assert.deepEqual(new Set(a.map(c=>c.lod)),new Set([0,1,2]));
});
test('planning scales with the visible radius rather than map area',()=>{
  const small=planChunks({...config,width:1000,length:1000},0,0);
  const huge=planChunks({...config,width:200000,length:200000},0,0);
  assert.ok(huge.length<=64);assert.ok(Math.abs(huge.length-small.length)<12);
  const edge=planChunks(config,990,990);
  assert.ok(edge.length>0);assert.ok(edge.length<huge.length);
  assert.deepEqual(planChunks(config,2000,2000),[]);
  assert.throws(()=>planChunks({...config,chunkSize:0},0,0));
});
test('LOD meshes share exact surface samples and normals at adjoining chunk borders',()=>{
  const left=chunkBounds(config,15,15), right=chunkBounds(config,16,15);
  const fine=createChunkGeometry(left,0), coarse=createChunkGeometry(right,2);
  assert.ok(fine.index.count>coarse.index.count);
  const finePositions=fine.getAttribute('position'), coarsePositions=coarse.getAttribute('position');
  const fineNormals=fine.getAttribute('normal'), coarseNormals=coarse.getAttribute('normal');
  let matching=0;
  for(let j=0;j<coarse.userData.surfaceVertices;j++)if(coarsePositions.getX(j)===right.minX){
    for(let i=0;i<fine.userData.surfaceVertices;i++)if(finePositions.getX(i)===left.maxX&&finePositions.getZ(i)===coarsePositions.getZ(j)){
      assert.equal(finePositions.getY(i),coarsePositions.getY(j));
      assert.equal(fineNormals.getX(i),coarseNormals.getX(j));assert.equal(fineNormals.getY(i),coarseNormals.getY(j));
      matching++;break;
    }
  }
  assert.ok(matching>=5);
  assert.ok(finePositions.count>fine.userData.surfaceVertices,'skirts are distinct vertices');
  fine.dispose();coarse.dispose();
});
test('streaming builds incrementally, reuses stationary geometry, and retires distant meshes',()=>{
  const root=new THREE.Group(), view=createTerrainView(root,config);
  view.update(0,0);assert.equal(view.stats.built,2);assert.ok(view.stats.pending>0);
  while(view.stats.pending)view.update(0,0);
  const built=view.stats.built, resident=view.stats.resident;
  const initial=[...view.terrain.children];
  for(let i=0;i<30;i++)view.update(0,0);
  assert.equal(view.stats.built,built);assert.equal(view.stats.resident,resident);
  assert.deepEqual(view.terrain.children,initial);
  for(let x=-950;x<=950;x+=128){view.update(x,500);while(view.stats.pending)view.update(x,500);}
  assert.ok(view.stats.resident<=2*(Math.ceil(2*config.viewDistance/config.chunkSize)+3)**2);
  assert.ok(view.stats.disposed>0);
  assert.equal(view.stats.active,view.terrain.children.length);
  const disposed=view.stats.disposed;
  view.refresh(900,500,20);while(view.stats.pending)view.update(950,500);
  assert.ok(view.stats.disposed>disposed);
  view.dispose();assert.equal(view.stats.resident,0);assert.equal(view.stats.active,0);assert.equal(root.children.length,0);
  view.dispose();view.update(0,0);assert.equal(view.stats.resident,0);
});
test('recent chunks are reused on return and local edits preserve unrelated GPU resources',()=>{
  const cfg={width:1000,length:1000,chunkSize:64,viewDistance:100};
  const view=createTerrainView(new THREE.Group(),cfg);
  const drain=(x,z)=>{view.update(x,z);while(view.stats.pending)view.update(x,z);};
  drain(0,0);
  const original=new Map(view.terrain.children.map(mesh=>[`${mesh.userData.chunkId}/${mesh.userData.lod}`,mesh.geometry]));
  drain(32,0);drain(0,0);
  for(const mesh of view.terrain.children){
    const originalGeometry=original.get(`${mesh.userData.chunkId}/${mesh.userData.lod}`);
    if(originalGeometry)assert.equal(mesh.geometry,originalGeometry);
  }
  const distant=view.terrain.children.find(mesh=>mesh.geometry.boundingBox.min.x>0);
  assert.ok(distant);
  const preserved=distant.geometry;
  view.refresh(-60,-60,1);drain(0,0);
  assert.ok(view.terrain.children.some(mesh=>mesh.geometry===preserved));
  view.dispose();
});
