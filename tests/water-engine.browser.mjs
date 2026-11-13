import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.argv[2]??'http://127.0.0.1:5189/little-world/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.goto(base+'studio/');
 const result=await page.evaluate(async()=>{
  const {buildWorld}=await import('/little-world/src/world.ts'),t=await import('/little-world/src/terrain.ts'),{defaultWorld}=await import('/little-world/src/world-data.ts');
  const definition=defaultWorld();definition.config.density=0;definition.npcs=[];
  definition.water=[{id:'stream',points:[{x:-40,z:-250},{x:-40,z:-180},{x:-40,z:-100}],width:10,depth:2,level:4,profile:{mode:'terrain',offset:-.35}}];
  const world=buildWorld(definition.config,definition),mesh=world.root.getObjectByName('Water:stream'),positions=mesh.geometry.getAttribute('position');
  const first=positions.getY(0),last=positions.getY(positions.count-1),logical=t.waterSurface(-40,-250);let disposed=false;mesh.geometry.addEventListener('dispose',()=>disposed=true);
  const depth=t.waterDepth(-40,-180),submerged=t.cameraSubmerged(-40,t.waterSurface(-40,-180)-1,-180);
  definition.terrain=[{id:'rise',x:-40,z:-250,radius:12,strength:1,mode:'raise',height:0}];t.configureTerrain(definition.config,definition.terrain,definition.water);
  const changed=world.refreshWater(),after=world.root.getObjectByName('Water:stream').geometry.getAttribute('position').getY(0);
  const stable=world.refreshWater().length===0;
  t.configureTerrain(definition.config,definition.terrain,[]);world.refreshWater();const removed=!world.root.getObjectByName('Water:stream');world.dispose();
  return {first,last,logical,depth,submerged,disposed,changed,after,stable,removed};
 });
 assert.ok(result.first-result.last>10,'Rendered ribbon must descend');assert.ok(Math.abs(result.first-result.logical-.04)<1e-5,'Rendering and logical water must agree');assert.ok(result.depth>=2&&result.submerged,'Swimming/camera use the same water');assert.ok(result.disposed&&result.changed.includes('stream'),'Rebuild must dispose old GPU geometry');assert.ok(Math.abs(result.after-result.first-1)<1e-5,'Terrain edits must update rendered altitude');assert.ok(result.stable&&result.removed,'No-op refresh and removal must work');
 console.log(JSON.stringify({checks:6,result}));
}finally{await browser.close();}
