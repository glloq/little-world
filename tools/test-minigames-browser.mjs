/** Doc 107 browser check (real Chromium, built game, no network):
 *  1. the official island without mini-games never requests a mini-game chunk;
 *  2. `?minigames=demo` places football, bowling and mini-golf near the spawn; walking near
 *     loads only the ball family; F starts a session; a charged F launches the ball;
 *     leaving releases the instance (no view, no simulation left).
 * Usage: WORLD_URL=http://127.0.0.1:4173/little-world/ node tools/test-minigames-browser.mjs [screenshotDir] */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',shots=process.argv[2]??null;
if(shots)mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
const lazy=/\/assets\/((game-host|family|demo)-[\w-]+)\.js/;
async function open(query){
  const page=await browser.newPage({viewport:{width:1000,height:640}}),errors=[],chunks=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const m=lazy.exec(r.url());if(m)chunks.push(m[2],m[1]);});
  await page.goto(base+'?world=maps/island/manifest.json&metrics=1'+query,{waitUntil:'networkidle'});
  await page.locator('#start-overlay').waitFor({state:'hidden',timeout:60000});
  await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:90000});
  return {page,errors,chunks};
}
const metrics=page=>page.evaluate(()=>window.littleWorldMetrics);
const games=async page=>(await metrics(page)).minigames;
/** Teleport to an area-frame point of an instance, facing along the area. */
async function goTo(page,inst,lx,lz){
  const a=inst.area,s=Math.sin(a.heading),c=Math.cos(a.heading),x=a.x+lx*c+lz*s,z=a.z-lx*s+lz*c;
  await page.evaluate(([x,z,h])=>window.littleWorldDebug.teleport(x,z,h),[x,z,a.heading]);
}
const inst=async(page,id)=>(await games(page)).instances.find(i=>i.id===id);
async function waitState(page,id,state,timeout=15000){
  try{await page.waitForFunction(([id,state])=>window.littleWorldMetrics?.minigames?.instances.find(i=>i.id===id)?.state===state,[id,state],{timeout});}
  catch(e){const m=await metrics(page);console.error('waitState',id,state,JSON.stringify(m.position),JSON.stringify(m.minigames?.instances.map(i=>[i.id,i.state,i.session?.status])));throw e;}
}
async function hold(page,ms){await page.keyboard.down('KeyF');await page.waitForTimeout(ms);await page.keyboard.up('KeyF');}
try{
  {
    const {page,errors,chunks}=await open('');await page.waitForTimeout(1500);
    check((await metrics(page)).minigames===null,'island without mini-games: no host');
    check(chunks.length===0,'island without mini-games: no mini-game chunk requested ('+chunks.join(',')+')');
    check(errors.length===0,'no page error');await page.close();
  }
  const {page,errors,chunks}=await open('&minigames=demo');
  await page.waitForFunction(()=>window.littleWorldMetrics?.minigames?.instances.length>=1,{},{timeout:20000});
  let g=await games(page);
  console.log('demo instances',g.instances.map(i=>i.id+'@'+i.area.x+','+i.area.z+' '+i.state).join(' | '));
  check(g.instances.length===5,'five demo activities (ball and target families) found suitable ground near the spawn');
  // Football: start, push/kick.
  const foot=g.instances.find(i=>i.variant==='football');
  await goTo(page,foot,0,-3);await waitState(page,foot.id,'READY');
  await page.waitForFunction(()=>window.littleWorldMetrics?.minigames?.views>=1,{},{timeout:15000});
  check(chunks.includes('family'),'ball family chunk loaded on approach');
  await hold(page,120);await waitState(page,foot.id,'ACTIVE');
  check((await inst(page,foot.id)).session.status==='active','F starts a football session');
  // Live simulation state (the metrics copy is refreshed every 15 frames). A full-power kick can
  // score and reset the ball to the centre within a second on a fast runner: accept either a
  // displacement or a goal, never a fixed-time position.
  const live=id=>page.evaluate(id=>{const r=window.littleWorldDebug.minigames.manager.records.get(id);
    return {ball:r.sim.snapshot().world.state.slice(0,3),goals:Object.values(r.session?.scores??{}).reduce((a,b)=>a+b,0)};},id);
  const before=await live(foot.id);
  await goTo(page,foot,0,-1.05);await page.waitForTimeout(300);await hold(page,2000);
  const kicked=await page.waitForFunction(([id,b,g])=>{const r=window.littleWorldDebug.minigames.manager.records.get(id);
    const s=r.sim.snapshot().world.state,goals=Object.values(r.session?.scores??{}).reduce((a,c)=>a+c,0);
    const moved=Math.hypot(s[0]-b[0],s[2]-b[2]);return moved>2||goals>g?{moved,goals}:null;},[foot.id,before.ball,before.goals],{timeout:15000,polling:50})
    .then(h=>h.jsonValue()).catch(()=>null);
  check(!!kicked,'charged F kicks the ball '+JSON.stringify(kicked??await live(foot.id)));
  if(shots)await page.screenshot({path:shots+'/football.png'});
  // Bowling.
  const bowl=g.instances.find(i=>i.variant==='bowling');
  await goTo(page,bowl,0,-8.25);await waitState(page,bowl.id,'READY');
  check((await inst(page,foot.id)).state==='READY','leaving the pitch abandoned the football game');
  await page.waitForTimeout(300);await hold(page,120);await waitState(page,bowl.id,'ACTIVE');
  // Charge is counted in fixed ticks: under SwiftShader the simulation can run slower than the wall clock.
  await goTo(page,bowl,0,-8.25);await page.waitForTimeout(400);await hold(page,3000);await page.waitForTimeout(6000);
  const b=(await inst(page,bowl.id)).session;
  check((b.attempts.local??0)>=1||b.round>=1,'bowling throw counted');
  check((b.scores.local??0)>=1,'pins knocked: '+(b.scores.local??0));
  if(shots)await page.screenshot({path:shots+'/bowling.png'});
  // Mini-golf.
  const golf=g.instances.find(i=>i.variant==='minigolf');
  await goTo(page,golf,0,-8.6);await waitState(page,golf.id,'READY');await page.waitForTimeout(300);
  await hold(page,120);await waitState(page,golf.id,'ACTIVE');
  const tee=(await inst(page,golf.id)).snapshot.world.state;
  await page.evaluate(([x,z,h])=>window.littleWorldDebug.teleport(x,z,h),[tee[0]-Math.sin(golf.area.heading)*.75,tee[2]-Math.cos(golf.area.heading)*.75,golf.area.heading]);
  await page.waitForTimeout(300);await hold(page,700);await page.waitForTimeout(3000);
  const s=(await inst(page,golf.id)).session;
  check(s.attempts.local===1&&s.scores.local>=1,'mini-golf stroke counted '+JSON.stringify(s)+' '+JSON.stringify((await inst(page,golf.id)).snapshot.world.state.slice(0,9))+' tee '+JSON.stringify(tee.slice(0,9))+' at '+JSON.stringify((await metrics(page)).position)+' '+await page.locator('.minigame-hud').textContent());
  if(shots)await page.screenshot({path:shots+'/minigolf.png'});
  // Target family (chamboule-tout): its own lazily loaded module on the same engine.
  const familyChunks=()=>new Set(chunks.filter(c=>/^family-/.test(c))).size;
  const cans=g.instances.find(i=>i.variant==='cans');
  await goTo(page,cans,0,-4.6);await waitState(page,cans.id,'READY');
  // (Loading only what an island needs is covered in Node: minigames-target / minigames-core.)
  check(familyChunks()===2,'ball and target families are two separate lazily loaded modules');
  await page.waitForTimeout(300);await hold(page,120);await waitState(page,cans.id,'ACTIVE');
  await goTo(page,cans,0,-4.6);await page.waitForTimeout(300);await hold(page,900);
  await page.waitForFunction(id=>{const r=window.littleWorldDebug.minigames.manager.records.get(id);return (r.session?.attempts?.local??0)>=1;},cans.id,{timeout:15000});
  check(true,'chamboule-tout: a charged throw is counted');
  if(shots){await page.waitForTimeout(1500);await page.screenshot({path:shots+'/cans.png'});}
  // Leave: everything released.
  await page.evaluate(([x,z])=>window.littleWorldDebug.teleport(x,z,0),[golf.area.x+400,golf.area.z]);
  await page.waitForFunction(()=>window.littleWorldMetrics?.minigames?.instances.every(i=>i.state==='UNLOADED')&&window.littleWorldMetrics.minigames.views===0,{},{timeout:20000});
  g=await games(page);check(g.loaded===0&&g.active===0,'far away: all instances released, no active simulation');
  check(errors.length===0,'no page error: '+errors.join(' | '));
  console.log(`MINIGAMES BROWSER CHECK OK (${checks} checks)`);
}finally{await browser.close();}
