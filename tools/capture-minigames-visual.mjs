/** Doc 107 §évolution graphique — representative captures of the five demo mini-games with a
 * fixed camera (presentation hook, gameplay untouched): themes, day / night, quality levels,
 * idle field, game in progress (after a shot) and end of game.
 * Usage: WORLD_URL=… node tools/capture-minigames-visual.mjs <outDir> [scenario…]
 * Scenarios: auto, snow, volcano, beach, forest, marsh, mountain, village, night, low, play. */
import {chromium} from 'playwright';
import {existsSync,mkdirSync} from 'node:fs';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out=process.argv[2]??'captures',wanted=process.argv.slice(3);
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const SCENARIOS={auto:'',snow:'&minigameTheme=snow',volcano:'&minigameTheme=volcano',beach:'&minigameTheme=beach',forest:'&minigameTheme=forest',marsh:'&minigameTheme=marsh',
  mountain:'&minigameTheme=mountain',village:'&minigameTheme=village',night:'&night=1',low:'',play:''};
/** Camera behind the near end of the field, looking along it (area frame → world). */
const camera=(a,back,height,lookAhead)=>{const s=Math.sin(a.heading),c=Math.cos(a.heading);
  return {px:a.x-s*(a.halfLength+back),py:height,pz:a.z-c*(a.halfLength+back),tx:a.x+s*lookAhead,ty:0,tz:a.z+c*lookAhead};};
const FRAMING={football:[6,9,0],bowling:[4,4,2],minigolf:[5,8,0],cans:[3,3.2,2],bullseye:[3,3.2,2]};
try{
  for(const name of wanted.length?wanted:['auto','snow','volcano','beach','night','low','play']){
    const page=await browser.newPage({viewport:{width:1000,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'?world=maps/island/manifest.json&metrics=1&minigames=demo'+SCENARIOS[name],{waitUntil:'networkidle'});
    await page.locator('#start-overlay').waitFor({state:'hidden',timeout:90000});
    if(name==='low')await page.evaluate(()=>{const q=document.querySelector('#quality');q.value='low';q.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>window.littleWorldMetrics?.minigames?.instances.length>=5,{},{timeout:60000});
    const instances=await page.evaluate(()=>window.littleWorldMetrics.minigames.instances);
    for(const inst of instances){
      const a=inst.area,[back,height,ahead]=FRAMING[inst.variant];
      // Stand at the near end (loads the field and its view), then frame it.
      await page.evaluate(([x,z,h])=>window.littleWorldDebug.teleport(x,z,h),[a.x-Math.sin(a.heading)*(a.halfLength-1),a.z-Math.cos(a.heading)*(a.halfLength-1),a.heading]);
      await page.waitForFunction(id=>window.littleWorldDebug.minigames.manager.records.get(id)?.state==='READY'&&window.littleWorldMetrics?.chunks.pending===0,inst.id,{timeout:30000});
      const groundY=await page.evaluate(([x,z])=>window.littleWorldDebug.minigames.env.height(x,z),[a.x,a.z]);
      const cam=camera(a,back,groundY+height,ahead);cam.ty=groundY;
      await page.evaluate(c=>window.littleWorldDebug.surfCamera(c),cam);await page.waitForTimeout(1200);
      if(name==='play'){
        // Start, take one shot from the aim anchor, capture during the flight / roll.
        await page.keyboard.press('KeyF');await page.waitForFunction(id=>window.littleWorldDebug.minigames.manager.records.get(id)?.state==='ACTIVE',inst.id,{timeout:15000});
        const anchor=await page.evaluate(id=>{const r=window.littleWorldDebug.minigames.manager.records.get(id),w=r.sim.world;return {x:w.px[0],z:w.pz[0],h:r.def.area.heading};},inst.id);
        await page.evaluate(([x,z,h])=>window.littleWorldDebug.teleport(x-Math.sin(h)*.8,z-Math.cos(h)*.8,h),[anchor.x,anchor.z,anchor.h]);
        await page.waitForTimeout(300);await page.keyboard.down('KeyF');await page.waitForTimeout(700);await page.keyboard.up('KeyF');await page.waitForTimeout(450);
      }
      await page.screenshot({path:`${out}/${name}-${inst.variant}.png`});
    }
    await page.evaluate(()=>window.littleWorldDebug.surfCamera(null));
    console.log(name,'captured',errors.length?'ERRORS '+errors.join(' | '):'');await page.close();
  }
}finally{await browser.close();}
