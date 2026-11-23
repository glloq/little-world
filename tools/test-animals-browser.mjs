/** Browser acceptance of the animal system on the opt-in demonstration (?animalDemo=1).
 * Runs against a preview or dev server: wild herd, resting animal, mount/dismount through
 * the real E interaction, hitch/unhitch, NPC teams on their routes, save and reload.
 */
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const out=process.env.ANIMALS_OUT??'/tmp/little-world-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errors=[];let checks=0;const check=(ok,label)=>{if(!ok)throw Error('FAILED: '+label);checks++;console.log('OK: '+label);};
const url=base+'?world=maps/island/manifest.json&metrics=1&animalDemo=1'+(process.env.ANIMALS_QUERY??'');
try{
  const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()}: ${r.url()}`);});
  const open=async()=>{await page.goto(url,{waitUntil:'networkidle'});await page.locator('#start-overlay').waitFor({state:'hidden',timeout:60000});
    await page.waitForFunction(()=>window.littleWorldDebug?.animals&&window.littleWorldMetrics?.chunks.pending===0,{},{timeout:60000});};
  await open();
  const state=()=>page.evaluate(()=>{const h=window.littleWorldDebug.animals,m=window.littleWorldMetrics;
    return {stats:h.sim.stats,view:h.view.stats,riding:h.riding,player:m.position,prompt:document.querySelector('#interaction-prompt,[data-interaction-prompt]')?.textContent??'',
      animals:Object.fromEntries([...h.sim.animals.values()].map(a=>[a.id,{x:a.body.x,y:a.body.y,z:a.body.z,heading:a.body.heading,mode:a.mode,loadout:a.loadout,vehicleId:a.vehicleId,rider:a.rider,mounted:a.riderMounted,tier:a.tier,owner:a.ownerId}])),
      vehicles:Object.fromEntries([...h.sim.vehicles.values()].map(v=>[v.id,{x:v.trailer.x,z:v.trailer.z,hitchedTo:v.hitchedTo}]))};});
  let s=await state();
  check(s.stats.animals>=10&&s.stats.vehicles===3,'Demo spawns the herd, the domestic animals and three vehicles ('+s.stats.animals+' animals)');
  await page.waitForFunction(()=>window.littleWorldDebug.animals.view.stats.shown>=6,{},{timeout:30000});
  s=await state();
  check(s.view.rigs>=1&&s.view.vehicles===3,'Nearby animals are rendered with rigs and vehicles ('+JSON.stringify(s.view)+')');
  check(Object.keys(s.animals).filter(id=>id.startsWith('animal:demo-herd#')).length>=3,'A wild herd lives near the player');
  check(s.animals['animal:demo-rest'].mode==='rest','One capybara rests');
  await page.screenshot({path:out+'/animals-demo.png'});
  // NPC teams travel their routes with their vehicle attached.
  const before=s.animals['animal:demo-cart'];
  await page.waitForTimeout(6000);s=await state();
  const cart=s.animals['animal:demo-cart'],cartVehicle=s.vehicles['animal:demo-cart:vehicle'];
  check(Math.hypot(cart.x-before.x,cart.z-before.z)>1.5,'The NPC cart moves along its route');
  check(cart.rider==='npc:animal-demo-carter'&&cartVehicle.hitchedTo==='animal:demo-cart'&&Math.hypot(cartVehicle.x-cart.x,cartVehicle.z-cart.z)<1.2,'The cart stays hitched behind its capybara, driver on board');
  // Bring the saddled mount beside the player, then use the real interaction key.
  await page.evaluate(()=>{const h=window.littleWorldDebug.animals,a=h.sim.animals.get('animal:demo-mount'),p=window.littleWorldMetrics.position;a.body.x=p[0]+1.6;a.body.z=p[2];a.body.y=h.env.ground(a.body.x,a.body.z);a.previous.x=a.body.x;a.previous.z=a.body.z;a.previous.y=a.body.y;a.travelled=1;});
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');await page.waitForTimeout(500);s=await state();
  check(s.riding&&s.animals['animal:demo-mount'].rider==='player','E mounts the capybara');
  const start=s.animals['animal:demo-mount'];
  await page.keyboard.down('KeyW');await page.waitForTimeout(3500);
  await page.screenshot({path:out+'/animals-riding.png'});
  await page.keyboard.up('KeyW');await page.waitForTimeout(1200);s=await state();
  const ridden=s.animals['animal:demo-mount'];
  check(Math.hypot(ridden.x-start.x,ridden.z-start.z)>3,'The mounted capybara carries the player ('+Math.hypot(ridden.x-start.x,ridden.z-start.z).toFixed(1)+' m)');
  check(Math.hypot(s.player[0]-ridden.x,s.player[2]-ridden.z)<1&&s.player[1]>ridden.y+.6,'The player sits on the saddle while riding');
  await page.keyboard.press('KeyE');await page.waitForTimeout(800);s=await state();
  check(!s.riding&&s.animals['animal:demo-mount'].rider===null,'E dismounts');
  check(Math.hypot(s.player[0]-ridden.x,s.player[2]-ridden.z)>.7&&Math.abs(s.player[1]-ridden.y)<1.5,'The player lands beside the animal, on the ground');
  // Unhitch and hitch the free wagon team through the simulation rules.
  const hitch=await page.evaluate(()=>{const sim=window.littleWorldDebug.animals.sim,a=sim.animals.get('animal:demo-wagon'),v=sim.vehicleOf(a);
    const off=sim.unhitch(a.id),parked={x:v.trailer.x,z:v.trailer.z,hitchedTo:v.hitchedTo,loadout:a.loadout};const again=sim.hitch(a.id,v.id);return {off,parked,again,loadout:a.loadout,vehicles:sim.vehicles.size};});
  check(hitch.off.ok&&hitch.parked.hitchedTo===null&&hitch.parked.loadout==='none','The wagon can be unhitched and stays parked');
  check(hitch.again.ok&&hitch.loadout==='wagon'&&hitch.vehicles===3,'It can be hitched again without duplicating the vehicle');
  // Save, reload: the mount is where it was left, nothing is duplicated.
  const saved=await page.evaluate(()=>{const d=window.littleWorldDebug;const save=d.animals.save();return {save,count:d.animals.sim.stats.animals};});
  check(saved.save.animals['animal:demo-mount']&&!Object.keys(saved.save.animals).some(id=>id.includes('demo-herd')),'Persistent animals are saved, wild herds are not');
  const restored=await page.evaluate(save=>{const h=window.littleWorldDebug.animals,a=h.sim.animals.get('animal:demo-mount');const at={x:a.body.x,z:a.body.z};a.body.x+=30;h.restore(JSON.parse(JSON.stringify(save)));return {dx:a.body.x-at.x,count:h.sim.stats.animals,vehicles:h.sim.stats.vehicles};},saved.save);
  check(Math.abs(restored.dx)<1e-6&&restored.count===saved.count&&restored.vehicles===3,'Restoring a save puts animals back without duplicates');
  await page.screenshot({path:out+'/animals-after.png'});
  check(errors.length===0,'No page error or failed request ('+errors.slice(0,3).join(' | ')+')');
  console.log(`Animals browser checks passed (${checks}).`);
}finally{await browser.close();}
