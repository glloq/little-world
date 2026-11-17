/** Studio's opt-in hamster motion lab: 3D preview and disposal smoke test.
 * Runs against the compiled preview, not the Studio development server. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;console.log('OK: '+message);};
try{
  const page=await browser.newPage({viewport:{width:1280,height:820}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'studio/',{waitUntil:'domcontentloaded'});
  await page.getByText('Des idées aux petits mondes').waitFor({timeout:20000});
  await page.getByLabel('Nom du projet').fill('Hamster Motion Studio');
  await page.getByRole('button',{name:'Créer le projet'}).click();
  await page.locator('.viewport canvas').waitFor({timeout:25000});
  await page.getByRole('button',{name:'Animations du hamster'}).click();
  const canvas=page.locator('.hamster-motion-stage canvas');
  await canvas.waitFor({timeout:20000});
  await page.getByText(/État : WALK/).waitFor({timeout:25000});
  check((await canvas.evaluate(el=>el.width))>=280,'Preview allocates a bounded Three.js canvas');
  check(await page.getByLabel('Séquence').inputValue()==='walk','Walking preset is the default');
  await page.getByLabel('Cadence de rendu').selectOption('20');
  await page.waitForFunction(()=>document.querySelector('.hamster-motion-stage')?.dataset.renderHz==='20');
  const cost=await page.locator('.hamster-motion-stage').evaluate(el=>({sim:Number(el.dataset.simHz),hz:Number(el.dataset.renderHz),calls:Number(el.dataset.drawCalls),tris:Number(el.dataset.triangles),cpu:Number(el.dataset.cpuRenderMs)}));
  check(cost.sim===30&&cost.hz===20,'Fixed 30Hz animation with a selectable 20Hz GPU budget');
  check(cost.calls>0&&cost.calls<=8,'Preview keeps draw calls low ('+cost.calls+')');
  check(cost.tris>0&&cost.tris<100000,'Low-poly renderer stays within generous triangle ceiling ('+cost.tris+')');
  check(Number.isFinite(cost.cpu)&&cost.cpu>=0,'CPU render time is instrumented (GPU time excluded)');
  await page.getByLabel('Séquence').selectOption('roll-jump');
  const scrub=async(value)=>page.getByLabel('Temps dans la séquence (secondes)').evaluate((el,v)=>{
    el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
  await scrub(.9);
  await page.getByText(/État : ROLL_AIR/).waitFor({timeout:15000});
  check(true,'Timeline positions exactly inside the airborne rolling phase');
  await scrub(1.83);
  await page.getByText(/État : ROLL_LAND/).waitFor({timeout:15000});
  check(true,'Timeline can inspect the short rolling-landing transition');
  const t0=Number(await page.getByLabel('Temps dans la séquence (secondes)').inputValue());
  await page.getByRole('button',{name:'Avancer de 1/30 s'}).click();
  const t1=Number(await page.getByLabel('Temps dans la séquence (secondes)').inputValue());
  check(t1>t0&&t1-t0<.04,'Single-frame stepping advances one simulation tick');
  await page.getByRole('button',{name:'Reprendre'}).click();
  await page.getByLabel('Séquence').selectOption('roll');
  await page.getByText(/État : ROLL_/).waitFor({timeout:15000});
  check(true,'Rolling uses the real animator state machine');
  await page.getByLabel('Séquence').selectOption('glide');
  await page.getByText(/État : GLIDE_/).waitFor({timeout:15000});
  check(true,'Gliding opens the real membranes state');
  await page.getByLabel('Séquence').selectOption('step');
  await page.getByText(/État : WALK/).waitFor({timeout:15000});
  await page.getByLabel('Pente (°)').fill('20');
  await page.getByLabel('Dérapage (-1…1)').fill('0.5');
  check(await page.getByLabel('Dérapage (-1…1)').inputValue()==='0.5','Calibration inputs remain editable');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  check(await page.getByRole('button',{name:'Reprendre'}).count()===1,'Preview can be paused');
  await page.getByRole('button',{name:'Reprendre'}).click();
  await page.getByLabel('Cadence de rendu').selectOption('30');
  await page.waitForFunction(()=>document.querySelector('.hamster-motion-stage')?.dataset.renderHz==='30');
  check(true,'30Hz display mode can be restored without reloading the scene');
  await mkdir('/tmp/little-world-browser',{recursive:true});
  await page.screenshot({path:'/tmp/little-world-browser/hamster-motion-lab.png'});
  await page.getByRole('button',{name:'Sélection',exact:true}).click();
  check(await page.locator('.hamster-motion-stage canvas').count()===0,'Leaving the module removes its WebGL preview');
  await page.locator('.viewport canvas').waitFor({timeout:15000});
  check((await page.locator('#breadcrumbs').textContent())==='Hamster Motion Studio / scene','Studio returns to the same project after calibration');
  check(errors.length===0,'No browser exceptions: '+errors.join('; '));
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
