import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {parseProject} from '../src/studio-core/schema.ts';

const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const project=parseProject(JSON.parse(await readFile(new URL('../maps/island.project.json',import.meta.url),'utf8')));
const {ctx}=projectGeography(project),sea=project.world.seaLevel;
let shore;
search:for(let x=-1500;x<=900;x+=20)for(let z=900;z<1450;z++){
 const dry=ctx.height(x,z);
 if(Math.abs(x+200)>60&&dry>sea+.4&&dry<sea+6&&ctx.height(x,z+3.5)<sea-.6){shore={x,z};break search;}
}
assert.ok(shore,'A dry casting position next to seawater');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const touch of [false,true]){
  const page=await browser.newPage({viewport:{width:900,height:600},hasTouch:touch,isMobile:touch});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('little-world-quality','low'));
  await page.goto(base+'?metrics=1&spawn='+(shore.x+40)+','+(shore.z-60)+'&yaw=0');
  await page.locator('#start-overlay').waitFor({state:'hidden',timeout:100000});
  await page.evaluate(({x,z})=>{
   window.littleWorldDebug.grant('tool:fishing-rod',1);
   window.littleWorldDebug.teleport(x,z,0);
  },shore);
  const touchButton=page.locator('.touch-interact');
  const cdp=touch?await page.context().newCDPSession(page):null;
  async function down(){
   if(!cdp){await page.keyboard.down('KeyE');return;}
   const {x,y,width,height}=await touchButton.boundingBox();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:x+width/2,y:y+height/2}]});
  }
  async function up(){
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   else await page.keyboard.up('KeyE');
  }
  const waitTarget=(pattern,timeout=30000)=>page.waitForFunction(regex=>
    new RegExp(regex).test(window.littleWorldMetrics?.target??''),pattern,{timeout});
  const fishCount=()=>page.evaluate(()=>Object.entries(window.littleWorldMetrics.inventory)
    .filter(([id])=>id.startsWith('fish:')).reduce((n,[,count])=>n+count,0));
  await waitTarget('Pêcher|Lancer');
  const initial=await fishCount();
  await down();await up();
  await waitTarget('Attendre la touche');
  assert.equal(await fishCount(),initial,'Casting does not grant fish');
  await down();await up();
  await waitTarget('Pêcher|Lancer');
  assert.equal(await fishCount(),initial,'Recovering the line early does not grant fish');
  await down();await up();
  await waitTarget('Attendre la touche');
  await waitTarget('Ferrer');
  await down();
  const hud=page.locator('.fishing-minigame');
  await hud.waitFor({state:'visible'});
  let held=true,released=false;
  const stop=Date.now()+75000;
  while(Date.now()<stop){
   const value=await hud.evaluate(section=>section.hidden?null:Number(
    section.querySelector('[aria-label="Tension de la ligne"]').getAttribute('aria-valuenow')));
   if(value===null)break;
   if(held&&value>=46){
    await up();held=false;released=true;
   }else if(!held&&value<=20){
    await down();held=true;
   }
   await page.waitForTimeout(40);
  }
  if(held)await up();
  assert.ok(released,'The line was released to reduce tension');
  await page.waitForFunction(expected=>Object.entries(window.littleWorldMetrics.inventory)
    .filter(([id])=>id.startsWith('fish:')).reduce((n,[,count])=>n+count,0)===expected,initial+1,{timeout:12000});
  await hud.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
  console.log((touch?'Tactile':'Clavier')+' : lancer, ferrer, mouliner, relâcher et créditer une capture.');
  await page.close();
 }
}finally{await browser.close();}
