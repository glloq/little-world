import test from 'node:test';
import assert from 'node:assert/strict';
import {horizonGrid,horizonBlockData,horizonFar,visibleHorizonIndex} from '../src/horizon-view.ts';
import {configureTerrain,terrainHeight} from '../src/terrain.ts';
import {islandPreset} from '../src/terrain-generator.ts';

const bounds={width:3000,length:8000,seaLevel:0};
test('horizon budget stays bounded for every allowed project size',()=>{
  for(const [w,l] of [[200,600],[1000,1000],[3000,8000],[10000,10000]]){
    const g=horizonGrid(w,l),vertices=(Math.ceil(w/g.spacing)+1)*(Math.ceil(l/g.spacing)+1);
    assert.ok(vertices<=40000,`${w}x${l}: ${vertices} vertices`);
    assert.ok(g.columns*g.rows<=64,'block draw calls stay small');
  }
  assert.ok(horizonFar(3000,8000)>Math.hypot(3000,8000),'whole island diagonal is inside the far plane');
  assert.equal(horizonFar(200,600),Math.max(750,Math.hypot(200,600)+2500));
});
test('adjacent horizon blocks share identical edge vertices and fold the sea flat',()=>{
  configureTerrain({seed:4242,density:1,width:3000,length:8000,seaLevel:0,chunkSize:64,viewDistance:240,terrain:islandPreset(3000,8000)});
  const g=horizonGrid(3000,8000),a=horizonBlockData(bounds,g,0,3),b=horizonBlockData(bounds,g,1,3),c=horizonBlockData(bounds,g,0,4);
  const cells=g.blockCells,row=cells+1;
  for(let j=0;j<=cells;j++){
    const left=(j*row+cells)*3,right=j*row*3;
    assert.deepEqual([...a.positions.slice(left,left+3)],[...b.positions.slice(right,right+3)]);
  }
  for(let i=0;i<=cells;i++){const top=(cells*row+i)*3,bottom=i*3;assert.deepEqual([...a.positions.slice(top,top+3)],[...c.positions.slice(bottom,bottom+3)]);}
  let sea=0;
  for(let k=0;k<a.positions.length;k+=3){
    const h=terrainHeight(a.positions[k],a.positions[k+2]);
    if(h<0){sea++;assert.equal(a.positions[k+1],0);}else assert.ok(Math.abs(a.positions[k+1]-h)<1e-4);
  }
  assert.ok(sea>0,'western block contains open sea');
  const last=horizonBlockData(bounds,g,g.columns-1,g.rows-1);
  assert.equal(last.maxX,1500);assert.equal(last.maxZ,4000);
});
test('cells under displayed detail are left out of the horizon index',()=>{
  const full=new Uint16Array(2*2*6).map((_,i)=>i),out=new Uint16Array(full.length);
  assert.equal(visibleHorizonIndex(full,2,2,()=>false,out),24);
  const count=visibleHorizonIndex(full,2,2,(i,j)=>i===1&&j===0,out);
  assert.equal(count,18);
  assert.deepEqual([...out.slice(0,12)],[...full.slice(0,6),...full.slice(12,18)]);
  assert.equal(visibleHorizonIndex(full,2,2,()=>true,out),0);
});
