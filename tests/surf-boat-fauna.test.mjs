import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfWaveField} from '../src/surf/wave-field.ts';
import {followSurfSwell,BOAT_SWELL} from '../src/surf/boat-swell.ts';

const zone={id:'surf:boat',minX:-150,maxX:150,minZ:-200,maxZ:60,dirX:0,dirZ:1,seaLevel:0,amplitude:2,
 wavelength:46,speed:5.2,seed:7,shoreFadeDepth:3,edgeFade:20,style:'tubular'};
const field=createSurfWaveField(zone,(x,z)=>-12+Math.max(0,z+200)*.05);
test('a boat in a surf zone rides the swell height and slope instead of sinking under the crests',()=>{
 const boat={x:0,y:-.15,z:-150,heading:0};
 let minClear=Infinity;
 for(let t=0;t<300;t++){
  assert.equal(followSurfSwell(boat,field,t,1/30,()=>true,false),true);
  const h=field.height(boat.x,boat.z,t);
  minClear=Math.min(minClear,boat.y+BOAT_SWELL.draft-h);
  assert.ok(boat.waveNormal.y>0&&Math.abs(Math.hypot(boat.waveNormal.x,boat.waveNormal.y,boat.waveNormal.z)-1)<1e-9);
 }
 assert.ok(Math.abs(minClear)<1e-9,'hull always on the water surface');
 const flat={x:400,y:0,z:0,heading:0};
 assert.equal(followSurfSwell(flat,null,10,1/30,()=>true),false);
 assert.equal(flat.waveNormal,undefined,'flat water: no tilt');
});
test('steep faces push a boat gently shoreward, never into water too shallow to sail',()=>{
 const boat={x:0,y:0,z:-150,heading:0};
 for(let t=0;t<600;t++)followSurfSwell(boat,field,t,1/30,()=>true);
 assert.ok(boat.z>-150,'carried toward the shore');
 assert.ok(boat.z<-150+600/30*BOAT_SWELL.pushMax+1e-9,'bounded push');
 const blocked={x:0,y:0,z:-150,heading:0};
 for(let t=0;t<600;t++)followSurfSwell(blocked,field,t,1/30,()=>false);
 assert.equal(blocked.z,-150,'refused when the destination cannot be sailed');
});
import {fishUnderSurface} from '../src/ecology.ts';
test('decorative fish never swim in the air between two swell crests',()=>{
 for(let t=0;t<300;t+=7)for(let z=-180;z<=40;z+=11){
  const surface=field.height(5,z,t);if(surface===null)continue;
  const fish=fishUnderSurface(-.6,-.6,surface);
  if(!fish.hidden)assert.ok(fish.y<=surface-.35+1e-12,'below the surface at z '+z);
 }
 assert.deepEqual(fishUnderSurface(-1,-1,null),{y:-1,hidden:false},'outside surf zones: unchanged');
 assert.deepEqual(fishUnderSurface(-1,-1,.5),{y:-1,hidden:false},'already under a crest');
 assert.equal(fishUnderSurface(-.5,-.5,-3).hidden,true,'deep trough over a shallow fish: hidden');
});
